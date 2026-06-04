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
    label: 'Noir',
    description: 'Default. Near-black with platinum-silver accents.',
  },
  {
    id: 'forze-daylight',
    label: 'Daylight',
    description: 'Light mode. White surfaces, deep-cyan accent.',
  },
  {
    id: 'forze-midnight',
    label: 'Midnight',
    description: 'Deep blue surfaces, cold lighting.',
  },
  {
    id: 'forze-graphite',
    label: 'Graphite',
    description: 'Pure neutral grey, no chroma. Print-feel.',
  },
  {
    id: 'forze-indigo',
    label: 'Indigo',
    description: 'Matte black with a single electric-indigo accent.',
  },
  {
    id: 'forze-emerald',
    label: 'Emerald',
    description: 'Black canvas, vivid emerald-green highlights.',
  },
  {
    id: 'forze-amber',
    label: 'Amber',
    description: 'Warm amber accent over true black. Solar.',
  },
  {
    id: 'forze-rose',
    label: 'Rose',
    description: 'Soft rose-pink accent on matte black.',
  },
  {
    id: 'forze-violet',
    label: 'Violet',
    description: 'Deep violet accent, cold black surfaces.',
  },
  {
    id: 'forze-crimson',
    label: 'Crimson',
    description: 'High-energy crimson accent on black.',
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
