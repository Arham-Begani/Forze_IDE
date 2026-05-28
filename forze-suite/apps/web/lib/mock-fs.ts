export type FileNode = {
  type: 'file';
  name: string;
  path: string;
  language: string;
  content: string;
};

export type FolderNode = {
  type: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
};

export type TreeNode = FileNode | FolderNode;

const pageTsx = `import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart, Users, DollarSign, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const stats = [
    { title: "Total Users", value: "12.4K", change: "+24.5%", icon: Users },
    { title: "MRR", value: "$24.5K", change: "+18.2%", icon: DollarSign },
    { title: "Active Subscriptions", value: "1.2K", change: "+12.4%", icon: BarChart },
    { title: "Growth Rate", value: "+28.4%", change: "+8.1%", icon: TrendingUp },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button>View Analytics</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <stat.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-zinc-400">{stat.title}</p>
                  <p className="text-xl font-semibold">{stat.value}</p>
                  <p className="text-xs text-emerald-400">{stat.change}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
`;

const layoutTsx = `import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SaaS Starter",
  description: "A modern SaaS starter built with VIBECODE.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className + " bg-zinc-950 text-zinc-50"}>
        {children}
      </body>
    </html>
  );
}
`;

const routeTs = `import { NextResponse } from "next/server";
import { z } from "zod";

const RequestSchema = z.object({
  email: z.string().email(),
  plan: z.enum(["free", "pro", "enterprise"]),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = RequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  // TODO: Persist subscription
  return NextResponse.json({ ok: true, plan: parsed.data.plan });
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
`;

const schemaPrisma = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  createdAt     DateTime @default(now())
  subscriptions Subscription[]
}

model Subscription {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  plan      String
  status    String   @default("active")
  createdAt DateTime @default(now())
}
`;

const buttonTsx = `import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors h-9 px-4",
          variant === "default" && "bg-cyan-500 text-zinc-950 hover:bg-cyan-400",
          variant === "ghost" && "hover:bg-zinc-800 text-zinc-100",
          variant === "outline" && "border border-zinc-700 hover:bg-zinc-800",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
`;

const cardTsx = `import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-xl border bg-zinc-900 text-zinc-50 shadow", className)}
    {...props}
  />
));
Card.displayName = "Card";

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6", className)} {...props} />
));
CardContent.displayName = "CardContent";
`;

const modalTsx = `import * as React from "react";
import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 w-full max-w-md">
        <button onClick={onClose} className="absolute top-4 right-4">
          <X className="w-4 h-4" />
        </button>
        {children}
      </div>
    </div>
  );
}
`;

const envLocal = `# Local development secrets (gitignored)
DATABASE_URL="postgresql://localhost:5432/saas_starter"
STRIPE_SECRET_KEY="sk_test_xxxxxxxxxxxx"
NEXTAUTH_SECRET="change-me-in-production"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
`;

const gitignore = `# dependencies
node_modules
.pnp
.pnp.js

# next.js
.next/
out/

# production
build
dist

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# env files
.env*.local
.env

# vercel
.vercel
`;

const nextConfigJs = `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

module.exports = nextConfig;
`;

const packageJson = `{
  "name": "saas-starter",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "lucide-react": "^0.460.0",
    "prisma": "^5.20.0",
    "@prisma/client": "^5.20.0",
    "stripe": "^17.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "tailwindcss": "^3.4",
    "postcss": "^8",
    "autoprefixer": "^10"
  }
}
`;

const tsconfigJson = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
`;

export const initialTree: FolderNode = {
  type: 'folder',
  name: 'SAAS STARTER',
  path: '/',
  children: [
    {
      type: 'folder',
      name: 'app',
      path: '/app',
      children: [
        {
          type: 'folder',
          name: '(auth)',
          path: '/app/(auth)',
          children: [
            {
              type: 'file',
              name: 'login.tsx',
              path: '/app/(auth)/login.tsx',
              language: 'tsx',
              content: `export default function LoginPage() {\n  return <div>Login</div>;\n}\n`,
            },
          ],
        },
        {
          type: 'folder',
          name: 'dashboard',
          path: '/app/dashboard',
          children: [
            {
              type: 'file',
              name: 'page.tsx',
              path: '/app/dashboard/page.tsx',
              language: 'tsx',
              content: pageTsx,
            },
            {
              type: 'file',
              name: 'layout.tsx',
              path: '/app/dashboard/layout.tsx',
              language: 'tsx',
              content: layoutTsx,
            },
          ],
        },
        {
          type: 'folder',
          name: 'api',
          path: '/app/api',
          children: [
            {
              type: 'file',
              name: 'route.ts',
              path: '/app/api/route.ts',
              language: 'ts',
              content: routeTs,
            },
          ],
        },
      ],
    },
    {
      type: 'folder',
      name: 'components',
      path: '/components',
      children: [
        {
          type: 'folder',
          name: 'ui',
          path: '/components/ui',
          children: [
            {
              type: 'file',
              name: 'button.tsx',
              path: '/components/ui/button.tsx',
              language: 'tsx',
              content: buttonTsx,
            },
            {
              type: 'file',
              name: 'card.tsx',
              path: '/components/ui/card.tsx',
              language: 'tsx',
              content: cardTsx,
            },
            {
              type: 'file',
              name: 'modal.tsx',
              path: '/components/ui/modal.tsx',
              language: 'tsx',
              content: modalTsx,
            },
          ],
        },
      ],
    },
    {
      type: 'folder',
      name: 'lib',
      path: '/lib',
      children: [],
    },
    {
      type: 'folder',
      name: 'hooks',
      path: '/hooks',
      children: [],
    },
    {
      type: 'folder',
      name: 'styles',
      path: '/styles',
      children: [],
    },
    {
      type: 'file',
      name: '.env.local',
      path: '/.env.local',
      language: 'env',
      content: envLocal,
    },
    {
      type: 'file',
      name: '.gitignore',
      path: '/.gitignore',
      language: 'gitignore',
      content: gitignore,
    },
    {
      type: 'file',
      name: 'next.config.js',
      path: '/next.config.js',
      language: 'js',
      content: nextConfigJs,
    },
    {
      type: 'file',
      name: 'package.json',
      path: '/package.json',
      language: 'json',
      content: packageJson,
    },
    {
      type: 'file',
      name: 'schema.prisma',
      path: '/schema.prisma',
      language: 'prisma',
      content: schemaPrisma,
    },
    {
      type: 'file',
      name: 'tsconfig.json',
      path: '/tsconfig.json',
      language: 'json',
      content: tsconfigJson,
    },
  ],
};

export function findFile(node: TreeNode, path: string): FileNode | null {
  if (node.type === 'file') {
    return node.path === path ? node : null;
  }
  for (const child of node.children) {
    const found = findFile(child, path);
    if (found) return found;
  }
  return null;
}

export function flattenFiles(node: TreeNode, acc: FileNode[] = []): FileNode[] {
  if (node.type === 'file') {
    acc.push(node);
  } else {
    for (const child of node.children) {
      flattenFiles(child, acc);
    }
  }
  return acc;
}
