import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, RotateCw, SquareTerminal, Trash2, X } from 'lucide-react';
import VibeTerminal from '../../panels/VibeTerminal';
import { useProject } from '../../workbench/projectStore';
import {
  AGENTS,
  agentDef,
  MAX_STATIONS,
  useVibeStations,
  type AgentId,
  type Station,
} from '../../workbench/vibeStationsStore';

export default function VibeStationsPage(): JSX.Element {
  const stations = useVibeStations((s) => s.stations);
  const columns = useVibeStations((s) => s.columns);
  const addStation = useVibeStations((s) => s.addStation);
  const launchSession = useVibeStations((s) => s.launchSession);
  const removeStation = useVibeStations((s) => s.removeStation);
  const restartStation = useVibeStations((s) => s.restartStation);
  const clearAll = useVibeStations((s) => s.clearAll);
  const setColumns = useVibeStations((s) => s.setColumns);
  const workspaceRoot = useProject((s) => s.workspaceRoot);

  const remaining = MAX_STATIONS - stations.length;

  return (
    <div className="apppage">
      <header className="apppage__header">
        <div>
          <h1 className="apppage__title">
            <SquareTerminal size={22} strokeWidth={1.8} /> Vibe Stations
          </h1>
          <p className="apppage__subtitle">
            Run Claude Code, Codex, Antigravity, and OpenCode side by side. Spin up
            as many agents as you want and vibe-code in parallel — right inside the IDE.
          </p>
        </div>
        <div className="vibe-toolbar">
          {stations.length > 0 && (
            <div className="vibe-cols" role="group" aria-label="Grid columns">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`vibe-cols__btn ${columns === n ? 'is-active' : ''}`}
                  onClick={() => setColumns(n)}
                  title={`${n} column${n > 1 ? 's' : ''}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          {stations.length > 0 && (
            <button
              type="button"
              className="btn-outline"
              onClick={clearAll}
              title="Close all stations"
            >
              <Trash2 size={14} /> Clear
            </button>
          )}
          {stations.length > 0 && (
            <AddStationButton
              remaining={remaining}
              onLaunch={(id) => addStation(id, workspaceRoot ?? null)}
            />
          )}
        </div>
      </header>

      <div className="apppage__body vibepage__body">
        {stations.length === 0 ? (
          <SessionSetup
            onLaunch={(counts) => launchSession(counts, workspaceRoot ?? null)}
          />
        ) : (
          <div
            className="vibegrid"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {stations.map((station) => (
              <StationCard
                key={station.id}
                station={station}
                onRestart={() => restartStation(station.id)}
                onClose={() => removeStation(station.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StationCard({
  station,
  onRestart,
  onClose,
}: {
  station: Station;
  onRestart: () => void;
  onClose: () => void;
}): JSX.Element {
  const def = agentDef(station.agentId);
  return (
    <div className="vibestation" style={{ ['--agent' as string]: def.color }}>
      <div className="vibestation__bar">
        <span className="vibestation__id">
          <span className="vibestation__dot" />
          {def.label}
        </span>
        <div className="vibestation__actions">
          <button type="button" onClick={onRestart} title="Restart agent">
            <RotateCw size={13} />
          </button>
          <button type="button" onClick={onClose} title="Close station">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="vibestation__body">
        {/* `runKey` in the React key forces a clean remount on restart. */}
        <VibeTerminal
          key={station.runKey}
          cwd={station.cwd}
          launchCommand={def.command}
        />
      </div>
    </div>
  );
}

function SessionSetup({
  onLaunch,
}: {
  onLaunch: (counts: Record<AgentId, number>) => void;
}): JSX.Element {
  const [counts, setCounts] = useState<Record<AgentId, number>>({
    claude: 1,
    codex: 0,
    antigravity: 0,
    opencode: 0,
  });

  const total = useMemo(
    () => AGENTS.reduce((n, a) => n + (counts[a.id] ?? 0), 0),
    [counts],
  );

  const setCount = (id: AgentId, value: number) =>
    setCounts((c) => {
      const sumOthers = AGENTS.reduce(
        (n, a) => n + (a.id === id ? 0 : c[a.id] ?? 0),
        0,
      );
      const clamped = Math.max(
        0,
        Math.min(value, MAX_STATIONS - sumOthers),
      );
      return { ...c, [id]: clamped };
    });

  return (
    <div className="vibe-setup">
      <div className="vibe-setup__head">
        <div className="vibe-empty__icon">
          <SquareTerminal size={30} strokeWidth={1.5} />
        </div>
        <h2 className="vibe-empty__title">Set up your vibe session</h2>
        <p className="vibe-empty__sub">
          Choose how many of each agent to launch. They open side by side in a live
          grid — up to {MAX_STATIONS} terminals combined.
        </p>
      </div>

      <div className="vibe-setup__list">
        {AGENTS.map((agent) => {
          const value = counts[agent.id] ?? 0;
          const atCap = total >= MAX_STATIONS;
          return (
            <div
              key={agent.id}
              className="vibe-setup__row"
              style={{ ['--agent' as string]: agent.color }}
            >
              <span className="vibe-setup__dot" />
              <span className="vibe-setup__meta">
                <span className="vibe-setup__label">{agent.label}</span>
                <span className="vibe-setup__blurb">{agent.blurb}</span>
              </span>
              <div className="vibe-stepper">
                <button
                  type="button"
                  className="vibe-stepper__btn"
                  onClick={() => setCount(agent.id, value - 1)}
                  disabled={value <= 0}
                  aria-label={`Fewer ${agent.label}`}
                >
                  <Minus size={14} />
                </button>
                <input
                  className="vibe-stepper__value"
                  type="number"
                  min={0}
                  max={MAX_STATIONS}
                  value={value}
                  onChange={(e) =>
                    setCount(agent.id, Number.parseInt(e.target.value, 10) || 0)
                  }
                  aria-label={`Number of ${agent.label}`}
                />
                <button
                  type="button"
                  className="vibe-stepper__btn"
                  onClick={() => setCount(agent.id, value + 1)}
                  disabled={atCap}
                  aria-label={`More ${agent.label}`}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="vibe-setup__foot">
        <span className={`vibe-setup__total ${total >= MAX_STATIONS ? 'is-max' : ''}`}>
          {total} / {MAX_STATIONS} agents
        </span>
        <button
          type="button"
          className="btn-accent"
          disabled={total === 0}
          onClick={() => onLaunch(counts)}
        >
          <SquareTerminal size={15} /> Launch session
        </button>
      </div>
    </div>
  );
}

function AddStationButton({
  remaining,
  onLaunch,
}: {
  remaining: number;
  onLaunch: (id: AgentId) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const disabled = remaining <= 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="vibe-add" ref={wrapRef}>
      <button
        type="button"
        className="btn-accent"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={disabled ? `Maximum ${MAX_STATIONS} agents reached` : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Plus size={15} /> New station
      </button>
      {open && !disabled && (
        <div className="vibe-menu" role="menu">
          {AGENTS.map((agent) => (
            <button
              key={agent.id}
              type="button"
              role="menuitem"
              className="vibe-menu__item"
              onClick={() => {
                onLaunch(agent.id);
                setOpen(false);
              }}
            >
              <span
                className="vibe-menu__dot"
                style={{ background: agent.color }}
              />
              <span>
                <span className="vibe-menu__label">{agent.label}</span>
                <span className="vibe-menu__blurb">{agent.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
