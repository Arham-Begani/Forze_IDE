import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeId =
  | 'forze-noir'
  | 'forze-daylight'
  | 'forze-midnight'
  | 'forze-graphite'
  | 'forze-indigo'
  | 'forze-emerald'
  | 'forze-amber'
  | 'forze-rose'
  | 'forze-violet'
  | 'forze-crimson';

interface ThemeState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

export const THEMES: { id: ThemeId; label: string; description: string }[] = [
  {
    id: 'forze-noir',
    label: 'Matte',
    description: 'Default. Pure monochrome — matte black, silver ink, no color.',
  },
  {
    id: 'forze-daylight',
    label: 'Daylight',
    description: 'Light mode. Paper surfaces, graphite ink. Monochrome.',
  },
  {
    id: 'forze-midnight',
    label: 'Midnight',
    description: 'Cold blue-black surfaces, steel-blue accent.',
  },
  {
    id: 'forze-graphite',
    label: 'Graphite',
    description: 'The monochrome look, one step lighter and softer.',
  },
  {
    id: 'forze-indigo',
    label: 'Indigo',
    description: 'Matte black with a soft indigo accent.',
  },
  {
    id: 'forze-emerald',
    label: 'Emerald',
    description: 'Matte green-black canvas, sea-green accent.',
  },
  {
    id: 'forze-amber',
    label: 'Amber',
    description: 'Warm amber accent over matte black. Solar.',
  },
  {
    id: 'forze-rose',
    label: 'Rose',
    description: 'Soft rose accent on matte black.',
  },
  {
    id: 'forze-violet',
    label: 'Violet',
    description: 'Muted violet accent on matte black.',
  },
  {
    id: 'forze-crimson',
    label: 'Crimson',
    description: 'Restrained crimson accent on matte black.',
  },
];

export const DEFAULT_THEME: ThemeId = 'forze-noir';

// The set of themes this build actually ships, derived from THEMES so it can
// never drift from what Settings renders. Used to reject stale/unknown ids.
const VALID_THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && VALID_THEME_IDS.has(value);
}

/**
 * Coerce any value to a known theme id, falling back to the default. A snapshot
 * written by an older/newer build (or a hand-edited localStorage) can name a
 * theme this build no longer has — applying it would set a `data-theme` with no
 * matching token block. This keeps the app on a real theme instead.
 */
export function sanitizeThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: DEFAULT_THEME,
      setTheme: (theme) => set({ theme: sanitizeThemeId(theme) }),
    }),
    {
      name: 'forze.theme.v2',
      // Self-heal on rehydrate: keep the current state's actions, layer the
      // persisted values on top, then force `theme` through the sanitizer so a
      // removed/renamed theme can never reach the DOM.
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<ThemeState> | undefined),
        theme: sanitizeThemeId((persisted as Partial<ThemeState> | undefined)?.theme),
      }),
    },
  ),
);

export function useApplyTheme(): void {
  const theme = useTheme((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = sanitizeThemeId(theme);
  }, [theme]);
}
