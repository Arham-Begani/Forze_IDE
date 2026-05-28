export const kpis = [
  { label: 'Total Users', value: '12.4K', delta: '+24.5%', icon: 'users' as const },
  { label: 'MRR', value: '$24.5K', delta: '+18.2%', icon: 'dollar' as const },
  { label: 'Active Subscriptions', value: '1.2K', delta: '+12.4%', icon: 'bar' as const },
  { label: 'Growth Rate', value: '+28.4%', delta: '+8.1%', icon: 'trend' as const },
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
  { name: 'Twitter', value: 42, color: '#22d3ee' },
  { name: 'Direct', value: 28, color: '#34d399' },
  { name: 'Google', value: 18, color: '#fbbf24' },
  { name: 'Other', value: 12, color: '#60a5fa' },
];

export const recentActivity = [
  { id: 1, kind: 'user', title: 'New user registered', meta: '2m ago' },
  { id: 2, kind: 'sub', title: 'Subscription created', meta: '10m ago' },
  { id: 3, kind: 'payment', title: 'Payment received', amount: '$49.00', meta: '15m ago' },
  { id: 4, kind: 'feedback', title: 'New feedback received', meta: '1h ago' },
];

export const quickActions = [
  { label: 'Create Landing Page', icon: 'page' as const },
  { label: 'Add New Feature', icon: 'plus' as const },
  { label: 'Launch Campaign', icon: 'rocket' as const },
  { label: 'View Analytics', icon: 'chart' as const },
];

export type Agent = {
  id: string;
  name: string;
  description: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  steps?: { label: string; done: boolean }[];
};

export const agents: Agent[] = [
  {
    id: 'landing',
    name: 'Landing Page Builder',
    description: 'Generate a conversion-tuned landing page from your product brief.',
    status: 'idle',
  },
  {
    id: 'backend',
    name: 'Backend Generator',
    description: 'Scaffold APIs, models, and auth in one pass.',
    status: 'running',
    steps: [
      { label: 'Inferring schema from product brief', done: true },
      { label: 'Generating Prisma models', done: true },
      { label: 'Writing tRPC routers', done: false },
      { label: 'Adding integration tests', done: false },
    ],
  },
  {
    id: 'auth',
    name: 'Auth Setup Agent',
    description: 'Wires up sign-in flows, sessions, and protected routes.',
    status: 'idle',
  },
  {
    id: 'stripe',
    name: 'Stripe Integration Agent',
    description: 'Plans, products, checkout, webhooks — billed end-to-end.',
    status: 'completed',
  },
  {
    id: 'ui',
    name: 'UI Polishing Agent',
    description: 'Tightens spacing, type scale, and empty states.',
    status: 'idle',
  },
  {
    id: 'mobile',
    name: 'Mobile Optimization Agent',
    description: 'Audits and fixes mobile UX across breakpoints.',
    status: 'idle',
  },
  {
    id: 'seo',
    name: 'SEO Optimization Agent',
    description: 'Metadata, sitemap, structured data, OG images.',
    status: 'idle',
  },
  {
    id: 'deploy',
    name: 'Deployment Agent',
    description: 'Build, test, and deploy to Vercel/Railway/Cloudflare.',
    status: 'idle',
  },
  {
    id: 'marketing',
    name: 'Marketing Copy Agent',
    description: 'Headlines, CTAs, launch tweets, Reddit drafts.',
    status: 'idle',
  },
];

export type Deployment = {
  id: string;
  env: 'preview' | 'production';
  branch: string;
  commit: string;
  status: 'building' | 'ready' | 'error' | 'queued';
  duration: string;
  url: string;
  age: string;
  provider: 'vercel' | 'railway' | 'cloudflare' | 'aws';
};

export const deployments: Deployment[] = [
  {
    id: 'dpl_1',
    env: 'production',
    branch: 'main',
    commit: 'feat: ship pricing page',
    status: 'ready',
    duration: '38s',
    url: 'saas-starter.vibecode.app',
    age: '2m ago',
    provider: 'vercel',
  },
  {
    id: 'dpl_2',
    env: 'preview',
    branch: 'feat/onboarding-flow',
    commit: 'wip: empty states + tooltips',
    status: 'building',
    duration: '—',
    url: 'feat-onboarding-flow.saas-starter.vibecode.app',
    age: 'just now',
    provider: 'vercel',
  },
  {
    id: 'dpl_3',
    env: 'preview',
    branch: 'fix/webhook-signature',
    commit: 'fix: verify Stripe webhook signature',
    status: 'ready',
    duration: '41s',
    url: 'fix-webhook-signature.saas-starter.vibecode.app',
    age: '12m ago',
    provider: 'vercel',
  },
  {
    id: 'dpl_4',
    env: 'production',
    branch: 'main',
    commit: 'chore: bump deps',
    status: 'error',
    duration: '12s',
    url: 'saas-starter.vibecode.app',
    age: '1h ago',
    provider: 'vercel',
  },
];

