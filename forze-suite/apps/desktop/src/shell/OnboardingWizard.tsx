import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  FolderOpen,
  GitBranch,
  KeyRound,
  Megaphone,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Files,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AnthropicProvider, GeminiProvider } from '@forze/agents';
import { pickFolder } from '../lib/dialog';
import { openWorkspace } from '../workbench/actions';
import { useAgents } from '../workbench/agentStore';
import { useProject } from '../workbench/projectStore';

interface OnboardingState {
  completed: boolean;
  markComplete: () => void;
  reset: () => void;
}

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      markComplete: () => set({ completed: true }),
      reset: () => set({ completed: false }),
    }),
    { name: 'forze.onboarding.v2' },
  ),
);

type Step = 'welcome' | 'tour' | 'workspace' | 'agent' | 'done';
const STEP_ORDER: Step[] = ['welcome', 'tour', 'workspace', 'agent', 'done'];

interface WalkItem {
  icon: LucideIcon;
  title: string;
  body: string;
  example: string;
}

const WALK: WalkItem[] = [
  {
    icon: Files,
    title: 'Explorer & multi-tab editor',
    body: 'Open a folder once and the file tree mounts in the left rail. Click a file to open it in a tab at the top. Edits are buffered; Ctrl+S writes to disk and clears the modified dot.',
    example: '~/projects/forge\n  ├─ app/\n  │   └─ page.tsx        ●  ← unsaved\n  └─ package.json',
  },
  {
    icon: TerminalSquare,
    title: 'Real PTY terminal',
    body: 'Not a fake log viewer — a real shell (PowerShell on Windows, $SHELL on Unix) with portable-pty + xterm.js. Multi-tab, ANSI colors, resize follows the panel.',
    example: '> pnpm dev\n  ▲ Next.js 15.0.0\n  - Local:   http://localhost:3000\n  ✓ Ready in 1.2s',
  },
  {
    icon: GitBranch,
    title: 'Source Control',
    body: 'Live `git status` panel: stage / unstage / commit without leaving the IDE. Branch shows in the status bar.',
    example: ' M  app/page.tsx       [stage]\n??  app/(marketing)/    [stage]\n[Commit] ↩ Ship hero refactor',
  },
  {
    icon: Bot,
    title: 'Shared MCP context for every coding agent',
    body: 'The same `@forze/mcp-server` powers the in-IDE chat AND external CLIs like Claude Code or Codex. They all read the same workspace, brand, and active buffer — no copy-pasting.',
    example: 'Tools available to every agent:\n  forze.workspace.read_file\n  forze.git.status / .diff / .log\n  forze.security.scan_buffer\n  forze.social.queue',
  },
  {
    icon: Megaphone,
    title: 'Social scheduling + marketing agent',
    body: 'Compose a post, pick a platform (LinkedIn / X / Threads / TikTok / Reddit / Instagram / YouTube), and schedule it. The @marketing preset drafts posts straight from your latest git diff.',
    example: '[LinkedIn]   "Shipped the new pricing flow."\n[scheduled  → 2026-05-30 09:00]\n[status     → queued · 0 attempts]',
  },
  {
    icon: ShieldCheck,
    title: 'Vibe Security Auditor',
    body: 'Two scans run in-process so they work offline: secret detection in the active buffer (Gemini / Stripe / OpenAI / Supabase / AWS keys) and RLS sanity on Supabase migrations.',
    example: '── secret-scan ──\n  GEMINI_API_KEY  L42  "process.env.GEMINI_AP…"\n  → move into the server-side broker.',
  },
  {
    icon: Sparkles,
    title: 'Vibe Canvas',
    body: 'Drop a mockup image into the canvas; the vision pipeline returns Tailwind JSX inserted at your cursor. Bi-directional — edits in code reflect back in the canvas.',
    example: 'mockup.png → <section class="mx-auto…">…</section>',
  },
];

