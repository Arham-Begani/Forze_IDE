'use client';

import {
  ArrowRight,
  Bot,
  Code2,
  Database,
  FileCode,
  Rocket,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Terminal,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type ActivityId } from '@/lib/store';
import { flattenFiles } from '@/lib/mock-fs';
import { cn } from '@/lib/utils';

type Item =
  | {
      kind: 'file';
      label: string;
      sub: string;
      path: string;
    }
  | {
      kind: 'nav';
      label: string;
      sub: string;
      target: ActivityId;
    }
  | {
      kind: 'action';
      label: string;
      sub: string;
      run: () => void;
    };

export function CommandPalette() {
  const open = useStore((s) => s.commandPaletteOpen);
  const setOpen = useStore((s) => s.setCommandPaletteOpen);
  const tree = useStore((s) => s.tree);
  const openFile = useStore((s) => s.openFile);
  const setActivity = useStore((s) => s.setActiveActivity);
  const setBottomTab = useStore((s) => s.setBottomPanelTab);
  const setRightTab = useStore((s) => s.setRightPanelTab);
  const sendChat = useStore((s) => s.sendChatMessage);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const files = flattenFiles(tree).map<Item>((f) => ({
      kind: 'file',
      label: f.name,
      sub: f.path,
      path: f.path,
    }));
    const navItems: Item[] = [
      { kind: 'nav', label: 'Go to Code', sub: 'Open the IDE workspace', target: 'code' },
      { kind: 'nav', label: 'Go to AI Agent', sub: 'Autonomous agent runner', target: 'agent' },
      { kind: 'nav', label: 'Go to Deployments', sub: 'Vercel / Railway / Cloudflare', target: 'deployments' },
      { kind: 'nav', label: 'Go to Analytics', sub: 'Revenue / users / churn', target: 'analytics' },
      { kind: 'nav', label: 'Go to Database', sub: 'Inspect Postgres tables', target: 'database' },
      { kind: 'nav', label: 'Go to Team', sub: 'Find co-founders and collaborators', target: 'team' },
      { kind: 'nav', label: 'Go to Marketplace', sub: 'Buy / sell components, kits, prompts', target: 'marketplace' },
      { kind: 'nav', label: 'Go to Community', sub: 'Builders feed & demo day', target: 'community' },
      { kind: 'nav', label: 'Go to Settings', sub: 'Theme, account, env, integrations', target: 'settings' },
    ];
    const actions: Item[] = [
      {
        kind: 'action',
        label: 'Toggle Terminal',
        sub: 'Show or focus the terminal',
        run: () => setBottomTab('terminal'),
      },
      {
        kind: 'action',
        label: 'Show Live Preview',
        sub: 'Right panel → Preview',
        run: () => setRightTab('preview'),
      },
      {
        kind: 'action',
        label: 'Ask AI: improve the dashboard',
        sub: 'Sends to AI Chat',
        run: () => {
          setBottomTab('chat');
          sendChat('Improve the UI design of the dashboard');
        },
      },
      {
        kind: 'action',
        label: 'Ask AI: add data fetching with revalidation',
        sub: 'Sends to AI Chat',
        run: () => {
          setBottomTab('chat');
          sendChat('Add data fetching logic with revalidation');
        },
      },
      {
        kind: 'action',
        label: 'Deploy to Production',
        sub: 'Vercel deploy of current main',
        run: () => setActivity('deployments'),
      },
    ];
    const all = [...navItems, ...actions, ...files];
    if (!query.trim()) return all.slice(0, 20);
    const q = query.toLowerCase();
    return all
      .filter((i) => i.label.toLowerCase().includes(q) || i.sub.toLowerCase().includes(q))
      .slice(0, 40);
  }, [query, tree, setActivity, setBottomTab, setRightTab, sendChat]);

  function runItem(item: Item) {
    if (item.kind === 'file') openFile(item.path);
    if (item.kind === 'nav') setActivity(item.target);
    if (item.kind === 'action') item.run();
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[15vh] animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[640px] max-w-[92vw] rounded-2xl border border-line-strong bg-bg-surface shadow-card animate-scale-in overflow-hidden"
      >
        <div className="flex items-center h-14 px-4 border-b border-line">
          <Search className="w-4 h-4 text-ink-dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelected((s) => Math.min(s + 1, items.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelected((s) => Math.max(s - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const it = items[selected];
                if (it) runItem(it);
              }
            }}
            placeholder="Type a command, search files, or ask the AI…"
            className="flex-1 bg-transparent outline-none ml-3 text-base text-ink placeholder:text-ink-dim"
          />
          <span className="text-2xs font-mono text-ink-faint border border-line rounded px-1.5 py-0.5">
            ESC
          </span>
        </div>
        <div className="max-h-[400px] overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-dim">
              No results.
            </div>
          ) : (
            items.map((item, idx) => (
              <button
                key={`${item.kind}-${item.label}-${idx}`}
                onClick={() => runItem(item)}
                onMouseEnter={() => setSelected(idx)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 h-11 rounded-lg text-left transition-colors',
                  idx === selected ? 'bg-bg-active text-ink' : 'text-ink-muted',
                )}
              >
                <ItemIcon item={item} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{item.label}</div>
                  <div className="text-2xs text-ink-dim truncate">{item.sub}</div>
                </div>
                <ItemKind item={item} />
                <ArrowRight
                  className={cn(
                    'w-3.5 h-3.5 transition-opacity',
                    idx === selected ? 'opacity-100 text-accent' : 'opacity-0',
                  )}
                />
              </button>
            ))
          )}
        </div>
        <div className="h-9 px-4 border-t border-line flex items-center gap-3 text-2xs text-ink-dim">
          <span>
            <kbd className="font-mono border border-line rounded px-1.5">↵</kbd>{' '}
            select
          </span>
          <span>
            <kbd className="font-mono border border-line rounded px-1.5">↑↓</kbd>{' '}
            navigate
          </span>
          <span>
            <kbd className="font-mono border border-line rounded px-1.5">⌘ K</kbd>{' '}
            toggle
          </span>
        </div>
      </div>
    </div>
  );
}

function ItemIcon({ item }: { item: Item }) {
  if (item.kind === 'file') return <FileCode className="w-4 h-4 text-ink-dim" />;
  if (item.kind === 'action') return <Sparkles className="w-4 h-4 text-accent" />;
  const Map: Record<ActivityId, typeof Code2> = {
    code: Code2,
    agent: Bot,
    preview: Sparkles,
    deployments: Rocket,
    analytics: Sparkles,
    database: Database,
    team: Users,
    marketplace: ShoppingBag,
    community: Sparkles,
    settings: Settings,
  };
  const Icon = Map[item.target];
  return <Icon className="w-4 h-4 text-ink-dim" />;
}

function ItemKind({ item }: { item: Item }) {
  const text =
    item.kind === 'file' ? 'File' : item.kind === 'nav' ? 'Navigate' : 'Action';
  return (
    <span className="text-2xs text-ink-faint uppercase tracking-wider">
      {text}
    </span>
  );
}
