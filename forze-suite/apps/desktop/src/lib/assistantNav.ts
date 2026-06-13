/**
 * The set of places the Forze Assistant can take you. Each destination is a
 * single, side-effecting action against the workbench store (open a view, a
 * skill page, the terminal, …). This is the bridge that lets the in-app
 * assistant actually *drive* the IDE — "open the agent manager" really opens it.
 *
 * Keeping the manifest here (not in the component) means the assistant's system
 * prompt is generated from the same source of truth that executes the action,
 * so the model can never reference a destination that doesn't exist.
 */
import { useWorkbench } from '../workbench/store';
import { pickFolder } from './dialog';
import { openWorkspace } from '../workbench/actions';

export interface NavDestination {
  /** Stable id the model emits. */
  id: string;
  /** Human label shown on quick chips and in confirmations. */
  label: string;
  /** One-line description the model reads to decide when to use it. */
  blurb: string;
  run: () => void | Promise<void>;
}

const wb = () => useWorkbench.getState();

export const NAV_DESTINATIONS: NavDestination[] = [
  // Skill pages (open as full-area workspace tabs)
  {
    id: 'agent-manager',
    label: 'Agent Manager',
    blurb: 'Plan a goal and run a team of AI agents that read, edit and verify your project.',
    run: () => wb().openPage('agent-manager'),
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    blurb: 'Overview of your project — files, lines of code, survival score.',
    run: () => wb().openPage('dashboard'),
  },
  {
    id: 'analytics',
    label: 'Analytics',
    blurb: 'Charts and metrics for the project.',
    run: () => wb().openPage('analytics'),
  },
  {
    id: 'deployments',
    label: 'Deployments',
    blurb: 'Ship and deploy your app.',
    run: () => wb().openPage('deployments'),
  },
  {
    id: 'build-in-public',
    label: 'Build in Public',
    blurb: 'Draft build-in-public posts to LinkedIn from your commits — post now or schedule.',
    run: () => wb().openPage('build-in-public'),
  },
  {
    id: 'vibe-stations',
    label: 'Vibe Stations',
    blurb: 'A grid of CLI coding-agent terminals (Claude Code, Codex, and others).',
    run: () => wb().openPage('vibe-stations'),
  },
  {
    id: 'community',
    label: 'Community',
    blurb: 'The community hub.',
    run: () => wb().openPage('community'),
  },
  {
    id: 'team',
    label: 'Team',
    blurb: 'Manage your team and collaborators.',
    run: () => wb().openPage('team'),
  },
  {
    id: 'kanban',
    label: 'Kanban',
    blurb: 'The shared drag-and-drop task board the whole team can see and move.',
    run: () => wb().openPage('kanban'),
  },
  // Core IDE views (open in the left sidebar)
  {
    id: 'explorer',
    label: 'File Explorer',
    blurb: 'Browse the files in the open project.',
    run: () => wb().setActiveActivity('explorer'),
  },
  {
    id: 'search',
    label: 'Search',
    blurb: 'Search across all files in the project.',
    run: () => wb().setActiveActivity('search'),
  },
  {
    id: 'source-control',
    label: 'Source Control',
    blurb: 'Git status — stage hunks and commit.',
    run: () => wb().setActiveActivity('source-control'),
  },
  {
    id: 'vibe',
    label: 'Vibe Canvas',
    blurb: 'Turn a screenshot or mockup into clean Tailwind JSX.',
    run: () => wb().setActiveActivity('vibe'),
  },
  {
    id: 'security',
    label: 'Security',
    blurb: 'Audit the code for common vulnerabilities.',
    run: () => wb().setActiveActivity('security'),
  },
  {
    id: 'settings',
    label: 'Settings',
    blurb: 'Add API keys, switch model, change theme and preferences.',
    run: () => wb().setActiveActivity('settings'),
  },
  // Utilities
  {
    id: 'terminal',
    label: 'Terminal',
    blurb: 'Open the integrated terminal at the bottom.',
    run: () => wb().setBottomPanelTab('terminal'),
  },
  {
    id: 'open-folder',
    label: 'Open Folder',
    blurb: 'Pick a project folder from disk to open as the workspace.',
    run: async () => {
      const picked = await pickFolder();
      if (picked) await openWorkspace(picked);
    },
  },
];

export function findDestination(id: string): NavDestination | undefined {
  return NAV_DESTINATIONS.find((d) => d.id === id);
}

/** Bulleted manifest injected into the assistant's system prompt. */
export function navManifest(): string {
  return NAV_DESTINATIONS.map((d) => `- "${d.id}": ${d.label} — ${d.blurb}`).join('\n');
}

/** A handful of high-value destinations surfaced as quick chips in the UI. */
export const QUICK_DESTINATIONS = ['agent-manager', 'build-in-public', 'vibe', 'settings'];
