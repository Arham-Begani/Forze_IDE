import { useState } from 'react';
import { BarChart3, Loader2, Megaphone, PenSquare, Send, Sparkles } from 'lucide-react';
import { adChannels, ads, socialFormats, type Ad } from '../../workbench/appData';
import { toast } from '../../shell/toast';
import { generateText } from '../../lib/ai';

function statusPill(s: Ad['status']): JSX.Element {
  if (s === 'live') return <span className="pill pill--ok">live</span>;
  if (s === 'paused') return <span className="pill pill--warn">paused</span>;
  return <span className="pill">draft</span>;
}

interface Creative {
  headline: string;
  body: string;
  cta: string;
}

/** Strip ```json fences and parse a model response into ad creatives. */
function parseCreatives(raw: string): Creative[] {
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    const data = JSON.parse(cleaned);
    if (Array.isArray(data)) {
      return data
        .filter((d) => d && typeof d === 'object')
        .map((d) => ({
          headline: String(d.headline ?? d.title ?? '').trim(),
          body: String(d.body ?? d.text ?? d.description ?? '').trim(),
          cta: String(d.cta ?? d.button ?? 'Learn more').trim(),
        }))
        .filter((c) => c.headline || c.body);
    }
  } catch {
    /* fall through to plain-text */
  }
  return [];
}

