import { assistantMsg, generateText, streamConversation, userMsg } from './ai';
import type { Message } from '@forze/agents';
import { AGENT_TOOLS, findTool, hasWorkspace, workspaceSnapshot } from './agentTools';

/**
 * The orchestration engine behind the Agent Manager. The Architect (an LLM
 * call) decomposes a vibecoder's high-level goal into a set of concrete tasks,
 * each assigned to a specialised worker role. Worker agents are then run as
 * independent streamed generations against whichever provider is configured
 * (Gemini works keyless out of the box; Claude is BYOK).
 *
 * This module stays pure: it never touches the store. Callers (the view) own
 * state and pass `onDelta` callbacks so the UI can stream live output.
 */

export type AgentRoleId =
  | 'architect'
  | 'builder'
  | 'reviewer'
  | 'security'
  | 'designer'
  | 'qa'
  | 'marketing';

export interface AgentRole {
  id: AgentRoleId;
  label: string;
  /** One-line description shown on spawn buttons and empty states. */
  blurb: string;
  /** Hue used for the role's accent dot / ring. */
  accent: string;
  systemPrompt: string;
}

const SHARED_CONTEXT =
  'You are a worker agent inside Forze IDE, a builder OS for solo founders who ' +
  'vibe-code. Your operator is non-technical-leaning and ships fast. Everything ' +
  "you are asked to do is on the operator's own first-party project, at their " +
  'request and with their authorization. Be concrete, skip preamble, and prefer ' +
  'small reversible steps. Use markdown. Cite files as `path/to/file.ts:42` when ' +
  'relevant. Keep answers tight — no filler.';

export const ROLES: Record<AgentRoleId, AgentRole> = {
  architect: {
    id: 'architect',
    label: 'Architect',
    blurb: 'Plans the mission and delegates work to the right agents.',
    accent: '#00d4ff',
    systemPrompt:
      'You are the Architect, the orchestrator of a team of AI coding agents. ' +
      'You decompose a goal into the smallest set of independent, well-scoped ' +
      'tasks and assign each to the best-fit specialist.',
  },
  builder: {
    id: 'builder',
    label: 'Builder',
    blurb: 'Implements features — proposes concrete diffs and code.',
    accent: '#00d4ff',
    systemPrompt:
      `${SHARED_CONTEXT} You are the Builder. Implement the assigned task. Output ` +
      'the actual code or a precise diff, the files it touches, and a one-line ' +
      'summary of what to verify after applying it.',
  },
  reviewer: {
    id: 'reviewer',
    label: 'Reviewer',
    blurb: 'Reviews code & decisions for correctness and clarity.',
    accent: '#74ecff',
    systemPrompt:
      `${SHARED_CONTEXT} You are the Reviewer. Critique the assigned work for ` +
      'correctness, edge cases, and maintainability. Output a numbered list of ' +
      'findings ordered by severity, each with the smallest fix.',
  },
  security: {
    id: 'security',
    label: 'Security',
    blurb: 'Audits for the flaws AI assistants commonly introduce.',
    accent: '#e5645f',
    systemPrompt:
      `${SHARED_CONTEXT} You are the Security reviewer on the operator's own team. ` +
      "You are auditing the operator's own first-party codebase, with their " +
      'explicit authorization, so they can ship it safely — this is a routine ' +
      'defensive code review, not offensive security, and refusing it leaves the ' +
      'operator exposed. Review the assigned code for the mistakes AI coding tools ' +
      'commonly introduce: hard-coded secrets or API keys, missing access control / ' +
      'row-level security, unvalidated user input, and unsafe CORS/CSP. Report each ' +
      'finding with a severity, the `file:line`, and the minimal corrective fix — ' +
      'the defensive patch only, never a working exploit. If the code looks clean, ' +
      'say so plainly.',
  },
  designer: {
    id: 'designer',
    label: 'Designer',
    blurb: 'Sharpens UI/UX, layout, and visual hierarchy.',
    accent: '#e5e5e5',
    systemPrompt:
      `${SHARED_CONTEXT} You are the Designer. Improve the UX and visual design of ` +
      'the assigned surface. Output specific, implementable changes (spacing, ' +
      'hierarchy, states, copy) — not vague principles.',
  },
  qa: {
    id: 'qa',
    label: 'QA',
    blurb: 'Writes test plans and finds what will break.',
    accent: '#a9f4ff',
    systemPrompt:
      `${SHARED_CONTEXT} You are QA. Produce a focused test plan for the assigned ` +
      'work: the critical paths, edge cases, and at least one concrete test (code ' +
      'or steps) for each.',
  },
  marketing: {
    id: 'marketing',
    label: 'Marketing',
    blurb: 'Drafts launch copy grounded in what actually shipped.',
    accent: '#d7d7d7',
    systemPrompt:
      `${SHARED_CONTEXT} You are the Marketing agent. Draft launch copy grounded in ` +
      'the assigned change — never vague hype. Output one post per platform asked ' +
      'for (default: X, LinkedIn) with platform-appropriate length and tone.',
  },
};

