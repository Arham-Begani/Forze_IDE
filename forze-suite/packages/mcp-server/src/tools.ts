import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

/**
 * Tool execution handlers exposed by the @forze/mcp-server daemon. Each tool
 * is callable over MCP and returns plain JSON-serialisable data so the Tauri
 * frontend (and any cloud agent) can consume the result identically.
 */

// =============================================================================
// brand.read
// =============================================================================

export const BrandSchemaInputSchema = z.object({
  ventureId: z.string().uuid(),
  rootDir: z.string().min(1),
});
export type BrandSchemaInput = z.infer<typeof BrandSchemaInputSchema>;

export interface BrandSchemaResult {
  ventureId: string;
  hasBrandFile: boolean;
  brand: Record<string, unknown> | null;
  sourcePath: string;
}

export async function readBrandSchema(input: BrandSchemaInput): Promise<BrandSchemaResult> {
  const candidate = path.join(input.rootDir, 'brand', `${input.ventureId}.json`);
  try {
    const raw = await fs.readFile(candidate, 'utf-8');
    return {
      ventureId: input.ventureId,
      hasBrandFile: true,
      brand: JSON.parse(raw) as Record<string, unknown>,
      sourcePath: candidate,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        ventureId: input.ventureId,
        hasBrandFile: false,
        brand: null,
        sourcePath: candidate,
      };
    }
    throw err;
  }
}

// =============================================================================
// brand.write
// =============================================================================

export const BrandWriteInputSchema = z.object({
  ventureId: z.string().uuid(),
  rootDir: z.string().min(1),
  brand: z.record(z.unknown()),
});
export type BrandWriteInput = z.infer<typeof BrandWriteInputSchema>;

export async function writeBrandSchema(input: BrandWriteInput): Promise<{ path: string }> {
  const dir = path.join(input.rootDir, 'brand');
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, `${input.ventureId}.json`);
  await fs.writeFile(target, JSON.stringify(input.brand, null, 2), 'utf-8');
  return { path: target };
}

// =============================================================================
// git.diff (legacy) + git.status (new)
// =============================================================================

export const DiffWatcherInputSchema = z.object({
  rootDir: z.string().min(1),
  staged: z.boolean().default(false),
});
export type DiffWatcherInput = z.infer<typeof DiffWatcherInputSchema>;

export interface DiffWatcherResult {
  rootDir: string;
  staged: boolean;
  diff: string;
  files: string[];
}

export async function captureGitDiff(input: DiffWatcherInput): Promise<DiffWatcherResult> {
  const args = ['diff', '--no-color'];
  if (input.staged) args.push('--cached');

  const diff = await runCommand('git', args, input.rootDir);
  const files = diff
    .split(/\r?\n/)
    .filter((line) => line.startsWith('diff --git '))
    .map((line) => {
      const parts = line.split(' ');
      return parts[2]?.replace(/^a\//, '') ?? '';
    })
    .filter((value) => value.length > 0);

  return { rootDir: input.rootDir, staged: input.staged, diff, files };
}

export const GitStatusInputSchema = z.object({
  rootDir: z.string().min(1),
});
export type GitStatusInput = z.infer<typeof GitStatusInputSchema>;

export interface GitStatusResult {
  rootDir: string;
  branch: string | null;
  ahead: number;
  behind: number;
  entries: Array<{ path: string; code: string; staged: boolean; unstaged: boolean; untracked: boolean }>;
}

export async function captureGitStatus(input: GitStatusInput): Promise<GitStatusResult> {
  const raw = await runCommand('git', ['status', '--porcelain=v1', '--branch'], input.rootDir);
  let branch: string | null = null;
  let ahead = 0;
  let behind = 0;
  const entries: GitStatusResult['entries'] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('##')) {
      const header = line.slice(2).trim();
      const [branchPart, tail] = header.split(/\s+/, 2);
      branch = branchPart?.split('...')[0] ?? null;
      const aheadMatch = tail?.match(/ahead (\d+)/);
      const behindMatch = tail?.match(/behind (\d+)/);
      if (aheadMatch?.[1]) ahead = Number.parseInt(aheadMatch[1], 10);
      if (behindMatch?.[1]) behind = Number.parseInt(behindMatch[1], 10);
      continue;
    }
    if (line.length < 3) continue;
    const code = line.slice(0, 2);
    const filePath = line.slice(3);
    const untracked = code === '??';
    const stagedCh = code[0] ?? ' ';
    const unstagedCh = code[1] ?? ' ';
    entries.push({
      path: filePath,
      code,
      staged: stagedCh !== ' ' && stagedCh !== '?',
      unstaged: unstagedCh !== ' ' && unstagedCh !== '?',
      untracked,
    });
  }
  return { rootDir: input.rootDir, branch, ahead, behind, entries };
}

