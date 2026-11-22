import { test } from 'node:test';
import assert from 'node:assert/strict';
import { X509Certificate, createPrivateKey, sign } from 'node:crypto';
import { checkDscSignature, trustedRoots } from './dscSignature.js';
import { TEST_LEAF_EC, TEST_LEAF_EC_KEY, TEST_LEAF_RSA, TEST_LEAF_RSA_KEY, TEST_ROOT, TEST_SUB_CA } from './dscSignature.fixtures.js';

const der = (pem: string) => new X509Certificate(pem).raw.toString('base64');
const now = new Date('2026-11-21T10:00:00Z');
const payload = JSON.stringify({ filingId: 'f-1', form: 'GSTR-3B', period: '102026' });
const signRsa = (p: string) => sign('sha256', Buffer.from(p), createPrivateKey(TEST_LEAF_RSA_KEY)).toString('base64');

test('DSC signature: checked against the certificate, PAN and chain', () => {
  const roots = trustedRoots({ DSC_TRUSTED_ROOTS: TEST_ROOT.replace(/\n/g, '\\n') });
  assert.equal(roots.length, 1);
  const base = { payload, signature: signRsa(payload), algorithm: 'RSA_PKCS1_SHA256' as const, certificate: der(TEST_LEAF_RSA), now };

  const ok = checkDscSignature({ ...base, chain: [der(TEST_SUB_CA)], roots, expectedPan: 'AAAPV8912K' });
  assert.ok(ok.ok);
  assert.equal(ok.chainVerified, true);
  assert.equal(ok.cert.pan, 'AAAPV8912K');
  assert.equal(ok.cert.commonName, 'Test Signer');
  assert.equal(ok.cert.serialHex, '3A4B892F');

  // Without the issuing CA, or without trusted roots, the signature still checks but the chain does not.
  const noChain = checkDscSignature({ ...base, roots });
  assert.ok(noChain.ok && !noChain.chainVerified);
  const noRoots = checkDscSignature({ ...base, chain: [der(TEST_SUB_CA)], roots: [] });
  assert.ok(noRoots.ok && !noRoots.chainVerified);

  // A changed return, a different signatory, an expired certificate, a wrong algorithm.
  const tampered = checkDscSignature({ ...base, payload: payload.replace('102026', '112026'), roots });
  assert.equal(!tampered.ok && tampered.error, 'SIGNATURE_INVALID');
  const otherPan = checkDscSignature({ ...base, roots, expectedPan: 'BBBPV8912K' });
  assert.equal(!otherPan.ok && otherPan.error, 'SIGNATORY_PAN_MISMATCH');
  const expired = checkDscSignature({ ...base, roots, now: new Date('2037-01-01T00:00:00Z') });
  assert.equal(!expired.ok && expired.error, 'CERTIFICATE_EXPIRED');
  const wrongAlg = checkDscSignature({ ...base, algorithm: 'ECDSA_SHA256', roots });
  assert.equal(!wrongAlg.ok && wrongAlg.error, 'ALGORITHM_MISMATCH');
  const junk = checkDscSignature({ ...base, certificate: 'bm90IGEgY2VydA==', roots });
  assert.equal(!junk.ok && junk.error, 'BAD_CERTIFICATE');
});

test('DSC signature: CCA India roots are built in and trusted by default', () => {
  const roots = trustedRoots({});
  assert.deepEqual(roots.map((r) => r.subject.split('\n').find((l) => l.startsWith('CN='))), ['CN=CCA India 2022', 'CN=CCA India 2022 SPL']);
  assert.ok(roots.every((r) => r.ca && new Date(r.validTo) > now));
  // A certificate from the test CA does not chain to them.
  const r = checkDscSignature({ payload, signature: signRsa(payload), algorithm: 'RSA_PKCS1_SHA256', certificate: der(TEST_LEAF_RSA), chain: [der(TEST_SUB_CA)], roots, now });
  assert.ok(r.ok && !r.chainVerified);
});

test('DSC signature: ECDSA key, PAN held only as its SHA-256 hash', () => {
  const signature = sign('sha256', Buffer.from(payload), { key: createPrivateKey(TEST_LEAF_EC_KEY), dsaEncoding: 'der' }).toString('base64');
  const r = checkDscSignature({ payload, signature, algorithm: 'ECDSA_SHA256', certificate: der(TEST_LEAF_EC), chain: [der(TEST_SUB_CA)], roots: [new X509Certificate(TEST_ROOT)], now, expectedPan: 'aaapv8912k' });
  assert.ok(r.ok);
  assert.equal(r.cert.pan, null);
  assert.equal(r.chainVerified, true);
});