export type Template = {
  id: string;
  name: string;
  category: string;
  description: string;
  stack: string[];
  installs: string;
};

export const templates: Template[] = [
  {
    id: 'saas-starter',
    name: 'SaaS Starter Kit',
    category: 'SaaS',
    description: 'Auth, billing, dashboard, admin — production-ready.',
    stack: ['Next.js', 'Prisma', 'Stripe', 'Supabase'],
    installs: '12.4k',
  },
  {
    id: 'ai-app',
    name: 'AI App Starter',
    category: 'AI',
    description: 'Streaming chat, tool-use, embeddings, agents.',
    stack: ['Next.js', 'Vercel AI', 'Postgres', 'pgvector'],
    installs: '8.1k',
  },
  {
    id: 'marketplace',
    name: 'Marketplace Template',
    category: 'Commerce',
    description: 'Two-sided marketplace with reviews and payouts.',
    stack: ['Next.js', 'Stripe Connect', 'Postgres'],
    installs: '3.6k',
  },
  {
    id: 'social',
    name: 'Social App Template',
    category: 'Consumer',
    description: 'Feed, follows, reactions, notifications.',
    stack: ['Next.js', 'Supabase', 'Realtime'],
    installs: '2.8k',
  },
  {
    id: 'dashboard',
    name: 'Dashboard Template',
    category: 'Analytics',
    description: 'Charts, tables, filters, role-based access.',
    stack: ['Next.js', 'Recharts', 'tRPC'],
    installs: '6.0k',
  },
  {
    id: 'landing-system',
    name: 'Landing Page System',
    category: 'Marketing',
    description: 'Hero, features, pricing, FAQ, CTA — 30+ blocks.',
    stack: ['Next.js', 'Tailwind'],
    installs: '14.2k',
  },
  {
    id: 'mobile-app',
    name: 'Mobile App Starter',
    category: 'Mobile',
    description: 'Expo + Tamagui + EAS — push, auth, payments.',
    stack: ['Expo', 'Tamagui', 'Supabase'],
    installs: '1.9k',
  },
  {
    id: 'api-backend',
    name: 'API Backend Starter',
    category: 'Backend',
    description: 'Type-safe REST/RPC, queues, cron, webhooks.',
    stack: ['Hono', 'Postgres', 'Redis'],
    installs: '4.4k',
  },
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
  { id: 'ad_1', name: 'Twitter — Founder hook', format: 'social', status: 'live', impressions: 84_200, clicks: 2_140, spend: 312 },
  { id: 'ad_2', name: 'IH Banner — pricing', format: 'banner', status: 'live', impressions: 18_900, clicks: 460, spend: 89 },
  { id: 'ad_3', name: 'YT Pre-roll — demo', format: 'video', status: 'paused', impressions: 6_200, clicks: 95, spend: 41 },
  { id: 'ad_4', name: 'Reddit r/SaaS native', format: 'native', status: 'draft', impressions: 0, clicks: 0, spend: 0 },
];

export type MarketplaceItem = {
  id: string;
  name: string;
  category: 'UI Kit' | 'Component' | 'Template' | 'AI Workflow' | 'Backend' | 'Animation' | 'Plugin';
  author: string;
  price: number | 'Free';
  rating: number;
  downloads: string;
};

