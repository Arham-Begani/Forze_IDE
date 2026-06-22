/**
 * Self-healing folder deploy. Deploys the open folder, polls the build to
 * completion, and — if it fails — feeds the build logs + the relevant source
 * files to the AI, applies the proposed patches to disk, and redeploys. Repeats
 * up to `maxAttempts`. Every step streams a line to `onLog` so the founder can
 * watch (and review/undo the on-disk changes afterwards via Source Control).
 */
import { aiReady, generateText } from './ai';
import { collectDeployFiles, joinPath, readFile, writeFile } from './fs';
import { pendoTrack } from './pendoTrack';
import {
  getDeployment,
  getDeploymentLogs,
  type DeployState,
} from './vercel';
import { deployLocalFolder } from './deployLocal';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll a deployment until it reaches a terminal state (or we give up). */
async function pollDeployment(
  token: string,
  id: string,
  teamId: string | undefined,
  onState: (s: DeployState) => void,
): Promise<DeployState> {
  // ~10 min ceiling at 5s intervals — plenty for typical builds.
  for (let i = 0; i < 120; i++) {
    const { state } = await getDeployment(token, id, teamId);
    onState(state);
    if (state === 'READY' || state === 'ERROR' || state === 'CANCELED') {
      return state;
    }
    await sleep(5000);
  }
  return 'BUILDING';
}

/** Keep only the lines that look like real errors, so the AI prompt stays tight. */
function errorTail(logs: string, max = 8000): string {
  const lines = logs.split('\n');
  const errIdx = lines.findIndex((l) =>
    /\b(error|failed|cannot find|not found|unexpected|missing|cannot resolve|Module not found)\b/i.test(
      l,
    ),
  );
  const slice = errIdx >= 0 ? lines.slice(Math.max(0, errIdx - 5)) : lines.slice(-60);
  const text = slice.join('\n');
  return text.length > max ? text.slice(-max) : text;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}\n…(truncated)` : s;
}

/** Best-effort: which project files does this error reference? */
function relevantFiles(logs: string, paths: string[]): string[] {
  const picked = new Set<string>();
  // Always give the AI the manifest/config files if present.
  for (const p of paths) {
    if (/^(package\.json|tsconfig\.json|vite\.config\.[mc]?[jt]s|next\.config\.[mc]?[jt]s)$/.test(p)) {
      picked.add(p);
    }
  }
  // Files whose path or basename appears in the log.
  const lower = logs.toLowerCase();
  for (const p of paths) {
    const base = p.split('/').pop() ?? p;
    if (lower.includes(p.toLowerCase()) || (base.length > 4 && lower.includes(base.toLowerCase()))) {
      picked.add(p);
    }
    if (picked.size >= 8) break;
  }
  return [...picked].slice(0, 8);
}

/** Strip code fences / prose and parse the first JSON object in a model reply. */
function parseJsonLoose(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1] ?? raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

interface AutoFix {
  changed: string[];
  explanation: string;
}

/** Ask the AI to fix a failed build and write its patches to disk. */
async function attemptAutoFix(
  root: string,
  logs: string,
  paths: string[],
  onLog: (s: string) => void,
): Promise<AutoFix> {
  const targets = relevantFiles(logs, paths);
  const contexts: string[] = [];
  for (const rel of targets) {
    try {
      const content = await readFile(joinPath(root, rel));
      contexts.push(`FILE: ${rel}\n\`\`\`\n${truncate(content, 7000)}\n\`\`\``);
    } catch {
      /* unreadable / binary — skip */
    }
  }

  const system =
    'You are a senior build engineer fixing a failed Vercel deployment. ' +
    'Return ONLY a JSON object, no prose, of the form ' +
    '{"explanation": string, "edits": [{"file": "<path relative to project root>", "contents": "<FULL new file contents>"}]}. ' +
    'Include only files you actually change. Make the smallest correct change that fixes the build error. ' +
    'Never invent APIs; prefer fixing imports, config, versions, and syntax. If a dependency is missing, add it to package.json.';

  const prompt =
    `BUILD ERROR LOG:\n${errorTail(logs)}\n\n` +
    `PROJECT FILE PATHS:\n${paths.slice(0, 400).join('\n')}\n\n` +
    `RELEVANT FILE CONTENTS:\n${contexts.join('\n\n') || '(none matched — infer from the log and file paths)'}`;

  onLog('Asking AI to fix the build…');
  const raw = await generateText(prompt, { system, maxTokens: 4096 });
  const json = parseJsonLoose(raw) as
    | { explanation?: string; edits?: Array<{ file?: string; contents?: string }> }
    | null;

  const edits = Array.isArray(json?.edits) ? json!.edits! : [];
  const changed: string[] = [];
  for (const e of edits) {
    if (typeof e?.file !== 'string' || typeof e?.contents !== 'string') continue;
    const rel = e.file.replace(/^\.?\//, '').replace(/\\/g, '/');
    // Refuse path escapes and absolute paths — only write inside the project.
    if (rel.includes('..') || rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) continue;
    await writeFile(joinPath(root, rel), e.contents);
    changed.push(rel);
  }
  return { changed, explanation: typeof json?.explanation === 'string' ? json!.explanation! : '' };
}

export interface HealResult {
  url: string;
  state: DeployState;
  attempts: number;
  /** Files changed on each fix round. */
  fixes: string[][];
}

