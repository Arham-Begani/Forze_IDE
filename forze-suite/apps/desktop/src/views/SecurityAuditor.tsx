import { ShieldAlert, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { scanText, type SecretFinding } from '../lib/secretRules';
import { partitionFindings } from '../lib/diffScan';
import { basename } from '../lib/fs';
import { reviewStaged } from '../workbench/commitGuard';
import { useCommitGuard } from '../workbench/commitGuardStore';
import { useProject } from '../workbench/projectStore';

interface RlsFinding {
  file: string;
  table: string;
  reason: 'missing-enable-rls' | 'missing-policy';
}

/**
 * Built-in Vibe Security Auditor. The secret scanner and the pre-commit review
 * share one rule engine (`lib/secretRules.ts`) with the Commit Guard, so what
 * blocks a commit is exactly what this panel flags. Three tools:
 *  - Pre-commit review: scan the live staged diff (the same gate auto-commit runs)
 *  - Secret watcher: scan an arbitrary buffer offline
 *  - Supabase RLS scanner: catch tables created without row-level security
 */
export default function SecurityAuditor(): JSX.Element {
  const [bufferPath, setBufferPath] = useState('app/components/Hero.tsx');
  const [bufferContents, setBufferContents] = useState('');
  const [secretFindings, setSecretFindings] = useState<SecretFinding[]>([]);

  const [migrationSql, setMigrationSql] = useState('');
  const [rlsFindings, setRlsFindings] = useState<RlsFinding[]>([]);

  const runSecretScan = useCallback(() => {
    setSecretFindings(scanText(bufferContents, bufferPath || null));
  }, [bufferContents, bufferPath]);

  const runRlsScan = useCallback(() => {
    const findings: RlsFinding[] = [];
    const tableMatches = [
      ...migrationSql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.]+)/gi),
    ];
    for (const match of tableMatches) {
      const table = match[1];
      if (!table) continue;
      const enableRls = new RegExp(
        `ALTER\\s+TABLE\\s+${escapeRegex(table)}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        'i',
      );
      const policy = new RegExp(
        `CREATE\\s+POLICY[^;]*ON\\s+${escapeRegex(table)}`,
        'i',
      );
      if (!enableRls.test(migrationSql)) {
        findings.push({ file: 'pasted.sql', table, reason: 'missing-enable-rls' });
      } else if (!policy.test(migrationSql)) {
        findings.push({ file: 'pasted.sql', table, reason: 'missing-policy' });
      }
    }
    setRlsFindings(findings);
  }, [migrationSql]);

  return (
    <section className="panel">
      <h2>Security Auditor</h2>
      <p className="muted">
        Detects AI-introduced vulnerabilities — exposed API keys, missing RLS,
        and tables that lack at least one policy.
      </p>

      <PrecommitReview />

      <div className="card">
        <strong>Secret Watcher</strong>
        <p className="muted" style={{ marginTop: 4 }}>
          Paste the contents of a file (or dump from the active editor buffer)
          and run the scan before committing.
        </p>
        <label>
          <div className="muted">File path</div>
          <input
            value={bufferPath}
            onChange={(e) => setBufferPath(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label>
          <div className="muted">File contents</div>
          <textarea
            value={bufferContents}
            onChange={(e) => setBufferContents(e.target.value)}
            rows={6}
            style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
            placeholder="Paste or drag file contents here…"
          />
        </label>
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={runSecretScan}>Scan for secrets</button>
        </div>
        {secretFindings.length === 0 ? (
          <p className="muted" style={{ marginTop: 8 }}>No findings.</p>
        ) : (
          <FindingList findings={secretFindings} />
        )}
      </div>

      <div className="card">
        <strong>Supabase RLS Scanner</strong>
        <p className="muted" style={{ marginTop: 4 }}>
          Paste your latest migration. The scan reports any table created
          without an <code>ENABLE ROW LEVEL SECURITY</code> statement or a
          matching <code>CREATE POLICY</code>.
        </p>
        <textarea
          value={migrationSql}
          onChange={(e) => setMigrationSql(e.target.value)}
          rows={8}
          style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
          placeholder="-- Paste db/migrations/*.sql here"
        />
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={runRlsScan}>Scan migration</button>
        </div>
        {rlsFindings.length === 0 ? (
          <p className="muted" style={{ marginTop: 8 }}>No findings.</p>
        ) : (
          <div style={{ marginTop: 8 }}>
            {rlsFindings.map((finding, index) => (
              <div key={`${finding.table}-${index}`} className="finding severity-error">
                <span>{finding.table}</span>
                <span>{describeReason(finding.reason)}</span>
                <span>{finding.file}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Pre-commit review card — runs the exact gate the Commit Guard uses against the
 * live staged diff, and reflects the result of the last automatic review (e.g.
 * the one that just paused an auto-commit).
 */
function PrecommitReview(): JSX.Element {
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const isGitRepo = useProject((s) => s.isGitRepo);
  const securityReview = useCommitGuard((s) => s.securityReviewEnabled);
  const lastReview = useCommitGuard((s) => s.lastReview);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    if (!workspaceRoot) return;
    setBusy(true);
    try {
      await reviewStaged(workspaceRoot);
    } catch {
      /* surfaced via the empty/last-review state */
    } finally {
      setBusy(false);
    }
  }, [workspaceRoot]);

  // Surface the current staged state the moment the panel opens.
  useEffect(() => {
    if (workspaceRoot && isGitRepo) void run();
  }, [workspaceRoot, isGitRepo, run]);

  const findings = lastReview?.findings ?? [];
  const { blockers, warnings } = partitionFindings(findings);

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <ShieldCheck size={14} strokeWidth={1.8} />
        <strong>Pre-commit review</strong>
        {!securityReview && (
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>
            gate off — enable in Source Control
          </span>
        )}
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        Scans the newly-added lines of your staged diff for leaked secrets — the
        same check that gates every commit.
      </p>

      {!isGitRepo ? (
        <p className="muted" style={{ marginTop: 8 }}>Open a git repository to review staged changes.</p>
      ) : (
        <>
          <div style={{ marginTop: 8 }}>
            <button type="button" onClick={run} disabled={busy}>
              {busy ? (
                <Loader2 size={12} className="spin" style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
              ) : null}
              {busy ? 'Reviewing…' : 'Review staged changes'}
            </button>
          </div>

          {lastReview && findings.length === 0 && (
            <p className="finding severity-ok" style={{ marginTop: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={12} /> Clean — nothing leaked in the staged diff.
              </span>
            </p>
          )}

          {findings.length > 0 && (
            <>
              <p
                style={{
                  marginTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: blockers.length > 0 ? 'var(--color-danger)' : 'var(--color-warn, #f5a623)',
                  fontSize: 12,
                }}
              >
                {blockers.length > 0 ? <ShieldAlert size={13} /> : <AlertTriangle size={13} />}
                {blockers.length > 0
                  ? `${blockers.length} blocking secret${blockers.length > 1 ? 's' : ''}`
                  : ''}
                {blockers.length > 0 && warnings.length > 0 ? ' · ' : ''}
                {warnings.length > 0 ? `${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : ''}
              </p>
              <FindingList findings={findings} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function FindingList({ findings }: { findings: SecretFinding[] }): JSX.Element {
  return (
    <div style={{ marginTop: 8 }}>
      {findings.map((finding, index) => (
        <div
          key={`${finding.rule}-${finding.file}-${finding.line}-${index}`}
          className={`finding ${finding.severity === 'block' ? 'severity-error' : ''}`}
        >
          <span>{finding.rule}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {finding.excerpt}
          </span>
          <span>
            {finding.file ? `${basename(finding.file)}:${finding.line}` : `L${finding.line}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function describeReason(reason: RlsFinding['reason']): string {
  return reason === 'missing-enable-rls'
    ? 'Row-Level Security is not enabled on this table.'
    : 'RLS is enabled but no policy was found — the table is locked to everyone.';
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 4,
};
