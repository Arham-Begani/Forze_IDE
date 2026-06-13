import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  ListTodo,
  Megaphone,
  Network,
  Pin,
  Plus,
  Send,
  Settings2,
  Terminal,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type { BusTask, BusTaskStatus } from '../../lib/agentBus';
import { useMemo, useState } from 'react';
import { useProject } from '../../workbench/projectStore';
import { useAgentBus } from '../../workbench/agentBusStore';
import { briefReadyStations, runOnAllStations, startTeamGoal } from '../../workbench/teamSync';
import { IDE_STATION, type CliWiringResult } from '../../lib/agentBus';
import { toast } from '../../shell/toast';

/** Sentinel recipient: deliver the message live into every running station's CLI
 *  (typed into the terminal) rather than posting it passively to the bus. */
const LIVE_TARGET = '__live__';

/** A roster entry is "active" if it pinged the bus within this window. */
const ACTIVE_WINDOW_MS = 60_000;

/**
 * "Context Bus" footer panel for the Vibe Stations page. It mirrors the
 * workspace `.forze/bus.json` that each station's MCP server reads/writes —
 * showing who's online, the shared board, and the live message feed — and lets
 * the human broadcast into the same bus or pin a shared note. The one-time
 * "Enable shared context" button wires every CLI to the bus.
 */
