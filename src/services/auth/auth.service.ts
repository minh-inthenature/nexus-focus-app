import type { EntityId, ISODateString } from '@/types/common';

export interface AuthUser {
  readonly id: EntityId;
  readonly email: string;
  readonly displayName?: string;
  readonly avatarUrl?: string;
}

export interface AuthSession {
  readonly user: AuthUser;
  readonly expiresAt: ISODateString;
  readonly provider: 'google';
}

export type AuthStateListener = (session: AuthSession | null) => void;

/**
 * Contract for user authentication (planned for Supabase Auth + Google OAuth).
 * Keeps UI components decoupled from any auth SDK.
 */
export interface AuthService {
  getSession(): Promise<AuthSession | null>;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  onAuthStateChange(listener: AuthStateListener): () => void;
}
