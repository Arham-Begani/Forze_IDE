import { describe, it, expect } from 'vitest';
import {
  sanitizeThemeId,
  isThemeId,
  DEFAULT_THEME,
  THEMES,
  useTheme,
} from './themeStore';

/**
 * The theme id is persisted and then written straight to `data-theme`, which
 * selects a token block in tokens.css. A snapshot naming a theme this build no
 * longer ships would set a data-theme with no matching tokens. sanitizeThemeId
 * is the guard that keeps the DOM on a real, shipped theme — these tests pin it.
 */
describe('sanitizeThemeId', () => {
  it('keeps every theme this build actually ships', () => {
    for (const t of THEMES) expect(sanitizeThemeId(t.id)).toBe(t.id);
  });

  it('coerces a removed/renamed theme id to the default', () => {
    // ids that used to exist or were never real
    expect(sanitizeThemeId('forze-sunset')).toBe(DEFAULT_THEME);
    expect(sanitizeThemeId('ad-studio')).toBe(DEFAULT_THEME);
  });

  it('coerces non-string junk to the default', () => {
    expect(sanitizeThemeId(undefined)).toBe(DEFAULT_THEME);
    expect(sanitizeThemeId(null)).toBe(DEFAULT_THEME);
    expect(sanitizeThemeId(42)).toBe(DEFAULT_THEME);
    expect(sanitizeThemeId({})).toBe(DEFAULT_THEME);
  });

  it('the default is itself a shipped, valid id (no bootstrap paradox)', () => {
    expect(isThemeId(DEFAULT_THEME)).toBe(true);
    expect(THEMES.some((t) => t.id === DEFAULT_THEME)).toBe(true);
  });
});

describe('isThemeId', () => {
  it('is true only for shipped ids', () => {
    expect(isThemeId('forze-noir')).toBe(true);
    expect(isThemeId('nope')).toBe(false);
    expect(isThemeId(123)).toBe(false);
  });
});

describe('useTheme.setTheme', () => {
  it('applies a valid theme and rejects an invalid one, staying on a real theme', () => {
    useTheme.getState().setTheme('forze-graphite');
    expect(useTheme.getState().theme).toBe('forze-graphite');

    useTheme.getState().setTheme('bogus-theme' as never);
    expect(useTheme.getState().theme).toBe(DEFAULT_THEME);
  });
});
