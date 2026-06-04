import { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpCircle,
  Ban,
  CheckCircle2,
  Cloud,
  ExternalLink,
  FileText,
  GitBranch,
  KeyRound,
  Loader2,
  Plug,
  RefreshCw,
  Rocket,
  RotateCcw,
  ShieldCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  deployments as demoDeployments,
  envVars as demoEnvVars,
  providers,
  type Deployment,
} from '../../workbench/appData';
import { toast } from '../../shell/toast';
import { useIntegrations } from '../../workbench/integrationsStore';
import { useProject } from '../../workbench/projectStore';
import { useWorkbench } from '../../workbench/store';
import { basename } from '../../lib/fs';
import { toProjectName } from '../../lib/deployLocal';
import { deployWithAutoFix } from '../../lib/deployHeal';
import {
  cancelDeployment,
  createGitDeployment,
  isInProgress,
  listDeployments,
  listEnv,
  listProjects,
  promoteDeployment,
  redeployDeployment,
  verifyToken,
  type DeployState,
  type VercelDeployment,
  type VercelEnvVar,
  type VercelProject,
} from '../../lib/vercel';

function demoStatusPill(status: Deployment['status']): JSX.Element {
  if (status === 'ready')
    return <span className="pill pill--ok"><CheckCircle2 size={12} /> Ready</span>;
  if (status === 'building')
    return <span className="pill pill--accent"><Loader2 size={12} className="spin" /> Building</span>;
  return <span className="pill pill--danger"><XCircle size={12} /> Error</span>;
}

function liveStatusPill(state: DeployState): JSX.Element {
  if (state === 'READY')
    return <span className="pill pill--ok"><CheckCircle2 size={12} /> Ready</span>;
  if (state === 'ERROR' || state === 'CANCELED')
    return <span className="pill pill--danger"><XCircle size={12} /> {state === 'ERROR' ? 'Error' : 'Canceled'}</span>;
  return (
    <span className="pill pill--accent">
      <Loader2 size={12} className="spin" /> {state.charAt(0) + state.slice(1).toLowerCase()}
    </span>
  );
}

