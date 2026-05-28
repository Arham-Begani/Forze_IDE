import { z } from 'zod';

export const RoleSchema = z.enum(['system', 'user', 'assistant']);
export type Role = z.infer<typeof RoleSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  role: RoleSchema,
  content: z.string(),
  createdAt: z.number().int().nonnegative(),
});
export type Message = z.infer<typeof MessageSchema>;

export interface GenerateOptions {
  model: string;
  apiKey: string;
  systemPrompt?: string;
  messages: Message[];
  /** Optional cancellation signal. */
  signal?: AbortSignal;
  /** Maximum tokens for the assistant reply. */
  maxTokens?: number;
}

export interface StreamChunk {
  /** Incremental text appended to the assistant message. */
  delta: string;
  /** True on the final chunk. */
  done: boolean;
  /** Stop reason if provided by the provider on the final chunk. */
  stopReason?: string;
  /** Provider-supplied input/output token counts (final chunk only). */
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface Provider {
  /** Name of the provider, e.g. "anthropic". */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Models exposed by this provider for selection. */
  models: ProviderModel[];
  /** Streaming generation. */
  generate(options: GenerateOptions): AsyncIterable<StreamChunk>;
}

export interface ProviderModel {
  id: string;
  label: string;
  /** Maximum context window in tokens, for budgeting. */
  contextWindow: number;
}

export interface AgentPreset {
  id: string;
  label: string;
  description: string;
  systemPrompt: string;
  /** MCP tool ids the preset should request access to (advisory for now). */
  recommendedTools: string[];
}
