import { useEffect, useState } from 'react';
import { openExternal } from '../../lib/openLink';
import { scanLine } from '../../lib/secretRules';
import { getDeployment, getDeploymentLogs } from '../../lib/vercel';
import { approved, diagnostic } from '../../../../../../integrations/debug-room/public/excerpt.mjs';

export type FailedBuild = { uid: string; name: string };
export function roomLink(): URL {
  const url = new URL(import.meta.env.VITE_DEBUG_ROOM_ORIGIN || 'http://127.0.0.1:4174');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) {
    throw new Error('Set VITE_DEBUG_ROOM_ORIGIN to an HTTPS room service or localhost.');
  }
  return new URL('/', url.origin);
}

interface Props {
  deployment: FailedBuild;
  token: string;
  team?: string;
  onClose: () => void;
  canDeploy: boolean;
  onDeploy: () => void;
  rerun?: string;
}

export function DebugRoomPanel({deployment,token,team,onClose,canDeploy,onDeploy,rerun}: Props) {
  const [lines,setLines] = useState<string[]>([]);
  const [checked,setChecked] = useState<number[]>([]);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const [attempt,setAttempt] = useState(0);
  const [opened,setOpened] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setChecked([]); setLines([]); setError('');
    getDeploymentLogs(token,deployment.uid,team).then(raw => {
      if (active) setLines(raw.split(/\r?\n/));
    }).catch(() => { if (active) setError('Could not read this build log. Check the Vercel connection, then retry.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active=false; };
  },[token,deployment.uid,team,attempt]);
  const choices = lines.map((raw,i) => ({
    i, text: scanLine(raw,null,i+1).length ? null : diagnostic(raw)
  })).filter((line): line is { i:number; text:string } => !!line.text);
  const excerpt = choices.filter(l => checked.includes(l.i)).map(l => l.text);
  async function handoff() {
    try {
      const url = roomLink();
      url.hash = new URLSearchParams({draft:JSON.stringify({name:deployment.name,deployment:deployment.uid,lines:excerpt})}).toString();
      await openExternal(url.href); setOpened(true); setError('');
    } catch { setError('Could not open the room. Check the room service URL.'); }
  }
  async function report() {
    if (!rerun) return;
    try {
      const {state} = await getDeployment(token,rerun,team);
      const url = roomLink();
      url.hash = new URLSearchParams({report:JSON.stringify({original:deployment.uid,id:rerun,state,observed:Date.now()})}).toString();
      await openExternal(url.href); setError('');
    } catch { setError('Could not read the rerun status. Retry when Vercel is reachable.'); }
  }
  return <section className="appcard" aria-label="Share a deployment error">
    <div style={{display:'flex',justifyContent:'space-between'}}><h3>Ask for help</h3><button className="btn-outline" onClick={onClose}>Close</button></div>
    <p>Choose diagnostic lines. Forze keeps raw logs on this device.</p>
    {loading && <p>Reading build log…</p>}
    {!loading && !choices.length && <p>No shareable diagnostics found for this deployment.</p>}
    {error && <p role="alert">{error}</p>}
    <div style={{maxHeight:180,overflow:'auto'}}>{choices.map(l => <label key={l.i} style={{display:'block'}}>
      <input type="checkbox" checked={checked.includes(l.i)} disabled={!checked.includes(l.i) && checked.length>=12}
        onChange={e=>setChecked(e.target.checked ? [...checked,l.i] : checked.filter(n=>n!==l.i))} /> <code>{l.i+1} · {l.text}</code>
    </label>)}</div>
    <strong>Teammate preview</strong><p>{deployment.name} / {deployment.uid}</p>
    <pre style={{whiteSpace:'pre-wrap'}}>{excerpt.join('\n') || 'Select a diagnostic above.'}</pre>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <button className="btn-accent" disabled={!approved(excerpt)} onClick={()=>void handoff()}>Open debugging room</button>
      <button className="btn-outline" disabled={loading} onClick={()=>setAttempt(n=>n+1)}>Reload log</button>
      {(opened || rerun) && <button className="btn-outline" disabled={!canDeploy} title="Deploy the matching open folder with your current deployment settings" onClick={onDeploy}>Deploy fixed folder</button>}
      {rerun && <button className="btn-outline" onClick={()=>void report()}>Share rerun status</button>}
    </div>
  </section>;
}
