// scripts/release.mjs — cut a Forze IDE release in one step.
//
// Why this exists: a release only reaches users when a `v*` tag is pushed, and
// the version MUST be bumped in tauri.conf.json (the publish step reads the
// version from there, not the tag). Forgetting the bump = installed apps never
// update. This script does the whole dance so that can't be forgotten.
//
// Usage (run from the repo root):
//   node scripts/release.mjs            # patch:  0.1.0 -> 0.1.1  (default)
//   node scripts/release.mjs patch      # same
//   node scripts/release.mjs minor      #         0.1.0 -> 0.2.0
//   node scripts/release.mjs major      #         0.1.0 -> 1.0.0
//   node scripts/release.mjs 0.4.2      # explicit version
//   node scripts/release.mjs patch --dry # print the plan, change/commit/push nothing
//
// What it does:
//   1. Bumps "version" in tauri.conf.json AND apps/desktop/package.json (in sync).
//   2. Commits ALL current changes as "chore(release): vX.Y.Z".
//   3. Tags vX.Y.Z and pushes the branch + tag.
//   CI (.github/workflows/release.yml) then builds, signs, and publishes the
//   manifest. See AGENTS.md for the full picture.

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const TAURI_CONF = join(repoRoot, 'forze-suite/apps/desktop/src-tauri/tauri.conf.json')
const PKG = join(repoRoot, 'forze-suite/apps/desktop/package.json')

const args = process.argv.slice(2)
const dry = args.includes('--dry') || args.includes('--dry-run')
const kind = args.find((a) => !a.startsWith('-')) || 'patch'

function bump(cur, how) {
  const m = cur.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!m) throw new Error(`current version "${cur}" is not X.Y.Z`)
  const [maj, min, pat] = m.slice(1).map(Number)
  if (how === 'major') return `${maj + 1}.0.0`
  if (how === 'minor') return `${maj}.${min + 1}.0`
  if (how === 'patch') return `${maj}.${min}.${pat + 1}`
  if (/^\d+\.\d+\.\d+$/.test(how)) return how
  throw new Error(`unknown bump "${how}" — use patch | minor | major | X.Y.Z`)
}

function git(cmd, opts = {}) {
  return execSync(`git ${cmd}`, { cwd: repoRoot, stdio: 'pipe', ...opts }).toString().trim()
}

// Replace the first `"version": "X.Y.Z"` in a file without reformatting the rest.
function setVersion(path, version) {
  const raw = readFileSync(path, 'utf8')
  const out = raw.replace(/("version"\s*:\s*")\d+\.\d+\.\d+(")/, `$1${version}$2`)
  if (out === raw) throw new Error(`no "version": "X.Y.Z" field found in ${path}`)
  writeFileSync(path, out)
}

const current = JSON.parse(readFileSync(TAURI_CONF, 'utf8')).version
const next = bump(current, kind)
const tag = `v${next}`

if (next === current) {
  console.error(`Refusing: new version (${next}) equals current. Bump differently.`)
  process.exit(1)
}

// Don't clobber an existing tag.
let tagExists = false
try {
  execSync(`git rev-parse -q --verify refs/tags/${tag}`, { cwd: repoRoot, stdio: 'pipe' })
  tagExists = true
} catch {
  tagExists = false
}
if (tagExists) {
  console.error(`Refusing: tag ${tag} already exists.`)
  process.exit(1)
}

const branch = git('rev-parse --abbrev-ref HEAD')
console.log(`Release ${current} -> ${next}  (tag ${tag}, branch ${branch})`)

if (dry) {
  console.log('[dry run] no files changed, nothing committed or pushed.')
  process.exit(0)
}

setVersion(TAURI_CONF, next)
setVersion(PKG, next)
console.log('• bumped tauri.conf.json + apps/desktop/package.json')

execSync('git add -A', { cwd: repoRoot, stdio: 'inherit' })
execSync(`git commit -m "chore(release): ${tag}"`, { cwd: repoRoot, stdio: 'inherit' })
execSync(`git tag -a ${tag} -m "Forze IDE ${tag}"`, { cwd: repoRoot, stdio: 'inherit' })
if (branch && branch !== 'HEAD') {
  execSync(`git push origin ${branch}`, { cwd: repoRoot, stdio: 'inherit' })
}
execSync(`git push origin ${tag}`, { cwd: repoRoot, stdio: 'inherit' })

console.log(`\n✅ Pushed ${tag}. CI is building:`)
console.log('   https://github.com/Arham-Begani/Forze_IDE/actions')
console.log('Once green, new downloads + auto-updates serve this version.')