export const marketplaceItems: MarketplaceItem[] = [
  { id: 'mk_1', name: 'Indie Dark UI Kit', category: 'UI Kit', author: '@northstar', price: 49, rating: 4.9, downloads: '4.2k' },
  { id: 'mk_2', name: 'Pricing Block Library', category: 'Component', author: '@ridge', price: 19, rating: 4.7, downloads: '7.8k' },
  { id: 'mk_3', name: 'AI Onboarding Workflow', category: 'AI Workflow', author: '@vibe', price: 29, rating: 4.8, downloads: '1.6k' },
  { id: 'mk_4', name: 'Auth-in-a-Box', category: 'Backend', author: '@orbit', price: 'Free', rating: 4.6, downloads: '12.3k' },
  { id: 'mk_5', name: 'Hover Microinteractions', category: 'Animation', author: '@quill', price: 9, rating: 4.5, downloads: '5.0k' },
  { id: 'mk_6', name: 'Stripe Webhook Plugin', category: 'Plugin', author: '@coast', price: 'Free', rating: 4.9, downloads: '9.1k' },
  { id: 'mk_7', name: 'Marketplace Template', category: 'Template', author: '@anchor', price: 99, rating: 4.8, downloads: '2.4k' },
  { id: 'mk_8', name: 'Founder Toolkit Prompts', category: 'AI Workflow', author: '@drift', price: 19, rating: 4.7, downloads: '3.0k' },
];

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
  {
    id: 'p1',
    author: 'Ava Chen',
    handle: '@ava.builds',
    time: '6m ago',
    body: 'Day 12: shipped Stripe checkout. 9 paying customers in week one. Onwards.',
    reactions: 142,
    comments: 18,
    tag: 'milestone',
  },
  {
    id: 'p2',
    author: 'Marco Reyes',
    handle: '@marco.dev',
    time: '24m ago',
    body: 'Launched Foxtrot on Demo Day — got featured on the homepage. Wild week.',
    reactions: 312,
    comments: 47,
    tag: 'launch',
  },
  {
    id: 'p3',
    author: 'Priya Nair',
    handle: '@priya',
    time: '1h ago',
    body: 'Built a feedback widget in 38 minutes using the AI Agent. Mind = blown.',
    reactions: 88,
    comments: 9,
    tag: 'build-log',
  },
  {
    id: 'p4',
    author: 'Diego Park',
    handle: '@diego',
    time: '3h ago',
    body: 'Showcase: pixel-perfect landing page for my B2B SaaS. Roast it.',
    reactions: 56,
    comments: 22,
    tag: 'showcase',
  },
];

export type TeamMatch = {
  id: string;
  name: string;
  role: 'Co-founder' | 'Designer' | 'Developer' | 'GTM';
  skills: string[];
  availability: 'Open to chat' | 'Full-time' | 'Part-time' | 'Advisory';
  matchScore: number;
  pronouns?: string;
};

export const teamMatches: TeamMatch[] = [
  { id: 't1', name: 'Naomi Larsson', role: 'Co-founder', skills: ['Product', 'GTM', 'Fundraising'], availability: 'Full-time', matchScore: 94 },
  { id: 't2', name: 'Kenji Watanabe', role: 'Designer', skills: ['Product design', 'Brand', 'Motion'], availability: 'Part-time', matchScore: 89 },
  { id: 't3', name: 'Asha Patel', role: 'Developer', skills: ['Next.js', 'Postgres', 'Infra'], availability: 'Open to chat', matchScore: 86 },
  { id: 't4', name: 'Mason Bell', role: 'GTM', skills: ['Content', 'Paid ads', 'Lifecycle'], availability: 'Advisory', matchScore: 78 },
];

export type DatabaseTable = {
  name: string;
  rows: number;
  columns: { name: string; type: string; nullable?: boolean }[];
  recent: Record<string, unknown>[];
};

export const databaseTables: DatabaseTable[] = [
  {
    name: 'users',
    rows: 12_412,
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'email', type: 'text' },
      { name: 'name', type: 'text', nullable: true },
      { name: 'created_at', type: 'timestamptz' },
    ],
    recent: [
      { id: 'usr_9af3', email: 'ava@northstar.io', name: 'Ava Chen', created_at: '2026-05-28 09:11' },
      { id: 'usr_8be1', email: 'm@reyes.dev', name: 'Marco Reyes', created_at: '2026-05-28 08:43' },
      { id: 'usr_7c92', email: 'priya@nair.co', name: 'Priya Nair', created_at: '2026-05-28 08:02' },
      { id: 'usr_6dd0', email: 'diego@park.io', name: 'Diego Park', created_at: '2026-05-28 07:21' },
    ],
  },
  {
    name: 'subscriptions',
    rows: 1_204,
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'user_id', type: 'uuid' },
      { name: 'plan', type: 'text' },
      { name: 'status', type: 'text' },
      { name: 'created_at', type: 'timestamptz' },
    ],
    recent: [
      { id: 'sub_4a3', user_id: 'usr_9af3', plan: 'pro', status: 'active', created_at: '2026-05-28 09:11' },
      { id: 'sub_4a2', user_id: 'usr_8be1', plan: 'pro', status: 'active', created_at: '2026-05-28 08:43' },
      { id: 'sub_4a1', user_id: 'usr_7c92', plan: 'free', status: 'active', created_at: '2026-05-28 08:02' },
    ],
  },
  {
    name: 'feedback',
    rows: 318,
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'user_id', type: 'uuid' },
      { name: 'body', type: 'text' },
      { name: 'sentiment', type: 'text' },
      { name: 'created_at', type: 'timestamptz' },
    ],
    recent: [
      { id: 'fb_021', user_id: 'usr_8be1', body: 'Love the AI agent flow', sentiment: 'positive', created_at: '2026-05-28 06:58' },
      { id: 'fb_020', user_id: 'usr_7c92', body: 'File explorer click is broken', sentiment: 'negative', created_at: '2026-05-28 04:11' },
    ],
  },
];

