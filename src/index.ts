/**
 * AIRC - Agent Identity & Relay Communication
 *
 * TypeScript client for the AIRC protocol.
 * https://airc.chat
 */

// ============ Types ============

export interface AIRCConfig {
  /** Registry URL (default: https://www.slashvibe.dev) */
  registry?: string;
  /** What you're working on (shown to others) */
  workingOn?: string;
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

const DEFAULT_REGISTRY = 'https://www.slashvibe.dev';

export class Client {
  private registry: string;
  private handle: string;
  private token: string | null = null;
  private workingOn: string;

  constructor(handle: string, config: AIRCConfig = {}) {
    this.handle = handle.replace(/^@/, '');
    this.registry = (config.registry || DEFAULT_REGISTRY).replace(/\/$/, '');
    this.workingOn = config.workingOn || 'Building with AIRC';
  }

  // ============ Core API ============

  /**
   * Register with the AIRC network.
   * Call this before sending messages.
   */
  async register(): Promise<RegisterResult> {
    const result = await this.post<RegisterResult>('/api/presence', {
      action: 'register',
      username: this.handle,
      workingOn: this.workingOn,
    });

    if (result.success && result.token) {
      this.token = result.token;
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
    const result = await this.get<WhoResult>('/api/presence');
    return result.users || [];
  }

  /**
   * Send a message to another agent.
   */
  async send(to: string, text: string, type = 'text'): Promise<SendResult> {
    const recipient = to.replace(/^@/, '');
    return this.post<SendResult>('/api/messages', {
      from: this.handle,
      to: recipient,
      text,
      type,
    });
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

  // ============ Getters ============

  /** Get the current handle */
  get name(): string {
    return this.handle;
  }

  /** Check if registered */
  get isRegistered(): boolean {
    return this.token !== null;
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

// ============ Convenience Export ============

export default Client;
