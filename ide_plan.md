# Forze IDE — Production Technical Specification & System Design
*The Sovereign OS for Startup Founders.*

This specification defines the complete end-to-end design, implementation code, and functional features of the **Forze IDE**. It details visual building pipelines, local security auditors, synthetic user sandboxes, native Rust keyring managers, and port-forwarding scripts.

---

## 1. Monorepo Directory Layout

```
forze-suite/
├── package.json
├── pnpm-workspace.yaml
├── apps/
│   ├── web/                           ← Existing Next.js web app (Forge)
│   │   ├── package.json
│   │   └── app/
│   └── desktop/                       ← Tauri v2 Desktop IDE Shell
│       ├── package.json
│       ├── src-tauri/                 ← Native Rust Core
│       │   ├── Cargo.toml
│       │   ├── tauri.conf.json        ← Permissions & Sidecars configuration
│       │   └── src/
│       │       └── main.rs            ← Rust command handlers
│       └── src/                       ← IDE React Frontend
│           ├── main.tsx
│           ├── components/
│           │   ├── EditorCanvas.tsx   ← Monaco editor wrapper
│           │   ├── VibeCanvas.tsx     ← Visual Drag-and-Drop / Vision builder
│           │   ├── GtmDashboard.tsx   ← Social queuing & analytics terminal
│           │   └── SecurityAuditor.tsx&larr; Vibe Security dashboard
│           └── index.css
└── packages/
    ├── mcp-server/                    ← Node/TS Model Context Protocol server
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts               ← Server entry point
    │       └── tools.ts               ← Tool execution handlers
    └── database/                      ← Database schema models & SQLite definitions
        └── schema.ts
```

---

## 2. Advanced Feature Specifications

### 🎨 The "Vibe Canvas" (Vision-to-Component Builder)
Allows non-technical founders to draw layouts visually or upload sketch mockups.
* **Sketch-to-Code Loop**: The founder drops a mockup image into the canvas. A local vision pipeline sends the image to Gemini (e.g. `gemini-2.5-flash`), generates responsive Tailwind elements, and injects them directly into the current Monaco cursor position.
* **Bi-directional Editing**: Changes made visually on the canvas instantly synchronize with the DOM representation in the editor.

### 🛡️ Built-in Vibe Security Auditor
Automates the detection of AI-introduced vulnerabilities (e.g., exposed API keys, raw trust of client parameters, broken access control, missing security headers).
* **Supabase RLS Policy Scanners**: Scans migration directories (`db/migrations/`) to ensure all tables have active Row-Level Security (RLS) and that no routes bypass auth.
* **Secret Watcher**: Pre-commit hooks that intercept file saves and notify the developer if sensitive keys (e.g., `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`) are about to be checked into version control.

### 👥 Synthetic Boardroom Execution Loop
Integrates the `shadow.ts` board members directly into the compile process.
* **Pre-Deploy Sim**: When you click "Build", a headless browser opens, navigates through the active dev tunnel, and feeds DOM page trees into the board personas:
  * **The Silicon Skeptic**: Evaluates code simplicity, technical debt, and pricing models.
  * **The UX Evangelist**: Analyzes contrast ratios, readability, accessibility, and visual layouts.
  * **The Growth Alchemist**: Audits SEO headers and conversion funnel clicks.
* **Verdict Score**: Outputs an updated **Venture Survival Score** directly inside the IDE status bar before deploying.

---

## 3. Trust-Delegated Social Publishing Architecture

