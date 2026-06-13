// Vite ?raw import returns the file's text; typed by vite/client.
import busServerSource from '../agentBus/busServerSource.mjs?raw';
import { deletePath, joinPath, readFile, writeFile } from './fs';
import { homeDir } from '../workbench/mcpBridge';

/**
 * Forze Context Bus — IDE side.
 *
 * The Vibe Station CLIs (Claude Code, Codex, Antigravity, OpenCode) are separate
 * processes with private conversation context. They can't share that context
 * directly, but they CAN share a substrate: a workspace-local JSON file
 * (`.forze/bus.json`) that a tiny stdio MCP server (`.forze/bus-server.mjs`)
 * exposes to each CLI as `forze_bus_*` tools. Every station points its CLI at
 * the same server; the station's identity arrives via the FORZE_STATION env var
 * we inject into its launch keystroke, so one shared config gives each station a
 * distinct voice. This module owns the IDE half: reading/writing that file for
 * the live Bus panel, and the one-time "enable" that writes the server + per-CLI
 * configs.
 */

// ---------------------------------------------------------------------------
// Shared bus.json shape — kept byte-for-byte compatible with bus-server.mjs.
// ---------------------------------------------------------------------------

export interface BusMessage {
  id: string;
  /** Station name, or "Forze IDE" when the human broadcasts from the panel. */
  from: string;
  /** Recipient station name, or "all". */
  to: string;
  text: string;
  ts: number;
}

export interface BusBoardEntry {
  value: string;
  by: string;
  ts: number;
}

export interface BusRosterEntry {
  lastSeen?: number;
  status?: string;
  statusAt?: number;
  lastRead?: number;
}

export type BusTaskStatus = 'todo' | 'doing' | 'done' | 'blocked';

