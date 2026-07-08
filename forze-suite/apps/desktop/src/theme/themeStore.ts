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

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'forze-noir',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'forze.theme.v2',
    },
  ),
);

export function useApplyTheme(): void {
  const theme = useTheme((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}
