import {
  Bot,
  Boxes,
  CircleDot,
  Cpu,
  Eye,
  GitBranch,
  Hammer,
  KeyRound,
  Megaphone,
  Network,
  Palette,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  TestTube2,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ROLE_LIST,
  ROLES,
  planMission,
  runAgent,
  runPool,
  type AgentRoleId,
} from '../../lib/orchestrator';
import { activeProvider } from '../../lib/ai';
import {
  useAgentManager,
  type AgentStatus,
  type ManagedAgent,
} from '../../workbench/agentManagerStore';
import { useWorkbench } from '../../workbench/store';
import { toast } from '../../shell/toast';

const ROLE_ICONS: Record<AgentRoleId, LucideIcon> = {
  architect: Network,
  builder: Hammer,
  reviewer: Eye,
  security: ShieldCheck,
  designer: Palette,
  qa: TestTube2,
  marketing: Megaphone,
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'idle',
  queued: 'queued',
  thinking: 'working',
  done: 'done',
  error: 'error',
  stopped: 'stopped',
};

const STATUS_PILL: Record<AgentStatus, string> = {
  idle: 'pill',
  queued: 'pill pill--accent',
  thinking: 'pill pill--accent',
  done: 'pill pill--ok',
  error: 'pill pill--danger',
  stopped: 'pill pill--warn',
};