export const apiEndpoints = [
  { method: 'GET',  path: '/api/users',        desc: 'List users with pagination',         calls: '4.1k',  p50: '38ms',  p95: '142ms' },
  { method: 'POST', path: '/api/users',        desc: 'Create a new user',                  calls: '612',   p50: '92ms',  p95: '210ms' },
  { method: 'GET',  path: '/api/subscriptions', desc: 'List active subscriptions',         calls: '1.2k',  p50: '44ms',  p95: '128ms' },
  { method: 'POST', path: '/api/checkout',     desc: 'Create Stripe Checkout session',     calls: '845',   p50: '110ms', p95: '320ms' },
  { method: 'POST', path: '/api/webhooks/stripe', desc: 'Stripe webhook receiver',         calls: '388',   p50: '62ms',  p95: '155ms' },
];

export const logEntries = [
  { ts: '09:14:22', level: 'info',  msg: 'GET /api/users 200 38ms' },
  { ts: '09:14:18', level: 'warn',  msg: 'Slow query on subscriptions (218ms)' },
  { ts: '09:14:10', level: 'info',  msg: 'POST /api/checkout 200 110ms' },
  { ts: '09:13:51', level: 'error', msg: 'Stripe webhook signature mismatch (event evt_7c92)' },
  { ts: '09:13:44', level: 'info',  msg: 'Built page /dashboard in 142ms' },
  { ts: '09:13:30', level: 'info',  msg: 'Compiled successfully in 1.2s' },
];

export type Problem = { file: string; line: number; col: number; severity: 'error' | 'warn'; msg: string };

export const problems: Problem[] = [
  { file: '/app/dashboard/page.tsx', line: 13, col: 5, severity: 'warn', msg: "'BarChart' from lucide-react shadows the recharts import." },
  { file: '/schema.prisma', line: 22, col: 3, severity: 'error', msg: 'Field `status` is missing a default value.' },
];

export const buildStreak = {
  days: 12,
  week: [
    { day: 'M', done: true },
    { day: 'T', done: true },
    { day: 'W', done: true },
    { day: 'T', done: true },
    { day: 'F', done: true },
    { day: 'S', done: false },
    { day: 'S', done: false },
  ],
  todayDoneIndex: 4,
};

export const builderMetrics = {
  buildStreak: 12,
  deployCount: 142,
  revenue: '$24.5K',
  users: '12.4K',
  launches: 3,
  codingHours: 482,
  reputation: 1_847,
};

export type Achievement = { id: string; label: string; description: string; earned: boolean };

export const achievements: Achievement[] = [
  { id: 'first-deploy', label: 'First Deploy', description: 'Ship something live.', earned: true },
  { id: 'first-paying', label: 'First Paying Customer', description: 'Stripe webhook delivered.', earned: true },
  { id: 'streak-10', label: '10-Day Streak', description: 'Code 10 days in a row.', earned: true },
  { id: 'streak-30', label: '30-Day Streak', description: 'Code 30 days in a row.', earned: false },
  { id: 'mrr-1k', label: 'MRR $1K', description: 'Reach $1K monthly recurring.', earned: true },
  { id: 'mrr-10k', label: 'MRR $10K', description: 'Reach $10K monthly recurring.', earned: true },
  { id: 'mrr-100k', label: 'MRR $100K', description: 'Reach $100K monthly recurring.', earned: false },
];

export const launchChecklist = [
  { id: 'l1', label: 'Domain pointed to deployment', done: true },
  { id: 'l2', label: 'SSL provisioned', done: true },
  { id: 'l3', label: 'OG image set', done: true },
  { id: 'l4', label: 'Launch tweet drafted', done: true },
  { id: 'l5', label: 'Product Hunt assets ready', done: false },
  { id: 'l6', label: 'Stripe billing live mode tested', done: false },
  { id: 'l7', label: 'Loom demo recorded', done: false },
  { id: 'l8', label: 'Email list warmed (>500)', done: false },
];

export const envVars = [
  { key: 'DATABASE_URL', scope: 'all', preview: 'postgres://••••@db.host:5432/saas', env: 'production' },
  { key: 'STRIPE_SECRET_KEY', scope: 'all', preview: 'sk_live_•••••••••••', env: 'production' },
  { key: 'NEXTAUTH_SECRET', scope: 'all', preview: '•••••••••••••', env: 'production' },
  { key: 'NEXT_PUBLIC_POSTHOG_KEY', scope: 'all', preview: 'phc_••••••', env: 'production' },
];
