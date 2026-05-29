import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeId = 'forze-noir' | 'forze-midnight' | 'forze-graphite';

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
    id: 'forze-midnight',
    label: 'Midnight',
    description: 'Deep blue surfaces, cold lighting.',
  },
  {
    id: 'forze-graphite',
    label: 'Graphite',
    description: 'Pure neutral grey, no chroma. Print-feel.',
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
