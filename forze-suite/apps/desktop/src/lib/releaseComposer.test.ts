import { describe, expect, it } from 'vitest';
import { extractReleaseJson, suggestVersion } from './releaseComposer';

describe('suggestVersion', () => {
  it('patch-bumps a v-prefixed tag', () => {
    expect(suggestVersion('v0.2.12')).toBe('0.2.13');
  });
  it('patch-bumps a bare semver tag', () => {
    expect(suggestVersion('1.4.9')).toBe('1.4.10');
  });
  it('seeds 0.1.0 when there is no tag', () => {
    expect(suggestVersion(null)).toBe('0.1.0');
  });
  it('falls back to 0.1.0 for a non-semver tag', () => {
    expect(suggestVersion('release-candidate')).toBe('0.1.0');
  });
});

describe('extractReleaseJson', () => {
  it('parses a bare JSON object', () => {
    const out = extractReleaseJson('{"changelog":"### Fixed\\n- bug","announcement":"shipped!"}');
    expect(out.changelog).toContain('### Fixed');
    expect(out.announcement).toBe('shipped!');
  });
  it('parses JSON wrapped in a code fence with stray prose', () => {
    const raw = 'Here you go:\n```json\n{"changelog":"x","announcement":"y"}\n```\nDone.';
    expect(extractReleaseJson(raw)).toEqual({ changelog: 'x', announcement: 'y' });
  });
  it('returns an empty object on unparseable input', () => {
    expect(extractReleaseJson('no json here')).toEqual({});
  });
});
