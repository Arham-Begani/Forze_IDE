import { linkedinConnected, postToLinkedin } from '../lib/publish';
import { useBipSchedule } from './bipScheduleStore';

let interval: number | null = null;

/**
 * Walks the Build-in-Public queue every 30s and publishes any post whose
 * `scheduledFor` has arrived to the connected LinkedIn account. Started once
 * from App.tsx and runs while the IDE is open. Best-effort scheduling — a true
 * offline poller (posting while the app is closed) would need a Rust
 * background task; for now the founder needs the IDE running when a post is due.
 */
export function startBipScheduler(): () => void {
  if (interval !== null) return stop;
  void tick();
  interval = window.setInterval(() => void tick(), 30_000);
  return stop;
}

function stop(): void {
  if (interval !== null) {
    window.clearInterval(interval);
    interval = null;
  }
}

async function tick(): Promise<void> {
  const state = useBipSchedule.getState();
  const now = Date.now();
  const due = state.posts.filter(
    (p) => p.status === 'queued' && p.scheduledFor <= now,
  );
  if (due.length === 0) return;

  for (const post of due) {
    // Leave it queued (don't burn it as failed) if LinkedIn isn't connected —
    // it retries automatically on the next tick once the user reconnects.
    if (!linkedinConnected()) {
      state.markStatus(post.id, 'queued', {
        lastError: 'Waiting on LinkedIn connection — reconnect in Build in Public.',
      });
      continue;
    }
    state.markStatus(post.id, 'publishing', { attempts: post.attempts + 1 });
    try {
      const { url } = await postToLinkedin(post.text);
      state.markStatus(post.id, 'published', { url, lastError: undefined });
    } catch (err) {
      state.markStatus(post.id, 'failed', {
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
