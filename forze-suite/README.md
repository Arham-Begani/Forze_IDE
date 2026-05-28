# Forze IDE — Forze Suite Monorepo

> The Sovereign OS for Startup Founders.

This monorepo houses the Forze IDE — a Tauri-based desktop development environment with a delegated cloud backend, an MCP daemon, an offline-first SQLite cache, and a visual "Vibe Canvas" builder.

## Workspace Layout

```
forze-suite/
├── apps/
│   ├── web/        Next.js host (Forge)
│   └── desktop/    Tauri v2 IDE shell (Rust + React + Monaco)
└── packages/
    ├── mcp-server/ Local Model Context Protocol daemon
    ├── database/   Drizzle / SQLite schemas + sync engine
    └── shared/     Cross-package Zod schemas (publishing payloads)
```

## Quick Start

```bash
pnpm install
pnpm dev          # all workspaces in parallel
pnpm desktop      # Tauri IDE only
pnpm mcp          # MCP daemon only
```

## Phase Plan
1. **Phase 1** — Local MCP daemon (`@forze/mcp-server`)
2. **Phase 2** — Tauri Rust shell + Monaco editor canvas
3. **Phase 3** — Vibe Canvas, Security Auditor, GTM dashboard

See `../ide_plan.md` for the full technical specification.