export async function deployWithAutoFix(opts: {
  token: string;
  root: string;
  name: string;
  teamId?: string;
  target?: 'production';
  autoFix: boolean;
  maxAttempts?: number;
  onPhase?: (phase: string) => void;
  onLog?: (line: string) => void;
}): Promise<HealResult> {
  const onLog = opts.onLog ?? (() => {});
  const onPhase = opts.onPhase ?? (() => {});
  const maxAttempts = opts.autoFix ? opts.maxAttempts ?? 3 : 1;
  const fixes: string[][] = [];
  let lastUrl = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (maxAttempts > 1) onLog(`— Attempt ${attempt}/${maxAttempts} —`);

    const { id, url } = await deployLocalFolder({
      token: opts.token,
      root: opts.root,
      name: opts.name,
      teamId: opts.teamId,
      target: opts.target,
      onProgress: (p) => onPhase(p.phase),
    });
    lastUrl = url;
    onLog(`Deployed → ${url}`);

    onPhase('Building…');
    const state = await pollDeployment(opts.token, id, opts.teamId, (s) =>
      onPhase(`Building… (${s.toLowerCase()})`),
    );

    if (state === 'READY') {
      onLog('Build succeeded ✓');
      const result = { url, state, attempts: attempt, fixes };
      pendoTrack('folder_deploy_completed', {
        final_state: result.state,
        attempts: result.attempts,
        auto_fix_enabled: opts.autoFix,
        files_fixed_count: result.fixes.reduce((n, f) => n + f.length, 0),
        project_name: opts.name,
        deploy_url: result.url,
      });
      return result;
    }
    if (state !== 'ERROR') {
      onLog(`Build ${state.toLowerCase()}.`);
      const result = { url, state, attempts: attempt, fixes };
      pendoTrack('folder_deploy_completed', {
        final_state: result.state,
        attempts: result.attempts,
        auto_fix_enabled: opts.autoFix,
        files_fixed_count: result.fixes.reduce((n, f) => n + f.length, 0),
        project_name: opts.name,
        deploy_url: result.url,
      });
      return result;
    }

    // Build failed — pull logs.
    onPhase('Reading build logs…');
    let logs = '';
    try {
      logs = await getDeploymentLogs(opts.token, id, opts.teamId);
    } catch (err) {
      onLog(`Couldn't read build logs: ${err instanceof Error ? err.message : err}`);
    }
    const tail = errorTail(logs, 1500);
    if (tail) onLog(`Build error:\n${tail}`);

    if (!opts.autoFix) {
      const result = { url, state, attempts: attempt, fixes };
      pendoTrack('folder_deploy_completed', {
        final_state: result.state,
        attempts: result.attempts,
        auto_fix_enabled: false,
        files_fixed_count: 0,
        project_name: opts.name,
        deploy_url: result.url,
      });
      return result;
    }
    if (attempt === maxAttempts) {
      onLog('Out of auto-fix attempts.');
      const result = { url, state, attempts: attempt, fixes };
      pendoTrack('folder_deploy_completed', {
        final_state: result.state,
        attempts: result.attempts,
        auto_fix_enabled: opts.autoFix,
        files_fixed_count: result.fixes.reduce((n, f) => n + f.length, 0),
        project_name: opts.name,
        deploy_url: result.url,
      });
      return result;
    }
    if (!aiReady()) {
      onLog('No AI model connected — add a key in Settings to enable auto-fix.');
      const result = { url, state, attempts: attempt, fixes };
      pendoTrack('folder_deploy_completed', {
        final_state: result.state,
        attempts: result.attempts,
        auto_fix_enabled: opts.autoFix,
        files_fixed_count: 0,
        project_name: opts.name,
        deploy_url: result.url,
      });
      return result;
    }

    onPhase('Analyzing & fixing…');
    const paths = (await collectDeployFiles(opts.root)).map((f) => f.file);
    let fix: AutoFix;
    try {
      fix = await attemptAutoFix(opts.root, logs, paths, onLog);
    } catch (err) {
      onLog(`Auto-fix failed: ${err instanceof Error ? err.message : err}`);
      const result = { url, state, attempts: attempt, fixes };
      pendoTrack('folder_deploy_completed', {
        final_state: result.state,
        attempts: result.attempts,
        auto_fix_enabled: opts.autoFix,
        files_fixed_count: result.fixes.reduce((n, f) => n + f.length, 0),
        project_name: opts.name,
        deploy_url: result.url,
      });
      return result;
    }
    fixes.push(fix.changed);
    if (fix.changed.length === 0) {
      onLog('AI proposed no file changes — stopping.');
      const result = { url, state, attempts: attempt, fixes };
      pendoTrack('folder_deploy_completed', {
        final_state: result.state,
        attempts: result.attempts,
        auto_fix_enabled: opts.autoFix,
        files_fixed_count: 0,
        project_name: opts.name,
        deploy_url: result.url,
      });
      return result;
    }
    onLog(
      `${fix.explanation ? fix.explanation + ' ' : ''}Patched: ${fix.changed.join(', ')}. Redeploying…`,
    );
  }

  const finalResult: HealResult = { url: lastUrl, state: 'ERROR', attempts: maxAttempts, fixes };
  pendoTrack('folder_deploy_completed', {
    final_state: finalResult.state,
    attempts: finalResult.attempts,
    auto_fix_enabled: opts.autoFix,
    files_fixed_count: finalResult.fixes.reduce((n, f) => n + f.length, 0),
    project_name: opts.name,
    deploy_url: finalResult.url,
  });
  return finalResult;
}
