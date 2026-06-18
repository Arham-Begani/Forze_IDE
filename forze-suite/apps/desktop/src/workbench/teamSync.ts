import { writePty } from '../lib/pty';
import {
  defineLaneFromIde,
  enableBusForWorkspace,
  isBusEnabled,
  postFromIde,
  setGoalFromIde,
} from '../lib/agentBus';
import { useProject } from './projectStore';
import { useAgentBus } from './agentBusStore';
import {
  stationOrdinal,
  stationReady,
  targetLabel,
  useVibeStations,
  type CrewAssignment,
  type Station,
} from './vibeStationsStore';

/**
 * Team Sync — the layer that makes the Crew Bus *active* rather than just
 * available. It turns a goal into a working crew:
 *
 *  1. Role-aware briefing: type a short, ROLE-SPECIFIC instruction into each
 *     station's CLI when it's ready, so the Architect plans, Builders work only
 *     their lane, and the Reviewer integrates — instead of every agent racing
 *     the same queue and clobbering each other.
 *  2. Live "team commands": type one instruction into every running station at
 *     once (the founder superpower), recorded on the bus feed for the record.
 *
 * The briefs are deliberately lean: only the Architect plans (builders pull
 * pre-scoped tasks rather than re-deriving the goal), and we tell agents to lean
 * on forze_bus_task_next / forze_bus_sync rather than polling the board between
 * every step. That's what keeps token use down.
 *
 * Delivery reuses the prompt scheduler's machinery: a station is addressable
 * once its pty session is mirrored into the store and the CLI has had
 * READY_GRACE_MS to settle (see `stationReady`).
 */

/** A station that's booted far enough to accept a typed instruction. */
interface ReadyStation {
  station: Station;
  label: string;
  sessionId: string;
}

function readyStations(): ReadyStation[] {
  const vibe = useVibeStations.getState();
  const out: ReadyStation[] = [];
  for (const station of vibe.stations) {
    if (!stationReady(vibe.sessions, station.id)) continue;
    const sess = vibe.sessions[station.id];
    if (!sess) continue;
    out.push({
      station,
      label: targetLabel({ agentId: station.agentId, ordinal: stationOrdinal(vibe.stations, station) }),
      sessionId: sess.sessionId,
    });
  }
  return out;
}

function labelOf(station: Station): string {
  const stations = useVibeStations.getState().stations;
  return targetLabel({ agentId: station.agentId, ordinal: stationOrdinal(stations, station) });
}

/** Derive the crew assignment from stations' already-set roles (no reassign). */
function currentAssignment(stations: Station[]): CrewAssignment {
  const builders = stations.filter((s) => s.role === 'builder');
  return {
    architect: stations.find((s) => s.role === 'architect') ?? null,
    builders,
    reviewer: stations.find((s) => s.role === 'reviewer') ?? null,
    lanes: builders.map((b) => b.lane).filter((l): l is string => !!l),
  };
}

// ---- role-aware briefings -------------------------------------------------

/**
 * The instruction typed into a station's CLI, tailored to its role. A single
 * line (`\r` submits it). Each brief tells the agent to register its role and
 * sync ONCE, then work the lean loop for its role — no "re-check everything
 * before every task" busywork.
 */
