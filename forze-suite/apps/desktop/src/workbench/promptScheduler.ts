import { writePty } from '../lib/pty';
import { toast } from '../shell/toast';
import { useProject } from './projectStore';
import { usePromptSchedule, type ScheduledPrompt } from './promptScheduleStore';
import { useWorkbench } from './store';
import {
  MAX_STATIONS,
  resolveTarget,
  stationReady,
  targetLabel,
  useVibeStations,
} from './vibeStationsStore';

/**
 * Background runner for scheduled prompts. Every tick it looks for prompts whose
 * time has arrived and delivers them to the target Vibe Station's coding-agent
 * CLI — auto-opening the Vibe Stations page and spawning the station if it isn't
 * running yet, then waiting for the CLI to settle before typing the prompt.
 *
 * Best-effort, like the build-in-public scheduler: the IDE has to be open when a
 * prompt is due (true offline delivery would need a Rust background task). The
 * single global tick is started once from App.tsx.
 */

const TICK_MS = 20_000;
/** How long a due prompt may sit in `preparing` (auto-spawn + boot) before we give up. */
const PREPARE_TIMEOUT_MS = 90_000;

let interval: number | null = null;
// Guards against a slow tick overlapping the next one.
let running = false;

export function startPromptScheduler(): () => void {
  if (interval !== null) return stop;
  recoverInFlight();
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
}

function stop(): void {
  if (interval !== null) {
    window.clearInterval(interval);
    interval = null;
  }
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    const due = usePromptSchedule
      .getState()
      .prompts.filter(
        (p) =>
          (p.status === 'queued' || p.status === 'preparing') && p.scheduledFor <= now,
      );
    for (const item of due) {
      await processDue(item, now);
    }
  } finally {
    running = false;
  }
}

async function processDue(item: ScheduledPrompt, now: number): Promise<void> {
  const sched = usePromptSchedule.getState();
  const vibe = useVibeStations.getState();
  const station = resolveTarget(vibe.stations, item.target);

  // 1) Station slot doesn't exist yet → open Vibe Stations and spawn enough of
  //    that agent to reach the requested ordinal (e.g. "#2" needs two).
  if (!station) {
    if (item.status !== 'preparing') {
      useWorkbench.getState().openPage('vibe-stations');
      const cwd = useProject.getState().workspaceRoot ?? null;
      const existing = vibe.stations.filter((s) => s.agentId === item.target.agentId).length;
      let total = vibe.stations.length;
      for (let i = existing; i < item.target.ordinal && total < MAX_STATIONS; i++) {
        vibe.addStation(item.target.agentId, cwd);
        total++;
      }
      if (total >= MAX_STATIONS && existing < item.target.ordinal) {
        sched.markStatus(item.id, 'failed', {
          lastError: `Can't open ${targetLabel(item.target)} — the station grid is full.`,
        });
        toast(`Scheduled prompt failed: ${targetLabel(item.target)} couldn't be opened`, 'error');
        return;
      }
      sched.markStatus(item.id, 'preparing', { preparingSince: now });
    } else {
      bailIfStuck(item, now);
    }
    return;
  }

  // 2) Station exists but its CLI isn't ready to accept input yet → wait.
  if (!stationReady(useVibeStations.getState().sessions, station.id)) {
    if (item.status !== 'preparing') {
      sched.markStatus(item.id, 'preparing', { preparingSince: now });
    } else {
      bailIfStuck(item, now);
    }
    return;
  }

  // 3) Ready → type the prompt into the agent CLI.
  const sess = useVibeStations.getState().sessions[station.id];
  if (!sess) return; // raced with a close; retry next tick.
  sched.markStatus(item.id, 'delivering');
  try {
    await writePty(sess.sessionId, `${item.prompt}\r`);
    sched.markStatus(item.id, 'done', { lastError: undefined });
    toast(`Sent prompt to ${targetLabel(item.target)}`, 'success');
  } catch (err) {
    sched.markStatus(item.id, 'failed', {
      lastError: err instanceof Error ? err.message : String(err),
    });
    toast(`Couldn't deliver to ${targetLabel(item.target)}`, 'error');
  }
}

/** Fail a prompt that's been stuck preparing past the timeout. */
function bailIfStuck(item: ScheduledPrompt, now: number): void {
  if (item.preparingSince && now - item.preparingSince > PREPARE_TIMEOUT_MS) {
    usePromptSchedule.getState().markStatus(item.id, 'failed', {
      lastError: `${targetLabel(item.target)} didn't become ready in time.`,
    });
    toast(`Scheduled prompt timed out waiting for ${targetLabel(item.target)}`, 'error');
  }
}
