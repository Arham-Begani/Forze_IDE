/**
 * Minimal Vercel REST client. Calls go through `httpFetch` so they work from
 * the Tauri shell without tripping CORS. Every call needs a personal or team
 * access token (created at https://vercel.com/account/tokens).
 */
import { httpFetch } from './http';

const API = 'https://api.vercel.com';

export interface VercelUser {
  username: string;
  email?: string;
  name?: string;
}

export interface VercelProjectLink {
  type?: 'github' | 'gitlab' | 'bitbucket';
  repo?: string;
  repoId?: number;
  org?: string;
  productionBranch?: string;
}

export interface VercelProject {
  id: string;
  name: string;
  framework?: string | null;
  link?: VercelProjectLink;
}

export type DeployState =
  | 'BUILDING'
  | 'ERROR'
  | 'INITIALIZING'
  | 'QUEUED'
  | 'READY'
  | 'CANCELED';

export interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  state: DeployState;
  created: number;
  target: 'production' | 'staging' | null;
  branch?: string;
  commitMessage?: string;
  /** Vercel dashboard URL for build logs / inspector. */
  inspectorUrl?: string;
}

export function isInProgress(state: DeployState): boolean {
  return state === 'BUILDING' || state === 'QUEUED' || state === 'INITIALIZING';
}

export interface VercelEnvVar {
  key: string;
  target: string[];
  type: string;
}

function teamQuery(teamId?: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
}

async function call<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (!token) throw new Error('Add a Vercel token in Settings → Integrations.');
  const res = await httpFetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message = json?.error?.message ?? res.statusText ?? 'Vercel request failed';
    throw new Error(`Vercel ${res.status}: ${message}`);
  }
  return json as T;
}

/** Validate a token and return the authenticated user. */
export async function verifyToken(token: string): Promise<VercelUser> {
  const data = await call<{ user: VercelUser }>(token, '/v2/user');
  return data.user;
}

export async function listProjects(
  token: string,
  teamId?: string,
): Promise<VercelProject[]> {
  const sep = teamId ? '&' : '?';
  const data = await call<{ projects: VercelProject[] }>(
    token,
    `/v9/projects${teamQuery(teamId)}${sep}limit=100`,
  );
  return data.projects ?? [];
}

export async function listDeployments(
  token: string,
  opts: { projectId?: string; teamId?: string; limit?: number } = {},
): Promise<VercelDeployment[]> {
  const params = new URLSearchParams();
  params.set('limit', String(opts.limit ?? 20));
  if (opts.projectId) params.set('projectId', opts.projectId);
  if (opts.teamId) params.set('teamId', opts.teamId);

  interface Raw {
    uid: string;
    name: string;
    url: string;
    state?: DeployState;
    readyState?: DeployState;
    created: number;
    target: 'production' | 'staging' | null;
    inspectorUrl?: string;
    meta?: {
      githubCommitRef?: string;
      gitlabCommitRef?: string;
      bitbucketCommitRef?: string;
      githubCommitMessage?: string;
      gitlabCommitMessage?: string;
      bitbucketCommitMessage?: string;
    };
  }
  const data = await call<{ deployments: Raw[] }>(
    token,
    `/v6/deployments?${params.toString()}`,
  );
  return (data.deployments ?? []).map((d) => ({
    uid: d.uid,
    name: d.name,
    url: d.url,
    state: d.state ?? d.readyState ?? 'QUEUED',
    created: d.created,
    target: d.target,
    inspectorUrl: d.inspectorUrl,
    branch:
      d.meta?.githubCommitRef ?? d.meta?.gitlabCommitRef ?? d.meta?.bitbucketCommitRef,
    commitMessage:
      d.meta?.githubCommitMessage ??
      d.meta?.gitlabCommitMessage ??
      d.meta?.bitbucketCommitMessage,
  }));
}

/** Fetch a single deployment's current state (for polling a build to done). */
export async function getDeployment(
  token: string,
  id: string,
  teamId?: string,
): Promise<{ state: DeployState; url: string }> {
  const d = await call<{
    readyState?: DeployState;
    status?: DeployState;
    url: string;
  }>(token, `/v13/deployments/${encodeURIComponent(id)}${teamQuery(teamId)}`);
  return { state: (d.status ?? d.readyState ?? 'QUEUED') as DeployState, url: d.url };
}

/**
 * Fetch a deployment's build logs as plain text (stdout/stderr/command lines).
 * Used to diagnose a failed build for the auto-fix loop.
 */
export async function getDeploymentLogs(
  token: string,
  id: string,
  teamId?: string,
): Promise<string> {
  const sep = teamId ? '&' : '?';
  interface Event {
    type?: string;
    text?: string;
    payload?: { text?: string } | string;
  }
  const events = await call<Event[] | { events?: Event[] }>(
    token,
    `/v3/deployments/${encodeURIComponent(id)}/events${teamQuery(teamId)}${sep}limit=1000`,
  );
  const list = Array.isArray(events) ? events : events.events ?? [];
  const lines: string[] = [];
  for (const e of list) {
    const text =
      e.text ??
      (typeof e.payload === 'string' ? e.payload : e.payload?.text) ??
      '';
    if (text) lines.push(text.replace(/\n$/, ''));
  }
  return lines.join('\n');
}

