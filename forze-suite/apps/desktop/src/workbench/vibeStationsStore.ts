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
  { id: 'claude', label: 'Claude Code', command: 'claude --dangerously-skip-permissions', color: '#e5e5e5', blurb: "Anthropic's agentic coding CLI" },
  { id: 'codex', label: 'Codex', command: 'codex', color: '#00d4ff', blurb: "OpenAI's Codex CLI" },
  { id: 'antigravity', label: 'Antigravity CLI', command: 'agy --dangerously-skip-permissions', color: '#74ecff', blurb: "Google's Antigravity agent CLI" },
  { id: 'opencode', label: 'OpenCode', command: 'opencode', color: '#a3a3a3', blurb: 'Open-source terminal coding agent' },
];

export function agentDef(id: AgentId): AgentDef {
  return AGENTS.find((a) => a.id === id) ?? AGENTS[0]!;
}

/** Hard cap on how many agent terminals can run at once (combined). */
export const MAX_STATIONS = 8;

/** Per-station box sizing bounds. Width is measured in grid columns (1..4),
 *  height in pixels (each box owns its own height so the grid no longer stretches
 *  rows to a uniform track). */
export const DEFAULT_STATION_HEIGHT = 340;
export const MIN_STATION_HEIGHT = 180;
export const MAX_STATION_HEIGHT = 1000;
export const MAX_COL_SPAN = 4;

export interface Station {
  id: string;
  agentId: AgentId;
  /** Working directory the agent launches in (usually the workspace root). */
  cwd: string | null;
  /** Bumped to force a remount (i.e. clean restart) of the station terminal. */
  runKey: number;
  /** How many grid columns this box spans (1..4). User-resizable. */
  colSpan: number;
  /** Box height in pixels. User-resizable. */
  height: number;
  /** When true the station's title bar is removed (terminal goes full-bleed). */
  barHidden: boolean;
}

const clampSpan = (n: number): number =>
  Math.min(MAX_COL_SPAN, Math.max(1, Math.round(n) || 1));
const clampHeight = (n: number): number =>
  Math.min(MAX_STATION_HEIGHT, Math.max(MIN_STATION_HEIGHT, Math.round(n) || DEFAULT_STATION_HEIGHT));

/** New stations start one column wide at the default height with a visible bar. */
function newStation(agentId: AgentId, cwd: string | null): Station {
  return {
    id: crypto.randomUUID(),
    agentId,
    cwd,
    runKey: 0,
    colSpan: 1,
    height: DEFAULT_STATION_HEIGHT,
    barHidden: false,
  };
}

/** Backfill sizing fields onto a station loaded from an older persisted payload. */
function normalizeStation(s: Partial<Station> & { id: string; agentId: AgentId }): Station {
  return {
    id: s.id,
    agentId: s.agentId,
    cwd: s.cwd ?? null,
    runKey: s.runKey ?? 0,
    colSpan: clampSpan(s.colSpan ?? 1),
    height: clampHeight(s.height ?? DEFAULT_STATION_HEIGHT),
    barHidden: s.barHidden ?? false,
  };
}

/** A *logical* station address ("Claude Code #1") — an agent + a 1-based ordinal
 *  among that agent's stations. Resolved to a live {@link Station} at delivery
 *  time, so it survives reloads and can name a station that doesn't exist yet. */
export interface StationTarget {
  agentId: AgentId;
  ordinal: number;
}

/** Runtime PTY binding for a station, mirrored out of `VibeTerminal` so the
 *  prompt scheduler can write to a station's terminal from outside the component.
 *  `launchedAt` is when the agent-CLI launch keystroke was sent — we treat the
 *  station as ready to accept a prompt a short grace period after that. */
export interface StationSession {
  sessionId: string;
  launchedAt: number | null;
}

/** Grace period after the CLI launch keystroke before we consider a station
 *  ready to receive a typed prompt (the agent REPL needs a moment to boot). */
export const READY_GRACE_MS = 3500;

interface VibeStationsState {
  stations: Station[];
  /** Number of columns in the grid (1–4). */
  columns: number;
  /** Runtime-only: stationId → live PTY session. Excluded from persistence. */
  sessions: Record<string, StationSession>;

  addStation: (agentId: AgentId, cwd: string | null) => string;
  /** Replace the grid with a fresh session built from per-agent counts. */
  launchSession: (counts: Partial<Record<AgentId, number>>, cwd: string | null) => void;
  /**
   * Re-point every open station at a new working directory and restart it
   * (runKey bump → terminal remounts → old PTY is killed, a fresh shell spawns
   * in `cwd`). Called when the user switches the workspace folder so stations
   * follow the new project instead of staying in the old one.
   */
  rescope: (cwd: string | null) => void;
  removeStation: (id: string) => void;
  restartStation: (id: string) => void;
  clearAll: () => void;
  setColumns: (columns: number) => void;
  /** Resize a station — width (grid columns) and/or height (px). */
  setStationSize: (id: string, size: { colSpan?: number; height?: number }) => void;
  /** Show/hide a single station's title bar. */
  toggleStationBar: (id: string) => void;

  /** Record (or clear) the live PTY session id for a station. */
  setStationSession: (stationId: string, sessionId: string | null) => void;
  /** Mark that the agent-CLI launch keystroke was just sent for a station. */
  markStationLaunched: (stationId: string) => void;
}

