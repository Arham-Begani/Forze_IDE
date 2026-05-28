import {
  Files,
  GitBranch,
  Bot,
  Megaphone,
  Sparkles,
  ShieldCheck,
  TerminalSquare,
  FolderOpen,
  KeyRound,
  type LucideIcon,
} from 'lucide-react';
import { pickFolder } from '../lib/dialog';
import { openWorkspace } from '../workbench/actions';
import { useProject } from '../workbench/projectStore';
import { useWorkbench, type ActivityId } from '../workbench/store';

interface FeatureCard {
  title: string;
  desc: string;
  shortcut?: string;
  icon: LucideIcon;
  action: { kind: 'activity'; id: ActivityId } | { kind: 'panel'; id: 'terminal' };
}

const FEATURES: FeatureCard[] = [
  {
    title: 'Explorer',
    desc: 'Browse and edit your workspace. Drag, rename, search files.',
    shortcut: 'Ctrl+Shift+E',
    icon: Files,
    action: { kind: 'activity', id: 'explorer' },
  },
  {
    title: 'Terminal',
    desc: 'A real PTY shell inside the IDE. Run dev servers, scripts, anything.',
    shortcut: 'Ctrl+`',
    icon: TerminalSquare,
    action: { kind: 'panel', id: 'terminal' },
  },
  {
    title: 'Source Control',
    desc: 'Live git status, stage hunks, commit with one keystroke.',
    shortcut: 'Ctrl+Shift+G',
    icon: GitBranch,
    action: { kind: 'activity', id: 'source-control' },
  },
  {
    title: 'Agents',
    desc: 'Chat with @build, @security, @marketing on Claude or Gemini — they read your workspace via MCP.',
    shortcut: 'Ctrl+Shift+A',
    icon: Bot,
    action: { kind: 'activity', id: 'agents' },
  },
  {
    title: 'Social',
    desc: 'Schedule LinkedIn / X / Threads / TikTok posts. Calendar + queue.',
    icon: Megaphone,
    action: { kind: 'activity', id: 'social' },
  },
  {
    title: 'Vibe Canvas',
    desc: 'Drop a mockup PNG. Gemini returns Tailwind JSX into the cursor.',
    icon: Sparkles,
    action: { kind: 'activity', id: 'vibe' },
  },
  {
    title: 'Security',
    desc: 'Catch leaked API keys and missing Supabase RLS before commit.',
    icon: ShieldCheck,
    action: { kind: 'activity', id: 'security' },
  },
];

export default function WelcomeScreen(): JSX.Element {
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const setActiveActivity = useWorkbench((s) => s.setActiveActivity);
  const setBottomPanelTab = useWorkbench((s) => s.setBottomPanelTab);

  return (
    <div className="welcome">
      <div className="welcome__hero">
        <span className="welcome__brand">
          <span className="welcome__brand-dot" />
          Forze IDE · v0.3
        </span>
        <h1 className="welcome__title">The sovereign OS for founders.</h1>
        <p className="welcome__subtitle">
          Code, ship, and market from one window. Shared MCP context across every
          coding agent you use, a real PTY terminal, in-app social scheduling,
          and security rails that keep AI-introduced bugs out of production.
        </p>
        <div className="welcome__cta">
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              const picked = await pickFolder();
              if (picked) await openWorkspace(picked);
            }}
          >
            <FolderOpen
              size={13}
              strokeWidth={1.8}
              style={{ verticalAlign: 'text-bottom', marginRight: 6 }}
            />
            {workspaceRoot ? 'Open another folder' : 'Open folder'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setActiveActivity('settings')}
          >
            <KeyRound
              size={13}
              strokeWidth={1.8}
              style={{ verticalAlign: 'text-bottom', marginRight: 6 }}
            />
            Connect API keys
          </button>
        </div>
      </div>

      <div className="welcome__features">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <button
              key={feature.title}
              type="button"
              className="feature-card"
              onClick={() => {
                if (feature.action.kind === 'activity') {
                  setActiveActivity(feature.action.id);
                } else {
                  setBottomPanelTab(feature.action.id);
                }
              }}
            >
              <span className="feature-card__icon">
                <Icon size={14} strokeWidth={1.7} />
              </span>
              <span className="feature-card__title">{feature.title}</span>
              <span className="feature-card__desc">{feature.desc}</span>
              {feature.shortcut && (
                <span className="feature-card__shortcut">{feature.shortcut}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
