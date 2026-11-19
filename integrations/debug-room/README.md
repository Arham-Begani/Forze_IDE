# Forze Debug Rooms

A developer can invite one teammate straight to a failed deployment, discuss an approved error excerpt in the browser and keep the helpful reply beside the rerun result.

## Run the judge entry

Use Node 22 LTS. From the repository root:

```sh
cd integrations/debug-room
npm install
npm run build
```

Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell, `cp .env.example .env` on macOS/Linux). In [Nexconn Console](https://console.nexconn.ai/), open the app’s Key Management page. Set `NEXCONN_APP_KEY`, `NEXCONN_APP_SECRET` and `NEXCONN_API_BASE` on the server. Use the regional API base from the console. The client gets its own identity token and the public SDK initialization key. Never put the App Secret into a Vite variable.

```sh
npm test
npm start
```

Open **http://127.0.0.1:4174**. The clearly labeled Orbit storefront sample has just failed a real Node build. Choose **Ask for help**, select the missing-import diagnostic, verify the preview, then create the room. Use **Get invite link** and open that link in a private browser window. The invite expires in 24 hours and grants one teammate seat. Use the same browser profile to reopen a claimed seat. The developer can generate another link before the seat is claimed by refreshing and choosing **Get invite link** again.

Send a reply in each direction. Accept the teammate’s reply, change the import to `./pricing.mjs`, and build again. The successful build publishes a real HTML page behind **Open built storefront**. Refresh either window. The original error, selected solution and latest observed build result remain visible. The SDK loads the conversation from Nexconn.

## In Forze IDE

Install the existing suite with pnpm 9 and run the desktop app as usual. For a hosted room, set `VITE_DEBUG_ROOM_ORIGIN` in `forze-suite/apps/desktop/.env.local` before starting or building the IDE. The localhost default targets the judge entry above.

```sh
cd forze-suite
pnpm install --frozen-lockfile
pnpm --filter @forze/desktop typecheck
pnpm --filter @forze/desktop test
pnpm --filter @forze/desktop build
pnpm --filter @forze/desktop tauri:dev
```

Sign in, open the test project and connect Vercel through the existing Integrations settings. Use a disposable Vercel project for this recording. Disable Auto-fix to keep the first failure visible. In **Deployments**, **Ask for help** appears beside failed rows and failed folder builds. Logs are fetched through Forze’s existing Vercel client. The desktop secret scanner and shared diagnostic allowlist run before selection. Unrecognized text stays local. The browser handoff contains only the project name, deployment ID and selected normalized lines. The preview shows those same values. Room credentials, the Vercel token, environment lists and raw logs are excluded.

Apply the fix in the editor. With the matching project folder open, choose **Deploy fixed folder** in the help panel. This uses the existing folder deploy workflow and its current deployment settings. **Share rerun status** fetches the exact new deployment ID from Vercel and opens the owner browser to update the room. Repeat to share a later status. This is an explicit, time-stamped observation. Status is independent of solution acceptance. Keep the same default browser for the desktop handoff.

## Hosting

A single Node instance can persist room metadata in `ROOM_DATA_DIR`. Mount a durable volume there, terminate HTTPS at the proxy and set `PUBLIC_ORIGIN` to the canonical HTTPS origin. Expose port `PORT` (default 4174). The Dockerfile includes the bundled SDK. A downloadable CI archive that already contains `public/vendor/nexconn.js` runs locally with `node --env-file=.env server.mjs` without installing build tools.

For Vercel, set the project root to `integrations/debug-room`, use Node 22 and the included `vercel.json`. Attach a **private** Vercel Blob store to this project so the function receives `BLOB_READ_WRITE_TOKEN`. Add the three Nexconn settings and deploy. Private Blob uses uncached reads and conditional writes to protect concurrent updates. A serverless deployment needs the private store. Local files are intended for single-instance hosts.

## Verify

`npm test` runs the service, privacy, token signing, concurrent update and SDK contract tests. The contract tests use test doubles. For browser checks, install Playwright for Python once:

```sh
python -m pip install playwright
python -m playwright install chromium
python test/browser_flow.py --live
```

Pass `--url https://YOUR-ROOM-HOST` for a remote test. The live run opens independent browser contexts, sends a real message each way, reloads history, accepts a reply and checks isolation and rerun status. Without server credentials, use `python test/browser_flow.py` to verify the disconnected state, retained draft and independent room flows. Production UI has no substitute chat transport.

## Submission

- [90-second demo script](DEMO.md)
- [Project write-up](submission.pdf) · [editable print source](submission.html)
- Required Nexconn App Key: **[fill from the same app used for the demo]**. Include it in the write-up and submission form.
- Optional traction: no tester counts or feedback claimed.
- Public review scope: the new room package, `DebugRoomPanel.tsx`, and small hooks in `DeploymentsPage.tsx` and `deployHeal.ts`. The Git baseline is `7885cd3`. Existing Forze capabilities include desktop sign-in, editor, deployment table, integrated Vercel client, folder deploy/redeploy, log client and secret scanner. The pre-existing web dashboard’s sample deployment table did not provide live deployment logs.

Official references: [challenge rules](https://reskilll.com/hack/nexconn/rules), [Web quickstart](https://docs.nexconn.ai/chatsdk-web), [register a user](https://docs.nexconn.ai/platform-chat-api/user/register), [request signature](https://docs.nexconn.ai/platform-chat-api/prepare-to-use-api/auth), [history](https://docs.nexconn.ai/chatsdk-web/message/get-history).
