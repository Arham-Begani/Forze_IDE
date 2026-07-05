import type { Message } from '@forze/agents';
import { assistantMsg, streamConversation, userMsg } from '../lib/ai';
import { subscribeToPtyOutput } from '../lib/pty';
import type { AutopilotMission } from './promptScheduleStore';

/**
 * The brain of Autopilot scheduling: given a mission's vision, the prompts
 * already sent, and the station's recent terminal output, ask the model for
 * the SINGLE next instruction to type into the coding-agent CLI. Pure helpers
 * live here (testable without a provider); the delivery loop that calls them
 * is in `promptScheduler.ts`.
 */

/** The model signals the vision is achieved by replying with this token. */
export const DONE_TOKEN = 'MISSION_COMPLETE';

/** Longest instruction we'll type into a CLI (keeps prompts one-screen sane). */
export const MAX_PROMPT_CHARS = 700;

const SYSTEM_PROMPT =
  'You drive a coding-agent CLI (Claude Code, Codex, or similar) toward a ' +
  "user's vision, one instruction at a time. Each turn you see the vision, the " +
  'instructions already sent, and the recent terminal output. Reply with ONLY ' +
  'the next instruction to type into the CLI: plain text, a single line, no ' +
  'markdown, no quotes around it, no explanations, under ' +
  `${MAX_PROMPT_CHARS} characters. Build on what has happened — advance the ` +
  'vision, fix what the output shows is broken, or verify what was just ' +
  'built. Never repeat an instruction that already succeeded. If the terminal ' +
  'output shows the vision is fully achieved, reply with exactly ' +
  `${DONE_TOKEN} and nothing else.`;

/**
 * Build the conversation for the next-step generation. Prior sent prompts are
 * replayed as assistant turns so the model naturally avoids repeating itself.
 */
export function buildAutopilotMessages(
  mission: Pick<AutopilotMission, 'vision' | 'history' | 'runsDone' | 'maxRuns'>,
  terminalTail: string,
): { system: string; messages: Message[] } {
  const messages: Message[] = [
    userMsg(
      `MY VISION for this coding session:\n${mission.vision}\n\n` +
        `You may send up to ${mission.maxRuns} instructions total; ` +
        `${mission.runsDone} have been sent so far. Give me instruction #${
          mission.runsDone + 1
        }.`,
    ),
  ];
  for (const step of mission.history) {
    messages.push(assistantMsg(step.prompt));
    messages.push(
      userMsg(
        'That instruction was typed into the CLI. Continue when you see the ' +
          'next terminal snapshot.',
      ),
    );
  }
  messages.push(
    userMsg(
      terminalTail.trim()
        ? `RECENT TERMINAL OUTPUT (most recent last):\n\`\`\`\n${terminalTail}\n\`\`\`\n\n` +
            `Reply with the single next instruction (or ${DONE_TOKEN}).`
        : `No terminal output captured yet. Reply with the single next ` +
            `instruction (or ${DONE_TOKEN}).`,
    ),
  );
  return { system: SYSTEM_PROMPT, messages };
}

/**
 * True when the model says the vision is achieved. The reply must BEGIN with
 * the token (after any markdown/quote wrapping) — an instruction that merely
 * mentions it mid-sentence still counts as an instruction.
 */
