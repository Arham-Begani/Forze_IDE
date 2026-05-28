'use client';

import {
  Bot,
  Check,
  CheckCircle2,
  Cpu,
  Loader2,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
} from 'lucide-react';
import { agents, type Agent } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<Agent['status'], string> = {
  idle: 'text-ink-dim',
  running: 'text-accent',
  completed: 'text-ok',
  failed: 'text-danger',
};

export function AgentView() {
  return (
    <div className="flex-1 min-w-0 overflow-y-auto bg-bg-base">
      <header className="px-8 py-6 border-b border-line flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink flex items-center gap-2">
            <Bot className="w-5 h-5 text-accent" />
            AI Agents
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Autonomous agents that perform tasks instead of just chatting.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-9 px-3 rounded-lg border border-line bg-bg-raised hover:bg-bg-hover text-ink text-sm flex items-center gap-2">
            <Workflow className="w-4 h-4" /> Agent Templates
          </button>
          <button className="h-9 px-3 rounded-lg bg-accent text-bg-base hover:bg-accent-bright text-sm font-medium flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Agent
          </button>
        </div>
      </header>

      <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <section>
          <h2 className="text-sm font-medium text-ink mb-3">Available Agents</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {agents.map((a) => (
              <div
                key={a.id}
                className="p-4 rounded-xl border border-line bg-bg-surface hover:border-line-strong transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-bg-raised border border-line flex items-center justify-center text-accent">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-ink">{a.name}</div>
                      <div
                        className={cn(
                          'text-2xs uppercase tracking-wider flex items-center gap-1',
                          STATUS_STYLES[a.status],
                        )}
                      >
                        {a.status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
                        {a.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                        {a.status}
                      </div>
                    </div>
                  </div>
                  <button className="w-8 h-8 rounded-md border border-line hover:bg-bg-hover text-ink-muted flex items-center justify-center">
                    <Play className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-ink-muted mt-3 leading-relaxed">
                  {a.description}
                </p>
                {a.steps && (
                  <ul className="mt-3 space-y-1.5">
                    {a.steps.map((s, i) => (
                      <li
                        key={i}
                        className={cn(
                          'flex items-center gap-2 text-2xs',
                          s.done ? 'text-ink-muted' : 'text-ink-dim',
                        )}
                      >
                        {s.done ? (
                          <Check className="w-3 h-3 text-ok" />
                        ) : (
                          <Loader2 className="w-3 h-3 animate-spin text-accent" />
                        )}
                        {s.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-accent" /> Capabilities
            </h3>
            <ul className="space-y-2 text-xs text-ink-muted">
              <li className="flex items-center gap-2">
                <Check className="w-3 h-3 text-ok" /> Multi-step execution
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3 h-3 text-ok" /> Project memory
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3 h-3 text-ok" /> Context awareness
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3 h-3 text-ok" /> Terminal access
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3 h-3 text-ok" /> File-editing permissions
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3 h-3 text-ok" /> Agent task queue
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3 h-3 text-ok" /> Agent collaboration
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3 h-3 text-ok" /> Autonomous debugging
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3 h-3 text-ok" /> Autonomous testing
              </li>
            </ul>
          </div>

          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-accent" /> Live Run
            </h3>
            <div className="font-mono text-2xs text-ink-muted bg-bg-base rounded-lg p-3 space-y-1">
              <div>
                <span className="text-accent">▶</span> Backend Generator started
              </div>
              <div>✓ Inferred schema from product brief</div>
              <div>✓ Generated Prisma models</div>
              <div className="text-accent">… Writing tRPC routers</div>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-ok" /> Permissions
            </h3>
            <p className="text-xs text-ink-muted">
              Agents run in a sandbox with read/write to your project and limited
              shell. Approval required for: <span className="text-ink">push</span>,{' '}
              <span className="text-ink">deploy</span>,{' '}
              <span className="text-ink">database migrations</span>.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
