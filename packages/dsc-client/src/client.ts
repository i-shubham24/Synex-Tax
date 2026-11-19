import {
  AgentHealthStatus,
  TokenCertificateInfo,
  SignDigestPayload,
  SignDigestResult,
} from './types.js';

export interface DscBridgeClientOptions {
  agentBaseUrl?: string;
  timeoutMs?: number;
  mockMode?: boolean;
}

const DEFAULT_AGENT_URL = 'http://127.0.0.1:18531';
const DEFAULT_TIMEOUT_MS = 15000;

export class DscBridgeClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly mockMode: boolean;

  constructor(options: DscBridgeClientOptions = {}) {
    this.baseUrl = (options.agentBaseUrl || DEFAULT_AGENT_URL).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.mockMode = !!options.mockMode;
  }

  /**
   * Checks whether the local desktop USB bridge daemon is running on 127.0.0.1:18531.
   */
  public async checkHealth(): Promise<AgentHealthStatus> {
    if (this.mockMode) {
      return {
        status: 'ONLINE',
        version: '0.1.0-mock',
        daemon: 'SynexTax Local Desktop DSC Bridge (Mock)',
        listenAddress: this.baseUrl,
        tokensDetected: 1,
        tallyReachable: true,
        tallyStatus: 'CONNECTED',
        currentTimestamp: new Date().toISOString(),
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);

      if (!res.ok) {
        return {
          status: 'OFFLINE',
          tokensDetected: 0,
          tallyReachable: false,
        };
      }

      return (await res.json()) as AgentHealthStatus;
    } catch {
      return {
        status: 'OFFLINE',
        tokensDetected: 0,
        tallyReachable: false,
      };
    }
  }

  /**
   * Discovers connected FIPS 140-2 / FIPS 140-3 Class 3 USB DSC tokens.
   */
  public async listTokens(): Promise<TokenCertificateInfo[]> {
    if (this.mockMode) {
      return [
        {
          subjectName: 'CN=Amrinder Verma, SERIALNUMBER=AABCP1332L, O=Personal, C=IN',
          signatoryPan: 'AABCP1332L',
          commonName: 'Amrinder Verma',
          issuerName: 'CN=e-Mudhra Sub-CA for Class 3 Individual, O=e-Mudhra Consumer Services Limited, C=IN',
          serialNumber: '4B89F2A10984E4',
          validFrom: '2024-04-01T00:00:00Z',
          validTo: '2027-04-01T23:59:59Z',
          isClass3: true,
          hardwareTokenModel: 'Feitian ePass2003 (FIPS 140-2 Level 3 Mock)',
        },
      ];
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const res = await fetch(`${this.baseUrl}/api/v1/tokens`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`DSC Agent returned HTTP ${res.status} when listing tokens`);
    }

    const data = (await res.json()) as { tokens: TokenCertificateInfo[] };
    return data.tokens;
  }

  /**
   * Prompts user for token PIN and signs the return filing SHA-256 digest on physical USB token.
   */
  public async signDigest(payload: SignDigestPayload): Promise<SignDigestResult> {
    if (!payload.challengeNonce || payload.challengeNonce.length !== 64) {
      throw new Error('Invalid challenge nonce: Must be 64-character SHA-256 hex string');
    }
    if (!payload.digestSha256 || payload.digestSha256.length !== 64) {
      throw new Error('Invalid digest: Must be 64-character SHA-256 hex string');
    }
    if (!payload.tokenPin) {
      throw new Error('Token PIN is required for hardware PKCS#11 signing');
    }

    if (this.mockMode) {
      const tokens = await this.listTokens();
      const cert = tokens[0];

      if (payload.expectedPan && cert.signatoryPan !== payload.expectedPan.toUpperCase()) {
        throw new Error(
          `DSC token PAN ${cert.signatoryPan} does not match expected signatory PAN ${payload.expectedPan}`
        );
      }

      return {
        signatureHex: '30450221008f1b62...' + payload.digestSha256 + payload.challengeNonce.substring(0, 16),
        certificate: cert,
        signingTimestamp: new Date().toISOString(),
        algorithm: 'SHA256withRSA/PKCS1Padding',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const res = await fetch(`${this.baseUrl}/api/v1/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'UNKNOWN_AGENT_ERROR' }));
      throw new Error(`Signing failed (${res.status}): ${(err as { error?: string }).error || 'Agent error'}`);
    }

    return (await res.json()) as SignDigestResult;
  }
}
