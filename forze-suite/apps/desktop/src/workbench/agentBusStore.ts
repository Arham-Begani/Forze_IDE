import { create } from 'zustand';
import {
  addTaskFromIde,
  deleteNote,
  deleteTask,
  emptyBus,
  enableBusForWorkspace,
  isBusEnabled,
  postFromIde,
  readBus,
  setNoteFromIde,
  setTaskStatus,
  type BusState,
  type BusTaskStatus,
  type EnableResult,
} from '../lib/agentBus';

/**
 * Store backing the Vibe Stations "Context Bus" panel. It mirrors the workspace
 * `.forze/bus.json` (written by the per-station MCP servers) into React state by
 * polling, exposes the human-side actions (broadcast a message, pin a board
 * note), and drives the one-time "enable" that wires each CLI to the bus.
 *
 * Runtime-only — nothing here is persisted; the bus file on disk is the source
 * of truth and survives reloads on its own.
 */

const POLL_MS = 1500;

interface AgentBusState {
  /** The mirrored bus contents (roster, messages, board). */
  bus: BusState;
  /** Whether `.forze/bus-server.mjs` exists for the active workspace. */
  enabled: boolean;
  /** When on, newly-ready stations are auto-briefed onto the bus (default off —
   *  the human opts in once they've confirmed it doesn't interrupt their flow). */
  autoBrief: boolean;
  /** Report from the last enable run (per-CLI wiring status). */
  wiring: EnableResult | null;
  loading: boolean;
  enabling: boolean;
  error: string | null;

  /** Re-read enabled-state + bus.json for `root`. */
  refresh: (root: string) => Promise<void>;
  /** Write the server + per-CLI configs, then refresh. */
  enable: (root: string) => Promise<void>;
  /** Broadcast/DM a message from the IDE (human) into the bus. */
  broadcast: (root: string, to: string, text: string) => Promise<void>;
  /** Pin or update a shared board note. */
  saveNote: (root: string, key: string, value: string) => Promise<void>;
  removeNote: (root: string, key: string) => Promise<void>;
  /** Shared task queue actions. */
  addTask: (root: string, title: string, detail?: string) => Promise<void>;
  setTask: (root: string, id: string, status: BusTaskStatus) => Promise<void>;
  removeTask: (root: string, id: string) => Promise<void>;
  /** Toggle auto-briefing of newly-ready stations. */
  setAutoBrief: (on: boolean) => void;
  /** Start polling bus.json for `root`; returns a stop fn. */
  startPolling: (root: string) => () => void;
}

// Module-level poll handle so only one timer runs regardless of remounts.
let pollTimer: number | null = null;
let pollRoot: string | null = null;
let lastSerialised: string | null = null;

export const useAgentBus = create<AgentBusState>()((set, get) => ({
  bus: emptyBus(),
  enabled: false,
  autoBrief: false,
  wiring: null,
  loading: false,
  enabling: false,
  error: null,

  setAutoBrief: (on) => set({ autoBrief: on }),

  refresh: async (root) => {
    if (!root) return;
    set({ loading: true });
    try {
      const enabled = await isBusEnabled(root);
      const bus = await readBus(root);
      const serialised = JSON.stringify(bus);
      // Only push a new object when the contents actually changed, so the panel
      // doesn't re-render every poll tick.
      if (serialised !== lastSerialised) {
        lastSerialised = serialised;
        set({ bus, enabled, loading: false, error: null });
      } else {
        set({ enabled, loading: false, error: null });
      }
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  enable: async (root) => {
    if (!root) {
      set({ error: 'Open a workspace folder first.' });
      return;
    }
    set({ enabling: true, error: null });
    try {
      const wiring = await enableBusForWorkspace(root);
      set({ wiring, enabling: false });
      await get().refresh(root);
    } catch (err) {
      set({ enabling: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  broadcast: async (root, to, text) => {
    await postFromIde(root, to, text);
    await get().refresh(root);
  },

  saveNote: async (root, key, value) => {
    await setNoteFromIde(root, key, value);
    await get().refresh(root);
  },

  removeNote: async (root, key) => {
    await deleteNote(root, key);
    await get().refresh(root);
  },

  addTask: async (root, title, detail) => {
    await addTaskFromIde(root, title, detail);
    await get().refresh(root);
  },

  setTask: async (root, id, status) => {
    await setTaskStatus(root, id, status);
    await get().refresh(root);
  },

  removeTask: async (root, id) => {
    await deleteTask(root, id);
    await get().refresh(root);
  },

  startPolling: (root) => {
    // Reset the change-detector when the watched root changes so the first read
    // of a new workspace always lands.
    if (pollRoot !== root) {
      lastSerialised = null;
      pollRoot = root;
    }
    if (pollTimer !== null) window.clearInterval(pollTimer);
    void get().refresh(root);
    // Skip polls while the window is hidden — each one is a bus.json read; the
    // file is the source of truth, so we just catch up on the next visible tick.
    pollTimer = window.setInterval(() => {
      if (!document.hidden) void get().refresh(root);
    }, POLL_MS);
    return () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
      pollRoot = null;
    };
  },
}));
