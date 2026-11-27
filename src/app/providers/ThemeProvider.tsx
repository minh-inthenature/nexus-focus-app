import { useEffect, type ReactNode } from 'react';
import { useTheme } from '@/hooks/useTheme';

export interface ThemeProviderProps {
  children: ReactNode;
}

const THEME_META_COLORS = {
  dark: '#1f1e1c',
  forest: '#111614',
  light: '#faf9f5',
} as const;

/**
 * Synchronizes the resolved dark/forest/light class and color-scheme metadata onto
 * `document.documentElement`.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark', 'forest');
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme === 'light' ? 'light' : 'dark';

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', THEME_META_COLORS[resolvedTheme]);
    }
  }, [resolvedTheme]);

  return <>{children}</>;
}
