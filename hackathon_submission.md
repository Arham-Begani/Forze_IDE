## Inspiration

As a solo founder, my day was death by a thousand context switches. Code lived in one window, terminals in another, AI chat in a browser tab, my deploy dashboard somewhere else, and "build in public" meant abandoning all of it to go fight the LinkedIn composer. Every switch cost momentum — and momentum is the only real asset a founder has.

The breaking point was AI agents. We were promised an army of coding agents, but in practice you babysit one chat sidebar at a time. I wanted a cockpit, not a chat box. So I built **Forze IDE** — a sovereign, offline-first desktop OS where you write code, *command a crew of AI agents in parallel*, keep secrets from leaking, ship to production, and turn your git log into distribution — all without leaving the workbench.

## What it does

Forze is a "Builder OS" for founders. The headline capabilities:

- **Vibe Stations** — a native grid of real PTY terminals running actual agent CLIs (Claude Code, Codex, Antigravity `agy`, OpenCode) side by side. You form an **AI Crew**: Claude as the Architect that plans once, lane-locked Builders that can't step on each other, and a Reviewer. They coordinate over a shared **Agent Bus** with server-enforced path-leases, so parallel agents *can't* collide on the same files.
- **Scheduled Prompts** — cron for your crew. Schedule a prompt and Forze auto-opens the station, boots the shell, launches the CLI, waits for the REPL to settle, and types the prompt for you.
- **Commit Guard** — every save is tracked; every commit passes a pre-commit security review that scans the staged diff for secrets (API keys, tokens). If it finds one, the commit is blocked before anything ever touches the cloud.
- **Build in Public** — select the commits you just shipped and Forze turns the diffs into benefit-driven LinkedIn posts, then posts or queues them in the BIP scheduler.
- **The rest of the workbench** — a full Vercel deployments client, VS Code-style source control with change gutters, a Kanban board, a local-first community feed, and a Dashboard whose metrics derive from *real* signals (git streaks, workspace stats, task breakdowns) — no dummy data.

## How we built it

- **Shell:** Tauri v2 (Rust core + system WebView) for a small, fast, truly native desktop app.
- **Frontend:** React 18 + TypeScript, Zustand for state (with debounced persistence so token-by-token AI streaming never thrashes localStorage).
- **Terminals:** OS-level PTYs spawned from a native Rust crate, streamed over IPC and rendered on a custom canvas/GPU terminal renderer — not mock frames.
- **Agent Bus:** a dependency-free, single-file, filesystem-based IPC broker living in `.forze/`. No network ports — identity, role, and lane are injected via env so each CLI knows who it is in the crew.
- **AI:** a single `aiConfig.ts` source of truth — Gemini as the keyless built-in default, Claude as BYOK.
- **Persistence:** offline-first local storage with optional Supabase account sync for the project list and chats (files always stay local).

If $n$ agents run on independent lanes, wall-clock time collapses from the serial sum toward the slowest single agent:

$$
T_{\text{crew}} \;=\; \max_{1 \le i \le n} t_i \quad\ll\quad \sum_{i=1}^{n} t_i \;=\; T_{\text{serial}}
$$

That speedup is the entire reason the crew model exists.

## Challenges we ran into

- **Parallel agents corrupting each other's work.** The first crew model let two agents edit the same file. The fix was a server-enforced **path-lease** system in the Agent Bus that makes collisions *structurally* impossible, not just discouraged.
- **The webview crashing mid-stream.** Persisting Zustand on every streamed token blew the localStorage quota and stormed the main thread. Solved with debounced JSON storage on the streaming stores.
- **"Empty response" from Gemini** — the SSE parser split on `\n\n` while the stream used CRLF; stripping `\r` fixed it. AI providers are full of these papercuts.
- **Windows console flashes** — git/npm spawned from the GUI popped terminal windows; every Rust `Command` now goes through a `no_window` helper with `CREATE_NO_WINDOW`.
- **Build & boot performance** — Rust builds were swapping the machine to death (capped parallel rustc jobs), and boot eagerly imported all 16 views and the full highlight.js bundle (now lazy-loaded and trimmed to core + 25 langs).

## Accomplishments that we're proud of

- **Real PTYs, real CLIs, real parallelism** — Vibe Stations run genuine agent CLIs concurrently, not chat mock-ups.
- **Collision-proof multi-agent coordination** over a serverless, portless, single-file bus.
- **A security gate that actually stops a leak on stage** — paste a token, hit commit, watch it get blocked.
- **A genuinely premium feel** — matte-black UI, single accent, custom title bar, GPU terminal, and a Dashboard powered entirely by real builder signals.
- It's **offline-first and sovereign** — your code and your agents stay on your machine.

## What we learned

- **Orchestration beats raw model power.** Three coordinated agents with clear roles and lane-locks out-ship one "smart" agent every time — but only if collisions are impossible by design.
- **Streaming is where apps go to die.** Most of our hardest bugs (crashes, empty responses, quota blowups) lived in the streaming path. Treat it as a first-class system, not a UI detail.
- **Native desktop is unforgiving and worth it.** Tauri + Rust gave us speed and real OS access, but every platform (Windows especially) demanded its own polish.
- **Founders don't want more tools — they want fewer.** The product won when we collapsed five apps into one surface.

## What's next for Forze IDE

- **Strategic Simulator** — model runway, pricing, and roadmap trade-offs right inside the OS.
- **Cross-platform crews** — agents that coordinate across machines over the same lease model.
- **A deeper Build-in-Public engine** — multi-platform distribution (X, threads) from a single git event.
- **A marketplace of crew "playbooks"** — shareable Architect → Builder → Reviewer templates.
- **Local model support** in Vibe Stations for fully air-gapped, sovereign development.