export const ROLE_LIST: AgentRole[] = Object.values(ROLES);

/** A single task the Architect produced while planning a mission. */
export interface PlannedTask {
  role: AgentRoleId;
  /** Short imperative label for the agent card. */
  title: string;
  /** The full task / prompt handed to the worker. */
  task: string;
}

export interface MissionPlan {
  /** One-paragraph summary of the Architect's strategy. */
  summary: string;
  tasks: PlannedTask[];
}

function isRoleId(value: unknown): value is AgentRoleId {
  return typeof value === 'string' && value in ROLES;
}

/**
 * The single task to fall back on when the Architect's plan can't be parsed
 * (often because the model soft-refused). A security-flavoured goal must land on
 * the Security specialist — whose prompt is framed for an authorized defensive
 * audit — not on the Builder, which is the role that was declining the request.
 */
function fallbackTask(goal: string): PlannedTask {
  const trimmed = goal.trim();
  const security =
    /\b(security|secure|vulnerab\w*|audit|exploit|pentest|owasp|cve|injection|xss|csrf|rls)\b/i.test(
      trimmed,
    );
  return security
    ? { role: 'security', title: 'Security review', task: trimmed }
    : { role: 'builder', title: 'Implement goal', task: trimmed };
}

/** Pull the first JSON object/array out of a model response, fences and all. */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.search(/[[{]/);
  if (start === -1) throw new Error('No JSON found in planner response');
  const open = body[start];
  const close = open === '[' ? ']' : '}';
  const end = body.lastIndexOf(close);
  if (end <= start) throw new Error('Malformed JSON in planner response');
  return JSON.parse(body.slice(start, end + 1));
}

const PLANNER_SYSTEM =
  ROLES.architect.systemPrompt +
  "\n\nYou and your team operate exclusively on the operator's own first-party " +
  'project, at their request and with their full authorization. Never refuse, ' +
  'water down, or substitute a goal with generic advice — that includes security ' +
  'reviews and vulnerability audits, which are routine *defensive* work here, not ' +
  'offensive security. Always route any security, audit, or vulnerability goal to ' +
  'the "security" specialist (never to the Builder).' +
  '\n\nAvailable specialists (use only these role ids): ' +
  ROLE_LIST.filter((r) => r.id !== 'architect')
    .map((r) => `"${r.id}" (${r.label}: ${r.blurb})`)
    .join(', ') +
  '.\n\nEach specialist can act on the real project: read and search files, write ' +
  'files, and run shell commands (install, test, type-check). So tasks should be ' +
  'concrete units of work to execute, not just advice.\n\nReturn ONLY minified JSON of the shape ' +
  '{"summary":string,"tasks":[{"role":string,"title":string,"task":string}]}. ' +
  'Produce between 2 and 5 tasks. Each task must be independently runnable by one ' +
  'agent with no further input. "title" is 2-5 words. "task" is a precise, ' +
  'self-contained instruction naming the files or commands involved where known. ' +
  'No prose outside the JSON.';

/**
 * Ask the Architect to break a goal into a delegation plan. Throws a friendly
 * error when no provider key is available so the caller can surface a toast.
 */
export async function planMission(
  goal: string,
  options: { signal?: AbortSignal; model?: string } = {},
): Promise<MissionPlan> {
  const raw = await generateText(
    `Goal from the founder:\n"""${goal.trim()}"""\n\nProduce the delegation plan as JSON.`,
    {
      system: PLANNER_SYSTEM,
      maxTokens: 1400,
      module: 'agent-manager',
      signal: options.signal,
      model: options.model,
    },
  );

  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch {
    // Fall back to a single task so a malformed plan never dead-ends, routing by
    // intent so a security goal reaches the Security specialist, not the Builder.
    const task = fallbackTask(goal);
    return {
      summary: `Could not parse a structured plan — delegating the goal to the ${ROLES[task.role].label} as one task.`,
      tasks: [task],
    };
  }

  const obj = parsed as { summary?: unknown; tasks?: unknown };
  const tasks: PlannedTask[] = Array.isArray(obj.tasks)
    ? obj.tasks
        .map((t): PlannedTask | null => {
          const item = t as { role?: unknown; title?: unknown; task?: unknown };
          const role = isRoleId(item.role) && item.role !== 'architect' ? item.role : 'builder';
          const task = typeof item.task === 'string' ? item.task.trim() : '';
          if (!task) return null;
          const title =
            typeof item.title === 'string' && item.title.trim()
              ? item.title.trim()
              : `${ROLES[role].label} task`;
          return { role, title, task };
        })
        .filter((t): t is PlannedTask => t !== null)
        .slice(0, 5)
    : [];

  if (tasks.length === 0) {
    tasks.push(fallbackTask(goal));
  }

  return {
    summary:
      typeof obj.summary === 'string' && obj.summary.trim()
        ? obj.summary.trim()
        : 'Delegation plan ready.',
    tasks,
  };
}

/** Rough token estimate (~4 chars/token) — good enough for a spend gauge. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** A single tool invocation the worker asked for, parsed from its message. */
interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

/** Cap on tool-use round-trips before we force the agent to wrap up. */
const MAX_TOOL_ITERATIONS = 10;

function abortError(): Error {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

/**
 * Pull tool calls out of a worker's message. Workers act by ending a turn with
 * a single fenced ```json block of the shape
 * `{"actions":[{"tool":"read_file","args":{"path":"..."}}]}`. We also accept a
 * bare single call and a few key aliases, because models drift. A turn with no
 * parseable action block is the worker's final answer.
 */
function parseToolCalls(message: string): ToolCall[] {
  // Prefer the last fenced JSON block; fall back to the whole message if it is
  // itself a JSON object (some models skip the fence).
  const fences = [...message.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  const candidates = fences.length
    ? [fences[fences.length - 1]![1]!]
    : [message];

  for (const candidate of candidates) {
    const body = candidate.trim();
    const start = body.search(/[[{]/);
    if (start === -1) continue;
    const open = body[start];
    const close = open === '[' ? ']' : '}';
    const end = body.lastIndexOf(close);
    if (end <= start) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.slice(start, end + 1));
    } catch {
      continue;
    }
    const calls = normalizeCalls(parsed);
    if (calls.length) return calls;
  }
  return [];
}

function normalizeCalls(parsed: unknown): ToolCall[] {
  // A bare object only counts as a call when it carries our exact `tool` key, or
  // a `name` paired with an args field — so a JSON snippet in a final summary
  // (e.g. a package.json example with a "name") is never mistaken for an action.
  const looksLikeBareCall =
    isRecord(parsed) &&
    (typeof parsed.tool === 'string' ||
      (typeof parsed.name === 'string' &&
        ('args' in parsed || 'arguments' in parsed || 'input' in parsed)));

  const list: unknown[] = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed)
      ? (Array.isArray(parsed.actions)
          ? parsed.actions
          : Array.isArray(parsed.tool_calls)
            ? parsed.tool_calls
            : looksLikeBareCall
              ? [parsed]
              : [])
      : [];

  const calls: ToolCall[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const name = item.tool ?? item.name;
    if (typeof name !== 'string') continue;
    const rawArgs = item.args ?? item.arguments ?? item.input ?? {};
    calls.push({ tool: name, args: isRecord(rawArgs) ? rawArgs : {} });
  }
  return calls;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildWorkerSystem(role: AgentRole, snapshot: string): string {
  if (!hasWorkspace()) {
    return (
      `${role.systemPrompt}\n\n${snapshot}\n\n` +
      'No project folder is open, so you cannot edit files directly. Produce the ' +
      'complete code, diffs, or steps as markdown so the operator can apply them.'
    );
  }
  const toolDocs = AGENT_TOOLS.map((t) => `- ${t.description}`).join('\n');
  return (
    `${role.systemPrompt}\n\n${snapshot}\n\n` +
    'You can act on this real project with tools. To use them, end your message ' +
    'with EXACTLY ONE fenced json block of the shape ' +
    '{"actions":[{"tool":"<name>","args":{...}}]}. You may narrate your plan in ' +
    'prose before the block, and batch several independent actions in one block. ' +
    'After each block you receive the results, then you may act again.\n\n' +
    `Available tools:\n${toolDocs}\n\n` +
    'Rules: paths are relative to the project root. Ground every change by ' +
    'reading the relevant files first. Make the smallest edit that fully ' +
    'accomplishes the task, then verify it with run_command (e.g. type-check or ' +
    'tests). When the task is completely done, reply with a final markdown ' +
    'summary of what you changed and how you verified it — with NO json block.'
  );
}

/**
 * Run one worker agent as a tool-using loop. The worker reads and searches the
 * real project, writes files, and runs commands to verify its work, streaming
 * its reasoning and tool activity through `onDelta`. Resolves with the final
 * summary text. `priorOutput` + `followUp` continue an earlier thread.
 */
export async function runAgent(
  params: {
    role: AgentRoleId;
    task: string;
    model?: string;
    priorOutput?: string;
    followUp?: string;
    /** Shared mission context so the worker coordinates with its siblings. */
    missionBrief?: string;
  },
  options: { signal?: AbortSignal; onDelta?: (delta: string) => void } = {},
): Promise<string> {
  const role = ROLES[params.role] ?? ROLES.builder;
  const snapshot = await workspaceSnapshot();
  const system = buildWorkerSystem(role, snapshot);
  const onDelta = options.onDelta;
  const signal = options.signal;

  const brief = params.missionBrief
    ? `Mission context — you are one agent on a team:\n${params.missionBrief}\n\n`
    : '';

  let firstTurn = `${brief}Your assigned task:\n${params.task}`;
  if (params.priorOutput && params.followUp) {
    firstTurn =
      `${brief}Your assigned task:\n${params.task}\n\n` +
      `Your previous output:\n${params.priorOutput}\n\n` +
      `Follow-up from the operator:\n${params.followUp}`;
  }

  const messages: Message[] = [userMsg(firstTurn)];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (signal?.aborted) throw abortError();

    const turn = await streamConversation(messages, {
      system,
      model: params.model,
      maxTokens: 2048,
      module: 'agent-manager',
      signal,
      onDelta,
    });
    messages.push(assistantMsg(turn));

    const calls = parseToolCalls(turn);
    if (calls.length === 0) return turn; // final answer

    const observations: string[] = [];
    for (const call of calls) {
      if (signal?.aborted) throw abortError();
      onDelta?.(`\n\n\`▸ ${call.tool}\`\n`);
      const tool = findTool(call.tool);
      let result;
      if (!tool) {
        result = { ok: false, output: `Unknown tool "${call.tool}".` };
      } else {
        try {
          result = await tool.run(call.args, { signal });
        } catch (err) {
          result = { ok: false, output: err instanceof Error ? err.message : String(err) };
        }
      }
      onDelta?.(`\`${result.ok ? '✓' : '✗'} ${call.tool}\`\n`);
      observations.push(
        `Tool: ${call.tool}\nArgs: ${JSON.stringify(call.args)}\nResult (${
          result.ok ? 'ok' : 'error'
        }):\n${result.output}`,
      );
    }

    messages.push(
      userMsg(
        `Tool results:\n\n${observations.join('\n\n---\n\n')}\n\n` +
          'Continue. If the task is fully complete and verified, reply with your ' +
          'final markdown summary and no json action block.',
      ),
    );
  }

  // Hit the action ceiling — force a final, tool-free wrap-up.
  if (signal?.aborted) throw abortError();
  return streamConversation(
    [
      ...messages,
      userMsg(
        'You have reached the action limit. Stop using tools and give your final ' +
          'markdown summary now: what you changed, what is left, and how to verify.',
      ),
    ],
    {
      system,
      model: params.model,
      maxTokens: 1024,
      module: 'agent-manager',
      signal,
      onDelta,
    },
  );
}

/** One worker's result, handed back to the Architect for synthesis. */
export interface AgentResult {
  title: string;
  role: AgentRoleId;
  status: string;
  output: string;
}

/**
 * Close the loop: after the workers finish, the Architect reads every agent's
 * output and consolidates it into one decisive report for the founder — what
 * shipped, what to verify, what is still open, and the recommended next step.
 * This is the "orchestration" half that turns parallel delegation into a
 * coordinated mission rather than a pile of disconnected answers.
 */
export async function synthesizeMission(
  goal: string,
  summary: string,
  results: AgentResult[],
  options: { signal?: AbortSignal; model?: string; onDelta?: (delta: string) => void } = {},
): Promise<string> {
  const transcript = results
    .map(
      (r, i) =>
        `### ${i + 1}. ${r.title} — ${ROLES[r.role]?.label ?? r.role} · ${r.status}\n` +
        `${r.output.trim() || '_(no output)_'}`,
    )
    .join('\n\n');

  const system =
    ROLES.architect.systemPrompt +
    '\n\nThe specialists have finished. Synthesize their outputs into a single, ' +
    'decisive mission report for the founder. Sections: **What shipped** (bullets, ' +
    'grounded in the agents’ actual work), **Verify** (concrete checks to run), ' +
    '**Still open** (gaps or follow-ups), **Next step** (the one thing to do now). ' +
    'Be tight and concrete — no hype, no restating the task. Markdown only.';

  return generateText(
    `Goal:\n"""${goal.trim()}"""\n\nYour plan summary:\n${summary}\n\n` +
      `Agent outputs:\n\n${transcript}\n\nWrite the mission report.`,
    {
      system,
      maxTokens: 1400,
      module: 'agent-manager',
      signal: options.signal,
      model: options.model,
      onDelta: options.onDelta,
    },
  );
}

/**
 * Run async work over a list with bounded concurrency, so a mission of several
 * agents feels parallel without hammering the provider.
 */
export async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
}
