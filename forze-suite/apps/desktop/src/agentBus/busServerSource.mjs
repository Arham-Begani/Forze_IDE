#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Forze Context Bus — standalone MCP server.
//
// This file is written verbatim into a workspace as `.forze/bus-server.mjs` by
// the Forze IDE (see lib/agentBus.ts) and registered as an MCP server in each
// Vibe Station CLI's config. It is intentionally DEPENDENCY-FREE — a single
// Node ESM file using only the standard library — so it runs from any workspace
// with nothing but `node` on PATH, no install step, no node_modules, no bundled
// path to resolve.
//
// It speaks the MCP stdio transport (newline-delimited JSON-RPC 2.0) by hand,
// exposing a handful of `forze_bus_*` tools backed by a shared JSON file
// (`.forze/bus.json`). Every Vibe Station points its CLI at this same server;
// the station's *identity* arrives via the FORZE_STATION env var (set by the
// IDE in the launch keystroke), so one shared config gives each station a
// distinct voice on the bus. The Forze IDE reads/writes the same bus.json to
// render the live Bus panel.
//
// DO NOT add imports beyond node: builtins. The zero-dependency property is the
// whole point.
// ---------------------------------------------------------------------------
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const STATION = (process.env.FORZE_STATION || 'unknown-agent').trim();
const BUS_FILE =
  process.env.FORZE_BUS_FILE ||
  path.join(process.cwd(), '.forze', 'bus.json');
const PROTOCOL_VERSION = '2024-11-05';

// ---- bus file IO (best-effort atomic read-modify-write) -------------------

function emptyBus() {
  return { version: 1, messages: [], board: {}, roster: {}, tasks: [] };
}

