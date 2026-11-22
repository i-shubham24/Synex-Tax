import { AgentCertificate, AgentHealthStatus, SignDigestPayload, SignDigestResult } from './types.js';

export interface DscBridgeClientOptions {
  agentBaseUrl?: string;
  timeoutMs?: number;
  /** Signing waits for the user to enter the PIN in the token's window. */
  signTimeoutMs?: number;
}

const DEFAULT_AGENT_URL = 'http://127.0.0.1:18531';

/** Talks to the SynexTax desktop agent on this computer (apps/dsc-agent). */
export class DscBridgeClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly signTimeoutMs: number;

  constructor(options: DscBridgeClientOptions = {}) {
    this.baseUrl = (options.agentBaseUrl || DEFAULT_AGENT_URL).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs || 15_000;
    this.signTimeoutMs = options.signTimeoutMs || 120_000;
  }

  private async call(path: string, init: RequestInit, ms: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(`${this.baseUrl}${path}`, { ...init, signal: controller.signal, headers: { Accept: 'application/json', ...(init.headers as Record<string, string>) } });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Whether the agent is running on this computer. */
  public async checkHealth(): Promise<AgentHealthStatus> {
    try {
      const res = await this.call('/health', {}, this.timeoutMs);
      if (!res.ok) return { status: 'OFFLINE', tokensDetected: 0, tallyReachable: false };
      return (await res.json()) as AgentHealthStatus;
    } catch {
      return { status: 'OFFLINE', tokensDetected: 0, tallyReachable: false };
    }
  }

  /** Signing certificates on this computer whose key can be used now. */
  public async listCertificates(): Promise<AgentCertificate[]> {
    const res = await this.call('/api/v1/tokens', {}, this.timeoutMs);
    if (!res.ok) throw new Error(`The agent returned HTTP ${res.status} when listing certificates`);
    return ((await res.json()) as { tokens: AgentCertificate[] }).tokens ?? [];
  }

  /** Signs a server-built digest. The token's own driver asks for the PIN. */
  public async signDigest(payload: SignDigestPayload): Promise<SignDigestResult> {
    if (!/^[0-9a-f]{64}$/i.test(payload.digestSha256)) throw new Error('The digest must be 64 hex characters (SHA-256)');
    if (!payload.challengeToken) throw new Error('A server-signed challenge token is required');
    if (!payload.certificateId) throw new Error('Choose a certificate');
    const res = await this.call(
      '/api/v1/sign',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      this.signTimeoutMs,
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(`Signing failed (${res.status}): ${(err.error || 'agent error').replace(/^dsc: /, '')}`);
    }
    return (await res.json()) as SignDigestResult;
  }
}
