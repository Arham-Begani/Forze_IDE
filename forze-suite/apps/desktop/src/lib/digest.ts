/**
 * "While you were away" catch-up digest.
 *
 * When the founder comes back to the IDE after a stretch away — especially with
 * a Vibe Stations crew running autonomously — the hardest question is "what
 * actually happened?" This gathers the real signals (git commits + working-tree
 * changes, the agent crew's task board, and the recent coding-agent terminal
 * output) and asks the model for a short, decision-first briefing.
 *
 * It reuses existing plumbing rather than adding any: `git.log`/`git.status`,
 * the bus reader, and the terminal tails already captured by the autopilot.
 */
import { log, status, type GitCommit, type GitStatusReport } from './git';
import { readBus, type BusState } from './agentBus';
import { generateText } from './ai';
import { lastOutputAt, outputTail } from '../workbench/autopilot';
import {
  stationOrdinal,
  targetLabel,
  useVibeStations,
} from '../workbench/vibeStationsStore';

export interface DigestSource {
  /** True when at least one signal had something worth reporting. */
  hadActivity: boolean;
  /** The raw, pre-summary context handed to the model (also a usable fallback). */
  contextText: string;
}

function summarizeCommits(commits: GitCommit[], since: number): string {
  const recent = commits.filter((c) => {
    const t = new Date(c.date).getTime();
    return Number.isFinite(t) ? t >= since : false;
  });
  if (recent.length === 0) return '';
  const lines = recent.slice(0, 15).map((c) => `- ${c.short} ${c.subject} (${c.author})`);
  return `New commits (${recent.length}):\n${lines.join('\n')}`;
}

function summarizeStatus(report: GitStatusReport | null): string {
  if (!report) return '';
  const staged = report.entries.filter((e) => e.staged && !e.untracked).length;
  const changed = report.entries.filter((e) => e.unstaged && !e.untracked).length;
  const untracked = report.entries.filter((e) => e.untracked).length;
  if (staged + changed + untracked === 0) return '';
  const names = report.entries.slice(0, 10).map((e) => e.path);
  return (
    `Uncommitted working tree: ${staged} staged, ${changed} modified, ${untracked} new.\n` +
    `Files: ${names.join(', ')}`
  );
}

function summarizeBus(bus: BusState | null): string {
  if (!bus) return '';
  const parts: string[] = [];
  if (bus.goal) parts.push(`Crew goal: ${bus.goal}`);

  const tasks = bus.tasks ?? [];
  if (tasks.length) {
    const counts = { todo: 0, doing: 0, done: 0, blocked: 0 } as Record<string, number>;
    for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
    parts.push(
      `Crew tasks — ${counts.doing} in progress, ${counts.blocked} blocked, ` +
        `${counts.done} done, ${counts.todo} queued.`,
    );
    const blocked = tasks
      .filter((t) => t.status === 'blocked')
      .slice(0, 5)
      .map((t) => `- BLOCKED: ${t.title}${t.owner ? ` (${t.owner})` : ''}`);
    if (blocked.length) parts.push(blocked.join('\n'));
  }

  const decisions = Object.values(bus.board ?? {})
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 4)
    .map((b) => `- ${b.value} (${b.by})`);
  if (decisions.length) parts.push(`Pinned decisions:\n${decisions.join('\n')}`);

  return parts.join('\n');
}

/** Recent terminal output from each Vibe Station that produced any since `since`. */
function summarizeStations(since: number): string {
  const { stations, sessions } = useVibeStations.getState();
  const chunks: string[] = [];
  for (const s of stations) {
    const sess = sessions[s.id];
    if (!sess) continue;
    if (lastOutputAt(sess.sessionId) < since) continue;
    const tail = outputTail(sess.sessionId, 10).trim();
    if (!tail) continue;
    const label = targetLabel({
      agentId: s.agentId,
      ordinal: stationOrdinal(stations, s),
    });
    chunks.push(`### ${label} — recent output\n${tail}`);
  }
  return chunks.join('\n\n');
}

/** Collect every signal that changed since `since` into one context blob. */
export async function gatherDigestContext(root: string, since: number): Promise<DigestSource> {
  const [commits, report, bus] = await Promise.all([
    log(root, 30).catch(() => [] as GitCommit[]),
    status(root).catch(() => null),
    readBus(root).catch(() => null),
  ]);

  const sections = [
    summarizeCommits(commits, since),
    summarizeStatus(report),
    summarizeBus(bus),
    summarizeStations(since),
  ].filter(Boolean);

  return { hadActivity: sections.length > 0, contextText: sections.join('\n\n') };
}

const DIGEST_SYSTEM =
  'You are the Forze catch-up briefer. The founder just returned to their IDE, ' +
  'possibly after leaving an autonomous coding-agent crew running. From the raw ' +
  'signals below (git commits, working-tree changes, the agent crew task board, ' +
  'and recent coding-agent terminal output), write a short "while you were away" ' +
  'briefing in Markdown.\n\nRules: open with a one-line summary. Then 2–5 bullets ' +
  'of what actually changed. Surface anything BLOCKED, failing, or awaiting a ' +
  'decision FIRST and unambiguously. End with a single concrete suggested next ' +
  'step. Be specific — name commits, files, and agents. No preamble, ≤160 words. ' +
  'If nothing meaningful happened, say so in one line.';

/** Build the catch-up briefing for changes since `since`. */
export async function runDigest(opts: {
  root: string;
  since: number;
  sinceLabel: string;
}): Promise<{ text: string; hadActivity: boolean }> {
  const { hadActivity, contextText } = await gatherDigestContext(opts.root, opts.since);
  if (!hadActivity) {
    return { text: `**All quiet.** Nothing changed since ${opts.sinceLabel}.`, hadActivity: false };
  }
  try {
    const text = await generateText(`Timeframe: since ${opts.sinceLabel}.\n\nRaw signals:\n\n${contextText}`, {
      system: DIGEST_SYSTEM,
      module: 'digest',
      maxTokens: 500,
    });
    return { text: text.trim() || contextText, hadActivity: true };
  } catch {
    // No AI key (or a provider hiccup) — still show the raw signals; better than
    // nothing when the founder just wants to know what moved.
    return { text: `**While you were away** (unsummarized):\n\n${contextText}`, hadActivity: true };
  }
}
