import { readDir, readFile, languageFromPath } from './fs';

/**
 * Real, locally-computed metrics about the open workspace — powering the
 * Dashboard and Analytics pages with genuine numbers instead of placeholders.
 * Walks the tree over the Tauri fs commands (same ignore rules as search), sums
 * file counts/sizes from directory metadata, and reads source files (bounded)
 * to count lines of code.
 */

export interface LanguageStat {
  language: string;
  files: number;
  loc: number;
}

export interface WorkspaceMetrics {
  totalFiles: number;
  totalBytes: number;
  totalLoc: number;
  languages: LanguageStat[];
  /** True when caps were hit, so figures are a lower bound. */
  truncated: boolean;
}

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', '.next', 'dist', 'build', 'out', 'target',
  '.turbo', '.cache', 'coverage', '.svelte-kit', 'vendor', '.venv',
  '__pycache__',
]);

const TEXT_EXT = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'md', 'mdx', 'css', 'scss',
  'less', 'html', 'vue', 'svelte', 'py', 'rs', 'go', 'java', 'kt', 'rb', 'php',
  'c', 'h', 'cpp', 'hpp', 'cs', 'swift', 'sh', 'bash', 'zsh', 'sql', 'yml',
  'yaml', 'toml', 'xml', 'txt', 'astro',
]);

const MAX_FILES = 50_000;
const MAX_LOC_FILES = 2_500;
const MAX_LOC_BYTES = 400_000;

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export async function computeWorkspaceMetrics(
  root: string,
): Promise<WorkspaceMetrics> {
  const byLang = new Map<string, LanguageStat>();
  let totalFiles = 0;
  let totalBytes = 0;
  let totalLoc = 0;
  let locFilesRead = 0;
  let truncated = false;

  const queue: string[] = [root];
  while (queue.length > 0) {
    if (totalFiles >= MAX_FILES) {
      truncated = true;
      break;
    }
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
      totalFiles += 1;
      totalBytes += entry.size;

      const ext = extOf(entry.name);
      if (!TEXT_EXT.has(ext)) continue;

      const language = languageFromPath(entry.path);
      const stat = byLang.get(language) ?? { language, files: 0, loc: 0 };
      stat.files += 1;

      if (locFilesRead < MAX_LOC_FILES && entry.size <= MAX_LOC_BYTES) {
        try {
          const content = await readFile(entry.path);
          // Count non-empty-ish lines for a meaningful LOC figure.
          const lines = content.length === 0 ? 0 : content.split('\n').length;
          stat.loc += lines;
          totalLoc += lines;
          locFilesRead += 1;
        } catch {
          /* unreadable — skip LOC for this file */
        }
      } else if (locFilesRead >= MAX_LOC_FILES) {
        truncated = true;
      }

      byLang.set(language, stat);
    }
  }

  const languages = [...byLang.values()].sort((a, b) => b.loc - a.loc || b.files - a.files);
  return { totalFiles, totalBytes, totalLoc, languages, truncated };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
