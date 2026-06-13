import { useEffect, useState } from 'react';
import {
  CalendarClock,
  Check,
  Copy,
  GitCommit as GitCommitIcon,
  Hammer,
  Linkedin,
  Loader2,
  LogOut,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { log as gitLog, type GitCommit } from '../../lib/git';
import { useProject } from '../../workbench/projectStore';
import { useIntegrations } from '../../workbench/integrationsStore';
import {
  LINKEDIN_LIMIT,
  connectLinkedin,
  disconnectLinkedin,
  linkedinConfigured,
  postToLinkedin,
} from '../../lib/publish';
import { toast } from '../../shell/toast';
import { generateText } from '../../lib/ai';
import { useBipSchedule } from '../../workbench/bipScheduleStore';
import BipScheduleBoard from './BipScheduleBoard';

/**
 * Build in Public — turn the commits you just shipped into a ready-to-post
 * LinkedIn update, then post it now or schedule it. Carved out of the retired
 * Ad Studio page so the commits-to-LinkedIn workflow keeps its own home.
 */
export default function BuildInPublicPage(): JSX.Element {
  // ---- commits / generation ----
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const isGitRepo = useProject((s) => s.isGitRepo);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const [loadingCommits, setLoadingCommits] = useState(false);
  // Build-in-Public targets LinkedIn (the only connected publishing channel).
  const bipPlatform = 'LinkedIn';
  const [bipBusy, setBipBusy] = useState(false);
  const [bipPost, setBipPost] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const scheduleBipPost = useBipSchedule((s) => s.schedule);

  const scheduleBip = () => {
    const text = bipPost.trim();
    if (!text) return;
    const when = Date.parse(scheduleAt);
    if (Number.isNaN(when)) {
      toast('Pick a valid schedule time', 'error');
      return;
    }
    if (when <= Date.now()) {
      toast('Pick a time in the future', 'error');
      return;
    }
    if (text.length > LINKEDIN_LIMIT) {
      toast('Post is too long for LinkedIn', 'error');
      return;
    }
    scheduleBipPost(text, when);
    setScheduleAt('');
    toast('Scheduled — it posts automatically while the IDE is open', 'success');
  };

  // ---- LinkedIn publishing ----
  const integrations = useIntegrations(); // subscribe so connect/expiry re-renders
  const [publishing, setPublishing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [lkConfigured, setLkConfigured] = useState(true);
  useEffect(() => {
    void linkedinConfigured().then(setLkConfigured);
  }, []);

  const connected =
    integrations.linkedinToken !== '' &&
    (integrations.linkedinExpiresAt === 0 || integrations.linkedinExpiresAt > Date.now());

  const connect = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      await connectLinkedin();
      toast('LinkedIn connected', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'LinkedIn login failed', 'error');
    } finally {
      setConnecting(false);
    }
  };

  const publish = async () => {
    if (publishing) return;
    const text = bipPost.trim();
    if (!text) return;
    if (!connected) {
      void connect();
      return;
    }
    setPublishing(true);
    try {
      const { url } = await postToLinkedin(text);
      toast('Posted to LinkedIn 🎉', 'success');
      if (url) {
        try {
          const { open } = await import('@tauri-apps/plugin-shell');
          await open(url);
        } catch {
          window.open(url, '_blank');
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Publish failed', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const loadCommits = async () => {
    if (!workspaceRoot || !isGitRepo) {
      setCommits([]);
      setCommitsError(
        workspaceRoot ? 'This folder is not a git repository.' : 'Open a project folder to read commits.',
      );
      return;
    }
    setLoadingCommits(true);
    setCommitsError(null);
    try {
      const list = await gitLog(workspaceRoot, 15);
      setCommits(list);
      // Default to the single latest commit selected.
      setSelected(new Set(list.slice(0, 1).map((c) => c.hash)));
    } catch (err) {
      setCommitsError(err instanceof Error ? err.message : 'Failed to read git log.');
    } finally {
      setLoadingCommits(false);
    }
  };

  useEffect(() => {
    void loadCommits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceRoot, isGitRepo]);

  const toggleCommit = (hash: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  };

  const generatePost = async () => {
    if (bipBusy) return;
    const chosen = commits.filter((c) => selected.has(c.hash));
    const pool = chosen.length ? chosen : commits.slice(0, 3);
    if (pool.length === 0) {
      toast('No commits to post about', 'error');
      return;
    }
    setBipBusy(true);
    setBipPost('');
    try {
      const changelog = pool
        .map((c) => `- ${c.subject}${c.body ? `\n  ${c.body.replace(/\n+/g, ' ').slice(0, 200)}` : ''}`)
        .join('\n');
      const text = await generateText(
        `I'm building in public. Here are the commits I just shipped:\n\n${changelog}\n\n` +
          `Write a single ${bipPlatform} post sharing this progress. ` +
          'Translate the technical commits into the user-facing benefit / story — what got better and why anyone should care. ' +
          'Authentic builder voice, first person, concrete, a little energy. ' +
          'Do NOT paste raw commit messages or hashes. No markdown headings. ' +
          'Match the length and conventions of the platform; add 1–3 relevant hashtags only if the platform expects them. Return only the post text.',
        {
          system:
            'You are an indie founder who is great at building in public. You turn shipped work ' +
            'into engaging, honest progress updates that build an audience.',
          maxTokens: 700,
          onDelta: (d) => setBipPost((prev) => prev + d),
        },
      );
      setBipPost(text);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Generation failed', 'error');
    } finally {
      setBipBusy(false);
    }
  };

  return (
    <div className="apppage">
      <div className="apppage__header">
        <div>
          <h1 className="apppage__title">
            <Hammer size={20} strokeWidth={1.8} /> Build in Public
          </h1>
          <p className="apppage__subtitle">
            Turn the commits you just shipped into a ready-to-post update — post it to LinkedIn now or
            schedule it for later.
          </p>
        </div>
        <button
          className="btn-outline"
          type="button"
          onClick={() => void loadCommits()}
          disabled={loadingCommits}
          title="Reload recent commits"
        >
          {loadingCommits ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      <div className="apppage__body">
        <div className="appcard">
          {commitsError ? (
            <div className="dim">{commitsError}</div>
          ) : commits.length === 0 ? (
            <div className="dim">{loadingCommits ? 'Reading commits…' : 'No commits found.'}</div>
          ) : (
            <>
              <p className="dim" style={{ margin: '0 0 10px', fontSize: 'var(--font-size-sm)' }}>
                Pick the commits to announce — the agent turns them into a ready-to-post update.
              </p>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  maxHeight: 220,
                  overflowY: 'auto',
                  marginBottom: 14,
                }}
              >
                {commits.map((c) => {
                  const on = selected.has(c.hash);
                  return (
                    <button
                      key={c.hash}
                      type="button"
                      onClick={() => toggleCommit(c.hash)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        background: on ? 'rgba(var(--color-accent-rgb), 0.12)' : 'transparent',
                        border: on
                          ? '1px solid rgba(var(--color-accent-rgb), 0.4)'
                          : '1px solid var(--glass-border)',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      <span
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: on ? 'var(--color-accent)' : 'transparent',
                          border: on ? 'none' : '1px solid var(--color-border)',
                          color: 'var(--color-on-accent)',
                        }}
                      >
                        {on && <Check size={12} />}
                      </span>
                      <GitCommitIcon size={13} color="var(--color-text-dim)" style={{ flexShrink: 0 }} />
                      <span
                        style={{
                          flex: 1,
                          color: 'var(--color-text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.subject}
                      </span>
                      <code className="dim" style={{ fontSize: 'var(--font-size-xs)', flexShrink: 0 }}>
                        {c.short}
                      </code>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span
                  className="pill"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  title="Build-in-Public posts target LinkedIn"
                >
                  <Linkedin size={12} /> LinkedIn
                </span>
                <button
                  className="btn-accent"
                  type="button"
                  onClick={() => void generatePost()}
                  disabled={bipBusy || selected.size === 0}
                >
                  {bipBusy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                  {bipBusy ? 'Writing…' : 'Generate post'}
                </button>
              </div>

              {bipPost && (
                <div className="appcard" style={{ marginTop: 14, background: 'var(--color-bg-elevated)' }}>
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      color: 'var(--color-text)',
                      fontSize: 'var(--font-size-sm)',
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    {bipPost}
                  </pre>

                  <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    {connected ? (
                      <button
                        className="btn-accent"
                        type="button"
                        onClick={() => void publish()}
                        disabled={publishing}
                      >
                        {publishing ? <Loader2 size={14} className="spin" /> : <Linkedin size={14} />}
                        {publishing ? 'Posting…' : 'Post to LinkedIn'}
                      </button>
                    ) : (
                      <button
                        className="btn-accent"
                        type="button"
                        onClick={() => void connect()}
                        disabled={connecting || !lkConfigured}
                        title={
                          lkConfigured
                            ? 'Log in with LinkedIn'
                            : 'Set LINKEDIN_CLIENT_ID / SECRET in .env first'
                        }
                      >
                        {connecting ? <Loader2 size={14} className="spin" /> : <Linkedin size={14} />}
                        {connecting ? 'Connecting…' : 'Connect LinkedIn'}
                      </button>
                    )}
                    {connected && (
                      <button
                        className="btn-outline"
                        type="button"
                        title="Disconnect LinkedIn"
                        onClick={() => {
                          disconnectLinkedin();
                          toast('LinkedIn disconnected', 'success');
                        }}
                      >
                        <LogOut size={14} /> Disconnect
                      </button>
                    )}
                    <span style={{ flex: 1 }} />
                    <button
                      className="btn-outline"
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(bipPost).then(() => toast('Post copied', 'success'));
                      }}
                    >
                      <Copy size={14} /> Copy
                    </button>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      marginTop: 10,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <input
                      type="datetime-local"
                      value={scheduleAt}
                      onChange={(e) => setScheduleAt(e.target.value)}
                      style={{ padding: '4px 8px', fontSize: 'var(--font-size-sm)' }}
                    />
                    <button
                      className="btn-outline"
                      type="button"
                      onClick={scheduleBip}
                      disabled={!scheduleAt}
                      title="Queue this post to publish to LinkedIn later"
                    >
                      <CalendarClock size={14} /> Schedule
                    </button>
                    <span className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>
                      Scheduled posts publish automatically while the IDE is open.
                    </span>
                  </div>

                  {(() => {
                    const len = bipPost.trim().length;
                    const over = len > LINKEDIN_LIMIT;
                    return (
                      <div
                        className="dim"
                        style={{
                          marginTop: 6,
                          fontSize: 'var(--font-size-xs)',
                          color: over ? 'var(--color-danger)' : undefined,
                        }}
                      >
                        {len} / {LINKEDIN_LIMIT} characters{over ? ' — too long for LinkedIn' : ''}
                      </div>
                    );
                  })()}

                  {!lkConfigured && (
                    <div className="dim" style={{ marginTop: 8, fontSize: 'var(--font-size-xs)', lineHeight: 1.6 }}>
                      LinkedIn isn’t configured yet. Add <code>LINKEDIN_CLIENT_ID</code> and{' '}
                      <code>LINKEDIN_CLIENT_SECRET</code> to <code>.env</code>, and register{' '}
                      <code>http://localhost:8911/callback</code> as an authorized redirect URL in your
                      LinkedIn app (with the “Share on LinkedIn” + “Sign In with LinkedIn” products enabled).
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <BipScheduleBoard />
      </div>
    </div>
  );
}
