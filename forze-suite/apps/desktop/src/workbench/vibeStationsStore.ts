import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * State for "Vibe Stations" — a grid of AI coding-agent terminals. Each station
 * is a PTY that boots the user's shell and then launches a CLI coding agent
 * (Claude Code, Codex, Antigravity, OpenCode). Station *definitions* are
 * persisted so the grid layout survives a reload; the PTY sessions themselves
 * are runtime-only and re-spawn fresh on boot (a bumped `runKey` also forces a
 * clean restart of a single station).
 */

export type AgentId = 'claude' | 'codex' | 'antigravity' | 'opencode';

export interface AgentDef {
  id: AgentId;
  label: string;
  /** Command typed into the freshly-spawned shell to launch the CLI. */
  command: string;
  /** Accent colour for the station chrome. */
  color: string;
  /** One-liner shown in the launcher menu / empty state. */
  blurb: string;
}

/** The four agents a user can spin up. Each `command` is launched as the
 *  spawned shell's startup command (see `pty_spawn` + `VibeTerminal`), so the
 *  CLI boots deterministically. If a CLI isn't installed the shell just prints
 *  its "not found" error and (thanks to -NoExit) leaves a working prompt — no
 *  special-casing required. */
export const AGENTS: AgentDef[] = [
  { id: 'claude', label: 'Claude Code', command: 'claude', color: '#e5e5e5', blurb: "Anthropic's agentic coding CLI" },
  { id: 'codex', label: 'Codex', command: 'codex', color: '#00d4ff', blurb: "OpenAI's Codex CLI" },
  { id: 'antigravity', label: 'Antigravity CLI', command: 'agy', color: '#74ecff', blurb: "Google's Antigravity agent CLI" },
  { id: 'opencode', label: 'OpenCode', command: 'opencode', color: '#a3a3a3', blurb: 'Open-source terminal coding agent' },
];

export function agentDef(id: AgentId): AgentDef {
  return AGENTS.find((a) => a.id === id) ?? AGENTS[0]!;
}

/** Hard cap on how many agent terminals can run at once (combined). */
export const MAX_STATIONS = 8;

export interface Station {
  id: string;
  agentId: AgentId;
  /** Working directory the agent launches in (usually the workspace root). */
  cwd: string | null;
  /** Bumped to force a remount (i.e. clean restart) of the station terminal. */
  runKey: number;
}

interface VibeStationsState {
  stations: Station[];
  /** Number of columns in the grid (1–4). */
  columns: number;

  addStation: (agentId: AgentId, cwd: string | null) => string;
  /** Replace the grid with a fresh session built from per-agent counts. */
  launchSession: (counts: Partial<Record<AgentId, number>>, cwd: string | null) => void;
  removeStation: (id: string) => void;
  restartStation: (id: string) => void;
  clearAll: () => void;
  setColumns: (columns: number) => void;
}

export const useVibeStations = create<VibeStationsState>()(
  persist(
    (set) => ({
      stations: [],
      columns: 3,

      addStation: (agentId, cwd) => {
        const id = crypto.randomUUID();
        set((state) => ({
          stations: [...state.stations, { id, agentId, cwd, runKey: 0 }],
        }));
        return id;
      },

      launchSession: (counts, cwd) =>
        set(() => {
          const stations: Station[] = [];
          for (const agent of AGENTS) {
            const n = counts[agent.id] ?? 0;
            for (let i = 0; i < n && stations.length < MAX_STATIONS; i++) {
              stations.push({ id: crypto.randomUUID(), agentId: agent.id, cwd, runKey: 0 });
            }
          }
          return { stations };
        }),

      removeStation: (id) =>
        set((state) => ({ stations: state.stations.filter((s) => s.id !== id) })),

      restartStation: (id) =>
        set((state) => ({
          stations: state.stations.map((s) =>
            s.id === id ? { ...s, runKey: s.runKey + 1 } : s,
          ),
        })),

      clearAll: () => set({ stations: [] }),

      setColumns: (columns) => set({ columns: Math.min(4, Math.max(1, columns)) }),
    }),
    {
      name: 'forze.vibeStations.v1',
      partialize: (state) => ({ stations: state.stations, columns: state.columns }),
    },
  ),
);
