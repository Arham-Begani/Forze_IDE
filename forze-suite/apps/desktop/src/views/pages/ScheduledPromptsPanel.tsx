import { CalendarClock, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  usePromptSchedule,
  type ScheduledPromptStatus,
} from '../../workbench/promptScheduleStore';
import {
  AGENTS,
  stationOrdinal,
  targetLabel,
  useVibeStations,
  type StationTarget,
} from '../../workbench/vibeStationsStore';
import { toast } from '../../shell/toast';

const STATUS_LABEL: Record<ScheduledPromptStatus, string> = {
  queued: 'Queued',
  preparing: 'Starting station…',
  delivering: 'Sending…',
  done: 'Sent',
  failed: 'Failed',
};

function statusColor(status: ScheduledPromptStatus): string {
  if (status === 'done') return 'var(--color-accent)';
  if (status === 'failed') return 'var(--color-danger)';
  if (status === 'queued') return 'var(--color-text-dim)';
  return 'var(--color-text)';
}

interface TargetOption {
  key: string;
  label: string;
  target: StationTarget;
}

/**
 * Collapsible "Scheduled prompts" panel for the Vibe Stations page: a manual
 * add form (pick a station, a prompt, and a time) plus the queue with status and
 * cancel. The Forze Assistant schedules into the same store, so anything queued
 * by chat shows up here too.
 */
export default function ScheduledPromptsPanel(): JSX.Element {
  const prompts = usePromptSchedule((s) => s.prompts);
  const schedule = usePromptSchedule((s) => s.schedule);
  const cancel = usePromptSchedule((s) => s.cancel);
  const stations = useVibeStations((s) => s.stations);

  const [open, setOpen] = useState(false);

  // Target options: every open station, plus a "#1" for any agent not open yet.
  const options = useMemo<TargetOption[]>(() => {
    const opts: TargetOption[] = [];
    const seen = new Set<string>();
    for (const s of stations) {
      const ordinal = stationOrdinal(stations, s);
      const target = { agentId: s.agentId, ordinal };
      const key = `${s.agentId}:${ordinal}`;
      seen.add(key);
      opts.push({ key, label: targetLabel(target), target });
    }
    for (const agent of AGENTS) {
      const key = `${agent.id}:1`;
      if (!seen.has(key)) {
        const target: StationTarget = { agentId: agent.id, ordinal: 1 };
        opts.push({ key, label: `${targetLabel(target)} (not open)`, target });
      }
    }
    return opts;
  }, [stations]);

  const [targetKey, setTargetKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [when, setWhen] = useState('');

  const ordered = useMemo(
    () => [...prompts].sort((a, b) => a.scheduledFor - b.scheduledFor),
    [prompts],
  );

  const submit = () => {
    const chosen = options.find((o) => o.key === targetKey) ?? options[0];
    if (!chosen) {
      toast('Pick a station to schedule on', 'error');
      return;
    }
    const text = prompt.trim();
    if (!text) {
      toast('Enter a prompt to run', 'error');
      return;
    }
    const ms = Date.parse(when);
    if (Number.isNaN(ms)) {
      toast('Pick a valid time', 'error');
      return;
    }
    if (ms <= Date.now()) {
      toast('Pick a time in the future', 'error');
      return;
    }
    schedule(chosen.target, text, ms);
    setPrompt('');
    setWhen('');
    toast(`Scheduled on ${chosen.label.replace(' (not open)', '')}`, 'success');
  };

  const activeCount = prompts.filter(
    (p) => p.status === 'queued' || p.status === 'preparing',
  ).length;

  return (
    <div className="sched-panel">
      <button
        type="button"
        className="sched-panel__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <CalendarClock size={15} />
        <span>Scheduled prompts</span>
        {activeCount > 0 && <span className="sched-panel__badge">{activeCount}</span>}
      </button>

      {open && (
        <div className="sched-panel__body">
          <div className="sched-form">
            <select
              value={targetKey || options[0]?.key || ''}
              onChange={(e) => setTargetKey(e.target.value)}
              aria-label="Target station"
            >
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              aria-label="When to run"
            />
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder="Prompt to run…"
              aria-label="Prompt"
            />
            <button type="button" className="btn-accent" onClick={submit}>
              <CalendarClock size={14} /> Schedule
            </button>
          </div>

          {ordered.length === 0 ? (
            <p className="dim sched-empty">
              Nothing scheduled. Add one above, or ask the assistant — e.g. “run
              ‘fix the tests’ on Claude Code #1 at 9pm”.
            </p>
          ) : (
            <div className="sched-list">
              {ordered.map((p) => (
                <div key={p.id} className="sched-row">
                  <div className="sched-row__main">
                    <div className="sched-row__title">{p.prompt}</div>
                    <div className="sched-row__meta">
                      <span>{targetLabel(p.target)}</span>
                      <span>·</span>
                      <span>{new Date(p.scheduledFor).toLocaleString()}</span>
                      <span>·</span>
                      <span style={{ color: statusColor(p.status) }}>
                        {STATUS_LABEL[p.status]}
                      </span>
                      {p.lastError && (
                        <span style={{ color: 'var(--color-danger)' }}>· {p.lastError}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => cancel(p.id)}
                    title={p.status === 'done' ? 'Remove' : 'Cancel'}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
