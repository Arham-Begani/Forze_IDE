import { useState } from 'react';
import { BarChart3, Megaphone, PenSquare, Send, Sparkles } from 'lucide-react';
import { adChannels, ads, socialFormats, type Ad } from '../../workbench/appData';
import { toast } from '../../shell/toast';

function statusPill(s: Ad['status']): JSX.Element {
  if (s === 'live') return <span className="pill pill--ok">live</span>;
  if (s === 'paused') return <span className="pill pill--warn">paused</span>;
  return <span className="pill">draft</span>;
}

export default function AdStudioPage(): JSX.Element {
  const [prompt, setPrompt] = useState('Launch announcement for our AI dashboard');

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
                style={{ width: '100%', paddingLeft: 32 }}
                placeholder="Describe the ad you want…"
              />
            </span>
            <button
              className="btn-accent"
              type="button"
              onClick={() => toast('Generating ad creatives…', 'success')}
            >
              <Send size={14} /> Generate
            </button>
          </div>
          <div className="grid grid-3" style={{ marginTop: 14 }}>
            {['Banner — Twitter Header', 'Social — Carousel × 4', 'Video — 15s vertical'].map((v) => (
              <div className="thumb" key={v}>{v}</div>
            ))}
          </div>
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
              <div className="list-row" key={f} style={{ padding: '6px 0', color: 'var(--color-text-muted)' }}>{f}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
