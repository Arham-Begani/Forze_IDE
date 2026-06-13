// Publishes a tagged release to Vercel Blob.
//
// Runs in the `publish` job of .github/workflows/release.yml after every
// platform's signed bundle has been downloaded into ./artifacts. It discovers
// the installers + updater bundles, uploads them, reads the detached .sig files
// Tauri emitted alongside each updater bundle, and writes a single
// manifest.json that the update endpoint serves back to the app.
//
// Env: BLOB_READ_WRITE_TOKEN (required). The version is read from
// tauri.conf.json (the file the build uses), not the git tag.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { put } from '@vercel/blob'

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('BLOB_READ_WRITE_TOKEN is not set — aborting.')
  process.exit(1)
}

// Version comes from the file Tauri actually builds with — NOT the git tag.
// A tag that disagrees with tauri.conf.json's version makes installed apps
// update-loop forever (manifest offers vX, but the downloaded build still
// reports the old version, so vX gets re-offered on every check).
const CONF_PATH = 'forze-suite/apps/desktop/src-tauri/tauri.conf.json'
const VERSION = JSON.parse(readFileSync(CONF_PATH, 'utf8')).version
const ROOT = 'artifacts'

// Recursively find files under the downloaded artifacts.
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}
const files = walk(ROOT)
const find = (re) => files.find((f) => re.test(f))

// Installer = the file the download button serves. The updater bundle is
// whatever Tauri emitted a detached ".sig" next to — we match the sig per
// platform and derive the bundle by stripping ".sig". That's robust to Tauri's
// differing per-platform extensions AND the v1-vs-v2 AppImage naming change
// (.AppImage.tar.gz in v1, .AppImage in v2).
const installerPat = {
  'windows-x86_64': /(-setup\.exe|\.msi)$/,
  'darwin-aarch64': /\.dmg$/,
  'darwin-x86_64':  /\.dmg$/,
  'linux-x86_64':   /\.AppImage$/,
}
const sigPat = {
  'windows-x86_64': /(-setup\.exe|\.msi)\.sig$/,
  'darwin-aarch64': /\.app\.tar\.gz\.sig$/,
  'darwin-x86_64':  /\.app\.tar\.gz\.sig$/,
  'linux-x86_64':   /\.AppImage(\.tar\.gz)?\.sig$/,
}

async function upload(localPath) {
  const data = readFileSync(localPath)
  const name = localPath.split(/[\\/]/).pop()
  const { url } = await put(`forze-ide/${VERSION}/${name}`, data, {
    access: 'public',         // unguessable URL; harden to signed URLs later
    addRandomSuffix: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
  return url
}

const installers = {}, platforms = {}
for (const key of Object.keys(installerPat)) {
  const installer = find(installerPat[key])
  if (installer) installers[key] = { url: await upload(installer) }

  const sigFile = find(sigPat[key])
  if (sigFile) {
    const bundle = sigFile.replace(/\.sig$/, '')
    platforms[key] = { url: await upload(bundle), signature: readFileSync(sigFile, 'utf8').trim() }
  }
}

if (Object.keys(platforms).length === 0) {
  console.error('No updater bundles + signatures found under ./artifacts — nothing to publish.')
  console.error('Discovered files:\n' + files.join('\n'))
  process.exit(1)
}

const manifest = { version: VERSION, pubDate: new Date().toISOString(), notes: '', installers, platforms }
await put('forze-ide/manifest.json', JSON.stringify(manifest, null, 2), {
  access: 'public', addRandomSuffix: false, contentType: 'application/json',
  token: process.env.BLOB_READ_WRITE_TOKEN, allowOverwrite: true,
})
console.log('Published manifest:\n', JSON.stringify(manifest, null, 2))
