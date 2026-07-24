/**
 * Release Composer — turn "commits since the last tag" into a versioned
 * CHANGELOG entry and a build-in-public announcement, in one step. Writing
 * release notes is a chore founders skip; this does the boring part and leaves
 * the shipping gate (`scripts/release.mjs`) untouched — it only *prepares*.
 *
 * Frontend-only: reuses `git.commitsSinceTag` (built on existing commands) and
 * the AI funnel. No new backend.
 */
import { commitsSinceTag, type GitCommit } from './git';
import { generateText } from './ai';
import { joinPath, readFile, writeFile } from './fs';

export interface ReleaseDraft {
  /** Suggested next semver (patch-bumped from the last tag). */
  version: string;
  /** The generated CHANGELOG body (Markdown, no version header). */
  changelog: string;
  /** A ready-to-post build-in-public announcement. */
  announcement: string;
  commitCount: number;
  sinceTag: string | null;
}

/** Patch-bump the last tag, or seed 0.1.0 when there are no tags yet. */
export function suggestVersion(tag: string | null): string {
  if (!tag) return '0.1.0';
  const m = tag.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return '0.1.0';
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

const RELEASE_SYSTEM =
  'You are a release-notes writer for a software product. Given a version and the ' +
  'raw commit subjects since the last release, produce two things:\n' +
  '1. A clean CHANGELOG entry in Markdown, grouped under "### Added", "### ' +
  'Changed", "### Fixed" (omit any empty group). Rewrite terse commit messages ' +
  'into clear user-facing bullets; drop pure noise (merge/chore/wip/formatting).\n' +
  '2. A short, punchy build-in-public post (2–4 sentences, first person, at most ' +
  'one or two emoji, no hashtag spam) announcing what shipped.\n\n' +
  'Reply with ONLY a minified JSON object of the exact shape ' +
  '{"changelog":"<markdown, no version header>","announcement":"<text>"}. ' +
  'No prose, no code fences.';

/** Pull the JSON object out of a model reply, tolerant of stray fences/prose. */
export function extractReleaseJson(raw: string): { changelog?: string; announcement?: string } {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1]! : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return {};
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return {};
  }
}

function commitLines(commits: GitCommit[]): string {
  return commits
    .map((c) => {
      const first = c.body ? c.body.split('\n')[0]!.trim() : '';
      return `- ${c.subject}${first ? ` — ${first}` : ''}`;
    })
    .join('\n');
}

/** Compose a release draft from the commits since the last tag. Throws when
 *  there's nothing new to release. */
export async function composeRelease(cwd: string): Promise<ReleaseDraft> {
  const { tag, commits } = await commitsSinceTag(cwd);
  if (commits.length === 0) {
    throw new Error(tag ? `No commits since ${tag} — nothing to release.` : 'No commits found.');
  }
  const version = suggestVersion(tag);
  const raw = await generateText(
    `Version: ${version}\nSince: ${tag ?? 'the beginning'}\n\nCommits:\n${commitLines(commits)}`,
    { system: RELEASE_SYSTEM, module: 'build-in-public', maxTokens: 900 },
  );
  const parsed = extractReleaseJson(raw);
  // Fall back to a plain bullet list if the model didn't return usable JSON.
  const changelog = parsed.changelog?.trim() || `### Changed\n${commitLines(commits)}`;
  const announcement =
    parsed.announcement?.trim() ||
    `Just shipped ${version} 🚀 — ${commits.length} commits of improvements.`;
  return { version, changelog, announcement, commitCount: commits.length, sinceTag: tag };
}

/** Prepend the draft's entry to CHANGELOG.md (creating it if absent), newest at
 *  the top. Returns the file path written. */
export async function writeChangelog(cwd: string, draft: ReleaseDraft): Promise<string> {
  const path = joinPath(cwd, 'CHANGELOG.md');
  const date = new Date().toISOString().slice(0, 10);
  const entry = `## v${draft.version} — ${date}\n\n${draft.changelog.trim()}\n`;
  let existing = '';
  try {
    existing = await readFile(path);
  } catch {
    existing = '';
  }
  const header = '# Changelog\n\n';
  const body = existing.startsWith('# Changelog')
    ? existing.slice(header.length).trimStart()
    : existing.trim();
  const next = `${header}${entry}${body ? `\n${body}\n` : ''}`;
  await writeFile(path, next);
  return path;
}
