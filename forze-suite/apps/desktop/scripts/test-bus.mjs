#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Forze Context Bus — substrate self-test.  Run with:  pnpm test:bus
//
// Spins up the REAL bus server (the same file written into a workspace as
// .forze/bus-server.mjs) as two separate processes — exactly how two Vibe
// Station CLIs run it — and proves they share context across the process
// boundary: roster, board, direct messages, inbox cursor. Then hammers it with
// 100 concurrent writes from 4 agents to prove the cross-process lock holds (no
// lost writes, no corruption, no stale lock left behind).
//
// This validates everything EXCEPT whether a real external CLI loads the MCP
// server and obeys instructions — that needs the live app + installed CLIs.
// ---------------------------------------------------------------------------
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, '..', 'src', 'agentBus', 'busServerSource.mjs');
const busFile = path.join(os.tmpdir(), `forze-bus-selftest-${process.pid}.json`);

const pass = [];
const fail = [];
const check = (label, cond) => (cond ? pass : fail).push(label);

/** A tiny MCP-over-stdio client for one agent station. */
function agent(station) {
  const child = spawn('node', [SERVER], {
    env: { ...process.env, FORZE_STATION: station, FORZE_BUS_FILE: busFile },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  let buf = '';
  const pending = new Map();
  let id = 0;
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const m = JSON.parse(line);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      }
    }
  });
  const call = (method, params) =>
    new Promise((res) => {
      const myid = ++id;
      pending.set(myid, res);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myid, method, params }) + '\n');
    });
  return {
    init: () => call('initialize', { protocolVersion: '2024-11-05', capabilities: {} }),
    tool: (name, args) =>
      call('tools/call', { name, arguments: args || {} }).then((r) => {
        const res = r.result ?? {};
        const text = res.content?.[0]?.text ?? '';
        // Error results carry a plain-text message, not JSON — surface them as
        // { isError, error } so tests can assert on bad-input handling.
        if (res.isError) return { isError: true, error: text };
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }),
    kill: () => child.kill(),
  };
}

