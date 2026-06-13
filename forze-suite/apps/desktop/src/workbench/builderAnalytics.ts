import { useEffect, useMemo, useState } from 'react';
import { useProject } from './projectStore';
import { useKanban, type Card, type LaneDef } from './kanbanStore';
import { useCommunity, computeReputation, timeAgo } from './communityStore';
import { useBipSchedule } from './bipScheduleStore';
import { useDiagnostics } from './diagnosticsStore';
import { useGitStatus } from './gitStatusStore';
import { useWorkspaceMetrics } from './useWorkspaceMetrics';
import { log as gitLog, type GitCommit } from '../lib/git';
import type { WorkspaceMetrics } from '../lib/projectMetrics';

/**
 * Aggregates the workspace's *real* local-first signals into the shape the
 * Dashboard and Analytics pages render. Everything here is derived from things
 * that actually happen in this workspace — git commits, the Kanban board, the
 * Build-in-Public queue, the Community feed, compiler problems — not seeded demo
 * numbers. The git commit log is the spine: it gives a genuine build-momentum
 * time series, a commit streak, and a recent-activity feed.
 */

export interface Series {
  label: string;
  value: number;
}

export type ActivityKind = 'commit' | 'post' | 'launch' | 'task';

export interface ActivityItem {
  id: string;
  title: string;
  meta: string;
  /** Sort key (epoch ms). */
  at: number;
  kind: ActivityKind;
}

export interface Achievement {
  id: string;
  label: string;
  earned: boolean;
  /** What unlocks it (shown when locked). */
  hint: string;
}

export interface TaskBreakdown {
  todo: number;
  doing: number;
  done: number;
  total: number;
}

export interface BuilderAnalytics {
  hasRepo: boolean;
  /** The git commit log is still being fetched. */
  loading: boolean;
  /** The workspace metrics walk is still running. */
  metricsLoading: boolean;

  // Codebase (real workspace walk)
  metrics: WorkspaceMetrics | null;

  // Git commit activity
  commits: GitCommit[];
  /** Total commits fetched (capped at FETCH_LIMIT; `commitsCapped` flags the cap). */
  totalCommits: number;
  commitsCapped: boolean;
  commitsThisWeek: number;
  streakDays: number;
  commitsPerWeek: Series[];
  commitsPerDay: Series[];
  /** Whether any commit lands in the charted window (drives empty states). */
  hasMomentum: boolean;

  // Kanban
  tasks: TaskBreakdown;
  taskDonut: { name: string; value: number; color: string }[];

  // Community + distribution
  reputation: number;
  posts: number;
  launches: number;
  scheduledPosts: number;
  publishedPosts: number;

  // Health
  branch: string | null;
  uncommitted: number;
  problems: number;

  // Derived feeds
  recentActivity: ActivityItem[];
  achievements: Achievement[];
}

const FETCH_LIMIT = 100;
const WEEKS = 8;

/** Session cache so navigating between Dashboard/Analytics doesn't re-shell-out. */
let logCache: { root: string; sig: string; commits: GitCommit[] } | null = null;

/** Local YYYY-M-D key for grouping commits by calendar day. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Midnight (local) of `d`. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday-anchored start of the week containing `d` (local midnight). */
function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7; // 0 = Monday
  s.setDate(s.getDate() - dow);
  return s;
}

/**
 * Consecutive calendar days ending today (or yesterday, as a grace window) on
 * which at least one commit landed. Exported for unit testing.
 */
