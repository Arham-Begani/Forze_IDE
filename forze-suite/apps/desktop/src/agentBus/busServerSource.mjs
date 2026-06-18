#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Forze Crew Bus — standalone MCP server.
//
// This file is written verbatim into a workspace as `.forze/bus-server.mjs` by
// the Forze IDE (see lib/agentBus.ts) and registered as an MCP server in each
// Vibe Station CLI's config. It is intentionally DEPENDENCY-FREE — a single
// Node ESM file using only the standard library — so it runs from any workspace
// with nothing but `node` on PATH, no install step, no node_modules.
//
// It speaks the MCP stdio transport (newline-delimited JSON-RPC 2.0) by hand,
// exposing a handful of `forze_bus_*` tools backed by a shared JSON file
// (`.forze/bus.json`). Every Vibe Station points its CLI at this same server.
//
// THE CREW MODEL (v2). Each station has a ROLE and (for builders) a LANE,
// arriving via FORZE_ROLE / FORZE_LANE env (set by the IDE launch keystroke) or
// a one-time forze_bus_register call:
//   - architect : plans ONCE via forze_bus_plan — defines lanes (disjoint path
//                 sets) and scoped tasks. Does not edit feature code.
//   - builder   : pulls ONLY tasks in its lane via forze_bus_task_next, edits
//                 ONLY files inside its lane.
//   - reviewer  : pulls role:"reviewer" tasks, runs build/tests, integrates.
//
// COLLISIONS ARE PREVENTED SERVER-SIDE, not by politeness: every claimed task
// holds a *path lease* over its scope. task_next/task_claim refuse any task
// whose files overlap a lease held by another station, so two agents can never
// hold the same files at once. Tasks also carry dependsOn, so a task isn't
// handed out until its prerequisites are done.
//
// TOKEN EFFICIENCY: only the architect plans (the rest pull pre-scoped tasks
// instead of re-deriving the goal), and task_next returns enough orient context
// (your lane paths, the goal, unread count) that builders rarely need extra
// round-trips. forze_bus_sync is the one-call orient for everything else.
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

const ROLES = new Set(['architect', 'builder', 'reviewer']);
function normalizeRole(value) {
  const r = String(value ?? '').trim().toLowerCase();
  if (ROLES.has(r)) return r;
  if (r === 'lead' || r === 'planner') return 'architect';
  if (r === 'integrator' || r === 'qa' || r === 'tester') return 'reviewer';
  if (r === 'worker' || r === 'dev' || r === 'developer') return 'builder';
  return '';
}

// Mutable identity: seeded from env, overridable by forze_bus_register so a
// station retrofitted onto a crew (briefed after launch) can declare its role.
let selfRole = normalizeRole(process.env.FORZE_ROLE);
let selfLane = (process.env.FORZE_LANE || '').trim();

// ---- bus file IO (best-effort atomic read-modify-write) -------------------

function emptyBus() {
  return { version: 2, goal: null, lanes: {}, messages: [], board: {}, roster: {}, tasks: [] };
}

