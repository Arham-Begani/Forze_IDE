import { writePty } from '../lib/pty';
import { toast } from '../shell/toast';
import { generateNextPrompt, lastOutputAt, outputTail, wireOutputTails } from './autopilot';
import { useProject } from './projectStore';
import {
  usePromptSchedule,
  type AutopilotMission,
  type ScheduledPrompt,
} from './promptScheduleStore';
import { useWorkbench } from './store';
import {
  MAX_STATIONS,
  resolveTarget,
  stationReady,
  targetLabel,
  useVibeStations,
  type StationTarget,
} from './vibeStationsStore';

/**
 * Background runner for scheduled prompts — both kinds:
 *
 *  - One-shot prompts: at their time, the exact text is typed into the target
 *    Vibe Station's coding-agent CLI (auto-opening the Vibe Stations page and
 *    spawning the station if it isn't running yet).
 *  - Autopilot missions: at every interval the AI writes the next instruction
 *    itself — from the user's vision, the instructions already sent, and the
 *    station's recent terminal output — and types that in, until the vision is
 *    judged complete or the run budget is spent.
 *
 * Both defer politely while the agent CLI is mid-task (recent terminal output)
 * instead of interrupting it, up to a bounded wait.
 *
 * Best-effort, like the build-in-public scheduler: the IDE has to be open when
 * a prompt is due (true offline delivery would need a Rust background task).
 * The single global tick is started once from App.tsx.
 */

const TICK_MS = 20_000;
/** How long a due item may sit in `preparing` (auto-spawn + boot) before we give up. */
const PREPARE_TIMEOUT_MS = 90_000;
/** The agent is "busy" if its terminal produced output within this window. */
const QUIET_WINDOW_MS = 20_000;
/** Longest we'll defer a due item waiting for the agent to go quiet. */
const BUSY_DEFER_MAX_MS = 10 * 60_000;

let interval: number | null = null;
let stopTails: (() => void) | null = null;
// Guards against a slow tick overlapping the next one.
let running = false;

export function startPromptScheduler(): () => void {
  if (interval !== null) return stop;
  recoverInFlight();
  stopTails = wireOutputTails();
  void tick();
  interval = window.setInterval(() => void tick(), TICK_MS);
  return stop;
}

/**
 * Reset items left mid-flight by a previous run (the app closed while a prompt
 * was `preparing`/`delivering`). Their pty session is gone on reload, so requeue
 * them — a still-future item waits for its time; an overdue one fires next tick.
 */
function recoverInFlight(): void {
  const sched = usePromptSchedule.getState();
  for (const p of sched.prompts) {
    if (p.status === 'preparing' || p.status === 'delivering') {
      sched.markStatus(p.id, 'queued', { preparingSince: undefined, lastError: undefined });
    }
  }
  for (const a of sched.autopilots) {
    if (a.preparingSince !== undefined) {
      sched.patchAutopilot(a.id, { preparingSince: undefined });
    }
  }
}

function stop(): void {
  if (interval !== null) {
    window.clearInterval(interval);
    interval = null;
  }
  stopTails?.();
  stopTails = null;
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    const sched = usePromptSchedule.getState();
    const due = sched.prompts.filter(
      (p) =>
        (p.status === 'queued' || p.status === 'preparing') && p.scheduledFor <= now,
    );
    for (const item of due) {
      await processDue(item, now);
    }
    const dueMissions = sched.autopilots.filter(
      (a) => a.status === 'active' && a.nextRunAt <= now,
    );
    for (const mission of dueMissions) {
      await processAutopilot(mission, now);
    }
  } finally {
    running = false;
  }
}

/** Where a target station stands right now, from the scheduler's perspective. */
type StationState =
  | { kind: 'ready'; sessionId: string }
  | { kind: 'preparing' }
  | { kind: 'failed'; error: string };

/**
 * Ensure the target station exists and its CLI is ready for input, spawning
 * stations (and opening the Vibe Stations page) as needed. Shared by one-shot
 * delivery and autopilot missions so both prepare identically.
 */
function ensureStationReady(target: StationTarget): StationState {
  const vibe = useVibeStations.getState();
  const station = resolveTarget(vibe.stations, target);

  // Station slot doesn't exist yet → open Vibe Stations and spawn enough of
  // that agent to reach the requested ordinal (e.g. "#2" needs two).
  if (!station) {
    useWorkbench.getState().openPage('vibe-stations');
    const cwd = useProject.getState().workspaceRoot ?? null;
    const existing = vibe.stations.filter((s) => s.agentId === target.agentId).length;
    let total = vibe.stations.length;
    for (let i = existing; i < target.ordinal && total < MAX_STATIONS; i++) {
      vibe.addStation(target.agentId, cwd);
      total++;
    }
    if (total >= MAX_STATIONS && existing < target.ordinal) {
      return {
        kind: 'failed',
        error: `Can't open ${targetLabel(target)} — the station grid is full.`,
      };
    }
    return { kind: 'preparing' };
  }

  // Station exists but its CLI isn't ready to accept input yet → wait.
  if (!stationReady(vibe.sessions, station.id)) {
    return { kind: 'preparing' };
  }

  const sess = vibe.sessions[station.id];
  if (!sess) return { kind: 'preparing' }; // raced with a close; retry next tick.
  return { kind: 'ready', sessionId: sess.sessionId };
}

