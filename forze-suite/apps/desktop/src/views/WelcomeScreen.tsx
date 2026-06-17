import { useState } from 'react';
import {
  ArrowUp,
  Bot,
  FolderOpen,
  GitBranch,
  KeyRound,
  Rocket,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  type LucideIcon,
} from 'lucide-react';
import { pickFolder } from '../lib/dialog';
import { openWorkspace } from '../workbench/actions';
import { askForze } from '../workbench/ask';
import { useAgents } from '../workbench/agentStore';
import { useCloud } from '../workbench/cloudStore';
import { useProject } from '../workbench/projectStore';
import { isDockable, useWorkbench, type ActivityId } from '../workbench/store';

const STARTERS = [
  'A SaaS landing page with a waitlist and Stripe checkout',
  'A Next.js + Postgres app with auth and a dashboard',
  'Add Stripe subscriptions to my existing app',
  'Explain this codebase and suggest the first three improvements',
];

interface FeatureCard {
  title: string;
  desc: string;
  icon: LucideIcon;
  action:
    | { kind: 'activity'; id: ActivityId }
    | { kind: 'panel'; id: 'terminal' }
    | { kind: 'assistant' };
}

const FEATURES: FeatureCard[] = [
  {
    title: 'Chat to build',
    desc: 'Describe a feature in plain English — Forze writes and edits the files for you, in context.',
    icon: Bot,
    action: { kind: 'assistant' },
  },
  {
    title: 'Vibe Canvas',
    desc: 'Drop a screenshot or mockup. Get clean, production Tailwind JSX back in your editor.',
    icon: Sparkles,
    action: { kind: 'activity', id: 'vibe' },
  },
  {
    title: 'Integrated terminal',
    desc: 'A real PTY shell inside the workspace. Run dev servers, migrations, anything.',
    icon: TerminalSquare,
    action: { kind: 'panel', id: 'terminal' },
  },
  {
    title: 'Source control',
    desc: 'Live git status, stage hunks, and commit — without leaving the flow.',
    icon: GitBranch,
    action: { kind: 'activity', id: 'source-control' },
  },
  {
    title: 'Ship it',
    desc: 'Push previews and production deploys, manage env vars, watch builds land.',
    icon: Rocket,
    action: { kind: 'activity', id: 'deployments' },
  },
  {
    title: 'Security rails',
    desc: 'Catch leaked API keys and missing Supabase RLS before they reach production.',
    icon: ShieldCheck,
    action: { kind: 'activity', id: 'security' },
  },
];

export default function WelcomeScreen(): JSX.Element {
  const [prompt, setPrompt] = useState('');
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const hasKey = useAgents((s) =>
    Object.values(s.apiKeys).some((k) => (k ?? '').length > 0),
  );
  const setActiveActivity = useWorkbench((s) => s.setActiveActivity);
  const setBottomPanelTab = useWorkbench((s) => s.setBottomPanelTab);
  const setAssistantOpen = useWorkbench((s) => s.setAssistantOpen);
  const openPage = useWorkbench((s) => s.openPage);
  // Projects mirrored to the Forze account — re-openable on any machine where
  // the path still exists (only metadata syncs; files never leave the device).
  const recentProjects = useCloud((s) =>
    s.projects.filter((p) => !!p.local_path && p.local_path !== workspaceRoot).slice(0, 6),
  );

  const submit = (): void => {
    const text = prompt.trim();
    if (!text) return;
    void askForze(text);
    setPrompt('');
  };

  return (
    <div className="launch">
      <header className="launch__hero">
        <span className="launch__brand">
          <span className="launch__brand-dot" />
          FORZE · BUILDER OS
        </span>
        <h1 className="launch__title">What are we building today?</h1>
        <p className="launch__subtitle">
          Describe it in a sentence. Forze scaffolds the code, wires the backend,
          and ships it — you stay in the vibe.
        </p>
      </header>

      <div className="launch__composer">
        <div className="launch__prompt">
          <Sparkles
            size={17}
            strokeWidth={1.7}
            className="launch__prompt-icon"
          />
          <textarea
            className="launch__prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Build a SaaS landing page with a waitlist and Stripe checkout…"
            rows={2}
            aria-label="Describe what you want to build"
          />
          <button
            type="button"
            className="launch__send"
            onClick={submit}
            disabled={!prompt.trim()}
            aria-label="Start building"
            title="Start building (Enter)"
          >
            <ArrowUp size={16} strokeWidth={2.2} />
          </button>
        </div>

        <div className="launch__chips">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              className="launch__chip"
              onClick={() => setPrompt(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="launch__actions">
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              const picked = await pickFolder();
              if (picked) await openWorkspace(picked);
            }}
          >
            <FolderOpen size={14} strokeWidth={1.8} />
            {workspaceRoot ? 'Open another folder' : 'Open a folder'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setActiveActivity('settings')}
          >
            <KeyRound size={14} strokeWidth={1.8} />
            {hasKey ? 'Manage API keys' : 'Connect an API key'}
          </button>
        </div>
      </div>

      {recentProjects.length > 0 && (
        <div className="launch__recents">
          <span className="launch__recents-label">Recent projects</span>
          <div className="launch__chips">
            {recentProjects.map((p) => (
              <button
                key={p.id}
                type="button"
                className="launch__chip"
                title={p.local_path ?? undefined}
                onClick={() => {
                  if (p.local_path) void openWorkspace(p.local_path);
                }}
              >
                <span aria-hidden="true">{p.icon ?? '🚀'}</span> {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="launch__features">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <button
              key={feature.title}
              type="button"
              className="feature-card"
              onClick={() => {
                if (feature.action.kind === 'assistant') {
                  setAssistantOpen(true);
                } else if (feature.action.kind === 'panel') {
                  setBottomPanelTab(feature.action.id);
                } else if (isDockable(feature.action.id)) {
                  // Skills open as full-area workspace tabs.
                  openPage(feature.action.id);
                } else {
                  setActiveActivity(feature.action.id);
                }
              }}
            >
              <span className="feature-card__icon">
                <Icon size={17} strokeWidth={1.7} />
              </span>
              <span className="feature-card__title">{feature.title}</span>
              <span className="feature-card__desc">{feature.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
