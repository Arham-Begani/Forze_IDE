'use client';

import {
  CornerDownLeft,
  GitBranch,
  GitCommit,
  Send,
  Sparkles,
  Terminal,
  AlertTriangle,
  CircleAlert,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useStore, type BottomPanelTab } from '@/lib/store';
import { cn } from '@/lib/utils';
import { problems } from '@/lib/mock-data';
import { Logo } from './Logo';

const TABS: { id: BottomPanelTab; label: string; badge?: number; icon: typeof Sparkles }[] = [
  { id: 'chat', label: 'AI Chat', icon: Sparkles },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'problems', label: 'Problems', badge: problems.length, icon: CircleAlert },
  { id: 'git', label: 'Git', icon: GitBranch },
];

const QUICK_PROMPTS = [
  'Add a revenue chart',
  'Improve the UI design',
  'Add data fetching logic',
  'Optimize performance',
];

export function BottomPanel() {
  const tab = useStore((s) => s.bottomPanelTab);
  const setTab = useStore((s) => s.setBottomPanelTab);

  return (
    <section className="h-[260px] flex flex-col border-t border-line bg-bg-base">
      <div className="h-10 px-3 flex items-center gap-1 border-b border-line">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'h-9 px-3 flex items-center gap-2 text-sm relative transition-colors',
                isActive ? 'text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {t.badge ? (
                <span className="ml-1 text-2xs h-4 min-w-4 px-1 rounded-full bg-bg-active text-ink-muted flex items-center justify-center">
                  {t.badge}
                </span>
              ) : null}
              {isActive && (
                <span className="absolute -bottom-px left-2 right-2 h-px bg-accent" />
              )}
            </button>
          );
        })}
        <div className="ml-auto h-6 w-6 rounded-md flex items-center justify-center text-ink-dim">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'chat' && <ChatTab />}
        {tab === 'terminal' && <TerminalTab />}
        {tab === 'problems' && <ProblemsTab />}
        {tab === 'git' && <GitTab />}
      </div>
    </section>
  );
}

function ChatTab() {
  const messages = useStore((s) => s.chatMessages);
  const send = useStore((s) => s.sendChatMessage);
  const [draft, setDraft] = useState('');
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  function submit() {
    const v = draft.trim();
    if (!v) return;
    send(v);
    setDraft('');
  }

  return (
    <div className="h-full flex flex-col">
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <div className="flex items-start gap-3">
          <Logo size={28} />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-ink">VIBECODE AI</div>
            <div className="text-sm text-ink-muted mt-1">
              I&apos;ve analyzed your dashboard component. Would you like me to:
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="h-8 px-3 text-xs rounded-full border border-line bg-bg-raised hover:border-accent-border hover:bg-bg-hover text-ink-muted hover:text-ink transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {messages
          .filter((m, i) => !(i === 0 && m.role === 'assistant'))
          .map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-br-sm bg-accent-soft border border-accent-border text-ink text-sm">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-md bg-bg-raised border border-line flex items-center justify-center text-accent">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 max-w-[80%] px-3 py-2 rounded-2xl rounded-bl-sm bg-bg-surface border border-line text-ink-muted text-sm whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            ),
          )}
      </div>

      <div className="p-3 border-t border-line">
        <div className="flex items-center gap-2 h-11 px-3 rounded-xl border border-line bg-bg-surface focus-within:border-accent-border">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask me anything… (⌘ + Enter to send)"
            className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-dim"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center transition-colors',
              draft.trim()
                ? 'bg-accent text-bg-base hover:bg-accent-bright'
                : 'bg-bg-active text-ink-faint',
            )}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

