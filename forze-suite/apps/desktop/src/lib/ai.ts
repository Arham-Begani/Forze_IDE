import type { Message, Provider } from '@forze/agents';
import { useAgents } from '../workbench/agentStore';
import {
  DEFAULT_PROVIDER_ID,
  PROVIDERS,
  defaultModelFor,
  isProviderReady,
  providerForId,
  resolveApiKey,
} from '../workbench/aiConfig';

export interface GenerateTextOptions {
  /** System / role instruction. */
  system?: string;
  /** Override the model id (defaults to the provider's default). */
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Called with each streamed delta, for live UIs. */
  onDelta?: (delta: string) => void;
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

/**
 * One-shot text generation against whichever provider is configured. Collects
 * the streamed response into a single string. Throws a friendly error when no
 * provider key is available so callers can surface a toast.
 */
export async function generateText(
  prompt: string,
  options: GenerateTextOptions = {},
): Promise<string> {
  const provider = activeProvider();
  if (!provider) {
    throw new Error('No AI model is connected. Add a key in Settings → Agent providers.');
  }
  const keys = useAgents.getState().apiKeys;
  const apiKey = resolveApiKey(provider.id, keys);
  const model = options.model ?? defaultModelFor(provider.id);

  const messages: Message[] = [
    { id: crypto.randomUUID(), role: 'user', content: prompt, createdAt: Date.now() },
  ];

  let out = '';
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
    if (chunk.done) break;
  }
  return out.trim();
}
