import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgentRoleId } from '../lib/orchestrator';
import { debouncedJSONStorage } from './debouncedStorage';

/** Keep persisted output bounded so a long stream can't exhaust the quota. */
const MAX_PERSISTED_OUTPUT = 16_000;

/**
 * State for the Agent Manager (Mission Control): the orchestrated team of
 * worker agents and the missions that spawned them. Runtime-only fields
 * (live streaming status) are persisted too so a reload shows the last roster;
 * any agent left mid-flight is reconciled to `stopped` on boot.
 */

export type AgentStatus =
  | 'idle' // spawned, not started
  | 'queued' // waiting for a concurrency slot
  | 'thinking' // streaming
  | 'done'
  | 'error'
  | 'stopped';

export interface ManagedAgent {
  id: string;
  missionId: string | null;
  roleId: AgentRoleId;
  name: string;
  title: string;
  task: string;
  status: AgentStatus;
  output: string;
  tokens: number;
  model?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Mission {
  id: string;
  goal: string;
  /** The Architect's up-front plan summary. */
  summary: string;
  /** The Architect's consolidated report, produced after the workers finish. */
  report?: string;
  status: 'planning' | 'running' | 'done' | 'error';
  createdAt: number;
}

interface AgentManagerState {
  agents: ManagedAgent[];
  missions: Mission[];
  activeAgentId: string | null;

  createMission: (goal: string) => string;
  updateMission: (id: string, patch: Partial<Omit<Mission, 'id'>>) => void;

  spawnAgent: (
    init: Pick<ManagedAgent, 'roleId' | 'title' | 'task'> &
      Partial<Pick<ManagedAgent, 'missionId' | 'model' | 'status'>>,
  ) => string;
  setAgentStatus: (id: string, status: AgentStatus, error?: string) => void;
  appendAgentOutput: (id: string, delta: string) => void;
  resetAgentOutput: (id: string) => void;
  setActiveAgent: (id: string | null) => void;
  removeAgent: (id: string) => void;
  clearMission: (missionId: string) => void;
  clearAll: () => void;
}

const ACTIVE: AgentStatus[] = ['queued', 'thinking'];

export const useAgentManager = create<AgentManagerState>()(
  persist(
    (set) => ({
      agents: [],
      missions: [],
      activeAgentId: null,

      createMission: (goal) => {
        const id = crypto.randomUUID();
        const mission: Mission = {
          id,
          goal: goal.trim(),
          summary: '',
          status: 'planning',
          createdAt: Date.now(),
        };
        set((state) => ({ missions: [mission, ...state.missions] }));
        return id;
      },

      updateMission: (id, patch) =>
        set((state) => ({
          missions: state.missions.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),

      spawnAgent: (init) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        const agent: ManagedAgent = {
          id,
          missionId: init.missionId ?? null,
          roleId: init.roleId,
          name: init.title,
          title: init.title,
          task: init.task,
          status: init.status ?? 'idle',
          output: '',
          tokens: 0,
          model: init.model,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          agents: [...state.agents, agent],
          activeAgentId: state.activeAgentId ?? id,
        }));
        return id;
      },

      setAgentStatus: (id, status, error) =>
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === id
              ? { ...a, status, error: status === 'error' ? error : undefined, updatedAt: Date.now() }
              : a,
          ),
        })),

      appendAgentOutput: (id, delta) =>
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === id
              ? {
                  ...a,
                  output: a.output + delta,
                  tokens: Math.ceil((a.output.length + delta.length) / 4),
                  updatedAt: Date.now(),
                }
              : a,
          ),
        })),

      resetAgentOutput: (id) =>
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === id ? { ...a, output: '', tokens: 0, error: undefined } : a,
          ),
        })),

      setActiveAgent: (activeAgentId) => set({ activeAgentId }),

      removeAgent: (id) =>
        set((state) => {
          const agents = state.agents.filter((a) => a.id !== id);
          return {
            agents,
            activeAgentId:
              state.activeAgentId === id ? (agents[agents.length - 1]?.id ?? null) : state.activeAgentId,
          };
        }),

      clearMission: (missionId) =>
        set((state) => ({
          agents: state.agents.filter((a) => a.missionId !== missionId),
          missions: state.missions.filter((m) => m.id !== missionId),
        })),

      clearAll: () => set({ agents: [], missions: [], activeAgentId: null }),
    }),
    {
      name: 'forze.agentManager.v1',
      storage: debouncedJSONStorage(),
      partialize: (state) => ({
        // Cap each agent's output so a long stream can't exhaust the quota; the
        // live, full output stays in memory — only the persisted copy is trimmed.
        agents: state.agents.map((a) =>
          a.output.length > MAX_PERSISTED_OUTPUT
            ? { ...a, output: a.output.slice(-MAX_PERSISTED_OUTPUT) }
            : a,
        ),
        missions: state.missions,
        activeAgentId: state.activeAgentId,
      }),
      // Reconcile any agent persisted mid-stream back to a terminal state.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.agents = state.agents.map((a) =>
          ACTIVE.includes(a.status) ? { ...a, status: 'stopped' } : a,
        );
        state.missions = state.missions.map((m) =>
          m.status === 'running' || m.status === 'planning' ? { ...m, status: 'done' } : m,
        );
      },
    },
  ),
);
