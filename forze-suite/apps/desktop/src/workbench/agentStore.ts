import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Message } from '@forze/agents';
import { debouncedJSONStorage } from './debouncedStorage';
import { secureGetJSON, secureSetJSON } from '../lib/secureSecrets';

/** Keychain entry holding the per-provider BYOK keys as one JSON record. */
const API_KEYS_SECRET = 'forze.secrets.apiKeys';

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

  /**
   * Per-provider API key. Held in memory here; persisted ONLY to the OS
   * keychain (never localStorage — see hydrateApiKeys below).
   */
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

      setApiKey: (providerId, key) => {
        const apiKeys = { ...get().apiKeys, [providerId]: key };
        set({ apiKeys });
        secureSetJSON(API_KEYS_SECRET, apiKeys);
      },
      getApiKey: (providerId) => get().apiKeys[providerId] ?? '',
    }),
    {
      name: 'forze.agents.v1',
      storage: debouncedJSONStorage(),
      // apiKeys deliberately excluded — secrets live in the OS keychain only.
      partialize: (state) => ({
        threads: state.threads,
        activeThreadId: state.activeThreadId,
      }),
    },
  ),
);

/**
 * Load the BYOK keys from the OS keychain into the store, migrating any keys
 * a previous build persisted in plain localStorage: lift them into the
 * keychain, then scrub them from the localStorage blob so no plaintext copy
 * remains on disk.
 */
async function hydrateApiKeys(): Promise<void> {
  let migrated: Record<string, string> = {};
  try {
    const raw = localStorage.getItem('forze.agents.v1');
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { apiKeys?: Record<string, string> } };
      const old = parsed.state?.apiKeys;
      if (old && Object.values(old).some((v) => v?.trim())) {
        migrated = old;
        delete parsed.state!.apiKeys;
        localStorage.setItem('forze.agents.v1', JSON.stringify(parsed));
      }
    }
  } catch {
    /* no localStorage (tests) or corrupt blob — nothing to migrate */
  }

  const stored = await secureGetJSON<Record<string, string>>(API_KEYS_SECRET);
  // Keychain wins over the migrated plaintext; anything typed since boot wins
  // over both.
  const merged: Record<string, string> = { ...migrated };
  for (const [provider, key] of Object.entries(stored)) {
    if (typeof key === 'string') merged[provider] = key;
  }
  if (Object.keys(migrated).length > 0) {
    secureSetJSON(API_KEYS_SECRET, merged);
  }
  if (Object.keys(merged).length > 0) {
    useAgents.setState((s) => ({ apiKeys: { ...merged, ...s.apiKeys } }));
  }
}

void hydrateApiKeys();
