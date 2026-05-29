import {
  CheckCircle2,
  Cloud,
  GitBranch,
  KeyRound,
  Loader2,
  Rocket,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { deployments, envVars, providers, type Deployment } from '../../workbench/appData';
import { toast } from '../../shell/toast';

function statusPill(status: Deployment['status']): JSX.Element {
  if (status === 'ready')
    return <span className="pill pill--ok"><CheckCircle2 size={12} /> Ready</span>;
  if (status === 'building')
    return <span className="pill pill--accent"><Loader2 size={12} /> Building</span>;
  return <span className="pill pill--danger"><XCircle size={12} /> Error</span>;
}

export default function DeploymentsPage(): JSX.Element {
  return (
    <div className="apppage">
      <div className="apppage__header">
        <div>
          <h1 className="apppage__title">
            <Rocket size={20} strokeWidth={1.8} /> Deployments
          </h1>
          <p className="apppage__subtitle">
            One-click deploys, preview environments, rollbacks, SSL, domains.
          </p>
        </div>
        <button
          className="btn-accent"
          type="button"
          onClick={() => toast('Starting a new deployment…', 'success')}
        >
          <Rocket size={15} /> New Deployment
        </button>
      </div>

      <div className="apppage__body">
        <div className="appcard" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="apptable">
            <thead>
              <tr>
                <th>Status</th>
                <th>Branch</th>
                <th>Commit</th>
                <th>Env</th>
                <th>URL</th>
                <th>Duration</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((d) => (
                <tr key={d.id}>
                  <td>{statusPill(d.status)}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <GitBranch size={12} color="var(--color-text-dim)" />
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{d.branch}</span>
                    </span>
                  </td>
                  <td style={{ color: 'var(--color-text)' }}>{d.commit}</td>
                  <td>
                    <span className={d.env === 'production' ? 'pill pill--accent' : 'pill'}>
                      {d.env}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{d.url}</td>
                  <td>{d.duration}</td>
                  <td style={{ color: 'var(--color-text-dim)' }}>{d.age}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-3">
          <div className="appcard">
            <h3 className="appcard__title"><Cloud size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Providers</h3>
            {providers.map((p) => (
              <button key={p.id} type="button" className="list-row" style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{p.label.slice(0, 2)}</span>
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: 'var(--color-text)' }}>{p.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{p.desc}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="appcard">
            <h3 className="appcard__title"><KeyRound size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Environment Variables</h3>
            {envVars.map((v) => (
              <div className="list-row" key={v.key} style={{ fontSize: 12 }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>{v.key}</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{v.preview}</span>
              </div>
            ))}
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