export const GitLogInputSchema = z.object({
  rootDir: z.string().min(1),
  limit: z.number().int().positive().max(200).default(20),
});
export type GitLogInput = z.infer<typeof GitLogInputSchema>;

export interface GitLogEntry {
  hash: string;
  subject: string;
  author: string;
  timestamp: number;
}

export async function captureGitLog(input: GitLogInput): Promise<{ entries: GitLogEntry[] }> {
  const sep = '';
  const fmt = ['%H', '%s', '%an', '%at'].join(sep);
  const raw = await runCommand(
    'git',
    ['log', `-n${input.limit}`, `--pretty=format:${fmt}`],
    input.rootDir,
  );
  const entries: GitLogEntry[] = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, author, timestamp] = line.split(sep);
      return {
        hash: hash ?? '',
        subject: subject ?? '',
        author: author ?? '',
        timestamp: Number.parseInt(timestamp ?? '0', 10) * 1000,
      };
    });
  return { entries };
}

// =============================================================================
// workspace.read_file / write_file / list / search
// =============================================================================

export const WorkspaceFileInputSchema = z.object({
  rootDir: z.string().min(1),
  filePath: z.string().min(1),
});
export type WorkspaceFileInput = z.infer<typeof WorkspaceFileInputSchema>;

function ensureInside(root: string, candidate: string): string {
  const resolved = path.resolve(root, candidate);
  const normalisedRoot = path.resolve(root);
  if (resolved !== normalisedRoot && !resolved.startsWith(normalisedRoot + path.sep)) {
    throw new Error(`Path escapes workspace root: ${candidate}`);
  }
  return resolved;
}

export async function readWorkspaceFile(
  input: WorkspaceFileInput,
): Promise<{ path: string; contents: string }> {
  const resolved = ensureInside(input.rootDir, input.filePath);
  const contents = await fs.readFile(resolved, 'utf-8');
  return { path: resolved, contents };
}

export const WorkspaceWriteInputSchema = z.object({
  rootDir: z.string().min(1),
  filePath: z.string().min(1),
  contents: z.string(),
});
export type WorkspaceWriteInput = z.infer<typeof WorkspaceWriteInputSchema>;

export async function writeWorkspaceFile(input: WorkspaceWriteInput): Promise<{ path: string }> {
  const resolved = ensureInside(input.rootDir, input.filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, input.contents, 'utf-8');
  return { path: resolved };
}

export const WorkspaceListInputSchema = z.object({
  rootDir: z.string().min(1),
  subPath: z.string().default(''),
});
export type WorkspaceListInput = z.infer<typeof WorkspaceListInputSchema>;

export interface WorkspaceListEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

const LIST_IGNORE = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'target',
  '.turbo',
]);

