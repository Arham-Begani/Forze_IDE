import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GripHorizontal,
  Maximize2,
  Minimize2,
  Minus,
  PanelTopClose,
  PanelTopOpen,
  Plus,
  RotateCw,
  SquareTerminal,
  Trash2,
  X,
} from 'lucide-react';
import VibeTerminal from '../../panels/VibeTerminal';
import ScheduledPromptsPanel from './ScheduledPromptsPanel';
import AgentBusPanel from './AgentBusPanel';
import { useProject } from '../../workbench/projectStore';
import { useAgentBus } from '../../workbench/agentBusStore';
import {
  AGENTS,
  agentDef,
  MAX_COL_SPAN,
  MAX_STATION_HEIGHT,
  MAX_STATIONS,
  MIN_STATION_HEIGHT,
  stationOrdinal,
  targetLabel,
  useVibeStations,
  type AgentId,
  type Station,
} from '../../workbench/vibeStationsStore';

/** Pixel gap between grid cells — kept in sync with `.vibegrid { gap }` so resize
 *  math can convert a pointer position into a whole-column span. */
const GRID_GAP = 16;

/** A station's bus identity counts as "live" if it pinged within this window —
 *  kept in sync with the Context Bus panel's own active window. */
const BUS_ACTIVE_WINDOW_MS = 60_000;

export default function VibeStationsPage(): JSX.Element {
  const stations = useVibeStations((s) => s.stations);
  const columns = useVibeStations((s) => s.columns);
  const addStation = useVibeStations((s) => s.addStation);
  const launchSession = useVibeStations((s) => s.launchSession);
  const removeStation = useVibeStations((s) => s.removeStation);
  const restartStation = useVibeStations((s) => s.restartStation);
  const clearAll = useVibeStations((s) => s.clearAll);
  const setColumns = useVibeStations((s) => s.setColumns);
  const setStationSize = useVibeStations((s) => s.setStationSize);
  const toggleStationBar = useVibeStations((s) => s.toggleStationBar);
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const busEnabled = useAgentBus((s) => s.enabled);
  const busRoster = useAgentBus((s) => s.bus.roster);

  const startPolling = useAgentBus((s) => s.startPolling);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const remaining = MAX_STATIONS - stations.length;

  // Mirror the workspace bus file into the store while this page is open.
  useEffect(() => {
    if (!workspaceRoot) return;
    return startPolling(workspaceRoot);
  }, [workspaceRoot, startPolling]);

  return (
    <div className="apppage vibepage">
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
            ref={gridRef}
            className="vibegrid"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {stations.map((station) => {
              const label = targetLabel({
                agentId: station.agentId,
                ordinal: stationOrdinal(stations, station),
              });
              const rosterEntry = busEnabled ? busRoster[label] : undefined;
              const busStatus = rosterEntry
                ? {
                    active:
                      typeof rosterEntry.lastSeen === 'number' &&
                      Date.now() - rosterEntry.lastSeen < BUS_ACTIVE_WINDOW_MS,
                    status: rosterEntry.status ?? null,
                  }
                : null;
              return (
              <StationCard
                key={station.id}
                station={station}
                columns={columns}
                gridRef={gridRef}
                busStation={
                  busEnabled && workspaceRoot
                    ? { root: workspaceRoot, agentId: station.agentId, label }
                    : undefined
                }
                busStatus={busStatus}
                onRestart={() => restartStation(station.id)}
                onClose={() => removeStation(station.id)}
                onResize={(size) => setStationSize(station.id, size)}
                onToggleBar={() => toggleStationBar(station.id)}
              />
              );
            })}
          </div>
        )}
      </div>

      <AgentBusPanel />
      <ScheduledPromptsPanel />
    </div>
  );
}

