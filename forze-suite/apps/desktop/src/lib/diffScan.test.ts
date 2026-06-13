import { describe, it, expect } from 'vitest';
import { parseAddedLines, scanDiff, partitionFindings } from './diffScan';

const DIFF = [
  '--- a/config.ts',
  '+++ b/config.ts',
  '@@ -1,3 +1,5 @@',
  ' const a = 1;',
  '-const old = 2;',
  '+const key = "AKIA1234567890ABCDEF";',
  '+const url = "http://localhost:3000";',
  ' const b = 3;',
].join('\n');

describe('parseAddedLines', () => {
  it('tracks new-file line numbers across context and removed lines', () => {
    const added = parseAddedLines(DIFF);
    expect(added).toHaveLength(2);
    expect(added[0]).toMatchObject({ file: 'config.ts', line: 2 });
    expect(added[1]).toMatchObject({ file: 'config.ts', line: 3 });
  });

  it('strips the b/ prefix and ignores /dev/null targets', () => {
    const added = parseAddedLines(
      ['--- a/x', '+++ /dev/null', '@@ -1 +0,0 @@', '-gone'].join('\n'),
    );
    expect(added).toHaveLength(0);
  });
});

describe('scanDiff', () => {
  it('flags secrets only on added lines', () => {
    const findings = scanDiff(DIFF);
    const rules = findings.map((f) => f.rule);
    expect(rules).toContain('AWS access key id');
    expect(rules).toContain('Hardcoded local URL');
  });

  it('never flags secrets sitting on context or removed lines', () => {
    const diff = [
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,2 +1,2 @@',
      ' const ctx = "AKIAEXAMPLE0KEY00000";', // context — pre-existing, not ours
      '-const removed = "sk_live_aaaaaaaaaaaaaaaaaaaaaa";',
      '+const safe = 1;',
    ].join('\n');
    expect(scanDiff(diff)).toHaveLength(0);
  });
});

describe('partitionFindings', () => {
  it('splits block-severity findings from advisory warnings', () => {
    const { blockers, warnings } = partitionFindings(scanDiff(DIFF));
    expect(blockers.map((b) => b.rule)).toEqual(['AWS access key id']);
    expect(warnings.map((w) => w.rule)).toEqual(['Hardcoded local URL']);
  });

  it('returns empty buckets for no findings', () => {
    expect(partitionFindings([])).toEqual({ blockers: [], warnings: [] });
  });
});
