import { create } from 'zustand';
import type { AuthSession } from '@/services/auth/auth.service';
import { supabaseAuthService } from '@/services/auth/supabase-auth.service';

export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'unconfigured';

const LOCAL_MODE_STORAGE_KEY = 'nexus-local-mode';

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

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  status: 'loading',
  session: null,
  error: null,
  isSigningIn: false,
  localMode: readLocalModeFlag(),
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    if (inflightInit) return inflightInit;

    inflightInit = (async () => {
      if (!supabaseAuthService.isConfigured()) {
        set({
          status: 'unconfigured',
          session: null,
          initialized: true,
        });
        return;
      }

      if (authUnsubscribe) {
        authUnsubscribe();
      }

      authUnsubscribe = supabaseAuthService.onAuthStateChange((session) => {
        if (session) {
          writeLocalModeFlag(false);
          set({
            status: 'authenticated',
            session,
            localMode: false,
            error: null,
          });
        } else {
          set({
            status: 'unauthenticated',
            session: null,
          });
        }
      });

      try {
        const session = await supabaseAuthService.getSession();
        if (session) {
          writeLocalModeFlag(false);
          set({
            status: 'authenticated',
            session,
            localMode: false,
            error: null,
            initialized: true,
          });
        } else {
          set({
            status: 'unauthenticated',
            session: null,
            initialized: true,
          });
        }
      } catch (err) {
        set({
          status: 'unauthenticated',
          session: null,
          error:
            err instanceof Error
              ? err.message
              : 'Authentication session could not be restored.',
          initialized: true,
        });
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
        writeLocalModeFlag(false);
        set({
          status: 'authenticated',
          session,
          localMode: false,
          isSigningIn: false,
          initialized: true,
        });
      } else {
        set({
          status: 'unauthenticated',
          session: null,
          isSigningIn: false,
          error: 'Sign-in did not produce an active session.',
          initialized: true,
        });
      }
    } catch (err) {
      set({
        status: 'unauthenticated',
        session: null,
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
        writeLocalModeFlag(false);
        set({
          status: 'authenticated',
          session,
          localMode: false,
          isSigningIn: false,
          initialized: true,
        });
      } else {
        set({
          status: 'unauthenticated',
          session: null,
          isSigningIn: false,
          error: 'Google sign-in did not return an active session.',
          initialized: true,
        });
      }
    } catch (err) {
      set({
        status: 'unauthenticated',
        session: null,
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
      writeLocalModeFlag(false);
      set({
        status: supabaseAuthService.isConfigured()
          ? 'unauthenticated'
          : 'unconfigured',
        session: null,
        localMode: false,
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
