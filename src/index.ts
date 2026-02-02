/**
 * AIRC - Agent Identity & Relay Communication
 *
 * TypeScript client for the AIRC protocol.
 * https://airc.chat
 */

import {
  getOrCreateKeypair,
  createSignedMessage,
  generateRecoveryKeypair,
  saveRecoveryKeypair,
  loadRecoveryKeypair,
  generateRotationProof,
  generateRevocationProof,
  generateKeypair,
  saveKeypair,
  type Keypair,
  type SignedMessage,
} from './crypto.js';

// ============ Types ============

export interface AIRCConfig {
  /** Registry URL (default: https://registry.airc.chat) */
  registry?: string;
  /** What you're working on (shown to others) */
  workingOn?: string;
  /** Signing mode: 'none' | 'optional' | 'required' */
  signing?: 'none' | 'optional' | 'required';
  /** Auto-generate keys if not present (default: true) */
  autoGenerateKeys?: boolean;
  /** Generate recovery key for key rotation (AIRC v0.2, default: false) */
  withRecoveryKey?: boolean;
}

export interface User {
  username: string;
  workingOn?: string;
  status?: 'available' | 'busy' | 'away';
  lastSeen?: string;
}

export interface Message {
  id: string;
  from: string;
  to: string;
  text: string;
  type?: string;
  timestamp: number;
  payload?: unknown;
}

export interface RegisterResult {
  success: boolean;
  token?: string;
  sessionId?: string;
  error?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  pendingConsent?: boolean;
}

export interface PollResult {
  messages: Message[];
}

export interface WhoResult {
  users: User[];
}

// ============ Errors ============

export class AIRCError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number
  ) {
    super(message);
    this.name = 'AIRCError';
  }
}

// ============ Client ============

const DEFAULT_REGISTRY = 'https://registry.airc.chat';

export class Client {
  private registry: string;
  private handle: string;
  private token: string | null = null;
  private workingOn: string;
  private signingMode: 'none' | 'optional' | 'required';
  private autoGenerateKeys: boolean;
  private withRecoveryKey: boolean;
  private keypair: Keypair | null = null;
  private recoveryKeypair: Keypair | null = null;
  private keysInitialized = false;
  private _registered = false;

  constructor(handle: string, config: AIRCConfig = {}) {
    this.handle = handle.replace(/^@/, '');
    this.registry = (config.registry || DEFAULT_REGISTRY).replace(/\/$/, '');
    this.workingOn = config.workingOn || 'Building with AIRC';
    this.signingMode = config.signing || 'optional';
    this.autoGenerateKeys = config.autoGenerateKeys !== false;
    this.withRecoveryKey = config.withRecoveryKey || false;
  }

  // ============ Core API ============

  /**
   * Initialize keys (called automatically on first use)
   */
  private async initializeKeys(): Promise<void> {
    if (this.keysInitialized) return;
    this.keysInitialized = true;

    if (this.signingMode === 'none') {
      return;
    }

    if (this.autoGenerateKeys) {
      this.keypair = await getOrCreateKeypair(this.handle);

      // Generate recovery key if requested (AIRC v0.2)
      if (this.withRecoveryKey) {
        this.recoveryKeypair = await loadRecoveryKeypair(this.handle);
        if (!this.recoveryKeypair) {
          this.recoveryKeypair = generateRecoveryKeypair();
          await saveRecoveryKeypair(this.handle, this.recoveryKeypair);
        }
      }
    }
  }

  /**
   * Register with the AIRC network.
   * Call this before sending messages.
   */
  async register(): Promise<RegisterResult> {
    await this.initializeKeys();

    // Try /api/presence for registration (works in safe mode and production)
    // /api/users exists but requires social verification — not suitable for programmatic agents
    const presenceBody: Record<string, unknown> = {
      action: 'register',
      username: this.handle,
      workingOn: this.workingOn,
    };

    // Include public key if available
    if (this.keypair) {
      presenceBody.publicKey = `ed25519:${this.keypair.publicKey}`;
    }

    const result = await this.post<RegisterResult>('/api/presence', presenceBody);

    if (result.success && result.token) {
      this.token = result.token;
    }

    // Mark as registered even without token (server may be in legacy mode)
    if (result.success) {
      this._registered = true;
    }

    return result;
  }

  /**
   * Send heartbeat to stay online.
   * Call every 30 seconds in long-running sessions.
   */
  async heartbeat(status: 'available' | 'busy' | 'away' = 'available'): Promise<void> {
    await this.post('/api/presence', {
      action: 'heartbeat',
      username: this.handle,
      status,
    });
  }

  /**
   * Get list of online agents.
   */
  async who(): Promise<User[]> {
    const result = await this.get<Record<string, unknown>>('/api/presence');
    // Server may return { users: [...] } or { active: [...], away: [...] }
    if (Array.isArray(result.users)) return result.users as User[];
    const active = (result.active || []) as User[];
    const away = (result.away || []) as User[];
    return [...active, ...away];
  }

  /**
   * Send a message to another agent.
   */
  async send(to: string, text: string, type = 'text', payload?: unknown): Promise<SendResult> {
    await this.initializeKeys();

    const recipient = to.replace(/^@/, '');

    // Build message body
    let messageBody: Record<string, unknown> | SignedMessage;

    // Sign if we have keys and signing is not disabled
    if (this.keypair && this.signingMode !== 'none') {
      messageBody = createSignedMessage(
        {
          from: this.handle,
          to: recipient,
          text,
          type,
          payload,
        },
        this.keypair.privateKey
      );
    } else {
      // Unsigned message (Safe Mode)
      if (this.signingMode === 'required') {
        throw new AIRCError(
          'Signing is required but no keys available',
          'SIGNING_REQUIRED'
        );
      }

      messageBody = {
        from: this.handle,
        to: recipient,
        text,
        type,
      };

      if (payload) {
        messageBody.payload = payload;
      }
    }

    return this.post<SendResult>('/api/messages', messageBody);
  }