export function briefingFor(station: Station, allLanes: string[], goal?: string): string {
  const label = labelOf(station);
  const goalLine = goal ? `The goal: ${goal}. ` : 'Read the goal with forze_bus_sync. ';
  const stationCount = useVibeStations.getState().stations.length;

  // A lone station owns everything — plan AND build, no lanes.
  if (station.role === 'architect' && stationCount <= 1) {
    return (
      `[Forze Crew] You are "${label}", working solo via the forze_bus_* MCP tools. ` +
      `First call forze_bus_register {role:"architect"}. ${goalLine}` +
      `Use the bus as your plan + checklist: call forze_bus_plan ONCE to break the goal into small scoped tasks ` +
      `(each with the files it touches and acceptance criteria — no lanes needed, you own the whole repo), record key ` +
      `decisions with forze_bus_note, then work the tasks one at a time, marking each forze_bus_task_update "done" as you go.`
    );
  }

  if (station.role === 'architect') {
    const lanes = allLanes.length ? allLanes.join(', ') : 'lane-1, lane-2';
    return (
      `[Forze Crew] You are "${label}", the ARCHITECT. First call forze_bus_register {role:"architect"}. ${goalLine}` +
      `Your job is the PLAN, not the code — do NOT edit feature files. Read just enough of the repo to design, then call ` +
      `forze_bus_plan ONCE with: lanes = [${lanes}] (one per builder, each a DISJOINT set of file paths/dirs so builders ` +
      `never touch the same files), and tasks = small units, each with scope (the exact files it touches), its lane, ` +
      `acceptance criteria, and dependsOn (reference earlier tasks by their title). Pin cross-cutting decisions ` +
      `(API shapes, schemas, shared types) with forze_bus_note so builders follow them. After planning, answer hand-offs ` +
      `via forze_bus_inbox and do final integration — leave each lane's files to its builder.`
    );
  }

  if (station.role === 'reviewer') {
    return (
      `[Forze Crew] You are "${label}", the REVIEWER. First call forze_bus_register {role:"reviewer"}. ${goalLine}` +
      `Wait for builders to finish, then loop forze_bus_task_next to pull role:"reviewer" work (integration, build, tests). ` +
      `Run the build and the test suite, reconcile the lanes, and report problems with forze_bus_send (to the owning builder) ` +
      `or forze_bus_note. You may edit across lanes, but claim a review task first so your files are leased. When everything ` +
      `builds, tests pass, and the goal is met, forze_bus_announce that the crew is done.`
    );
  }

  // builder
  const lane = station.lane ?? '(your lane)';
  return (
    `[Forze Crew] You are "${label}", a BUILDER on lane "${lane}". First call forze_bus_register {role:"builder", lane:"${lane}"}, ` +
    `then forze_bus_sync. ${goalLine}` +
    `Work ONLY files inside your lane (forze_bus_sync shows your lane's paths). Loop: forze_bus_task_next hands you a lane task ` +
    `race-free → complete it to its acceptance, editing only your lane → forze_bus_task_update it "done" → repeat until ` +
    `task_next returns null. If your lane has no paths yet, the Architect is still planning — wait a few seconds and ` +
    `forze_bus_sync again. Never edit another lane; if you need a change there, forze_bus_send that station. Don't re-read ` +
    `the whole board between tasks — task_next already gives you what you need.`
  );
}

// Stations already briefed this run, keyed by id+runKey so a restart re-briefs.
const briefed = new Set<string>();
const briefKey = (s: Station): string => `${s.id}:${s.runKey}`;

/**
 * Brief ready stations now, each with the briefing for its role. By default
 * skips a station already briefed this run; `force` re-briefs regardless (used
 * when kicking off a new goal). An optional `goal` is woven into the briefing.
 */
export async function briefReadyStations(goal?: string, force = false): Promise<string[]> {
  const ready = readyStations();
  const allLanes = useVibeStations
    .getState()
    .stations.filter((s) => s.role === 'builder')
    .map((s) => s.lane)
    .filter((l): l is string => !!l);
  const delivered: string[] = [];
  for (const r of ready) {
    if (!force && briefed.has(briefKey(r.station))) continue;
    briefed.add(briefKey(r.station));
    try {
      await writePty(r.sessionId, `${briefingFor(r.station, allLanes, goal)}\r`);
      delivered.push(r.label);
    } catch {
      if (!force) briefed.delete(briefKey(r.station)); // let a failed brief retry later
    }
  }
  return delivered;
}

/**
 * Type a human instruction into EVERY ready station's CLI at once, and record
 * it on the bus feed so the team (and the panel) have a log of what was asked.
 * Returns the labels delivered to.
 */
