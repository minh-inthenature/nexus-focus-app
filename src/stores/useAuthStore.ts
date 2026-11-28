import { create } from 'zustand';
import type { AuthSession } from '@/services/auth/auth.service';
import { supabaseAuthService } from '@/services/auth/supabase-auth.service';
import { syncEngine } from '@/services/sync/syncEngine';

export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'unconfigured';

const LOCAL_MODE_STORAGE_KEY = 'nexus-local-mode';
const CACHED_SESSION_STORAGE_KEY = 'nexus-cached-auth-session';

function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function readCachedSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(CACHED_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<AuthSession>;
    if (
      !candidate.user ||
      typeof candidate.user !== 'object' ||
      typeof candidate.user.id !== 'string' ||
      !candidate.user.id ||
      typeof candidate.user.email !== 'string'
    ) {
      return null;
    }
    return {
      user: {
        id: candidate.user.id,
        email: candidate.user.email,
        ...(typeof candidate.user.displayName === 'string'
          ? { displayName: candidate.user.displayName }
          : {}),
        ...(typeof candidate.user.avatarUrl === 'string'
          ? { avatarUrl: candidate.user.avatarUrl }
          : {}),
      },
      expiresAt:
        typeof candidate.expiresAt === 'string'
          ? candidate.expiresAt
          : new Date(0).toISOString(),
      provider: 'google',
    };
  } catch {
    return null;
  }
}

function writeCachedSession(session: AuthSession): void {
  try {
    window.localStorage.setItem(
      CACHED_SESSION_STORAGE_KEY,
      JSON.stringify(session),
    );
  } catch {
    // Ignore storage quota / private browsing errors
  }
}

