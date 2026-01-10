/**
 * AIRC Crypto - Ed25519 signing for TypeScript
 *
 * Implements AIRC v0.2 signing:
 * - Ed25519 keypair generation
 * - Canonical JSON serialization
 * - Message signing and verification
 */

import { sign as cryptoSign, verify as cryptoVerify, generateKeyPairSync, KeyObject, createPrivateKey, createPublicKey, randomBytes } from 'crypto';
import { mkdir, readFile, writeFile, chmod } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

// ============ Types ============

export interface Keypair {
  publicKey: string;
  privateKey: string;
}

export interface SignedMessage {
  v: string;
  id: string;
  from: string;
  to: string;
  timestamp: number;
  nonce: string;
  text?: string;      // Message content (for compatibility with unsigned messages)
  body?: string;      // Alias for text (AIRC v0.2 spec)
  type?: string;      // Message type (for compatibility with unsigned messages)
  payload?: unknown;
  signature: string;
}

// ============ Canonical JSON ============

/**
 * Serialize object to canonical JSON per AIRC spec
 * - Keys sorted alphabetically (recursive)
 * - No whitespace
 * - UTF-8 encoding
 */
export function canonicalJSON(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJSON).join(',') + ']';
  }

  // Sort keys alphabetically and recurse
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys
    .filter((k) => (obj as Record<string, unknown>)[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJSON((obj as Record<string, unknown>)[k])}`);
  return '{' + pairs.join(',') + '}';
}

// ============ Key Management ============

const AIRC_DIR = join(homedir(), '.airc', 'keys');

/**
 * Generate a new Ed25519 keypair
 */
export function generateKeypair(): Keypair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  };
}

/**
 * Save keypair to ~/.airc/keys/{handle}.json
 * Sets secure permissions: 0o700 for directory, 0o600 for key file
 */
export async function saveKeypair(handle: string, keypair: Keypair): Promise<void> {
  // Create directory with restricted permissions (owner only)
  await mkdir(AIRC_DIR, { recursive: true, mode: 0o700 });

  // Ensure directory has correct permissions even if it existed
  await chmod(AIRC_DIR, 0o700);

  const keyPath = join(AIRC_DIR, `${handle}.json`);

  // Write key file
  await writeFile(keyPath, JSON.stringify(keypair, null, 2), 'utf8');

  // Set restrictive permissions (owner read/write only)
  await chmod(keyPath, 0o600);
}

/**
 * Load keypair from ~/.airc/keys/{handle}.json
 */
export async function loadKeypair(handle: string): Promise<Keypair | null> {
  try {
    const keyPath = join(AIRC_DIR, `${handle}.json`);
    const data = await readFile(keyPath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

/**
 * Get or generate keypair for a handle
 */
export async function getOrCreateKeypair(handle: string): Promise<Keypair> {
  const existing = await loadKeypair(handle);
  if (existing) return existing;

  const keypair = generateKeypair();
  await saveKeypair(handle, keypair);
  return keypair;
}

// ============ Signing ============

/**
 * Sign an object with Ed25519 private key
 *
 * Per AIRC spec:
 * 1. Clone object
 * 2. Remove 'signature' field if present
 * 3. Serialize to canonical JSON
 * 4. Sign UTF-8 bytes
 */
export function sign(obj: Record<string, unknown>, privateKeyBase64: string): string {
  // Clone and remove signature field
  const toSign = { ...obj };
  delete toSign.signature;

  // Get canonical JSON
  const canonical = canonicalJSON(toSign);

  // Import private key
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });

  // Sign using crypto.sign (proper Ed25519 API)
  const signature = cryptoSign(null, Buffer.from(canonical, 'utf8'), privateKey);

  return signature.toString('base64');
}

/**
 * Verify signature on an object
 */
export function verify(obj: Record<string, unknown>, publicKeyBase64: string): boolean {
  if (!obj.signature || typeof obj.signature !== 'string') return false;

  // Clone and remove signature
  const toVerify = { ...obj };
  const signature = toVerify.signature as string;
  delete toVerify.signature;

  // Get canonical JSON
  const canonical = canonicalJSON(toVerify);

  try {
    // Import public key
    const publicKey = createPublicKey({
      key: Buffer.from(publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });

    // Verify using crypto.verify (proper Ed25519 API)
    return cryptoVerify(
      null,
      Buffer.from(canonical, 'utf8'),
      publicKey,
      Buffer.from(signature, 'base64')
    );
  } catch (e) {
    return false;
  }
}

// ============ Message Signing ============

/**
 * Generate a cryptographically secure random nonce (24 chars, base64url)
 */
export function generateNonce(): string {
  return randomBytes(16).toString('base64url').substring(0, 24);
}

/**
 * Generate AIRC-compliant message ID (16 chars, base64url)
 */
export function generateMessageId(): string {
  return 'msg_' + randomBytes(9).toString('base64url');
}

/**
 * Create a signed AIRC message
 */
export function createSignedMessage(
  params: {
    from: string;
    to: string;
    text?: string;
    type?: string;
    payload?: unknown;
  },
  privateKeyBase64: string
): SignedMessage {
  const message: Record<string, unknown> = {
    v: '0.2',
    id: generateMessageId(),
    from: params.from,
    to: params.to,
    timestamp: Math.floor(Date.now() / 1000),
    nonce: generateNonce(),
  };

  // Include text content (use same value for both 'text' and 'body' for compatibility)
  if (params.text) {
    message.text = params.text;
    message.body = params.text;  // AIRC v0.2 spec field
  }

  // Include type for compatibility with unsigned messages
  if (params.type) {
    message.type = params.type;
  }

  if (params.payload) {
    message.payload = params.payload;
  }

  // Sign
  message.signature = sign(message, privateKeyBase64);

  return message as unknown as SignedMessage;
}

// ============ AIRC v0.2: Recovery Keys ============

const RECOVERY_DIR = join(homedir(), '.airc', 'recovery');

/**
 * Generate a new Ed25519 recovery keypair
 * Recovery keys are used for key rotation and identity revocation
 */
export function generateRecoveryKeypair(): Keypair {
  return generateKeypair();  // Same format as signing keys
}

/**
 * Save recovery keypair to ~/.airc/recovery/{handle}.json
 * Sets read-only permissions: recovery keys should never change
 */
export async function saveRecoveryKeypair(handle: string, keypair: Keypair): Promise<void> {
  // Create directory with restricted permissions (owner only)
  await mkdir(RECOVERY_DIR, { recursive: true, mode: 0o700 });
  await chmod(RECOVERY_DIR, 0o700);

  const keyPath = join(RECOVERY_DIR, `${handle}.json`);

  // Write key file
  await writeFile(keyPath, JSON.stringify(keypair, null, 2), 'utf8');

  // Set read-only permissions (recovery key should never be modified)
  await chmod(keyPath, 0o400);
}

/**
 * Load recovery keypair from ~/.airc/recovery/{handle}.json
 */
export async function loadRecoveryKeypair(handle: string): Promise<Keypair | null> {
  try {
    const keyPath = join(RECOVERY_DIR, `${handle}.json`);
    const data = await readFile(keyPath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

/**
 * Generate proof for key rotation using recovery key
 * @param newPublicKey - New signing public key (ed25519:...)
 * @param recoveryPrivateKey - Recovery private key (base64)
 * @returns Signed proof object
 */
export function generateRotationProof(newPublicKey: string, recoveryPrivateKey: string): {
  new_public_key: string;
  timestamp: number;
  nonce: string;
  signature: string;
} {
  const proof: Record<string, unknown> = {
    new_public_key: newPublicKey,
    timestamp: Math.floor(Date.now() / 1000),
    nonce: randomBytes(16).toString('hex'),
  };

  proof.signature = sign(proof, recoveryPrivateKey);

  return proof as {
    new_public_key: string;
    timestamp: number;
    nonce: string;
    signature: string;
  };
}

/**
 * Generate proof for identity revocation using recovery key
 * @param handle - User handle
 * @param reason - Revocation reason
 * @param recoveryPrivateKey - Recovery private key (base64)
 * @returns Signed revocation proof
 */
export function generateRevocationProof(
  handle: string,
  reason: string,
  recoveryPrivateKey: string
): {
  v: string;
  handle: string;
  action: string;
  reason: string;
  timestamp: number;
  nonce: string;
  proof: string;
} {
  const payload: Record<string, unknown> = {
    v: '0.2',
    handle,
    action: 'revoke',
    reason,
    timestamp: Math.floor(Date.now() / 1000),
    nonce: randomBytes(16).toString('hex'),
  };

  const signature = sign(payload, recoveryPrivateKey);

  return {
    ...payload,
    proof: signature,
  } as {
    v: string;
    handle: string;
    action: string;
    reason: string;
    timestamp: number;
    nonce: string;
    proof: string;
  };
}
