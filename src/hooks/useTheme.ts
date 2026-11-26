import { useEffect, useState } from 'react';
import { useThemeStore } from '@/stores/useThemeStore';
import type { ResolvedTheme, ThemePreference } from '@/types/theme';

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
}

export interface UseThemeResult {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  toggleTheme: () => void;
}

/**
 * Exposes the persisted theme preference, the active resolved theme
 * (evaluating `'system'` against OS color-scheme), and theme actions.
 */
export function useTheme(): UseThemeResult {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const resolvedTheme: ResolvedTheme =
    preference === 'system' ? systemTheme : preference;

  return {
    preference,
    resolvedTheme,
    setPreference,
    toggleTheme,
  };
}
