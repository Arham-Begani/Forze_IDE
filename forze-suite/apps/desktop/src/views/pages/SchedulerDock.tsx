import {
  CalendarClock,
  Pause,
  Play,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  MAX_MAX_RUNS,
  MIN_MAX_RUNS,
  usePromptSchedule,
  type AutopilotMission,
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

/**
 * The Scheduler dock — the prominent scheduling surface at the top of the Vibe
 * Stations page. Two ways to drive a station later:
 *
 *  - One-shot: exactly your prompt, typed into the station at your time.
 *  - Autopilot: describe a vision; the AI writes and sends the next prompt at
 *    every interval (seeing what the agent did) until the vision is complete
 *    or the step budget runs out.
 *
 * The Forze Assistant schedules into the same store, so anything queued from
 * chat appears here too.
 */

const STATUS_LABEL: Record<ScheduledPromptStatus, string> = {
  queued: 'Queued',
  preparing: 'Waiting for station…',
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

const PILOT_LABEL: Record<AutopilotMission['status'], string> = {
  active: 'Live',
  paused: 'Paused',
  done: 'Complete',
  failed: 'Failed',
};

function pilotColor(status: AutopilotMission['status']): string {
  if (status === 'active') return 'var(--color-accent)';
  if (status === 'paused') return 'var(--color-warn)';
  if (status === 'failed') return 'var(--color-danger)';
  return 'var(--color-text-dim)';
}

/** Re-render on a slow clock so "in 4m" countdowns stay honest. */
function useNow(stepMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), stepMs);
    return () => window.clearInterval(id);
  }, [stepMs]);
  return now;
}

