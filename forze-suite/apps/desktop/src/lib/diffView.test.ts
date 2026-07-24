import { describe, expect, it } from 'vitest';
import { diffStat, parseDiffRows } from './diffView';

const SAMPLE = `diff --git a/foo.ts b/foo.ts
index 1111111..2222222 100644
--- a/foo.ts
+++ b/foo.ts
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
`;

describe('parseDiffRows', () => {
  it('skips file headers and starts at the first hunk', () => {
    const rows = parseDiffRows(SAMPLE);
    expect(rows[0]?.type).toBe('hunk');
    // No `diff --git` / `index` / ---/+++ rows leak into the list.
    expect(rows.some((r) => r.text.startsWith('diff --git'))).toBe(false);
    expect(rows.some((r) => r.text.startsWith('+++'))).toBe(false);
  });

  it('tracks old/new line numbers through adds, deletes and context', () => {
    const rows = parseDiffRows(SAMPLE).filter((r) => r.type !== 'hunk');
    expect(rows).toEqual([
      { type: 'context', oldLine: 1, newLine: 1, text: 'const a = 1;' },
      { type: 'del', oldLine: 2, newLine: null, text: 'const b = 2;' },
      { type: 'add', oldLine: null, newLine: 2, text: 'const b = 3;' },
      { type: 'add', oldLine: null, newLine: 3, text: 'const c = 4;' },
      { type: 'context', oldLine: 3, newLine: 4, text: 'const d = 5;' },
    ]);
  });

  it('counts added and removed lines for the header stat', () => {
    expect(diffStat(parseDiffRows(SAMPLE))).toEqual({ added: 2, removed: 1 });
  });

  it('returns no rows for an empty diff (clean file)', () => {
    expect(parseDiffRows('')).toEqual([]);
  });

  it('handles a blank context line without dropping the row', () => {
    const diff = `@@ -1,2 +1,2 @@\n a\n \n+b`;
    const rows = parseDiffRows(diff).filter((r) => r.type !== 'hunk');
    // The lone-space line is a real (blank) context row, not skipped.
    expect(rows.map((r) => r.type)).toEqual(['context', 'context', 'add']);
    expect(rows[1]).toEqual({ type: 'context', oldLine: 2, newLine: 2, text: '' });
  });
});