async function readBus() {
  try {
    const raw = await fs.readFile(BUS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      board: parsed.board && typeof parsed.board === 'object' ? parsed.board : {},
      roster: parsed.roster && typeof parsed.roster === 'object' ? parsed.roster : {},
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch (err) {
    if (err && err.code === 'ENOENT') return emptyBus();
    // A half-written file from a concurrent writer: treat as transiently empty
    // rather than crashing the agent's tool call.
    return emptyBus();
  }
}

async function writeBus(bus) {
  await fs.mkdir(path.dirname(BUS_FILE), { recursive: true });
  // Cap history/lists so the file can't grow without bound across a long session.
  if (bus.messages.length > 500) bus.messages = bus.messages.slice(-500);
  // Keep all open tasks; only trim the oldest *done* ones past a generous cap.
  if (Array.isArray(bus.tasks) && bus.tasks.length > 400) {
    const open = bus.tasks.filter((t) => t.status !== 'done');
    const done = bus.tasks.filter((t) => t.status === 'done').slice(-100);
    bus.tasks = [...open, ...done];
  }
  const tmp = `${BUS_FILE}.${process.pid}.tmp`;
  const text = JSON.stringify(bus, null, 2);
  await fs.writeFile(tmp, text, 'utf-8');
  // rename is atomic on the same volume, so a reader never sees a torn file.
  await fs.rename(tmp, BUS_FILE);
}

const LOCK_FILE = `${BUS_FILE}.lock`;
const LOCK_STALE_MS = 5000;
const LOCK_TIMEOUT_MS = 10_000;

/**
 * Acquire a cross-process advisory lock by exclusively creating a lock file
 * (`wx` fails if it already exists — atomic on every OS). Without this, two
 * agent servers doing read-modify-write at the same moment both read the old
 * state and the second write clobbers the first (lost messages). A lock older
 * than LOCK_STALE_MS is assumed orphaned (a crashed holder) and stolen.
 */
// Windows reports a contended/pending-delete lock file as EPERM/EBUSY/EACCES
// rather than EEXIST — all mean "someone else has it, back off and retry".
const CONTENDED = new Set(['EEXIST', 'EPERM', 'EBUSY', 'EACCES']);

async function acquireLock() {
  const start = Date.now();
  for (;;) {
    try {
      const fh = await fs.open(LOCK_FILE, 'wx');
      await fh.close();
      return;
    } catch (err) {
      if (!err || !CONTENDED.has(err.code)) throw err;
      try {
        const st = await fs.stat(LOCK_FILE);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
          // Orphaned lock from a crashed holder — steal it (ignore a races with
          // another stealer).
          await fs.rm(LOCK_FILE, { force: true }).catch(() => undefined);
          continue;
        }
      } catch {
        continue; // lock vanished between open and stat — retry immediately
      }
      if (Date.now() - start > LOCK_TIMEOUT_MS) throw new Error('bus lock timeout');
      await new Promise((r) => setTimeout(r, 8 + Math.random() * 24));
    }
  }
}

async function releaseLock() {
  await fs.rm(LOCK_FILE, { force: true }).catch(() => undefined);
}

/** Read → mutate → write, serialised across processes by the lock file so
 *  concurrent writers can't clobber each other. */
async function mutateBus(mutator) {
  await acquireLock();
  try {
    const bus = await readBus();
    const result = mutator(bus);
    await writeBus(bus);
    return result;
  } finally {
    await releaseLock();
  }
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function touchRoster(bus, extra) {
  const prev = bus.roster[STATION] || {};
  bus.roster[STATION] = { ...prev, lastSeen: Date.now(), ...extra };
}

/** Coerce + trim + cap a string arg; '' when missing. */
function str(value, max = 4000) {
  return String(value ?? '').slice(0, max).trim();
}

/** Thrown for a bad tool argument — surfaced to the agent as a clean error. */
class BusInputError extends Error {}

const TASK_STATUSES = new Set(['todo', 'doing', 'done', 'blocked']);

/** Find a task by id, or throw a helpful error listing valid ids. */
function requireTask(bus, id) {
  const task = bus.tasks.find((t) => t.id === id);
  if (!task) {
    const ids = bus.tasks.slice(-8).map((t) => t.id).join(', ') || '(none)';
    throw new BusInputError(`No task with id "${id}". Recent ids: ${ids}. Use forze_bus_tasks to list them.`);
  }
  return task;
}

// ---- tool implementations -------------------------------------------------

const TOOLS = {
  forze_bus_whoami: {
    description:
      'Identify yourself on the Forze Context Bus. Returns your station name and who else is online. Call this first so you know your own name and your teammates.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const bus = await mutateBus((b) => {
        touchRoster(b);
        return b;
      });
      const others = Object.keys(bus.roster).filter((s) => s !== STATION);
      return {
        you: STATION,
        busFile: BUS_FILE,
        teammates: others,
        hint: 'Start of work: check forze_bus_board (decisions) and forze_bus_tasks (the shared TODO). Then loop: forze_bus_task_next to grab the next task race-free, do it, forze_bus_task_update it to "done" — repeat until task is null. Coordinate with forze_bus_send/forze_bus_inbox; forze_bus_announce your status.',
      };
    },
  },

  forze_bus_announce: {
    description:
      'Tell the team what you are currently working on. Sets your status on the shared roster so other agents (and the human) avoid stepping on your work.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Short description of what you are doing right now.' },
      },
      required: ['status'],
    },
    async run(args) {
      const status = String(args?.status ?? '').slice(0, 280);
      await mutateBus((b) => {
        touchRoster(b, { status, statusAt: Date.now() });
        return b;
      });
      return { ok: true, station: STATION, status };
    },
  },

  forze_bus_roster: {
    description:
      'List every agent station currently known to the bus, with each one\'s last announced status. Use this to see who is doing what before you start.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const bus = await readBus();
      const now = Date.now();
      const roster = Object.entries(bus.roster).map(([station, info]) => ({
        station,
        status: info.status ?? null,
        isYou: station === STATION,
        secondsSinceSeen:
          typeof info.lastSeen === 'number' ? Math.round((now - info.lastSeen) / 1000) : null,
      }));
      return { roster };
    },
  },

  forze_bus_send: {
    description:
      'Send a message to another agent station, or broadcast to everyone. Use this to coordinate, hand off work, ask a question, or share a finding. Address it to a teammate\'s exact station name (see forze_bus_roster) or to "all".',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient station name, or "all" to broadcast.' },
        message: { type: 'string', description: 'The message body.' },
      },
      required: ['to', 'message'],
    },
    async run(args) {
      const to = String(args?.to ?? 'all').trim() || 'all';
      const message = String(args?.message ?? '').slice(0, 4000);
      if (!message.trim()) return { ok: false, error: 'Empty message.' };
      const entry = { id: newId(), from: STATION, to, text: message, ts: Date.now() };
      await mutateBus((b) => {
        b.messages.push(entry);
        touchRoster(b);
        return b;
      });
      return { ok: true, delivered: entry };
    },
  },

  forze_bus_inbox: {
    description:
      'Read messages addressed to you (or broadcast to "all") that you have not seen yet. Advances your read cursor, so each call returns only what is new. Pass {"all": true} to instead see the full recent conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        all: {
          type: 'boolean',
          description: 'If true, return the full recent message history instead of only unread.',
        },
      },
    },
    async run(args) {
      const wantAll = Boolean(args?.all);
      const bus = await readBus();
      const cursor = bus.roster[STATION]?.lastRead ?? 0;
      const relevant = bus.messages.filter(
        (m) => m.to === STATION || m.to === 'all' || m.from === STATION,
      );
      const selected = wantAll ? relevant.slice(-100) : relevant.filter((m) => m.ts > cursor);
      // Advance the cursor to the newest message we actually observed — NOT
      // Date.now(). A message written by another station between our read and
      // this cursor write has a ts ≤ now but > our snapshot's newest; anchoring
      // the cursor to "now" would skip it forever. Anchoring to the newest ts we
      // saw means it simply shows up on the next inbox call.
      const newestTs = relevant.reduce((max, m) => (m.ts > max ? m.ts : max), cursor);
      await mutateBus((b) => {
        touchRoster(b, { lastRead: newestTs });
        return b;
      });
      return {
        you: STATION,
        unreadCount: wantAll ? undefined : selected.length,
        messages: selected.map((m) => ({
          from: m.from,
          to: m.to,
          text: m.text,
          ago: `${Math.round((Date.now() - m.ts) / 1000)}s ago`,
        })),
      };
    },
  },

  forze_bus_note: {
    description:
      'Write a shared note onto the team board — a decision, an API contract, a convention, a TODO. Other agents read these with forze_bus_board. Use a stable key (e.g. "api-contract", "db-schema", "decisions") to update the same note over time.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Stable identifier for the note (kebab-case recommended).' },
        value: { type: 'string', description: 'The note contents. Replaces any previous value for this key.' },
      },
      required: ['key', 'value'],
    },
    async run(args) {
      const key = String(args?.key ?? '').trim().slice(0, 120);
      const value = String(args?.value ?? '').slice(0, 8000);
      if (!key) return { ok: false, error: 'Missing key.' };
      await mutateBus((b) => {
        b.board[key] = { value, by: STATION, ts: Date.now() };
        touchRoster(b);
        return b;
      });
      return { ok: true, key, by: STATION };
    },
  },

  forze_bus_board: {
    description:
      'Read the shared team board — every note other agents (and you) have written: decisions, contracts, conventions. Check this before making assumptions about shared structure.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const bus = await readBus();
      const notes = Object.entries(bus.board).map(([key, info]) => ({
        key,
        value: info.value,
        by: info.by ?? null,
        updated: typeof info.ts === 'number' ? `${Math.round((Date.now() - info.ts) / 1000)}s ago` : null,
      }));
      return { notes };
    },
  },

  // ---- shared task queue --------------------------------------------------
  // A persistent, shared TODO list. The human (Forze panel) and every agent
  // read and write the same queue, so work survives restarts, agents can pick
  // up and hand off tasks, and nobody does the same thing twice.

  forze_bus_tasks: {
    description:
      'List the shared task queue for this project — the team TODO. Returns each task with its status (todo/doing/done/blocked) and owner. Call this at the start of your work to see what needs doing and what others have already claimed. Optionally filter by status.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Optional filter: "todo", "doing", "done", or "blocked".',
        },
      },
    },
    async run(args) {
      const filter = str(args?.status, 16).toLowerCase();
      const bus = await readBus();
      let tasks = bus.tasks;
      if (filter && TASK_STATUSES.has(filter)) tasks = tasks.filter((t) => t.status === filter);
      return {
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          detail: t.detail || null,
          status: t.status,
          owner: t.owner || null,
          mine: t.owner === STATION,
        })),
        open: bus.tasks.filter((t) => t.status !== 'done').length,
      };
    },
  },

  forze_bus_task_add: {
    description:
      'Add a task to the shared queue for someone (you or a teammate) to pick up. Use this to capture work, split a big job into pieces, or hand off a follow-up. Returns the new task id.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short imperative title, e.g. "Add auth middleware".' },
        detail: { type: 'string', description: 'Optional longer description / acceptance criteria.' },
      },
      required: ['title'],
    },
    async run(args) {
      const title = str(args?.title, 280);
      if (!title) throw new BusInputError('A task needs a title.');
      const detail = str(args?.detail, 4000);
      const task = {
        id: newId(),
        title,
        detail,
        status: 'todo',
        owner: null,
        createdBy: STATION,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await mutateBus((b) => {
        b.tasks.push(task);
        touchRoster(b);
        return b;
      });
      return { ok: true, task };
    },
  },

  forze_bus_task_claim: {
    description:
      'Claim a task so teammates know you own it — sets the owner to you and the status to "doing". Claim before you start so two agents never work the same task. Refuses a task already owned by someone else (unless it\'s yours).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The task id (from forze_bus_tasks).' } },
      required: ['id'],
    },
    async run(args) {
      const id = str(args?.id, 64);
      if (!id) throw new BusInputError('Provide the task id to claim.');
      let claimed;
      await mutateBus((b) => {
        const task = requireTask(b, id);
        if (task.owner && task.owner !== STATION && task.status !== 'done') {
          throw new BusInputError(`Task "${task.title}" is already owned by ${task.owner}. Pick another, or coordinate via forze_bus_send.`);
        }
        task.owner = STATION;
        task.status = 'doing';
        task.updatedAt = Date.now();
        claimed = task;
        touchRoster(b);
        return b;
      });
      return { ok: true, task: claimed };
    },
  },

  forze_bus_task_next: {
    description:
      'Atomically claim the next available task — the oldest unclaimed "todo" — in ONE locked step, setting its owner to you and status to "doing". This is the race-free way to pull work: prefer it over listing then claiming, since no other station can grab the same task in the gap. Returns the claimed task, or {task: null} with guidance when there is no unclaimed work left.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      let claimed = null;
      let openCount = 0;
      await mutateBus((b) => {
        // Oldest-first: b.tasks is append-ordered, so the first matching task is
        // the longest-waiting one. Skip blocked/doing/done and anything owned.
        const next = b.tasks.find((t) => t.status === 'todo' && !t.owner);
        if (next) {
          next.owner = STATION;
          next.status = 'doing';
          next.updatedAt = Date.now();
          claimed = next;
        }
        openCount = b.tasks.filter((t) => t.status !== 'done').length;
        touchRoster(b);
        return b;
      });
      if (claimed) return { ok: true, task: claimed };
      return {
        ok: true,
        task: null,
        message:
          openCount > 0
            ? 'No unclaimed "todo" tasks — every open task is already owned or blocked. See forze_bus_tasks; coordinate via forze_bus_send before duplicating work, or help unblock a "blocked" task.'
            : 'The task queue is empty. If the goal is not yet met, break it down with forze_bus_task_add; otherwise forze_bus_announce that you are done.',
      };
    },
  },

  forze_bus_task_update: {
    description:
      'Update a task: change its status (todo/doing/done/blocked), revise the detail, or hand it to another station. Mark a task "done" the moment you finish so others can build on it; mark it "blocked" (with detail explaining why) if you\'re stuck.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The task id.' },
        status: { type: 'string', description: 'New status: "todo", "doing", "done", or "blocked".' },
        detail: { type: 'string', description: 'Optional new detail / progress note.' },
        owner: { type: 'string', description: 'Optional: reassign to a station name, or "" to unassign.' },
      },
      required: ['id'],
    },
    async run(args) {
      const id = str(args?.id, 64);
      if (!id) throw new BusInputError('Provide the task id to update.');
      const status = str(args?.status, 16).toLowerCase();
      if (status && !TASK_STATUSES.has(status)) {
        throw new BusInputError(`Invalid status "${status}". Use todo, doing, done, or blocked.`);
      }
      let updated;
      await mutateBus((b) => {
        const task = requireTask(b, id);
        if (status) task.status = status;
        if (args?.detail !== undefined) task.detail = str(args.detail, 4000);
        if (args?.owner !== undefined) task.owner = str(args.owner, 80) || null;
        task.updatedAt = Date.now();
        updated = task;
        touchRoster(b);
        return b;
      });
      return { ok: true, task: updated };
    },
  },
};

