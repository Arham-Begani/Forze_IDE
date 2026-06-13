/**
 * The mission engine, lifted out of AgentManagerPage so it can run from anywhere
 * — the Agent Manager UI *and* the floating Assistant ("the manager"). It is the
 * exact "type a goal + click go" sequence: the Architect plans the goal into
 * tasks, workers run in a bounded pool, and the Architect synthesizes a report.
 *
 * Kept free of React: it drives the agent-manager store via getState() and owns
 * its own AbortController registry so either caller can stop a run. An optional
 * MissionMirror is notified once the plan is spawned, so a consumer (the Kanban
 * bridge) can mirror the team onto the board and track it live.
 */
import {
  ROLES,
  planMission,
  runAgent,
  runPool,
  synthesizeMission,
  type AgentRoleId,
} from './orchestrator';
import { activeProvider } from './ai';
import { useAgentManager } from '../workbench/agentManagerStore';
import { toast } from '../shell/toast';

/** Notified when a mission's team has been planned + spawned. */
export interface MissionMirror {
  onPlan(
    missionId: string,
    agents: Array<{ agentId: string; title: string; role: AgentRoleId }>,
  ): void;
}

const EMPTY_RESPONSE =
  '_The model returned an empty response — it may have been rate-limited or ' +
  'filtered. Try **Re-run**, rephrase the task, or switch models._';

// One AbortController per running agent. Lives at module scope (not a component
// ref) so both the Agent Manager page and the Assistant can abort the same run.
const controllers = new Map<string, AbortController>();

export function abortAgent(agentId: string): void {
  controllers.get(agentId)?.abort();
}

export function abortAllAgents(): void {
  controllers.forEach((c) => c.abort());
}

/** The default model to use when a caller doesn't pin one. */
function defaultModel(): string | undefined {
  return activeProvider()?.models[0]?.id;
}

/**
 * Run one worker agent to completion, streaming its output into the store and
 * reconciling status. `followUp` continues an existing thread (re-run / ask a
 * follow-up); otherwise the agent's output is reset first. Extracted verbatim
 * from the page's `runOne`.
 */
export async function runAgentById(
  agentId: string,
  opts: { followUp?: string; missionBrief?: string } = {},
): Promise<void> {
  const m = useAgentManager.getState();
  const current = m.agents.find((a) => a.id === agentId);
  if (!current) return;

  const controller = new AbortController();
  controllers.set(agentId, controller);
  const priorOutput = current.output;
  const { followUp, missionBrief } = opts;

  if (followUp) {
    m.appendAgentOutput(agentId, `\n\n---\n**Follow-up:** ${followUp}\n\n`);
  } else {
    m.resetAgentOutput(agentId);
  }
  m.setAgentStatus(agentId, 'thinking');

  try {
    // Stream via onDelta, but keep the returned summary: some providers can
    // finish with no streamed text (empty/blocked candidates), which would
    // otherwise leave a "done" agent with an empty panel.
    const summary = await runAgent(
      {
        role: current.roleId,
        task: current.task,
        model: current.model ?? defaultModel(),
        priorOutput: followUp ? priorOutput : undefined,
        followUp,
        missionBrief,
      },
      {
        signal: controller.signal,
        onDelta: (delta) => useAgentManager.getState().appendAgentOutput(agentId, delta),
      },
    );
    const streamed =
      useAgentManager.getState().agents.find((a) => a.id === agentId)?.output ?? '';
    if (!streamed.trim()) {
      useAgentManager.getState().appendAgentOutput(agentId, summary.trim() || EMPTY_RESPONSE);
    }
    useAgentManager.getState().setAgentStatus(agentId, 'done');
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      useAgentManager.getState().setAgentStatus(agentId, 'stopped');
    } else {
      const message = err instanceof Error ? err.message : String(err);
      useAgentManager.getState().setAgentStatus(agentId, 'error', message);
      toast(message, 'error');
    }
  } finally {
    controllers.delete(agentId);
  }
}

/**
 * Plan a goal with the Architect, spawn the worker team, run them in a bounded
 * pool, then synthesize the mission report. Returns the mission + agent ids.
 * Never throws to the caller — failures surface as a toast and an `error`
 * mission status, mirroring the original page behavior.
 */
export async function runMission(opts: {
  goal: string;
  model?: string;
  onMirror?: MissionMirror;
  signal?: AbortSignal;
}): Promise<{ missionId: string; agentIds: string[] }> {
  const goal = opts.goal.trim();
  const model = opts.model ?? defaultModel();
  const missionId = useAgentManager.getState().createMission(goal);

  try {
    const plan = await planMission(goal, { model, signal: opts.signal });
    useAgentManager.getState().updateMission(missionId, {
      summary: plan.summary,
      status: 'running',
    });

    // Shared brief so each worker knows the whole mission and stays in its lane
    // instead of duplicating or contradicting its siblings.
    const brief =
      `Overall goal: ${goal}\n` +
      `Architect's plan: ${plan.summary}\n` +
      `The full team and their tasks:\n` +
      plan.tasks
        .map((t, i) => `  ${i + 1}. [${ROLES[t.role].label}] ${t.title}`)
        .join('\n') +
      `\nDo only your assigned task; trust your teammates to handle theirs.`;

    const agentIds = plan.tasks.map((task) =>
      useAgentManager.getState().spawnAgent({
        roleId: task.role,
        title: task.title,
        task: task.task,
        missionId,
        model,
        status: 'queued',
      }),
    );
    useAgentManager.getState().setActiveAgent(agentIds[0] ?? null);

    // Let a consumer mirror the freshly-planned team (e.g. onto the Kanban) and
    // start tracking it live. Done after spawn so the agent ids are real.
    opts.onMirror?.onPlan(
      missionId,
      agentIds.map((id, i) => ({
        agentId: id,
        title: plan.tasks[i]!.title,
        role: plan.tasks[i]!.role,
      })),
    );

    await runPool(agentIds, 3, (id) => runAgentById(id, { missionBrief: brief }));

    // Orchestration close-out: consolidate every agent's output into one report
    // rather than leaving disconnected answers behind.
    try {
      const finished = useAgentManager
        .getState()
        .agents.filter((a) => agentIds.includes(a.id));
      const report = await synthesizeMission(
        goal,
        plan.summary,
        finished.map((a) => ({
          title: a.title,
          role: a.roleId,
          status: a.status,
          output: a.output,
        })),
        { model },
      );
      useAgentManager.getState().updateMission(missionId, { status: 'done', report });
    } catch {
      useAgentManager.getState().updateMission(missionId, { status: 'done' });
    }
    toast(`Mission complete — ${agentIds.length} agents finished.`, 'success');
    return { missionId, agentIds };
  } catch (err) {
    useAgentManager.getState().updateMission(missionId, { status: 'error' });
    if ((err as Error).name !== 'AbortError') {
      const message = err instanceof Error ? err.message : String(err);
      toast(`Planning failed: ${message}`, 'error');
    }
    return { missionId, agentIds: [] };
  }
}
