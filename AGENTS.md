# Forze IDE — Agent Guide: Distribution & Auto-Update

> Read this before touching anything related to **versioning, releases, the
> updater, signing keys, or `tauri.conf.json`**. Getting these wrong silently
> breaks downloads or auto-updates for real users, with no error on your end.

---

## The situation in one paragraph

This repo is the **Forze IDE** — a Tauri v2 desktop app living in
`forze-suite/apps/desktop`. It is **distributed by a separate web platform**
(repo "Forge", deployed at **https://www.forze.in**). That platform hosts a
login-gated `/download` page and a Tauri **update feed** at `/api/update/...`.
The two codebases share **no code**. They are connected by exactly **one file**:
a `manifest.json` on Vercel Blob. This repo's CI writes it; the platform reads
it. **Do not look for platform/download/update UI code in this repo — it is not
here.**

```
  THIS REPO (Forze_ide)                         PLATFORM REPO (Forge → www.forze.in)
  ─────────────────────                         ────────────────────────────────────
  git tag v* ──▶ .github/workflows/release.yml
                   │ builds + signs (Win/macOS/Linux)
                   │ uploads installers + update bundles ──▶ Vercel Blob store
                   └ scripts/publish-release.mjs writes ───▶  forze-ide/manifest.json
                                                                     ▲          │
                                                                     │ reads    │ reads
                                              /api/update/* (auto-update feed) ─┘
                                              /download + /api/download/* (gated installs)
```

- **Blob store / manifest URL:** `https://i2ljcandsj5domo4.public.blob.vercel-storage.com/forze-ide/manifest.json`
- The platform reads it via its env var `IDE_MANIFEST_URL` (set on Vercel).

---

## How a change actually reaches users

Editing code — **even committing and pushing to `main` — publishes nothing.**
The release workflow triggers **only on a pushed git tag matching `v*`.**

```bash
# from the repo root:
node scripts/release.mjs patch      # 0.1.0 -> 0.1.1  (also: minor | major | 0.4.2)
#   or
pnpm release patch
```

That helper bumps the version in **both** version files, commits everything,
tags `vX.Y.Z`, and pushes the branch + tag. CI then builds → signs → overwrites
`manifest.json`. After it goes green:

| Audience | When they get it |
| --- | --- |
| New downloaders (`/download`) | immediately (manifest now points at the new build) |
| Already-installed apps | on next launch (update feed reports the higher version) |

Use `node scripts/release.mjs patch --dry` to preview without changing anything.

---

## ⚠️ Invariants — break these and updates fail *silently*

1. **`version` in `tauri.conf.json` is the source of truth.**
   `scripts/publish-release.mjs` reads the version from there, **not** the git
   tag. If you tag a release without bumping it, the manifest keeps the old
   version and installed apps think they're up to date. Keep
   `apps/desktop/package.json` `version` in sync (the release helper does this).

2. **Signing keys are paired and permanent.**
   `plugins.updater.pubkey` in `tauri.conf.json` must match the **private key**
   stored in the CI secret `TAURI_SIGNING_PRIVATE_KEY`. If you regenerate keys
   (`tauri signer generate`), every already-installed app will **reject** all
   future updates (signature mismatch) until users reinstall. Do **not**
   regenerate casually. The private key file lives at `~/.tauri/forze.key` on
   the maintainer's machine — never commit it.

3. **`bundle.createUpdaterArtifacts` must stay `true`.** Off = no signed update
   bundles are produced = auto-update breaks.

4. **The updater endpoint must point at the canonical host.**
   `plugins.updater.endpoints` →
   `https://www.forze.in/api/update/{{target}}/{{arch}}/{{current_version}}`.
   Use `www.` — the apex `forze.in` 308-redirects to it. The `{{...}}` tokens are
   Tauri's; leave them literal. This value is **baked into each build**, so a
   change only takes effect on the *next* release.

5. **The manifest shape is a contract with the platform.**
   `scripts/publish-release.mjs` must keep producing this shape (the platform's
   `lib/ide-release.ts` reads it):
   ```jsonc
   {
     "version": "0.1.1",
     "pubDate": "<ISO>",
     "installers": { "windows-x86_64": { "url": "..." }, "darwin-aarch64": {...}, "darwin-x86_64": {...}, "linux-x86_64": {...} },
     "platforms":  { "windows-x86_64": { "url": "...", "signature": "..." }, "darwin-aarch64": {...}, ... }
   }
   ```
   Platform keys are Tauri's `{target}-{arch}`. `installers[k].url` = the file the
   download button serves; `platforms[k]` = the signed update bundle + its `.sig`.

---

## CI secrets (set in the GitHub repo → Settings → Secrets and variables → Actions → **Secrets**)

| Secret | Notes |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/forze.key`. **No trailing newline** — a stray `\n` causes `failed to decode base64 key: Invalid symbol 10`. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password chosen at key generation. Omit if none was set. |
| `BLOB_READ_WRITE_TOKEN` | Token for the Vercel Blob store (`i2ljcandsj5domo4...`). The `publish` job uploads with it. |

These are **secrets, not variables** — the workflow reads `${{ secrets.* }}`.

---

## Files that matter here

| Path | Role |
| --- | --- |
| `forze-suite/apps/desktop/src-tauri/tauri.conf.json` | version (source of truth), updater endpoint, signing `pubkey`, `createUpdaterArtifacts` |
| `forze-suite/apps/desktop/package.json` | keep `version` in sync with tauri.conf |
| `forze-suite/apps/desktop/src/lib/updater.ts` | calls `check()` on startup (invoked from `App.tsx`) |
| `.github/workflows/release.yml` | the build → sign → publish pipeline (triggers on `v*` tags) |
| `scripts/publish-release.mjs` | uploads artifacts to Blob + writes `manifest.json` (don't break the shape) |
| `scripts/release.mjs` | the version-bump-commit-tag-push helper |

---

## The platform side (other repo — FYI, do not edit from here)

Lives in the **Forge** repo, deployed to `www.forze.in`:
- `app/download/page.tsx` — login-gated download page (OS auto-detect).
- `app/api/download/[platform]/route.ts` — `requireAuth()` → 302 to the installer.
- `app/api/update/[target]/[arch]/[current]/route.ts` — public Tauri update feed (204 if up to date, else signed JSON).
- `lib/ide-release.ts` — reads `manifest.json` via env `IDE_MANIFEST_URL`.

## Known caveats

- **macOS builds are unsigned / un-notarized** (no Apple Developer cert). Mac
  users hit a Gatekeeper "unidentified developer" warning. Fine for beta; add an
  Apple cert + notarization to the workflow before a public macOS launch.
- **Download installer URLs are public-but-unguessable** (the login gate is at
  `/api/download`). Hardening to short-lived signed URLs is a future step on the
  platform side, not here.
