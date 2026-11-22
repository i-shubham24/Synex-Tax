/** A signing certificate the desktop agent found in the Windows certificate store. */
export interface AgentCertificate {
  /** SHA-1 thumbprint, as Windows shows it. */
  id: string;
  subject: string;
  commonName: string;
  issuer: string;
  serialNumber: string;
  pan?: string;
  validFrom: string;
  validTo: string;
  keyAlgorithm: string;
  provider: string;
  /** True when a smart card or USB token driver holds the key. */
  token: boolean;
}

export interface AgentHealthStatus {
  status: 'ONLINE' | 'OFFLINE';
  version?: string;
  daemon?: string;
  listenAddress?: string;
  tokensDetected: number;
  tallyReachable: boolean;
  tallyStatus?: string;
  currentTimestamp?: string;
}

/** What the agent signs. There is no PIN here: the token's own driver asks for it. */
export interface SignDigestPayload {
  /** Server-signed token for action "dsc.sign" (POST /api/v1/dsc/challenge). */
  challengeToken: string;
  certificateId: string;
  /** SHA-256 of the document the server built, in hex. */
  digestSha256: string;
}

export interface SignDigestResult {
  /** base64 */
  signature: string;
  algorithm: 'RSA_PKCS1_SHA256' | 'ECDSA_SHA256';
  /** base64 DER of the signing certificate */
  certificate: string;
  /** base64 DER of the issuers Windows found */
  chain: string[];
  certificateInfo: AgentCertificate;
  signingTimestamp: string;
}