export default function AgentManagerPage(): JSX.Element {
  const agents = useAgentManager((s) => s.agents);
  const missions = useAgentManager((s) => s.missions);
  const activeAgentId = useAgentManager((s) => s.activeAgentId);
  const createMission = useAgentManager((s) => s.createMission);
  const updateMission = useAgentManager((s) => s.updateMission);
  const spawnAgent = useAgentManager((s) => s.spawnAgent);
  const setAgentStatus = useAgentManager((s) => s.setAgentStatus);
  const appendAgentOutput = useAgentManager((s) => s.appendAgentOutput);
  const resetAgentOutput = useAgentManager((s) => s.resetAgentOutput);
  const setActiveAgent = useAgentManager((s) => s.setActiveAgent);
  const removeAgent = useAgentManager((s) => s.removeAgent);
  const clearAll = useAgentManager((s) => s.clearAll);
  const setActiveActivity = useWorkbench((s) => s.setActiveActivity);

  const provider = activeProvider();
  const [goal, setGoal] = useState('');
  const [model, setModel] = useState<string>(() => provider?.models[0]?.id ?? '');
  const [planning, setPlanning] = useState(false);
  const [spawnRole, setSpawnRole] = useState<AgentRoleId | null>(null);

  // One AbortController per running agent — never persisted.
  const controllers = useRef(new Map<string, AbortController>());

  const activeModel = model || provider?.models[0]?.id;

  const activeAgent = useMemo(
    () => agents.find((a) => a.id === activeAgentId) ?? null,
    [agents, activeAgentId],
  );

  const stats = useMemo(() => {
    const working = agents.filter((a) => a.status === 'queued' || a.status === 'thinking').length;
    const done = agents.filter((a) => a.status === 'done').length;
    const tokens = agents.reduce((sum, a) => sum + a.tokens, 0);
    return { total: agents.length, working, done, tokens };
  }, [agents]);

  const busy = stats.working > 0 || planning;

  // ---- Engine wiring -------------------------------------------------------

  const runOne = useCallback(
    async (agentId: string, followUp?: string) => {
      const current = useAgentManager.getState().agents.find((a) => a.id === agentId);
      if (!current) return;

      const controller = new AbortController();
      controllers.current.set(agentId, controller);
      const priorOutput = current.output;

      if (followUp) {
        appendAgentOutput(agentId, `\n\n---\n**Follow-up:** ${followUp}\n\n`);
      } else {
        resetAgentOutput(agentId);
      }
      setAgentStatus(agentId, 'thinking');

      try {
        await runAgent(
          {
            role: current.roleId,
            task: current.task,
            model: current.model ?? activeModel,
            priorOutput: followUp ? priorOutput : undefined,
            followUp,
          },
          {
            signal: controller.signal,
            onDelta: (delta) => appendAgentOutput(agentId, delta),
          },
        );
        setAgentStatus(agentId, 'done');
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setAgentStatus(agentId, 'stopped');
        } else {
          const message = err instanceof Error ? err.message : String(err);
          setAgentStatus(agentId, 'error', message);
          toast(message, 'error');
        }
      } finally {
        controllers.current.delete(agentId);
      }
    },
    [activeModel, appendAgentOutput, resetAgentOutput, setAgentStatus],
  );

  const launchMission = useCallback(async () => {
    const trimmed = goal.trim();
    if (!trimmed || busy) return;
    if (!provider) {
      toast('Connect an AI model in Settings to delegate work.', 'error');
      return;
    }

    const missionId = createMission(trimmed);
    setPlanning(true);
    try {
      const plan = await planMission(trimmed, { model: activeModel });
      updateMission(missionId, { summary: plan.summary, status: 'running' });

      const ids = plan.tasks.map((task) =>
        spawnAgent({
          roleId: task.role,
          title: task.title,
          task: task.task,
          missionId,
          model: activeModel,
          status: 'queued',
        }),
      );
      setGoal('');
      setActiveAgent(ids[0] ?? null);
      setPlanning(false);

      await runPool(ids, 3, (id) => runOne(id));
      updateMission(missionId, { status: 'done' });
      toast(`Mission complete — ${ids.length} agents finished.`, 'success');
    } catch (err) {
      setPlanning(false);
      updateMission(missionId, { status: 'error' });
      if ((err as Error).name !== 'AbortError') {
        const message = err instanceof Error ? err.message : String(err);
        toast(`Planning failed: ${message}`, 'error');
      }
    }
  }, [
    activeModel,
    busy,
    createMission,
    goal,
    provider,
    runOne,
    setActiveAgent,
    spawnAgent,
    updateMission,
  ]);

  const spawnManual = useCallback(
    (roleId: AgentRoleId, task: string) => {
      if (!provider) {
        toast('Connect an AI model in Settings to spawn agents.', 'error');
        return;
      }
      const id = spawnAgent({
        roleId,
        title: `${ROLES[roleId].label} task`,
        task,
        model: activeModel,
        status: 'queued',
      });
      setActiveAgent(id);
      setSpawnRole(null);
      void runOne(id);
    },
    [activeModel, provider, runOne, setActiveAgent, spawnAgent],
  );

  const stop = useCallback((agentId: string) => {
    controllers.current.get(agentId)?.abort();
  }, []);

  const stopAll = useCallback(() => {
    controllers.current.forEach((c) => c.abort());
  }, []);

  // ---- Render --------------------------------------------------------------

  return (
    <div className="apppage agentmgr">
      <div className="apppage__header">
        <div>
          <h1 className="apppage__title">
            <Boxes size={20} strokeWidth={2} /> Agent Manager
          </h1>
          <p className="apppage__subtitle">
            Describe what you want to ship. The Architect plans it and delegates to a
            team of specialist agents that work in parallel.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {provider ? (
            <span className="pill pill--accent" title="Active model">
              <Cpu size={11} /> {provider.label}
            </span>
          ) : (
            <button className="btn-outline" type="button" onClick={() => setActiveActivity('settings')}>
              <KeyRound size={14} /> Connect a model
            </button>
          )}
          {busy ? (
            <button className="btn-outline" type="button" onClick={stopAll}>
              <Square size={14} /> Stop all
            </button>
          ) : (
            agents.length > 0 && (
              <button className="btn-outline" type="button" onClick={clearAll}>
                <Trash2 size={14} /> Clear
              </button>
            )
          )}
        </div>
      </div>

      <div className="apppage__body">
        {/* === Orchestrator console === */}
        <div className="appcard agentmgr__console">
          <div className="agentmgr__console-head">
            <span className="agentmgr__arch-badge">
              <Network size={15} strokeWidth={2} />
            </span>
            <div style={{ flex: 1 }}>
              <h3 className="appcard__title" style={{ margin: 0 }}>
                Architect
              </h3>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)' }}>
                Orchestrator · decomposes goals & delegates
              </span>
            </div>
            {provider && provider.models.length > 1 && (
              <select
                value={activeModel}
                onChange={(e) => setModel(e.target.value)}
                style={{ fontSize: 11 }}
                title="Model"
              >
                {provider.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void launchMission();
              }
            }}
            placeholder="e.g. Add Stripe checkout to my pricing page and a webhook to mark users as paid"
            rows={3}
            className="agentmgr__goal"
            disabled={planning}
          />

          <div className="agentmgr__console-foot">
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)' }}>
              {planning ? 'Architect is planning…' : 'Cmd/Ctrl + Enter to delegate'}
            </span>
            <button
              type="button"
              className="btn-accent"
              onClick={() => void launchMission()}
              disabled={!goal.trim() || planning}
            >
              <Sparkles size={15} /> Plan &amp; Delegate
            </button>
          </div>
        </div>

        {/* === Stats === */}
        {agents.length > 0 && (
          <div className="grid grid-4">
            <StatCard label="Agents" value={String(stats.total)} icon={Bot} />
            <StatCard label="Working" value={String(stats.working)} icon={Zap} live={stats.working > 0} />
            <StatCard label="Completed" value={String(stats.done)} icon={CircleDot} />
            <StatCard label="Tokens" value={formatTokens(stats.tokens)} icon={Cpu} />
          </div>
        )}

        {/* === Spawn a single agent === */}
        <div className="appcard">
          <h3 className="appcard__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={15} /> Spawn an agent
          </h3>
          <div className="agentmgr__roles">
            {ROLE_LIST.filter((r) => r.id !== 'architect').map((role) => {
              const Icon = ROLE_ICONS[role.id];
              return (
                <button
                  key={role.id}
                  type="button"
                  className="agentmgr__role-btn"
                  onClick={() => setSpawnRole(role.id)}
                  title={role.blurb}
                >
                  <span className="agentmgr__role-dot" style={{ background: role.accent }} />
                  <Icon size={14} />
                  {role.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* === Roster === */}
        {agents.length === 0 ? (
          <div className="agentmgr__empty">
            <Network size={30} strokeWidth={1.3} />
            <p>No agents yet. Describe a goal above and the Architect will build the team.</p>
          </div>
        ) : (
          <div className="grid grid-auto agentmgr__roster">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                active={agent.id === activeAgentId}
                onSelect={() => setActiveAgent(agent.id)}
                onStop={() => stop(agent.id)}
                onRetry={() => void runOne(agent.id)}
                onRemove={() => removeAgent(agent.id)}
              />
            ))}
          </div>
        )}

        {missions.length > 0 && (
          <div className="appcard">
            <h3 className="appcard__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitBranch size={15} /> Missions
            </h3>
            {missions.slice(0, 6).map((m) => (
              <div className="list-row" key={m.id}>
                <span style={{ flex: 1, color: 'var(--color-text)' }}>{m.goal}</span>
                <span className={m.status === 'done' ? 'pill pill--ok' : m.status === 'error' ? 'pill pill--danger' : 'pill pill--accent'}>
                  {m.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {spawnRole && (
        <SpawnDialog
          roleId={spawnRole}
          onCancel={() => setSpawnRole(null)}
          onSpawn={(task) => spawnManual(spawnRole, task)}
        />
      )}

      {activeAgent && (
        <AgentDetail
          agent={activeAgent}
          onClose={() => setActiveAgent(null)}
          onStop={() => stop(activeAgent.id)}
          onRetry={() => void runOne(activeAgent.id)}
          onFollowUp={(text) => void runOne(activeAgent.id, text)}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  live,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  live?: boolean;
}): JSX.Element {
  return (
    <div className="kpi">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="kpi__label">{label}</span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.15)',
            color: 'var(--color-accent-bright)',
          }}
        >
          <Icon size={16} strokeWidth={2} className={live ? 'agentmgr__pulse' : undefined} />
        </div>
      </div>
      <div className="kpi__value">{value}</div>
    </div>
  );
}

function AgentCard({
  agent,
  active,
  onSelect,
  onStop,
  onRetry,
  onRemove,
}: {
  agent: ManagedAgent;
  active: boolean;
  onSelect: () => void;
  onStop: () => void;
  onRetry: () => void;
  onRemove: () => void;
}): JSX.Element {
  const role = ROLES[agent.roleId];
  const Icon = ROLE_ICONS[agent.roleId];
  const working = agent.status === 'thinking' || agent.status === 'queued';

  return (
    <div
      className={`appcard agentmgr__agent ${active ? 'is-active' : ''} ${working ? 'is-working' : ''}`}
      onClick={onSelect}
      style={{ cursor: 'pointer' }}
    >
      <div className="agentmgr__agent-head">
        <span className="agentmgr__role-badge" style={{ color: role.accent }}>
          <Icon size={15} strokeWidth={2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="agentmgr__agent-name">{agent.title}</div>
          <div className="agentmgr__agent-role">{role.label}</div>
        </div>
        <span className={STATUS_PILL[agent.status]}>
          {working && <span className="agentmgr__spinner" />}
          {STATUS_LABEL[agent.status]}
        </span>
      </div>

      <p className="agentmgr__agent-task">{agent.task}</p>

      <div className="agentmgr__stream">
        {agent.output ? (
          tail(agent.output, 280)
        ) : agent.status === 'error' ? (
          <span style={{ color: 'var(--color-danger)' }}>{agent.error}</span>
        ) : working ? (
          <span style={{ color: 'var(--color-text-dim)' }}>thinking…</span>
        ) : (
          <span style={{ color: 'var(--color-text-dim)' }}>queued</span>
        )}
      </div>

      <div className="agentmgr__agent-foot" onClick={(e) => e.stopPropagation()}>
        <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>
          {agent.tokens > 0 ? `${formatTokens(agent.tokens)} tok` : '—'}
        </span>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {working ? (
            <button type="button" className="agentmgr__icon-btn" onClick={onStop} title="Stop">
              <Square size={12} />
            </button>
          ) : (
            <button type="button" className="agentmgr__icon-btn" onClick={onRetry} title="Re-run">
              <RotateCcw size={12} />
            </button>
          )}
          <button type="button" className="agentmgr__icon-btn" onClick={onRemove} title="Remove">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SpawnDialog({
  roleId,
  onCancel,
  onSpawn,
}: {
  roleId: AgentRoleId;
  onCancel: () => void;
  onSpawn: (task: string) => void;
}): JSX.Element {
  const role = ROLES[roleId];
  const Icon = ROLE_ICONS[roleId];
  const [task, setTask] = useState('');
  return (
    <div className="agentmgr__overlay" onClick={onCancel}>
      <div className="agentmgr__dialog" onClick={(e) => e.stopPropagation()}>
        <div className="agentmgr__dialog-head">
          <span className="agentmgr__role-badge" style={{ color: role.accent }}>
            <Icon size={16} strokeWidth={2} />
          </span>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 14 }}>Spawn {role.label}</strong>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)' }}>
              {role.blurb}
            </div>
          </div>
          <button type="button" className="agentmgr__icon-btn" onClick={onCancel}>
            <X size={14} />
          </button>
        </div>
        <textarea
          autoFocus
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && task.trim()) {
              e.preventDefault();
              onSpawn(task.trim());
            }
          }}
          placeholder={`What should the ${role.label} do?`}
          rows={4}
          style={{ width: '100%', fontSize: 12, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn-outline" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-accent"
            disabled={!task.trim()}
            onClick={() => onSpawn(task.trim())}
          >
            <Send size={14} /> Spawn &amp; run
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentDetail({
  agent,
  onClose,
  onStop,
  onRetry,
  onFollowUp,
}: {
  agent: ManagedAgent;
  onClose: () => void;
  onStop: () => void;
  onRetry: () => void;
  onFollowUp: (text: string) => void;
}): JSX.Element {
  const role = ROLES[agent.roleId];
  const Icon = ROLE_ICONS[agent.roleId];
  const [followUp, setFollowUp] = useState('');
  const working = agent.status === 'thinking' || agent.status === 'queued';

  const send = () => {
    const text = followUp.trim();
    if (!text || working) return;
    onFollowUp(text);
    setFollowUp('');
  };

  return (
    <div className="agentmgr__drawer">
      <div className="agentmgr__drawer-head">
        <span className="agentmgr__role-badge" style={{ color: role.accent }}>
          <Icon size={16} strokeWidth={2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 14 }}>{agent.title}</strong>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)' }}>
            {role.label} · {STATUS_LABEL[agent.status]}
            {agent.tokens > 0 ? ` · ${formatTokens(agent.tokens)} tok` : ''}
          </div>
        </div>
        {working ? (
          <button type="button" className="agentmgr__icon-btn" onClick={onStop} title="Stop">
            <Square size={14} />
          </button>
        ) : (
          <button type="button" className="agentmgr__icon-btn" onClick={onRetry} title="Re-run">
            <RotateCcw size={14} />
          </button>
        )}
        <button type="button" className="agentmgr__icon-btn" onClick={onClose} title="Close">
          <X size={14} />
        </button>
      </div>

      <div className="agentmgr__drawer-task">
        <span className="kpi__label">Task</span>
        <p>{agent.task}</p>
      </div>

      <div className="agentmgr__drawer-output">
        {agent.output ? (
          <pre>{agent.output}</pre>
        ) : agent.status === 'error' ? (
          <span style={{ color: 'var(--color-danger)' }}>{agent.error}</span>
        ) : (
          <span style={{ color: 'var(--color-text-dim)' }}>
            {working ? 'Working…' : 'No output yet.'}
          </span>
        )}
      </div>

      <div className="agentmgr__drawer-foot">
        <textarea
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={working ? 'Agent is working…' : 'Send a follow-up…'}
          rows={2}
          disabled={working}
          style={{ width: '100%', fontSize: 12, resize: 'none' }}
        />
        <button
          type="button"
          className="btn-primary"
          onClick={send}
          disabled={working || !followUp.trim()}
          title="Send follow-up"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

function tail(text: string, max: number): string {
  if (text.length <= max) return text;
  return `…${text.slice(text.length - max)}`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