export function commitStreak(commits: GitCommit[]): number {
  const days = new Set<string>();
  for (const c of commits) {
    const t = Date.parse(c.date);
    if (!Number.isNaN(t)) days.add(dayKey(new Date(t)));
  }
  if (days.size === 0) return 0;
  const cursor = new Date();
  // Grace: if nothing landed yet today, start counting from yesterday so a
  // mid-day check doesn't read as a broken streak.
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * Commits bucketed into the last `WEEKS` ISO weeks (oldest → newest). Buckets by
 * matching each commit's Monday-anchored week start against the window's week
 * starts, so it stays correct across DST (no fixed-ms week arithmetic).
 */
export function commitsByWeek(commits: GitCommit[]): Series[] {
  const thisWeek = startOfWeek(new Date());
  const series: Series[] = [];
  const indexByStart = new Map<number, number>();
  for (let i = WEEKS - 1; i >= 0; i--) {
    const d = new Date(thisWeek);
    d.setDate(d.getDate() - i * 7);
    indexByStart.set(d.getTime(), series.length);
    series.push({
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: 0,
    });
  }
  for (const c of commits) {
    const t = Date.parse(c.date);
    if (Number.isNaN(t)) continue;
    const idx = indexByStart.get(startOfWeek(new Date(t)).getTime());
    if (idx !== undefined) series[idx]!.value += 1;
  }
  return series;
}

/** Commits per day for the current Mon–Sun week (DST-safe day matching). */
export function commitsByDay(commits: GitCommit[]): Series[] {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekStart = startOfWeek(new Date());
  const series = labels.map((label) => ({ label, value: 0 }));
  const indexByDay = new Map<number, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    indexByDay.set(d.getTime(), i);
  }
  for (const c of commits) {
    const t = Date.parse(c.date);
    if (Number.isNaN(t)) continue;
    const idx = indexByDay.get(startOfDay(new Date(t)).getTime());
    if (idx !== undefined) series[idx]!.value += 1;
  }
  return series;
}

/** Classify a user-defined lane into a coarse bucket (mirrors resolveLane's matcher). */
export function laneBucket(label: string): 'todo' | 'doing' | 'done' {
  const t = label.toLowerCase();
  if (/done|complete|ship|review|finish|launched/.test(t)) return 'done';
  if (/progress|doing|wip|active|building/.test(t)) return 'doing';
  return 'todo';
}

