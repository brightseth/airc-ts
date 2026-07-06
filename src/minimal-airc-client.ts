import {
  createPrivateKey,
  generateKeyPairSync,
  sign as edSign,
} from 'node:crypto';

export type AIRCStatus = 'available' | 'busy' | 'away';

export interface AIRCKeypair {
  publicKey: string;
  privateKey: string;
}

export interface AIRCRegisterResult {
  success: boolean;
  token?: string;
  sessionId?: string;
  error?: string;
}

export interface AIRCMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  pendingConsent?: boolean;
}

export interface AIRCMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  type?: string;
  timestamp: string;
  signature?: string;
}

export interface AIRCMessagesResponse {
  messages: AIRCMessage[];
}

export interface AIRCPresenceResponse {
  users?: Array<{ handle?: string; username?: string }>;
  active?: Array<{ handle?: string; username?: string }>;
  away?: Array<{ handle?: string; username?: string }>;
  recent?: Array<{ handle?: string; username?: string }>;
  offline?: Array<{ handle?: string; username?: string }>;
  [key: string]: unknown;
}

export class MinimalAircClient {
  private readonly registry: string;
  private readonly handle: string;
  private token: string | null = null;
  private keypair: AIRCKeypair;

  constructor(handle: string, options: { registry?: string; keypair?: AIRCKeypair } = {}) {
    const cleaned = handle.replace(/^@/, '').trim();
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(cleaned)) {
      throw new Error('Invalid handle. Must be 3-32 chars: letters, numbers, underscores.');
    }

    this.handle = cleaned;
    this.registry = (options.registry || 'https://www.slashvibe.dev').replace(/\/$/, '');
    this.keypair = options.keypair || MinimalAircClient.generateKeypair();
  }

  get publicKey(): string {
    return this.keypair.publicKey;
  }

  get privateKey(): string {
    return this.keypair.privateKey;
  }

  get username(): string {
    return this.handle;
  }

  get sessionToken(): string | null {
    return this.token;
  }

  public static generateKeypair(): AIRCKeypair {
    const keys = generateKeyPairSync('ed25519');
    return {
      publicKey: keys.publicKey
        .export({ type: 'spki', format: 'der' })
        .toString('base64'),
      privateKey: keys.privateKey
        .export({ type: 'pkcs8', format: 'der' })
        .toString('base64'),
    };
  }

  public async register(workingOn = 'Coding with AIRC'): Promise<AIRCRegisterResult> {
    const body = {
      action: 'register' as const,
      username: this.handle,
      status: 'available' as AIRCStatus,
      workingOn,
    };

    const result = await this.request<AIRCRegisterResult>('POST', '/api/presence', body);
    if (result.token) {
      this.token = result.token;
    }

    return result;
  }

  public async heartbeat(status: AIRCStatus = 'available'): Promise<void> {
    await this.request('POST', '/api/presence', {
      action: 'heartbeat' as const,
      username: this.handle,
      status,
    });
  }

  public async sendSignedMessage(
    to: string,
    text: string,
    type = 'text'
  ): Promise<AIRCMessageResponse> {
    const toHandle = to.replace(/^@/, '');
    const body = {
      from: this.handle,
      to: toHandle,
      text,
      type,
    };

    const signature = this.sign(body);
    return this.request<AIRCMessageResponse>(
      'POST',
      '/api/messages',
      body,
      {
        'X-AIRC-Signature': signature,
        'X-AIRC-Identity': this.handle,
      }
    );
  }

  public async pollMessages(since?: number): Promise<AIRCMessage[]> {
    const params = new URLSearchParams({ user: this.handle });
    if (since) params.set('since', String(since));
    const response = await this.request<AIRCMessagesResponse>('GET', `/api/messages?${params.toString()}`);
    return response.messages || [];
  }

  public async getPresence(): Promise<AIRCPresenceResponse> {
    return this.request<AIRCPresenceResponse>('GET', '/api/presence');
  }

  public extractPresenceHandles(presence: AIRCPresenceResponse): string[] {
    const buckets = [
      presence.users,
      presence.active,
      presence.away,
      presence.recent,
      presence.offline,
    ];

    const handles = new Set<string>();
    for (const bucket of buckets) {
      if (!Array.isArray(bucket)) continue;
      for (const user of bucket) {
        if (user.handle) handles.add(user.handle);
        if (user.username) handles.add(user.username);
      }
    }

    return Array.from(handles);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.registry}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const raw = await response.text();
    const payload = this.safeJson(raw);

    if (!response.ok) {
      const message = typeof payload === 'object' && payload && 'message' in payload
        ? String(payload.message)
        : `HTTP ${response.status} ${response.statusText}`;
      throw new Error(message);
    }

    return payload as T;
  }

  private safeJson(raw: string): unknown {
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }

  private sign(body: Record<string, unknown>): string {
    const canonical = canonicalJSON(body);
    const privateKey = createPrivateKey({
      key: Buffer.from(this.privateKey, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });

    const signature = edSign(null, Buffer.from(canonical, 'utf8'), privateKey);
    return `ed25519:${signature.toString('base64')}`;
  }
}

export function canonicalJSON(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJSON(item)).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys
      .map((key) => {
        if (obj[key] === undefined) return null;
        return `${JSON.stringify(key)}:${canonicalJSON(obj[key])}`;
      })
      .filter((value): value is string => value !== null);
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(value);
}