async function main() {
  // --- Scenario: two agents coordinate through the bus --------------------
  const claude = agent('Claude Code #1');
  const codex = agent('Codex #1');
  await claude.init();
  await codex.init();

  await claude.tool('forze_bus_announce', { status: 'building the auth module' });
  await claude.tool('forze_bus_note', { key: 'db', value: 'use Postgres, not SQLite' });

  const who = await codex.tool('forze_bus_whoami');
  check('Codex sees Claude in the roster', who.teammates.includes('Claude Code #1'));

  const board = await codex.tool('forze_bus_board');
  const dbNote = board.notes.find((n) => n.key === 'db');
  check(
    'Codex reads the board note Claude pinned',
    !!dbNote && dbNote.value.includes('Postgres') && dbNote.by === 'Claude Code #1',
  );

  await codex.tool('forze_bus_send', {
    to: 'Claude Code #1',
    message: "I'll take the API routes then.",
  });
  const inbox = await claude.tool('forze_bus_inbox', {});
  check(
    "Claude receives Codex's direct message",
    inbox.messages.some((m) => m.from === 'Codex #1'),
  );
  const inbox2 = await claude.tool('forze_bus_inbox', {});
  check('Inbox read-cursor advances (no re-delivery)', inbox2.unreadCount === 0);

  const roster = await claude.tool('forze_bus_roster');
  check('Roster holds both stations', roster.roster.length === 2);

  // --- Shared task queue lifecycle (the universally-useful part) -----------
  const added = await claude.tool('forze_bus_task_add', {
    title: 'Wire up login endpoint',
    detail: 'POST /login returning a JWT',
  });
  check('A task can be added', added.ok && !!added.task.id && added.task.status === 'todo');
  await claude.tool('forze_bus_task_add', { title: 'Write auth tests' });

  const codexSees = await codex.tool('forze_bus_tasks');
  check('Other agent sees the shared task queue', codexSees.tasks.length === 2 && codexSees.open === 2);

  const claim = await codex.tool('forze_bus_task_claim', { id: added.task.id });
  check('A task can be claimed (owner + doing)', claim.task.owner === 'Codex #1' && claim.task.status === 'doing');

  // Claude must NOT be able to re-claim Codex's in-progress task.
  const reclaim = await claude.tool('forze_bus_task_claim', { id: added.task.id });
  check('Claiming a task owned by another is refused', reclaim.isError === true);

  const done = await codex.tool('forze_bus_task_update', { id: added.task.id, status: 'done' });
  check('A task can be marked done', done.ok && done.task.status === 'done');

  const open = await claude.tool('forze_bus_tasks', { status: 'todo' });
  check('Status filter + open count are correct', open.tasks.length === 1 && open.open === 1);

  // --- Atomic claim-next (race-free task pull) ----------------------------
  // One unclaimed "todo" remains ("Write auth tests"). task_next must claim it
  // in a single locked step, then report an empty queue with guidance.
  const next1 = await codex.tool('forze_bus_task_next');
  check(
    'task_next claims the oldest unclaimed todo (owner + doing)',
    !!next1.task && next1.task.title === 'Write auth tests' && next1.task.owner === 'Codex #1' && next1.task.status === 'doing',
  );
  const next2 = await claude.tool('forze_bus_task_next');
  check(
    'task_next returns task: null with guidance when nothing is unclaimed',
    next2.ok === true && next2.task === null && typeof next2.message === 'string' && next2.message.length > 0,
  );

  // Two agents racing task_next on a single fresh task: exactly one wins.
  const raceTask = await claude.tool('forze_bus_task_add', { title: 'Single contested task' });
  const [raceA, raceB] = await Promise.all([
    claude.tool('forze_bus_task_next'),
    codex.tool('forze_bus_task_next'),
  ]);
  const winners = [raceA, raceB].filter((r) => r.task && r.task.id === raceTask.task.id);
  check('Concurrent task_next yields exactly one winner (no double-claim)', winners.length === 1);

  // --- Hardening: bad input is handled gracefully, never crashes -----------
  const badId = await claude.tool('forze_bus_task_update', { id: 'nope', status: 'done' });
  check('Unknown task id returns a clean error (no crash)', badId.isError === true);
  const badStatus = await claude.tool('forze_bus_task_update', { id: added.task.id, status: 'banana' });
  check('Invalid status is rejected', badStatus.isError === true);
  const emptyAdd = await claude.tool('forze_bus_task_add', { title: '   ' });
  check('Empty task title is rejected', emptyAdd.isError === true);

  // --- Collision prevention: path leases (the whole point of the crew) -----
  // Two scoped tasks over overlapping files. Once one is claimed, its files are
  // leased — the overlapping task must NOT be handed to a second agent until the
  // first is done. This is what stops two CLIs clobbering each other's work.
  const tP = await claude.tool('forze_bus_task_add', { title: 'touch module A', scope: ['src/app'] });
  const tQ = await claude.tool('forze_bus_task_add', { title: 'touch module A api', scope: ['src/app/api.ts'] });
  const aGot = await claude.tool('forze_bus_task_next');
  check('task_next claims the first scoped task', !!aGot.task && aGot.task.id === tP.task.id);
  const bBlocked = await codex.tool('forze_bus_task_next');
  check(
    'Overlapping task is withheld while its files are leased (no collision)',
    bBlocked.task === null || bBlocked.task.id !== tQ.task.id,
  );
  // Direct claim of the leased-overlapping task is refused with guidance.
  const bClaim = await codex.tool('forze_bus_task_claim', { id: tQ.task.id });
  check('Claiming a task that overlaps an in-flight lease is refused', bClaim.isError === true);
  // Finish the first → its lease releases → the overlapping task is now claimable.
  await claude.tool('forze_bus_task_update', { id: tP.task.id, status: 'done' });
  const bNow = await codex.tool('forze_bus_task_next');
  check('Lease releases on "done" — the overlapping task can now be pulled', !!bNow.task && bNow.task.id === tQ.task.id);
  await codex.tool('forze_bus_task_update', { id: tQ.task.id, status: 'done' });

  // --- Dependencies: a task waits for its prerequisite ---------------------
  const depA = await claude.tool('forze_bus_task_add', { title: 'define schema', scope: ['db/schema.sql'] });
  const depB = await claude.tool('forze_bus_task_add', {
    title: 'use schema',
    scope: ['src/queries.ts'],
    dependsOn: [depA.task.id],
  });
  // depB depends on depA — task_next should hand out depA first, never depB.
  const firstPull = await codex.tool('forze_bus_task_next');
  check('Dependent task is not handed out before its prerequisite', !!firstPull.task && firstPull.task.id === depA.task.id);
  const claimBlocked = await claude.tool('forze_bus_task_claim', { id: depB.task.id });
  check('Claiming a task with an unfinished dependency is refused', claimBlocked.isError === true);
  await codex.tool('forze_bus_task_update', { id: depA.task.id, status: 'done' });
  const depBpull = await claude.tool('forze_bus_task_next');
  check('Once the prerequisite is done, the dependent task is claimable', !!depBpull.task && depBpull.task.id === depB.task.id);

  // --- forze_bus_plan: architect lays the whole plan in one call -----------
  const planner = agent('Architect');
  await planner.init();
  const plan = await planner.tool('forze_bus_plan', {
    goal: 'Ship the dashboard',
    lanes: [
      { name: 'lane-1', paths: ['src/ui'] },
      { name: 'lane-2', paths: ['src/server'] },
    ],
    tasks: [
      { title: 'build chart', scope: ['src/ui/Chart.tsx'], lane: 'lane-1', acceptance: 'renders' },
      { title: 'wire endpoint', scope: ['src/server/api.ts'], lane: 'lane-2', dependsOn: ['build chart'] },
    ],
  });
  check('forze_bus_plan records goal + lanes + tasks in one call', plan.ok === true && plan.tasksAdded === 2 && plan.lanes.length === 2);
  const synced = await planner.tool('forze_bus_sync');
  check('forze_bus_sync returns the goal it just set', synced.goal === 'Ship the dashboard');
  planner.kill();

  // --- Concurrency: 100 simultaneous writes across 4 agents ---------------
  const fleet = ['Claude Code #1', 'Codex #1', 'OpenCode #1', 'Antigravity #1'].map(agent);
  await Promise.all(fleet.map((a) => a.init()));
  const burst = [];
  for (let i = 0; i < 25; i++) {
    for (const [j, a] of fleet.entries()) {
      burst.push(a.tool('forze_bus_send', { to: 'all', message: `burst-${j}-${i}` }));
    }
  }
  await Promise.all(burst);
  await new Promise((r) => setTimeout(r, 300));

  const final = JSON.parse(await fs.readFile(busFile, 'utf-8'));
  const survived = final.messages.filter((m) => /^burst-\d-\d+$/.test(m.text)).length;
  check('All 100 concurrent writes persisted (lock works)', survived === 100);
  check('Bus file is still valid JSON', final.version === 2 && Array.isArray(final.messages));
  let staleLock = false;
  try {
    await fs.stat(`${busFile}.lock`);
    staleLock = true;
  } catch {
    /* good — no lock left */
  }
  check('No stale lock file left behind', !staleLock);

  claude.kill();
  codex.kill();
  fleet.forEach((a) => a.kill());
  await fs.rm(busFile).catch(() => {});

  // --- Report --------------------------------------------------------------
  console.log('\nForze Context Bus — self-test\n');
  pass.forEach((l) => console.log(`  ✓ ${l}`));
  fail.forEach((l) => console.log(`  ✗ ${l}`));
  console.log(`\n${pass.length} passed, ${fail.length} failed`);
  if (fail.length === 0) {
    console.log('\nThe bus substrate works. Next: enable it in the app and test with real CLIs.');
  }
  process.exit(fail.length ? 1 : 0);
}

main().catch((err) => {
  console.error('self-test crashed:', err);
  process.exit(1);
});