export function computeTasks(lanes: LaneDef[], cards: Card[]): TaskBreakdown {
  const laneById = new Map(lanes.map((l) => [l.id, l]));
  const t: TaskBreakdown = { todo: 0, doing: 0, done: 0, total: 0 };
  for (const c of cards) {
    const lane = laneById.get(c.laneId);
    if (!lane) continue;
    t[laneBucket(lane.label)] += 1;
    t.total += 1;
  }
  return t;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function useBuilderAnalytics(): BuilderAnalytics {
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const isGitRepo = useProject((s) => s.isGitRepo);
  const branch = useProject((s) => s.branch);

  const { metrics, loading: metricsLoading } = useWorkspaceMetrics();

  const lanes = useKanban((s) => s.lanes);
  const cards = useKanban((s) => s.cards);

  const posts = useCommunity((s) => s.posts);
  const launches = useCommunity((s) => s.launches);

  const bipPosts = useBipSchedule((s) => s.posts);
  const problems = useDiagnostics((s) => s.entries.length);

  const report = useGitStatus((s) => s.report);
  const reportReady = report != null;
  const uncommitted = report?.entries.length ?? 0;
  // `ahead`/`branch` change on commit/branch-switch but not on plain edits, so
  // they make a cheap "refetch the log now" signal without polling git log.
  const ahead = report?.ahead ?? 0;
  const reportBranch = report?.branch ?? null;

  const hasRepo = !!workspaceRoot && isGitRepo;

  const [commits, setCommits] = useState<GitCommit[]>(
    logCache && logCache.root === workspaceRoot ? logCache.commits : [],
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasRepo || !workspaceRoot) {
      setCommits([]);
      return;
    }
    const sig = `${reportBranch ?? ''}:${ahead}`;
    if (logCache && logCache.root === workspaceRoot && logCache.sig === sig) {
      setCommits(logCache.commits);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void gitLog(workspaceRoot, FETCH_LIMIT)
      .then((rows) => {
        if (cancelled) return;
        logCache = { root: workspaceRoot, sig, commits: rows };
        setCommits(rows);
      })
      .catch(() => {
        if (!cancelled) setCommits([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasRepo, workspaceRoot, reportBranch, ahead]);

  return useMemo<BuilderAnalytics>(() => {
    let commitsThisWeek = 0;
    const weekStart = startOfWeek(new Date()).getTime();
    for (const c of commits) {
      const t = Date.parse(c.date);
      if (!Number.isNaN(t) && t >= weekStart) commitsThisWeek += 1;
    }

    const tasks = computeTasks(lanes, cards);
    const taskDonut = [
      { name: 'To do', value: tasks.todo, color: '#8f9499' },
      { name: 'In progress', value: tasks.doing, color: '#f59e0b' },
      { name: 'Done', value: tasks.done, color: '#22c55e' },
    ].filter((s) => s.value > 0);

    const reputation = computeReputation(posts, launches).total;
    const publishedPosts = bipPosts.filter((p) => p.status === 'published').length;
    const scheduledPosts = bipPosts.filter(
      (p) => p.status === 'queued' || p.status === 'publishing',
    ).length;

    // Recent activity = real, *past* events across surfaces, newest first. Queued
    // (future) posts are intentionally excluded — they belong to the schedule,
    // not the history, and would sort ahead of everything by their future time.
    const activity: ActivityItem[] = [];
    for (const c of commits.slice(0, 8)) {
      const at = Date.parse(c.date);
      activity.push({
        id: `commit-${c.hash}`,
        title: c.subject || '(no message)',
        meta: `${c.short}${Number.isNaN(at) ? '' : ` · ${timeAgo(at)}`}`,
        at: Number.isNaN(at) ? 0 : at,
        kind: 'commit',
      });
    }
    for (const p of posts.slice(0, 5)) {
      activity.push({
        id: `post-${p.id}`,
        title: truncate(p.body, 60),
        meta: `Build-in-public · ${timeAgo(p.createdAt)}`,
        at: p.createdAt,
        kind: 'post',
      });
    }
    for (const l of launches.slice(0, 3)) {
      activity.push({
        id: `launch-${l.id}`,
        title: `Launched ${l.name}`,
        meta: `${l.votes} vote${l.votes === 1 ? '' : 's'} · ${timeAgo(l.createdAt)}`,
        at: l.createdAt,
        kind: 'launch',
      });
    }
    activity.sort((a, b) => b.at - a.at);

    const streakDays = commitStreak(commits);
    const totalCommits = commits.length;
    const languages = metrics?.languages.length ?? 0;
    const commitsPerWeek = commitsByWeek(commits);
    const hasMomentum = commitsPerWeek.some((w) => w.value > 0);

    const achievements: Achievement[] = [
      { id: 'first-commit', label: 'First Commit', earned: totalCommits >= 1, hint: 'Make your first commit' },
      { id: 'commits-25', label: '25 Commits', earned: totalCommits >= 25, hint: 'Reach 25 commits' },
      { id: 'streak-7', label: '7-Day Streak', earned: streakDays >= 7, hint: 'Commit 7 days in a row' },
      { id: 'loc-1k', label: '1K Lines', earned: (metrics?.totalLoc ?? 0) >= 1000, hint: 'Write 1,000 lines of code' },
      { id: 'polyglot', label: 'Polyglot', earned: languages >= 3, hint: 'Use 3+ languages' },
      { id: 'first-task', label: 'First Task Done', earned: tasks.done >= 1, hint: 'Move a Kanban card to Done' },
      { id: 'in-public', label: 'Build in Public', earned: posts.length + publishedPosts >= 1, hint: 'Share a build-in-public post' },
      { id: 'first-launch', label: 'First Launch', earned: launches.length >= 1, hint: 'Submit a launch to Demo Day' },
      // Only assert a clean tree once git status has actually loaded, so it never
      // flashes "earned" before the first working-tree poll arrives.
      { id: 'clean-tree', label: 'Clean Tree', earned: hasRepo && reportReady && totalCommits > 0 && uncommitted === 0, hint: 'Commit all your changes' },
    ];

    return {
      hasRepo,
      loading,
      metricsLoading,
      metrics,
      commits,
      totalCommits,
      commitsCapped: totalCommits >= FETCH_LIMIT,
      commitsThisWeek,
      streakDays,
      commitsPerWeek,
      commitsPerDay: commitsByDay(commits),
      hasMomentum,
      tasks,
      taskDonut,
      reputation,
      posts: posts.length,
      launches: launches.length,
      scheduledPosts,
      publishedPosts,
      branch: branch ?? reportBranch,
      uncommitted,
      problems,
      recentActivity: activity.slice(0, 6),
      achievements,
    };
  }, [
    commits,
    lanes,
    cards,
    posts,
    launches,
    bipPosts,
    metrics,
    metricsLoading,
    problems,
    uncommitted,
    reportReady,
    hasRepo,
    branch,
    reportBranch,
    loading,
  ]);
}
