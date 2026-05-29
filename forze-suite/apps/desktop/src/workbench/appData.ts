/**
 * Static demo data powering the "Startup OS" pages (Dashboard, Deployments,
 * Ad Studio, Marketplace, Community, Team). These are full-area workspace pages
 * opened as editor tabs — see appPages.tsx.
 */

export const kpis = [
  { label: 'Total Users', value: '12.4K', delta: '+24.5%' },
  { label: 'MRR', value: '$24.5K', delta: '+18.2%' },
  { label: 'Active Subscriptions', value: '1.2K', delta: '+12.4%' },
  { label: 'Growth Rate', value: '+28.4%', delta: '+8.1%' },
];

export const revenueSeries = [
  { month: 'Dec', value: 9_200 },
  { month: 'Jan', value: 12_800 },
  { month: 'Feb', value: 14_100 },
  { month: 'Mar', value: 18_600 },
  { month: 'Apr', value: 22_300 },
  { month: 'May', value: 24_500 },
];

export const topReferrers = [
  { name: 'Twitter', value: 42, color: '#fafafa' },
  { name: 'Direct', value: 28, color: '#a1a1aa' },
  { name: 'Google', value: 18, color: '#52525b' },
  { name: 'Other', value: 12, color: '#2e2e33' },
];

export const recentActivity = [
  { id: 1, title: 'New user registered', meta: '2m ago' },
  { id: 2, title: 'Subscription created', meta: '10m ago' },
  { id: 3, title: 'Payment received', amount: '$49.00', meta: '15m ago' },
  { id: 4, title: 'New feedback received', meta: '1h ago' },
];

export const quickActions = [
  'Create Landing Page',
  'Add New Feature',
  'Launch Campaign',
  'View Analytics',
];

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

export type Ad = {
  id: string;
  name: string;
  format: 'banner' | 'social' | 'video' | 'native';
  status: 'draft' | 'live' | 'paused';
  impressions: number;
  clicks: number;
  spend: number;
};

export const ads: Ad[] = [
  { id: 'a1', name: 'Twitter — Founder hook', format: 'social', status: 'live', impressions: 84_200, clicks: 2_140, spend: 312 },
  { id: 'a2', name: 'IH Banner — pricing', format: 'banner', status: 'live', impressions: 18_900, clicks: 460, spend: 89 },
  { id: 'a3', name: 'YT Pre-roll — demo', format: 'video', status: 'paused', impressions: 6_200, clicks: 95, spend: 41 },
  { id: 'a4', name: 'Reddit r/SaaS native', format: 'native', status: 'draft', impressions: 0, clicks: 0, spend: 0 },
];

export const adChannels = ['Twitter / X', 'LinkedIn', 'Reddit', 'YouTube', 'Indie Hackers'];

export const socialFormats = [
  'Twitter / X threads',
  'LinkedIn posts',
  'Product launch posts',
  'Reddit launch drafts',
  'YouTube scripts',
  'Blog posts',
];

export type MarketItem = {
  id: string;
  name: string;
  category: string;
  author: string;
  price: number | 'Free';
  rating: number;
  downloads: string;
};

export const marketItems: MarketItem[] = [
  { id: 'm1', name: 'Indie Dark UI Kit', category: 'UI Kit', author: '@northstar', price: 49, rating: 4.9, downloads: '4.2k' },
  { id: 'm2', name: 'Pricing Block Library', category: 'Component', author: '@ridge', price: 19, rating: 4.7, downloads: '7.8k' },
  { id: 'm3', name: 'AI Onboarding Workflow', category: 'AI Workflow', author: '@vibe', price: 29, rating: 4.8, downloads: '1.6k' },
  { id: 'm4', name: 'Auth-in-a-Box', category: 'Backend', author: '@orbit', price: 'Free', rating: 4.6, downloads: '12.3k' },
  { id: 'm5', name: 'Hover Microinteractions', category: 'Animation', author: '@quill', price: 9, rating: 4.5, downloads: '5.0k' },
  { id: 'm6', name: 'Stripe Webhook Plugin', category: 'Plugin', author: '@coast', price: 'Free', rating: 4.9, downloads: '9.1k' },
  { id: 'm7', name: 'Marketplace Template', category: 'Template', author: '@anchor', price: 99, rating: 4.8, downloads: '2.4k' },
  { id: 'm8', name: 'Founder Toolkit Prompts', category: 'AI Workflow', author: '@drift', price: 19, rating: 4.7, downloads: '3.0k' },
];

export const marketCategories = ['All', 'UI Kit', 'Component', 'Template', 'AI Workflow', 'Backend', 'Animation', 'Plugin'];

export type CommunityPost = {
  id: string;
  author: string;
  handle: string;
  time: string;
  body: string;
  reactions: number;
  comments: number;
  tag: 'build-log' | 'showcase' | 'launch' | 'milestone';
};

export const communityPosts: CommunityPost[] = [
  { id: 'p1', author: 'Ava Chen', handle: '@ava.builds', time: '6m ago', body: 'Day 12: shipped Stripe checkout. 9 paying customers in week one. Onwards.', reactions: 142, comments: 18, tag: 'milestone' },
  { id: 'p2', author: 'Marco Reyes', handle: '@marco.dev', time: '24m ago', body: 'Launched Foxtrot on Demo Day — got featured on the homepage. Wild week.', reactions: 312, comments: 47, tag: 'launch' },
  { id: 'p3', author: 'Priya Nair', handle: '@priya', time: '1h ago', body: 'Built a feedback widget in 38 minutes using the AI Agent. Mind = blown.', reactions: 88, comments: 9, tag: 'build-log' },
  { id: 'p4', author: 'Diego Park', handle: '@diego', time: '3h ago', body: 'Showcase: pixel-perfect landing page for my B2B SaaS. Roast it.', reactions: 56, comments: 22, tag: 'showcase' },
];

export const demoDay = {
  date: 'Friday, May 30',
  submissions: 42,
  spotlight: [
    { rank: 1, name: 'Foxtrot — AI sales coach', votes: 412 },
    { rank: 2, name: 'Northstar — founder OS', votes: 384 },
    { rank: 3, name: 'Quill — writer notebook', votes: 312 },
  ],
};

export const leaderboard = [
  { rank: 1, name: 'Ava Chen', rep: 4_124 },
  { rank: 2, name: 'Marco Reyes', rep: 3_882 },
  { rank: 3, name: 'Priya Nair', rep: 3_240 },
  { rank: 4, name: 'Diego Park', rep: 2_910 },
  { rank: 5, name: 'You', rep: 1_847 },
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

export const voiceRooms = [
  { id: 'r1', name: 'Daily standup', participants: 3, live: true },
  { id: 'r2', name: 'Design review', participants: 1, live: false },
  { id: 'r3', name: 'Pair on Stripe webhook', participants: 2, live: true },
];

export const tasks = {
  todo: ['Wire Stripe webhook signature verification', 'Add empty state to Settings', 'Migrate auth to passkeys'],
  doing: ['Refactor dashboard stats grid', 'Launch tweet thread'],
  done: ['Onboarding tooltip pass', 'OG image generator'],
};

export const achievements = [
  { id: 'first-deploy', label: 'First Deploy', earned: true },
  { id: 'first-paying', label: 'First Paying Customer', earned: true },
  { id: 'streak-10', label: '10-Day Streak', earned: true },
  { id: 'streak-30', label: '30-Day Streak', earned: false },
  { id: 'mrr-1k', label: 'MRR $1K', earned: true },
  { id: 'mrr-10k', label: 'MRR $10K', earned: true },
  { id: 'mrr-100k', label: 'MRR $100K', earned: false },
];