export default function AgentBusPanel(): JSX.Element {
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const bus = useAgentBus((s) => s.bus);
  const enabled = useAgentBus((s) => s.enabled);
  const wiring = useAgentBus((s) => s.wiring);
  const enabling = useAgentBus((s) => s.enabling);
  const error = useAgentBus((s) => s.error);
  const autoBrief = useAgentBus((s) => s.autoBrief);
  const setAutoBrief = useAgentBus((s) => s.setAutoBrief);
  const enable = useAgentBus((s) => s.enable);
  const broadcast = useAgentBus((s) => s.broadcast);
  const saveNote = useAgentBus((s) => s.saveNote);
  const removeNote = useAgentBus((s) => s.removeNote);
  const addTask = useAgentBus((s) => s.addTask);
  const setTask = useAgentBus((s) => s.setTask);
  const removeTask = useAgentBus((s) => s.removeTask);
  const refresh = useAgentBus((s) => s.refresh);

  const [open, setOpen] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  const now = Date.now();
  const roster = useMemo(
    () =>
      Object.entries(bus.roster)
        .map(([station, info]) => ({
          station,
          status: info.status ?? null,
          active: typeof info.lastSeen === 'number' && now - info.lastSeen < ACTIVE_WINDOW_MS,
        }))
        .sort((a, b) => a.station.localeCompare(b.station)),
    [bus.roster, now],
  );
  const activeCount = roster.filter((r) => r.active).length;

  const messages = useMemo(() => [...bus.messages].sort((a, b) => a.ts - b.ts).slice(-50), [bus.messages]);
  const notes = useMemo(
    () => Object.entries(bus.board).sort((a, b) => b[1].ts - a[1].ts),
    [bus.board],
  );
  // Tasks ordered: open work first (doing > todo > blocked), done last; newest within.
  const tasks = useMemo(() => {
    const rank: Record<BusTaskStatus, number> = { doing: 0, todo: 1, blocked: 2, done: 3 };
    return [...bus.tasks].sort(
      (a, b) => (rank[a.status] ?? 1) - (rank[b.status] ?? 1) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
    );
  }, [bus.tasks]);
  const openTasks = tasks.filter((t) => t.status !== 'done').length;

  const recipients = useMemo(
    () => ['all', ...roster.map((r) => r.station).filter((s) => s !== IDE_STATION)],
    [roster],
  );

  const [to, setTo] = useState('all');
  const [msg, setMsg] = useState('');
  const [noteKey, setNoteKey] = useState('');
  const [noteVal, setNoteVal] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [starting, setStarting] = useState(false);

  const root = workspaceRoot ?? '';

  const onEnable = async () => {
    if (!root) {
      toast('Open a workspace folder first', 'error');
      return;
    }
    await enable(root);
    setShowSetup(true);
    toast('Context Bus enabled — restart stations to join', 'success');
  };

  const onSend = async () => {
    const text = msg.trim();
    if (!root || !text) return;
    if (to === LIVE_TARGET) {
      const delivered = await runOnAllStations(root, text);
      toast(
        delivered.length
          ? `Ran on ${delivered.length} station(s): ${delivered.join(', ')}`
          : 'No stations are ready yet',
        delivered.length ? 'success' : 'error',
      );
    } else {
      await broadcast(root, to, text);
    }
    setMsg('');
  };

  const onBrief = async () => {
    if (!root) return;
    const delivered = await briefReadyStations();
    toast(
      delivered.length
        ? `Briefed ${delivered.length} station(s) onto the bus`
        : 'No ready stations to brief — launch or restart one first',
      delivered.length ? 'success' : 'error',
    );
  };

  const onSaveNote = async () => {
    const key = noteKey.trim();
    const value = noteVal.trim();
    if (!root || !key || !value) return;
    await saveNote(root, key, value);
    setNoteKey('');
    setNoteVal('');
  };

  const onAddTask = async () => {
    const title = taskTitle.trim();
    if (!root || !title) return;
    await addTask(root, title);
    setTaskTitle('');
  };

  const onStartGoal = async () => {
    const g = goal.trim();
    if (!root || !g || starting) return;
    setStarting(true);
    try {
      const res = await startTeamGoal(root, g);
      await refresh(root);
      setGoal('');
      if (res.stationsRunning === 0) {
        toast(`Split into ${res.tasks.length} tasks — launch a station and it'll pick them up`, 'success');
      } else {
        toast(`Split into ${res.tasks.length} tasks · ${res.briefed.length} agent(s) working it`, 'success');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not start the team', 'error');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="sched-panel">
      <button
        type="button"
        className="sched-panel__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <Network size={15} />
        <span>Context Bus</span>
        {enabled ? (
          <>
            {activeCount > 0 && <span className="sched-panel__badge">{activeCount} live</span>}
            {openTasks > 0 && (
              <span className="sched-panel__badge bus-badge-tasks">{openTasks} open</span>
            )}
          </>
        ) : (
          <span className="bus-head-hint">off</span>
        )}
      </button>

      {open && (
        <div className="sched-panel__body">
          {!enabled ? (
            <div className="bus-setup">
              <p className="bus-setup__lead">
                Let your Vibe Station agents share context — a common board for
                decisions and contracts, plus direct messages and hand-offs between
                CLIs. Forze writes a tiny MCP server into <code>.forze/</code> and
                wires Claude Code, Codex, OpenCode, and Antigravity to it.
              </p>
              <button
                type="button"
                className="btn-accent"
                onClick={onEnable}
                disabled={enabling || !root}
              >
                <Network size={14} /> {enabling ? 'Enabling…' : 'Enable shared context'}
              </button>
              {!root && <p className="dim bus-setup__note">Open a workspace folder first.</p>}
              {error && <p className="bus-error">{error}</p>}
            </div>
          ) : (
            <>
              {/* One-shot: describe a goal → split into tasks → team works it */}
              <div className="bus-goal">
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void onStartGoal();
                  }}
                  rows={2}
                  placeholder="Tell the team what to build, e.g. “Add email + password login with tests”…"
                  aria-label="Team goal"
                  className="bus-goal__input"
                />
                <button
                  type="button"
                  className="btn-accent bus-goal__btn"
                  onClick={() => void onStartGoal()}
                  disabled={starting || !goal.trim() || !root}
                >
                  <Megaphone size={14} /> {starting ? 'Starting…' : 'Start team'}
                </button>
                <p className="dim bus-goal__hint">
                  Forze splits this into tasks, hands them to your running stations, and they
                  claim and work them together — no further prompting.
                </p>
              </div>

              {/* Roster */}
              <div className="bus-section">
                <div className="bus-section__head">
                  <div className="bus-section__label">Stations</div>
                  <div className="bus-section__tools">
                    <label className="bus-toggle" title="Brief each station onto the bus the moment it boots">
                      <input
                        type="checkbox"
                        checked={autoBrief}
                        onChange={(e) => setAutoBrief(e.target.checked)}
                      />
                      Auto-brief
                    </label>
                    <button type="button" className="btn-outline bus-mini-btn" onClick={() => void onBrief()}>
                      <Megaphone size={13} /> Brief the team
                    </button>
                  </div>
                </div>
                {roster.length === 0 ? (
                  <p className="dim bus-empty">
                    No stations have joined yet. Launch (or restart) a station — it
                    boots with its bus identity and announces itself.
                  </p>
                ) : (
                  <>
                    <div className="bus-roster">
                      {roster.map((r) => (
                        <span
                          key={r.station}
                          className={`bus-chip ${r.active ? 'is-active' : ''}`}
                          title={r.status ?? 'no status yet'}
                        >
                          <CircleDot size={11} />
                          <span className="bus-chip__name">{r.station}</span>
                          {r.status && <span className="bus-chip__status">— {r.status}</span>}
                        </span>
                      ))}
                    </div>
                    <p className="dim bus-health">
                      {activeCount} of {roster.length} connected and active in the last minute.
                    </p>
                  </>
                )}
              </div>

              {/* Shared task queue */}
              <div className="bus-section">
                <div className="bus-section__label">
                  <ListTodo size={12} /> Task queue
                </div>
                {tasks.length > 0 && (
                  <div className="bus-tasks">
                    {tasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        onCycle={() => void setTask(root, t.id, nextStatus(t.status))}
                        onDone={() => void setTask(root, t.id, t.status === 'done' ? 'todo' : 'done')}
                        onRemove={() => void removeTask(root, t.id)}
                      />
                    ))}
                  </div>
                )}
                <div className="bus-task-form">
                  <input
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void onAddTask()}
                    placeholder="Add a task for the team…"
                    aria-label="New task"
                    className="bus-task-form__input"
                  />
                  <button type="button" className="btn-outline" onClick={() => void onAddTask()}>
                    <Plus size={13} /> Add
                  </button>
                </div>
              </div>

              {/* Shared board */}
              <div className="bus-section">
                <div className="bus-section__label">Shared board</div>
                {notes.length > 0 && (
                  <div className="bus-notes">
                    {notes.map(([key, entry]) => (
                      <div key={key} className="bus-note">
                        <div className="bus-note__main">
                          <span className="bus-note__key">
                            <Pin size={11} /> {key}
                          </span>
                          <span className="bus-note__val">{entry.value}</span>
                          <span className="bus-note__by">— {entry.by}</span>
                        </div>
                        <button
                          type="button"
                          className="btn-outline bus-icon-btn"
                          onClick={() => void removeNote(root, key)}
                          title="Remove note"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="bus-note-form">
                  <input
                    value={noteKey}
                    onChange={(e) => setNoteKey(e.target.value)}
                    placeholder="key (e.g. api-contract)"
                    aria-label="Note key"
                    className="bus-note-form__key"
                  />
                  <input
                    value={noteVal}
                    onChange={(e) => setNoteVal(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void onSaveNote()}
                    placeholder="value…"
                    aria-label="Note value"
                    className="bus-note-form__val"
                  />
                  <button type="button" className="btn-outline" onClick={() => void onSaveNote()}>
                    <Pin size={13} /> Pin
                  </button>
                </div>
              </div>

              {/* Message feed */}
              <div className="bus-section">
                <div className="bus-section__label">Messages</div>
                {messages.length === 0 ? (
                  <p className="dim bus-empty">
                    No messages yet. Agents talk via the <code>forze_bus_send</code>{' '}
                    tool — or broadcast one yourself below.
                  </p>
                ) : (
                  <div className="bus-feed">
                    {messages.map((m) => (
                      <div key={m.id} className={`bus-msg ${m.from === IDE_STATION ? 'is-ide' : ''}`}>
                        <span className="bus-msg__from">{m.from}</span>
                        <span className="bus-msg__to">→ {m.to}</span>
                        <span className="bus-msg__text">{m.text}</span>
                        <span className="bus-msg__ago">{Math.round((now - m.ts) / 1000)}s</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="bus-composer">
                  <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Recipient">
                    <option value={LIVE_TARGET}>▶ Run live on all stations</option>
                    {recipients.map((r) => (
                      <option key={r} value={r}>
                        {r === 'all' ? 'Everyone (bus)' : `${r} (bus)`}
                      </option>
                    ))}
                  </select>
                  <input
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void onSend()}
                    placeholder={
                      to === LIVE_TARGET ? 'Instruction to run on every station…' : 'Message the agents…'
                    }
                    aria-label="Message"
                    className="bus-composer__text"
                  />
                  <button type="button" className="btn-accent" onClick={() => void onSend()}>
                    {to === LIVE_TARGET ? <Terminal size={13} /> : <Send size={13} />}{' '}
                    {to === LIVE_TARGET ? 'Run' : 'Send'}
                  </button>
                </div>
                {to === LIVE_TARGET && (
                  <p className="dim bus-composer__hint">
                    Types the instruction straight into every running station&apos;s CLI — they act
                    on it immediately. Bus messages instead wait for an agent to check its inbox.
                  </p>
                )}
              </div>

              {/* Setup / wiring status */}
              <div className="bus-section">
                <button
                  type="button"
                  className="bus-setup-toggle"
                  onClick={() => setShowSetup((v) => !v)}
                  aria-expanded={showSetup}
                >
                  <Settings2 size={13} /> CLI wiring
                  {showSetup ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                {showSetup && (
                  <div className="bus-wiring">
                    {wiring ? (
                      wiring.clis.map((c) => <WiringRow key={c.cli} c={c} />)
                    ) : (
                      <p className="dim bus-empty">
                        Config was written previously. Re-run to refresh paths or
                        re-wire a CLI.
                      </p>
                    )}
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => void enable(root)}
                      disabled={enabling}
                    >
                      {enabling ? 'Re-wiring…' : 'Re-run wiring'}
                    </button>
                    {error && <p className="bus-error">{error}</p>}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Cycle a task through the open states (the chip click); "done" loops back to todo. */
function nextStatus(status: BusTaskStatus): BusTaskStatus {
  const order: BusTaskStatus[] = ['todo', 'doing', 'blocked', 'done'];
  return order[(order.indexOf(status) + 1) % order.length]!;
}

const STATUS_META: Record<BusTaskStatus, { label: string; cls: string }> = {
  todo: { label: 'To do', cls: 'is-todo' },
  doing: { label: 'Doing', cls: 'is-doing' },
  done: { label: 'Done', cls: 'is-done' },
  blocked: { label: 'Blocked', cls: 'is-blocked' },
};

function TaskRow({
  task,
  onCycle,
  onDone,
  onRemove,
}: {
  task: BusTask;
  onCycle: () => void;
  onDone: () => void;
  onRemove: () => void;
}): JSX.Element {
  const meta = STATUS_META[task.status];
  return (
    <div className={`bus-task ${task.status === 'done' ? 'is-done' : ''}`}>
      <button
        type="button"
        className="bus-task__check"
        onClick={onDone}
        title={task.status === 'done' ? 'Reopen' : 'Mark done'}
      >
        {task.status === 'done' ? <CheckCircle2 size={15} /> : <Circle size={15} />}
      </button>
      <div className="bus-task__main">
        <span className="bus-task__title">{task.title}</span>
        {task.detail && <span className="bus-task__detail">{task.detail}</span>}
        <div className="bus-task__meta">
          <button
            type="button"
            className={`bus-task__status ${meta.cls}`}
            onClick={onCycle}
            title="Click to change status"
          >
            {meta.label}
          </button>
          {task.owner && <span className="bus-task__owner">{task.owner}</span>}
        </div>
      </div>
      <button type="button" className="btn-outline bus-icon-btn" onClick={onRemove} title="Remove task">
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function WiringRow({ c }: { c: CliWiringResult }): JSX.Element {
  const kindLabel = c.kind === 'auto' ? 'Auto' : c.kind === 'global' ? 'Global config' : 'Manual';
  return (
    <div className="bus-wire-row">
      <span className={`bus-wire-row__icon ${c.ok ? 'is-ok' : 'is-warn'}`}>
        {c.ok ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
      </span>
      <div className="bus-wire-row__main">
        <span className="bus-wire-row__title">
          {c.label} <span className="bus-wire-row__kind">{kindLabel}</span>
        </span>
        <span className="bus-wire-row__note">{c.note}</span>
        <span className="bus-wire-row__path">{c.path}</span>
      </div>
    </div>
  );
}
