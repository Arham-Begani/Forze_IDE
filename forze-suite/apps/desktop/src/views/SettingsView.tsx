import { useState } from 'react';
import {
  Settings,
  KeyRound,
  Palette,
  FolderOpen,
  CheckCircle2,
  ExternalLink,
  Loader2,
  LogOut,
  Rocket,
  GitCommitHorizontal,
  ShieldCheck,
  UserCircle2,
  Zap,
} from 'lucide-react';
import { AnthropicProvider, GeminiProvider } from '@forze/agents';
import { pickFolder } from '../lib/dialog';
import { pendoTrack } from '../lib/pendoTrack';
import { THEMES, useTheme, type ThemeId } from '../theme/themeStore';
import { useAgents } from '../workbench/agentStore';
import { useAuth } from '../workbench/authStore';
import { useCloud } from '../workbench/cloudStore';
import { useAssistant } from '../workbench/assistantStore';
import { usesBuiltInKey } from '../workbench/aiConfig';
import { openWorkspace } from '../workbench/actions';
import { useProject } from '../workbench/projectStore';
import { useCommitGuard } from '../workbench/commitGuardStore';
import { useIntegrations } from '../workbench/integrationsStore';
import { supabase } from '../lib/supabase';
import { verifyToken } from '../lib/vercel';
import ToggleSwitch from '../shell/ToggleSwitch';
import { toast } from '../shell/toast';

export default function SettingsView(): JSX.Element {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const apiKeys = useAgents((s) => s.apiKeys);
  const setApiKey = useAgents((s) => s.setApiKey);
  const geminiBuiltIn = usesBuiltInKey(GeminiProvider.id, apiKeys);
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const email = useAuth((s) => s.email);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async (): Promise<void> => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      pendo.clearSession();
      // Drop the cloud mirror + chat so the next account starts clean. AuthGate's
      // onAuthStateChange returns the app to the locked sign-in screen.
      useCloud.getState().reset();
      useAssistant.getState().reset();
    } catch (err) {
      toast(
        `Sign out failed: ${err instanceof Error ? err.message : String(err)}`,
        'warn',
      );
      setSigningOut(false);
    }
  };

  return (
    <section className="panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Settings size={18} strokeWidth={1.6} />
        <h2 style={{ margin: 0 }}>Settings</h2>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <UserCircle2 size={13} strokeWidth={1.8} />
          <strong style={{ fontSize: 13 }}>Forze account</strong>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <p className="dim" style={{ margin: 0 }}>
            {email ? (
              <>
                Signed in as <strong>{email}</strong>
              </>
            ) : (
              'Signed in.'
            )}
            <br />
            Projects &amp; chats sync to the cloud — your code stays on this
            machine.
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {signingOut ? (
              <Loader2 size={13} strokeWidth={2} className="spin" />
            ) : (
              <LogOut size={13} strokeWidth={1.8} />
            )}
            Sign out
          </button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Palette size={13} strokeWidth={1.8} />
          <strong style={{ fontSize: 13 }}>Appearance</strong>
        </div>
        <p className="dim">Theme persists across reloads.</p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 8,
          }}
        >
          {THEMES.map((t) => (
            <ThemeSwatch
              key={t.id}
              id={t.id}
              label={t.label}
              description={t.description}
              active={theme === t.id}
              onSelect={() => setTheme(t.id)}
            />
          ))}
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FolderOpen size={13} strokeWidth={1.8} />
          <strong style={{ fontSize: 13 }}>Workspace</strong>
        </div>
        <p className="dim" style={{ fontFamily: 'var(--font-mono)' }}>
          {workspaceRoot ?? 'No folder open.'}
        </p>
        <div>
          <button
            type="button"
            onClick={async () => {
              const picked = await pickFolder();
              if (picked) await openWorkspace(picked);
            }}
          >
            {workspaceRoot ? 'Open another folder…' : 'Open folder…'}
          </button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <KeyRound size={13} strokeWidth={1.8} />
          <strong style={{ fontSize: 13 }}>Agent providers</strong>
        </div>
        <p className="dim">
          Gemini is the built-in general model — it works with no setup. Add
          your own key for higher limits, or a Claude key to use Anthropic.
          Keys are stored locally and you can switch per thread in the Agents
          panel.
        </p>
        <KeyField
          label="Google Gemini"
          link="https://aistudio.google.com/app/apikey"
          placeholder={geminiBuiltIn ? 'using built-in key — paste to override' : 'AIza…'}
          note={geminiBuiltIn ? 'Built-in · active' : undefined}
          value={apiKeys[GeminiProvider.id] ?? ''}
          onChange={(v) => {
            const prev = apiKeys[GeminiProvider.id] ?? '';
            setApiKey(GeminiProvider.id, v);
            if ((!prev && v) || (prev && !v)) {
              pendoTrack('ai_provider_key_configured', {
                provider_id: GeminiProvider.id,
                is_removal: !v,
              });
            }
          }}
        />
        <KeyField
          label="Anthropic (Claude)"
          link="https://console.anthropic.com/settings/keys"
          placeholder="sk-ant-…"
          note="Optional · bring your own key"
          value={apiKeys[AnthropicProvider.id] ?? ''}
          onChange={(v) => {
            const prev = apiKeys[AnthropicProvider.id] ?? '';
            setApiKey(AnthropicProvider.id, v);
            if ((!prev && v) || (prev && !v)) {
              pendoTrack('ai_provider_key_configured', {
                provider_id: AnthropicProvider.id,
                is_removal: !v,
              });
            }
          }}
        />
      </div>

      <CommitGuardCard />

      <VercelCard />

    </section>
  );
}

