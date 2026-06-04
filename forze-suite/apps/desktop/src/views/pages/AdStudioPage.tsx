import { useMemo, useState } from 'react';
import {
  BarChart3,
  Check,
  Download,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  PenSquare,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { adChannels, socialFormats } from '../../workbench/appData';
import {
  spendByChannel,
  totalSpend,
  useAdStudio,
  type CampaignFormat,
  type CampaignStatus,
  type Creative,
} from '../../workbench/adStudioStore';
import { toast } from '../../shell/toast';
import { generateImage, generateText } from '../../lib/ai';

const FORMATS: CampaignFormat[] = ['social', 'banner', 'video', 'native'];

function statusPill(s: CampaignStatus): JSX.Element {
  if (s === 'live') return <span className="pill pill--ok">live</span>;
  if (s === 'paused') return <span className="pill pill--warn">paused</span>;
  return <span className="pill">draft</span>;
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

/** Trigger a browser download of a data URL. */
function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function AdStudioPage(): JSX.Element {
  const campaigns = useAdStudio((s) => s.campaigns);
  const monthlyBudget = useAdStudio((s) => s.monthlyBudget);
  const addCampaign = useAdStudio((s) => s.addCampaign);
  const cycleStatus = useAdStudio((s) => s.cycleStatus);
  const removeCampaign = useAdStudio((s) => s.removeCampaign);
  const setMonthlyBudget = useAdStudio((s) => s.setMonthlyBudget);

  // ---- generator state ----
  const [prompt, setPrompt] = useState('Launch announcement for our AI dashboard');
  const [channel, setChannel] = useState(adChannels[0]!);
  const [generating, setGenerating] = useState(false);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [rawOutput, setRawOutput] = useState('');

  const [imgBusy, setImgBusy] = useState(false);
  const [image, setImage] = useState<string | null>(null);

  const [social, setSocial] = useState<{ format: string; text: string } | null>(null);
  const [socialBusy, setSocialBusy] = useState<string | null>(null);

  // ---- new-campaign form ----
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftFormat, setDraftFormat] = useState<CampaignFormat>('social');
  const [draftChannel, setDraftChannel] = useState(adChannels[0]!);
  const [draftBudget, setDraftBudget] = useState(150);

  const spent = useMemo(() => totalSpend(campaigns), [campaigns]);
  const channelSpend = useMemo(() => spendByChannel(campaigns), [campaigns]);
  const budgetPct = monthlyBudget > 0 ? Math.min(100, Math.round((spent / monthlyBudget) * 100)) : 0;

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

  const generateVisual = async () => {
    const brief = prompt.trim();
    if (!brief || imgBusy) return;
    setImgBusy(true);
    try {
      const { dataUrl } = await generateImage(
        `Design a polished, professional advertising creative for: "${brief}". ` +
          `Channel: ${channel}. Bold, modern, high-contrast, ample negative space for overlay text, ` +
          'no spelling errors, no lorem ipsum. Photorealistic or premium vector style.',
      );
      setImage(dataUrl);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Image generation failed', 'error');
    } finally {
      setImgBusy(false);
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

  const saveCreativeAsCampaign = (c: Creative) => {
    const name = c.headline.slice(0, 48) || prompt.trim().slice(0, 48) || 'New campaign';
    addCampaign({
      name,
      format: 'social',
      channel,
      budget: 150,
      creatives: [c],
      imageUrl: image ?? undefined,
    });
    toast(`"${name}" saved as draft`, 'success');
  };

  const saveImageAsCampaign = () => {
    if (!image) return;
    const name = prompt.trim().slice(0, 48) || 'Visual campaign';
    addCampaign({
      name,
      format: 'banner',
      channel,
      budget: 150,
      creatives: creatives.length ? [creatives[0]!] : [],
      imageUrl: image,
    });
    toast(`"${name}" saved as draft`, 'success');
  };

  const submitNewCampaign = () => {
    const id = addCampaign({
      name: draftName,
      format: draftFormat,
      channel: draftChannel,
      budget: draftBudget,
    });
    if (id) {
      toast('Campaign created as draft', 'success');
      setCreating(false);
      setDraftName('');
      setDraftBudget(150);
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
        <button className="btn-accent" type="button" onClick={() => setCreating((v) => !v)}>
          {creating ? <X size={15} /> : <Plus size={15} />} {creating ? 'Cancel' : 'New Campaign'}
        </button>
      </div>

      <div className="apppage__body">
        {creating && (
          <div className="appcard">
            <h3 className="appcard__title">
              <Plus size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />
              New Campaign
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1.4fr 1fr auto',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Campaign name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && draftName.trim()) submitNewCampaign();
                }}
              />
              <select value={draftFormat} onChange={(e) => setDraftFormat(e.target.value as CampaignFormat)}>
                {FORMATS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <select value={draftChannel} onChange={(e) => setDraftChannel(e.target.value)}>
                {adChannels.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <span style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: 10, color: 'var(--color-text-dim)' }}>$</span>
                <input
                  type="number"
                  min={0}
                  value={draftBudget}
                  onChange={(e) => setDraftBudget(Number(e.target.value))}
                  style={{ width: '100%', paddingLeft: 22 }}
                  placeholder="Budget"
                />
              </span>
              <button
                className="btn-accent"
                type="button"
                onClick={submitNewCampaign}
                disabled={!draftName.trim()}
              >
                <Check size={14} /> Create
              </button>
            </div>
          </div>
        )}

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
            <select value={channel} onChange={(e) => setChannel(e.target.value)} title="Target channel">
              {adChannels.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              className="btn-outline"
              type="button"
              onClick={() => void generateVisual()}
              disabled={imgBusy || !prompt.trim()}
              title="Generate an ad visual"
            >
              {imgBusy ? <Loader2 size={14} className="spin" /> : <ImageIcon size={14} />}
              {imgBusy ? 'Rendering…' : 'Visual'}
            </button>
            <button
              className="btn-accent"
              type="button"
              onClick={() => void generate()}
              disabled={generating || !prompt.trim()}
            >
              {generating ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
              {generating ? 'Writing…' : 'Copy'}
            </button>
          </div>

          {image && (
            <div style={{ marginTop: 14, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <img
                src={image}
                alt="Generated ad creative"
                style={{
                  width: 280,
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--glass-border)',
                  display: 'block',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  className="btn-outline"
                  type="button"
                  onClick={() => downloadDataUrl(image, `ad-${Date.now()}.png`)}
                >
                  <Download size={14} /> Download
                </button>
                <button className="btn-accent" type="button" onClick={saveImageAsCampaign}>
                  <Plus size={14} /> Save as campaign
                </button>
                <button className="btn-outline" type="button" onClick={() => setImage(null)}>
                  <X size={14} /> Discard
                </button>
              </div>
            </div>
          )}

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
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button
                      className="btn-outline"
                      type="button"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(`${c.headline}\n\n${c.body}\n\n${c.cta}`)
                          .then(() => toast('Creative copied', 'success'));
                      }}
                    >
                      {c.cta || 'Copy'}
                    </button>
                    <button
                      className="btn-outline"
                      type="button"
                      title="Save as draft campaign"
                      onClick={() => saveCreativeAsCampaign(c)}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
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
          ) : !image ? (
            <div className="grid grid-3" style={{ marginTop: 14 }}>
              {['Banner — Twitter Header', 'Social — Carousel × 4', 'Video — 15s vertical'].map((v) => (
                <div className="thumb" key={v}>{v}</div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="appcard" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px 0' }}>
            <h3 className="appcard__title">
              <BarChart3 size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />
              Live Campaigns
            </h3>
          </div>
          {campaigns.length === 0 ? (
            <div className="dim" style={{ padding: '8px 16px 18px' }}>
              No campaigns yet — generate copy or click New Campaign to start.
            </div>
          ) : (
            <table className="apptable">
              <thead>
                <tr>
                  <th>Name</th><th>Channel</th><th>Format</th><th>Status</th>
                  <th>Impressions</th><th>Clicks</th><th>CTR</th><th>Spend / Budget</th><th />
                </tr>
              </thead>
              <tbody>
                {campaigns.map((a) => {
                  const ctr = a.impressions === 0 ? '—' : `${((a.clicks / a.impressions) * 100).toFixed(2)}%`;
                  return (
                    <tr key={a.id}>
                      <td style={{ color: 'var(--color-text)' }}>
                        {a.imageUrl && (
                          <img
                            src={a.imageUrl}
                            alt=""
                            style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'cover', verticalAlign: -6, marginRight: 8 }}
                          />
                        )}
                        {a.name}
                      </td>
                      <td>{a.channel}</td>
                      <td>{a.format}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => cycleStatus(a.id)}
                          title="Click to change status"
                          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                        >
                          {statusPill(a.status)}
                        </button>
                      </td>
                      <td>{a.impressions.toLocaleString()}</td>
                      <td>{a.clicks.toLocaleString()}</td>
                      <td>{ctr}</td>
                      <td style={{ color: 'var(--color-text)' }}>
                        ${a.spend.toLocaleString()} <span className="dim">/ ${a.budget.toLocaleString()}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          title="Delete campaign"
                          onClick={() => removeCampaign(a.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--color-text-dim)',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="grid grid-3">
          <div className="appcard">
            <h3 className="appcard__title">Spend This Month</h3>
            <div className="kpi__value">${spent.toLocaleString()}</div>
            <p className="dim" style={{ margin: '4px 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              Budget $
              <input
                type="number"
                min={0}
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                style={{ width: 84, padding: '2px 6px', fontSize: 'var(--font-size-sm)' }}
              />
              · {budgetPct}% used
            </p>
            <div className="progress"><div className="progress__fill" style={{ width: `${budgetPct}%` }} /></div>
          </div>
          <div className="appcard">
            <h3 className="appcard__title">Channels</h3>
            {(channelSpend.length ? channelSpend.map((c) => c.channel) : adChannels).map((c) => {
              const cs = channelSpend.find((x) => x.channel === c);
              return (
                <div className="list-row" key={c} style={{ padding: '6px 0', display: 'flex', alignItems: 'center' }}>
                  <span className="swatch" style={{ background: 'var(--color-accent)' }} />
                  <span style={{ flex: 1 }}>{c}</span>
                  {cs && cs.spend > 0 && <span className="dim">${cs.spend.toLocaleString()}</span>}
                </div>
              );
            })}
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
