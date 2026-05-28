import { useCallback, useState } from 'react';

interface SecretFinding {
  rule: string;
  line: number;
  excerpt: string;
}

interface RlsFinding {
  file: string;
  table: string;
  reason: 'missing-enable-rls' | 'missing-policy';
}

const SECRET_RULES: { name: string; pattern: RegExp }[] = [
  { name: 'GEMINI_API_KEY', pattern: /AIza[0-9A-Za-z\-_]{30,}/ },
  { name: 'STRIPE_SECRET_KEY', pattern: /sk_(?:live|test)_[0-9A-Za-z]{20,}/ },
  { name: 'OPENAI_API_KEY', pattern: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'SUPABASE_SERVICE_ROLE', pattern: /eyJhbGciOi[A-Za-z0-9._-]{40,}/ },
  { name: 'AWS_ACCESS_KEY', pattern: /AKIA[0-9A-Z]{16}/ },
];

/**
 * Built-in Vibe Security Auditor. Two scans run in-process so it works
 * offline: secret detection on the active buffer and an RLS sanity check
 * against Supabase migration SQL. Phase 4 swaps the textareas for live reads
 * via the MCP `forze.security.scan_buffer` tool.
 */
export default function SecurityAuditor(): JSX.Element {
  const [bufferPath, setBufferPath] = useState('app/components/Hero.tsx');
  const [bufferContents, setBufferContents] = useState('');
  const [secretFindings, setSecretFindings] = useState<SecretFinding[]>([]);

  const [migrationSql, setMigrationSql] = useState('');
  const [rlsFindings, setRlsFindings] = useState<RlsFinding[]>([]);

  const runSecretScan = useCallback(() => {
    const findings: SecretFinding[] = [];
    bufferContents.split(/\r?\n/).forEach((line, idx) => {
      for (const rule of SECRET_RULES) {
        if (rule.pattern.test(line)) {
          findings.push({ rule: rule.name, line: idx + 1, excerpt: line.slice(0, 160) });
        }
      }
    });
    setSecretFindings(findings);
  }, [bufferContents]);

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
          <div style={{ marginTop: 8 }}>
            {secretFindings.map((finding, index) => (
              <div key={`${finding.rule}-${index}`} className="finding severity-error">
                <span>{finding.rule}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {finding.excerpt}
                </span>
                <span>L{finding.line}</span>
              </div>
            ))}
          </div>
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
