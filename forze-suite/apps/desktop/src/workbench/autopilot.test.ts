import { describe, expect, it } from 'vitest';
import {
  DONE_TOKEN,
  MAX_PROMPT_CHARS,
  buildAutopilotMessages,
  cleanTerminalText,
  isDoneReply,
  sanitizePrompt,
} from './autopilot';
import {
  FAILURE_PAUSE_THRESHOLD,
  HISTORY_LIMIT,
  MAX_INTERVAL_MIN,
  MAX_MAX_RUNS,
  usePromptSchedule,
} from './promptScheduleStore';

const TARGET = { agentId: 'claude' as const, ordinal: 1 };

/** Reset the (in-memory) schedule store between tests. */
function resetStore(): void {
  usePromptSchedule.setState({ prompts: [], autopilots: [] });
}

describe('sanitizePrompt', () => {
  it('unwraps code fences and quotes', () => {
    expect(sanitizePrompt('```\nfix the failing tests\n```')).toBe('fix the failing tests');
    expect(sanitizePrompt('"add a dark mode toggle"')).toBe('add a dark mode toggle');
    expect(sanitizePrompt('`npm run lint`')).toBe('npm run lint');
  });

  it('drops leading labels the model adds', () => {
    expect(sanitizePrompt('Prompt: build the pricing page')).toBe('build the pricing page');
    expect(sanitizePrompt('Next step - wire up the form')).toBe('wire up the form');
  });

  it('collapses newlines so Enter cannot submit early', () => {
    expect(sanitizePrompt('do this\nthen that\r\nthen verify')).toBe(
      'do this then that then verify',
    );
  });

  it('caps very long instructions', () => {
    const long = 'a'.repeat(MAX_PROMPT_CHARS * 2);
    expect(sanitizePrompt(long).length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
  });
});

describe('isDoneReply', () => {
  it('accepts the token, with wrapping and trailing prose', () => {
    expect(isDoneReply(DONE_TOKEN)).toBe(true);
    expect(isDoneReply(`  **${DONE_TOKEN}**`)).toBe(true);
    expect(isDoneReply(`${DONE_TOKEN} — the vision is achieved.`)).toBe(true);
    expect(isDoneReply(DONE_TOKEN.toLowerCase())).toBe(true);
  });

  it('rejects instructions that merely mention the token', () => {
    expect(isDoneReply(`print ${DONE_TOKEN} when finished`)).toBe(false);
    expect(isDoneReply('keep polishing the landing page')).toBe(false);
  });
});

describe('buildAutopilotMessages', () => {
  const mission = {
    vision: 'Build a landing page with pricing',
    history: [
      { prompt: 'scaffold the page', sentAt: 1 },
      { prompt: 'add the pricing table', sentAt: 2 },
    ],
    runsDone: 2,
    maxRuns: 10,
  };

  it('includes the vision, step budget, and terminal tail', () => {
    const { system, messages } = buildAutopilotMessages(mission, 'tests passed');
    expect(system).toContain(DONE_TOKEN);
    const first = messages[0]!.content;
    expect(first).toContain('Build a landing page with pricing');
    expect(first).toContain('instruction #3');
    const last = messages[messages.length - 1]!.content;
    expect(last).toContain('tests passed');
  });

  it('replays sent prompts as assistant turns so the model will not repeat them', () => {
    const { messages } = buildAutopilotMessages(mission, '');
    const assistantTurns = messages.filter((m) => m.role === 'assistant');
    expect(assistantTurns.map((m) => m.content)).toEqual([
      'scaffold the page',
      'add the pricing table',
    ]);
  });
});

describe('cleanTerminalText', () => {
  it('strips ANSI colors, OSC titles and control chars', () => {
    const raw = '\x1b]0;my-title\x07\x1b[31mERROR\x1b[0m something broke\x1b[2K';
    expect(cleanTerminalText(raw)).toBe('ERROR something broke');
  });

  it('collapses spinner redraws and keeps the last lines', () => {
    const raw = 'working.\rworking..\rworking...\nDone in 3s\n\n\n';
    const out = cleanTerminalText(raw, 2);
    expect(out).toBe('working...\nDone in 3s');
  });
});

describe('autopilot store transitions', () => {
  it('clamps interval and step budget on add', () => {
    resetStore();
    const id = usePromptSchedule
      .getState()
      .addAutopilot(TARGET, '  my vision  ', { intervalMin: 99_999, maxRuns: 9_999 });
    const a = usePromptSchedule.getState().autopilots.find((x) => x.id === id)!;
    expect(a.vision).toBe('my vision');
    expect(a.intervalMin).toBe(MAX_INTERVAL_MIN);
    expect(a.maxRuns).toBe(MAX_MAX_RUNS);
    expect(a.status).toBe('active');
  });

  it('records sent steps, schedules the next run, and finishes at the budget', () => {
    resetStore();
    const now = 1_000_000;
    const id = usePromptSchedule
      .getState()
      .addAutopilot(TARGET, 'ship the pricing page', { intervalMin: 10, maxRuns: 2 });

    usePromptSchedule.getState().recordAutopilotSent(id, 'step one', now);
    let a = usePromptSchedule.getState().autopilots.find((x) => x.id === id)!;
    expect(a.runsDone).toBe(1);
    expect(a.status).toBe('active');
    expect(a.nextRunAt).toBe(now + 10 * 60_000);
    expect(a.history.map((h) => h.prompt)).toEqual(['step one']);

    usePromptSchedule.getState().recordAutopilotSent(id, 'step two', now + 1);
    a = usePromptSchedule.getState().autopilots.find((x) => x.id === id)!;
    expect(a.runsDone).toBe(2);
    expect(a.status).toBe('done');
  });

  it('bounds sent history to the context window', () => {
    resetStore();
    const id = usePromptSchedule
      .getState()
      .addAutopilot(TARGET, 'vision', { maxRuns: MAX_MAX_RUNS });
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      usePromptSchedule.getState().recordAutopilotSent(id, `step ${i}`, i);
    }
    const a = usePromptSchedule.getState().autopilots.find((x) => x.id === id)!;
    expect(a.history.length).toBe(HISTORY_LIMIT);
    expect(a.history[a.history.length - 1]!.prompt).toBe(`step ${HISTORY_LIMIT + 4}`);
  });

  it('retries on failure and auto-pauses at the threshold', () => {
    resetStore();
    const now = 5_000_000;
    const id = usePromptSchedule.getState().addAutopilot(TARGET, 'vision', { intervalMin: 5 });

    for (let i = 1; i < FAILURE_PAUSE_THRESHOLD; i++) {
      usePromptSchedule.getState().recordAutopilotFailure(id, `boom ${i}`, now);
      const a = usePromptSchedule.getState().autopilots.find((x) => x.id === id)!;
      expect(a.status).toBe('active'); // still retrying
      expect(a.consecutiveFailures).toBe(i);
      expect(a.nextRunAt).toBe(now + 5 * 60_000);
    }
    usePromptSchedule.getState().recordAutopilotFailure(id, 'boom final', now);
    const a = usePromptSchedule.getState().autopilots.find((x) => x.id === id)!;
    expect(a.status).toBe('paused');
    expect(a.lastError).toBe('boom final');
  });

  it('a success resets the failure streak', () => {
    resetStore();
    const id = usePromptSchedule.getState().addAutopilot(TARGET, 'vision', {});
    usePromptSchedule.getState().recordAutopilotFailure(id, 'boom', 0);
    usePromptSchedule.getState().recordAutopilotSent(id, 'recovered', 1);
    const a = usePromptSchedule.getState().autopilots.find((x) => x.id === id)!;
    expect(a.consecutiveFailures).toBe(0);
    expect(a.lastError).toBeUndefined();
  });

  it('resume reactivates a paused mission and clears its error state', () => {
    resetStore();
    const id = usePromptSchedule.getState().addAutopilot(TARGET, 'vision', {});
    for (let i = 0; i < FAILURE_PAUSE_THRESHOLD; i++) {
      usePromptSchedule.getState().recordAutopilotFailure(id, 'boom', 0);
    }
    expect(usePromptSchedule.getState().autopilots[0]!.status).toBe('paused');

    usePromptSchedule.getState().resumeAutopilot(id);
    const a = usePromptSchedule.getState().autopilots.find((x) => x.id === id)!;
    expect(a.status).toBe('active');
    expect(a.consecutiveFailures).toBe(0);
    expect(a.lastError).toBeUndefined();
  });

  it('pause only affects active missions; done stays done', () => {
    resetStore();
    const id = usePromptSchedule.getState().addAutopilot(TARGET, 'vision', { maxRuns: 1 });
    usePromptSchedule.getState().recordAutopilotSent(id, 'only step', 0);
    usePromptSchedule.getState().pauseAutopilot(id);
    expect(usePromptSchedule.getState().autopilots[0]!.status).toBe('done');
  });

  it('one-shot prompts are untouched by autopilot bookkeeping', () => {
    resetStore();
    const pid = usePromptSchedule.getState().schedule(TARGET, 'run tests', 123);
    usePromptSchedule.getState().addAutopilot(TARGET, 'vision', {});
    const p = usePromptSchedule.getState().prompts.find((x) => x.id === pid)!;
    expect(p.prompt).toBe('run tests');
    expect(p.status).toBe('queued');
    expect(p.scheduledFor).toBe(123);
  });
});
