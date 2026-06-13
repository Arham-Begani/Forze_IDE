import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  commitStreak,
  commitsByDay,
  commitsByWeek,
  computeTasks,
  laneBucket,
} from './builderAnalytics';
import type { GitCommit } from '../lib/git';
import type { Card, LaneDef } from './kanbanStore';

/** Minimal GitCommit at a given local date (serialized like git_log's %aI). */
function commitAt(y: number, mo: number, d: number, h = 9): GitCommit {
  return {
    hash: `${y}${mo}${d}${h}`,
    short: `${y}${mo}${d}`.slice(0, 7),
    author: 'You',
    date: new Date(y, mo, d, h).toISOString(),
    subject: 'work',
    body: '',
  };
}

// Anchor "now" to Wednesday 2026-06-10 12:00 local. Week (Mon–Sun) is Jun 8–14.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 10, 12, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('laneBucket', () => {
  it('maps done-ish / doing-ish / everything-else labels', () => {
    expect(laneBucket('Done')).toBe('done');
    expect(laneBucket('Shipped')).toBe('done');
    expect(laneBucket('In Review')).toBe('done');
    expect(laneBucket('In Progress')).toBe('doing');
    expect(laneBucket('WIP')).toBe('doing');
    expect(laneBucket('Building')).toBe('doing');
    expect(laneBucket('Backlog')).toBe('todo');
    expect(laneBucket('To do')).toBe('todo');
    expect(laneBucket('Random ideas')).toBe('todo');
  });
});

describe('computeTasks', () => {
  const lanes: LaneDef[] = [
    { id: 'l1', label: 'To do', color: '#000' },
    { id: 'l2', label: 'In Progress', color: '#000' },
    { id: 'l3', label: 'Done', color: '#000' },
  ];
  const card = (id: string, laneId: string): Card => ({ id, title: id, laneId, priority: 'medium' });

  it('counts cards into coarse buckets and ignores orphans', () => {
    const cards = [
      card('a', 'l1'),
      card('b', 'l2'),
      card('c', 'l3'),
      card('d', 'l3'),
      card('orphan', 'gone'), // lane no longer exists → ignored
    ];
    expect(computeTasks(lanes, cards)).toEqual({ todo: 1, doing: 1, done: 2, total: 4 });
  });

  it('returns all zeros for an empty board', () => {
    expect(computeTasks(lanes, [])).toEqual({ todo: 0, doing: 0, done: 0, total: 0 });
  });
});

describe('commitStreak', () => {
  it('counts consecutive days ending today', () => {
    const streak = commitStreak([
      commitAt(2026, 5, 10),
      commitAt(2026, 5, 9),
      commitAt(2026, 5, 8),
    ]);
    expect(streak).toBe(3);
  });

  it('applies the grace window when today has no commit yet', () => {
    expect(commitStreak([commitAt(2026, 5, 9)])).toBe(1);
  });

  it('is broken when the most recent commit is older than yesterday', () => {
    expect(commitStreak([commitAt(2026, 5, 8)])).toBe(0);
  });

  it('stops at the first gap', () => {
    // today + day-before-yesterday (yesterday missing) → only today counts.
    expect(commitStreak([commitAt(2026, 5, 10), commitAt(2026, 5, 8)])).toBe(1);
  });

  it('returns 0 with no commits', () => {
    expect(commitStreak([])).toBe(0);
  });
});

describe('commitsByDay', () => {
  it('buckets commits into the current Mon–Sun week', () => {
    const days = commitsByDay([
      commitAt(2026, 5, 8), // Mon
      commitAt(2026, 5, 10), // Wed
      commitAt(2026, 5, 10, 18), // Wed again
      commitAt(2026, 5, 14), // Sun
      commitAt(2026, 5, 7), // previous Sun → outside the week
    ]);
    expect(days.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(days[0]!.value).toBe(1); // Mon
    expect(days[2]!.value).toBe(2); // Wed
    expect(days[6]!.value).toBe(1); // Sun
    expect(days.reduce((s, d) => s + d.value, 0)).toBe(4); // the prior-Sun commit excluded
  });
});

describe('commitsByWeek', () => {
  it('produces 8 weekly buckets ending with the current week', () => {
    const weeks = commitsByWeek([commitAt(2026, 5, 10)]);
    expect(weeks).toHaveLength(8);
    expect(weeks[7]!.value).toBe(1); // current week
    expect(weeks.reduce((s, w) => s + w.value, 0)).toBe(1);
  });

  it('places a commit from a prior week in an earlier bucket', () => {
    const weeks = commitsByWeek([commitAt(2026, 5, 1)]); // week of Jun 1 (prior)
    expect(weeks[7]!.value).toBe(0);
    expect(weeks[6]!.value).toBe(1);
  });

  it('drops commits older than the 8-week window', () => {
    const weeks = commitsByWeek([commitAt(2026, 3, 1)]); // April → out of window
    expect(weeks.reduce((s, w) => s + w.value, 0)).toBe(0);
  });
});
