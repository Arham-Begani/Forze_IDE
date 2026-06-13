/**
 * Demo data for the Startup OS pages that don't yet have a real backing source
 * (Deployments fallback list, deploy providers, env-var preview, Team matches).
 * Dashboard and Analytics no longer live here — they derive from real workspace
 * signals via workbench/builderAnalytics.ts.
 */

export type Deployment = {
  id: string;
  env: 'preview' | 'production';
  branch: string;
  commit: string;
  status: 'building' | 'ready' | 'error';
  duration: string;
  url: string;
  age: string;
};

export const deployments: Deployment[] = [
  { id: 'd1', env: 'production', branch: 'main', commit: 'feat: ship pricing page', status: 'ready', duration: '38s', url: 'saas-starter.vibecode.app', age: '2m ago' },
  { id: 'd2', env: 'preview', branch: 'feat/onboarding-flow', commit: 'wip: empty states + tooltips', status: 'building', duration: '—', url: 'feat-onboarding.saas-starter.vibecode.app', age: 'just now' },
  { id: 'd3', env: 'preview', branch: 'fix/webhook-signature', commit: 'fix: verify Stripe webhook signature', status: 'ready', duration: '41s', url: 'fix-webhook.saas-starter.vibecode.app', age: '12m ago' },
  { id: 'd4', env: 'production', branch: 'main', commit: 'chore: bump deps', status: 'error', duration: '12s', url: 'saas-starter.vibecode.app', age: '1h ago' },
];

export const providers = [
  { id: 'vercel', label: 'Vercel', desc: 'Frontend + serverless. Default.' },
  { id: 'railway', label: 'Railway', desc: 'Long-running backends and workers.' },
  { id: 'cloudflare', label: 'Cloudflare', desc: 'Workers, R2, edge.' },
  { id: 'aws', label: 'AWS', desc: 'Bring your own infra.' },
  { id: 'docker', label: 'Docker', desc: 'Self-host anywhere.' },
  { id: 'firebase', label: 'Firebase', desc: 'GCP-managed.' },
];

export const envVars = [
  { key: 'DATABASE_URL', preview: 'postgres://••••@db.host:5432/saas', env: 'production' },
  { key: 'STRIPE_SECRET_KEY', preview: 'sk_live_•••••••••••', env: 'production' },
  { key: 'NEXTAUTH_SECRET', preview: '•••••••••••••', env: 'production' },
  { key: 'NEXT_PUBLIC_POSTHOG_KEY', preview: 'phc_••••••', env: 'production' },
];

export type TeamMatch = {
  id: string;
  name: string;
  role: 'Co-founder' | 'Designer' | 'Developer' | 'GTM';
  skills: string[];
  availability: string;
  matchScore: number;
};

export const teamMatches: TeamMatch[] = [
  { id: 't1', name: 'Naomi Larsson', role: 'Co-founder', skills: ['Product', 'GTM', 'Fundraising'], availability: 'Full-time', matchScore: 94 },
  { id: 't2', name: 'Kenji Watanabe', role: 'Designer', skills: ['Product design', 'Brand', 'Motion'], availability: 'Part-time', matchScore: 89 },
  { id: 't3', name: 'Asha Patel', role: 'Developer', skills: ['Next.js', 'Postgres', 'Infra'], availability: 'Open to chat', matchScore: 86 },
  { id: 't4', name: 'Mason Bell', role: 'GTM', skills: ['Content', 'Paid ads', 'Lifecycle'], availability: 'Advisory', matchScore: 78 },
];
