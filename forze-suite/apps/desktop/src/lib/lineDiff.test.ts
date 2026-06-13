import { describe, it, expect } from 'vitest';
import { computeLineDiff } from './lineDiff';

describe('computeLineDiff', () => {
  it('reports no changes for identical buffers', () => {
    const diff = computeLineDiff('a\nb\nc', 'a\nb\nc');
    expect(diff.added.size).toBe(0);
    expect(diff.modified.size).toBe(0);
    expect(diff.deleted.size).toBe(0);
  });

  it('marks every line added when there is no baseline', () => {
    const diff = computeLineDiff('', 'one\ntwo\nthree');
    expect([...diff.added].sort((a, b) => a - b)).toEqual([0, 1, 2]);
    expect(diff.modified.size).toBe(0);
  });

  it('classifies a single changed line as modified, not added', () => {
    const diff = computeLineDiff('a\nb\nc', 'a\nB\nc');
    expect([...diff.modified]).toEqual([1]);
    expect(diff.added.size).toBe(0);
    expect(diff.deleted.size).toBe(0);
  });

  it('detects an inserted line as added at the right index', () => {
    const diff = computeLineDiff('a\nc', 'a\nb\nc');
    expect([...diff.added]).toEqual([1]);
    expect(diff.modified.size).toBe(0);
  });

  it('records a deletion marker when lines are removed', () => {
    const diff = computeLineDiff('a\nb\nc\nd', 'a\nd');
    expect(diff.deleted.size).toBeGreaterThan(0);
    // The marker is clamped within the current buffer's bounds.
    for (const idx of diff.deleted) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the deletion marker in-bounds when the whole middle is removed', () => {
    const diff = computeLineDiff('keep\nx\ny\nz\nkeep', 'keep\nkeep');
    for (const idx of diff.deleted) {
      expect(idx).toBeLessThanOrEqual(1);
    }
  });
});