export default function AdStudioPage(): JSX.Element {
  const [prompt, setPrompt] = useState('Launch announcement for our AI dashboard');
  const [generating, setGenerating] = useState(false);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [rawOutput, setRawOutput] = useState('');

  const [social, setSocial] = useState<{ format: string; text: string } | null>(null);
  const [socialBusy, setSocialBusy] = useState<string | null>(null);

  const generate = async () => {
    const brief = prompt.trim();
    if (!brief || generating) return;
    setGenerating(true);
    setCreatives([]);
    setRawOutput('');
    try {
      const text = await generateText(
        `Write 3 distinct ad creatives for this brief: "${brief}".\n` +
          'Return ONLY a JSON array of objects with keys "headline" (max 8 words), ' +
          '"body" (max 30 words), and "cta" (max 4 words). No prose, no code fences.',
        {
          system:
            'You are a senior performance-marketing copywriter. You write punchy, ' +
            'specific, benefit-led ad copy. Output valid JSON only.',
          maxTokens: 900,
        },
      );
      const parsed = parseCreatives(text);
      if (parsed.length > 0) setCreatives(parsed);
      else setRawOutput(text);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Generation failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const generateSocial = async (format: string) => {
    if (socialBusy) return;
    setSocialBusy(format);
    setSocial(null);
    try {
      const text = await generateText(
        `Write a ${format} for this product/announcement: "${prompt.trim() || 'our product'}". ` +
          'Make it ready to post — natural voice, no placeholders, include relevant hashtags only if the format expects them.',
        {
          system: 'You are a founder writing in an authentic, concise, high-signal voice.',
          maxTokens: 700,
        },
      );
      setSocial({ format, text });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Generation failed', 'error');
    } finally {
      setSocialBusy(null);
    }
  };

  return (
    <div className="apppage">
      <div className="apppage__header">
        <div>
          <h1 className="apppage__title">
            <Megaphone size={20} strokeWidth={1.8} /> Ad Studio
          </h1>
          <p className="apppage__subtitle">
            Generate, launch, and measure ads directly inside the IDE.
          </p>
        </div>
        <button
          className="btn-accent"
          type="button"
          onClick={() => toast('New campaign draft created', 'success')}
        >
          <Sparkles size={15} /> New Campaign
        </button>
      </div>

      <div className="apppage__body">
        <div className="appcard">
          <h3 className="appcard__title">
            <Sparkles size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />
            AI Ad Generator
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
              <PenSquare size={15} color="var(--color-text-dim)" style={{ position: 'absolute', left: 10 }} />
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void generate();
                }}
                style={{ width: '100%', paddingLeft: 32 }}
                placeholder="Describe the ad you want…"
              />
            </span>
            <button
              className="btn-accent"
              type="button"
              onClick={() => void generate()}
              disabled={generating || !prompt.trim()}
            >
              {generating ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
              {generating ? 'Generating…' : 'Generate'}
            </button>
          </div>

          {creatives.length > 0 ? (
            <div className="grid grid-3" style={{ marginTop: 14 }}>
              {creatives.map((c, i) => (
                <div className="appcard" key={i} style={{ background: 'var(--color-bg-elevated)' }}>
                  <div style={{ color: 'var(--color-text)', fontWeight: 600, marginBottom: 6 }}>
                    {c.headline}
                  </div>
                  <p className="muted" style={{ margin: 0, lineHeight: 1.5, fontSize: 'var(--font-size-sm)' }}>
                    {c.body}
                  </p>
                  <button
                    className="btn-outline"
                    type="button"
                    style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(`${c.headline}\n\n${c.body}\n\n${c.cta}`)
                        .then(() => toast('Creative copied', 'success'));
                    }}
                  >
                    {c.cta || 'Copy'}
                  </button>
                </div>
              ))}
            </div>
          ) : rawOutput ? (
            <pre
              style={{
                marginTop: 14,
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                color: 'var(--color-text-muted)',
                fontSize: 'var(--font-size-sm)',
                lineHeight: 1.55,
              }}
            >
              {rawOutput}
            </pre>
          ) : (
            <div className="grid grid-3" style={{ marginTop: 14 }}>
              {['Banner — Twitter Header', 'Social — Carousel × 4', 'Video — 15s vertical'].map((v) => (
                <div className="thumb" key={v}>{v}</div>
              ))}
            </div>
          )}
        </div>

        <div className="appcard" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px 0' }}>
            <h3 className="appcard__title"><BarChart3 size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Live Campaigns</h3>
          </div>
          <table className="apptable">
            <thead>
              <tr>
                <th>Name</th><th>Format</th><th>Status</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Spend</th>
              </tr>
            </thead>
            <tbody>
              {ads.map((a) => {
                const ctr = a.impressions === 0 ? '—' : `${((a.clicks / a.impressions) * 100).toFixed(2)}%`;
                return (
                  <tr key={a.id}>
                    <td style={{ color: 'var(--color-text)' }}>{a.name}</td>
                    <td>{a.format}</td>
                    <td>{statusPill(a.status)}</td>
                    <td>{a.impressions.toLocaleString()}</td>
                    <td>{a.clicks.toLocaleString()}</td>
                    <td>{ctr}</td>
                    <td style={{ color: 'var(--color-text)' }}>${a.spend}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid grid-3">
          <div className="appcard">
            <h3 className="appcard__title">Spend This Month</h3>
            <div className="kpi__value">$442</div>
            <p className="dim" style={{ margin: '4px 0 10px' }}>Budget $1,000 · 44% used</p>
            <div className="progress"><div className="progress__fill" style={{ width: '44%' }} /></div>
          </div>
          <div className="appcard">
            <h3 className="appcard__title">Channels</h3>
            {adChannels.map((c) => (
              <div className="list-row" key={c} style={{ padding: '6px 0' }}>
                <span className="swatch" style={{ background: 'var(--color-accent)' }} /> {c}
              </div>
            ))}
          </div>
          <div className="appcard">
            <h3 className="appcard__title">Social Content Generator</h3>
            {socialFormats.map((f) => (
              <button
                key={f}
                type="button"
                className="list-row"
                onClick={() => void generateSocial(f)}
                disabled={socialBusy !== null}
                style={{
                  width: '100%',
                  padding: '6px 0',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <span style={{ flex: 1 }}>{f}</span>
                {socialBusy === f ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} color="var(--color-accent)" />}
              </button>
            ))}
          </div>
        </div>

        {social && (
          <div className="appcard">
            <h3 className="appcard__title">
              <Sparkles size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />
              {social.format}
            </h3>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                color: 'var(--color-text-muted)',
                fontSize: 'var(--font-size-sm)',
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {social.text}
            </pre>
            <button
              className="btn-outline"
              type="button"
              style={{ marginTop: 10 }}
              onClick={() => {
                void navigator.clipboard.writeText(social.text).then(() => toast('Copied', 'success'));
              }}
            >
              Copy
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
