# Prompt: Add Forze account auth + cloud persistence to the Forze IDE

> Paste everything below the line into Claude Code running in the **Forze IDE repo**
> (the Tauri v2 app). It is fully self-contained — it assumes no knowledge of the
> web app or any prior conversation. The companion database migration already
> exists in the web repo (`db/migrations/032_ide_persistence.sql`) and has been
> applied to Supabase; this prompt builds the IDE side against that schema.

---

You are working in the **Forze IDE** — a cross-platform desktop app (Tauri v2: Rust backend + React frontend). Tagline: *"The Sovereign OS for Startup Founders."* It's local-first and bring-your-own-key: a founder's source files, API keys, and data live on their machine.

I need you to add **authentication and cloud persistence**. Read this whole brief, then inspect the repo to adapt the scaffolds to the actual structure before writing code.

## Goal

1. **Gate the app behind a Forze account.** On launch, if there's no valid session, the IDE shows a sign-in screen and nothing else is accessible. Any authenticated Forze account (free or paid) unlocks the app.
2. **Persist the project list and AI agent conversations** to the cloud, scoped per user, so they survive a reinstall or appear on a second machine.
3. **Keep source files 100% local.** This is non-negotiable (see Constraints) — it's the product's core promise.

## Locked decisions (do not redesign these)

- **Auth = Supabase, directly from the app.** The IDE uses `@supabase/supabase-js` against the *same* Supabase project the Forze web app uses. The login UI is a **native form inside the IDE** (email + password, plus a "Continue with Google" button). No web-redirect/SSO bridge, no custom backend.
- **The Supabase anon key ships in the binary.** That is safe and intended — Row Level Security (RLS) is the security boundary, not key secrecy.
- **Storage split:**
  - **LOCAL only** (SQLite/disk, never uploaded): source code, file contents, local settings.
  - **CLOUD** (Supabase, RLS per user): the project list (metadata), and AI conversation threads + messages.
- **Access tier:** authenticated == allowed. No billing check.

## Environment

Add to the IDE's env (and `.env.example`). These are the **same Supabase project** as the web app — copy the values from the web repo's `.env.local` keys `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`:

```
VITE_SUPABASE_URL=...        # same value as web app's NEXT_PUBLIC_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=...   # same value as web app's NEXT_PUBLIC_SUPABASE_ANON_KEY
```

