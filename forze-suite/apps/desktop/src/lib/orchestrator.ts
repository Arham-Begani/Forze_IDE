import { generateText } from './ai';

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
  /** Hue used for the role's accent dot / ring (kept in the indigo family). */
  accent: string;
  systemPrompt: string;
}

const SHARED_CONTEXT =
  'You are a worker agent inside Forze IDE, a builder OS for solo founders who ' +
  'vibe-code. Your operator is non-technical-leaning and ships fast. Be concrete, ' +
  'skip preamble, and prefer small reversible steps. Use markdown. Cite files as ' +
  '`path/to/file.ts:42` when relevant. Keep answers tight — no filler.';

export const ROLES: Record<AgentRoleId, AgentRole> = {
  architect: {
    id: 'architect',
    label: 'Architect',
    blurb: 'Plans the mission and delegates work to the right agents.',
    accent: '#818cf8',
    systemPrompt:
      'You are the Architect, the orchestrator of a team of AI coding agents. ' +
      'You decompose a goal into the smallest set of independent, well-scoped ' +
      'tasks and assign each to the best-fit specialist.',
  },
  builder: {
    id: 'builder',
    label: 'Builder',
    blurb: 'Implements features — proposes concrete diffs and code.',
    accent: '#818cf8',
    systemPrompt:
      `${SHARED_CONTEXT} You are the Builder. Implement the assigned task. Output ` +
      'the actual code or a precise diff, the files it touches, and a one-line ' +
      'summary of what to verify after applying it.',
  },
  reviewer: {
    id: 'reviewer',
    label: 'Reviewer',
    blurb: 'Reviews code & decisions for correctness and clarity.',
    accent: '#a5b4fc',
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
      `${SHARED_CONTEXT} You are the Security agent. Hunt for vulnerabilities AI ` +
      'tools commonly introduce: leaked keys, missing access control / RLS, ' +
      'unvalidated input, unsafe CORS/CSP. Output a triage with severity, ' +
      'file:line, and the minimal fix.',
  },
  designer: {
    id: 'designer',
    label: 'Designer',
    blurb: 'Sharpens UI/UX, layout, and visual hierarchy.',
    accent: '#c4b5fd',
    systemPrompt:
      `${SHARED_CONTEXT} You are the Designer. Improve the UX and visual design of ` +
      'the assigned surface. Output specific, implementable changes (spacing, ' +
      'hierarchy, states, copy) — not vague principles.',
  },
  qa: {
    id: 'qa',
    label: 'QA',
    blurb: 'Writes test plans and finds what will break.',
    accent: '#93c5fd',
    systemPrompt:
      `${SHARED_CONTEXT} You are QA. Produce a focused test plan for the assigned ` +
      'work: the critical paths, edge cases, and at least one concrete test (code ' +
      'or steps) for each.',
  },
  marketing: {
    id: 'marketing',
    label: 'Marketing',
    blurb: 'Drafts launch copy grounded in what actually shipped.',
    accent: '#c9a86a',
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
  '\n\nAvailable specialists (use only these role ids): ' +
  ROLE_LIST.filter((r) => r.id !== 'architect')
    .map((r) => `"${r.id}" (${r.label}: ${r.blurb})`)
    .join(', ') +
  '.\n\nReturn ONLY minified JSON of the shape ' +
  '{"summary":string,"tasks":[{"role":string,"title":string,"task":string}]}. ' +
  'Produce between 2 and 5 tasks. Each task must be independently runnable by one ' +
  'agent with no further input. "title" is 2-5 words. "task" is a precise, ' +
  'self-contained instruction. No prose outside the JSON.';

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
    { system: PLANNER_SYSTEM, maxTokens: 1400, signal: options.signal, model: options.model },
  );

  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch {
    // Fall back to a single Builder task so a malformed plan never dead-ends.
    return {
      summary: 'Could not parse a structured plan — delegating the goal to the Builder as one task.',
      tasks: [{ role: 'builder', title: 'Implement goal', task: goal.trim() }],
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
    tasks.push({ role: 'builder', title: 'Implement goal', task: goal.trim() });
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

/**
 * Run one worker agent. Streams output through `onDelta` and resolves with the
 * full text. The optional `priorOutput` lets a follow-up continue a thread.
 */
export async function runAgent(
  params: {
    role: AgentRoleId;
    task: string;
    model?: string;
    priorOutput?: string;
    followUp?: string;
  },
  options: { signal?: AbortSignal; onDelta?: (delta: string) => void } = {},
): Promise<string> {
  const role = ROLES[params.role] ?? ROLES.builder;

  let prompt = `Your assigned task:\n${params.task}`;
  if (params.priorOutput && params.followUp) {
    prompt =
      `Your assigned task:\n${params.task}\n\n` +
      `Your previous output:\n${params.priorOutput}\n\n` +
      `Follow-up from the operator:\n${params.followUp}`;
  }

  return generateText(prompt, {
    system: role.systemPrompt,
    model: params.model,
    maxTokens: 2048,
    signal: options.signal,
    onDelta: options.onDelta,
  });
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
