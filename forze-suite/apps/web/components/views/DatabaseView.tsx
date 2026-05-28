'use client';

import { Database, KeyRound, Play, Plus, Table } from 'lucide-react';
import { useState } from 'react';
import { databaseTables } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

export function DatabaseView() {
  const [selected, setSelected] = useState(databaseTables[0]!.name);
  const table = databaseTables.find((t) => t.name === selected) ?? databaseTables[0]!;

  return (
    <div className="flex-1 min-w-0 overflow-hidden bg-bg-base flex flex-col">
      <header className="px-8 py-6 border-b border-line flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink flex items-center gap-2">
            <Database className="w-5 h-5 text-accent" /> Database
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Postgres — connect via <code className="text-ink">DATABASE_URL</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-9 px-3 rounded-lg border border-line bg-bg-raised hover:bg-bg-hover text-ink text-sm flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Connection
          </button>
          <button className="h-9 px-3 rounded-lg bg-accent text-bg-base hover:bg-accent-bright text-sm font-medium flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Table
          </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-[240px_1fr] min-h-0">
        <aside className="border-r border-line bg-bg-surface overflow-y-auto">
          <div className="px-3 py-3 text-2xs uppercase tracking-wider text-ink-dim">
            Tables
          </div>
          {databaseTables.map((t) => (
            <button
              key={t.name}
              onClick={() => setSelected(t.name)}
              className={cn(
                'w-full flex items-center gap-2 h-9 px-3 text-sm text-left transition-colors',
                t.name === selected
                  ? 'bg-bg-active text-ink border-l-2 border-l-accent'
                  : 'text-ink-muted hover:bg-bg-hover hover:text-ink',
              )}
            >
              <Table className="w-3.5 h-3.5 text-ink-dim" />
              <span className="font-mono">{t.name}</span>
              <span className="ml-auto text-2xs text-ink-dim">{t.rows.toLocaleString()}</span>
            </button>
          ))}
        </aside>

        <section className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          <div className="rounded-xl border border-line bg-bg-surface">
            <div className="px-4 h-10 flex items-center justify-between border-b border-line">
              <h3 className="text-sm font-medium text-ink font-mono">{table.name}</h3>
              <div className="flex items-center gap-2">
                <button className="h-7 px-2 text-2xs rounded-md border border-line text-ink-muted hover:bg-bg-hover">
                  Schema
                </button>
                <button className="h-7 px-2 text-2xs rounded-md bg-accent text-bg-base flex items-center gap-1">
                  <Play className="w-3 h-3" /> Run
                </button>
              </div>
            </div>
            <pre className="p-3 font-mono text-xs text-ink-muted whitespace-pre-wrap">{`SELECT *
FROM ${table.name}
ORDER BY created_at DESC
LIMIT 50;`}</pre>
          </div>

          <div className="rounded-xl border border-line bg-bg-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-2xs text-ink-dim border-b border-line">
                    {table.columns.map((c) => (
                      <th key={c.name} className="px-3 py-2 font-normal">
                        {c.name}{' '}
                        <span className="text-ink-faint">{c.type}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.recent.map((r, i) => (
                    <tr
                      key={i}
                      className="border-b border-line-subtle last:border-0 hover:bg-bg-hover"
                    >
                      {table.columns.map((c) => (
                        <td
                          key={c.name}
                          className="px-3 py-2 text-ink-muted font-mono"
                        >
                          {String(r[c.name] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