function ago(ms: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DeploymentsPage(): JSX.Element {
  const token = useIntegrations((s) => s.vercelToken);
  const teamId = useIntegrations((s) => s.vercelTeamId);
  const projectId = useIntegrations((s) => s.vercelProjectId);
  const setProjectId = useIntegrations((s) => s.setVercelProjectId);
  const branch = useProject((s) => s.branch);
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const setActiveActivity = useWorkbench((s) => s.setActiveActivity);

  const connected = token.length > 0;

  const [username, setUsername] = useState<string | null>(null);
  const [projects, setProjects] = useState<VercelProject[]>([]);
  const [rows, setRows] = useState<VercelDeployment[]>([]);
  const [envs, setEnvs] = useState<VercelEnvVar[]>([]);
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [folderDeploying, setFolderDeploying] = useState(false);
  const [folderProgress, setFolderProgress] = useState('');
  const [autoFix, setAutoFix] = useState(true);
  const [folderLog, setFolderLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** uid of the deployment whose row action is currently running. */
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const anyInProgress = rows.some((d) => isInProgress(d.state));

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [user, projectList] = await Promise.all([
        verifyToken(token),
        listProjects(token, teamId || undefined),
      ]);
      setUsername(user.username);
      setProjects(projectList);

      const activeProjectId =
        projectId && projectList.some((p) => p.id === projectId)
          ? projectId
          : projectList[0]?.id ?? '';
      if (activeProjectId !== projectId) setProjectId(activeProjectId);

      const [deps, env] = await Promise.all([
        listDeployments(token, { projectId: activeProjectId || undefined, teamId: teamId || undefined }),
        activeProjectId ? listEnv(token, activeProjectId, teamId || undefined) : Promise.resolve([]),
      ]);
      setRows(deps);
      setEnvs(env);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [token, teamId, projectId, setProjectId]);

  useEffect(() => {
    if (connected) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, token, teamId, projectId]);

  // While anything is building/queued, poll so the live status advances on its
  // own (otherwise a just-triggered deploy is stuck showing "Queued" forever).
  useEffect(() => {
    if (!connected || !anyInProgress) return;
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [connected, anyInProgress, refresh]);

  const runRowAction = async (
    uid: string,
    action: () => Promise<void>,
    okMessage: string,
  ) => {
    setBusyUid(uid);
    try {
      await action();
      toast(okMessage, 'success');
      setTimeout(() => void refresh(), 1200);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action failed', 'error');
    } finally {
      setBusyUid(null);
    }
  };

  const redeploy = (d: VercelDeployment) =>
    runRowAction(
      d.uid,
      async () => {
        await redeployDeployment(token, { deployment: d, teamId: teamId || undefined });
      },
      `Re-deploying ${d.name}…`,
    );

  const cancel = (d: VercelDeployment) =>
    runRowAction(
      d.uid,
      () => cancelDeployment(token, d.uid, teamId || undefined),
      `Canceled ${d.name}`,
    );

  const promote = (d: VercelDeployment) => {
    if (!projectId) {
      toast('Select a project first', 'warn');
      return;
    }
    void runRowAction(
      d.uid,
      () => promoteDeployment(token, projectId, d.uid, teamId || undefined),
      `Promoted ${d.url} to production`,
    );
  };

  const newDeployment = async () => {
    if (!connected) {
      setActiveActivity('settings');
      return;
    }
    if (!selectedProject) {
      toast('Select a project first', 'warn');
      return;
    }
    setDeploying(true);
    try {
      const ref = selectedProject.link?.productionBranch || branch || 'main';
      const { url } = await createGitDeployment(token, {
        project: selectedProject,
        ref,
        target: 'production',
        teamId: teamId || undefined,
      });
      toast(`Deploying ${selectedProject.name} @ ${ref} → ${url}`, 'success');
      setTimeout(() => void refresh(), 1500);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Deploy failed', 'error');
    } finally {
      setDeploying(false);
    }
  };

  /** Deploy the folder currently open in the IDE as its own Vercel project. */
  const deployFolder = async () => {
    if (!connected) {
      setActiveActivity('settings');
      return;
    }
    if (!workspaceRoot) {
      toast('Open a folder first (File → Open Folder)', 'warn');
      return;
    }
    const name = toProjectName(basename(workspaceRoot));
    setFolderDeploying(true);
    setFolderProgress('Scanning…');
    setFolderLog([`Deploying "${name}"${autoFix ? ' with auto-fix' : ''}…`]);
    const log = (line: string) => setFolderLog((prev) => [...prev, line]);
    try {
      const result = await deployWithAutoFix({
        token,
        root: workspaceRoot,
        name,
        teamId: teamId || undefined,
        target: 'production',
        autoFix,
        onPhase: (phase) => setFolderProgress(phase),
        onLog: log,
      });
      if (result.state === 'READY') {
        const fixed = result.fixes.reduce((n, f) => n + f.length, 0);
        toast(
          `Deployed ${name} → ${result.url}${fixed ? ` (auto-fixed ${fixed} file${fixed === 1 ? '' : 's'})` : ''}`,
          'success',
        );
      } else {
        toast(`Deploy ${result.state.toLowerCase()} after ${result.attempts} attempt(s). See deploy log.`, 'error');
      }
      setTimeout(() => void refresh(), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Folder deploy failed';
      log(`Error: ${msg}`);
      toast(msg, 'error');
    } finally {
      setFolderDeploying(false);
      setFolderProgress('');
    }
  };

  return (
    <div className="apppage">
      <div className="apppage__header">
        <div>
          <h1 className="apppage__title">
            <Rocket size={20} strokeWidth={1.8} /> Deployments
          </h1>
          <p className="apppage__subtitle">
            {connected
              ? `Connected to Vercel as ${username ?? '…'}${teamId ? ' (team)' : ''}.`
              : 'One-click deploys, preview environments, rollbacks, SSL, domains.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {connected && projects.length > 0 && (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              style={{ fontSize: 12, maxWidth: 220 }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {connected && (
            <button
              className="btn-outline"
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              title="Refresh deployments"
            >
              <RefreshCw size={14} className={loading ? 'spin' : undefined} />
            </button>
          )}
          {connected && selectedProject && (
            <button
              className="btn-outline"
              type="button"
              onClick={() => void newDeployment()}
              disabled={deploying || folderDeploying}
              title={`Redeploy the linked project "${selectedProject.name}" from git`}
            >
              {deploying ? <Loader2 size={14} className="spin" /> : <GitBranch size={14} />}
              {deploying ? 'Deploying…' : 'Redeploy Project'}
            </button>
          )}
          {connected && (
            <label
              title="On a failed build, read the logs and let the AI patch your files, then redeploy (up to 3 tries)."
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                color: 'var(--color-text-dim)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={autoFix}
                onChange={(e) => setAutoFix(e.target.checked)}
                disabled={folderDeploying}
              />
              <Wrench size={12} /> Auto-fix
            </label>
          )}
          <button
            className="btn-accent"
            type="button"
            onClick={() => void deployFolder()}
            disabled={folderDeploying || deploying}
            title={
              workspaceRoot
                ? `Deploy the open folder (${basename(workspaceRoot)}) to Vercel`
                : 'Open a folder to deploy it'
            }
          >
            {folderDeploying ? <Loader2 size={15} className="spin" /> : <Rocket size={15} />}
            {!connected
              ? 'Connect Vercel'
              : folderDeploying
                ? folderProgress || 'Deploying…'
                : 'Deploy This Folder'}
          </button>
        </div>
      </div>

      <div className="apppage__body">
        {!connected && (
          <div className="appcard" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Plug size={18} color="var(--color-accent)" />
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--color-text)' }}>Connect Vercel for live deployments</div>
              <div className="dim">
                Add a Vercel access token in Settings → Integrations to see and trigger real deploys.
                Showing sample data below.
              </div>
            </div>
            <button className="btn-outline" type="button" onClick={() => setActiveActivity('settings')}>
              Open Settings
            </button>
          </div>
        )}

        {error && (
          <div className="appcard" style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
            {error}
          </div>
        )}

        {folderLog.length > 0 && (
          <div className="appcard" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderBottom: '1px solid rgba(var(--color-overlay-rgb), 0.06)',
              }}
            >
              {folderDeploying ? (
                <Loader2 size={13} className="spin" color="var(--color-accent)" />
              ) : (
                <Rocket size={13} color="var(--color-accent)" />
              )}
              <strong style={{ fontSize: 12 }}>Deploy log</strong>
              {folderDeploying && folderProgress && (
                <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{folderProgress}</span>
              )}
              <button
                className="icon-btn"
                type="button"
                title="Clear log"
                style={{ marginLeft: 'auto' }}
                onClick={() => setFolderLog([])}
                disabled={folderDeploying}
              >
                <XCircle size={13} />
              </button>
            </div>
            <pre
              style={{
                margin: 0,
                padding: '10px 12px',
                maxHeight: 220,
                overflow: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                lineHeight: 1.5,
                color: 'var(--color-text)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {folderLog.join('\n')}
            </pre>
          </div>
        )}

        <div className="appcard" style={{ padding: 0, overflow: 'hidden' }}>
          {connected && loading && rows.length === 0 ? (
            <div style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-dim)' }}>
              <Loader2 size={14} className="spin" /> Loading deployments…
            </div>
          ) : connected ? (
            <table className="apptable">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Branch</th>
                  <th>Commit</th>
                  <th>Target</th>
                  <th>URL</th>
                  <th>Age</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ color: 'var(--color-text-dim)', padding: 16 }}>
                      No deployments yet for this project.
                    </td>
                  </tr>
                )}
                {rows.map((d) => (
                  <tr key={d.uid}>
                    <td>{liveStatusPill(d.state)}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <GitBranch size={12} color="var(--color-text-dim)" />
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{d.branch ?? '—'}</span>
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text)' }}>{d.commitMessage ?? '—'}</td>
                    <td>
                      <span className={d.target === 'production' ? 'pill pill--accent' : 'pill'}>
                        {d.target ?? 'preview'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      <a
                        href={`https://${d.url}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--color-accent-bright)', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                      >
                        {d.url}
                        <ExternalLink size={10} />
                      </a>
                    </td>
                    <td style={{ color: 'var(--color-text-dim)' }}>{ago(d.created)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {busyUid === d.uid ? (
                          <Loader2 size={14} className="spin" style={{ color: 'var(--color-text-dim)' }} />
                        ) : (
                          <>
                            {isInProgress(d.state) ? (
                              <button
                                className="icon-btn"
                                type="button"
                                title="Cancel deployment"
                                onClick={() => void cancel(d)}
                              >
                                <Ban size={14} />
                              </button>
                            ) : (
                              <>
                                <button
                                  className="icon-btn"
                                  type="button"
                                  title="Redeploy"
                                  onClick={() => void redeploy(d)}
                                >
                                  <RotateCcw size={14} />
                                </button>
                                {d.state === 'READY' && (
                                  <button
                                    className="icon-btn"
                                    type="button"
                                    title="Promote to production"
                                    onClick={() => promote(d)}
                                  >
                                    <ArrowUpCircle size={14} />
                                  </button>
                                )}
                              </>
                            )}
                            {d.inspectorUrl && (
                              <a
                                className="icon-btn"
                                href={d.inspectorUrl}
                                target="_blank"
                                rel="noreferrer"
                                title="View build logs"
                              >
                                <FileText size={14} />
                              </a>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="apptable">
              <thead>
                <tr>
                  <th>Status</th><th>Branch</th><th>Commit</th><th>Env</th><th>URL</th><th>Duration</th><th>Age</th>
                </tr>
              </thead>
              <tbody>
                {demoDeployments.map((d) => (
                  <tr key={d.id}>
                    <td>{demoStatusPill(d.status)}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <GitBranch size={12} color="var(--color-text-dim)" />
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{d.branch}</span>
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text)' }}>{d.commit}</td>
                    <td>
                      <span className={d.env === 'production' ? 'pill pill--accent' : 'pill'}>{d.env}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{d.url}</td>
                    <td>{d.duration}</td>
                    <td style={{ color: 'var(--color-text-dim)' }}>{d.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="grid grid-3">
          <div className="appcard">
            <h3 className="appcard__title"><Cloud size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Providers</h3>
            {providers.map((p) => (
              <div key={p.id} className="list-row">
                <span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{p.label.slice(0, 2)}</span>
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: 'var(--color-text)' }}>
                    {p.label}
                    {p.id === 'vercel' && connected && (
                      <CheckCircle2 size={11} style={{ color: 'var(--color-ok)', marginLeft: 6, verticalAlign: -1 }} />
                    )}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{p.desc}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="appcard">
            <h3 className="appcard__title"><KeyRound size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Environment Variables</h3>
            {connected ? (
              envs.length === 0 ? (
                <p className="muted">No environment variables for this project.</p>
              ) : (
                envs.slice(0, 20).map((v) => (
                  <div className="list-row" key={`${v.key}-${v.target.join()}`} style={{ fontSize: 12 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>{v.key}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-dim)' }}>
                      {v.target.join(', ')}
                    </span>
                  </div>
                ))
              )
            ) : (
              demoEnvVars.map((v) => (
                <div className="list-row" key={v.key} style={{ fontSize: 12 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>{v.key}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{v.preview}</span>
                </div>
              ))
            )}
          </div>

          <div className="appcard">
            <h3 className="appcard__title"><ShieldCheck size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-ok)' }} />SSL &amp; CI/CD</h3>
            <p className="muted" style={{ lineHeight: 1.6 }}>
              Auto-provisioned certificates, DDoS protection, and per-deploy preview URLs are on
              by default. Builds trigger on every push; failed deploys roll back automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