export const useVibeStations = create<VibeStationsState>()(
  persist(
    (set) => ({
      stations: [],
      columns: 3,
      sessions: {},

      addStation: (agentId, cwd) => {
        const station = newStation(agentId, cwd);
        set((state) => ({ stations: [...state.stations, station] }));
        return station.id;
      },

      launchSession: (counts, cwd) =>
        set(() => {
          const stations: Station[] = [];
          for (const agent of AGENTS) {
            const n = counts[agent.id] ?? 0;
            for (let i = 0; i < n && stations.length < MAX_STATIONS; i++) {
              stations.push(newStation(agent.id, cwd));
            }
          }
          return { stations };
        }),

      rescope: (cwd) =>
        set((state) => {
          if (state.stations.length === 0) return state;
          return {
            // Re-point + remount every station; drop all live pty bindings so
            // nothing writes to the dying shells while they restart.
            stations: state.stations.map((s) => ({ ...s, cwd, runKey: s.runKey + 1 })),
            sessions: {},
          };
        }),

      removeStation: (id) =>
        set((state) => {
          const sessions = { ...state.sessions };
          delete sessions[id];
          return { stations: state.stations.filter((s) => s.id !== id), sessions };
        }),

      restartStation: (id) =>
        set((state) => {
          // The terminal remounts (runKey bump) and re-registers its session;
          // drop the stale binding so nothing writes to the dying pty meanwhile.
          const sessions = { ...state.sessions };
          delete sessions[id];
          return {
            stations: state.stations.map((s) =>
              s.id === id ? { ...s, runKey: s.runKey + 1 } : s,
            ),
            sessions,
          };
        }),

      clearAll: () => set({ stations: [], sessions: {} }),

      setColumns: (columns) => set({ columns: Math.min(4, Math.max(1, columns)) }),

      setStationSize: (id, size) =>
        set((state) => ({
          stations: state.stations.map((s) =>
            s.id === id
              ? {
                  ...s,
                  colSpan: size.colSpan !== undefined ? clampSpan(size.colSpan) : s.colSpan,
                  height: size.height !== undefined ? clampHeight(size.height) : s.height,
                }
              : s,
          ),
        })),

      toggleStationBar: (id) =>
        set((state) => ({
          stations: state.stations.map((s) =>
            s.id === id ? { ...s, barHidden: !s.barHidden } : s,
          ),
        })),

      setStationSession: (stationId, sessionId) =>
        set((state) => {
          const sessions = { ...state.sessions };
          if (sessionId === null) delete sessions[stationId];
          else sessions[stationId] = { sessionId, launchedAt: null };
          return { sessions };
        }),

      markStationLaunched: (stationId) =>
        set((state) => {
          const current = state.sessions[stationId];
          if (!current) return state;
          return {
            sessions: { ...state.sessions, [stationId]: { ...current, launchedAt: Date.now() } },
          };
        }),
    }),
    {
      name: 'forze.vibeStations.v1',
      // `sessions` is runtime-only (live pty bindings) — never persist it.
      partialize: (state) => ({ stations: state.stations, columns: state.columns }),
      // Self-heal: older payloads predate the per-station sizing fields, so
      // normalize every persisted station back into the current shape on load.
      merge: (persisted, current) => {
        const p = persisted as Partial<VibeStationsState> | undefined;
        if (!p) return current;
        return {
          ...current,
          columns:
            typeof p.columns === 'number'
              ? Math.min(4, Math.max(1, p.columns))
              : current.columns,
          stations: Array.isArray(p.stations)
            ? p.stations
                .filter((s): s is Station => !!s && typeof s.id === 'string')
                .map(normalizeStation)
            : current.stations,
        };
      },
    },
  ),
);

// ---- station addressing helpers ("Claude Code #1") ----

/** 1-based position of `station` among stations sharing its agent, in grid order. */
export function stationOrdinal(stations: Station[], station: Station): number {
  let n = 0;
  for (const s of stations) {
    if (s.agentId === station.agentId) {
      n++;
      if (s.id === station.id) return n;
    }
  }
  return n;
}

/** Human label for a logical target, e.g. `"Claude Code #1"`. */
export function targetLabel(target: StationTarget): string {
  return `${agentDef(target.agentId).label} #${target.ordinal}`;
}

/** Resolve a logical target to the live station now occupying that slot. */
export function resolveTarget(stations: Station[], target: StationTarget): Station | null {
  const ofAgent = stations.filter((s) => s.agentId === target.agentId);
  return ofAgent[target.ordinal - 1] ?? null;
}

/** Is the station's terminal up and likely ready to accept a typed prompt? */
export function stationReady(
  sessions: Record<string, StationSession>,
  stationId: string,
): boolean {
  const sess = sessions[stationId];
  return (
    !!sess && sess.launchedAt !== null && Date.now() - sess.launchedAt > READY_GRACE_MS
  );
}

/** Tolerant agent matcher: maps free text ("claude code", "cc", "agy") to an AgentId. */
function matchAgentId(text: string): AgentId | null {
  const t = text.toLowerCase();
  if (/\bclaude\b|\bcc\b|claude code/.test(t)) return 'claude';
  if (/\bcodex\b/.test(t)) return 'codex';
  if (/antigravity|\bagy\b/.test(t)) return 'antigravity';
  if (/opencode|open code/.test(t)) return 'opencode';
  return null;
}

/** Parse a free-text station label ("Claude Code #1", "codex 2") into a target.
 *  Defaults the ordinal to 1 when none is given. Returns null if no agent matches. */
export function parseStationLabel(text: string): StationTarget | null {
  const agentId = matchAgentId(text);
  if (!agentId) return null;
  const num = /#?\s*(\d{1,2})\b/.exec(text);
  const ordinal = num ? Math.max(1, parseInt(num[1]!, 10)) : 1;
  return { agentId, ordinal };
}

/** Model-facing bullet list of the stations currently open (for the assistant). */
export function stationManifest(stations: Station[]): string {
  if (stations.length === 0) return '(none open right now)';
  return stations
    .map((s) => `- "${targetLabel({ agentId: s.agentId, ordinal: stationOrdinal(stations, s) })}"`)
    .join('\n');
}