function untilLabel(at: number, now: number): string {
  const ms = at - now;
  if (ms <= 0) return 'now';
  const min = Math.round(ms / 60_000);
  if (min < 1) return '<1m';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

interface TargetOption {
  key: string;
  label: string;
  target: StationTarget;
}

type FormMode = 'oneshot' | 'autopilot' | null;

const INTERVAL_CHOICES = [5, 10, 15, 30, 60, 120];

export default function SchedulerDock(): JSX.Element {
  const prompts = usePromptSchedule((s) => s.prompts);
  const autopilots = usePromptSchedule((s) => s.autopilots);
  const schedule = usePromptSchedule((s) => s.schedule);
  const cancel = usePromptSchedule((s) => s.cancel);
  const addAutopilot = usePromptSchedule((s) => s.addAutopilot);
  const removeAutopilot = usePromptSchedule((s) => s.removeAutopilot);
  const pauseAutopilot = usePromptSchedule((s) => s.pauseAutopilot);
  const resumeAutopilot = usePromptSchedule((s) => s.resumeAutopilot);
  const stations = useVibeStations((s) => s.stations);
  const now = useNow();

  const [mode, setMode] = useState<FormMode>(null);

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
  const pickedTarget = (): TargetOption | null =>
    options.find((o) => o.key === targetKey) ?? options[0] ?? null;

  // ---- one-shot form state ----
  const [prompt, setPrompt] = useState('');
  const [when, setWhen] = useState('');

  // ---- autopilot form state ----
  const [vision, setVision] = useState('');
  const [intervalMin, setIntervalMin] = useState(10);
  const [maxRuns, setMaxRuns] = useState(10);

  const submitOneShot = () => {
    const chosen = pickedTarget();
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
    setMode(null);
    toast(`Scheduled on ${chosen.label.replace(' (not open)', '')}`, 'success');
  };

  const submitAutopilot = () => {
    const chosen = pickedTarget();
    if (!chosen) {
      toast('Pick a station for the autopilot', 'error');
      return;
    }
    const text = vision.trim();
    if (text.length < 12) {
      toast('Describe your vision in a sentence or two', 'error');
      return;
    }
    addAutopilot(chosen.target, text, { intervalMin, maxRuns });
    setVision('');
    setMode(null);
    toast(
      `Autopilot live on ${chosen.label.replace(' (not open)', '')} — first step lands within a minute`,
      'success',
    );
  };

  const liveCount =
    autopilots.filter((a) => a.status === 'active').length +
    prompts.filter((p) => p.status === 'queued' || p.status === 'preparing').length;

  const nextFireAt = useMemo(() => {
    const times = [
      ...autopilots.filter((a) => a.status === 'active').map((a) => a.nextRunAt),
      ...prompts
        .filter((p) => p.status === 'queued' || p.status === 'preparing')
        .map((p) => p.scheduledFor),
    ];
    return times.length ? Math.min(...times) : null;
  }, [autopilots, prompts]);

  const orderedPrompts = useMemo(
    () => [...prompts].sort((a, b) => a.scheduledFor - b.scheduledFor),
    [prompts],
  );
  const orderedPilots = useMemo(
    () => [...autopilots].sort((a, b) => b.createdAt - a.createdAt),
    [autopilots],
  );
  const hasItems = orderedPilots.length > 0 || orderedPrompts.length > 0;

  return (
    <section className={`schedock ${liveCount > 0 ? 'is-live' : ''}`} aria-label="Scheduler">
      <header className="schedock__head">
        <div className="schedock__brand">
          <span className="schedock__icon">
            <Sparkles size={17} strokeWidth={1.9} />
          </span>
          <div>
            <h2 className="schedock__title">Scheduler</h2>
            <p className="schedock__sub">
              Queue a prompt for later — or hand the AI your vision and let
              Autopilot drive the station, step by step.
            </p>
          </div>
        </div>
        <div className="schedock__meta">
          {liveCount > 0 && (
            <span className="schedock__chip">
              <span className="schedock__pulse" />
              {liveCount} live
            </span>
          )}
          {nextFireAt !== null && (
            <span className="schedock__chip schedock__chip--dim">
              next in {untilLabel(nextFireAt, now)}
            </span>
          )}
        </div>
        <div className="schedock__cta">
          <button
            type="button"
            className={mode === 'oneshot' ? 'btn-accent' : 'btn-outline'}
            onClick={() => setMode(mode === 'oneshot' ? null : 'oneshot')}
          >
            <CalendarClock size={14} /> One-shot
          </button>
          <button
            type="button"
            className={mode === 'autopilot' ? 'btn-accent' : 'btn-outline'}
            onClick={() => setMode(mode === 'autopilot' ? null : 'autopilot')}
          >
            <Sparkles size={14} /> Autopilot
          </button>
        </div>
      </header>

      {mode === 'oneshot' && (
        <div className="schedock__form">
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
              placeholder="Prompt to run, exactly as written…"
              aria-label="Prompt"
            />
            <button type="button" className="btn-accent" onClick={submitOneShot}>
              <CalendarClock size={14} /> Schedule
            </button>
          </div>
          <p className="schedock__hint">
            Sends this exact prompt once, at your time. You can also ask the
            assistant — “run ‘fix the tests’ on Claude Code #1 at 9pm”.
          </p>
        </div>
      )}

      {mode === 'autopilot' && (
        <div className="schedock__form">
          <textarea
            className="schedock__vision"
            value={vision}
            onChange={(e) => setVision(e.target.value)}
            rows={3}
            placeholder="Describe your vision… e.g. “Build a landing page with a hero, pricing and FAQ, wire the waitlist form to Supabase, then keep tightening the design and fixing anything broken until it feels shippable.”"
            aria-label="Autopilot vision"
          />
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
            <label className="schedock__field">
              every
              <select
                value={intervalMin}
                onChange={(e) => setIntervalMin(Number(e.target.value))}
                aria-label="Minutes between steps"
              >
                {INTERVAL_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
            <label className="schedock__field">
              max
              <input
                type="number"
                min={MIN_MAX_RUNS}
                max={MAX_MAX_RUNS}
                value={maxRuns}
                onChange={(e) =>
                  setMaxRuns(
                    Math.min(
                      MAX_MAX_RUNS,
                      Math.max(MIN_MAX_RUNS, Number.parseInt(e.target.value, 10) || MIN_MAX_RUNS),
                    ),
                  )
                }
                aria-label="Maximum steps"
              />
              steps
            </label>
            <button type="button" className="btn-accent" onClick={submitAutopilot}>
              <Sparkles size={14} /> Start autopilot
            </button>
          </div>
          <p className="schedock__hint">
            At every interval the AI writes the next prompt itself — from your
            vision, what it already sent, and the station’s terminal output —
            and stops when the vision is done or the step budget is spent.
            Pause or stop anytime; one-shot scheduling is untouched.
          </p>
        </div>
      )}

      {hasItems && (
        <div className="schedock__list sched-list">
          {orderedPilots.map((a) => (
            <div key={a.id} className="sched-row schedock__pilot">
              <div className="sched-row__main">
                <div className="sched-row__title">
                  <Sparkles size={12} style={{ marginRight: 6, verticalAlign: -1 }} />
                  {a.vision}
                </div>
                <div className="sched-row__meta">
                  <span>{targetLabel(a.target)}</span>
                  <span>·</span>
                  <span>every {a.intervalMin}m</span>
                  <span>·</span>
                  <span>
                    step {a.runsDone}/{a.maxRuns}
                  </span>
                  <span>·</span>
                  <span style={{ color: pilotColor(a.status) }}>{PILOT_LABEL[a.status]}</span>
                  {a.status === 'active' && (
                    <>
                      <span>·</span>
                      <span>next in {untilLabel(a.nextRunAt, now)}</span>
                    </>
                  )}
                  {a.lastError && (
                    <span style={{ color: a.status === 'done' ? 'var(--color-text-dim)' : 'var(--color-danger)' }}>
                      · {a.lastError}
                    </span>
                  )}
                </div>
                {a.history.length > 0 && (
                  <div className="schedock__lastprompt" title={a.history[a.history.length - 1]!.prompt}>
                    ↳ {a.history[a.history.length - 1]!.prompt}
                  </div>
                )}
                <div className="schedock__progress" aria-hidden>
                  <span
                    className="schedock__progress-fill"
                    style={{ width: `${Math.min(100, (a.runsDone / a.maxRuns) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="schedock__rowctl">
                {(a.status === 'active' || a.status === 'paused' || a.status === 'failed') && (
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() =>
                      a.status === 'active' ? pauseAutopilot(a.id) : resumeAutopilot(a.id)
                    }
                    title={a.status === 'active' ? 'Pause autopilot' : 'Resume autopilot'}
                  >
                    {a.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => removeAutopilot(a.id)}
                  title={a.status === 'active' ? 'Stop and remove' : 'Remove'}
                >
                  {a.status === 'active' ? <X size={13} /> : <Trash2 size={13} />}
                </button>
              </div>
            </div>
          ))}

          {orderedPrompts.map((p) => (
            <div key={p.id} className="sched-row">
              <div className="sched-row__main">
                <div className="sched-row__title">{p.prompt}</div>
                <div className="sched-row__meta">
                  <span>{targetLabel(p.target)}</span>
                  <span>·</span>
                  <span>{new Date(p.scheduledFor).toLocaleString()}</span>
                  <span>·</span>
                  <span style={{ color: statusColor(p.status) }}>{STATUS_LABEL[p.status]}</span>
                  {p.lastError && (
                    <span style={{ color: 'var(--color-danger)' }}>· {p.lastError}</span>
                  )}
                </div>
              </div>
              <div className="schedock__rowctl">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => cancel(p.id)}
                  title={p.status === 'done' ? 'Remove' : 'Cancel'}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