export async function listEnv(
  token: string,
  projectId: string,
  teamId?: string,
): Promise<VercelEnvVar[]> {
  const data = await call<{ envs: VercelEnvVar[] }>(
    token,
    `/v9/projects/${encodeURIComponent(projectId)}/env${teamQuery(teamId)}`,
  );
  return data.envs ?? [];
}

/**
 * Trigger a new deployment of a git-connected project from a branch. Returns
 * the new deployment's id + url. Requires the project to be linked to a git
 * repo (so we can resolve repoId).
 */
export async function createGitDeployment(
  token: string,
  opts: {
    project: VercelProject;
    ref: string;
    target?: 'production' | 'staging';
    teamId?: string;
  },
): Promise<{ id: string; url: string }> {
  const link = opts.project.link;
  if (!link?.type || !link.repoId) {
    throw new Error(
      `Project “${opts.project.name}” is not connected to a git repo, so it can’t be deployed from here.`,
    );
  }
  const body = {
    name: opts.project.name,
    project: opts.project.id,
    target: opts.target ?? 'production',
    gitSource: {
      type: link.type,
      repoId: link.repoId,
      ref: opts.ref,
    },
  };
  const data = await call<{ id: string; url: string }>(
    token,
    `/v13/deployments${teamQuery(opts.teamId)}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  return { id: data.id, url: data.url };
}

/**
 * Re-run an existing deployment with the exact same source. Vercel resolves the
 * git source / files from the referenced deployment, so this works for both
 * git-linked and CLI deployments.
 */
export async function redeployDeployment(
  token: string,
  opts: {
    deployment: VercelDeployment;
    target?: 'production' | 'staging';
    teamId?: string;
  },
): Promise<{ id: string; url: string }> {
  const body = {
    name: opts.deployment.name,
    deploymentId: opts.deployment.uid,
    target: opts.target ?? opts.deployment.target ?? undefined,
    meta: { action: 'redeploy' },
  };
  const data = await call<{ id: string; url: string }>(
    token,
    `/v13/deployments${teamQuery(opts.teamId)}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  return { id: data.id, url: data.url };
}

/** Decode a base64 string (file bytes from `collectDeployFiles`) to bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Upload one file's bytes to Vercel's content-addressed store. Vercel keys it
 * by the SHA1 digest, so re-uploading an identical file is a cheap no-op. This
 * must precede the file-based deployment that references the same SHAs.
 */
export async function uploadFile(
  token: string,
  bytes: Uint8Array,
  sha: string,
  teamId?: string,
): Promise<void> {
  if (!token) throw new Error('Add a Vercel token in Settings → Integrations.');
  const res = await httpFetch(`${API}/v2/files${teamQuery(teamId)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'x-vercel-digest': sha,
    },
    // Uint8Array is a valid fetch body; cast around the DOM lib's generic
    // ArrayBufferView typing mismatch.
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || res.statusText;
    try {
      message = JSON.parse(text)?.error?.message ?? message;
    } catch {
      /* not JSON */
    }
    throw new Error(`Vercel upload ${res.status}: ${message}`);
  }
}

export interface DeployManifestFile {
  /** Path relative to the deployment root (forward slashes). */
  file: string;
  sha: string;
  size: number;
}

/**
 * Create a deployment straight from local files (the `vercel deploy` flow) —
 * no git connection required. Vercel finds or creates a project by `name`,
 * builds the uploaded source, and returns the new deployment. All referenced
 * SHAs must already be uploaded via {@link uploadFile}.
 */
export async function createFileDeployment(
  token: string,
  opts: {
    name: string;
    files: DeployManifestFile[];
    target?: 'production';
    framework?: string | null;
    teamId?: string;
  },
): Promise<{ id: string; url: string }> {
  const body: Record<string, unknown> = {
    name: opts.name,
    files: opts.files,
    projectSettings: { framework: opts.framework ?? null },
  };
  if (opts.target) body.target = opts.target;
  const data = await call<{ id: string; url: string }>(
    token,
    `/v13/deployments${teamQuery(opts.teamId)}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  return { id: data.id, url: data.url };
}

/** Cancel an in-progress deployment (BUILDING / QUEUED / INITIALIZING). */
export async function cancelDeployment(
  token: string,
  deploymentId: string,
  teamId?: string,
): Promise<void> {
  await call(
    token,
    `/v12/deployments/${encodeURIComponent(deploymentId)}/cancel${teamQuery(teamId)}`,
    { method: 'PATCH' },
  );
}

/**
 * Promote a finished deployment to be the current production deployment
 * (instant rollback / roll-forward). Requires the deployment to belong to the
 * given project.
 */
export async function promoteDeployment(
  token: string,
  projectId: string,
  deploymentId: string,
  teamId?: string,
): Promise<void> {
  await call(
    token,
    `/v10/projects/${encodeURIComponent(projectId)}/promote/${encodeURIComponent(
      deploymentId,
    )}${teamQuery(teamId)}`,
    { method: 'POST' },
  );
}
