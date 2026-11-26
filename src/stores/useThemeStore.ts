import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemePreference } from '@/types/theme';

export const THEME_STORAGE_KEY = 'nexus-theme';
const THEME_STORE_KEY = 'nexus-theme-store';

interface ThemeState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  toggleTheme: () => void;
}

function writePreHydrationThemeKey(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Ignore storage errors in restricted browsing contexts.
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      preference: 'dark',
      setPreference: (preference) => {
        writePreHydrationThemeKey(preference);
        set({ preference });
      },
      toggleTheme: () => {
        const current = get().preference;
        const resolvedCurrent =
          current === 'system'
            ? typeof window !== 'undefined' &&
              window.matchMedia('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'light'
            : current;
        const next: ThemePreference =
          resolvedCurrent === 'forest' ? 'dark' : 'forest';
        writePreHydrationThemeKey(next);
        set({ preference: next });
      },
    }),
    {
      name: THEME_STORE_KEY,
      partialize: (state) => ({ preference: state.preference }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          writePreHydrationThemeKey(state.preference);
        }
      },
    },
  ),
);