export default function OnboardingWizard(): JSX.Element | null {
  const completed = useOnboarding((s) => s.completed);
  const markComplete = useOnboarding((s) => s.markComplete);
  const [step, setStep] = useState<Step>('welcome');

  useEffect(() => {
    if (!completed) setStep('welcome');
  }, [completed]);

  if (completed) return null;

  const stepIndex = STEP_ORDER.indexOf(step);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEP_ORDER.length - 1;

  const goNext = () => {
    const next = STEP_ORDER[stepIndex + 1];
    if (next) setStep(next);
  };
  const goPrev = () => {
    const prev = STEP_ORDER[stepIndex - 1];
    if (prev) setStep(prev);
  };

  return (
    <div className="cmd-palette__overlay" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div className="wizard">
        <div className="wizard__header">
          <div className="wizard__step-indicator" role="progressbar" aria-valuenow={stepIndex + 1} aria-valuemin={1} aria-valuemax={STEP_ORDER.length} aria-label={`Step ${stepIndex + 1} of ${STEP_ORDER.length}`}>
            {STEP_ORDER.map((id, idx) => (
              <span
                key={id}
                className={
                  idx === stepIndex ? 'is-current' : idx < stepIndex ? 'is-past' : ''
                }
              />
            ))}
          </div>
          {step === 'welcome' && (
            <>
              <h2 className="wizard__title" id="wizard-title">Welcome to Forze IDE</h2>
              <p className="wizard__subtitle">
                The sovereign OS for startup founders. Ship code, distribution, and
                safety rails from one window.
              </p>
            </>
          )}
          {step === 'tour' && (
            <>
              <h2 className="wizard__title" id="wizard-title">What you can do here</h2>
              <p className="wizard__subtitle">
                Seven surfaces that work together. Each one has a real
                implementation — not a stub.
              </p>
            </>
          )}
          {step === 'workspace' && (
            <>
              <h2 className="wizard__title" id="wizard-title">Open a folder</h2>
              <p className="wizard__subtitle">
                Forze treats one folder at a time as the active project. The
                explorer, git, MCP context, and agents all read from it.
              </p>
            </>
          )}
          {step === 'agent' && (
            <>
              <h2 className="wizard__title" id="wizard-title">Connect a model</h2>
              <p className="wizard__subtitle">
                Forze comes with Gemini built in — you can skip this and start
                chatting right away. Bring your own Gemini or Claude key any
                time for higher limits or a different model.
              </p>
            </>
          )}
          {step === 'done' && (
            <>
              <h2 className="wizard__title" id="wizard-title">You&apos;re set.</h2>
              <p className="wizard__subtitle">
                Hit <kbd className="kbd-inline">Ctrl</kbd>+
                <kbd className="kbd-inline">Shift</kbd>+
                <kbd className="kbd-inline">P</kbd> any time for the command
                palette.
              </p>
            </>
          )}
        </div>

        <div className="wizard__body">
          {step === 'welcome' && <WelcomeBody />}
          {step === 'tour' && <TourBody />}
          {step === 'workspace' && <WorkspaceBody />}
          {step === 'agent' && <AgentBody />}
          {step === 'done' && <DoneBody />}
        </div>

        <nav className="wizard__footer" aria-label="Wizard navigation">
          {!isFirst && (
            <button type="button" className="btn-ghost" onClick={goPrev}>
              <ArrowLeft size={12} strokeWidth={1.8} style={{ marginRight: 6 }} />
              Back
            </button>
          )}
          <div className="spacer" />
          {!isLast ? (
            <button type="button" className="btn-primary" onClick={goNext}>
              Next
              <ArrowRight size={12} strokeWidth={1.8} style={{ marginLeft: 6 }} />
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={markComplete}>
              Open IDE
              <ArrowRight size={12} strokeWidth={1.8} style={{ marginLeft: 6 }} />
            </button>
          )}
        </nav>
      </div>
    </div>
  );
}

function WelcomeBody(): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 16,
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <Sparkles
          size={22}
          strokeWidth={1.6}
          style={{ color: 'var(--color-accent-bright)' }}
        />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            One window, end-to-end.
          </div>
          <p
            className="muted"
            style={{ marginTop: 4, fontSize: 12, lineHeight: 1.55 }}
          >
            Editor · terminal · git · agents · social · security — every surface
            shares state through the same MCP server, so Claude Code, Codex, and
            the in-IDE chat all see the same workspace.
          </p>
        </div>
      </div>
      <div className="feature-walk">
        {WALK.slice(0, 3).map((item) => (
          <WalkRow key={item.title} item={item} />
        ))}
      </div>
    </div>
  );
}

function TourBody(): JSX.Element {
  return (
    <div className="feature-walk">
      {WALK.map((item) => (
        <WalkRow key={item.title} item={item} />
      ))}
    </div>
  );
}