const TERMINAL_LINES = [
  { who: 'arjun', dir: '~/saas-starter', cmd: 'pnpm dev' },
  { line: '> next dev' },
  { line: '  ▲ Next.js 14.2.5' },
  { line: '  - Local:   http://localhost:3000' },
  { line: '  - Network: http://192.168.1.42:3000' },
  { line: ' ✓ Ready in 842ms' },
  { line: ' ✓ Compiled / in 1.1s (1242 modules)' },
  { line: ' ✓ Compiled /dashboard in 322ms' },
  { who: 'arjun', dir: '~/saas-starter', cmd: '' },
];

function TerminalTab() {
  return (
    <div className="h-full overflow-y-auto bg-bg-base font-mono text-xs px-4 py-3 text-ink">
      {TERMINAL_LINES.map((l, i) =>
        'who' in l ? (
          <div key={i} className="flex items-center gap-1 mt-1">
            <span className="text-accent">{l.who}</span>
            <span className="text-ink-faint">in</span>
            <span className="text-ink-muted">{l.dir}</span>
            <span className="text-ink-faint">$</span>
            <span className="text-ink">{l.cmd}</span>
            {!l.cmd && <span className="ml-1 inline-block w-1.5 h-3.5 bg-accent animate-pulse-dot" />}
          </div>
        ) : (
          <div key={i} className="text-ink-muted">{l.line}</div>
        ),
      )}
    </div>
  );
}

function ProblemsTab() {
  return (
    <div className="h-full overflow-y-auto">
      {problems.map((p, i) => (
        <div
          key={i}
          className="px-4 py-2 border-b border-line-subtle flex items-start gap-2 hover:bg-bg-hover cursor-pointer"
        >
          {p.severity === 'error' ? (
            <CircleAlert className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-warn flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <div className="text-sm text-ink">{p.msg}</div>
            <div className="text-2xs text-ink-dim font-mono mt-0.5">
              {p.file}:{p.line}:{p.col}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function GitTab() {
  const commits = [
    { sha: 'f58f877', msg: 'feat(shared): expose package barrel exports', author: 'Arjun', when: '2m ago' },
    { sha: '8484c70', msg: 'feat(shared): add publishing helpers for venture release flow', author: 'Arjun', when: '34m ago' },
    { sha: 'cfc9834', msg: 'feat(shared): add stack-trace parsing utilities for diagnostics', author: 'Arjun', when: '1h ago' },
  ];
  const staged = ['app/dashboard/page.tsx'];
  const unstaged = ['schema.prisma', 'app/api/route.ts'];
  return (
    <div className="h-full overflow-y-auto px-4 py-3 space-y-4">
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <GitBranch className="w-3.5 h-3.5 text-accent" />
        <span className="text-ink">main</span>
        <span className="text-ink-faint">·</span>
        <span>up to date with origin/main</span>
      </div>
      <div>
        <div className="text-2xs uppercase tracking-wider text-ink-dim mb-1.5">Staged</div>
        {staged.map((f) => (
          <div key={f} className="text-xs font-mono text-ok flex items-center gap-2 py-0.5">
            <span>+</span><span className="text-ink">{f}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="text-2xs uppercase tracking-wider text-ink-dim mb-1.5">Changes</div>
        {unstaged.map((f) => (
          <div key={f} className="text-xs font-mono text-warn flex items-center gap-2 py-0.5">
            <span>M</span><span className="text-ink">{f}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="text-2xs uppercase tracking-wider text-ink-dim mb-1.5">Recent commits</div>
        {commits.map((c) => (
          <div key={c.sha} className="flex items-center gap-2 py-1 text-xs">
            <GitCommit className="w-3.5 h-3.5 text-ink-dim" />
            <span className="font-mono text-ink-faint">{c.sha}</span>
            <span className="text-ink-muted flex-1 truncate">{c.msg}</span>
            <span className="text-2xs text-ink-dim">{c.when}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CommandBar() {
  // Floating command bar in image — provided by BottomPanel's ChatTab input, this is kept available
  return null;
}

// Helper just for type assertions used by parent layout
export const _UnusedCornerDownLeft = CornerDownLeft;