(If this app isn't Vite-based, use whatever env mechanism it already uses — match the existing convention. Never hardcode the key in source.)

## The database contract (already created in Supabase — do NOT recreate)

Three tables exist with RLS enabled. Every row is owned by `auth.users.id`; RLS policies enforce `auth.uid() = user_id` for select/insert/update/delete, so a signed-in client can only ever touch its own rows. Write to them with the matching shapes:

**`ide_projects`** — project metadata only, never file contents
| column | type | notes |
|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() |
| `user_id` | uuid | = `auth.uid()` |
| `name` | text | required |
| `local_path` | text | last path on *this* device (string only) |
| `git_remote` | text | optional; cross-device dedupe key |
| `color` | text | optional UI accent |
| `icon` | text | default '🚀' |
| `archived` | bool | default false |
| `last_opened_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | auto |

There's a partial unique index on `(user_id, git_remote)` where `git_remote IS NOT NULL` — so upsert with `onConflict: 'user_id,git_remote'` to dedupe a repo across machines.

**`ide_conversations`** — AI agent threads
| column | type | notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | = `auth.uid()` |
| `project_id` | uuid | nullable FK → ide_projects (null = global chat) |
| `title` | text | default 'New conversation' |
| `agent` | text | e.g. 'claude-code', 'codex', 'gemini' |
| `archived` | bool | default false |
| `created_at` / `updated_at` | timestamptz | auto |

**`ide_messages`** — messages in a thread
| column | type | notes |
|---|---|---|
| `id` | uuid | PK |
| `conversation_id` | uuid | FK → ide_conversations (cascade) |
| `user_id` | uuid | = `auth.uid()` (denormalized for RLS) |
| `role` | text | one of: user / assistant / system / tool |
| `content` | text | default '' |
| `metadata` | jsonb | model, token counts, tool calls — **path/line references only, no source** |
| `created_at` | timestamptz | auto |

## Tasks (do these in order; verify each before moving on)

### 1. Secure session storage (OS keychain, NOT localStorage)

Add the `keyring` crate to `src-tauri/Cargo.toml` and expose three commands. Register them in the `invoke_handler`:

```rust
// src-tauri/src/lib.rs (or main.rs)
#[tauri::command]
fn secure_get(key: String) -> Option<String> {
    keyring::Entry::new("forze-ide", &key).ok()?.get_password().ok()
}
#[tauri::command]
fn secure_set(key: String, value: String) {
    if let Ok(e) = keyring::Entry::new("forze-ide", &key) { let _ = e.set_password(&value); }
}
#[tauri::command]
fn secure_remove(key: String) {
    if let Ok(e) = keyring::Entry::new("forze-ide", &key) { let _ = e.delete_credential(); }
}
```

### 2. Supabase client with a keychain storage adapter

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import { invoke } from '@tauri-apps/api/core'

const keychain = {
  getItem: (key: string) => invoke<string | null>('secure_get', { key }),
  setItem: (key: string, value: string) => invoke('secure_set', { key, value }),
  removeItem: (key: string) => invoke('secure_remove', { key }),
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: keychain,          // keychain, never localStorage
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,  // desktop app, no URL session
      flowType: 'pkce',
    },
  },
)
```

### 3. Auth gate + native sign-in screen

Wrap the app root so nothing renders until there's a session. Build the sign-in screen to match the IDE's existing design system (matte-black "Builder OS" theme — reuse the app's own tokens/components; do not introduce new fonts or purple gradients).

```tsx
// src/AuthGate.tsx
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return null          // splash while restoring keychain session
  if (!session) return <SignIn />  // app fully locked
  return <>{children}</>
}
```

`SignIn` requirements:
- Email + password fields → `supabase.auth.signInWithPassword({ email, password })`.
- A sign-up affordance → `supabase.auth.signUp(...)` (or link out to forze.in to create an account — your call, but support sign-in at minimum).
- A "Continue with Google" button (wire fully in task 5; stub the handler for now).
- Show `error.message` inline on failure. Show a loading state during the request.
- A sign-out control somewhere in the app shell → `supabase.auth.signOut()`.

### 4. Sync layer (local SQLite ⇄ cloud, metadata + chats only)

Create `src/lib/sync.ts` with typed helpers. Local SQLite remains the source of truth for anything on disk; mirror only metadata + conversations to Supabase.

```ts
// pattern — adapt to the app's data layer
import { supabase } from './supabase'

export async function syncProject(uid: string, p: {
  name: string; localPath?: string; gitRemote?: string; icon?: string; color?: string
}) {
  return supabase.from('ide_projects').upsert({
    user_id: uid,
    name: p.name,
    local_path: p.localPath ?? null,
    git_remote: p.gitRemote ?? null,
    icon: p.icon, color: p.color,
    last_opened_at: new Date().toISOString(),
  }, { onConflict: 'user_id,git_remote' })
}

export async function appendMessage(uid: string, conversationId: string, m: {
  role: 'user' | 'assistant' | 'system' | 'tool'; content: string; metadata?: Record<string, unknown>
}) {
  return supabase.from('ide_messages').insert({
    user_id: uid, conversation_id: conversationId,
    role: m.role, content: m.content, metadata: m.metadata ?? {},
  })
}

// on login, repopulate the sidebar on a fresh machine:
export async function pullWorkspace() {
  const [{ data: projects }, { data: conversations }] = await Promise.all([
    supabase.from('ide_projects').select('*').eq('archived', false).order('last_opened_at', { ascending: false }),
    supabase.from('ide_conversations').select('*').eq('archived', false).order('updated_at', { ascending: false }),
  ])
  return { projects: projects ?? [], conversations: conversations ?? [] }
}
```

Wire these into the existing flows: when a project is opened/created → `syncProject`; when an agent turn completes → `appendMessage` (create an `ide_conversations` row first if the thread is new); on successful login → `pullWorkspace` and merge into the local store.

### 5. Google sign-in via deep link

Desktop OAuth needs a redirect target, so use a custom scheme:
1. Add `tauri-plugin-deep-link`; register the `forze://` scheme in `tauri.conf.json`.
2. `const { data } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { skipBrowserRedirect: true, redirectTo: 'forze://auth-callback' } })` → open `data.url` in the system browser (Tauri opener/shell plugin).
3. On the deep-link event, `await supabase.auth.exchangeCodeForSession(url)`.
4. In the Supabase dashboard → **Auth → URL Configuration → Redirect URLs**, add `forze://auth-callback`.

If Google adds meaningful complexity, ship tasks 1–4 (email/password) first and land Google as a follow-up — the gate is fully functional without it.

## Constraints (hard rules)

- **Never use `localStorage` or `sessionStorage`** for the session or anything else. Session lives in the OS keychain (task 1).
- **Never upload source code or file contents** to Supabase. Only project metadata and conversation text/metadata. Keep `ide_messages.metadata` to path/line references — never file bodies.
- **Never hardcode the Supabase anon key** — read it from env.
- **Match the existing design system** — reuse the app's tokens/components; no new fonts, no purple gradients.
- **Surgical edits.** Don't rewrite unrelated files. Touch only what these tasks require.
- Don't recreate the database tables — they already exist with RLS.

## Acceptance criteria

- Launching with no session shows the sign-in screen; the rest of the app is unreachable.
- Sign in with email/password → app unlocks; the session survives an app restart (restored from keychain, not localStorage).
- Sign out → returns to the locked sign-in screen and clears the keychain entry.
- Opening/creating a project writes a row to `ide_projects`; an agent conversation writes to `ide_conversations` + `ide_messages`.
- Signing into the same account on a clean install repopulates the project list and conversation history (files do NOT come down — only metadata + chats).
- Grep the diff: zero `localStorage`/`sessionStorage` usage; zero source-file contents sent to Supabase.
- `cargo build` (src-tauri) and the frontend build both pass; the app boots.

Before you start: inspect the repo (frontend framework, state/data layer, existing design tokens, how Tauri commands are registered, whether there's already a SQLite layer) and tell me your plan and any deviations from these scaffolds. Then implement task by task.