function CommitGuardCard(): JSX.Element {
  const autoCommit = useCommitGuard((s) => s.autoCommitEnabled);
  const threshold = useCommitGuard((s) => s.threshold);
  const setAutoCommit = useCommitGuard((s) => s.setAutoCommit);
  const setThreshold = useCommitGuard((s) => s.setThreshold);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <GitCommitHorizontal size={13} strokeWidth={1.8} />
        <strong style={{ fontSize: 13 }}>Commit Guard</strong>
      </div>
      <p className="dim">
        Automate and protect your commits. Auto-commit mirrors the toggle in the
        Source Control panel; both it and the always-on security review apply to
        changes you make and changes your agents make.
      </p>

      <SettingRow
        icon={<Zap size={13} strokeWidth={1.8} />}
        title="Auto-commit"
        desc="Stage and commit automatically after every N saved changes."
        control={
          <ToggleSwitch checked={autoCommit} onChange={setAutoCommit} label="Auto-commit" />
        }
      />
      {autoCommit && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 23,
            fontSize: 12,
          }}
        >
          <span className="dim">Commit every</span>
          <input
            type="number"
            min={1}
            max={100}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            style={{ width: 64 }}
          />
          <span className="dim">saved change{threshold === 1 ? '' : 's'}</span>
        </div>
      )}

      <SettingRow
        icon={<ShieldCheck size={13} strokeWidth={1.8} />}
        title="Security review"
        desc="Every commit's staged diff is scanned for leaked API keys and secrets, and blocked if one is found. Open the Security panel to review on demand."
        control={
          <span
            className="dim"
            style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            Always on
          </span>
        }
      />
    </div>
  );
}

function SettingRow({
  icon,
  title,
  desc,
  control,
}: {
  icon: JSX.Element;
  title: string;
  desc: string;
  control: JSX.Element;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ marginTop: 1, color: 'var(--color-text-muted)' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{title}</div>
        <p className="dim" style={{ margin: '2px 0 0' }}>
          {desc}
        </p>
      </div>
      {control}
    </div>
  );
}

function VercelCard(): JSX.Element {
  const token = useIntegrations((s) => s.vercelToken);
  const teamId = useIntegrations((s) => s.vercelTeamId);
  const setVercelToken = useIntegrations((s) => s.setVercelToken);
  const setVercelTeamId = useIntegrations((s) => s.setVercelTeamId);
  const [checking, setChecking] = useState(false);
  const [user, setUser] = useState<string | null>(null);

  const check = async () => {
    if (!token) return;
    setChecking(true);
    try {
      const u = await verifyToken(token);
      setUser(u.username);
      pendoTrack('vercel_integration_connected', {
        vercel_username: u.username,
        has_team_id: !!teamId,
      });
      toast(`Connected to Vercel as ${u.username}`, 'success');
    } catch (err) {
      setUser(null);
      toast(err instanceof Error ? err.message : 'Token check failed', 'error');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Rocket size={13} strokeWidth={1.8} />
        <strong style={{ fontSize: 13 }}>Integrations · Vercel</strong>
        {user && <CheckCircle2 size={12} style={{ color: 'var(--color-ok)' }} />}
      </div>
      <p className="dim">
        Add a Vercel access token to see and trigger real deployments from the
        Deployments page. Stored locally.
      </p>
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 4,
            fontSize: 12,
          }}
        >
          <span>Access token</span>
          <a
            href="https://vercel.com/account/tokens"
            target="_blank"
            rel="noreferrer"
            style={{
              marginLeft: 'auto',
              color: 'var(--color-accent-bright)',
              fontSize: 11,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              textDecoration: 'none',
            }}
          >
            get token
            <ExternalLink size={10} />
          </a>
        </div>
        <input
          type="password"
          value={token}
          onChange={(e) => setVercelToken(e.target.value)}
          placeholder="vercel_…"
          style={{ width: '100%' }}
        />
      </div>
      <div>
        <div style={{ fontSize: 12, marginBottom: 4 }}>Team ID (optional)</div>
        <input
          value={teamId}
          onChange={(e) => setVercelTeamId(e.target.value)}
          placeholder="team_… — leave blank for personal scope"
          style={{ width: '100%' }}
        />
      </div>
      <div>
        <button type="button" onClick={check} disabled={!token || checking}>
          {checking ? (
            <Loader2 size={12} className="spin" style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
          ) : null}
          {checking ? 'Checking…' : 'Test connection'}
        </button>
      </div>
    </div>
  );
}

