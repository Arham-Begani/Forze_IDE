import type { GenerateOptions, Provider, ProviderModel, StreamChunk } from '../types.js';

export const id = 'gemini';
export const label = 'Google Gemini';

export const models: ProviderModel[] = [
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', contextWindow: 2_000_000 },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', contextWindow: 1_000_000 },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', contextWindow: 1_000_000 },
];

/**
 * Streaming generation against generativelanguage.googleapis.com.
 *
 * Implementation notes:
 *  - Uses streamGenerateContent with alt=sse for SSE chunks.
 *  - System prompt is folded into the request as `system_instruction`.
 *  - Anthropic-style `assistant` role maps to Gemini's `model` role.
 *  - The Tauri webview's CSP allowlists generativelanguage.googleapis.com.
 */
export async function* generate(
  options: GenerateOptions,
): AsyncIterable<StreamChunk> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    options.model,
  )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(options.apiKey)}`;

  const contents = options.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: options.maxTokens ?? 2048 },
  };
  if (options.systemPrompt) {
    body.system_instruction = { parts: [{ text: options.systemPrompt }] };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini ${response.status}: ${text || response.statusText}`);
  }
  if (!response.body) throw new Error('Gemini returned an empty stream');

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
            const parsed = JSON.parse(dataLine) as GeminiStreamEvent;
            const cands = parsed.candidates ?? [];
            for (const cand of cands) {
              const parts = cand.content?.parts ?? [];
              for (const part of parts) {
                if (typeof part.text === 'string' && part.text.length > 0) {
                  yield { delta: part.text, done: false };
                }
              }
              if (cand.finishReason) stopReason = cand.finishReason;
            }
            if (parsed.usageMetadata) {
              usage = {
                inputTokens: parsed.usageMetadata.promptTokenCount,
                outputTokens: parsed.usageMetadata.candidatesTokenCount,
              };
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

export const provider: Provider = { id, label, models, generate };

interface GeminiStreamEvent {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}
