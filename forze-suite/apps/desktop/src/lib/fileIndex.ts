import { readDir, relativePath } from './fs';

/**
 * Workspace file index + fuzzy matcher powering Quick Open ("Go to File").
 * Walks the project tree in the renderer over the Tauri fs commands (the same
 * approach as `search.ts`), skipping heavy/ignored directories. The result is a
 * flat list of files the user can fuzzy-filter and open. Deliberately cheap:
 * one breadth-first walk, capped, no file reads.
 */

export interface IndexedFile {
  /** Absolute path on disk. */
  path: string;
  /** Path relative to the workspace root (forward-slashed for display). */
  rel: string;
  /** File name only, for basename-weighted scoring. */
  name: string;
}

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  'out',
  'target',
  '.turbo',
  '.cache',
  'coverage',
  '.svelte-kit',
  'vendor',
  '.venv',
  '__pycache__',
]);

const MAX_FILES = 20_000;

/** Walk the workspace and return every (non-ignored) file, capped. */
export async function listWorkspaceFiles(root: string): Promise<IndexedFile[]> {
  if (!root) return [];
  const out: IndexedFile[] = [];
  const queue: string[] = [root];

  while (queue.length > 0 && out.length < MAX_FILES) {
    const dir = queue.shift()!;
    let entries;
    try {
      entries = await readDir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.is_dir) {
        if (!IGNORED_DIRS.has(entry.name)) queue.push(entry.path);
        continue;
      }
      out.push({
        path: entry.path,
        rel: relativePath(root, entry.path).replace(/\\/g, '/'),
        name: entry.name,
      });
      if (out.length >= MAX_FILES) break;
    }
  }

  return out;
}

/**
 * Subsequence fuzzy score. Returns -1 when `query` is not a subsequence of
 * `target`; otherwise a higher score means a better match. Rewards contiguous
 * runs, matches at word boundaries, and matches near the start.
 */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  let score = 0;
  let ti = 0;
  let prevMatched = -2;
  let run = 0;

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]!;
    let found = -1;
    for (let k = ti; k < t.length; k++) {
      if (t[k] === ch) {
        found = k;
        break;
      }
    }
    if (found === -1) return -1;

    // Base point for the match.
    score += 1;
    // Contiguous run bonus.
    if (found === prevMatched + 1) {
      run += 1;
      score += run * 4;
    } else {
      run = 0;
    }
    // Word-boundary bonus (start of string, or after a separator).
    const before = found > 0 ? t[found - 1]! : '';
    if (found === 0 || before === '/' || before === '\\' || before === '.' || before === '-' || before === '_') {
      score += 6;
    }
    // Earliness bonus.
    score += Math.max(0, 3 - found * 0.05);

    prevMatched = found;
    ti = found + 1;
  }

  return score;
}

export interface ScoredFile extends IndexedFile {
  score: number;
}

/**
 * Filter + rank files for a query. Empty query returns the first `limit`
 * files (most-recently-walked order). Matches the basename first (weighted
 * heavily) and falls back to the relative path so deep paths still resolve.
 */
export function fuzzyFilter(
  files: IndexedFile[],
  query: string,
  limit = 100,
): ScoredFile[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return files.slice(0, limit).map((f) => ({ ...f, score: 0 }));
  }

  const scored: ScoredFile[] = [];
  for (const f of files) {
    const nameScore = fuzzyScore(trimmed, f.name);
    const pathScore = fuzzyScore(trimmed, f.rel);
    if (nameScore < 0 && pathScore < 0) continue;
    // Basename matches are far more useful than path-only matches.
    const score = Math.max(nameScore * 2.5, pathScore);
    scored.push({ ...f, score });
  }

  scored.sort((a, b) => b.score - a.score || a.rel.length - b.rel.length);
  return scored.slice(0, limit);
}
