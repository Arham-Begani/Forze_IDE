import {
  AnthropicProvider,
  GeminiProvider,
  type Provider,
} from '@forze/agents';

/**
 * Single source of truth for which model Forze talks to and how its key is
 * resolved. Forze ships with a built-in general model (Gemini) so chat works
 * the moment the app opens — no key required. Users who want Claude, or who
 * want to use their own Gemini quota, bring their own key (BYOK) per provider.
 *
 * Key resolution order for any provider:
 *   1. the user's own key (if they pasted one in Settings / onboarding)
 *   2. the built-in key baked in at build time (Gemini only)
 *
 * The built-in key is read from `VITE_FORZE_GEMINI_KEY` at build time. When it
 * is absent the app still works — Gemini simply falls back to BYOK like Claude
 * does, and the usual "add a key" prompt appears. Centralising this here means
 * a future server-side broker can replace the bundled key without touching any
 * UI surface.
 */

/** Providers in display order. Gemini (the built-in general model) leads; Claude is the BYOK option. */
export const PROVIDERS: Provider[] = [
  GeminiProvider.provider,
  AnthropicProvider.provider,
];

/** The general model users get with zero setup. */
export const DEFAULT_PROVIDER_ID = GeminiProvider.id;

/**
 * Default model for fresh threads. Flash is fast and cheap — the right default
 * for a shared built-in key and for general-purpose chat. Users can switch to
 * Pro (or any Claude model) per thread.
 */
export const DEFAULT_MODEL = 'gemini-2.5-flash';

/** Build-time built-in key. Empty string when not configured. */
const BUILTIN_GEMINI_KEY = (
  import.meta.env.VITE_FORZE_GEMINI_KEY ?? ''
).trim();

export function providerForId(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]!;
}

/** The default model id for a given provider (used when spinning up a thread). */
export function defaultModelFor(providerId: string): string {
  if (providerId === GeminiProvider.id) return DEFAULT_MODEL;
  return providerForId(providerId).models[0]!.id;
}

/** The built-in (no-BYOK) key for a provider, or '' if none is bundled. */
export function builtInKeyFor(providerId: string): string {
  return providerId === GeminiProvider.id ? BUILTIN_GEMINI_KEY : '';
}

/**
 * The key Forze should actually send for a provider: the user's own key wins,
 * otherwise the bundled built-in key (Gemini). Returns '' when neither exists.
 */
export function resolveApiKey(
  providerId: string,
  userKeys: Record<string, string>,
): string {
  const own = (userKeys[providerId] ?? '').trim();
  return own || builtInKeyFor(providerId);
}

/** True when a provider can be used right now (a real key resolves). */
export function isProviderReady(
  providerId: string,
  userKeys: Record<string, string>,
): boolean {
  return resolveApiKey(providerId, userKeys).length > 0;
}

/** True when a provider is running on the bundled key (no user key set). */
export function usesBuiltInKey(
  providerId: string,
  userKeys: Record<string, string>,
): boolean {
  return (
    (userKeys[providerId] ?? '').trim().length === 0 &&
    builtInKeyFor(providerId).length > 0
  );
}

/** True when any provider is usable — drives the "model connected" signal. */
export function anyProviderReady(userKeys: Record<string, string>): boolean {
  return PROVIDERS.some((p) => isProviderReady(p.id, userKeys));
}
