import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function runSample(corrected) {
  const dir = mkdtempSync(join(tmpdir(), 'forze-build-'));
  try {
    cpSync(new URL('./fixture/', import.meta.url), dir, { recursive: true });
    const source = join(dir, 'storefront.mjs');
    if (corrected) writeFileSync(source, readFileSync(source, 'utf8').replace('./prcing.mjs', './pricing.mjs'));
    const run = spawnSync(process.execPath, ['build.mjs'], {
      cwd: dir, timeout: 5000, encoding: 'utf8',
      env: { SystemRoot: process.env.SystemRoot ?? '', PATH: '' }, windowsHide: true,
    });
    if (run.error || run.status === null) throw new Error('Sample build runner unavailable');
    return {
      state: run.status === 0 ? 'READY' : 'ERROR',
      logs: ['Building Orbit storefront', ...[run.stdout, run.stderr].join('\n').trim().split(/\r?\n/), 'Build exited with code ' + run.status],
      artifact: run.status === 0 ? readFileSync(join(dir, 'index.html'), 'utf8') : null
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
