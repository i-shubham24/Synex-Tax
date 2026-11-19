export interface TokenCertificateInfo {
  subjectName: string;
  signatoryPan: string;
  commonName: string;
  issuerName: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  isClass3: boolean;
  hardwareTokenModel: string;
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

export interface SignDigestPayload {
  challengeNonce: string;
  digestSha256: string;
  tokenPin: string;
  expectedPan?: string;
}

export interface SignDigestResult {
  signatureHex: string;
  certificate: TokenCertificateInfo;
  signingTimestamp: string;
  algorithm: string;
}