// ---- MCP stdio JSON-RPC plumbing -----------------------------------------

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function listToolsResult() {
  return {
    tools: Object.entries(TOOLS).map(([name, def]) => ({
      name,
      description: def.description,
      inputSchema: def.inputSchema,
    })),
  };
}

async function handleCallTool(params) {
  const name = params?.name;
  const def = TOOLS[name];
  if (!def) {
    const known = Object.keys(TOOLS).join(', ');
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${name}. Available: ${known}` }],
    };
  }
  try {
    const args = params?.arguments;
    if (args !== undefined && args !== null && typeof args !== 'object') {
      throw new BusInputError('Tool arguments must be an object.');
    }
    const data = await def.run(args ?? {});
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    // BusInputError is the agent's fault (bad args) — surface the guidance as-is.
    // Anything else is an internal fault; prefix it so it's distinguishable.
    const isInput = err instanceof BusInputError;
    return {
      isError: true,
      content: [{ type: 'text', text: isInput ? err.message : `bus error: ${err?.message ?? String(err)}` }],
    };
  }
}

async function dispatch(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;

  switch (method) {
    case 'initialize':
      reply(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'forze-context-bus', version: '1.2.0' },
      });
      return;
    case 'notifications/initialized':
    case 'initialized':
      return; // notification, no reply
    case 'ping':
      if (isRequest) reply(id, {});
      return;
    case 'tools/list':
      reply(id, listToolsResult());
      return;
    case 'tools/call': {
      const result = await handleCallTool(params);
      reply(id, result);
      return;
    }
    case 'resources/list':
      reply(id, { resources: [] });
      return;
    case 'prompts/list':
      reply(id, { prompts: [] });
      return;
    default:
      if (isRequest) replyError(id, -32601, `Method not found: ${method}`);
      return;
  }
}

// Newline-delimited JSON framing: buffer stdin, split on \n, parse each line.
let buffer = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // ignore unparseable lines
    }
    Promise.resolve(dispatch(msg)).catch((err) => {
      // Never crash the transport on a single bad message. (stderr only — stdout
      // is the JSON-RPC channel and must stay clean.)
      console.error('[forze-bus] dispatch error', err);
    });
  }
});

process.stdin.on('end', () => process.exit(0));

// Announce on the bus that we came online (best-effort, non-fatal).
mutateBus((b) => {
  touchRoster(b, { status: b.roster[STATION]?.status ?? 'online' });
  return b;
}).catch(() => undefined);

console.error(`[forze-bus] online · station="${STATION}" · bus=${BUS_FILE}`);
