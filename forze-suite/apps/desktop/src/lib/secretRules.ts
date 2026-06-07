/**
 * Shared secret/risk scan engine used by both the Security Auditor panel and
 * the pre-commit Security Review gate (Commit Guard). Keeping the rules in one
 * place means "what the panel flags" and "what blocks a commit" can never drift.
 *
 * Severity:
 *  - `block` → a high-confidence credential leak. Blocks a commit when the
 *    Security Review toggle is on.
 *  - `warn`  → a risky pattern or a heuristic match. Surfaced, but never blocks
 *    (these have real false-positive rates, so they only advise).
 */

export type Severity = 'block' | 'warn';

export interface SecretRule {
  name: string;
  pattern: RegExp;
  severity: Severity;
}

export interface SecretFinding {
  rule: string;
  severity: Severity;
  /** Repo-relative file the finding lives in, or null for a raw-text scan. */
  file: string | null;
  /** 1-based line number (the new-file side when scanning a diff). */
  line: number;
  /** A short, secret-redacted snippet of the offending line. */
  excerpt: string;
}

/**
 * Ordered most-specific-first so the named match wins when several could fire
 * on one line. Patterns are intentionally non-global (`exec` starts at 0 every
 * time, so there's no `lastIndex` state to reset between lines).
 */
export const SECRET_RULES: SecretRule[] = [
  // ── High-confidence credentials → block ──────────────────────────────────
  { name: 'Google / Gemini API key', pattern: /AIza[0-9A-Za-z\-_]{30,}/, severity: 'block' },
  { name: 'Anthropic API key', pattern: /sk-ant-[0-9A-Za-z\-_]{20,}/, severity: 'block' },
  { name: 'OpenAI API key', pattern: /sk-(?:proj-)?[A-Za-z0-9]{20,}/, severity: 'block' },
  { name: 'Stripe secret key', pattern: /sk_(?:live|test)_[0-9A-Za-z]{20,}/, severity: 'block' },
  { name: 'Stripe restricted key', pattern: /rk_(?:live|test)_[0-9A-Za-z]{20,}/, severity: 'block' },
  { name: 'GitHub token', pattern: /gh[pousr]_[0-9A-Za-z]{30,}/, severity: 'block' },
  { name: 'Slack token', pattern: /xox[baprs]-[0-9A-Za-z-]{10,}/, severity: 'block' },
  { name: 'Google OAuth client secret', pattern: /GOCSPX-[0-9A-Za-z\-_]{20,}/, severity: 'block' },
  { name: 'AWS access key id', pattern: /AKIA[0-9A-Z]{16}/, severity: 'block' },
  { name: 'Supabase / JWT service token', pattern: /eyJhbGciOi[A-Za-z0-9._-]{40,}/, severity: 'block' },
  { name: 'Private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, severity: 'block' },
  { name: 'Twilio account SID', pattern: /AC[0-9a-fA-F]{32}/, severity: 'block' },
  { name: 'SendGrid API key', pattern: /SG\.[0-9A-Za-z\-_]{16,}\.[0-9A-Za-z\-_]{16,}/, severity: 'block' },

  // ── Heuristics & risky patterns → warn ───────────────────────────────────
  {
    name: 'Hardcoded secret assignment',
    pattern: /(?:api[_-]?key|secret|password|passwd|access[_-]?token|auth[_-]?token|private[_-]?key)["'`\s]*[:=]\s*["'`][^"'`\s]{12,}["'`]/i,
    severity: 'warn',
  },
  { name: 'Hardcoded local URL', pattern: /https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d{1,3}\.|192\.168\.)/, severity: 'warn' },
  { name: 'eval() call', pattern: /\beval\s*\(/, severity: 'warn' },
  { name: 'dangerouslySetInnerHTML', pattern: /dangerouslySetInnerHTML/, severity: 'warn' },
  { name: 'child_process exec', pattern: /child_process|\.exec(?:Sync)?\s*\(/, severity: 'warn' },
];

const MAX_EXCERPT = 160;

/**
 * Hide the matched value so the finding can be shown in the UI without re-leaking
 * the secret it found. Keeps the first 4 chars for recognisability, masks the
 * rest. Short matches (keyword patterns like `eval(`) are left intact.
 */
function redact(line: string, match: string): string {
  if (match.length <= 8) return line.trim();
  const masked = `${match.slice(0, 4)}…${'•'.repeat(6)}`;
  return line.replace(match, masked).trim();
}

/** Scan a single line of text against every rule, newest match wins per rule. */
export function scanLine(content: string, file: string | null, line: number): SecretFinding[] {
  const out: SecretFinding[] = [];
  for (const rule of SECRET_RULES) {
    const m = rule.pattern.exec(content);
    if (m) {
      out.push({
        rule: rule.name,
        severity: rule.severity,
        file,
        line,
        excerpt: redact(content, m[0]).slice(0, MAX_EXCERPT),
      });
    }
  }
  return out;
}

/** Scan a whole block of text (e.g. an editor buffer) line by line. */
export function scanText(text: string, file: string | null = null): SecretFinding[] {
  const out: SecretFinding[] = [];
  text.split(/\r?\n/).forEach((content, idx) => {
    out.push(...scanLine(content, file, idx + 1));
  });
  return out;
}
