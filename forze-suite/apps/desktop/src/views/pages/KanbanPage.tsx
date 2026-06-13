import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, SquareKanban, Trash2, X } from 'lucide-react';
import {
  LANE_PALETTE,
  PRIORITIES,
  labelColor,
  useKanban,
  type Card,
  type LaneDef,
  type Priority,
} from '../../workbench/kanbanStore';
import { useTeam, type Member } from '../../workbench/teamStore';
import { confirmModal } from '../../shell/modal';

const initials = (name: string): string =>
  name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** Stable color for a member avatar, so each person reads consistently. */
const MEMBER_COLORS = ['#38bdf8', '#a855f7', '#f59e0b', '#22c55e', '#ec4899', '#14b8a6', '#6366f1'];
const memberColor = (id: string): string => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return MEMBER_COLORS[h % MEMBER_COLORS.length]!;
};

const nextPriority = (p: Priority): Priority => {
  const i = PRIORITIES.findIndex((x) => x.id === p);
  return PRIORITIES[(i + 1) % PRIORITIES.length]!.id;
};

const nextColor = (color: string): string => {
  const i = LANE_PALETTE.indexOf(color);
  return LANE_PALETTE[(i + 1) % LANE_PALETTE.length]!;
};

interface DropTarget {
  laneId: string;
  beforeId: string | null;
}

