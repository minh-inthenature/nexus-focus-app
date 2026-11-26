const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64(base64: string): Uint8Array {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importEncryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('DRIVE_TOKEN_ENCRYPTION_KEY');
  if (!secret) {
    throw new Error('Server configuration error: missing DRIVE_TOKEN_ENCRYPTION_KEY.');
  }

  let rawKey = fromBase64(secret);
  if (rawKey.byteLength !== 32) {
    // Derive a fixed 256-bit key if user supplied a passphrase rather than raw 32-byte base64
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
    rawKey = new Uint8Array(hash);
  }

  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts sensitive token strings using AES-256-GCM before persisting in DB.
 */
export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await importEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );
  const cipherBytes = new Uint8Array(cipherBuffer);
  return `${toBase64Url(iv)}.${toBase64Url(cipherBytes)}`;
}

/**
 * Decrypts AES-256-GCM token strings from DB.
 */
export async function decryptSecret(payload: string): Promise<string> {
  const [ivPart, cipherPart] = payload.split('.');
  if (!ivPart || !cipherPart) {
    throw new Error('Corrupted encrypted token format.');
  }

  const key = await importEncryptionKey();
  const iv = fromBase64(ivPart);
  const cipherBytes = fromBase64(cipherPart);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherBytes,
  );
  return decoder.decode(plainBuffer);
}

export function generateRandomToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return toBase64Url(bytes);
}

export async function createPkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}