export async function listWorkspace(
  input: WorkspaceListInput,
): Promise<{ entries: WorkspaceListEntry[] }> {
  const resolved = ensureInside(input.rootDir, input.subPath || '.');
  const raw = await fs.readdir(resolved, { withFileTypes: true });
  const entries = await Promise.all(
    raw
      .filter((d) => !LIST_IGNORE.has(d.name))
      .map(async (d) => {
        const full = path.join(resolved, d.name);
        let size = 0;
        try {
          const stat = await fs.stat(full);
          size = stat.size;
        } catch {
          /* noop */
        }
        return {
          name: d.name,
          path: full,
          isDir: d.isDirectory(),
          size,
        };
      }),
  );
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
  return { entries };
}

export const WorkspaceSearchInputSchema = z.object({
  rootDir: z.string().min(1),
  query: z.string().min(1),
  globs: z.array(z.string()).optional(),
  maxResults: z.number().int().positive().max(500).default(80),
});
export type WorkspaceSearchInput = z.infer<typeof WorkspaceSearchInputSchema>;

export interface WorkspaceSearchHit {
  file: string;
  line: number;
  text: string;
}

/** Best-effort search. Tries ripgrep if present, falls back to a JS walk. */
export async function searchWorkspace(
  input: WorkspaceSearchInput,
): Promise<{ hits: WorkspaceSearchHit[]; backend: 'ripgrep' | 'fallback' }> {
  try {
    const args = ['--json', '--max-count', '5', '--no-heading', '-n'];
    for (const glob of input.globs ?? []) args.push('-g', glob);
    args.push('--', input.query);
    const raw = await runCommand('rg', args, input.rootDir);
    const hits: WorkspaceSearchHit[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as {
          type: string;
          data?: {
            path?: { text?: string };
            line_number?: number;
            lines?: { text?: string };
          };
        };
        if (parsed.type !== 'match' || !parsed.data) continue;
        const file = parsed.data.path?.text ?? '';
        const lineNo = parsed.data.line_number ?? 0;
        const text = (parsed.data.lines?.text ?? '').replace(/\r?\n$/, '');
        hits.push({ file, line: lineNo, text });
        if (hits.length >= input.maxResults) break;
      } catch {
        /* skip malformed line */
      }
    }
    return { hits, backend: 'ripgrep' };
  } catch {
    return { ...(await fallbackSearch(input)), backend: 'fallback' };
  }
}

async function fallbackSearch(
  input: WorkspaceSearchInput,
): Promise<{ hits: WorkspaceSearchHit[] }> {
  const hits: WorkspaceSearchHit[] = [];
  const needle = input.query.toLowerCase();
  async function walk(dir: string): Promise<void> {
    if (hits.length >= input.maxResults) return;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (LIST_IGNORE.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      try {
        const stat = await fs.stat(full);
        if (stat.size > 256_000) continue; // skip large files
        const text = await fs.readFile(full, 'utf-8');
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]!.toLowerCase().includes(needle)) {
            hits.push({ file: full, line: i + 1, text: lines[i]! });
            if (hits.length >= input.maxResults) return;
          }
        }
      } catch {
        /* skip unreadable */
      }
    }
  }
  await walk(input.rootDir);
  return { hits };
}

// =============================================================================
// editor.active_buffer (via IPC bridge file)
// =============================================================================

export interface ActiveBuffer {
  filePath: string;
  contents: string;
  isDirty: boolean;
  updatedAt: number;
}

export function activeBufferPath(): string {
  return path.join(os.homedir(), '.forze', 'active-buffer.json');
}

