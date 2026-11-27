import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export const NATIVE_OAUTH_SCHEME = 'com.minh.vault';
export const NATIVE_OAUTH_HOST = 'login-callback';
export const NATIVE_OAUTH_REDIRECT_URL = `${NATIVE_OAUTH_SCHEME}://${NATIVE_OAUTH_HOST}`;
export const VAULT_DARK_BG_HEX = '#141414';

export interface ParsedOAuthCallback {
  isOAuthCallback: boolean;
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
}

/**
 * True only when running inside a native Capacitor runtime (Android / iOS),
 * returning false in standard web browsers and SSR/Vitest environments.
 */
export function isNativeCapacitorApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * True on native Android builds specifically.
 */
export function isNativeAndroidApp(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/**
 * Configures the Android/iOS status bar to match Vault's `#141414` dark surface
 * with light status bar icons (`Style.Dark` in Capacitor StatusBar).
 */
export async function configureNativeStatusBar(): Promise<void> {
  if (!isNativeCapacitorApp()) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setBackgroundColor({ color: VAULT_DARK_BG_HEX });
    }
  } catch {
    // Non-fatal on emulators/OS versions that restrict status bar APIs
  }
}

/**
 * Opens an external URL in the in-app system browser (Chrome Custom Tabs on Android).
 */
export async function openExternalAuthUrl(url: string): Promise<void> {
  if (isNativeCapacitorApp()) {
    await Browser.open({
      url,
      toolbarColor: VAULT_DARK_BG_HEX,
      presentationStyle: 'fullscreen',
    });
    return;
  }
  window.location.assign(url);
}

/**
 * Closes any open Chrome Custom Tab / ASWebAuthenticationSession browser overlay.
 */
export async function closeExternalAuthBrowser(): Promise<void> {
  if (!isNativeCapacitorApp()) return;
  try {
    await Browser.close();
  } catch {
    // Safe to ignore if the browser sheet was already dismissed by the user
  }
}

/**
 * Parses a custom-scheme deep link (`com.minh.vault://login-callback?...#...`)
 * for Supabase PKCE `code`, implicit-flow tokens, or OAuth `error` params.
 */
export function parseOAuthCallbackUrl(rawUrl: string): ParsedOAuthCallback {
  const empty: ParsedOAuthCallback = {
    isOAuthCallback: false,
    code: null,
    accessToken: null,
    refreshToken: null,
    error: null,
  };

  if (!rawUrl) return empty;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return empty;
  }

  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.replace(/^\/+/, '').toLowerCase();

  const matchesScheme = scheme === NATIVE_OAUTH_SCHEME;
  const matchesCallback = host === NATIVE_OAUTH_HOST || path === NATIVE_OAUTH_HOST;

  if (!matchesScheme || !matchesCallback) {
    return empty;
  }

  const searchParams = parsed.searchParams;
  const hashRaw = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
  const hashParams = new URLSearchParams(hashRaw);

  const error =
    searchParams.get('error_description') ??
    searchParams.get('error') ??
    hashParams.get('error_description') ??
    hashParams.get('error');

  const code = searchParams.get('code') ?? hashParams.get('code');
  const accessToken =
    hashParams.get('access_token') ?? searchParams.get('access_token');
  const refreshToken =
    hashParams.get('refresh_token') ?? searchParams.get('refresh_token');

  return {
    isOAuthCallback: true,
    code,
    accessToken,
    refreshToken,
    error,
  };
}

/**
 * Subscribes to Capacitor `appUrlOpen` deep-link events so returning from Chrome
 * Custom Tabs completes Supabase OAuth and dismisses the browser overlay.
 * Also inspects `App.getLaunchUrl()` in case Android cold-started via deep link.
 */
export function registerNativeOAuthListener(
  onCallbackUrl: (url: string) => void | Promise<void>,
): () => void {
  if (!isNativeCapacitorApp()) {
    return () => {};
  }

  let disposed = false;
  let lastHandledUrl: string | null = null;

  const dispatchIfNew = (url: string | undefined | null) => {
    if (disposed || !url || url === lastHandledUrl) return;
    const parsed = parseOAuthCallbackUrl(url);
    if (!parsed.isOAuthCallback) return;
    lastHandledUrl = url;
    void onCallbackUrl(url);
  };

  const listenerPromise = App.addListener(
    'appUrlOpen',
    (event: URLOpenListenerEvent) => {
      dispatchIfNew(event.url);
    },
  );

  void App.getLaunchUrl()
    .then((result) => {
      dispatchIfNew(result?.url);
    })
    .catch(() => {
      // Non-fatal
    });

  return () => {
    disposed = true;
    void listenerPromise
      .then((handle) => handle.remove())
      .catch(() => {
        // Non-fatal
      });
  };
}
