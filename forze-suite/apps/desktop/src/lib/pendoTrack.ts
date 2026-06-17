/**
 * Safe wrapper around the Pendo Track Events API.
 * Fires client-side pendo.track() only when the Pendo agent is loaded.
 * Failures are silently caught so tracking never breaks application flow.
 */

declare global {
  interface Window {
    pendo?: {
      track: (eventName: string, properties?: Record<string, unknown>) => void;
    };
  }
}

export function pendoTrack(
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  try {
    window.pendo?.track(eventName, properties);
  } catch {
    // Never let tracking break application flow
  }
}