function WalkRow({ item }: { item: WalkItem }): JSX.Element {
  const Icon = item.icon;
  return (
    <div className="feature-walk__item">
      <div className="feature-walk__icon">
        <Icon size={16} strokeWidth={1.6} />
      </div>
      <div>
        <h3 className="feature-walk__title">{item.title}</h3>
        <p className="feature-walk__body">{item.body}</p>
        <pre className="feature-walk__example">{item.example}</pre>
      </div>
    </div>
  );
}

function WorkspaceBody(): JSX.Element {
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="feature-walk__item">
        <div className="feature-walk__icon">
          <FolderOpen size={16} strokeWidth={1.6} />
        </div>
        <div>
          <h3 className="feature-walk__title">Pick a folder</h3>
          <p className="feature-walk__body">
            Any directory works. Forze will lazy-load the tree, watch it for
            changes via the OS, and treat it as the active workspace for git +
            MCP.
          </p>
          <p
            className="feature-walk__example"
            style={{
              color: workspaceRoot ? 'var(--color-ok)' : 'var(--color-text-dim)',
            }}
          >
            {workspaceRoot ? `✓  ${workspaceRoot}` : 'no folder selected yet'}
          </p>
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                const picked = await pickFolder();
                if (picked) await openWorkspace(picked);
              }}
            >
              <FolderOpen
                size={12}
                strokeWidth={1.8}
                style={{ marginRight: 6, verticalAlign: 'text-bottom' }}
              />
              Choose folder…
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentBody(): JSX.Element {
  const anthropicKey = useAgents((s) => s.apiKeys[AnthropicProvider.id] ?? '');
  const geminiKey = useAgents((s) => s.apiKeys[GeminiProvider.id] ?? '');
  const setApiKey = useAgents((s) => s.setApiKey);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <KeyRow
        provider={GeminiProvider.id}
        label="Google Gemini — built in"
        models="Gemini 2.5 Flash · Pro · Flash Lite"
        link="https://aistudio.google.com/app/apikey"
        value={geminiKey}
        onChange={(v) => setApiKey(GeminiProvider.id, v)}
      />
      <KeyRow
        provider={AnthropicProvider.id}
        label="Anthropic (Claude) — optional"
        models="Opus 4.7 · Sonnet 4.6 · Haiku 4.5"
        link="https://console.anthropic.com/settings/keys"
        value={anthropicKey}
        onChange={(v) => setApiKey(AnthropicProvider.id, v)}
      />
      <p className="dim" style={{ lineHeight: 1.6 }}>
        You can skip this entirely — Gemini works out of the box. Add a key only
        for higher limits or to use Claude. Keys are stored locally and only
        sent to the provider you choose.
      </p>
    </div>
  );
}

function KeyRow({
  provider,
  label,
  models,
  link,
  value,
  onChange,
}: {
  provider: string;
  label: string;
  models: string;
  link: string;
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
        }}
      >
        <KeyRound size={13} strokeWidth={1.8} />
        <strong style={{ fontSize: 13 }}>{label}</strong>
        {value && (
          <CheckCircle2
            size={13}
            style={{ color: 'var(--color-ok)', marginLeft: 'auto' }}
          />
        )}
      </div>
      <div className="dim" style={{ marginBottom: 8 }}>
        {models}{' '}
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--color-accent-bright)', textDecoration: 'none' }}
        >
          · get key
        </a>
      </div>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'AIza…'}
        style={{ width: '100%' }}
      />
    </div>
  );
}

function DoneBody(): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          fontSize: 13,
          lineHeight: 1.85,
          color: 'var(--color-text)',
        }}
      >
        <li>
          <kbd className="kbd-inline">Ctrl</kbd>+
          <kbd className="kbd-inline">Shift</kbd>+
          <kbd className="kbd-inline">P</kbd> — command palette (everything)
        </li>
        <li>
          <kbd className="kbd-inline">Ctrl</kbd>+<kbd className="kbd-inline">`</kbd> —
          open a terminal
        </li>
        <li>Type into the bar at the bottom to chat with the active agent</li>
        <li>Click the model pill to switch providers (Gemini ↔ Claude)</li>
        <li>Click Social in the rail to schedule a post</li>
      </ul>
      <div className="dim">
        Re-run this tour from the command palette any time:{' '}
        <em>Re-run Onboarding Wizard</em>.
      </div>
    </div>
  );
}
