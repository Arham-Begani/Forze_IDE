import type { GenerateOptions, Provider, ProviderModel, StreamChunk } from '../types.js';

export const id = 'gemini';
export const label = 'Google Gemini';

export const models: ProviderModel[] = [
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', contextWindow: 2_000_000 },
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

  // Gemini 3.x Pro is a *thinking* model: its internal reasoning tokens are
  // billed against maxOutputTokens. With a small cap (callers pass 1024–2048)
  // and default thinking, the model can spend the whole budget reasoning and
  // emit zero visible-text parts — a 200 response with finishReason=MAX_TOKENS
  // and no content, which reads to callers as an "empty response". We keep
  // thinking low and enforce a floor large enough to leave room for the answer
  // even on the multi-turn agent loop where reasoning scales with context.
  const maxOutputTokens = Math.max(options.maxTokens ?? 2048, 8192);
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens,
      thinkingConfig: { thinkingLevel: 'low' },
    },
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
  let emittedText = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      // Strip CR: this endpoint delimits SSE events with CRLF (`\r\n\r\n`), but
      // we split on `\n\n`. Without this the separator is never found, no event
      // is ever parsed, and every response comes back empty. `\r` is never
      // meaningful inside SSE data, so dropping it wholesale is safe.
      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');

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
                  emittedText = true;
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

  // A 200 with no text is almost always MAX_TOKENS (thinking ate the budget) or
  // a SAFETY/RECITATION block. Surface the real reason instead of silently
  // returning an empty string, which callers misread as a rate-limit/filter.
  if (!emittedText) {
    if (stopReason === 'MAX_TOKENS') {
      throw new Error(
        'Gemini hit the output-token limit before producing any text — the ' +
          "model's reasoning used the whole budget. Raise maxTokens or lower the " +
          'thinking level.',
      );
    }
    if (stopReason && stopReason !== 'STOP') {
      throw new Error(`Gemini produced no text (finishReason: ${stopReason}).`);
    }
  }

  yield { delta: '', done: true, stopReason, usage };
}

export const provider: Provider = { id, label, models, generate };

export interface VisionOptions {
  apiKey: string;
  /** Defaults to gemini-3.1-pro-preview. */
  model?: string;
  /** Instruction describing what to produce from the image. */
  prompt: string;
  /** Base64-encoded image bytes (no `data:` prefix). */
  imageBase64: string;
  /** e.g. "image/png". */
  mimeType: string;
  signal?: AbortSignal;
  maxTokens?: number;
}

/**
 * One-shot multimodal generation: send an image + prompt, get text back.
 * Non-streaming (`:generateContent`) because callers (e.g. Vibe Canvas) want
 * the whole result before inserting it. Throws on a non-2xx response.
 */
export async function generateVision(options: VisionOptions): Promise<string> {
  const model = options.model ?? 'gemini-3.1-pro-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(options.apiKey)}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: options.prompt },
          {
            inline_data: {
              mime_type: options.mimeType,
              data: options.imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: options.maxTokens ?? 4096 },
  };

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

  const json = (await response.json()) as GeminiGenerateResponse;
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => p.text ?? '')
    .join('')
    .trim();
  if (!text) throw new Error('Gemini returned no content for the image.');
  return text;
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

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