/**
 * True when we should hold a due item because the agent is visibly mid-task
 * (its terminal produced output moments ago). Bounded: past the deferral cap
 * we deliver anyway rather than stall forever on a chatty session.
 */
function agentBusy(sessionId: string, dueSince: number, now: number): boolean {
  const last = lastOutputAt(sessionId);
  if (last === 0) return false;
  if (now - dueSince > BUSY_DEFER_MAX_MS) return false;
  return now - last < QUIET_WINDOW_MS;
}

async function processDue(item: ScheduledPrompt, now: number): Promise<void> {
  const sched = usePromptSchedule.getState();
  const state = ensureStationReady(item.target);

  if (state.kind === 'failed') {
    sched.markStatus(item.id, 'failed', { lastError: state.error });
    toast(`Scheduled prompt failed: ${state.error}`, 'error');
    return;
  }

  if (state.kind === 'preparing') {
    if (item.status !== 'preparing') {
      sched.markStatus(item.id, 'preparing', { preparingSince: now });
    } else if (item.preparingSince && now - item.preparingSince > PREPARE_TIMEOUT_MS) {
      sched.markStatus(item.id, 'failed', {
        lastError: `${targetLabel(item.target)} didn't become ready in time.`,
      });
      toast(`Scheduled prompt timed out waiting for ${targetLabel(item.target)}`, 'error');
    }
    return;
  }

  // Ready — but don't interrupt an agent that's visibly mid-task; wait for a
  // quiet window (bounded by BUSY_DEFER_MAX_MS since the scheduled time).
  if (agentBusy(state.sessionId, item.scheduledFor, now)) return;

  sched.markStatus(item.id, 'delivering');
  try {
    await writePty(state.sessionId, `${item.prompt}\r`);
    sched.markStatus(item.id, 'done', { lastError: undefined });
    toast(`Sent prompt to ${targetLabel(item.target)}`, 'success');
  } catch (err) {
    sched.markStatus(item.id, 'failed', {
      lastError: err instanceof Error ? err.message : String(err),
    });
    toast(`Couldn't deliver to ${targetLabel(item.target)}`, 'error');
  }
}

async function processAutopilot(mission: AutopilotMission, now: number): Promise<void> {
  const sched = usePromptSchedule.getState();
  const state = ensureStationReady(mission.target);

  if (state.kind === 'failed') {
    sched.recordAutopilotFailure(mission.id, state.error, now);
    toast(`Autopilot: ${state.error}`, 'error');
    return;
  }

  if (state.kind === 'preparing') {
    if (mission.preparingSince === undefined) {
      sched.patchAutopilot(mission.id, { preparingSince: now });
    } else if (now - mission.preparingSince > PREPARE_TIMEOUT_MS) {
      sched.recordAutopilotFailure(
        mission.id,
        `${targetLabel(mission.target)} didn't become ready in time.`,
        now,
      );
    }
    return;
  }

  // Don't talk over the agent while it's clearly mid-task.
  if (agentBusy(state.sessionId, mission.nextRunAt, now)) return;

  try {
    const prompt = await generateNextPrompt(mission, outputTail(state.sessionId));
    if (prompt === null) {
      sched.markAutopilotDone(mission.id, 'The AI judged the vision complete.');
      toast(
        `Autopilot finished on ${targetLabel(mission.target)} — vision complete after ${mission.runsDone} step${mission.runsDone === 1 ? '' : 's'}.`,
        'success',
      );
      return;
    }
    await writePty(state.sessionId, `${prompt}\r`);
    sched.recordAutopilotSent(mission.id, prompt, now);
    const after = usePromptSchedule.getState().autopilots.find((a) => a.id === mission.id);
    toast(
      after?.status === 'done'
        ? `Autopilot sent its final step (${after.runsDone}/${after.maxRuns}) to ${targetLabel(mission.target)}.`
        : `Autopilot step ${mission.runsDone + 1}/${mission.maxRuns} → ${targetLabel(mission.target)}`,
      'success',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sched.recordAutopilotFailure(mission.id, message, now);
    const after = usePromptSchedule.getState().autopilots.find((a) => a.id === mission.id);
    toast(
      after?.status === 'paused'
        ? `Autopilot paused on ${targetLabel(mission.target)} after repeated failures: ${message}`
        : `Autopilot hiccup on ${targetLabel(mission.target)}: ${message} — retrying in ${mission.intervalMin}m`,
      'error',
    );
  }
}