async function readBus() {
  try {
    const raw = await fs.readFile(BUS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      version: 2,
      goal: typeof parsed.goal === 'string' ? parsed.goal : null,
      lanes: parsed.lanes && typeof parsed.lanes === 'object' ? parsed.lanes : {},
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
  bus.roster[STATION] = {
    ...prev,
    lastSeen: Date.now(),
    ...(selfRole ? { role: selfRole } : {}),
    ...(selfLane ? { lane: selfLane } : {}),
    ...extra,
  };
  // A builder owns its lane the moment it shows up, so two builders never share
  // one. First come, first served; we never steal an existing owner.
  if (selfRole === 'builder' && selfLane && bus.lanes[selfLane] && !bus.lanes[selfLane].owner) {
    bus.lanes[selfLane].owner = STATION;
  }
}

/** Coerce + trim + cap a string arg; '' when missing. */
function str(value, max = 4000) {
  return String(value ?? '').slice(0, max).trim();
}

/** Coerce an arg into a clean string array (paths, ids, …). */
function strArray(value, max = 200) {
  if (Array.isArray(value)) {
    return value.map((v) => str(v, max)).filter(Boolean).slice(0, 64);
  }
  const s = str(value, max * 4);
  if (!s) return [];
  // Tolerate a comma/newline-separated string where an array was expected.
  return s.split(/[\n,]+/).map((v) => v.trim()).filter(Boolean).slice(0, 64);
}

/** Thrown for a bad tool argument — surfaced to the agent as a clean error. */
class BusInputError extends Error {}

const TASK_STATUSES = new Set(['todo', 'doing', 'done', 'blocked']);

// ---- path lanes + leases (the anti-collision core) ------------------------

/**
 * Normalize a scope entry to a comparable path: forward slashes, no leading
 * `./`, no trailing slash, and glob tails (`/**`, `/*.ts`) stripped down to the
 * directory they live under. So "src/ui/**", "src/ui/", and "./src/ui" all
 * compare equal to "src/ui".
 */
function normScope(p) {
  return String(p ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
    .replace(/\/\*\*?$/, '')
    .replace(/\/\*\.[^/]*$/, '')
    .replace(/\/+$/, '')
    .trim();
}

/** Do two normalized paths refer to overlapping file trees? (equal, or one a
 *  parent dir of the other). Empty paths overlap nothing — an unscoped task
 *  leases nothing rather than locking the whole repo. */
function pathOverlap(a, b) {
  const x = normScope(a);
  const y = normScope(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

function scopesOverlap(A, B) {
  for (const a of A || []) for (const b of B || []) if (pathOverlap(a, b)) return true;
  return false;
}

function lanePaths(bus, lane) {
  const l = lane && bus.lanes ? bus.lanes[lane] : null;
  return l && Array.isArray(l.paths) ? l.paths : [];
}

/** The files a task actually touches: its explicit scope, else its lane's paths. */
function effectiveScope(bus, task) {
  if (Array.isArray(task.scope) && task.scope.length) return task.scope;
  return lanePaths(bus, task.lane);
}

/** Tasks currently in flight under another station — their scopes are leased. */
function activeLeases(bus, exceptStation) {
  return bus.tasks.filter((t) => t.status === 'doing' && t.owner && t.owner !== exceptStation);
}

/** Would claiming `task` collide with a file another station is already editing? */
function leaseConflict(bus, task, exceptStation) {
  const mine = effectiveScope(bus, task);
  if (!mine.length) return null; // unscoped → leases nothing, can't conflict
  for (const lease of activeLeases(bus, exceptStation)) {
    if (scopesOverlap(mine, effectiveScope(bus, lease))) return lease;
  }
  return null;
}

/** Does this role+lane caller get to work this task? */
function roleAllows(role, lane, task) {
  const trole = normalizeRole(task.role) || 'builder';
  if (role === 'reviewer') return trole === 'reviewer';
  if (role === 'architect') {
    // The architect handles its own tasks and any UNLANED builder work (shared
    // scaffolding, or solo mode where it owns everything) — but never a builder
    // lane, which belongs to that lane's builder.
    return trole === 'architect' || (trole === 'builder' && !task.lane);
  }
  // builder (or unknown/retrofit role): never the reviewer's or architect's job.
  if (trole === 'reviewer' || trole === 'architect') return false;
  // A laned task is only for that lane's builder; an unlaned task is open to any.
  if (task.lane && lane) return task.lane === lane;
  return true;
}

/** Are all of a task's known prerequisites done? (Unknown ids are ignored so a
 *  stale reference can't deadlock the queue.) */
function depsSatisfied(bus, task) {
  const deps = Array.isArray(task.dependsOn) ? task.dependsOn : [];
  if (!deps.length) return true;
  const doneIds = new Set(bus.tasks.filter((t) => t.status === 'done').map((t) => t.id));
  const knownIds = new Set(bus.tasks.map((t) => t.id));
  return deps.filter((id) => knownIds.has(id)).every((id) => doneIds.has(id));
}

/** The blocker (a not-yet-done dependency) holding a task back, for messaging. */
function pendingDep(bus, task) {
  const deps = Array.isArray(task.dependsOn) ? task.dependsOn : [];
  return bus.tasks.find((t) => deps.includes(t.id) && t.status !== 'done') || null;
}

/** Public shape of a task returned to agents. */
function publicTask(task) {
  return {
    id: task.id,
    title: task.title,
    detail: task.detail || null,
    status: task.status,
    owner: task.owner || null,
    lane: task.lane || null,
    role: task.role || 'builder',
    scope: Array.isArray(task.scope) ? task.scope : [],
    acceptance: task.acceptance || null,
    dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn : [],
    mine: task.owner === STATION,
  };
}

/** Find a task by id, or throw a helpful error listing valid ids. */
function requireTask(bus, id) {
  const task = bus.tasks.find((t) => t.id === id);
  if (!task) {
    const ids = bus.tasks.slice(-8).map((t) => t.id).join(', ') || '(none)';
    throw new BusInputError(`No task with id "${id}". Recent ids: ${ids}. Use forze_bus_tasks to list them.`);
  }
  return task;
}

/** A compact orient snapshot — your identity, the goal, your lane, the next
 *  task you could claim — assembled fresh from the bus. Cheap to embed in any
 *  tool result so callers rarely need a second round-trip. */
function orient(bus) {
  const lane = selfLane || null;
  const role = selfRole || 'builder';
  const myDoing = bus.tasks.find((t) => t.owner === STATION && t.status === 'doing') || null;
  // Peek (do not claim) the task this caller would pull next.
  const next = bus.tasks.find(
    (t) =>
      t.status === 'todo' &&
      !t.owner &&
      roleAllows(role, lane, t) &&
      depsSatisfied(bus, t) &&
      !leaseConflict(bus, t, STATION),
  );
  const open = bus.tasks.filter((t) => t.status !== 'done').length;
  return {
    you: { station: STATION, role, lane },
    goal: bus.goal || null,
    yourLane: lane ? { name: lane, paths: lanePaths(bus, lane) } : null,
    current: myDoing ? publicTask(myDoing) : null,
    nextUp: next ? publicTask(next) : null,
    openTasks: open,
  };
}

// ---- tool implementations -------------------------------------------------

const TOOLS = {
  forze_bus_sync: {
    description:
      'Orient yourself on the Forze Crew Bus in ONE call — the first thing to do, and the thing to do whenever you finish a task or get stuck. Returns: who you are (your role + lane), the team goal, the file paths your lane owns, your current in-progress task, the next task you could claim, the shared decisions board, your teammates, and any messages addressed to you (advancing your read cursor). Prefer this over calling whoami/board/tasks/inbox separately.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const snapshot = await mutateBus((b) => {
        touchRoster(b);
        const cursor = b.roster[STATION]?.lastRead ?? 0;
        const relevant = b.messages.filter((m) => m.to === STATION || m.to === 'all' || m.from === STATION);
        const unread = relevant.filter((m) => m.ts > cursor);
        const newestTs = relevant.reduce((max, m) => (m.ts > max ? m.ts : max), cursor);
        b.roster[STATION].lastRead = newestTs;
        const view = orient(b);
        const board = Object.entries(b.board).map(([key, info]) => ({ key, value: info.value, by: info.by ?? null }));
        const teammates = Object.entries(b.roster)
          .filter(([s]) => s !== STATION)
          .map(([station, info]) => ({ station, role: info.role ?? null, lane: info.lane ?? null, status: info.status ?? null }));
        return {
          ...view,
          board,
          teammates,
          inbox: unread.map((m) => ({ from: m.from, to: m.to, text: m.text, ago: `${Math.round((Date.now() - m.ts) / 1000)}s ago` })),
          hint: hintFor(view),
        };
      });
      return snapshot;
    },
  },

  forze_bus_register: {
    description:
      'Declare (or correct) your role and lane on the crew. Normally this comes from how the IDE launched you, but call it once if you were told your role in a briefing: architect (plans + scopes work, no feature edits), builder (works one lane only), or reviewer (integrates + tests). Builders should pass their lane name too.',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: '"architect", "builder", or "reviewer".' },
        lane: { type: 'string', description: 'For builders: the lane name you own (e.g. "ui", "api").' },
      },
    },
    async run(args) {
      const role = normalizeRole(args?.role);
      if (args?.role && !role) throw new BusInputError('role must be "architect", "builder", or "reviewer".');
      if (role) selfRole = role;
      if (args?.lane !== undefined) selfLane = str(args.lane, 80);
      const view = await mutateBus((b) => {
        touchRoster(b);
        return orient(b);
      });
      return { ok: true, ...view };
    },
  },

  forze_bus_plan: {
    description:
      'ARCHITECT ONLY. Lay down the whole plan in ONE call so builders never have to re-derive it: set the goal, define the lanes (each a DISJOINT set of file paths/dirs, one per builder — this is what stops agents colliding), and add the scoped tasks. Every task should name the files it will touch (scope), the lane it belongs to, its acceptance criteria, and any tasks it dependsOn (reference earlier tasks in THIS call by their exact title or 1-based number). Re-running merges: it updates the goal/lanes and appends new tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'The overall objective (optional if already set).' },
        lanes: {
          type: 'array',
          description: 'Disjoint work areas, one per builder. Each: { name, paths: string[], desc? }.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              paths: { type: 'array', items: { type: 'string' } },
              desc: { type: 'string' },
            },
            required: ['name', 'paths'],
          },
        },
        tasks: {
          type: 'array',
          description:
            'The work, broken into independent units. Each: { title, detail?, scope: string[], lane?, role?, acceptance?, dependsOn?: string[] }. dependsOn entries may be the title or 1-based index of another task in this call.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              detail: { type: 'string' },
              scope: { type: 'array', items: { type: 'string' } },
              lane: { type: 'string' },
              role: { type: 'string' },
              acceptance: { type: 'string' },
              dependsOn: { type: 'array', items: { type: 'string' } },
            },
            required: ['title'],
          },
        },
      },
    },
    async run(args) {
      const goal = str(args?.goal, 2000);
      const lanes = Array.isArray(args?.lanes) ? args.lanes : [];
      const incoming = Array.isArray(args?.tasks) ? args.tasks : [];
      const result = await mutateBus((b) => {
        if (goal) b.goal = goal;
        // Upsert lanes (preserve any existing owner so a re-plan doesn't evict).
        const laneNames = [];
        for (const l of lanes) {
          const name = str(l?.name, 80);
          if (!name) continue;
          b.lanes[name] = {
            paths: strArray(l?.paths),
            desc: str(l?.desc, 400) || (b.lanes[name]?.desc ?? ''),
            owner: b.lanes[name]?.owner ?? null,
          };
          laneNames.push(name);
        }
        // First pass: create every task and remember title/index → id.
        const byKey = new Map();
        const created = [];
        incoming.forEach((t, i) => {
          const title = str(t?.title, 280);
          if (!title) return;
          const task = {
            id: newId(),
            title,
            detail: str(t?.detail, 4000),
            status: 'todo',
            owner: null,
            lane: str(t?.lane, 80) || null,
            role: normalizeRole(t?.role) || 'builder',
            scope: strArray(t?.scope),
            acceptance: str(t?.acceptance, 1000) || null,
            dependsOn: [], // resolved in the second pass
            _rawDeps: strArray(t?.dependsOn, 280),
            createdBy: STATION,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          byKey.set(title.toLowerCase(), task.id);
          byKey.set(String(i + 1), task.id);
          created.push(task);
        });
        // Second pass: resolve dependsOn (title or 1-based index) to real ids.
        for (const task of created) {
          task.dependsOn = task._rawDeps
            .map((d) => byKey.get(d.toLowerCase()) || byKey.get(d) || null)
            .filter((id) => id && id !== task.id);
          delete task._rawDeps;
          b.tasks.push(task);
        }
        touchRoster(b);
        return { goal: b.goal, lanes: laneNames, tasksAdded: created.length, taskIds: created.map((t) => t.id) };
      });
      return { ok: true, ...result, hint: 'Plan recorded. Builders will pull their lane tasks via forze_bus_task_next. Announce you are done planning with forze_bus_announce, then you may take role:"architect" tasks or help integrate.' };
    },
  },

  forze_bus_whoami: {
    description:
      'Identify yourself on the bus (your role, lane, and the goal) and see who else is online. forze_bus_sync gives the same plus your tasks and inbox — prefer sync once you are working.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const view = await mutateBus((b) => {
        touchRoster(b);
        const teammates = Object.keys(b.roster).filter((s) => s !== STATION);
        return { ...orient(b), busFile: BUS_FILE, teammates };
      });
      return { ...view, hint: hintFor(view) };
    },
  },

  forze_bus_announce: {
    description:
      'Tell the team what you are working on right now. Sets your status on the roster so others (and the human) can see progress at a glance. Keep it to genuine state changes — this is not a running log.',
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
      'List every station on the crew with its role, lane, and last announced status. Use it to see who owns what before you start.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const bus = await readBus();
      const now = Date.now();
      const roster = Object.entries(bus.roster).map(([station, info]) => ({
        station,
        role: info.role ?? null,
        lane: info.lane ?? null,
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
      'Send a message to another station, or broadcast to "all". Use it for genuine coordination: a hand-off, a question, a heads-up that you need a change in someone else\'s lane. Address it to a station\'s exact name (see forze_bus_roster) or "all".',
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
      'Read messages addressed to you (or broadcast to "all") that you have not seen yet. Advances your read cursor, so each call returns only what is new. Pass {"all": true} to see the recent conversation instead. (forze_bus_sync also returns your unread inbox.)',
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
      'Write a shared note onto the team board — a decision, an API contract, a convention. Other agents read these with forze_bus_board (and forze_bus_sync). Use a stable key (e.g. "api-contract", "db-schema") to update the same note over time.',
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
      'Read the shared team board — every decision, contract, and convention other agents (and you) have written. Check it before making assumptions about shared structure.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const bus = await readBus();
      const notes = Object.entries(bus.board).map(([key, info]) => ({
        key,
        value: info.value,
        by: info.by ?? null,
        updated: typeof info.ts === 'number' ? `${Math.round((Date.now() - info.ts) / 1000)}s ago` : null,
      }));
      return { goal: bus.goal || null, notes };
    },
  },

  // ---- shared task queue --------------------------------------------------

  forze_bus_tasks: {
    description:
      'List the shared task queue — the team plan. Each task shows its status, owner, lane, scope (the files it touches), and dependsOn. Optionally filter by status. forze_bus_task_next is the right way to PULL work; this is for an overview.',
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
        goal: bus.goal || null,
        tasks: tasks.map(publicTask),
        open: bus.tasks.filter((t) => t.status !== 'done').length,
      };
    },
  },

  forze_bus_task_add: {
    description:
      'Add a single task to the queue. Prefer forze_bus_plan if you are the architect laying out the whole plan. Give it a scope (the files it touches) and a lane so it is collision-safe and routed to the right builder.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short imperative title, e.g. "Add auth middleware".' },
        detail: { type: 'string', description: 'Optional longer description / acceptance criteria.' },
        scope: { type: 'array', items: { type: 'string' }, description: 'Files/dirs this task will touch.' },
        lane: { type: 'string', description: 'Lane this belongs to (optional).' },
        role: { type: 'string', description: '"builder" (default), "reviewer", or "architect".' },
        acceptance: { type: 'string', description: 'Done-criteria (optional).' },
        dependsOn: { type: 'array', items: { type: 'string' }, description: 'Task ids that must finish first.' },
      },
      required: ['title'],
    },
    async run(args) {
      const title = str(args?.title, 280);
      if (!title) throw new BusInputError('A task needs a title.');
      const task = {
        id: newId(),
        title,
        detail: str(args?.detail, 4000),
        status: 'todo',
        owner: null,
        lane: str(args?.lane, 80) || null,
        role: normalizeRole(args?.role) || 'builder',
        scope: strArray(args?.scope),
        acceptance: str(args?.acceptance, 1000) || null,
        dependsOn: strArray(args?.dependsOn, 64),
        createdBy: STATION,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await mutateBus((b) => {
        b.tasks.push(task);
        touchRoster(b);
        return b;
      });
      return { ok: true, task: publicTask(task) };
    },
  },

  forze_bus_task_claim: {
    description:
      'Claim a specific task by id — sets owner to you and status to "doing", which LEASES its files so nobody edits them under you. Refused if the task is owned by someone else, its dependencies are not done, it is not for your role/lane, or its files overlap a task another station is already editing. Usually you want forze_bus_task_next instead.',
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
        if (!depsSatisfied(b, task)) {
          const dep = pendingDep(b, task);
          throw new BusInputError(`Task "${task.title}" is blocked on "${dep ? dep.title : 'a prerequisite'}" — not done yet. Take an unblocked task instead.`);
        }
        if (!roleAllows(selfRole || 'builder', selfLane || null, task)) {
          throw new BusInputError(`Task "${task.title}" isn't for your role/lane (${selfRole || 'builder'}${selfLane ? `/${selfLane}` : ''}). It is ${task.role || 'builder'}${task.lane ? `/${task.lane}` : ''} work.`);
        }
        const conflict = leaseConflict(b, task, STATION);
        if (conflict) {
          throw new BusInputError(`Task "${task.title}" touches files ${conflict.owner} is editing right now ("${conflict.title}"). Wait for it, or pick a task in different files.`);
        }
        task.owner = STATION;
        task.status = 'doing';
        task.updatedAt = Date.now();
        claimed = task;
        touchRoster(b);
        return b;
      });
      return { ok: true, task: publicTask(claimed) };
    },
  },

  forze_bus_task_next: {
    description:
      'Pull your next task race-free — atomically claims the oldest available task FOR YOUR ROLE AND LANE in one locked step, leasing its files so no one collides with you. Skips anything owned, blocked by an unfinished dependency, out of your lane, or whose files another station is already editing. Returns the claimed task PLUS your orient context (lane paths, goal, unread count) so you can start immediately. Returns {task: null} with guidance when there is nothing for you to do.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const out = await mutateBus((b) => {
        const role = selfRole || 'builder';
        const lane = selfLane || null;
        const next = b.tasks.find(
          (t) =>
            t.status === 'todo' &&
            !t.owner &&
            roleAllows(role, lane, t) &&
            depsSatisfied(b, t) &&
            !leaseConflict(b, t, STATION),
        );
        if (next) {
          next.owner = STATION;
          next.status = 'doing';
          next.updatedAt = Date.now();
        }
        touchRoster(b);
        const cursor = b.roster[STATION]?.lastRead ?? 0;
        const unread = b.messages.filter(
          (m) => (m.to === STATION || m.to === 'all') && m.from !== STATION && m.ts > cursor,
        ).length;
        const view = orient(b);
        return { next: next ? publicTask(next) : null, view, unread };
      });

      if (out.next) {
        return {
          ok: true,
          task: out.next,
          you: out.view.you,
          goal: out.view.goal,
          lanePaths: out.view.yourLane ? out.view.yourLane.paths : [],
          unread: out.unread,
          hint:
            out.unread > 0
              ? `You have ${out.unread} unread message(s) — check forze_bus_inbox if this task depends on a hand-off. Then complete the task within your scope and mark it done.`
              : 'Complete the task within its scope, then forze_bus_task_update it to "done" and call forze_bus_task_next again.',
        };
      }

      // Nothing claimable — explain why so the agent does the right thing.
      const reason = await describeEmptyQueue();
      return { ok: true, task: null, ...reason };
    },
  },

  forze_bus_task_update: {
    description:
      'Update a task: change its status (todo/doing/done/blocked), revise the detail, or hand it to another station. Mark it "done" the MOMENT you finish — that releases the file lease so dependent work (and the reviewer) can proceed. Mark it "blocked" (with detail explaining why) if you are stuck.',
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
      return { ok: true, task: publicTask(updated) };
    },
  },
};

