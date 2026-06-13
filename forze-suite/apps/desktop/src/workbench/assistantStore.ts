import { create } from 'zustand';
import {
  activeProvider,
  assistantMsg,
  streamConversation,
  userMsg,
} from '../lib/ai';
import { findDestination, navManifest } from '../lib/assistantNav';
import { actionManifest, findAction } from '../lib/assistantActions';
import { parseWhen } from '../lib/parseWhen';
import { usePromptSchedule } from './promptScheduleStore';
import {
  parseStationLabel,
  stationManifest,
  targetLabel,
  useVibeStations,
} from './vibeStationsStore';

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

const SYSTEM_BASE =
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

const SCHEDULE_DOCS =
  '\n\nYou can also SCHEDULE a prompt to run later on a Vibe Station (a coding-agent ' +
  'CLI terminal like Claude Code). When the user asks for this — e.g. "tell Claude ' +
  'Code #1 to run \'fix the tests\' at 9pm" — add a schedule action to the same json ' +
  'block: {"actions":[{"schedule":{"station":"Claude Code #1","prompt":"<the exact ' +
  'prompt to run, verbatim>","when":"9pm"}}]}. Rules: copy the prompt text exactly as ' +
  'the user gave it; "station" must name one of the stations below (or another like ' +
  '"Codex #2" — if it isn\'t open yet it will be auto-started); "when" is a short, ' +
  'literal time phrase ("9pm", "21:00", "in 30 minutes", "tomorrow 9am") — do NOT ' +
  'convert it to a date yourself, just pass the phrase. Still write one friendly ' +
  'sentence of prose before the block.\n\nVibe Stations currently open:\n';

const ACTION_DOCS =
  '\n\nYou can also DO things, not just navigate. To act, add actions to the same ' +
  'json block: {"actions":[{"action":"<verb>","args":{…}}]}. You may mix several ' +
  'actions and an {"open":"<id>"} in one block. Always still write one short, ' +
  'friendly sentence of prose before the block. Some actions ask the user to ' +
  'confirm before they run — that is handled for you; just emit them and tell the ' +
  'user what you are about to do. Available actions:\n' +
  actionManifest();

/** Built per-turn so the live list of open Vibe Stations is always current. */
function buildSystem(): string {
  return (
    SYSTEM_BASE +
    ACTION_DOCS +
    SCHEDULE_DOCS +
    stationManifest(useVibeStations.getState().stations)
  );
}

/** Strip the hidden json action block(s) so the user only reads the prose. */
function visibleText(raw: string): string {
  return raw
    .replace(/```json[\s\S]*?```/gi, '')
    .replace(/```json[\s\S]*$/i, '') // unclosed block mid-stream
    .replace(/\{\s*"(?:actions|schedule|open)"[\s\S]*$/i, '') // bare json mid-stream
    .trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export interface ScheduleAction {
  station: string;
  prompt: string;
  when: string;
}

/** A verb the model asked the manager to perform (see lib/assistantActions). */
export interface AssistantActionCall {
  name: string;
  args: Record<string, unknown>;
}

interface ParsedActions {
  navIds: string[];
  schedules: ScheduleAction[];
  actions: AssistantActionCall[];
}

/** Split a parsed action payload into nav ids, schedule actions, and verbs.
 *  Tolerant of shapes: a bare action object, an array, or an `{actions:[...]}`
 *  wrapper. */
function collectActions(parsed: unknown): ParsedActions {
  const list: unknown[] = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed)
      ? Array.isArray(parsed.actions)
        ? parsed.actions
        : 'open' in parsed || 'target' in parsed || 'schedule' in parsed || 'action' in parsed
          ? [parsed]
          : []
      : [];
  const navIds: string[] = [];
  const schedules: ScheduleAction[] = [];
  const actions: AssistantActionCall[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      navIds.push(item);
    } else if (isRecord(item)) {
      if (isRecord(item.schedule)) {
        const s = item.schedule;
        if (typeof s.station === 'string' && typeof s.prompt === 'string') {
          schedules.push({
            station: s.station,
            prompt: s.prompt,
            when: typeof s.when === 'string' ? s.when : '',
          });
        }
        continue;
      }
      const verb = item.action ?? item.verb ?? item.do;
      if (typeof verb === 'string') {
        actions.push({ name: verb, args: isRecord(item.args) ? item.args : {} });
        continue;
      }
      const id = item.open ?? item.target ?? item.id ?? item.destination;
      if (typeof id === 'string') navIds.push(id);
    }
  }
  return { navIds, schedules, actions };
}

/** Pull nav + schedule actions out of the model's json block. Tolerant of shapes. */
function parseActions(raw: string): ParsedActions {
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
    const result = collectActions(parsed);
    if (result.navIds.length || result.schedules.length || result.actions.length) return result;
  }
  return { navIds: [], schedules: [], actions: [] };
}

/** Format an epoch ms as a short local time for the confirmation line. */
function formatWhen(ms: number): string {
  const d = new Date(ms);
  const sameDay = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

/** Apply the schedule actions; returns confirmation/help lines to show the user. */
function runScheduleActions(actions: ScheduleAction[]): string[] {
  const lines: string[] = [];
  for (const action of actions) {
    const target = parseStationLabel(action.station);
    if (!target) {
      lines.push(`I couldn't tell which station "${action.station}" means.`);
      continue;
    }
    const prompt = action.prompt.trim();
    if (!prompt) continue;
    const when = parseWhen(action.when);
    if (when === null) {
      lines.push(`When should I run that on ${targetLabel(target)}? Try "9pm" or "in 30 minutes".`);
      continue;
    }
    usePromptSchedule.getState().schedule(target, prompt, when);
    lines.push(`Scheduled on ${targetLabel(target)} for ${formatWhen(when)}.`);
  }
  return lines;
}