  /**
   * Poll for new messages.
   */
  async poll(since?: number): Promise<Message[]> {
    let url = `/api/messages?user=${this.handle}`;
    if (since) url += `&since=${since}`;

    const result = await this.get<PollResult>(url);
    return result.messages || [];
  }

  /**
   * Get conversation thread with specific agent.
   */
  async thread(withUser: string): Promise<Message[]> {
    const other = withUser.replace(/^@/, '');
    const url = `/api/messages?user=${this.handle}&with=${other}`;
    const result = await this.get<PollResult>(url);
    return result.messages || [];
  }

  /**
   * Accept a connection request.
   */
  async accept(fromUser: string): Promise<void> {
    await this.post('/api/consent', {
      action: 'accept',
      from: this.handle,
      handle: fromUser.replace(/^@/, ''),
    });
  }

  /**
   * Block a user.
   */
  async block(user: string): Promise<void> {
    await this.post('/api/consent', {
      action: 'block',
      from: this.handle,
      handle: user.replace(/^@/, ''),
    });
  }

  // ============ AIRC v0.2: Key Rotation & Revocation ============

  /**
   * Rotate signing key using recovery key (AIRC v0.2)
   * @param newPublicKey - Optional new public key (generates if not provided)
   * @param recoveryPrivateKey - Optional recovery private key (uses stored if not provided)
   * @returns New session token
   */
  async rotateKey(newPublicKey?: string, recoveryPrivateKey?: string): Promise<string> {
    // Get recovery key
    const recoveryKey = recoveryPrivateKey || this.recoveryKeypair?.privateKey;
    if (!recoveryKey) {
      throw new AIRCError(
        'Recovery key required for rotation',
        'NO_RECOVERY_KEY'
      );
    }

    // Generate new keypair if not provided
    let newPubKey = newPublicKey;
    if (!newPubKey) {
      const newKeypair = generateKeypair();
      newPubKey = `ed25519:${newKeypair.publicKey}`;

      // Save new keypair
      this.keypair = newKeypair;
      await saveKeypair(this.handle, newKeypair);
    }

    // Generate proof
    const proof = generateRotationProof(newPubKey, recoveryKey);

    // Send rotation request
    const response = await fetch(`${this.registry}/api/identity/${this.handle}/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_public_key: newPubKey,
        proof,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new AIRCError(
        error.message || 'Key rotation failed',
        error.error,
        response.status
      );
    }

    const data = await response.json();

    // Update token
    if (data.token) {
      this.token = data.token;
    }

    return data.token;
  }

  /**
   * Revoke identity permanently (AIRC v0.2)
   * WARNING: This action cannot be undone
   * @param reason - Reason for revocation
   * @param recoveryPrivateKey - Optional recovery private key (uses stored if not provided)
   */
  async revokeIdentity(reason: string, recoveryPrivateKey?: string): Promise<void> {
    // Get recovery key
    const recoveryKey = recoveryPrivateKey || this.recoveryKeypair?.privateKey;
    if (!recoveryKey) {
      throw new AIRCError(
        'Recovery key required for revocation',
        'NO_RECOVERY_KEY'
      );
    }

    // Generate proof
    const proof = generateRevocationProof(this.handle, reason, recoveryKey);

    // Send revocation request
    const response = await fetch(`${this.registry}/api/identity/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proof),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new AIRCError(
        error.message || 'Revocation failed',
        error.error,
        response.status
      );
    }

    // Clear local state
    this.token = null;
  }

  /**
   * Get recovery keypair (AIRC v0.2)
   * @returns Recovery keypair or null if not available
   */
  async getRecoveryKey(): Promise<Keypair | null> {
    if (this.recoveryKeypair) {
      return this.recoveryKeypair;
    }

    // Try loading from disk
    return await loadRecoveryKeypair(this.handle);
  }

  // ============ Getters ============

  /** Get the current handle */
  get name(): string {
    return this.handle;
  }

  /** Check if registered */
  get isRegistered(): boolean {
    return this._registered || this.token !== null;
  }

  /** Get public key if available */
  get publicKey(): string | null {
    return this.keypair?.publicKey || null;
  }

  /** Check if signing is enabled */
  get signingEnabled(): boolean {
    return this.signingMode !== 'none' && this.keypair !== null;
  }

  // ============ HTTP Helpers ============

  private async post<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.registry}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new AIRCError(
        `HTTP ${response.status}: ${text}`,
        'HTTP_ERROR',
        response.status
      );
    }

    return response.json();
  }

  private async get<T>(endpoint: string): Promise<T> {
    const url = `${this.registry}${endpoint}`;
    const headers: Record<string, string> = {};

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const text = await response.text();
      throw new AIRCError(
        `HTTP ${response.status}: ${text}`,
        'HTTP_ERROR',
        response.status
      );
    }

    return response.json();
  }
}

// ============ Exports ============

export default Client;

// Re-export crypto utilities for advanced use
export {
  canonicalJSON,
  generateKeypair,
  sign,
  verify,
  createSignedMessage,
  generateRecoveryKeypair,
  saveRecoveryKeypair,
  loadRecoveryKeypair,
  generateRotationProof,
  generateRevocationProof,
  type Keypair,
  type SignedMessage,
} from './crypto.js';