/** Role-aware next-step hint, woven into orient results. */
function hintFor(view) {
  const role = view.you?.role || 'builder';
  if (role === 'architect') {
    if (view.openTasks === 0 && !view.goal) {
      return 'You are the Architect. Read the repo enough to plan, then call forze_bus_plan ONCE with disjoint lanes (one per builder) and scoped tasks. Do not edit feature code.';
    }
    return 'Architect: the plan is laid down. Record key decisions with forze_bus_note, answer hand-offs via forze_bus_inbox, and integrate at the end. Avoid editing inside builders\' lanes.';
  }
  if (role === 'reviewer') {
    return 'You are the Reviewer. Wait for builders to mark tasks done, then pull role:"reviewer" tasks with forze_bus_task_next, run the build + tests, integrate across lanes, and report issues via forze_bus_send.';
  }
  // builder
  if (view.yourLane && (!view.yourLane.paths || view.yourLane.paths.length === 0)) {
    return `Your lane "${view.you.lane}" has no paths yet — the Architect is still planning. Wait a few seconds and call forze_bus_sync again. Don't start editing until your lane is scoped.`;
  }
  if (view.nextUp) {
    return `You are a Builder on lane "${view.you.lane}". Pull work with forze_bus_task_next and edit ONLY files in your lane. Next up: "${view.nextUp.title}".`;
  }
  return 'You are a Builder. Call forze_bus_task_next to pull your next lane task. If it returns null and the goal is met, announce you are done.';
}

