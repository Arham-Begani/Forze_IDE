/**
 * Deploy the currently-open workspace folder to Vercel as a CLI-style file
 * deployment — the `vercel deploy` flow. Unlike a git redeploy, this ships the
 * exact bytes on disk and finds-or-creates a Vercel project named after the
 * folder, so it works for any project the founder has open (not just ones
 * already linked on Vercel).
 */
import { collectDeployFiles } from './fs';
import { base64ToBytes, createFileDeployment, uploadFile } from './vercel';

/** Turn a folder name into a valid Vercel project slug. */
export function toProjectName(folder: string): string {
  const slug = folder
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 100);
  return slug || 'forze-app';
}

/** Best-effort framework preset from the file list (Vercel auto-detects the rest). */
function detectFramework(paths: string[]): string | null {
  const has = (re: RegExp) => paths.some((p) => re.test(p));
  if (has(/(^|\/)next\.config\.[mc]?[jt]s$/)) return 'nextjs';
  if (has(/(^|\/)nuxt\.config\.[mc]?[jt]s$/)) return 'nuxtjs';
  if (has(/(^|\/)svelte\.config\.[mc]?[jt]s$/)) return 'sveltekit';
  if (has(/(^|\/)astro\.config\.[mc]?[jt]s$/)) return 'astro';
  if (has(/(^|\/)gatsby-config\.[mc]?[jt]s$/)) return 'gatsby';
  if (has(/(^|\/)remix\.config\.[mc]?[jt]s$/)) return 'remix';
  if (has(/(^|\/)vue\.config\.[mc]?[jt]s$/)) return 'vue';
  if (has(/(^|\/)vite\.config\.[mc]?[jt]s$/)) return 'vite';
  // No recognized framework: let Vercel treat it as a static/other project.
  return null;
}

export interface DeployProgress {
  phase: string;
  done: number;
  total: number;
}

/** Run `fn` over `items` with at most `concurrency` in flight at once. */
async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item === undefined) break;
      await fn(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
}

export async function deployLocalFolder(opts: {
  token: string;
  root: string;
  name: string;
  teamId?: string;
  target?: 'production';
  onProgress?: (p: DeployProgress) => void;
}): Promise<{ id: string; url: string }> {
  const { token, root, name, teamId, target, onProgress } = opts;

  onProgress?.({ phase: 'Scanning files…', done: 0, total: 0 });
  const files = await collectDeployFiles(root);
  if (files.length === 0) {
    throw new Error('No deployable files found in this folder.');
  }

  // Upload unique blobs (deduped by SHA), bounded concurrency, with progress.
  const seen = new Set<string>();
  const unique = files.filter((f) => {
    if (seen.has(f.sha)) return false;
    seen.add(f.sha);
    return true;
  });
  let done = 0;
  const total = unique.length;
  onProgress?.({ phase: `Uploading 0/${total}…`, done, total });
  await runPool(unique, 8, async (f) => {
    await uploadFile(token, base64ToBytes(f.data), f.sha, teamId);
    done += 1;
    onProgress?.({ phase: `Uploading ${done}/${total}…`, done, total });
  });

  onProgress?.({ phase: 'Creating deployment…', done: total, total });
  return createFileDeployment(token, {
    name,
    teamId,
    target,
    framework: detectFramework(files.map((f) => f.file)),
    files: files.map((f) => ({ file: f.file, sha: f.sha, size: f.size })),
  });
}