function StationCard({
  station,
  columns,
  gridRef,
  busStation,
  busStatus,
  onRestart,
  onClose,
  onResize,
  onToggleBar,
}: {
  station: Station;
  columns: number;
  gridRef: React.RefObject<HTMLDivElement>;
  busStation?: { root: string; agentId: string; label: string };
  /** Live Context Bus presence for this station's agent, when the bus is on. */
  busStatus?: { active: boolean; status: string | null } | null;
  onRestart: () => void;
  onClose: () => void;
  onResize: (size: { colSpan?: number; height?: number }) => void;
  onToggleBar: () => void;
}): JSX.Element {
  const def = agentDef(station.agentId);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // A station can't span more columns than the grid currently shows.
  const effectiveSpan = Math.min(station.colSpan, columns);
  const isWide = columns > 1 && effectiveSpan >= columns;

  // While dragging the resize handle we hold the live size locally and only
  // commit it to the (persisted) store on pointer-up — writing every pointermove
  // would hammer localStorage and stall the main thread.
  const [drag, setDrag] = useState<{ colSpan: number; height: number } | null>(null);
  const span = drag ? drag.colSpan : effectiveSpan;
  const height = drag ? drag.height : station.height;

  const onResizeStart = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const card = cardRef.current;
      const grid = gridRef.current;
      if (!card || !grid) return;
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);

      const cardRect = card.getBoundingClientRect();
      const gridWidth = grid.getBoundingClientRect().width;
      // Width of a single grid column (track), inverting the gap arithmetic.
      const colUnit = (gridWidth - GRID_GAP * (columns - 1)) / columns;
      const startY = e.clientY;
      const startHeight = cardRect.height;
      let next = { colSpan: effectiveSpan, height: startHeight };

      const move = (ev: PointerEvent) => {
        // Width: snap to the column whose right edge is nearest the pointer.
        const widthPx = ev.clientX - cardRect.left + GRID_GAP;
        const nextSpan = Math.min(
          Math.min(MAX_COL_SPAN, columns),
          Math.max(1, Math.round(widthPx / (colUnit + GRID_GAP))),
        );
        // Height: free-drag in pixels, clamped to sane bounds.
        const nextHeight = Math.min(
          MAX_STATION_HEIGHT,
          Math.max(MIN_STATION_HEIGHT, startHeight + (ev.clientY - startY)),
        );
        next = { colSpan: nextSpan, height: nextHeight };
        setDrag(next);
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        setDrag(null);
        onResize(next);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    },
    [columns, effectiveSpan, gridRef, onResize],
  );

  return (
    <div
      ref={cardRef}
      className={`vibestation ${station.barHidden ? 'is-barless' : ''} ${drag ? 'is-resizing' : ''}`}
      style={{
        ['--agent' as string]: def.color,
        gridColumn: `span ${span}`,
        height: `${height}px`,
      }}
    >
      {station.barHidden ? (
        // Bar removed: floating controls fade in on hover so you can still
        // restore the bar or close the station.
        <div className="vibestation__float">
          <button type="button" onClick={onToggleBar} title="Show title bar">
            <PanelTopOpen size={13} />
          </button>
          <button type="button" onClick={onClose} title="Close station">
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="vibestation__bar">
          <span className="vibestation__id">
            <span
              className={`vibestation__dot ${busStatus ? (busStatus.active ? 'is-live' : 'is-idle') : ''}`}
              title={
                busStatus
                  ? busStatus.active
                    ? 'Connected to the Context Bus'
                    : 'On the bus, idle'
                  : undefined
              }
            />
            {def.label}
            {busStatus?.status && (
              <span className="vibestation__status" title={busStatus.status}>
                {busStatus.status}
              </span>
            )}
          </span>
          <div className="vibestation__actions">
            {columns > 1 && (
              <button
                type="button"
                onClick={() => onResize({ colSpan: isWide ? 1 : columns })}
                title={isWide ? 'Shrink width' : 'Expand to full width'}
              >
                {isWide ? (
                  <Minimize2 size={18} strokeWidth={2.25} />
                ) : (
                  <Maximize2 size={18} strokeWidth={2.25} />
                )}
              </button>
            )}
            <button type="button" onClick={onToggleBar} title="Hide title bar">
              <PanelTopClose size={18} strokeWidth={2.25} />
            </button>
            <button type="button" onClick={onRestart} title="Restart agent">
              <RotateCw size={18} strokeWidth={2.25} />
            </button>
            <button type="button" onClick={onClose} title="Close station">
              <X size={18} strokeWidth={2.25} />
            </button>
          </div>
        </div>
      )}
      <div className="vibestation__body">
        {/* `runKey` in the React key forces a clean remount on restart. */}
        <VibeTerminal
          key={station.runKey}
          stationId={station.id}
          cwd={station.cwd}
          launchCommand={def.command}
          busStation={busStation}
        />
      </div>
      <button
        type="button"
        className="vibestation__resize"
        onPointerDown={onResizeStart}
        title="Drag to resize"
        aria-label="Resize station"
      >
        <GripHorizontal size={12} />
      </button>
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