function clearCachedSession(): void {
  try {
    window.localStorage.removeItem(CACHED_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
}

function readLocalModeFlag(): boolean {
  try {
    return window.sessionStorage.getItem(LOCAL_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeLocalModeFlag(enabled: boolean): void {
  try {
    if (enabled) {
      window.sessionStorage.setItem(LOCAL_MODE_STORAGE_KEY, 'true');
    } else {
      window.sessionStorage.removeItem(LOCAL_MODE_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
}

interface AuthStoreState {
  status: AuthStatus;
  session: AuthSession | null;
  error: string | null;
  isSigningIn: boolean;
  localMode: boolean;
  offlineSession: boolean;
  initialized: boolean;

  initialize: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  completeOAuthCallback: (code?: string | null) => Promise<void>;
  completeNativeOAuthUrl: (rawUrl: string) => Promise<void>;
  signOut: () => Promise<void>;
  enterLocalMode: () => void;
  exitLocalMode: () => void;
  clearError: () => void;
}

let authUnsubscribe: (() => void) | null = null;
let inflightInit: Promise<void> | null = null;
let onlineRevalidateRegistered = false;

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  status: 'loading',
  session: null,
  error: null,
  isSigningIn: false,
  localMode: readLocalModeFlag(),
  offlineSession: false,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    if (inflightInit) return inflightInit;

    inflightInit = (async () => {
      if (!supabaseAuthService.isConfigured()) {
        set({
          status: 'unconfigured',
          session: null,
          offlineSession: false,
          initialized: true,
        });
        return;
      }

      const cached = readCachedSession();
      if (cached) {
        writeLocalModeFlag(false);
        set({
          status: 'authenticated',
          session: cached,
          localMode: false,
          offlineSession: true,
          error: null,
        });
      }

      if (authUnsubscribe) {
        authUnsubscribe();
      }

      authUnsubscribe = supabaseAuthService.onAuthStateChange((session) => {
        if (session) {
          writeCachedSession(session);
          writeLocalModeFlag(false);
          set({
            status: 'authenticated',
            session,
            localMode: false,
            offlineSession: false,
            error: null,
          });
        } else if (isBrowserOffline() && readCachedSession()) {
          // Preserve offline cached session while disconnected
        } else {
          clearCachedSession();
          set({
            status: 'unauthenticated',
            session: null,
            offlineSession: false,
          });
        }
      });

      if (typeof window !== 'undefined' && !onlineRevalidateRegistered) {
        onlineRevalidateRegistered = true;
        window.addEventListener('online', () => {
          if (!get().offlineSession || !supabaseAuthService.isConfigured()) {
            return;
          }
          void supabaseAuthService
            .getSession()
            .then((freshSession) => {
              if (freshSession) {
                writeCachedSession(freshSession);
                writeLocalModeFlag(false);
                set({
                  status: 'authenticated',
                  session: freshSession,
                  localMode: false,
                  offlineSession: false,
                  error: null,
                });
                void syncEngine.triggerSync('reconnect');
              } else {
                clearCachedSession();
                set({
                  status: 'unauthenticated',
                  session: null,
                  offlineSession: false,
                });
              }
            })
            .catch(() => {
              // Keep offlineSession until network validation succeeds
            });
        });
      }

      try {
        const session = await supabaseAuthService.getSession();
        if (session) {
          writeCachedSession(session);
          writeLocalModeFlag(false);
          set({
            status: 'authenticated',
            session,
            localMode: false,
            offlineSession: false,
            error: null,
            initialized: true,
          });
        } else if (isBrowserOffline() && cached) {
          writeLocalModeFlag(false);
          set({
            status: 'authenticated',
            session: cached,
            localMode: false,
            offlineSession: true,
            error: null,
            initialized: true,
          });
        } else {
          clearCachedSession();
          set({
            status: 'unauthenticated',
            session: null,
            offlineSession: false,
            initialized: true,
          });
        }
      } catch (err) {
        if (cached) {
          writeLocalModeFlag(false);
          set({
            status: 'authenticated',
            session: cached,
            localMode: false,
            offlineSession: true,
            error: null,
            initialized: true,
          });
        } else {
          set({
            status: 'unauthenticated',
            session: null,
            offlineSession: false,
            error:
              err instanceof Error
                ? err.message
                : 'Authentication session could not be restored.',
            initialized: true,
          });
        }
      } finally {
        inflightInit = null;
      }
    })();

    return inflightInit;
  },

  signInWithGoogle: async () => {
    set({ isSigningIn: true, error: null });
    try {
      await supabaseAuthService.signInWithGoogle();
    } catch (err) {
      set({
        isSigningIn: false,
        error:
          err instanceof Error ? err.message : 'Google sign-in failed.',
      });
    }
  },

  completeOAuthCallback: async (code) => {
    set({ status: 'loading', error: null });
    try {
      const session = await supabaseAuthService.completeAuthCallback(code);
      if (session) {
        writeCachedSession(session);
        writeLocalModeFlag(false);
        set({
          status: 'authenticated',
          session,
          localMode: false,
          offlineSession: false,
          isSigningIn: false,
          initialized: true,
        });
      } else {
        set({
          status: 'unauthenticated',
          session: null,
          offlineSession: false,
          isSigningIn: false,
          error: 'Sign-in did not produce an active session.',
          initialized: true,
        });
      }
    } catch (err) {
      set({
        status: 'unauthenticated',
        session: null,
        offlineSession: false,
        isSigningIn: false,
        error:
          err instanceof Error ? err.message : 'Authentication callback failed.',
        initialized: true,
      });
    }
  },

  completeNativeOAuthUrl: async (rawUrl) => {
    set({ status: 'loading', error: null });
    try {
      const session = await supabaseAuthService.completeNativeOAuthUrl(rawUrl);
      if (session) {
        writeCachedSession(session);
        writeLocalModeFlag(false);
        set({
          status: 'authenticated',
          session,
          localMode: false,
          offlineSession: false,
          isSigningIn: false,
          initialized: true,
        });
      } else {
        set({
          status: 'unauthenticated',
          session: null,
          offlineSession: false,
          isSigningIn: false,
          error: 'Google sign-in did not return an active session.',
          initialized: true,
        });
      }
    } catch (err) {
      set({
        status: 'unauthenticated',
        session: null,
        offlineSession: false,
        isSigningIn: false,
        error:
          err instanceof Error
            ? err.message
            : 'Native Google sign-in callback failed.',
        initialized: true,
      });
    }
  },

  signOut: async () => {
    set({ error: null });
    try {
      await supabaseAuthService.signOut();
    } finally {
      clearCachedSession();
      writeLocalModeFlag(false);
      set({
        status: supabaseAuthService.isConfigured()
          ? 'unauthenticated'
          : 'unconfigured',
        session: null,
        localMode: false,
        offlineSession: false,
        isSigningIn: false,
      });
    }
  },

  enterLocalMode: () => {
    writeLocalModeFlag(true);
    set({ localMode: true, error: null });
  },

  exitLocalMode: () => {
    writeLocalModeFlag(false);
    set({ localMode: false });
  },

  clearError: () => set({ error: null }),
}));
