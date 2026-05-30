import { readDir, readFile, relativePath } from './fs';

/**
 * Workspace search, in the renderer, over the Tauri fs commands. Walks the
 * project tree (skipping the usual heavy/binary directories), reads text
 * files, and reports line matches. Streams results per-file via `onFile` so
 * the UI fills in progressively, and honours a cancellation token so a new
 * keystroke can abandon an in-flight search cleanly.
 */

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface SearchMatch {
  line: number; // 1-based
  column: number; // 0-based, into the raw line
  /** The full source line (untrimmed) for rendering with highlight ranges. */
  preview: string;
  /** [start, end) character ranges within `preview` that matched. */
  ranges: Array<[number, number]>;
}

export interface FileResult {
  path: string;
  relativePath: string;
  matches: SearchMatch[];
}

export interface SearchToken {
  cancelled: boolean;
}

export interface SearchHandlers {
  onFile: (result: FileResult) => void;
  token: SearchToken;
  /** Hard cap on total matches across the whole search. */
  maxMatches?: number;
  /** Hard cap on files scanned, a safety net for huge trees. */
  maxFiles?: number;
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

const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'icns',
  'svg', // technically text, but rarely useful to grep and often huge
  'pdf', 'zip', 'gz', 'tar', 'rar', '7z', 'bz2', 'xz',
  'mp3', 'mp4', 'mov', 'avi', 'webm', 'wav', 'flac', 'ogg',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'exe', 'dll', 'so', 'dylib', 'bin', 'wasm', 'class', 'o', 'a',
  'lock', // lockfiles are noise
  'map', // sourcemaps
]);

const MAX_FILE_BYTES = 2_000_000; // skip files larger than ~2MB

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build the matching regex, or return an error message for invalid patterns. */
export function buildMatcher(
  query: string,
  opts: SearchOptions,
): { regex: RegExp } | { error: string } {
  let source = opts.regex ? query : escapeRegExp(query);
  if (opts.wholeWord) source = `\\b(?:${source})\\b`;
  const flags = opts.caseSensitive ? 'g' : 'gi';
  try {
    return { regex: new RegExp(source, flags) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invalid pattern' };
  }
}

function looksBinary(content: string): boolean {
  // A NUL in the first chunk is a strong binary signal.
  const sample = content.slice(0, 1024);
  return sample.indexOf(String.fromCharCode(0)) !== -1;
}

function matchLine(
  line: string,
  regex: RegExp,
): { column: number; ranges: Array<[number, number]> } | null {
  regex.lastIndex = 0;
  const ranges: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  let first = -1;
  let guard = 0;
  while ((m = regex.exec(line)) !== null) {
    if (first === -1) first = m.index;
    const end = m.index + m[0].length;
    ranges.push([m.index, end]);
    // Avoid infinite loops on zero-width matches.
    if (m.index === regex.lastIndex) regex.lastIndex++;
    if (++guard > 1000) break;
  }
  if (ranges.length === 0) return null;
  return { column: first, ranges };
}

async function searchFile(
  path: string,
  root: string,
  regex: RegExp,
  handlers: SearchHandlers,
  counters: { matches: number },
): Promise<void> {
  let content: string;
  try {
    content = await readFile(path);
  } catch {
    return;
  }
  if (looksBinary(content)) return;

  const lines = content.split('\n');
  const matches: SearchMatch[] = [];
  const maxMatches = handlers.maxMatches ?? 5000;
  for (let i = 0; i < lines.length; i++) {
    if (handlers.token.cancelled) return;
    const line = lines[i]!;
    if (line.length > 2000) continue; // skip absurdly long minified lines
    const hit = matchLine(line, regex);
    if (hit) {
      matches.push({ line: i + 1, column: hit.column, preview: line, ranges: hit.ranges });
      counters.matches += hit.ranges.length;
      if (counters.matches >= maxMatches) break;
    }
  }

  if (matches.length > 0 && !handlers.token.cancelled) {
    handlers.onFile({ path, relativePath: relativePath(root, path), matches });
  }
}

export async function searchWorkspace(
  root: string,
  query: string,
  opts: SearchOptions,
  handlers: SearchHandlers,
): Promise<{ error?: string }> {
  if (!root || !query) return {};
  const built = buildMatcher(query, opts);
  if ('error' in built) return { error: built.error };
  const regex = built.regex;

  const counters = { matches: 0 };
  const maxFiles = handlers.maxFiles ?? 20_000;
  const maxMatches = handlers.maxMatches ?? 5000;
  let filesScanned = 0;

  // Breadth-first directory walk.
  const queue: string[] = [root];
  while (queue.length > 0) {
    if (handlers.token.cancelled) break;
    if (counters.matches >= maxMatches || filesScanned >= maxFiles) break;
    const dir = queue.shift()!;
    let entries;
    try {
      entries = await readDir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (handlers.token.cancelled) break;
      if (entry.is_dir) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.git')) {
          queue.push(entry.path);
        }
        continue;
      }
      if (BINARY_EXT.has(extOf(entry.name))) continue;
      if (entry.size > MAX_FILE_BYTES) continue;
      filesScanned++;
      if (filesScanned > maxFiles) break;
      await searchFile(entry.path, root, regex, handlers, counters);
      if (counters.matches >= maxMatches) break;
    }
  }

  return {};
}
