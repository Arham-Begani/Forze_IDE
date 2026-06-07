/**
 * Scan a unified git diff for leaked secrets — looking only at *newly added*
 * lines. A real pre-commit gate must judge what this commit introduces, not what
 * already lives in the file: a secret sitting in an unchanged context line was
 * already committed, and re-flagging it on every commit would make the gate
 * unusable. So we parse the diff, track the new-file line number through each
 * hunk, and run the shared rule engine over `+` lines only.
 */
import { scanLine, type SecretFinding } from './secretRules';

export interface AddedLine {
  /** Repo-relative path (forward-slashed) the line belongs to. */
  file: string;
  /** 1-based line number in the new version of the file. */
  line: number;
  content: string;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Extract every added line from a unified diff with its new-file line number. */
export function parseAddedLines(diff: string): AddedLine[] {
  const added: AddedLine[] = [];
  let file = '';
  let newLine = 0;

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      // `+++ b/path` (or `+++ /dev/null` for a deletion). Strip the `b/` prefix.
      const target = raw.slice(4).trim();
      file = target === '/dev/null' ? '' : target.replace(/^b\//, '');
      continue;
    }
    if (raw.startsWith('--- ')) continue; // old-file header — ignore

    const hunk = HUNK_HEADER.exec(raw);
    if (hunk) {
      newLine = Number.parseInt(hunk[1] ?? '0', 10) || 0;
      continue;
    }

    if (raw.startsWith('+')) {
      added.push({ file, line: newLine, content: raw.slice(1) });
      newLine += 1;
    } else if (raw.startsWith('-')) {
      // Removed line — does not advance the new-file counter.
    } else if (raw.startsWith('\\')) {
      // "\ No newline at end of file" — metadata, not a real line.
    } else {
      // Context line (leading space) or blank separator — advances new-file.
      newLine += 1;
    }
  }

  return added;
}

/** Run the secret rules over the added lines of a unified diff. */
export function scanDiff(diff: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const { file, line, content } of parseAddedLines(diff)) {
    findings.push(...scanLine(content, file || null, line));
  }
  return findings;
}

/** Split findings into the blockers (commit-stoppers) and the advisories. */
export function partitionFindings(findings: SecretFinding[]): {
  blockers: SecretFinding[];
  warnings: SecretFinding[];
} {
  return {
    blockers: findings.filter((f) => f.severity === 'block'),
    warnings: findings.filter((f) => f.severity === 'warn'),
  };
}
