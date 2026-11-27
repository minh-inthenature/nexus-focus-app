import { useEffect, useState } from 'react';
import { isNativeCapacitorApp } from '@/services/native/capacitor.service';

const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

function getIsMobileViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

/**
 * Detects whether the dedicated minimalist mobile shell should render:
 * active whenever running inside native Capacitor (Android/iOS) or
 * on viewports narrower than 768px.
 */
export function useIsMobileShell(): boolean {
  const [isNarrowViewport, setIsNarrowViewport] = useState<boolean>(() =>
    getIsMobileViewport(),
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    setIsNarrowViewport(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setIsNarrowViewport(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return isNativeCapacitorApp() || isNarrowViewport;
}
