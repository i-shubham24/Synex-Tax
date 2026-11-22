import { X509Certificate, createHash, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CCA_ROOTS } from './ccaRoots.js';

/**
 * Checks a DSC signature made by the desktop agent. The agent signs the SHA-256 digest of a
 * payload the server built; the server checks the signature with the public key of the
 * certificate the agent returns, then, when trusted roots are configured, that the certificate
 * chains to one of them (the CCA India roots in production).
 */

export type DscAlgorithm = 'RSA_PKCS1_SHA256' | 'ECDSA_SHA256';

export interface DscCertInfo {
  subject: string;
  commonName: string;
  issuer: string;
  serialHex: string;
  pan: string | null;
  validFrom: string;
  validTo: string;
  fingerprint256: string;
}

export type DscCheck =
  | { ok: true; cert: DscCertInfo; chainVerified: boolean }
  | { ok: false; error: string; message: string; cert?: DscCertInfo };

const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;

let ccaRoots: X509Certificate[] | null = null;

/** The CCA India roots built into the server, each checked against its pinned fingerprint. */
export function builtInCcaRoots(): X509Certificate[] {
  if (!ccaRoots) {
    ccaRoots = CCA_ROOTS.map((r) => {
      const cert = new X509Certificate(r.pem);
      if (cert.fingerprint256 !== r.sha256 || !cert.ca || !cert.checkIssued(cert)) throw new Error(`Built-in root ${r.name} does not match its fingerprint`);
      return cert;
    });
  }
  return ccaRoots;
}

/**
 * Trusted roots: the CCA India roots, unless DSC_TRUSTED_ROOTS (PEM text) or DSC_TRUSTED_ROOTS_FILE
 * (path to a PEM bundle) replaces them, for example when CCA publishes a new root.
 */
export function trustedRoots(env: NodeJS.ProcessEnv = process.env): X509Certificate[] {
  let text = env.DSC_TRUSTED_ROOTS?.replace(/\\n/g, '\n') ?? '';
  if (!text && env.DSC_TRUSTED_ROOTS_FILE) text = readFileSync(env.DSC_TRUSTED_ROOTS_FILE, 'utf8');
  if (!text) return builtInCcaRoots();
  const blocks = text.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  return blocks.map((b) => new X509Certificate(b));
}

/** Attribute values of a distinguished name as Node prints it (one "key=value" per line). */
function dnValues(dn: string): Array<[string, string]> {
  return dn.split('\n').map((line) => {
    const i = line.indexOf('=');
    return [line.slice(0, i).trim(), line.slice(i + 1).trim()] as [string, string];
  });
}

function describe(cert: X509Certificate): DscCertInfo {
  const values = dnValues(cert.subject);
  const pan = values.map(([, v]) => v.toUpperCase()).find((v) => PAN.test(v)) ?? null;
  return {
    subject: cert.subject.replace(/\n/g, ', '),
    commonName: values.find(([k]) => k === 'CN')?.[1] ?? '',
    issuer: cert.issuer.replace(/\n/g, ', '),
    serialHex: cert.serialNumber.toUpperCase().replace(/^0+(?=.)/, ''),
    pan,
    validFrom: new Date(cert.validFrom).toISOString(),
    validTo: new Date(cert.validTo).toISOString(),
    fingerprint256: cert.fingerprint256,
  };
}

const inDate = (c: X509Certificate, now: Date) => new Date(c.validFrom) <= now && now <= new Date(c.validTo);

/** True when the subject carries the PAN, in plain or as its SHA-256 hash. */
export function certificateHasPan(cert: DscCertInfo, pan: string): boolean {
  const p = pan.toUpperCase();
  if (cert.pan === p) return true;
  const hashed = createHash('sha256').update(p).digest('hex');
  return cert.subject.toLowerCase().includes(hashed);
}

function chainsToRoot(leaf: X509Certificate, intermediates: X509Certificate[], roots: X509Certificate[], now: Date): boolean {
  let current = leaf;
  for (let depth = 0; depth < 6; depth++) {
    if (roots.some((r) => r.fingerprint256 === current.fingerprint256)) return true;
    const root = roots.find((r) => inDate(r, now) && current.checkIssued(r) && current.verify(r.publicKey));
    if (root) return true;
    const next = intermediates.find((i) => i.ca && inDate(i, now) && current.checkIssued(i) && current.verify(i.publicKey));
    if (!next || next.fingerprint256 === current.fingerprint256) return false;
    current = next;
  }
  return false;
}

export function checkDscSignature(input: {
  payload: string;
  signature: string;
  algorithm: DscAlgorithm;
  certificate: string;
  chain?: string[];
  roots: X509Certificate[];
  now?: Date;
  expectedPan?: string | null;
}): DscCheck {
  const now = input.now ?? new Date();
  let cert: X509Certificate;
  try {
    cert = new X509Certificate(Buffer.from(input.certificate, 'base64'));
  } catch {
    return { ok: false, error: 'BAD_CERTIFICATE', message: 'The certificate sent with the signature could not be read.' };
  }
  const info = describe(cert);
  if (!inDate(cert, now)) {
    return { ok: false, error: 'CERTIFICATE_EXPIRED', message: 'The DSC is not valid today.', cert: info };
  }
  const keyType = cert.publicKey.asymmetricKeyType;
  if ((input.algorithm === 'RSA_PKCS1_SHA256') !== (keyType === 'rsa') || (input.algorithm === 'ECDSA_SHA256') !== (keyType === 'ec')) {
    return { ok: false, error: 'ALGORITHM_MISMATCH', message: 'The signature type does not match the certificate key.', cert: info };
  }
  const good = verify('sha256', Buffer.from(input.payload, 'utf8'), { key: cert.publicKey, dsaEncoding: 'der' }, Buffer.from(input.signature, 'base64'));
  if (!good) {
    return { ok: false, error: 'SIGNATURE_INVALID', message: 'The signature does not match this return and certificate.', cert: info };
  }
  if (input.expectedPan && !certificateHasPan(info, input.expectedPan)) {
    return { ok: false, error: 'SIGNATORY_PAN_MISMATCH', message: 'This DSC does not belong to the authorised signatory.', cert: info };
  }
  const intermediates: X509Certificate[] = [];
  for (const c of input.chain ?? []) {
    try {
      intermediates.push(new X509Certificate(Buffer.from(c, 'base64')));
    } catch {
      /* an unreadable issuer is ignored; the chain then fails if it was needed */
    }
  }
  const chainVerified = input.roots.length > 0 && chainsToRoot(cert, intermediates, input.roots, now);
  return { ok: true, cert: info, chainVerified };
}