Rather than storing OAuth secrets (like Meta and LinkedIn app secrets) locally inside the desktop client, the IDE uses a **Delegated Trust Model**. The IDE authenticates the user via Supabase Auth and forwards publishing requests to your existing backend utilities in [marketing-publish.ts](file:///C:/Users/arham/Documents/Github/Forge/lib/marketing-publish.ts).

```
+---------------+                    +---------------+                    +---------------+
|   Tauri IDE   |  1. Bearer Token   | Next.js API   |  2. Decrypt Secret | Supabase / DB |
| (Desktop App) | -----------------> | (Cloud Host)  | -----------------> | (Decrypted OK)|
+---------------+                    +---------------+                    +---------------+
        |                                    |                                    |
        | 4. Publish Status Success          | 3. Send OAuth Request              |
        v                                    v                                    v
+---------------+                    +---------------+                    +---------------+
| Founder View  |                    | Meta/LinkedIn | <================= | Decrypted Key |
+---------------+                    +---------------+                    +---------------+
```

### IDE-to-Backend Publishing Payload:
```typescript
import { z } from 'zod';

export const IdealPublishPayloadSchema = z.object({
  ventureId: z.string().uuid(),
  platform: z.enum(['linkedin', 'instagram', 'youtube']),
  caption: z.string().min(1),
  mediaUrls: z.array(z.string().url()).optional(),
});

export type IdealPublishPayload = z.infer<typeof IdealPublishPayloadSchema>;

export async function publishPostFromIDE(
  sessionToken: string,
  payload: IdealPublishPayload
): Promise<{ success: boolean; postId?: string; error?: string }> {
  // Makes direct call to your existing backend Next.js API layer
  const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ventures/${payload.ventureId}/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(payload),
  });

  return response.json();
}
```

---

## 4. Tauri Native Rust Integrations

The desktop core uses Rust to manage secure keychains, execute terminal tools, and capture filesystem telemetry.

### `apps/desktop/src-tauri/Cargo.toml`
```toml
[package]
name = "forze-ide"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2.0.0", features = ["api-all"] }
tauri-plugin-shell = "2.0.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
keyring = "2.1" # Secure OS Credential Management
```

### `apps/desktop/src-tauri/src/main.rs`
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{command, AppHandle, Emitter};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::thread;
use keyring::Entry;

// Secure OS Keychain Handler: Store Session tokens locally
#[command]
fn store_credential(service: &str, username: &str, token: &str) -> Result<(), String> {
    let entry = Entry::new(service, username).map_err(|e| e.to_string())?;
    entry.set_password(token).map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
fn get_credential(service: &str, username: &str) -> Result<String, String> {
    let entry = Entry::new(service, username).map_err(|e| e.to_string())?;
    let password = entry.get_password().map_err(|e| e.to_string())?;
    Ok(password)
}

// Native command to securely execute git diff
#[command]
fn get_git_diff() -> Result<String, String> {
    let output = Command::new("git")
        .args(["diff", "HEAD"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

// Sidecar Runner: Runs the Next.js dev server and streams logs to the UI
#[command]
fn run_dev_server(app: AppHandle, project_path: &str) -> Result<(), String> {
    let path = project_path.to_string();
    thread::spawn(move || {
        let child = Command::new("npm")
            .current_dir(path)
            .args(["run", "dev"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();

        match child {
            Ok(mut child_process) => {
                let stdout = child_process.stdout.take().unwrap();
                let reader = BufReader::new(stdout);

                for line in reader.lines() {
                    if let Ok(content) = line {
                        // Stream output lines to frontend UI console
                        let _ = app.emit("dev-server-log", content);
                    }
                }
            }
            Err(e) => {
                let _ = app.emit("dev-server-error", e.to_string());
            }
        }
    });

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handlers(tauri::generate_handler![
            store_credential, 
            get_credential, 
            get_git_diff, 
            run_dev_server
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 5. Visual Diagnostics Telemetry Gutter

When compilation logs streaming from the Tauri sidecar report a syntax or runtime error, the IDE parses the output and attaches interactive gutters to the Monaco instance:

```typescript
import * as monaco from 'monaco-editor';

interface StackTraceLine {
  filePath: string;
  line: number;
  column: number;
  message: string;
}

export function attachDiagnosticsToEditor(
  editor: monaco.editor.IStandaloneCodeEditor,
  error: StackTraceLine
) {
  const model = editor.getModel();
  if (!model) return;

  const marker: monaco.editor.IMarkerData = {
    severity: monaco.MarkerSeverity.Error,
    message: `${error.message} - Click to ask Forze Repair Agent`,
    startLineNumber: error.line,
    startColumn: error.column,
    endLineNumber: error.line,
    endColumn: error.column + 5,
  };

  // Add red squiggle line under the compiling error code block
  monaco.editor.setModelMarkers(model, 'forze-compiler', [marker]);
}
```

---

## 6. Offline Sync Log Merging SQL Schemas

```
+------------------------+                    +-------------------------+
| Local Workspace DB     |   Sync Protocol    | Remote Master DB        |
| (SQLite / Drizzle ORM) | <================> | (Supabase / Postgres)   |
| Offline-First Cache    |                    | Central Venture Context |
+------------------------+                    +-------------------------+
```

### SQLite Schema (`packages/database/schema.ts`)
```sql
CREATE TABLE IF NOT EXISTS local_mutation_log (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  action TEXT NOT NULL, 
  payload TEXT NOT NULL, 
  created_at INTEGER NOT NULL, 
  synced INTEGER DEFAULT 0 
);
```

### Merging Sequence:
```typescript
import { Client } from "@supabase/supabase-js";

interface MutationLog {
  id: string;
  table_name: string;
  row_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: string;
  created_at: number;
}

export async function synchronizeLocalMutations(
  localLogs: MutationLog[],
  supabaseClient: Client
) {
  const sortedLogs = [...localLogs].sort((a, b) => a.created_at - b.created_at);

  for (const log of sortedLogs) {
    const data = JSON.parse(log.payload);
    
    if (log.action === "INSERT" || log.action === "UPDATE") {
      const { error } = await supabaseClient
        .from(log.table_name)
        .upsert({ id: log.row_id, ...data, updated_at: new Date(log.created_at).toISOString() });
      
      if (error) throw new Error(`Sync conflict in table ${log.table_name}: ${error.message}`);
    } else if (log.action === "DELETE") {
      const { error } = await supabaseClient
        .from(log.table_name)
        .delete()
        .eq("id", log.row_id);
      
      if (error) throw new Error(`Sync deletion failure in table ${log.table_name}: ${error.message}`);
    }
  }
}
```

---

## 7. Execution Blueprint

### Phase 1: Local MCP Daemon (`@forze/mcp-server`)
* Build and publish standard Node/TS MCP daemon.
* Implement resources for brand schemas and active repository diff watchers.

### Phase 2: Tauri Core Shell & Editor UI
* Initialize Tauri Rust backend.
* Embed CodeMirror / Monaco canvas.
* Connect console events to log streams.

### Phase 3: Visual Canvas & Safety Scan
* Implement image/mockup drag-and-drop parsing logic.
* Setup security rule-checking for credentials and Supabase structures.
* Construct the virtual GTM and social dashboard wrapper panels.
