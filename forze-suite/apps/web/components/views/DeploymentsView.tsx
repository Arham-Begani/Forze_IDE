'use client';

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Cloud,
  ExternalLink,
  GitBranch,
  Globe,
  KeyRound,
  Loader2,
  Plus,
  Rocket,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { deployments, envVars, type Deployment } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const STATUS_META: Record<Deployment['status'], { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  ready: { label: 'Ready', cls: 'text-ok', icon: CheckCircle2 },
  building: { label: 'Building', cls: 'text-accent', icon: Loader2 },
  error: { label: 'Error', cls: 'text-danger', icon: AlertCircle },
  queued: { label: 'Queued', cls: 'text-warn', icon: Clock },
};

const PROVIDERS = [
  { id: 'vercel', label: 'Vercel', desc: 'Frontend + serverless. Default.' },
  { id: 'railway', label: 'Railway', desc: 'Long-running backends and workers.' },
  { id: 'cloudflare', label: 'Cloudflare', desc: 'Workers, R2, edge.' },
  { id: 'aws', label: 'AWS', desc: 'Bring your own infra.' },
  { id: 'docker', label: 'Docker', desc: 'Self-host anywhere.' },
  { id: 'firebase', label: 'Firebase', desc: 'GCP-managed.' },
];

export function DeploymentsView() {
  return (
    <div className="flex-1 min-w-0 overflow-y-auto bg-bg-base">
      <header className="px-8 py-6 border-b border-line flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink flex items-center gap-2">
            <Rocket className="w-5 h-5 text-accent" /> Deployments
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            One-click deploys, preview environments, rollbacks, SSL, domains.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-9 px-3 rounded-lg border border-line bg-bg-raised hover:bg-bg-hover text-ink text-sm flex items-center gap-2">
            <Globe className="w-4 h-4" /> Domains
          </button>
          <button className="h-9 px-3 rounded-lg bg-accent text-bg-base hover:bg-accent-bright text-sm font-medium flex items-center gap-2">
            <Rocket className="w-4 h-4" /> New Deployment
          </button>
        </div>
      </header>

      <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <section>
            <h2 className="text-sm font-medium text-ink mb-3">Recent</h2>
            <div className="rounded-xl border border-line bg-bg-surface overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-2xs text-ink-dim border-b border-line">
                    <th className="px-4 py-2 font-normal">Status</th>
                    <th className="px-4 py-2 font-normal">Branch</th>
                    <th className="px-4 py-2 font-normal">Commit</th>
                    <th className="px-4 py-2 font-normal">Env</th>
                    <th className="px-4 py-2 font-normal">URL</th>
                    <th className="px-4 py-2 font-normal">Duration</th>
                    <th className="px-4 py-2 font-normal">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {deployments.map((d) => {
                    const meta = STATUS_META[d.status];
                    const Icon = meta.icon;
                    return (
                      <tr
                        key={d.id}
                        className="border-b border-line-subtle last:border-0 hover:bg-bg-hover"
                      >
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center gap-1.5 text-xs', meta.cls)}>
                            <Icon
                              className={cn(
                                'w-3.5 h-3.5',
                                d.status === 'building' && 'animate-spin',
                              )}
                            />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-muted">
                          <span className="inline-flex items-center gap-1.5">
                            <GitBranch className="w-3 h-3 text-ink-dim" />
                            <span className="font-mono">{d.branch}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink truncate max-w-[260px]">
                          {d.commit}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'text-2xs uppercase px-1.5 py-0.5 rounded',
                              d.env === 'production'
                                ? 'bg-accent-soft text-accent border border-accent-border'
                                : 'bg-bg-active text-ink-muted border border-line',
                            )}
                          >
                            {d.env}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-muted">
                          <a className="inline-flex items-center gap-1 hover:text-accent">
                            {d.url}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-muted">{d.duration}</td>
                        <td className="px-4 py-3 text-xs text-ink-dim">{d.age}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-accent" /> Environment Variables
            </h3>
            <div className="space-y-1.5">
              {envVars.map((v) => (
                <div
                  key={v.key}
                  className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-bg-hover text-xs"
                >
                  <span className="font-mono text-ink">{v.key}</span>
                  <span className="text-ink-faint">·</span>
                  <span className="font-mono text-ink-muted">{v.preview}</span>
                  <span className="ml-auto text-2xs uppercase tracking-wider text-ink-dim border border-line rounded px-1.5 py-0.5">
                    {v.env}
                  </span>
                </div>
              ))}
              <button className="mt-1 flex items-center gap-2 text-2xs text-accent hover:text-accent-bright px-2 py-1.5">
                <Plus className="w-3 h-3" /> Add variable
              </button>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <Cloud className="w-4 h-4 text-accent" /> Providers
            </h3>
            <div className="space-y-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  className="w-full flex items-start gap-3 p-2.5 rounded-lg border border-line hover:border-line-strong hover:bg-bg-hover text-left transition-colors"
                >
                  <div className="w-8 h-8 rounded-md bg-bg-raised border border-line flex items-center justify-center text-accent text-2xs uppercase font-semibold">
                    {p.label.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink">{p.label}</div>
                    <div className="text-2xs text-ink-dim">{p.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-ok" /> SSL & Security
            </h3>
            <p className="text-xs text-ink-muted">
              Auto-provisioned certificates, DDoS protection, and per-deploy preview URLs are on by default.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-2 flex items-center gap-2">
              <Settings className="w-4 h-4 text-accent" /> CI/CD
            </h3>
            <p className="text-xs text-ink-muted">
              Builds are triggered on every push. Failed deploys roll back automatically.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
