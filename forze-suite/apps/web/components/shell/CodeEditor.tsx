'use client';

import { FileCode, FileJson, FileText, Plus, Split, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { highlightLines } from '@/lib/highlight';
import { useMemo } from 'react';

function tabIcon(lang: string) {
  if (lang === 'tsx' || lang === 'ts' || lang === 'js') return FileCode;
  if (lang === 'json') return FileJson;
  return FileText;
}

export function CodeEditor() {
  const tabs = useStore((s) => s.editorTabs);
  const activePath = useStore((s) => s.activeTabPath);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeTab = useStore((s) => s.closeTab);
  const getContent = useStore((s) => s.getFileContent);

  const activeTab = tabs.find((t) => t.path === activePath) ?? null;
  const content = activeTab ? getContent(activeTab.path) ?? '' : '';

  const lines = useMemo(
    () => (activeTab ? highlightLines(content, activeTab.language) : []),
    [content, activeTab],
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-bg-base">
      <div className="h-10 flex items-center border-b border-line bg-bg-base">
        <div className="flex-1 flex items-end overflow-x-auto scrollbar-thin min-w-0">
          {tabs.map((tab) => {
            const Icon = tabIcon(tab.language);
            const isActive = tab.path === activePath;
            return (
              <div
                key={tab.path}
                role="button"
                tabIndex={0}
                onClick={() => setActiveTab(tab.path)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveTab(tab.path);
                  }
                }}
                className={cn(
                  'group cursor-pointer flex items-center gap-2 h-10 px-3 border-r border-line text-sm transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-bg-surface text-ink border-t-2 border-t-accent -mt-px'
                    : 'text-ink-muted hover:bg-bg-hover hover:text-ink',
                )}
              >
                <Icon
                  className={cn(
                    'w-3.5 h-3.5',
                    isActive ? 'text-accent' : 'text-ink-dim',
                  )}
                />
                <span>{tab.name}</span>
                {tab.isDirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.path);
                  }}
                  className="ml-1 w-4 h-4 rounded flex items-center justify-center text-ink-dim hover:text-ink hover:bg-bg-active opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          <button
            className="h-10 w-10 flex items-center justify-center text-ink-dim hover:text-ink hover:bg-bg-hover transition-colors"
            title="New tab"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-1 px-2 border-l border-line h-10">
          <button className="w-7 h-7 rounded-md flex items-center justify-center text-ink-dim hover:text-ink hover:bg-bg-hover transition-colors">
            <Split className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto editor-grid font-mono text-[13px] leading-6 bg-bg-surface">
        {activeTab && content.length > 0 ? (
          <div className="flex">
            <div className="select-none text-right text-ink-faint pr-3 pl-3 border-r border-line-subtle bg-bg-surface sticky left-0">
              {lines.map((_, i) => (
                <div key={i} className="h-6">
                  {i + 1}
                </div>
              ))}
            </div>
            <pre className="flex-1 px-4 py-0 m-0 text-ink overflow-visible">
              {lines.map((tokens, i) => (
                <div key={i} className="h-6 whitespace-pre">
                  {tokens.length === 0 ? (
                    <span>&nbsp;</span>
                  ) : (
                    tokens.map((t, j) =>
                      t.cls ? (
                        <span key={j} className={t.cls}>
                          {t.text}
                        </span>
                      ) : (
                        <span key={j}>{t.text}</span>
                      ),
                    )
                  )}
                </div>
              ))}
            </pre>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-ink-dim gap-3 p-10">
            <FileCode className="w-10 h-10 text-ink-faint" />
            <p className="text-sm">No file open. Pick one from the explorer.</p>
          </div>
        )}
      </div>
    </div>
  );
}
