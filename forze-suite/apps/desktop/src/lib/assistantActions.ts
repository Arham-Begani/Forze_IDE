/**
 * The verbs the Forze Assistant ("the manager") can *do*, beyond navigating.
 * This is the registry that turns the manager from open-a-page into act-on-a-
 * feature. Each verb names a tiny, side-effecting capability backed by a real
 * store; the model emits `{"actions":[{"action":"<name>","args":{…}}]}` and the
 * assistant store looks the verb up here and runs it.
 *
 * `impact` drives the confirmation policy: `instant` verbs run the moment the
 * model asks; `confirm` verbs (high-impact or outward-facing) are staged behind
 * a one-tap confirm chip first. Adding a new capability is one entry here plus,
 * if it's outward-facing, `impact: 'confirm'`.
 */
import { useKanban, resolveLane, type LaneBucket } from '../workbench/kanbanStore';
import { useWorkbench } from '../workbench/store';
import { useProject } from '../workbench/projectStore';
import { useIntegrations } from '../workbench/integrationsStore';
import { useCommunity } from '../workbench/communityStore';
import { useTeam } from '../workbench/teamStore';
import { useBipSchedule } from '../workbench/bipScheduleStore';
import { runMission } from './missionRunner';
import { missionKanbanBridge } from './missionKanbanBridge';
import { deployWithAutoFix } from './deployHeal';
import { computeWorkspaceMetrics } from './projectMetrics';
import { runDigest } from './digest';
import { composeRelease, writeChangelog } from './releaseComposer';
import { generateText } from './ai';
import { parseWhen } from './parseWhen';
import { basename } from './fs';
import { addTaskFromIde, enableBusForWorkspace, isBusEnabled, readBus, setNoteFromIde } from './agentBus';
import { briefReadyStations, runOnAllStations, startTeamGoal } from '../workbench/teamSync';
import { useAgentBus } from '../workbench/agentBusStore';
import {
  agentDef,
  MAX_STATIONS,
  parseStationLabel,
  useVibeStations,
} from '../workbench/vibeStationsStore';

export type ActionImpact = 'instant' | 'confirm';

export interface AssistantAction {
  /** Verb id the model emits. */
  name: string;
  impact: ActionImpact;
  /** Short human label for the confirm chip and the chat confirmation line. */
  describe: (args: Record<string, unknown>) => string;
  /** Perform the action; resolve with a one-line confirmation shown in chat. */
  run: (args: Record<string, unknown>) => Promise<string>;
  /** One line documenting the verb + its args, injected into the system prompt. */
  usage: string;
}

/** First non-empty string among the given arg keys. */
function str(args: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = args[key];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return undefined;
}

/** Best-effort resolve a user-named column ("done", "in progress") to a laneId. */
function matchLane(text?: string): string | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  const lane = useKanban
    .getState()
    .lanes.find(
      (l) => l.label.toLowerCase().includes(t) || t.includes(l.label.toLowerCase()),
    );
  return lane?.id;
}

/** Coarse column bucket from a free-text column name. */
function bucketFromText(text?: string): LaneBucket {
  const t = (text ?? '').toLowerCase();
  if (/done|complete|ship|finish/.test(t)) return 'done';
  if (/todo|to do|backlog|new|queue/.test(t)) return 'todo';
  return 'doing';
}

function truthy(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === 'yes';
}

/** Lowercase, hyphenated slug — safe for Vercel project names / member ids. */
function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}

const POST_TAGS = ['build-log', 'showcase', 'launch', 'milestone'] as const;
function pickTag(text?: string): (typeof POST_TAGS)[number] {
  const t = (text ?? '').toLowerCase();
  return POST_TAGS.find((tag) => tag === t || tag.replace('-', '') === t.replace(/[ -]/g, '')) ?? 'build-log';
}

const TEAM_ROLES = ['Co-founder', 'Designer', 'Developer', 'GTM'] as const;
function pickRole(text?: string): (typeof TEAM_ROLES)[number] {
  const t = (text ?? '').toLowerCase();
  return (
    TEAM_ROLES.find((r) => r.toLowerCase() === t) ??
    (/design/.test(t) ? 'Designer' : /found|ceo|cto|co-?found/.test(t) ? 'Co-founder' : /gtm|market|sales|growth/.test(t) ? 'GTM' : 'Developer')
  );
}