export function isDoneReply(raw: string): boolean {
  return raw
    .trim()
    .replace(/^[*_`'"\s]+/, '')
    .toUpperCase()
    .startsWith(DONE_TOKEN);
}

/**
 * Normalize a model reply into something safe to type into a CLI: strip code
 * fences and surrounding quotes, drop "Prompt:"-style prefixes, collapse to a
 * single line (Enter submits in agent CLIs), and cap the length.
 */
export function sanitizePrompt(raw: string): string {
  let text = raw.trim();
  // Unwrap a fenced block (```...```), keeping only its contents.
  const fence = /^```[a-z]*\n?([\s\S]*?)\n?```$/i.exec(text);
  if (fence) text = fence[1]!.trim();
  // Drop a leading label the model sometimes adds.
  text = text.replace(/^(?:prompt|instruction|next(?: step)?)\s*[:\-–]\s*/i, '');
  // Unwrap symmetric quotes.
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('`') && text.endsWith('`'))
  ) {
    text = text.slice(1, -1).trim();
  }
  // A newline would submit early — collapse to one line.
  text = text.replace(/\s*\r?\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (text.length > MAX_PROMPT_CHARS) {
    text = `${text.slice(0, MAX_PROMPT_CHARS - 1).trimEnd()}…`;
  }
  return text;
}

/**
 * Ask the model for the mission's next instruction. Returns the sanitized
 * instruction, or null when the model judges the vision complete. Throws on
 * provider/limit errors — the caller records the failure.
 */
export async function generateNextPrompt(
  mission: Pick<AutopilotMission, 'vision' | 'history' | 'runsDone' | 'maxRuns'>,
  terminalTail: string,
): Promise<string | null> {
  const { system, messages } = buildAutopilotMessages(mission, terminalTail);
  const raw = await streamConversation(messages, {
    system,
    maxTokens: 400,
    module: 'scheduler',
  });
  if (isDoneReply(raw)) return null;
  const prompt = sanitizePrompt(raw);
  if (!prompt) throw new Error('The model returned an empty instruction.');
  return prompt;
}

// ---- Terminal output tail --------------------------------------------------
// A bounded per-session ring of recent pty output, so prompt generation can
// see what the coding agent actually did. One global subscription, wired by
// the scheduler; sessions that die just age out of the map.

interface TailEntry {
  raw: string;
  lastActivityAt: number;
}

/** Raw bytes kept per session (pre-ANSI-strip); ~a few screenfuls. */
const TAIL_CAP = 8_000;
/** Most sessions tracked at once — matches the station cap with headroom. */
const MAX_TAILS = 16;

const tails = new Map<string, TailEntry>();
let unsubscribeTail: (() => void) | null = null;

/** Start capturing output tails. Idempotent; returns a stop function. */
export function wireOutputTails(): () => void {
  if (unsubscribeTail) return stopOutputTails;
  void subscribeToPtyOutput((payload) => {
    const entry = tails.get(payload.session_id) ?? { raw: '', lastActivityAt: 0 };
    entry.raw = (entry.raw + payload.data).slice(-TAIL_CAP);
    entry.lastActivityAt = Date.now();
    tails.set(payload.session_id, entry);
    if (tails.size > MAX_TAILS) {
      // Evict the longest-idle session.
      let oldest: string | null = null;
      let oldestAt = Infinity;
      for (const [id, t] of tails) {
        if (t.lastActivityAt < oldestAt) {
          oldestAt = t.lastActivityAt;
          oldest = id;
        }
      }
      if (oldest) tails.delete(oldest);
    }
  }).then((unsub) => {
    unsubscribeTail = unsub;
  });
  return stopOutputTails;
}

function stopOutputTails(): void {
  unsubscribeTail?.();
  unsubscribeTail = null;
  tails.clear();
}

/** When the session last produced output (0 = never seen). */
export function lastOutputAt(sessionId: string): number {
  return tails.get(sessionId)?.lastActivityAt ?? 0;
}

/** The session's recent output as clean plain text (ANSI stripped, last lines). */
export function outputTail(sessionId: string, maxLines = 40): string {
  const raw = tails.get(sessionId)?.raw ?? '';
  return cleanTerminalText(raw, maxLines);
}

/**
 * Strip ANSI escape sequences + control characters and keep the last
 * `maxLines` non-empty lines. Spinner redraws collapse away because carriage
 * returns are treated as line breaks and blank lines are dropped.
 */
export function cleanTerminalText(raw: string, maxLines = 40): string {
  /* eslint-disable no-control-regex */
  const noAnsi = raw
    // OSC sequences (window-title sets etc.): ESC ] … (BEL | ESC \)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
    // CSI sequences (colors, cursor moves): ESC [ params final-byte.
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    // Any other two-byte escape (charset selects etc.).
    .replace(/\x1b[@-_]/g, '')
    // Remaining control chars except \t, \n, \r (kept as separators).
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  /* eslint-enable no-control-regex */
  const lines = noAnsi
    .split(/[\r\n]+/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  return lines.slice(-maxLines).join('\n');
}
