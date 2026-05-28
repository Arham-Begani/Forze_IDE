import type { GenerateOptions, Provider, ProviderModel, StreamChunk } from '../types.js';

export const id = 'anthropic';
export const label = 'Anthropic';

export const models: ProviderModel[] = [
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', contextWindow: 200_000 },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', contextWindow: 200_000 },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', contextWindow: 200_000 },
];

/**
 * Streaming generation against /v1/messages.
 *
 * Implementation notes:
 *  - We use the SSE stream format Anthropic returns when `stream: true`.
 *  - The browser fetch in the Tauri webview bypasses CORS as long as the API
 *    origin is allowlisted in the app's CSP. The IDE adds api.anthropic.com to
 *    `connect-src` for that reason.
 *  - We deliberately avoid the official SDK so the desktop bundle stays slim
 *    and we don't pull in Node-only dependencies.
 */
export async function* generate(
  options: GenerateOptions,
): AsyncIterable<StreamChunk> {
  const body = {
    model: options.model,
    max_tokens: options.maxTokens ?? 2048,
    system: options.systemPrompt || undefined,
    messages: options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Anthropic ${response.status}: ${text || response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error('Anthropic returned an empty stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let stopReason: string | undefined;
  let usage: StreamChunk['usage'];

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by blank lines.
      let separator = buffer.indexOf('\n\n');
      while (separator !== -1) {
        const rawEvent = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const dataLines = rawEvent
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim());
        for (const dataLine of dataLines) {
          if (!dataLine || dataLine === '[DONE]') continue;
          try {
            const parsed = JSON.parse(dataLine) as AnthropicStreamEvent;
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              yield { delta: parsed.delta.text ?? '', done: false };
            } else if (parsed.type === 'message_delta') {
              if (parsed.delta?.stop_reason) stopReason = parsed.delta.stop_reason;
              if (parsed.usage) {
                usage = {
                  inputTokens: parsed.usage.input_tokens,
                  outputTokens: parsed.usage.output_tokens,
                };
              }
            } else if (parsed.type === 'message_stop') {
              // emitted once after the message_delta with stop_reason
            }
          } catch {
            /* skip malformed event */
          }
        }
        separator = buffer.indexOf('\n\n');
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }

  yield { delta: '', done: true, stopReason, usage };
}

export const provider: Provider = {
  id,
  label,
  models,
  generate,
};

// --- internal SSE event shape ----------------------------------------------

interface AnthropicStreamEvent {
  type: string;
  delta?: {
    type?: string;
    text?: string;
    stop_reason?: string;
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}