/** Short, single-line label for confirm chips / log lines. */
function clip(text: string | undefined, max = 48): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export const ASSISTANT_ACTIONS: AssistantAction[] = [
  {
    name: 'run_agent_goal',
    impact: 'confirm',
    usage:
      '"run_agent_goal" {goal: string} — hand a build / change / ship goal to the ' +
      'Architect. It plans the goal into tasks and runs a team of agents that read, ' +
      'edit, and verify the project, and the plan is mirrored live onto the Kanban. ' +
      'Use this (not just opening Agent Manager) whenever the user wants something ' +
      'built or changed in their code.',
    describe: (args) => `Run the agent team on: ${str(args, 'goal', 'task', 'prompt') ?? 'this goal'}`,
    run: async (args) => {
      const goal = str(args, 'goal', 'task', 'prompt');
      if (!goal) return "I couldn't tell what to build — try naming the goal.";
      // Open Agent Manager so the user watches the team work, then kick the
      // mission off fire-and-forget (it streams into the page + Kanban).
      useWorkbench.getState().openPage('agent-manager');
      void runMission({ goal, onMirror: missionKanbanBridge() });
      return `Started the team on: ${goal} — planning now, tracking it on the Kanban.`;
    },
  },
  {
    name: 'create_task',
    impact: 'instant',
    usage:
      '"create_task" {title: string, lane?: string} — add a card to the Kanban ' +
      'board. Use when the user mentions a to-do or something to track. "lane" is ' +
      'an optional column name (defaults to the first / "to do" column).',
    describe: (args) => `Add task: ${str(args, 'title', 'task', 'name') ?? ''}`,
    run: async (args) => {
      const title = str(args, 'title', 'task', 'name');
      if (!title) return "I couldn't tell what the task was.";
      const laneId = matchLane(str(args, 'lane', 'column', 'status')) ?? resolveLane('todo');
      if (!laneId) return 'Your board has no columns yet — add one first.';
      useKanban.getState().addCard(laneId, title);
      const laneLabel =
        useKanban.getState().lanes.find((l) => l.id === laneId)?.label ?? 'the board';
      return `Added "${title}" to ${laneLabel}.`;
    },
  },
  {
    name: 'move_task',
    impact: 'instant',
    usage:
      '"move_task" {title: string, lane: string} — move a Kanban card (matched by ' +
      'its title) to another column, e.g. mark it done or in progress.',
    describe: (args) => `Move "${clip(str(args, 'title', 'task', 'card'))}" → ${str(args, 'lane', 'column', 'to') ?? ''}`,
    run: async (args) => {
      const title = str(args, 'title', 'task', 'card');
      const laneArg = str(args, 'lane', 'column', 'to', 'status');
      if (!title) return 'Which task should I move?';
      const card = useKanban
        .getState()
        .cards.find((c) => c.title.toLowerCase().includes(title.toLowerCase()));
      if (!card) return `I couldn't find a task matching "${title}".`;
      const laneId = matchLane(laneArg) ?? resolveLane(bucketFromText(laneArg));
      if (!laneId) return 'Which column should it go to?';
      useKanban.getState().moveCard(card.id, laneId, null);
      const laneLabel = useKanban.getState().lanes.find((l) => l.id === laneId)?.label ?? 'the board';
      return `Moved "${card.title}" to ${laneLabel}.`;
    },
  },
  {
    name: 'read_analytics',
    impact: 'instant',
    usage:
      '"read_analytics" {} — read the open project\'s code metrics (files, lines, ' +
      'top languages) and report them. Use when the user asks how big the project ' +
      'is or how things are going code-wise.',
    describe: () => 'Read project metrics',
    run: async () => {
      const root = useProject.getState().workspaceRoot;
      if (!root) return 'Open a project folder first, then I can read its metrics.';
      const m = await computeWorkspaceMetrics(root);
      const top = m.languages
        .slice(0, 4)
        .map((l) => `${l.language} ${l.loc.toLocaleString()} LOC`)
        .join(', ');
      return `${m.totalFiles.toLocaleString()} files · ${m.totalLoc.toLocaleString()} lines${
        m.truncated ? '+' : ''
      }${top ? ` · top: ${top}` : ''}.`;
    },
  },
  {
    name: 'catch_me_up',
    impact: 'instant',
    usage:
      '"catch_me_up" {} — summarize what changed while the user was away: new git ' +
      'commits, uncommitted work, the autonomous agent crew\'s task board (esp. ' +
      'anything blocked), and recent coding-agent terminal output. Use when the user ' +
      'asks "what happened", "catch me up", "what did the agents do", or "what changed".',
    describe: () => 'Catch you up on recent activity',
    run: async () => {
      const root = useProject.getState().workspaceRoot;
      if (!root) return 'Open a project folder first, then I can catch you up.';
      const { text } = await runDigest({
        root,
        since: Date.now() - 8 * 60 * 60 * 1000,
        sinceLabel: 'earlier',
      });
      return text;
    },
  },
  {
    name: 'compose_release',
    impact: 'confirm',
    usage:
      '"compose_release" {} — draft release notes from the git commits since the ' +
      'last tag: writes a versioned entry to CHANGELOG.md and drafts a ' +
      'build-in-public announcement. Use when the user says "draft my release ' +
      'notes", "write a changelog", "release notes", or "what should the launch ' +
      'post say".',
    describe: () => 'Draft release notes + CHANGELOG',
    run: async () => {
      const root = useProject.getState().workspaceRoot;
      if (!root) return 'Open a project folder first, then I can draft your release notes.';
      const draft = await composeRelease(root);
      await writeChangelog(root, draft);
      const since = draft.sinceTag ? ` since ${draft.sinceTag}` : '';
      return (
        `Drafted **v${draft.version}** from ${draft.commitCount} commit` +
        `${draft.commitCount === 1 ? '' : 's'}${since} and wrote CHANGELOG.md.\n\n` +
        `Suggested post:\n\n${draft.announcement}\n\n` +
        `Say “post that to LinkedIn” to queue it, or run \`node scripts/release.mjs\` to ship v${draft.version}.`
      );
    },
  },
  {
    name: 'add_teammate',
    impact: 'instant',
    usage:
      '"add_teammate" {name: string, role?: "Co-founder"|"Designer"|"Developer"|"GTM"} ' +
      '— add a person to your team roster. Opens the Team page.',
    describe: (args) => `Add teammate: ${str(args, 'name') ?? ''}`,
    run: async (args) => {
      const name = str(args, 'name', 'person');
      if (!name) return 'Who should I add?';
      const role = pickRole(str(args, 'role'));
      useTeam.getState().addFromMatch({
        id: slug(name) || crypto.randomUUID().slice(0, 8),
        name,
        role,
        skills: [],
        availability: 'Unknown',
        matchScore: 0,
      });
      useWorkbench.getState().openPage('team');
      return `Added ${name} (${role}) to the team.`;
    },
  },
  {
    name: 'community_post',
    impact: 'confirm',
    usage:
      '"community_post" {body: string, tag?: "build-log"|"showcase"|"launch"|"milestone"} ' +
      '— post an update to the Forze community feed. Outward-facing, so it asks to confirm.',
    describe: (args) => `Post to community: "${clip(str(args, 'body', 'text', 'message'))}"`,
    run: async (args) => {
      const body = str(args, 'body', 'text', 'message');
      if (!body) return 'What should the post say?';
      useCommunity.getState().addPost(body, pickTag(str(args, 'tag')));
      useWorkbench.getState().openPage('community');
      return 'Posted to the community feed.';
    },
  },
  {
    name: 'submit_launch',
    impact: 'confirm',
    usage:
      '"submit_launch" {name: string, tagline: string} — submit a product to the ' +
      'community Demo Day for votes. Asks to confirm first.',
    describe: (args) => `Launch on Demo Day: ${str(args, 'name', 'product', 'title') ?? ''}`,
    run: async (args) => {
      const name = str(args, 'name', 'product', 'title');
      if (!name) return "What's the product called?";
      useCommunity.getState().submitLaunch(name, str(args, 'tagline', 'pitch', 'description') ?? '');
      useWorkbench.getState().openPage('community');
      return `Submitted "${name}" to Demo Day.`;
    },
  },
  {
    name: 'draft_post',
    impact: 'confirm',
    usage:
      '"draft_post" {about: string, when?: string} — write an authentic build-in-public ' +
      'post about an update and queue it for LinkedIn. "when" is an optional time phrase ' +
      '("now", "9pm", "tomorrow 9am"); defaults to now. Outward-facing — asks to confirm.',
    describe: (args) => `Draft a build-in-public post about: ${clip(str(args, 'about', 'topic', 'text'), 56)}`,
    run: async (args) => {
      const about = str(args, 'about', 'topic', 'text', 'goal');
      if (!about) return 'Tell me what the post should be about.';
      const draft = await generateText(
        `Write a short, authentic build-in-public LinkedIn post about: ${about}. ` +
          'First person, concrete and specific, no hashtag spam, 2-4 short paragraphs. ' +
          'Output only the post text.',
        { maxTokens: 500, module: 'assistant' },
      );
      const body = draft.trim().slice(0, 2800);
      const whenArg = str(args, 'when');
      const when = whenArg ? parseWhen(whenArg) : Date.now();
      useBipSchedule.getState().schedule(body, when ?? Date.now());
      useWorkbench.getState().openPage('build-in-public');
      return `Drafted and queued a build-in-public post${whenArg ? ` for ${whenArg}` : ''}.`;
    },
  },
  {
    name: 'read_team',
    impact: 'instant',
    usage:
      '"read_team" {} — read the Vibe Stations Context Bus: which agent stations are ' +
      'online and what they\'re doing, the shared decision board, and recent messages. ' +
      'Use when the user asks what the agents are up to or whether they\'ve agreed on ' +
      'something.',
    describe: () => 'Read the agent Context Bus',
    run: async () => {
      const root = useProject.getState().workspaceRoot;
      if (!root) return 'Open a project folder first.';
      const bus = await readBus(root);
      const stations = Object.entries(bus.roster);
      if (stations.length === 0 && Object.keys(bus.board).length === 0 && bus.messages.length === 0) {
        return 'No agents are on the Context Bus yet. Enable it on the Vibe Stations page, then launch and brief a station.';
      }
      const who =
        stations.map(([s, i]) => `${s}${i.status ? ` (${clip(i.status, 40)})` : ''}`).join('; ') || 'none online';
      const notes =
        Object.entries(bus.board)
          .slice(0, 5)
          .map(([k, v]) => `${k}: ${clip(v.value, 60)}`)
          .join(' · ') || 'empty';
      const recent =
        bus.messages
          .slice(-3)
          .map((m) => `${m.from}→${m.to}: ${clip(m.text, 50)}`)
          .join(' · ') || 'none';
      return `Stations: ${who}. Board: ${notes}. Recent: ${recent}.`;
    },
  },
  {
    name: 'team_broadcast',
    impact: 'confirm',
    usage:
      '"team_broadcast" {message: string} — run one instruction live on EVERY running ' +
      'Vibe Station agent at once (typed straight into each CLI) and record it on the ' +
      'bus. Use when the user wants all their agents to do or know something now, e.g. ' +
      '"tell everyone to switch to Postgres". Asks to confirm first.',
    describe: (args) => `Run on all stations: "${clip(str(args, 'message', 'instruction', 'text'))}"`,
    run: async (args) => {
      const message = str(args, 'message', 'instruction', 'text', 'command', 'prompt');
      if (!message) return 'What should the team do?';
      const root = useProject.getState().workspaceRoot;
      if (!root) return 'Open a project folder first.';
      useWorkbench.getState().openPage('vibe-stations');
      const delivered = await runOnAllStations(root, message);
      if (!delivered.length) {
        return 'No stations are running yet — launch some on the Vibe Stations page first.';
      }
      return `Ran it live on ${delivered.length} station(s): ${delivered.join(', ')}.`;
    },
  },
  {
    name: 'add_team_task',
    impact: 'instant',
    usage:
      '"add_team_task" {title: string, detail?: string} — add a task to the shared ' +
      'agent task queue (the team TODO that every Vibe Station reads). Use when the ' +
      'user wants the agents to pick up a piece of work, or to capture a follow-up.',
    describe: (args) => `Add team task: ${clip(str(args, 'title', 'task', 'name'))}`,
    run: async (args) => {
      const title = str(args, 'title', 'task', 'name', 'todo');
      if (!title) return 'What should the task be?';
      const root = useProject.getState().workspaceRoot;
      if (!root) return 'Open a project folder first.';
      await addTaskFromIde(root, title, str(args, 'detail', 'description') ?? '');
      return `Added "${title}" to the team task queue — agents see it via forze_bus_tasks.`;
    },
  },
  {
    name: 'team_build',
    impact: 'confirm',
    usage:
      '"team_build" {goal: string, agent?: "claude"|"codex"|"antigravity"|"opencode", count?: number} — ' +
      'have the REAL Vibe Station coding CLIs build something together as a CREW, end to end. Opens Vibe ' +
      'Stations, turns on the shared Crew Bus, launches the agents if none are running, then assigns roles — ' +
      'an Architect that plans + scopes the work into disjoint file lanes, lane-locked Builders that each own ' +
      'a slice (so they never collide), and a Reviewer that integrates + tests — and sets them working ' +
      'autonomously. This is the main way to "have the agents do X" — prefer it over run_agent_goal when the ' +
      'user means their CLI agents (Claude Code/Codex/etc.). Defaults to a 3-station crew. Asks to confirm first.',
    describe: (args) => `Put the CLI team on: ${clip(str(args, 'goal', 'task', 'prompt', 'build'))}`,
    run: async (args) => {
      const goal = str(args, 'goal', 'task', 'prompt', 'build', 'objective');
      if (!goal) return 'What should the team build?';
      const root = useProject.getState().workspaceRoot;
      if (!root) return 'Open a project folder first, then I can put the team on it.';
      const agentId = parseStationLabel(str(args, 'agent', 'agents', 'cli', 'with') ?? '')?.agentId ?? 'claude';
      const want = Math.max(1, Math.min(MAX_STATIONS, Math.round(Number(args.count) || 3)));

      // Enable the bus BEFORE launching so new stations boot with their identity.
      if (!(await isBusEnabled(root))) await enableBusForWorkspace(root);
      await useAgentBus.getState().refresh(root);

      useWorkbench.getState().openPage('vibe-stations');
      const vibe = useVibeStations.getState();
      const existing = vibe.stations.filter((s) => s.agentId === agentId).length;
      let total = vibe.stations.length;
      let launched = 0;
      for (let i = existing; i < want && total < MAX_STATIONS; i++) {
        vibe.addStation(agentId, root);
        total++;
        launched++;
      }

      const res = await startTeamGoal(root, goal);
      const label = agentDef(agentId).label;
      const launchNote = launched ? `, launched ${launched} new station(s)` : '';
      const roleParts: string[] = [];
      if (res.architect) roleParts.push(`Architect ${res.architect}`);
      if (res.builders) roleParts.push(`${res.builders} Builder(s)`);
      if (res.reviewer) roleParts.push(`Reviewer ${res.reviewer}`);
      const crew = roleParts.join(', ') || 'the crew';
      return `On it — the ${label} crew is set up (${crew})${launchNote}. The Architect plans + scopes lanes, Builders work only their own files, the Reviewer integrates and tests. Watch them on the Vibe Stations page.`;
    },
  },
  {
    name: 'open_stations',
    impact: 'instant',
    usage:
      '"open_stations" {agent?: "claude"|"codex"|"antigravity"|"opencode", count?: number} — open Vibe ' +
      'Station coding-CLI terminals (Claude Code by default, count defaults to 1). Use when the user just ' +
      'wants to spin up agents without giving a goal yet.',
    describe: () => 'Open coding-CLI station(s)',
    run: async (args) => {
      const root = useProject.getState().workspaceRoot;
      const agentId = parseStationLabel(str(args, 'agent', 'agents', 'cli') ?? '')?.agentId ?? 'claude';
      const want = Math.max(1, Math.min(MAX_STATIONS, Math.round(Number(args.count) || 1)));
      useWorkbench.getState().openPage('vibe-stations');
      const vibe = useVibeStations.getState();
      let total = vibe.stations.length;
      let launched = 0;
      for (let i = 0; i < want && total < MAX_STATIONS; i++) {
        vibe.addStation(agentId, root ?? null);
        total++;
        launched++;
      }
      if (!launched) return `The station grid is full (max ${MAX_STATIONS}).`;
      return `Opened ${launched} ${agentDef(agentId).label} station(s).`;
    },
  },
  {
    name: 'brief_team',
    impact: 'instant',
    usage:
      '"brief_team" {} — brief every running Vibe Station onto the Context Bus so they start coordinating ' +
      '(check the shared task queue, claim work, announce status). Use if agents are running but ignoring the bus.',
    describe: () => 'Brief the running stations onto the bus',
    run: async () => {
      const root = useProject.getState().workspaceRoot;
      if (!root) return 'Open a project folder first.';
      if (!(await isBusEnabled(root))) {
        return "The Context Bus isn't on yet — give the team a goal with team_build and I'll enable it.";
      }
      const briefed = await briefReadyStations(undefined, true);
      return briefed.length
        ? `Briefed ${briefed.length} station(s): ${briefed.join(', ')}. They'll work the task queue.`
        : 'No stations are ready yet — open some first with open_stations.';
    },
  },
  {
    name: 'pin_decision',
    impact: 'instant',
    usage:
      '"pin_decision" {key: string, value: string} — pin a decision, contract, or ' +
      'convention to the shared agent board so every station follows it (e.g. key ' +
      '"db" value "use Postgres, not SQLite"). Use a short stable key.',
    describe: (args) => `Pin "${str(args, 'key', 'title', 'name') ?? ''}" to the team board`,
    run: async (args) => {
      const key = str(args, 'key', 'title', 'name', 'topic');
      const value = str(args, 'value', 'decision', 'text', 'body');
      if (!key || !value) return 'Give me a short key and the decision text to pin.';
      const root = useProject.getState().workspaceRoot;
      if (!root) return 'Open a project folder first.';
      await setNoteFromIde(root, key, value);
      return `Pinned "${key}" to the team board — agents will see it via forze_bus_board.`;
    },
  },
  {
    name: 'deploy',
    impact: 'confirm',
    usage:
      '"deploy" {production?: boolean} — deploy the open project folder to Vercel ' +
      '(self-healing build that auto-fixes failures). Needs a Vercel token connected. ' +
      'Opens the Deployments page. Asks to confirm first.',
    describe: (args) => `Deploy${truthy(args.production) ? ' to production' : ''} to Vercel`,
    run: async (args) => {
      const root = useProject.getState().workspaceRoot;
      if (!root) return 'Open a project folder first, then I can deploy it.';
      const token = useIntegrations.getState().vercelToken;
      if (!token) return 'Connect a Vercel token in Settings → Deployments first.';
      const teamId = useIntegrations.getState().vercelTeamId || undefined;
      useWorkbench.getState().openPage('deployments');
      try {
        const res = await deployWithAutoFix({
          token,
          root,
          name: slug(basename(root)) || 'forze-app',
          teamId,
          target: truthy(args.production) ? 'production' : undefined,
          autoFix: true,
        });
        if (res.state === 'READY') return `Deployed — ${res.url}`;
        return `Deploy finished as ${res.state}${res.url ? ` — ${res.url}` : ''}.`;
      } catch (err) {
        return `Deploy failed — ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  },
];

export function findAction(name: string): AssistantAction | undefined {
  return ASSISTANT_ACTIONS.find((a) => a.name === name);
}

/** Bulleted manifest of the action verbs, injected into the system prompt. */
export function actionManifest(): string {
  return ASSISTANT_ACTIONS.map((a) => `- ${a.usage}`).join('\n');
}
