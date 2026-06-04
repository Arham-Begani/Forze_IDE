import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * Debounced, quota-safe localStorage backing for zustand's persist middleware.
 *
 * Why this exists: chat-style stores append a token at a time during streaming
 * (`content + delta`), and persist writes on *every* state change. Serializing
 * the whole growing thread/roster to localStorage per token is a synchronous
 * JSON.stringify + setItem storm that starves the main thread and blows the
 * ~5MB quota once output gets large — which crashed the webview the moment
 * Gemini streaming actually produced output. We coalesce writes on a trailing
 * timer and swallow QuotaExceededError so a failed write can never crash the
 * app. The latest state is flushed on pagehide/beforeunload so a reload still
 * shows the last state.
 */
function makeDebouncedStorage(delayMs: number): StateStorage {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { key: string; value: string } | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pending) return;
    const { key, value } = pending;
    pending = null;
    try {
      localStorage.setItem(key, value);
    } catch {
      /* quota exceeded or unavailable — drop the write rather than crash */
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
  }

  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => {
      pending = { key, value };
      if (!timer) timer = setTimeout(flush, delayMs);
    },
    removeItem: (key) => {
      pending = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      localStorage.removeItem(key);
    },
  };
}

/** Drop-in `storage` for persist() that debounces writes (default 800ms). */
export const debouncedJSONStorage = (delayMs = 800) =>
  createJSONStorage(() => makeDebouncedStorage(delayMs));