export async function runOnAllStations(root: string, text: string): Promise<string[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const ready = readyStations();
  const delivered: string[] = [];
  for (const r of ready) {
    try {
      await writePty(r.sessionId, `${trimmed}\r`);
      delivered.push(r.label);
    } catch {
      /* skip a station that raced a close */
    }
  }
  if (root) {
    await postFromIde(root, 'all', `▶ Ran on ${delivered.length} station(s): ${trimmed}`).catch(
      () => undefined,
    );
  }
  return delivered;
}

// ---- one-shot: put the crew on a goal -------------------------------------

export interface StartGoalResult {
  briefed: string[];
  stationsRunning: number;
  /** Assigned crew (labels for display). */
  architect: string | null;
  builders: number;
  reviewer: string | null;
  lanes: string[];
}

/**
 * Put the crew on a goal. Enables the bus if needed, assigns roles+lanes across
 * the running stations (Architect / Builders / Reviewer), seeds the goal and the
 * (empty) builder lanes onto the bus, flips on auto-brief so late-booting
 * stations join, and briefs everyone for their role. After this the user does
 * nothing — the Architect plans, builders work their lanes, the Reviewer
 * integrates.
 *
 * `opts.assign` (default true) reassigns roles by position; pass false when the
 * stations were launched as an explicit crew (launchCrew) and already have them.
 */
export async function startTeamGoal(
  root: string,
  goal: string,
  opts: { assign?: boolean } = {},
): Promise<StartGoalResult> {
  const g = goal.trim();
  const empty: StartGoalResult = {
    briefed: [],
    stationsRunning: 0,
    architect: null,
    builders: 0,
    reviewer: null,
    lanes: [],
  };
  if (!root || !g) return empty;

  if (!(await isBusEnabled(root))) await enableBusForWorkspace(root);

  const vibe = useVibeStations.getState();
  const assign = opts.assign ?? true;
  const crew = assign ? vibe.assignCrew() : currentAssignment(vibe.stations);

  await setGoalFromIde(root, g);
  // Pre-create the builder lanes (empty paths) so a builder can claim ownership
  // of its lane before the Architect has filled in the paths.
  for (const lane of crew.lanes) await defineLaneFromIde(root, lane);

  // Late-booting stations should auto-join and get their role brief.
  useAgentBus.getState().setAutoBrief(true);
  const delivered = await briefReadyStations(g, true);

  return {
    briefed: delivered,
    stationsRunning: readyStations().length,
    architect: crew.architect ? labelOf(crew.architect) : null,
    builders: crew.builders.length,
    reviewer: crew.reviewer ? labelOf(crew.reviewer) : null,
    lanes: crew.lanes,
  };
}

// ---- auto-brief background runner ----------------------------------------

const TICK_MS = 4000;
let interval: number | null = null;

// Cache the (file-system) enabled check so we don't stat the workspace every
// tick; re-check periodically in case the user enables mid-session.
let enabledCache: { root: string; value: boolean; at: number } | null = null;
const ENABLED_TTL_MS = 15_000;

async function busEnabledFor(root: string): Promise<boolean> {
  const now = Date.now();
  if (enabledCache && enabledCache.root === root && now - enabledCache.at < ENABLED_TTL_MS) {
    return enabledCache.value;
  }
  const value = await isBusEnabled(root);
  enabledCache = { root, value, at: now };
  return value;
}

async function tick(): Promise<void> {
  if (!useAgentBus.getState().autoBrief) return;
  const root = useProject.getState().workspaceRoot;
  if (!root) return;
  if (!(await busEnabledFor(root))) return;
  await briefReadyStations();
}

/** Start the auto-brief loop. Mirrors the prompt scheduler's lifecycle. */
export function startTeamSync(): () => void {
  if (interval !== null) return stopTeamSync;
  interval = window.setInterval(() => void tick(), TICK_MS);
  return stopTeamSync;
}

function stopTeamSync(): void {
  if (interval !== null) {
    window.clearInterval(interval);
    interval = null;
  }
}
