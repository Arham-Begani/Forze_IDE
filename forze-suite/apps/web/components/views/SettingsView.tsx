'use client';

import {
  Bell,
  CreditCard,
  KeyRound,
  Palette,
  Plug,
  Settings as SettingsIcon,
  Shield,
  User,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'env', label: 'Environment', icon: KeyRound },
] as const;

export function SettingsView() {
  const [active, setActive] = useState<(typeof SECTIONS)[number]['id']>('profile');

  return (
    <div className="flex-1 min-w-0 overflow-hidden bg-bg-base flex flex-col">
      <header className="px-8 py-6 border-b border-line">
        <h1 className="text-2xl font-semibold text-ink flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-accent" /> Settings
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Personalize VIBECODE, manage billing, and connect tools.
        </p>
      </header>

      <div className="flex-1 grid grid-cols-[240px_1fr] min-h-0">
        <aside className="border-r border-line bg-bg-surface overflow-y-auto py-3 px-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={cn(
                  'w-full flex items-center gap-3 h-9 px-3 rounded-lg text-sm transition-colors',
                  active === s.id
                    ? 'bg-bg-active text-ink'
                    : 'text-ink-muted hover:text-ink hover:bg-bg-hover',
                )}
              >
                <Icon className="w-4 h-4 text-ink-dim" />
                {s.label}
              </button>
            );
          })}
        </aside>

        <section className="flex-1 min-h-0 overflow-y-auto p-6 max-w-3xl space-y-6">
          {active === 'profile' && <ProfileSection />}
          {active === 'theme' && <ThemeSection />}
          {active === 'notifications' && <NotificationsSection />}
          {active === 'billing' && <BillingSection />}
          {active === 'integrations' && <IntegrationsSection />}
          {active === 'security' && <SecuritySection />}
          {active === 'env' && <EnvSection />}
        </section>
      </div>
    </div>
  );
}

function FormRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 py-3 border-b border-line-subtle last:border-0">
      <div>
        <div className="text-sm text-ink">{label}</div>
        {hint && <div className="text-2xs text-ink-dim mt-1">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function input(extra = '') {
  return cn(
    'h-9 px-3 rounded-lg border border-line bg-bg-surface text-ink text-sm outline-none focus:border-accent-border',
    extra,
  );
}

function ProfileSection() {
  return (
    <div className="p-6 rounded-xl border border-line bg-bg-surface">
      <h2 className="text-sm font-medium text-ink mb-4">Profile</h2>
      <FormRow label="Display name">
        <input className={input('w-full max-w-sm')} defaultValue="Arjun" />
      </FormRow>
      <FormRow label="Email">
        <input className={input('w-full max-w-sm')} defaultValue="arham@vibecode.io" />
      </FormRow>
      <FormRow label="Bio" hint="Shown on your public builder profile.">
        <textarea
          className={input('w-full max-w-sm min-h-[80px] py-2')}
          defaultValue="Indie hacker. Building VIBECODE."
        />
      </FormRow>
      <div className="pt-4 flex justify-end">
        <button className="h-9 px-3 rounded-lg bg-accent text-bg-base text-sm font-medium hover:bg-accent-bright">
          Save changes
        </button>
      </div>
    </div>
  );
}

function ThemeSection() {
  return (
    <div className="p-6 rounded-xl border border-line bg-bg-surface">
      <h2 className="text-sm font-medium text-ink mb-4">Theme</h2>
      <FormRow label="Appearance">
        <div className="flex gap-2">
          {['Matte Black', 'Slate', 'High Contrast'].map((t, i) => (
            <button
              key={t}
              className={cn(
                'h-9 px-3 rounded-lg border text-sm',
                i === 0
                  ? 'border-accent-border bg-accent-soft text-accent'
                  : 'border-line text-ink-muted hover:bg-bg-hover',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </FormRow>
      <FormRow label="Accent color" hint="No purple. No gradients. Promise.">
        <div className="flex gap-2">
          {[
            { name: 'Cyan', c: '#22d3ee' },
            { name: 'Emerald', c: '#34d399' },
            { name: 'Amber', c: '#fbbf24' },
            { name: 'Sky', c: '#60a5fa' },
            { name: 'Rose', c: '#fb7185' },
          ].map((a, i) => (
            <button
              key={a.name}
              className={cn(
                'w-9 h-9 rounded-lg border flex items-center justify-center',
                i === 0 ? 'border-accent-border' : 'border-line',
              )}
              style={{ background: a.c + '22' }}
              title={a.name}
            >
              <span className="w-4 h-4 rounded" style={{ background: a.c }} />
            </button>
          ))}
        </div>
      </FormRow>
      <FormRow label="Editor font">
        <select className={input('w-full max-w-sm')} defaultValue="JetBrains Mono">
          <option>JetBrains Mono</option>
          <option>Fira Code</option>
          <option>SF Mono</option>
          <option>Cascadia Code</option>
        </select>
      </FormRow>
    </div>
  );
}

function NotificationsSection() {
  return (
    <div className="p-6 rounded-xl border border-line bg-bg-surface space-y-2">
      <h2 className="text-sm font-medium text-ink mb-2">Notifications</h2>
      {[
        { l: 'Deployment success', d: 'Notify on every successful deploy.' },
        { l: 'Deployment failure', d: 'Always notify on failed deploys.' },
        { l: 'Revenue milestones', d: 'New first sale, MRR thresholds.' },
        { l: 'Community mentions', d: 'When someone @-mentions you.' },
        { l: 'AI task completion', d: 'When a long-running agent finishes.' },
      ].map((row, i) => (
        <FormRow key={row.l} label={row.l} hint={row.d}>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              defaultChecked={i !== 0}
              className="w-9 h-5 appearance-none rounded-full bg-bg-active border border-line relative cursor-pointer checked:bg-accent checked:border-accent transition-colors"
            />
            <span className="text-xs text-ink-muted">Push & email</span>
          </label>
        </FormRow>
      ))}
    </div>
  );
}

function BillingSection() {
  return (
    <div className="space-y-4">
      <div className="p-6 rounded-xl border border-accent-border bg-bg-surface">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-ink">Pro Plan</div>
            <div className="text-2xs text-ink-dim mt-1">$24/month · billed monthly</div>
          </div>
          <button className="h-8 px-3 rounded-lg border border-line text-xs text-ink-muted hover:bg-bg-hover">
            Change plan
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="p-3 rounded-lg border border-line bg-bg-base">
            <div className="text-2xs text-ink-dim">AI tokens this month</div>
            <div className="text-lg text-ink tabular-nums">442K / 2M</div>
          </div>
          <div className="p-3 rounded-lg border border-line bg-bg-base">
            <div className="text-2xs text-ink-dim">Deploys</div>
            <div className="text-lg text-ink tabular-nums">14 / unlimited</div>
          </div>
          <div className="p-3 rounded-lg border border-line bg-bg-base">
            <div className="text-2xs text-ink-dim">Storage</div>
            <div className="text-lg text-ink tabular-nums">2.1 GB / 50 GB</div>
          </div>
        </div>
      </div>
      <div className="p-6 rounded-xl border border-line bg-bg-surface">
        <h3 className="text-sm font-medium text-ink mb-3">Payment method</h3>
        <div className="flex items-center justify-between p-3 rounded-lg border border-line bg-bg-base">
          <div className="flex items-center gap-3">
            <div className="w-9 h-6 rounded bg-bg-active flex items-center justify-center text-2xs text-ink-muted">
              VISA
            </div>
            <div className="text-sm text-ink">•••• 4242</div>
          </div>
          <span className="text-2xs text-ink-dim">Expires 09/27</span>
        </div>
      </div>
    </div>
  );
}

function IntegrationsSection() {
  const list = [
    { name: 'GitHub', connected: true, desc: 'Push, PRs, deploy hooks.' },
    { name: 'Vercel', connected: true, desc: 'Deploy targets and previews.' },
    { name: 'Stripe', connected: true, desc: 'Billing and webhooks.' },
    { name: 'Supabase', connected: true, desc: 'Postgres, auth, storage.' },
    { name: 'Linear', connected: false, desc: 'Issues sync with tasks.' },
    { name: 'Discord', connected: false, desc: 'Community notifications.' },
    { name: 'Posthog', connected: false, desc: 'Analytics events.' },
    { name: 'Resend', connected: true, desc: 'Transactional email.' },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {list.map((i) => (
        <div
          key={i.name}
          className="p-3 rounded-xl border border-line bg-bg-surface flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-md bg-bg-raised border border-line flex items-center justify-center text-accent text-2xs font-medium">
            {i.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="text-sm text-ink">{i.name}</div>
            <div className="text-2xs text-ink-dim">{i.desc}</div>
          </div>
          <button
            className={cn(
              'h-7 px-3 text-xs rounded-md',
              i.connected
                ? 'border border-line text-ink-muted hover:bg-bg-hover'
                : 'bg-accent text-bg-base hover:bg-accent-bright',
            )}
          >
            {i.connected ? 'Configured' : 'Connect'}
          </button>
        </div>
      ))}
    </div>
  );
}

function SecuritySection() {
  return (
    <div className="p-6 rounded-xl border border-line bg-bg-surface space-y-3">
      <h2 className="text-sm font-medium text-ink">Security</h2>
      <FormRow label="Two-factor auth" hint="Use an authenticator app to add a second factor.">
        <button className="h-9 px-3 rounded-lg bg-accent text-bg-base text-sm hover:bg-accent-bright">
          Enable 2FA
        </button>
      </FormRow>
      <FormRow label="Active sessions" hint="3 devices signed in.">
        <button className="h-9 px-3 rounded-lg border border-line text-sm text-ink-muted hover:bg-bg-hover">
          Sign out everywhere
        </button>
      </FormRow>
      <FormRow label="API keys">
        <button className="h-9 px-3 rounded-lg border border-line text-sm text-ink-muted hover:bg-bg-hover">
          Manage keys
        </button>
      </FormRow>
    </div>
  );
}

function EnvSection() {
  return (
    <div className="p-6 rounded-xl border border-line bg-bg-surface space-y-3">
      <h2 className="text-sm font-medium text-ink">Environment variables</h2>
      <p className="text-xs text-ink-muted">
        Secrets are encrypted at rest and synced to your deployments.
      </p>
      <div className="rounded-lg border border-line overflow-hidden">
        <div className="px-3 py-2 grid grid-cols-[1fr_2fr_100px] text-2xs uppercase tracking-wider text-ink-dim border-b border-line">
          <span>Key</span>
          <span>Value</span>
          <span>Env</span>
        </div>
        {[
          { k: 'DATABASE_URL', v: 'postgres://••••@host', env: 'all' },
          { k: 'STRIPE_SECRET_KEY', v: 'sk_live_••••', env: 'prod' },
          { k: 'NEXTAUTH_SECRET', v: '••••••', env: 'all' },
        ].map((r) => (
          <div
            key={r.k}
            className="px-3 py-2 grid grid-cols-[1fr_2fr_100px] text-xs font-mono items-center border-b border-line-subtle last:border-0"
          >
            <span className="text-ink">{r.k}</span>
            <span className="text-ink-muted">{r.v}</span>
            <span className="text-ink-dim">{r.env}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
