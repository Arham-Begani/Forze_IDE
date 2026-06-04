import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Message } from '@forze/agents';
import { debouncedJSONStorage } from './debouncedStorage';

export interface AgentThread {
  id: string;
  title: string;
  providerId: string;
  model: string;
  presetId: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

interface AgentState {
  threads: AgentThread[];
  activeThreadId: string | null;

  /** Per-provider API key. Phase 5 polish moves these into the OS keyring. */
  apiKeys: Record<string, string>;

  createThread: (init: Pick<AgentThread, 'providerId' | 'model' | 'presetId'>) => string;
  setActiveThread: (id: string) => void;
  appendMessage: (threadId: string, message: Message) => void;
  appendToAssistant: (threadId: string, delta: string) => void;
  finaliseAssistant: (threadId: string) => void;
  renameThread: (threadId: string, title: string) => void;
  deleteThread: (threadId: string) => void;

  setApiKey: (providerId: string, key: string) => void;
  getApiKey: (providerId: string) => string;
}

export const useAgents = create<AgentState>()(
  persist(
    (set, get) => ({
      threads: [],
      activeThreadId: null,
      apiKeys: {},

      createThread: (init) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        const thread: AgentThread = {
          id,
          title: 'New chat',
          providerId: init.providerId,
          model: init.model,
          presetId: init.presetId,
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          threads: [thread, ...state.threads],
          activeThreadId: id,
        }));
        return id;
      },

      setActiveThread: (id) => set({ activeThreadId: id }),

      appendMessage: (threadId, message) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: [...t.messages, message],
                  title:
                    t.title === 'New chat' && message.role === 'user'
                      ? message.content.slice(0, 40)
                      : t.title,
                  updatedAt: Date.now(),
                }
              : t,
          ),
        })),

      appendToAssistant: (threadId, delta) =>
        set((state) => ({
          threads: state.threads.map((t) => {
            if (t.id !== threadId) return t;
            const last = t.messages[t.messages.length - 1];
            if (last && last.role === 'assistant') {
              const updated = { ...last, content: last.content + delta };
              return {
                ...t,
                messages: [...t.messages.slice(0, -1), updated],
                updatedAt: Date.now(),
              };
            }
            return {
              ...t,
              messages: [
                ...t.messages,
                {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: delta,
                  createdAt: Date.now(),
                },
              ],
              updatedAt: Date.now(),
            };
          }),
        })),

      finaliseAssistant: (threadId) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId ? { ...t, updatedAt: Date.now() } : t,
          ),
        })),

      renameThread: (threadId, title) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId ? { ...t, title } : t,
          ),
        })),

      deleteThread: (threadId) =>
        set((state) => {
          const next = state.threads.filter((t) => t.id !== threadId);
          const wasActive = state.activeThreadId === threadId;
          return {
            threads: next,
            activeThreadId: wasActive ? (next[0]?.id ?? null) : state.activeThreadId,
          };
        }),

      setApiKey: (providerId, key) =>
        set((state) => ({ apiKeys: { ...state.apiKeys, [providerId]: key } })),
      getApiKey: (providerId) => get().apiKeys[providerId] ?? '',
    }),
    {
      name: 'forze.agents.v1',
      storage: debouncedJSONStorage(),
      partialize: (state) => ({
        threads: state.threads,
        activeThreadId: state.activeThreadId,
        apiKeys: state.apiKeys,
      }),
    },
  ),
);
