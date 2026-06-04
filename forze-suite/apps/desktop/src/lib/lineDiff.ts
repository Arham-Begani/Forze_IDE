/**
 * Line-level diff for the editor's change gutter (VS Code "dirty diff"). Given a
 * baseline (committed) buffer and the current buffer, it classifies each current
 * line as added or modified and marks where lines were deleted — exactly the
 * three decorations VS Code paints in the gutter.
 *
 * Kept dependency-free and fast: we strip the common prefix/suffix (the usual
 * case is a few edited lines in an otherwise-identical file) and only run the
 * O(n·m) LCS on the differing middle, with a size guard so a pathological file
 * degrades gracefully instead of locking the UI thread.
 */

export interface LineDiff {
  /** Current-line indices (0-based) that are newly added. */
  added: Set<number>;
  /** Current-line indices (0-based) whose content changed. */
  modified: Set<number>;
  /** Current-line indices that carry a "lines deleted here" marker. */
  deleted: Set<number>;
}

const EMPTY: LineDiff = { added: new Set(), modified: new Set(), deleted: new Set() };

/** Beyond this the LCS matrix is too big to build each keystroke; bail safely. */
const MAX_MATRIX = 4_000_000;

export function computeLineDiff(baseline: string, current: string): LineDiff {
  if (baseline === current) return EMPTY;
  // No baseline (new/untracked file): every line is an addition.
  if (baseline.length === 0) {
    const added = new Set<number>();
    const n = current.length === 0 ? 0 : current.split('\n').length;
    for (let i = 0; i < n; i++) added.add(i);
    return { added, modified: new Set(), deleted: new Set() };
  }

  const a = baseline.split('\n');
  const b = current.split('\n');

  // Common prefix.
  let start = 0;
  const minLen = Math.min(a.length, b.length);
  while (start < minLen && a[start] === b[start]) start++;

  // Common suffix (not overlapping the prefix).
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const midA = a.slice(start, endA + 1); // deleted/changed baseline lines
  const midB = b.slice(start, endB + 1); // added/changed current lines

  const added = new Set<number>();
  const modified = new Set<number>();
  const deleted = new Set<number>();

  // Pure insertion: nothing removed, only new lines in the middle.
  if (midA.length === 0) {
    for (let i = 0; i < midB.length; i++) added.add(start + i);
    return { added, modified, deleted };
  }
  // Pure deletion: lines removed, nothing added — mark the line now at the seam.
  if (midB.length === 0) {
    deleted.add(clampDeletionMarker(start, b.length));
    return { added, modified, deleted };
  }

  // Mixed region: align with LCS to separate true edits from add/delete.
  const ops =
    midA.length * midB.length > MAX_MATRIX
      ? coarseOps(midA, midB)
      : lcsOps(midA, midB);

  let bi = start; // running index into the current buffer
  for (const op of ops) {
    if (op.type === 'equal') {
      bi += op.count;
    } else {
      // A change run: `del` baseline lines replaced by `add` current lines.
      const changed = Math.min(op.del, op.add);
      for (let i = 0; i < changed; i++) modified.add(bi + i);
      for (let i = changed; i < op.add; i++) added.add(bi + i);
      if (op.del > op.add) deleted.add(clampDeletionMarker(bi + op.add, b.length));
      bi += op.add;
    }
  }

  return { added, modified, deleted };
}

/** A deletion marker sits on the current line at the seam, clamped in-bounds. */
function clampDeletionMarker(index: number, total: number): number {
  if (total === 0) return 0;
  return Math.max(0, Math.min(index, total - 1));
}

type DiffOp =
  | { type: 'equal'; count: number }
  | { type: 'change'; del: number; add: number };

/** LCS-based op stream over two line arrays. */
function lcsOps(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i:] and b[j:].
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pushEqual(ops, 1);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      pushChange(ops, 1, 0); // delete a[i]
      i++;
    } else {
      pushChange(ops, 0, 1); // add b[j]
      j++;
    }
  }
  if (i < n) pushChange(ops, n - i, 0);
  if (j < m) pushChange(ops, 0, m - j);
  return ops;
}

/** Fallback for huge regions: treat the whole middle as one change. */
function coarseOps(a: string[], b: string[]): DiffOp[] {
  return [{ type: 'change', del: a.length, add: b.length }];
}

function pushEqual(ops: DiffOp[], count: number): void {
  const last = ops[ops.length - 1];
  if (last?.type === 'equal') last.count += count;
  else ops.push({ type: 'equal', count });
}

function pushChange(ops: DiffOp[], del: number, add: number): void {
  const last = ops[ops.length - 1];
  if (last?.type === 'change') {
    last.del += del;
    last.add += add;
  } else {
    ops.push({ type: 'change', del, add });
  }
}
