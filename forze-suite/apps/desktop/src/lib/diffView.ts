/**
 * Parse a unified git diff into renderable rows for the DiffView editor tab.
 *
 * This is the read side of the same unified-diff format `diffScan.ts` parses for
 * the security gate — but where that only needs the newly-added lines, a viewer
 * needs *every* row (adds, deletes, context) with both the old- and new-file line
 * numbers so it can render a two-column gutter like a real diff editor. Kept as a
 * pure function so it's unit-testable without a DOM or a git repo.
 */

export type DiffRowType = 'add' | 'del' | 'context' | 'hunk';

export interface DiffRow {
  type: DiffRowType;
  /** 1-based line number in the old (HEAD) file, or null for added/hunk rows. */
  oldLine: number | null;
  /** 1-based line number in the new (working) file, or null for removed/hunk rows. */
  newLine: number | null;
  /** The line text, with the leading +/-/space marker already stripped. */
  text: string;
}

/** `@@ -oldStart,oldLen +newStart,newLen @@ optional section heading` */
const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * File-level header lines a viewer should skip: the tab title already names the
 * file, so `diff --git`, `index`, mode changes, rename headers and the ---/+++
 * markers are noise inside the row list.
 */
function isFileHeader(line: string): boolean {
  return (
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ') ||
    line.startsWith('new file') ||
    line.startsWith('deleted file') ||
    line.startsWith('similarity index') ||
    line.startsWith('rename from') ||
    line.startsWith('rename to') ||
    line.startsWith('copy from') ||
    line.startsWith('copy to') ||
    line.startsWith('old mode') ||
    line.startsWith('new mode') ||
    line.startsWith('Binary files')
  );
}

export function parseDiffRows(diff: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  const lines = diff.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    // The final split element is a spurious '' when the diff ends in a newline.
    if (i === lines.length - 1 && raw === '') break;

    const hunk = HUNK_HEADER.exec(raw);
    if (hunk) {
      oldLine = Number.parseInt(hunk[1] ?? '0', 10) || 0;
      newLine = Number.parseInt(hunk[2] ?? '0', 10) || 0;
      inHunk = true;
      rows.push({ type: 'hunk', oldLine: null, newLine: null, text: raw });
      continue;
    }

    if (!inHunk) {
      // Before the first hunk everything is a file header; skip it.
      continue;
    }
    if (isFileHeader(raw)) continue;

    if (raw.startsWith('+')) {
      rows.push({ type: 'add', oldLine: null, newLine, text: raw.slice(1) });
      newLine += 1;
    } else if (raw.startsWith('-')) {
      rows.push({ type: 'del', oldLine, newLine: null, text: raw.slice(1) });
      oldLine += 1;
    } else if (raw.startsWith('\\')) {
      // "\ No newline at end of file" — metadata, not a real line.
    } else {
      // Context line (leading space), or a blank separator line.
      const text = raw.startsWith(' ') ? raw.slice(1) : raw;
      rows.push({ type: 'context', oldLine, newLine, text });
      oldLine += 1;
      newLine += 1;
    }
  }

  return rows;
}

export interface DiffStat {
  added: number;
  removed: number;
}

/** Count added/removed lines for a compact "+N −M" summary in the header. */
export function diffStat(rows: DiffRow[]): DiffStat {
  let added = 0;
  let removed = 0;
  for (const r of rows) {
    if (r.type === 'add') added += 1;
    else if (r.type === 'del') removed += 1;
  }
  return { added, removed };
}
