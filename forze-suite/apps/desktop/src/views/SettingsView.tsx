import { useState } from 'react';
import {
  Settings,
  KeyRound,
  Palette,
  FolderOpen,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Rocket,
} from 'lucide-react';
import { AnthropicProvider, GeminiProvider } from '@forze/agents';
import { pickFolder } from '../lib/dialog';
import { THEMES, useTheme, type ThemeId } from '../theme/themeStore';
import { useAgents } from '../workbench/agentStore';
import { usesBuiltInKey } from '../workbench/aiConfig';
import { openWorkspace } from '../workbench/actions';
import { useProject } from '../workbench/projectStore';
import { useSocial } from '../workbench/socialStore';
import { useIntegrations } from '../workbench/integrationsStore';
import { verifyToken } from '../lib/vercel';
import { toast } from '../shell/toast';

export default function SettingsView(): JSX.Element {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const apiKeys = useAgents((s) => s.apiKeys);
  const setApiKey = useAgents((s) => s.setApiKey);
  const geminiBuiltIn = usesBuiltInKey(GeminiProvider.id, apiKeys);
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const sessionToken = useSocial((s) => s.sessionToken);
  const setSessionToken = useSocial((s) => s.setSessionToken);

  return (
    <section className="panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Settings size={18} strokeWidth={1.6} />
        <h2 style={{ margin: 0 }}>Settings</h2>
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
          onChange={(v) => setApiKey(GeminiProvider.id, v)}
        />
        <KeyField
          label="Anthropic (Claude)"
          link="https://console.anthropic.com/settings/keys"
          placeholder="sk-ant-…"
          note="Optional · bring your own key"
          value={apiKeys[AnthropicProvider.id] ?? ''}
          onChange={(v) => setApiKey(AnthropicProvider.id, v)}
        />
      </div>

      <VercelCard />

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <KeyRound size={13} strokeWidth={1.8} />
          <strong style={{ fontSize: 13 }}>Social broker</strong>
        </div>
        <p className="dim">
          Supabase session token (not persisted to disk; resets on quit).
        </p>
        <input
          type="password"
          value={sessionToken}
          onChange={(e) => setSessionToken(e.target.value.trim())}
          placeholder="eyJhbGciOi…"
          style={{ width: '100%' }}
        />
      </div>
    </section>
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
        <div style={{ width: 8, background: palette.rail }} />
        <div style={{ width: 36, background: palette.sidebar }} />
        <div style={{ flex: 1, background: palette.editor }} />
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
};
