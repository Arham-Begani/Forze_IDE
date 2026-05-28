import { z } from 'zod';

/**
 * Common diagnostic types streamed from the Tauri sidecar to the Monaco
 * editor. The IDE parses dev-server-log lines and tries to match them against
 * a handful of well-known stack-trace patterns.
 */
export const StackTraceLineSchema = z.object({
  filePath: z.string().min(1),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  message: z.string().min(1),
  severity: z.enum(['error', 'warning', 'info']).default('error'),
});

export type StackTraceLine = z.infer<typeof StackTraceLineSchema>;

// Matches Vite / Next.js style: at src/app/page.tsx:42:7
const VITE_FRAME = /(?:at\s+)?([\w./\\-]+\.(?:tsx?|jsx?|mjs|cjs)):(\d+):(\d+)/;

export function parseStackTraceLine(raw: string): StackTraceLine | null {
  const match = raw.match(VITE_FRAME);
  if (!match) return null;

  const [, filePath, lineStr, columnStr] = match;
  if (!filePath || !lineStr || !columnStr) return null;

  const line = Number.parseInt(lineStr, 10);
  const column = Number.parseInt(columnStr, 10);
  if (!Number.isFinite(line) || !Number.isFinite(column)) return null;

  return StackTraceLineSchema.parse({
    filePath,
    line,
    column,
    message: raw.trim(),
    severity: /error/i.test(raw) ? 'error' : /warn/i.test(raw) ? 'warning' : 'info',
  });
}