function KeyField({
  label,
  link,
  placeholder,
  note,
  value,
  onChange,
}: {
  label: string;
  link: string;
  placeholder: string;
  note?: string;
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 4,
          fontSize: 12,
        }}
      >
        <span>{label}</span>
        {(value || note) && (
          <CheckCircle2 size={12} style={{ color: 'var(--color-ok)' }} />
        )}
        {note && !value && (
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
            {note}
          </span>
        )}
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          style={{
            marginLeft: 'auto',
            color: 'var(--color-accent-bright)',
            fontSize: 11,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            textDecoration: 'none',
          }}
        >
          get key
          <ExternalLink size={10} />
        </a>
      </div>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder={placeholder}
        style={{ width: '100%' }}
      />
    </div>
  );
}

function ThemeSwatch({
  id,
  label,
  description,
  active,
  onSelect,
}: {
  id: ThemeId;
  label: string;
  description: string;
  active: boolean;
  onSelect: () => void;
}): JSX.Element {
  const palette = SAMPLE_PALETTES[id];
  const accent = THEME_ACCENTS[id];
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        padding: 0,
        border: `2px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
        borderRadius: 8,
        overflow: 'hidden',
        background: palette.bg,
        textAlign: 'left',
        color: palette.fg,
        cursor: 'pointer',
        transition: 'border-color var(--motion-fast)',
      }}
    >
      <div style={{ display: 'flex', height: 50 }}>
        <div
          style={{
            width: 8,
            background: palette.rail,
            borderRight: `2px solid ${accent}`,
          }}
        />
        <div style={{ width: 36, background: palette.sidebar }} />
        <div
          style={{
            flex: 1,
            background: palette.editor,
            display: 'flex',
            alignItems: 'flex-end',
            padding: 6,
          }}
        >
          <span
            style={{
              width: 22,
              height: 5,
              borderRadius: 99,
              background: accent,
              boxShadow: `0 0 6px ${accent}`,
            }}
          />
        </div>
      </div>
      <div style={{ padding: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {active && (
            <CheckCircle2
              size={11}
              strokeWidth={2}
              style={{ color: 'var(--color-accent-bright)' }}
            />
          )}
          <strong style={{ fontSize: 12 }}>{label}</strong>
        </div>
        <p style={{ fontSize: 10, margin: '3px 0 0', opacity: 0.7, lineHeight: 1.4 }}>
          {description}
        </p>
      </div>
    </button>
  );
}

const SAMPLE_PALETTES: Record<ThemeId, {
  bg: string;
  fg: string;
  editor: string;
  sidebar: string;
  rail: string;
}> = {
  'forze-noir': {
    bg: '#111111',
    fg: '#ffffff',
    editor: '#050505',
    sidebar: '#090909',
    rail: '#050505',
  },
  'forze-daylight': {
    bg: '#e9eaee',
    fg: '#16191d',
    editor: '#ffffff',
    sidebar: '#f4f5f7',
    rail: '#ffffff',
  },
  'forze-midnight': {
    bg: '#12141a',
    fg: '#ffffff',
    editor: '#060709',
    sidebar: '#0a0c10',
    rail: '#060709',
  },
  'forze-graphite': {
    bg: '#1c1c1f',
    fg: '#ffffff',
    editor: '#0d0d0e',
    sidebar: '#101012',
    rail: '#0d0d0e',
  },
  'forze-indigo': {
    bg: '#111111',
    fg: '#ffffff',
    editor: '#050505',
    sidebar: '#090909',
    rail: '#050505',
  },
  'forze-emerald': {
    bg: '#111111',
    fg: '#ffffff',
    editor: '#050505',
    sidebar: '#090909',
    rail: '#050505',
  },
  'forze-amber': {
    bg: '#111111',
    fg: '#ffffff',
    editor: '#050505',
    sidebar: '#090909',
    rail: '#050505',
  },
  'forze-rose': {
    bg: '#111111',
    fg: '#ffffff',
    editor: '#050505',
    sidebar: '#090909',
    rail: '#050505',
  },
  'forze-violet': {
    bg: '#111111',
    fg: '#ffffff',
    editor: '#050505',
    sidebar: '#090909',
    rail: '#050505',
  },
  'forze-crimson': {
    bg: '#111111',
    fg: '#ffffff',
    editor: '#050505',
    sidebar: '#090909',
    rail: '#050505',
  },
};

// Accent swatch shown on each theme card (mirrors --color-accent per theme).
const THEME_ACCENTS: Record<ThemeId, string> = {
  'forze-noir': '#00d4ff',
  'forze-daylight': '#0e7490',
  'forze-midnight': '#00d4ff',
  'forze-graphite': '#00d4ff',
  'forze-indigo': '#6366f1',
  'forze-emerald': '#10b981',
  'forze-amber': '#f5a623',
  'forze-rose': '#fb7185',
  'forze-violet': '#a855f7',
  'forze-crimson': '#f43f5e',
};
