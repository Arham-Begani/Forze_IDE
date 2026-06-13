import { writePty } from '../lib/pty';
import {
  addTaskFromIde,
  enableBusForWorkspace,
  isBusEnabled,
  postFromIde,
  setNoteFromIde,
} from '../lib/agentBus';
import { generateText } from '../lib/ai';
import { useProject } from './projectStore';
import { useAgentBus } from './agentBusStore';
import {
  stationOrdinal,
  stationReady,
  targetLabel,
  useVibeStations,
  type Station,
} from './vibeStationsStore';

/**
 * Team Sync — the layer that makes the Context Bus *active* rather than just
 * available. Two jobs:
 *
 *  1. Auto-brief newly-ready stations (opt-in): type a short briefing into a
 *     station's CLI the moment it's ready, so the agent discovers the bus and
 *     starts coordinating instead of working in a silo.
 *  2. Deliver human "team commands" live: type one instruction into every
 *     running station's CLI at once (the founder superpower), recording it on
 *     the bus feed for the record.
 *
 * Delivery reuses the same machinery as the prompt scheduler: a station is
 * addressable once its pty session is mirrored into the store and the CLI has
 * had READY_GRACE_MS to settle (see `stationReady`).
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

/**
 * The onboarding briefing typed into a station's CLI. Single line (a `\r`
 * submits it), personalised with the station's bus identity so the agent knows
 * its own name. Phrased as an instruction the agent should act on immediately.
 */
export function teamBriefing(label: string, goal?: string): string {
  const goalLine = goal ? ` The team's goal: ${goal}.` : '';
  return (
    `[Forze team] You are "${label}", one of several AI coding agents working this repo TOGETHER through the forze_bus_* MCP tools.${goalLine} ` +
    `Work as an autonomous team: call forze_bus_whoami, then forze_bus_board and forze_bus_tasks to see shared decisions and the team TODO. ` +
    `Then loop: call forze_bus_task_next to atomically grab the next task (race-free — no other station can take the same one), complete it fully, then forze_bus_task_update it to "done" — repeat until forze_bus_task_next returns task: null. ` +
    `Before each task re-check forze_bus_board and forze_bus_inbox; use forze_bus_send to coordinate or hand off, ` +
    `forze_bus_note to record decisions others must follow, and forze_bus_announce your current status. If the queue empties but the goal isn't met, add tasks with forze_bus_task_add.`
  );
}

// Stations already briefed this run, keyed by id+runKey so a restart re-briefs.
const briefed = new Set<string>();
const briefKey = (s: Station): string => `${s.id}:${s.runKey}`;

/**
 * Brief ready stations now. Returns the labels briefed. By default skips a
 * station already briefed this run (used by the auto-runner + "Brief the team");
 * `force` re-briefs regardless (used when kicking off a new goal). An optional
 * `goal` is woven into the briefing.
 */
export async function briefReadyStations(goal?: string, force = false): Promise<string[]> {
  const ready = readyStations();
  const delivered: string[] = [];
  for (const r of ready) {
    if (!force && briefed.has(briefKey(r.station))) continue;
    briefed.add(briefKey(r.station));
    try {
      await writePty(r.sessionId, `${teamBriefing(r.label, goal)}\r`);
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

// ---- one-shot: give the whole team a goal --------------------------------

/** Ask the model to break a goal into a few concrete, independent tasks. */
export async function splitGoalIntoTasks(goal: string): Promise<string[]> {
  try {
    const out = await generateText(
      `Break this software goal into 3 to 6 small, concrete, independent tasks that separate coding agents could each pick up in parallel. ` +
        `Goal: "${goal}". Output ONLY the tasks, one per line, each a short imperative phrase. No numbering, bullets, or commentary.`,
      { maxTokens: 300 },
    );
    const tasks = out
      .split(/\r?\n/)
      .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
      .filter((l) => l.length > 0 && l.length < 200)
      .slice(0, 6);
    return tasks.length ? tasks : [goal];
  } catch {
    // No model / failure → still useful: one task = the goal itself.
    return [goal];
  }
}

export interface StartGoalResult {
  tasks: string[];
  briefed: string[];
  stationsRunning: number;
}

/**
 * One action that does everything: enable the bus if needed, split the goal into
 * tasks on the shared queue, pin the goal to the board, flip on auto-brief, and
 * brief every running station to work the queue together. After this the user
 * does nothing — the agents self-assign and collaborate until the queue drains.
 */
export async function startTeamGoal(root: string, goal: string): Promise<StartGoalResult> {
  const g = goal.trim();
  if (!root || !g) return { tasks: [], briefed: [], stationsRunning: 0 };

  if (!(await isBusEnabled(root))) await enableBusForWorkspace(root);
  const tasks = await splitGoalIntoTasks(g);
  await setNoteFromIde(root, 'goal', g);
  for (const t of tasks) await addTaskFromIde(root, t);

  // Future stations should auto-join and find the goal+queue on the board.
  useAgentBus.getState().setAutoBrief(true);
  // Brief everyone running right now (force: re-brief even if already briefed).
  const briefed = await briefReadyStations(g, true);

  return { tasks, briefed, stationsRunning: readyStations().length };
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
