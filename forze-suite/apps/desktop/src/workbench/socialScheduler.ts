import { publishPostFromIDE } from '@forze/shared/publishing';
import { useSocial } from './socialStore';

const APP_URL =
  (import.meta.env.VITE_FORGE_APP_URL as string | undefined) ??
  'http://localhost:3000';

let interval: number | null = null;

/**
 * Fires the queued publish broker call for any post whose `scheduledFor` has
 * arrived. The tick is started once from App.tsx and runs while the IDE is
 * open. A Rust background poller (true offline scheduling) is a Phase 7+
 * upgrade — for now we're best-effort while the founder has the IDE running.
 */
export function startSocialScheduler(): () => void {
  if (interval !== null) return () => stop();
  tick();
  interval = window.setInterval(tick, 30_000);
  return stop;
}

function stop(): void {
  if (interval !== null) {
    window.clearInterval(interval);
    interval = null;
  }
}

async function tick(): Promise<void> {
  const state = useSocial.getState();
  const now = Date.now();
  const due = state.posts.filter(
    (p) => p.status === 'queued' && p.scheduledFor <= now,
  );
  if (due.length === 0) return;

  for (const post of due) {
    if (!state.sessionToken) {
      state.markStatus(post.id, 'failed', {
        lastError: 'No Supabase session token set in Social settings.',
        attempts: post.attempts + 1,
      });
      continue;
    }
    state.markStatus(post.id, 'publishing', { attempts: post.attempts + 1 });
    try {
      const result = await publishPostFromIDE(
        { appUrl: APP_URL, sessionToken: state.sessionToken },
        post.payload,
      );
      state.markStatus(
        post.id,
        result.success ? 'published' : 'failed',
        {
          result,
          lastError: result.error,
        },
      );
    } catch (err) {
      state.markStatus(post.id, 'failed', {
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
