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
    branch:
      d.meta?.githubCommitRef ?? d.meta?.gitlabCommitRef ?? d.meta?.bitbucketCommitRef,
    commitMessage:
      d.meta?.githubCommitMessage ??
      d.meta?.gitlabCommitMessage ??
      d.meta?.bitbucketCommitMessage,
  }));
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
