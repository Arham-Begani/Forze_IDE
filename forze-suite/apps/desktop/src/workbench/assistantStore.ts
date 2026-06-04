import { create } from 'zustand';
import {
  activeProvider,
  assistantMsg,
  streamConversation,
  userMsg,
} from '../lib/ai';
import { findDestination, navManifest } from '../lib/assistantNav';

/**
 * State + engine for the Forze Assistant (the floating chat bubble). Kept in a
 * store rather than the component so every "Ask Forze" surface — the command
 * bar, the Welcome launchpad, Dashboard quick actions — funnels into the same
 * visible conversation. The model can answer, or end a turn with a small JSON
 * action block telling us which part of the IDE to open; we strip that block
 * from what the user reads and run the navigation here.
 */

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

const GREETING =
  "Hi — I'm your Forze guide. Tell me what you want to do and I'll take you there " +
  '(“build a feature”, “post about my launch”, “deploy”…), or just ask me what to do next.';

const SYSTEM =
  'You are the Forze Assistant, a warm, concise in-app guide for Forze IDE — a ' +
  '"builder OS" for solo founders who vibe-code. You help the user decide what to ' +
  'do and you can NAVIGATE the app for them.\n\n' +
  'When the user wants to go somewhere or do something in the app, OPEN it for ' +
  'them: end your reply with exactly one fenced json block of the shape ' +
  '{"actions":[{"open":"<destination-id>"}]} (you may list several). Always also ' +
  'write one short, friendly sentence of prose before the block — the prose is ' +
  'shown to the user, the json is hidden and executed. If the user only wants ' +
  'advice or information, answer in 1–3 sentences with NO json block.\n\n' +
  'Destinations you can open (use the exact id):\n' +
  navManifest() +
  '\n\nGuidance: be decisive and brief. If a request maps to a destination, open ' +
  'it rather than describing how to find it. The headline feature is the Agent ' +
  'Manager — when the user wants to build, change, or ship something in their ' +
  'code, take them there. Never invent destinations or ids.';

/** Strip the hidden json action block(s) so the user only reads the prose. */
function visibleText(raw: string): string {
  return raw
    .replace(/```json[\s\S]*?```/gi, '')
    .replace(/```json[\s\S]*$/i, '') // unclosed block mid-stream
    .replace(/\{\s*"actions"[\s\S]*$/i, '') // bare json mid-stream
    .trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function collectIds(parsed: unknown): string[] {
  const list: unknown[] = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed)
      ? Array.isArray(parsed.actions)
        ? parsed.actions
        : 'open' in parsed || 'target' in parsed
          ? [parsed]
          : []
      : [];
  const ids: string[] = [];
  for (const item of list) {
    if (typeof item === 'string') ids.push(item);
    else if (isRecord(item)) {
      const id = item.open ?? item.target ?? item.id ?? item.destination;
      if (typeof id === 'string') ids.push(id);
    }
  }
  return ids;
}

/** Pull destination ids out of the model's action block. Tolerant of shapes. */
function parseNavActions(raw: string): string[] {
  const fences = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  const candidates = fences.length ? [fences[fences.length - 1]![1]!] : [raw];
  for (const candidate of candidates) {
    const body = candidate.trim();
    const start = body.search(/[[{]/);
    if (start === -1) continue;
    const close = body[start] === '[' ? ']' : '}';
    const end = body.lastIndexOf(close);
    if (end <= start) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.slice(start, end + 1));
    } catch {
      continue;
    }
    const ids = collectIds(parsed);
    if (ids.length) return ids;
  }
  return [];
}

interface AssistantState {
  messages: AssistantMessage[];
  streaming: boolean;
  /** Send a user message, stream the reply, then run any navigation it asked for. */
  send: (text: string) => Promise<void>;
  /** Append a plain assistant note (used by the instant quick-open chips). */
  pushNote: (content: string) => void;
  stop: () => void;
  reset: () => void;
}

// One in-flight stream at a time; the controller lives outside state so it's
// never serialized or compared during renders.
let controller: AbortController | null = null;

export const useAssistant = create<AssistantState>((set, get) => ({
  messages: [{ role: 'assistant', content: GREETING }],
  streaming: false,

  pushNote: (content) =>
    set((s) => ({ messages: [...s.messages, { role: 'assistant', content }] })),

  stop: () => controller?.abort(),

  reset: () =>
    set({ messages: [{ role: 'assistant', content: GREETING }], streaming: false }),

  send: async (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().streaming) return;

    if (!activeProvider()) {
      set((s) => ({
        messages: [
          ...s.messages,
          { role: 'user', content: trimmed },
          {
            role: 'assistant',
            content: 'Add an AI key in Settings → Agent providers and I can start helping.',
          },
        ],
      }));
      return;
    }

    const history = [...get().messages, { role: 'user' as const, content: trimmed }];
    set({ messages: [...history, { role: 'assistant', content: '' }], streaming: true });

    controller = new AbortController();

    // Build the provider conversation (drop the seeded greeting).
    const convo = history
      .filter((m, i) => !(i === 0 && m.role === 'assistant'))
      .map((m) => (m.role === 'user' ? userMsg(m.content) : assistantMsg(m.content)));

    const replaceLast = (content: string) =>
      set((s) => {
        const next = [...s.messages];
        next[next.length - 1] = { role: 'assistant', content };
        return { messages: next };
      });

    let full = '';
    try {
      await streamConversation(convo, {
        system: SYSTEM,
        maxTokens: 900,
        signal: controller.signal,
        onDelta: (delta) => {
          full += delta;
          replaceLast(visibleText(full));
        },
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const message = err instanceof Error ? err.message : String(err);
        replaceLast(`Sorry — ${message}`);
      }
      set({ streaming: false });
      controller = null;
      return;
    }

    // Finalise the visible prose, then perform any navigation it requested.
    const opened: string[] = [];
    for (const id of parseNavActions(full)) {
      const dest = findDestination(id);
      if (dest) {
        void dest.run();
        opened.push(dest.label);
      }
    }
    const shown = visibleText(full);
    replaceLast(shown || (opened.length ? `Opening ${opened.join(' and ')}.` : '…'));
    set({ streaming: false });
    controller = null;
  },
}));