export interface BusTask {
  id: string;
  title: string;
  detail?: string;
  status: BusTaskStatus;
  owner?: string | null;
  createdBy?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface BusState {
  version: number;
  messages: BusMessage[];
  board: Record<string, BusBoardEntry>;
  roster: Record<string, BusRosterEntry>;
  tasks: BusTask[];
}

/** The name the IDE itself posts under, so its messages are distinguishable. */
export const IDE_STATION = 'Forze IDE';

export function emptyBus(): BusState {
  return { version: 1, messages: [], board: {}, roster: {}, tasks: [] };
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export function forzeDir(root: string): string {
  return joinPath(root, '.forze');
}
export function busFilePath(root: string): string {
  return joinPath(root, '.forze', 'bus.json');
}
export function busServerPath(root: string): string {
  return joinPath(root, '.forze', 'bus-server.mjs');
}

// ---------------------------------------------------------------------------
// bus.json read / write
// ---------------------------------------------------------------------------

function normalizeBus(parsed: unknown): BusState {
  const p = (parsed ?? {}) as Partial<BusState>;
  return {
    version: 1,
    messages: Array.isArray(p.messages) ? (p.messages as BusMessage[]) : [],
    board: p.board && typeof p.board === 'object' ? (p.board as Record<string, BusBoardEntry>) : {},
    roster: p.roster && typeof p.roster === 'object' ? (p.roster as Record<string, BusRosterEntry>) : {},
    tasks: Array.isArray(p.tasks) ? (p.tasks as BusTask[]) : [],
  };
}

/** Has the bus already been enabled for this workspace? (server file present). */
export async function isBusEnabled(root: string): Promise<boolean> {
  try {
    await readFile(busServerPath(root));
    return true;
  } catch {
    return false;
  }
}

export async function readBus(root: string): Promise<BusState> {
  try {
    const raw = await readFile(busFilePath(root));
    return normalizeBus(JSON.parse(raw));
  } catch {
    // Missing file, parse error, or a torn read from a concurrent writer — the
    // panel just shows an empty bus until the next poll.
    return emptyBus();
  }
}

export async function writeBus(root: string, state: BusState): Promise<void> {
  if (state.messages.length > 500) state.messages = state.messages.slice(-500);
  await writeFile(busFilePath(root), JSON.stringify(state, null, 2));
}

// Serialises the IDE's own bus writes so rapid clicks can't race each other.
let ideWriteChain: Promise<unknown> = Promise.resolve();

/**
 * Read → mutate → write, cooperating with the agent servers' lock file.
 *
 * The bus servers take an atomic O_EXCL lock (`bus.json.lock`); the IDE's Tauri
 * fs layer has no exclusive-create primitive, so it cooperates instead: it
 * serialises its own writes in-process, waits while an agent holds the lock, and
 * holds the lock file itself during its write so agents yield back. A sub-ms
 * check-then-create window remains where an agent could race the IDE — rare and
 * low-impact (a single human-initiated write, visibly retryable) versus the
 * high-frequency agent-vs-agent races the O_EXCL lock fully prevents.
 */
async function mutateBus(root: string, mutate: (b: BusState) => void): Promise<void> {
  const run = async () => {
    const lock = joinPath(root, '.forze', 'bus.json.lock');
    const start = Date.now();
    // Yield while an agent actively holds the lock (best-effort, with a ceiling
    // so a crashed holder's stale lock can't wedge the UI forever).
    while (Date.now() - start < 4000) {
      try {
        await readFile(lock); // resolves → lock present → wait
        await new Promise((r) => setTimeout(r, 20));
      } catch {
        break; // missing → free to proceed
      }
    }
    await writeFile(lock, `ide-${Date.now()}`).catch(() => undefined);
    try {
      const bus = await readBus(root);
      mutate(bus);
      await writeBus(root, bus);
    } finally {
      await deletePath(lock).catch(() => undefined);
    }
  };
  const result = ideWriteChain.then(run, run);
  ideWriteChain = result.catch(() => undefined);
  return result;
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Post a message from the IDE (human) into the bus — to a station or "all". */
export async function postFromIde(root: string, to: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  await mutateBus(root, (b) => {
    b.messages.push({ id: newId(), from: IDE_STATION, to: to || 'all', text: trimmed, ts: Date.now() });
  });
}

/** Set or update a shared board note from the IDE. */
export async function setNoteFromIde(root: string, key: string, value: string): Promise<void> {
  const k = key.trim();
  if (!k) return;
  await mutateBus(root, (b) => {
    b.board[k] = { value, by: IDE_STATION, ts: Date.now() };
  });
}

/** Remove a board note. */
export async function deleteNote(root: string, key: string): Promise<void> {
  await mutateBus(root, (b) => {
    delete b.board[key];
  });
}

// ---- tasks (IDE side) -----------------------------------------------------

/** Add a task to the shared queue from the IDE. */
export async function addTaskFromIde(root: string, title: string, detail = ''): Promise<void> {
  const t = title.trim();
  if (!t) return;
  await mutateBus(root, (b) => {
    b.tasks.push({
      id: newId(),
      title: t.slice(0, 280),
      detail: detail.trim().slice(0, 4000),
      status: 'todo',
      owner: null,
      createdBy: IDE_STATION,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

/** Change a task's status from the IDE. */
export async function setTaskStatus(root: string, id: string, status: BusTaskStatus): Promise<void> {
  await mutateBus(root, (b) => {
    const task = b.tasks.find((t) => t.id === id);
    if (task) {
      task.status = status;
      task.updatedAt = Date.now();
    }
  });
}

/** Delete a task from the queue. */
export async function deleteTask(root: string, id: string): Promise<void> {
  await mutateBus(root, (b) => {
    b.tasks = b.tasks.filter((t) => t.id !== id);
  });
}

// ---------------------------------------------------------------------------
// Launch-keystroke identity injection (PowerShell)
// ---------------------------------------------------------------------------

/** Single-quote a value for a PowerShell string literal (`'` → `''`). */
function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Build the env map a station's CLI is launched with so the bus server (its
 * stdio child) inherits a distinct identity and the right bus file.
 */
export function stationLaunchEnv(root: string, stationLabel: string): Record<string, string> {
  return {
    FORZE_STATION: stationLabel,
    FORZE_BUS_FILE: busFilePath(root),
  };
}

/**
 * Compose the keystroke that boots a station: set the env vars, then run the
 * agent command — all on one PowerShell line. Assumes PowerShell, which is the
 * Vibe Stations shell on Windows (see pty.rs `default_shell`). With no env the
 * command is returned unchanged.
 */
export function buildLaunchKeystroke(launchCommand: string, env: Record<string, string>): string {
  const exports = Object.entries(env).map(([k, v]) => `$env:${k}=${psQuote(v)}`);
  return exports.length ? `${exports.join('; ')}; ${launchCommand}` : launchCommand;
}

/**
 * Prepare a station's launch.
 *
 * Identity flows through the launch keystroke's `$env:FORZE_STATION=...` export:
 * the CLI process inherits it, and each CLI's MCP config copies it explicitly
 * into the server's own `env` (Claude via `${FORZE_STATION}` expansion in
 * `.mcp.json`; see {@link wireClaude}) so it survives the MCP SDK's env
 * allowlist. So here we only need to return the base command plus the identity
 * env to export — no per-station files, no flags.
 *
 * Kept as an async indirection so the launch path can grow per-CLI prep later
 * without re-threading VibeTerminal.
 */
export async function prepareStationLaunch(
  root: string,
  _agentId: string,
  label: string,
  baseCommand: string,
): Promise<{ command: string; env: Record<string, string> }> {
  return { command: baseCommand, env: stationLaunchEnv(root, label) };
}

// ---------------------------------------------------------------------------
// Enable: write the server + per-CLI MCP configs
// ---------------------------------------------------------------------------

export type WiringKind = 'auto' | 'global' | 'manual';

export interface CliWiringResult {
  cli: 'claude' | 'codex' | 'opencode' | 'antigravity';
  label: string;
  kind: WiringKind;
  /** Path of the config we wrote (project config, global config, or snippet). */
  path: string;
  /** Human note: what happened / what the user still needs to do. */
  note: string;
  ok: boolean;
}

export interface EnableResult {
  serverPath: string;
  busFile: string;
  clis: CliWiringResult[];
}

async function readJsonFile(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Write `.forze/bus-server.mjs` + `.forze/bus.json`, then wire each CLI to load
 * the server. Returns a per-CLI report the panel renders honestly (some CLIs we
 * configure automatically; others we can only stage a snippet for).
 */
export async function enableBusForWorkspace(root: string): Promise<EnableResult> {
  const serverPath = busServerPath(root);
  const busFile = busFilePath(root);

  // 1) Drop the standalone server + seed an empty bus file if absent.
  await writeFile(serverPath, busServerSource as string);
  const existing = await readFile(busFile).catch(() => null);
  if (existing === null) await writeBus(root, emptyBus());

  const clis: CliWiringResult[] = [];
  clis.push(await wireClaude(root, serverPath, busFile));
  clis.push(await wireOpenCode(root, serverPath, busFile));
  clis.push(await wireCodex(serverPath, busFile));
  clis.push(await wireAntigravity(root, serverPath, busFile));

  return { serverPath, busFile, clis };
}

const SERVER_ENV = (busFile: string): Record<string, string> => ({ FORZE_BUS_FILE: busFile });

/**
 * Wire Claude Code via a shared project `.mcp.json`, solving identity AND the
 * approval prompt without per-station files:
 *
 *  - Identity: Claude Code expands `${VAR}` in `.mcp.json` against its OWN
 *    environment (it inherits the full shell env; only the spawned MCP server
 *    gets a filtered env). So `"FORZE_STATION": "${FORZE_STATION:-unknown-agent}"`
 *    copies the per-station value from the launch keystroke explicitly into the
 *    server's env, surviving the MCP SDK allowlist. Falls back to "unknown-agent"
 *    if a Claude session is started without the keystroke.
 *  - No prompt: `.claude/settings.local.json` lists "forze-bus" in
 *    `enabledMcpjsonServers`, which auto-approves the project server (otherwise
 *    Claude Code prompts for approval before using `.mcp.json` servers).
 */
async function wireClaude(root: string, serverPath: string, busFile: string): Promise<CliWiringResult> {
  const mcpJson = joinPath(root, '.mcp.json');
  try {
    const current = (await readJsonFile(mcpJson)) ?? {};
    const servers = (current.mcpServers as Record<string, unknown>) ?? {};
    servers['forze-bus'] = {
      command: 'node',
      args: [serverPath],
      env: {
        // Expanded by Claude Code from its own env (set by the launch keystroke).
        FORZE_STATION: '${FORZE_STATION:-unknown-agent}',
        FORZE_BUS_FILE: busFile,
      },
    };
    current.mcpServers = servers;
    await writeFile(mcpJson, JSON.stringify(current, null, 2));

    // Auto-approve so there's no per-launch prompt. settings.local.json is the
    // personal (gitignored) project settings file — the right place for a local
    // trust decision.
    const settingsPath = joinPath(root, '.claude', 'settings.local.json');
    const settings = (await readJsonFile(settingsPath)) ?? {};
    const enabled = Array.isArray(settings.enabledMcpjsonServers)
      ? (settings.enabledMcpjsonServers as string[])
      : [];
    if (!enabled.includes('forze-bus')) enabled.push('forze-bus');
    settings.enabledMcpjsonServers = enabled;
    await writeFile(settingsPath, JSON.stringify(settings, null, 2));

    return {
      cli: 'claude',
      label: 'Claude Code',
      kind: 'auto',
      path: mcpJson,
      ok: true,
      note: 'Wrote .mcp.json (identity via ${FORZE_STATION} expansion) and auto-approved it in .claude/settings.local.json — no prompt, named per station on launch.',
    };
  } catch (err) {
    return failure('claude', 'Claude Code', mcpJson, err);
  }
}

/** OpenCode reads a project-scoped `opencode.json` at the workspace root. */
async function wireOpenCode(root: string, serverPath: string, busFile: string): Promise<CliWiringResult> {
  const path = joinPath(root, 'opencode.json');
  try {
    const current = (await readJsonFile(path)) ?? {};
    if (!current['$schema']) current['$schema'] = 'https://opencode.ai/config.json';
    const mcp = (current.mcp as Record<string, unknown>) ?? {};
    mcp['forze-bus'] = {
      type: 'local',
      command: ['node', serverPath],
      enabled: true,
      environment: SERVER_ENV(busFile),
    };
    current.mcp = mcp;
    await writeFile(path, JSON.stringify(current, null, 2));
    return {
      cli: 'opencode',
      label: 'OpenCode',
      kind: 'auto',
      path,
      ok: true,
      note: 'Wrote opencode.json with a local "forze-bus" MCP server. Active on next OpenCode launch.',
    };
  } catch (err) {
    return failure('opencode', 'OpenCode', path, err);
  }
}

/** Remove a top-level TOML table (`[header]` → next `[` or EOF) from `content`. */
function removeTomlTable(content: string, header: string): string {
  const out: string[] = [];
  let skipping = false;
  for (const line of content.split(/\r?\n/)) {
    if (line.trim() === header) {
      skipping = true;
      continue;
    }
    // A new top-level table header ends the block we're skipping.
    if (skipping && /^\s*\[/.test(line)) skipping = false;
    if (!skipping) out.push(line);
  }
  return out.join('\n');
}

/**
 * Codex reads `~/.codex/config.toml`. Like Claude, Codex filters the env it
 * passes to MCP servers — but it whitelists extra vars via `env_vars` (an array
 * of names pulled from Codex's own env). So we whitelist `FORZE_STATION` (the
 * per-station identity, set by the launch keystroke and inherited by Codex) and
 * set `FORZE_BUS_FILE` as a literal. Without the whitelist Codex stations show
 * up as "unknown-agent". We replace a stale block in place so re-running wiring
 * upgrades an older config, and stage a snippet if the home file is unwritable.
 */
async function wireCodex(serverPath: string, busFile: string): Promise<CliWiringResult> {
  const home = await homeDir();
  const sep = home.includes('\\') ? '\\' : '/';
  const configPath = `${home}${sep}.codex${sep}config.toml`;
  const header = '[mcp_servers.forze-bus]';
  // Single-quoted TOML *literal* strings so Windows backslashes pass verbatim.
  const block =
    `\n${header}\n` +
    `command = "node"\n` +
    `args = ['${serverPath}']\n` +
    `env_vars = ["FORZE_STATION"]\n` +
    `env = { FORZE_BUS_FILE = '${busFile}' }\n`;
  try {
    const current = await readFile(configPath).catch(() => '');
    const hasBlock = current.includes(header);
    const upToDate = hasBlock && current.includes('env_vars') && current.includes('FORZE_STATION');
    if (upToDate) {
      return {
        cli: 'codex',
        label: 'Codex',
        kind: 'global',
        path: configPath,
        ok: true,
        note: 'Codex already wired with identity in ~/.codex/config.toml. Restart Codex if it was running.',
      };
    }
    const base = hasBlock ? removeTomlTable(current, header) : current;
    await writeFile(configPath, `${base.replace(/\n+$/, '')}\n${block}`);
    return {
      cli: 'codex',
      label: 'Codex',
      kind: 'global',
      path: configPath,
      ok: true,
      note: hasBlock
        ? 'Upgraded [mcp_servers.forze-bus] in ~/.codex/config.toml with identity (env_vars). Restart Codex to load it.'
        : 'Added [mcp_servers.forze-bus] with identity to ~/.codex/config.toml. Restart Codex to load it.',
    };
  } catch (err) {
    // Couldn't touch the home config — stage a snippet instead.
    const snippet = joinPath(forzeDir(serverPathRoot(serverPath)), 'codex-mcp.toml');
    await writeFile(snippet, block.trimStart()).catch(() => undefined);
    return {
      cli: 'codex',
      label: 'Codex',
      kind: 'manual',
      path: snippet,
      ok: false,
      note: `Couldn't write ~/.codex/config.toml (${errMsg(err)}). Paste .forze/codex-mcp.toml into it manually.`,
    };
  }
}

/**
 * Antigravity's MCP config format isn't stable enough to auto-write safely, so
 * we stage a standard MCP server snippet under `.forze/` and tell the user where
 * it goes. Identity injection still works the moment they wire it up.
 */
async function wireAntigravity(root: string, serverPath: string, busFile: string): Promise<CliWiringResult> {
  const path = joinPath(forzeDir(root), 'antigravity-mcp.json');
  const snippet = {
    mcpServers: {
      'forze-bus': { command: 'node', args: [serverPath], env: SERVER_ENV(busFile) },
    },
  };
  try {
    await writeFile(path, JSON.stringify(snippet, null, 2));
    return {
      cli: 'antigravity',
      label: 'Antigravity',
      kind: 'manual',
      path,
      ok: false,
      note: 'Staged .forze/antigravity-mcp.json. Add it to Antigravity\'s MCP settings to join the bus.',
    };
  } catch (err) {
    return failure('antigravity', 'Antigravity', path, err);
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Recover the workspace root from `<root>/.forze/bus-server.mjs`. */
function serverPathRoot(serverPath: string): string {
  const marker = serverPath.includes('\\') ? '\\.forze\\' : '/.forze/';
  const idx = serverPath.lastIndexOf(marker);
  return idx >= 0 ? serverPath.slice(0, idx) : serverPath;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function failure(
  cli: CliWiringResult['cli'],
  label: string,
  path: string,
  err: unknown,
): CliWiringResult {
  return { cli, label, kind: 'manual', path, ok: false, note: `Failed: ${errMsg(err)}` };
}