/** A high-impact action staged behind a confirm chip in the chat. */
export interface PendingAction {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** Human label shown on the confirm chip. */
  label: string;
}

interface AssistantState {
  messages: AssistantMessage[];
  streaming: boolean;
  /** High-impact actions awaiting a one-tap confirm. */
  pendingActions: PendingAction[];
  /** Send a user message, stream the reply, then run any navigation it asked for. */
  send: (text: string) => Promise<void>;
  /** Append a plain assistant note (used by the instant quick-open chips). */
  pushNote: (content: string) => void;
  /** Run a staged high-impact action and report the result in chat. */
  confirmAction: (id: string) => Promise<void>;
  /** Drop a staged action without running it. */
  dismissAction: (id: string) => void;
  stop: () => void;
  reset: () => void;
}

// One in-flight stream at a time; the controller lives outside state so it's
// never serialized or compared during renders.
let controller: AbortController | null = null;

export const useAssistant = create<AssistantState>((set, get) => ({
  messages: [{ role: 'assistant', content: GREETING }],
  streaming: false,
  pendingActions: [],

  pushNote: (content) =>
    set((s) => ({ messages: [...s.messages, { role: 'assistant', content }] })),

  confirmAction: async (id) => {
    const action = get().pendingActions.find((a) => a.id === id);
    if (!action) return;
    set((s) => ({ pendingActions: s.pendingActions.filter((a) => a.id !== id) }));
    const def = findAction(action.name);
    if (!def) return;
    let line: string;
    try {
      line = await def.run(action.args);
    } catch (err) {
      line = `Couldn't do that — ${err instanceof Error ? err.message : String(err)}`;
    }
    set((s) => ({ messages: [...s.messages, { role: 'assistant', content: line }] }));
  },

  dismissAction: (id) =>
    set((s) => {
      const action = s.pendingActions.find((a) => a.id === id);
      return {
        pendingActions: s.pendingActions.filter((a) => a.id !== id),
        messages: action
          ? [...s.messages, { role: 'assistant', content: `Okay — skipped: ${action.label}.` }]
          : s.messages,
      };
    }),

  stop: () => controller?.abort(),

  reset: () =>
    set({ messages: [{ role: 'assistant', content: GREETING }], streaming: false, pendingActions: [] }),

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
        system: buildSystem(),
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

    // Finalise the visible prose, then perform the navigation / scheduling /
    // actions it asked for.
    const { navIds, schedules, actions } = parseActions(full);
    const opened: string[] = [];
    for (const id of navIds) {
      const dest = findDestination(id);
      if (dest) {
        void dest.run();
        opened.push(dest.label);
      }
    }
    const scheduleLines = runScheduleActions(schedules);

    // Instant actions run now; high-impact ones are staged behind a confirm chip.
    const actionLines: string[] = [];
    const pending: PendingAction[] = [];
    for (const call of actions) {
      const def = findAction(call.name);
      if (!def) continue;
      if (def.impact === 'instant') {
        try {
          actionLines.push(await def.run(call.args));
        } catch (err) {
          actionLines.push(`Couldn't ${call.name} — ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        pending.push({
          id: crypto.randomUUID(),
          name: call.name,
          args: call.args,
          label: def.describe(call.args),
        });
      }
    }

    const shown = visibleText(full);
    const extras = [...scheduleLines, ...actionLines];
    let message: string;
    if (shown) {
      message = extras.length ? `${shown}\n\n${extras.join('\n')}` : shown;
    } else if (extras.length) {
      message = extras.join('\n');
    } else if (opened.length) {
      message = `Opening ${opened.join(' and ')}.`;
    } else if (pending.length) {
      message = 'Confirm below to go ahead.';
    } else {
      message = '…';
    }
    replaceLast(message);
    set((s) => ({
      streaming: false,
      pendingActions: pending.length ? [...s.pendingActions, ...pending] : s.pendingActions,
    }));
    controller = null;
  },
}));
