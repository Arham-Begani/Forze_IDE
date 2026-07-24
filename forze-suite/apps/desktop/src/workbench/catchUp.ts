/**
 * Auto-fires the catch-up digest when the founder returns to the IDE after being
 * away, and exposes a manual trigger. "Away" = the window was hidden/blurred for
 * longer than IDLE_MS. On return we summarize what changed while gone and drop it
 * into the Forze Assistant, opening the bubble so it's seen.
 *
 * This is best-effort and only runs while the IDE is open (same limitation as the
 * other schedulers) — the digest fires on refocus, not truly offline.
 */
import { runDigest } from '../lib/digest';
import { useProject } from './projectStore';
import { useAssistant } from './assistantStore';
import { useWorkbench } from './store';

/** Consider the founder "away" after the window is hidden this long. */
const IDLE_MS = 3 * 60 * 1000;
/** Manual "catch me up" looks back this far when we don't have an away-time. */
const DEFAULT_LOOKBACK_MS = 8 * 60 * 60 * 1000;

let awaySince = 0;
let running = false;

/** A short, human "N minutes/hours ago" label for the timeframe. */
function relLabel(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return 'a moment ago';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
}

/**
 * Build a catch-up digest and surface it in the Assistant. Safe to call from a
 * command, an assistant verb, or the auto-trigger. Single-flight.
 */
export async function catchMeUp(opts: { since?: number } = {}): Promise<void> {
  if (running) return;
  const assistant = useAssistant.getState();
  const workbench = useWorkbench.getState();
  const root = useProject.getState().workspaceRoot;
  if (!root) {
    assistant.pushNote('Open a project folder and I can catch you up on what changed.');
    workbench.setAssistantOpen(true);
    return;
  }
  const since = opts.since ?? Date.now() - DEFAULT_LOOKBACK_MS;
  running = true;
  try {
    const { text } = await runDigest({ root, since, sinceLabel: relLabel(since) });
    assistant.pushNote(text);
    workbench.setAssistantOpen(true);
  } catch (err) {
    assistant.pushNote(
      `Couldn't build a catch-up — ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    running = false;
  }
}

/** Start the focus-after-idle auto-digest. Returns a cleanup fn. Idempotent-ish:
 *  call once from App. */
export function startCatchUp(): () => void {
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      awaySince = Date.now();
      return;
    }
    // Became visible: if we were away long enough, brief on what changed.
    if (awaySince > 0 && Date.now() - awaySince >= IDLE_MS) {
      const since = awaySince;
      awaySince = 0;
      void catchMeUp({ since });
    } else {
      awaySince = 0;
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => document.removeEventListener('visibilitychange', onVisibility);
}