export default function KanbanPage(): JSX.Element {
  const lanes = useKanban((s) => s.lanes);
  const cards = useKanban((s) => s.cards);
  const addLane = useKanban((s) => s.addLane);
  const renameLane = useKanban((s) => s.renameLane);
  const setLaneColor = useKanban((s) => s.setLaneColor);
  const deleteLane = useKanban((s) => s.deleteLane);
  const moveLane = useKanban((s) => s.moveLane);
  const addCard = useKanban((s) => s.addCard);
  const moveCard = useKanban((s) => s.moveCard);
  const patchCard = useKanban((s) => s.patchCard);
  const deleteCard = useKanban((s) => s.deleteCard);
  const unassignMissing = useKanban((s) => s.unassignMissing);
  const members = useTeam((s) => s.members);

  // Keep card assignees in sync with the live roster — if a teammate leaves,
  // their cards become unassigned rather than pointing at a ghost.
  useEffect(() => {
    unassignMissing(new Set(members.map((m) => m.id)));
  }, [members, unassignMissing]);

  const memberById = useMemo(() => {
    const map = new Map<string, Member>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

  // Assignee cycle order: unassigned → each member → back.
  const assigneeCycle = useMemo<(string | undefined)[]>(
    () => [undefined, ...members.map((m) => m.id)],
    [members],
  );
  const cycleAssignee = (card: Card) => {
    const i = assigneeCycle.indexOf(card.assigneeId);
    const next = assigneeCycle[(i + 1) % assigneeCycle.length];
    patchCard(card.id, { assigneeId: next });
  };

  const byLane = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const l of lanes) map.set(l.id, []);
    for (const c of cards) map.get(c.laneId)?.push(c);
    return map;
  }, [cards, lanes]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [over, setOver] = useState<DropTarget | null>(null);
  // Ref mirrors `over` so the drop handler reads the live target without a
  // stale-closure race against the dragOver state update.
  const overRef = useRef<DropTarget | null>(null);
  const setTarget = (t: DropTarget | null) => {
    overRef.current = t;
    setOver(t);
  };

  const [addingCardLane, setAddingCardLane] = useState<string | null>(null);
  const [addText, setAddText] = useState('');
  const [editingLaneId, setEditingLaneId] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnText, setNewColumnText] = useState('');

  const handleDrop = (e: React.DragEvent, laneId: string) => {
    e.preventDefault();
    // Prefer the native payload so the drop is correct regardless of React
    // state timing; fall back to the tracked id.
    const id = e.dataTransfer.getData('text/plain') || draggingId;
    const target = overRef.current;
    setDraggingId(null);
    setTarget(null);
    if (!id) return;
    moveCard(id, target?.laneId ?? laneId, target?.beforeId ?? null);
  };

  const submitAddCard = (laneId: string) => {
    if (!addText.trim()) {
      setAddingCardLane(null);
      return;
    }
    addCard(laneId, addText);
    setAddText('');
  };

  const submitAddColumn = () => {
    const text = newColumnText.trim();
    if (text) addLane(text);
    setNewColumnText('');
    setAddingColumn(false);
  };

  const removeLane = async (lane: LaneDef) => {
    const count = byLane.get(lane.id)?.length ?? 0;
    if (count > 0) {
      const ok = await confirmModal({
        title: 'Delete column',
        message: `Delete “${lane.label}” and its ${count} card${count === 1 ? '' : 's'}?`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
    }
    deleteLane(lane.id);
  };

  const showEmptyState = lanes.length === 0 && !addingColumn;

  return (
    <div className="apppage kanban">
      <div className="apppage__header">
        <div>
          <h1 className="apppage__title">
            <SquareKanban size={20} strokeWidth={1.8} /> Kanban
          </h1>
          <p className="apppage__subtitle">
            A shared board the whole team can see and move · {cards.length} card
            {cards.length === 1 ? '' : 's'} across {lanes.length} column
            {lanes.length === 1 ? '' : 's'}.
          </p>
        </div>
        <div className="kb-stack" title={`${members.length} members on this board`}>
          {members.slice(0, 6).map((m) => (
            <span
              key={m.id}
              className="kb-stack__avatar"
              style={{ background: memberColor(m.id) }}
              title={m.name}
            >
              {initials(m.name)}
            </span>
          ))}
          {members.length > 6 && <span className="kb-stack__more">+{members.length - 6}</span>}
        </div>
      </div>

      {showEmptyState ? (
        <div className="kb-empty">
          <SquareKanban size={40} strokeWidth={1.4} />
          <h2>No columns yet</h2>
          <p>
            Build the board around your workflow. Create columns like “To do”,
            “Designing”, “Shipped” — whatever fits how you work.
          </p>
          <button type="button" className="btn-accent" onClick={() => setAddingColumn(true)}>
            <Plus size={15} /> Add your first column
          </button>
        </div>
      ) : (
        <div className="kb-board">
          {lanes.map((lane, laneIdx) => {
            const laneCards = byLane.get(lane.id) ?? [];
            const isOverLane = over?.laneId === lane.id;
            return (
              <section
                key={lane.id}
                className={`kb-lane ${isOverLane ? 'is-over' : ''}`}
                style={{ '--lane': lane.color, '--lane-soft': `${lane.color}22` } as React.CSSProperties}
                onDragOver={(e) => {
                  if (!draggingId) return;
                  e.preventDefault();
                  // Hovering the column itself (below the cards) appends to the lane.
                  setTarget({ laneId: lane.id, beforeId: null });
                }}
                onDrop={(e) => handleDrop(e, lane.id)}
              >
                <header className="kb-lane__head">
                  <button
                    type="button"
                    className="kb-lane__dot"
                    title="Change color"
                    onClick={() => setLaneColor(lane.id, nextColor(lane.color))}
                  />
                  {editingLaneId === lane.id ? (
                    <input
                      className="kb-lane__rename"
                      autoFocus
                      defaultValue={lane.label}
                      onBlur={(e) => {
                        renameLane(lane.id, e.target.value);
                        setEditingLaneId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          renameLane(lane.id, (e.target as HTMLInputElement).value);
                          setEditingLaneId(null);
                        }
                        if (e.key === 'Escape') setEditingLaneId(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="kb-lane__label"
                      title="Rename column"
                      onClick={() => setEditingLaneId(lane.id)}
                    >
                      {lane.label}
                    </button>
                  )}
                  <span className="kb-count">{laneCards.length}</span>
                  <div className="kb-lane__actions">
                    <button
                      type="button"
                      title="Move left"
                      disabled={laneIdx === 0}
                      onClick={() => moveLane(lane.id, -1)}
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <button
                      type="button"
                      title="Move right"
                      disabled={laneIdx === lanes.length - 1}
                      onClick={() => moveLane(lane.id, 1)}
                    >
                      <ChevronRight size={13} />
                    </button>
                    <button
                      type="button"
                      title="Delete column"
                      className="kb-lane__del"
                      onClick={() => void removeLane(lane)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </header>

                <div className="kb-col">
                  {laneCards.map((card) => {
                    const prio = PRIORITIES.find((p) => p.id === card.priority)!;
                    const assignee = card.assigneeId ? memberById.get(card.assigneeId) : undefined;
                    const showLine = isOverLane && over?.beforeId === card.id && draggingId !== card.id;
                    return (
                      <div key={card.id} className="kb-card-wrap">
                        {showLine && <div className="kb-insert" />}
                        <article
                          className={`kb-card ${draggingId === card.id ? 'is-dragging' : ''}`}
                          style={{ ['--prio' as string]: prio.color } as React.CSSProperties}
                          draggable
                          onDragStart={(e) => {
                            setDraggingId(card.id);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', card.id);
                          }}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setTarget(null);
                          }}
                          onDragOver={(e) => {
                            if (!draggingId) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            const after = e.clientY > rect.top + rect.height / 2;
                            const idx = laneCards.findIndex((c) => c.id === card.id);
                            const beforeId = after ? (laneCards[idx + 1]?.id ?? null) : card.id;
                            setTarget({ laneId: lane.id, beforeId });
                          }}
                        >
                          {card.label && (
                            <span
                              className="kb-card__label"
                              style={{
                                color: labelColor(card.label),
                                background: `${labelColor(card.label)}1f`,
                                borderColor: `${labelColor(card.label)}55`,
                              }}
                            >
                              {card.label}
                            </span>
                          )}
                          <div className="kb-card__title">{card.title}</div>
                          <div className="kb-card__foot">
                            <button
                              type="button"
                              className="kb-prio"
                              title={`Priority: ${prio.label} — click to change`}
                              onClick={() => patchCard(card.id, { priority: nextPriority(card.priority) })}
                            >
                              <span className="kb-prio__dot" />
                              {prio.label}
                            </button>
                            <button
                              type="button"
                              className="kb-assignee"
                              title={assignee ? `Assigned to ${assignee.name} — click to reassign` : 'Unassigned — click to assign'}
                              onClick={() => cycleAssignee(card)}
                            >
                              {assignee ? (
                                <span className="kb-avatar" style={{ background: memberColor(assignee.id) }}>
                                  {initials(assignee.name)}
                                </span>
                              ) : (
                                <span className="kb-avatar kb-avatar--empty">+</span>
                              )}
                            </button>
                            <button
                              type="button"
                              className="kb-card__del"
                              title="Delete card"
                              onClick={() => deleteCard(card.id)}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </article>
                      </div>
                    );
                  })}

                  {/* Append indicator when dropping at the end of the lane. */}
                  {isOverLane && over?.beforeId === null && draggingId && (
                    <div className="kb-insert" />
                  )}

                  {addingCardLane === lane.id ? (
                    <div className="kb-add">
                      <input
                        autoFocus
                        value={addText}
                        onChange={(e) => setAddText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitAddCard(lane.id);
                          if (e.key === 'Escape') {
                            setAddingCardLane(null);
                            setAddText('');
                          }
                        }}
                        onBlur={() => submitAddCard(lane.id)}
                        placeholder="Card title…"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="kb-add-btn"
                      onClick={() => {
                        setAddingCardLane(lane.id);
                        setAddText('');
                      }}
                    >
                      <Plus size={14} /> Add card
                    </button>
                  )}
                </div>
              </section>
            );
          })}

          {addingColumn ? (
            <div className="kb-lane kb-lane--new">
              <input
                className="kb-newcol__input"
                autoFocus
                value={newColumnText}
                onChange={(e) => setNewColumnText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitAddColumn();
                  if (e.key === 'Escape') {
                    setNewColumnText('');
                    setAddingColumn(false);
                  }
                }}
                onBlur={submitAddColumn}
                placeholder="Column name…"
              />
            </div>
          ) : (
            <button type="button" className="kb-addcol" onClick={() => setAddingColumn(true)}>
              <Plus size={16} /> Add column
            </button>
          )}
        </div>
      )}
    </div>
  );
}
