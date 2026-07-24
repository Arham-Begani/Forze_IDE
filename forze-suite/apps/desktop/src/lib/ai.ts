import type { Message, Provider } from '@forze/agents';
import { useAgents } from '../workbench/agentStore';
import { useUsageLimits, type UsageModule } from '../workbench/usageLimitsStore';
import {
  DEFAULT_PROVIDER_ID,
  PROVIDERS,
  defaultModelFor,
  isProviderReady,
  providerForId,
  resolveApiKey,
  usesBuiltInKey,
} from '../workbench/aiConfig';

/** Gemini's image-generation model ("Nano Banana"), reachable on the same key. */
const IMAGE_MODEL = 'gemini-2.5-flash-image';

export interface GenerateTextOptions {
  /** System / role instruction. */
  system?: string;
  /** Override the model id (defaults to the provider's default). */
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Called with each streamed delta, for live UIs. */
  onDelta?: (delta: string) => void;
  /** Which feature is spending here — for usage limits + per-module metering. */
  module?: UsageModule;
}

/** The provider Forze should use right now: the default if ready, else any ready one. */
export function activeProvider(): Provider | null {
  const keys = useAgents.getState().apiKeys;
  if (isProviderReady(DEFAULT_PROVIDER_ID, keys)) {
    return providerForId(DEFAULT_PROVIDER_ID);
  }
  return PROVIDERS.find((p) => isProviderReady(p.id, keys)) ?? null;
}

/** True when at least one provider can be called right now. */
export function aiReady(): boolean {
  return activeProvider() !== null;
}

/** Build a chat message with the id/timestamp bookkeeping the providers expect. */
export function userMsg(content: string): Message {
  return { id: crypto.randomUUID(), role: 'user', content, createdAt: Date.now() };
}

/** Build an assistant message (used to replay prior turns in a tool loop). */
export function assistantMsg(content: string): Message {
  return { id: crypto.randomUUID(), role: 'assistant', content, createdAt: Date.now() };
}

/**
 * Stream a full multi-turn conversation against the active provider, collecting
 * the assistant's reply into a single string. This is the primitive behind the
 * Agent Manager's tool loop, where the message history grows across turns as
 * tool results are fed back in. Throws a friendly error when no provider key is
 * available so callers can surface a toast.
 */
export async function streamConversation(
  messages: Message[],
  options: GenerateTextOptions = {},
): Promise<string> {
  const provider = activeProvider();
  if (!provider) {
    throw new Error('No AI model is connected. Add a key in Settings → Agent providers.');
  }

  const keys = useAgents.getState().apiKeys;
  const apiKey = resolveApiKey(provider.id, keys);
  const model = options.model ?? defaultModelFor(provider.id);

  // Usage limits apply ONLY to Forze's built-in Gemini key. When the user brings
  // their own key (BYOK — their own Gemini key, or Claude, which is BYOK-only),
  // they spend their own quota: no limit, no metering.
  const onBuiltInKey = usesBuiltInKey(provider.id, keys);
  const limiter = useUsageLimits.getState();
  if (onBuiltInKey) {
    // Stop here if the built-in budget is already exhausted, before spending any
    // of Forze's quota. The thrown message is surfaced as a toast by callers.
    const verdict = limiter.checkUsage();
    if (!verdict.ok) throw new Error(verdict.reason ?? 'AI usage limit reached.');
  }

  let out = '';
  let usage: { inputTokens?: number; outputTokens?: number } | undefined;
  for await (const chunk of provider.generate({
    model,
    apiKey,
    systemPrompt: options.system,
    messages,
    maxTokens: options.maxTokens ?? 1024,
    signal: options.signal,
  })) {
    if (chunk.delta) {
      out += chunk.delta;
      options.onDelta?.(chunk.delta);
    }
    if (chunk.usage) usage = chunk.usage;
    if (chunk.done) break;
  }

  // Meter EVERY call so the Burn Meter can show real spend — including BYOK
  // (Claude, or the user's own Gemini key), which used to be invisible. Only the
  // built-in key is *blocked* by the budget above; BYOK is unlimited, just seen.
  limiter.recordUsage(
    provider.id,
    options.module ?? 'other',
    (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
    { model, inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens },
  );
  return out.trim();
}

/**
 * One-shot text generation against whichever provider is configured. Collects
 * the streamed response into a single string. Throws a friendly error when no
 * provider key is available so callers can surface a toast.
 */
export async function generateText(
  prompt: string,
  options: GenerateTextOptions = {},
): Promise<string> {
  return streamConversation([userMsg(prompt)], options);
}

export interface GeneratedImage {
  /** Ready-to-render `data:<mime>;base64,…` URL. */
  dataUrl: string;
  mimeType: string;
}

/**
 * Text-to-image generation. Image synthesis is Gemini-only, so this always
 * resolves the Gemini key (the user's own, else the built-in one) regardless of
 * which provider chat is pointed at. Returns a data URL ready to drop into an
 * `<img src>`. Throws a friendly error when no Gemini key is available or the
 * model returns no image part.
 */
export async function generateImage(
  prompt: string,
  options: { signal?: AbortSignal } = {},
): Promise<GeneratedImage> {
  const keys = useAgents.getState().apiKeys;
  const apiKey = resolveApiKey(DEFAULT_PROVIDER_ID, keys);
  if (!apiKey) {
    throw new Error(
      'Image generation needs a Gemini key. Add one in Settings → Agent providers.',
    );
  }

  // Usage limits apply ONLY to the built-in Gemini key; a user's own Gemini key
  // is unlimited. (Image calls count as one request.)
  const onBuiltInKey = usesBuiltInKey(DEFAULT_PROVIDER_ID, keys);
  const limiter = useUsageLimits.getState();
  if (onBuiltInKey) {
    const verdict = limiter.checkUsage();
    if (!verdict.ok) throw new Error(verdict.reason ?? 'AI usage limit reached.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${encodeURIComponent(
    apiKey,
  )}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Image generation failed (${response.status}): ${text || response.statusText}`);
  }

  const json = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    }>;
    promptFeedback?: { blockReason?: string };
  };

  if (json.promptFeedback?.blockReason) {
    throw new Error(`Image blocked by safety filter (${json.promptFeedback.blockReason}).`);
  }

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data)?.inlineData;
  if (!img?.data) {
    throw new Error('The model returned no image. Try a more descriptive prompt.');
  }
  const mimeType = img.mimeType || 'image/png';
  // Gemini's image endpoint reports no token usage; record it as one request so
  // the request budgets still apply (built-in key) and the Burn Meter can price
  // it at a flat per-image estimate (any key).
  limiter.recordUsage(DEFAULT_PROVIDER_ID, 'image', 0, { model: IMAGE_MODEL });
  return { dataUrl: `data:${mimeType};base64,${img.data}`, mimeType };
}