/** When task_next finds nothing, work out why and return tailored guidance. */
async function describeEmptyQueue() {
  const bus = await readBus();
  const role = selfRole || 'builder';
  const lane = selfLane || null;
  const open = bus.tasks.filter((t) => t.status !== 'done');
  if (open.length === 0) {
    if (!bus.goal && role !== 'architect') {
      return { message: 'No tasks yet — the Architect has not posted the plan. Call forze_bus_sync shortly; if you ARE meant to plan, use forze_bus_plan.' };
    }
    return { message: 'The queue is empty and all tasks are done. If the goal is met, forze_bus_announce that you are finished; otherwise (architect) add the remaining work with forze_bus_plan / forze_bus_task_add.' };
  }
  // There IS open work but none for this caller — say why.
  const mineByRole = open.filter((t) => roleAllows(role, lane, t));
  if (mineByRole.length === 0) {
    return { message: `There is open work, but none of it is ${role}${lane ? `/${lane}` : ''} work. Wait for hand-offs (forze_bus_inbox) or coordinate via forze_bus_send before taking another lane.` };
  }
  const blocked = mineByRole.find((t) => t.status === 'todo' && !t.owner && !depsSatisfied(bus, t));
  if (blocked) {
    const dep = pendingDep(bus, blocked);
    return { message: `Your remaining task "${blocked.title}" is waiting on "${dep ? dep.title : 'a prerequisite'}". Help unblock it or wait — re-check with forze_bus_sync.` };
  }
  return { message: 'Your available tasks are all currently leased by overlapping in-flight work. Wait a moment and call forze_bus_task_next again, or coordinate via forze_bus_send.' };
}

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
        serverInfo: { name: 'forze-crew-bus', version: '2.0.0' },
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

console.error(`[forze-bus] online · station="${STATION}" · role="${selfRole || 'builder'}" · lane="${selfLane || '-'}" · bus=${BUS_FILE}`);
