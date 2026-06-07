/**
 * The tools an Agent Manager worker can use to act on the operator's real
 * project. This is what turns the roster from "agents that give advice" into
 * "agents that do the work": they read and search the codebase, write files,
 * and run commands to verify their changes.
 *
 * Everything is confined to the active workspace root. Relative paths are
 * resolved against it and any attempt to escape (via `..` or an absolute path)
 * is rejected, so a worker can never touch files outside the open project.
 */
import { useProject } from '../workbench/projectStore';
import { noteChange } from '../workbench/commitGuard';
import { joinPath, readDir, readFile, writeFile } from './fs';
import { runCommand } from './exec';
import { searchWorkspace, type FileResult } from './search';

export interface ToolContext {
  signal?: AbortSignal;
}

export interface ToolResult {
  ok: boolean;
  /** Text fed back to the model as the tool's observation. */
  output: string;
}

export interface ToolDef {
  name: string;
  /** One-line description shown to the model in the system prompt. */
  description: string;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

const MAX_READ_CHARS = 16_000;
const MAX_OUTPUT_CHARS = 8_000;
const MAX_DIR_ENTRIES = 300;
const MAX_SEARCH_MATCHES = 40;

/** The absolute workspace root, or throw a message the model can act on. */
function requireRoot(): string {
  const root = useProject.getState().workspaceRoot;
  if (!root) {
    throw new Error(
      'No project folder is open, so file/command tools are unavailable. Work in advisory mode: output the code or steps as text.',
    );
  }
  return root;
}

/** Resolve a model-supplied relative path inside the workspace, or reject. */
function resolveInWorkspace(rawPath: unknown): string {
  const root = requireRoot();
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    throw new Error('Missing "path" argument.');
  }
  const cleaned = rawPath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (/^[a-zA-Z]:[\\/]/.test(cleaned) || cleaned.startsWith('/')) {
    throw new Error('Use a path relative to the project root, not an absolute path.');
  }
  const segments = cleaned.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.some((s) => s === '..')) {
    throw new Error('Path escapes the project root.');
  }
  return segments.length ? joinPath(root, ...segments) : root;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… [truncated ${text.length - max} more characters]`;
}

function arg(args: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return undefined;
}

export const AGENT_TOOLS: ToolDef[] = [
  {
    name: 'list_dir',
    description:
      'list_dir(path?) — list the entries of a directory relative to the project root (default: the root). Directories end with "/".',
    run: async (args) => {
      const target = arg(args, 'path') ?? '.';
      const dir = resolveInWorkspace(target);
      const entries = await readDir(dir);
      if (entries.length === 0) return { ok: true, output: '(empty directory)' };
      const lines = entries
        .slice(0, MAX_DIR_ENTRIES)
        .map((e) => (e.is_dir ? `${e.name}/` : `${e.name} (${e.size}b)`));
      const more =
        entries.length > MAX_DIR_ENTRIES ? `\n… and ${entries.length - MAX_DIR_ENTRIES} more` : '';
      return { ok: true, output: lines.join('\n') + more };
    },
  },
  {
    name: 'read_file',
    description: 'read_file(path) — read a UTF-8 text file relative to the project root.',
    run: async (args) => {
      const file = resolveInWorkspace(arg(args, 'path'));
      const contents = await readFile(file);
      if (contents === '') return { ok: true, output: '(file is empty)' };
      return { ok: true, output: truncate(contents, MAX_READ_CHARS) };
    },
  },
  {
    name: 'write_file',
    description:
      'write_file(path, contents) — create or overwrite a file relative to the project root. This is how you actually apply changes. Missing parent folders are created.',
    run: async (args) => {
      const path = arg(args, 'path');
      const file = resolveInWorkspace(path);
      const contents = typeof args.contents === 'string' ? args.contents : '';
      if (typeof args.contents !== 'string') {
        throw new Error('Missing "contents" argument (must be a string).');
      }
      await writeFile(file, contents);
      // Keep the editor's dirty-tracking honest: the file on disk now matches
      // exactly what we wrote, so record it as the last known on-disk content.
      useProject.getState().setBuffer(file, contents);
      // An agent edit is a real change — count it toward Auto-commit, just like
      // a manual editor save. No-op when the toggle is off / not a git repo.
      void noteChange();
      const bytes = new TextEncoder().encode(contents).length;
      return { ok: true, output: `Wrote ${bytes} bytes to ${path}.` };
    },
  },
  {
    name: 'search_code',
    description:
      'search_code(query) — search the project for a literal string (case-insensitive). Returns matching file:line previews.',
    run: async (args, ctx) => {
      const root = requireRoot();
      const query = arg(args, 'query', 'pattern');
      if (!query) throw new Error('Missing "query" argument.');
      const results: FileResult[] = [];
      let total = 0;
      const token = { cancelled: false };
      const onAbort = () => {
        token.cancelled = true;
      };
      ctx.signal?.addEventListener('abort', onAbort, { once: true });
      try {
        await searchWorkspace(
          root,
          query,
          { caseSensitive: false, wholeWord: false, regex: false },
          {
            token,
            maxMatches: MAX_SEARCH_MATCHES,
            onFile: (result) => {
              if (total >= MAX_SEARCH_MATCHES) return;
              results.push(result);
              total += result.matches.length;
            },
          },
        );
      } finally {
        ctx.signal?.removeEventListener('abort', onAbort);
      }
      if (results.length === 0) return { ok: true, output: `No matches for "${query}".` };
      const lines: string[] = [];
      let shown = 0;
      for (const file of results) {
        for (const m of file.matches) {
          if (shown >= MAX_SEARCH_MATCHES) break;
          lines.push(`${file.relativePath}:${m.line}: ${m.preview.trim().slice(0, 160)}`);
          shown++;
        }
        if (shown >= MAX_SEARCH_MATCHES) break;
      }
      return { ok: true, output: lines.join('\n') };
    },
  },
  {
    name: 'run_command',
    description:
      'run_command(command) — run a shell command in the project root and get back stdout, stderr and the exit code. Use it to install deps, run tests, or type-check (e.g. "npm test", "npx tsc --noEmit").',
    run: async (args, ctx) => {
      const root = requireRoot();
      const command = arg(args, 'command', 'cmd');
      if (!command) throw new Error('Missing "command" argument.');
      // 5 minutes: enough headroom for installs and builds without hanging forever.
      const result = await runCommand(command, root, 300_000);
      if (ctx.signal?.aborted) {
        return { ok: false, output: 'Aborted.' };
      }
      const parts = [`exit code: ${result.exit_code}${result.timed_out ? ' (timed out)' : ''}`];
      if (result.stdout.trim()) parts.push(`stdout:\n${truncate(result.stdout.trim(), MAX_OUTPUT_CHARS)}`);
      if (result.stderr.trim()) parts.push(`stderr:\n${truncate(result.stderr.trim(), MAX_OUTPUT_CHARS)}`);
      if (parts.length === 1) parts.push('(no output)');
      return { ok: result.exit_code === 0 && !result.timed_out, output: parts.join('\n\n') };
    },
  },
];

/** Whether a project is open — i.e. whether the acting tools can do anything. */
export function hasWorkspace(): boolean {
  return !!useProject.getState().workspaceRoot;
}

/** A short, grounded snapshot of the workspace to seed a worker's context. */
export async function workspaceSnapshot(): Promise<string> {
  const root = useProject.getState().workspaceRoot;
  if (!root) return 'No project folder is open. Tools are unavailable — work in advisory mode.';
  try {
    const entries = await readDir(root);
    const top = entries
      .slice(0, 60)
      .map((e) => (e.is_dir ? `${e.name}/` : e.name))
      .join('  ');
    return `Project root: ${root}\nTop-level entries:\n${top}`;
  } catch {
    return `Project root: ${root}`;
  }
}

/** Look a tool up by the name the model used. */
export function findTool(name: string): ToolDef | undefined {
  return AGENT_TOOLS.find((t) => t.name === name);
}