export async function readActiveBuffer(): Promise<ActiveBuffer | null> {
  try {
    const raw = await fs.readFile(activeBufferPath(), 'utf-8');
    return JSON.parse(raw) as ActiveBuffer;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

// =============================================================================
// security.scan_secrets / scan_rls / scan_buffer
// =============================================================================

export const SecretScanInputSchema = z.object({
  filePath: z.string().min(1),
  contents: z.string(),
});
export type SecretScanInput = z.infer<typeof SecretScanInputSchema>;

export interface SecretFinding {
  rule: string;
  line: number;
  excerpt: string;
}

const SECRET_RULES: { name: string; pattern: RegExp }[] = [
  { name: 'GEMINI_API_KEY', pattern: /AIza[0-9A-Za-z\-_]{30,}/ },
  { name: 'STRIPE_SECRET_KEY', pattern: /sk_(?:live|test)_[0-9A-Za-z]{20,}/ },
  { name: 'OPENAI_API_KEY', pattern: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'SUPABASE_SERVICE_ROLE', pattern: /eyJhbGciOi[A-Za-z0-9._-]{40,}/ },
  { name: 'AWS_ACCESS_KEY', pattern: /AKIA[0-9A-Z]{16}/ },
];

export function scanForSecrets(input: SecretScanInput): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = input.contents.split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const rule of SECRET_RULES) {
      if (rule.pattern.test(line)) {
        findings.push({ rule: rule.name, line: idx + 1, excerpt: line.slice(0, 160) });
      }
    }
  });
  return findings;
}

export async function scanActiveBuffer(): Promise<{
  filePath: string | null;
  findings: SecretFinding[];
}> {
  const buffer = await readActiveBuffer();
  if (!buffer) return { filePath: null, findings: [] };
  return {
    filePath: buffer.filePath,
    findings: scanForSecrets({ filePath: buffer.filePath, contents: buffer.contents }),
  };
}

export const RlsScanInputSchema = z.object({
  migrationsDir: z.string().min(1),
});
export type RlsScanInput = z.infer<typeof RlsScanInputSchema>;

export interface RlsFinding {
  file: string;
  table: string;
  reason: 'missing-enable-rls' | 'missing-policy';
}

export async function scanSupabaseMigrations(
  input: RlsScanInput,
): Promise<RlsFinding[]> {
  const findings: RlsFinding[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(input.migrationsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return findings;
    throw err;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.sql')) continue;
    const filePath = path.join(input.migrationsDir, entry);
    const sql = await fs.readFile(filePath, 'utf-8');
    const tableMatches = [
      ...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.]+)/gi),
    ];
    for (const match of tableMatches) {
      const table = match[1];
      if (!table) continue;
      const enableRls = new RegExp(
        `ALTER\\s+TABLE\\s+${escapeRegex(table)}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        'i',
      );
      const policy = new RegExp(`CREATE\\s+POLICY[^;]*ON\\s+${escapeRegex(table)}`, 'i');
      if (!enableRls.test(sql)) {
        findings.push({ file: entry, table, reason: 'missing-enable-rls' });
      } else if (!policy.test(sql)) {
        findings.push({ file: entry, table, reason: 'missing-policy' });
      }
    }
  }
  return findings;
}

// =============================================================================
// social.queue (read scheduled posts from the workspace SQLite cache)
// =============================================================================

export const SocialQueueInputSchema = z.object({
  rootDir: z.string().min(1),
});
export type SocialQueueInput = z.infer<typeof SocialQueueInputSchema>;

export interface ScheduledPostSummary {
  id: string;
  platform: string;
  caption: string;
  scheduledFor: number;
  status: string;
}

export async function readSocialQueue(
  input: SocialQueueInput,
): Promise<{ posts: ScheduledPostSummary[] }> {
  // Phase 6 ships the real SQLite-backed queue. Until then read a JSON
  // sidecar at <root>/.forze/social-queue.json if present so external
  // agents can already plan against the contract.
  const target = path.join(input.rootDir, '.forze', 'social-queue.json');
  try {
    const raw = await fs.readFile(target, 'utf-8');
    const parsed = JSON.parse(raw) as { posts?: ScheduledPostSummary[] };
    return { posts: parsed.posts ?? [] };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { posts: [] };
    throw err;
  }
}

// =============================================================================
// helpers
// =============================================================================

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `${cmd} exited with code ${code}`));
    });
  });
}
