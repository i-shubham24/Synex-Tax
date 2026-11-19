import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildApp } from './app.js';
import { hashPassword, verifyPassword, verifyTotpToken, generateTotpCode } from './security/cryptoUtils.js';
import { validateSafeOutboundUrl } from './security/ssrfGuard.js';
import { verifyWebhookSignature } from './security/webhookSecurity.js';
import { CircuitBreaker, retryWithBackoff } from './resilience/circuitBreaker.js';

test('Fastify API: Health check & Kubernetes Liveness / Readiness probes', async () => {
  const app = buildApp();

  const healthRes = await app.inject({
    method: 'GET',
    url: '/health',
  });
  assert.equal(healthRes.statusCode, 200);
  const healthBody = JSON.parse(healthRes.body);
  assert.equal(healthBody.status, 'HEALTHY');
  assert.equal(healthBody.service, 'synextax-api');

  // Liveness probe
  const liveRes = await app.inject({
    method: 'GET',
    url: '/health/liveness',
  });
  assert.equal(liveRes.statusCode, 200);
  assert.equal(JSON.parse(liveRes.body).status, 'ALIVE');

  // Readiness probe
  const readyRes = await app.inject({
    method: 'GET',
    url: '/health/readiness',
  });
  assert.equal(readyRes.statusCode, 200);
  assert.equal(JSON.parse(readyRes.body).status, 'READY');
});

test('Fastify API: Security Headers & CSP Enforcement', async () => {
  const app = buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/health',
  });

  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.ok(res.headers['content-security-policy']);
  assert.match(res.headers['content-security-policy'] as string, /default-src 'self'/);
});

test('Fastify API: CSRF Protection Plugin issues and validates tokens', async () => {
  const app = buildApp();

  // 1. Fetch CSRF token
  const csrfRes = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/csrf',
  });
  assert.equal(csrfRes.statusCode, 200);
  const csrfData = JSON.parse(csrfRes.body);
  assert.ok(csrfData.csrfToken);
  assert.equal(csrfData.headerName, 'x-csrf-token');

  // 2. Mutating request without CSRF token or Bearer token is rejected with 403 Forbidden
  const rejectRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      email: 'ca.verma@synextax.com',
      password: 'Partner@2026!',
    },
  });
  assert.equal(rejectRes.statusCode, 403);
  assert.match(JSON.parse(rejectRes.body).message, /Missing CSRF token/);

  // 3. Mutating request with valid CSRF token succeeds
  const allowRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: {
      'x-csrf-token': csrfData.csrfToken,
    },
    payload: {
      email: 'ca.verma@synextax.com',
      password: 'Partner@2026!',
    },
  });
  assert.equal(allowRes.statusCode, 200);
  assert.equal(JSON.parse(allowRes.body).mfaRequired, true);
});

test('Fastify API: Auth Flow, Scrypt Hashing, RFC 6238 TOTP, and BOLA Guards', async () => {
  const app = buildApp();

  // 1. Fetch CSRF token
  const csrfRes = await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' });
  const { csrfToken } = JSON.parse(csrfRes.body);

  // 2. Login as Partner CA Amrinder Verma
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'x-csrf-token': csrfToken },
    payload: {
      email: 'ca.verma@synextax.com',
      password: 'Partner@2026!',
    },
  });

  assert.equal(loginRes.statusCode, 200);
  const loginBody = JSON.parse(loginRes.body);
  assert.equal(loginBody.mfaRequired, true);

  // 3. Verify MFA TOTP code
  const verifyRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/mfa/verify',
    headers: { 'x-csrf-token': csrfToken },
    payload: {
      sessionToken: loginBody.sessionToken,
      totpCode: '123456',
    },
  });

  assert.equal(verifyRes.statusCode, 200);
  const authData = JSON.parse(verifyRes.body);
  assert.ok(authData.accessToken);
  assert.equal(authData.user.role, 'PARTNER');

  // 4. Fetch 4-Tier Hierarchy Tree
  const treeRes = await app.inject({
    method: 'GET',
    url: '/api/v1/client-master/tree',
    headers: {
      authorization: `Bearer ${authData.accessToken}`,
    },
  });

  assert.equal(treeRes.statusCode, 200);
  const treeBody = JSON.parse(treeRes.body);
  assert.ok(treeBody.totalGroups >= 1);

  // 5. BOLA Guard Test: Attempting to create entity with non-existent or foreign clientGroupId must be rejected with 403 Forbidden
  const foreignGroupId = '00000000-dead-beef-0000-000000000000';
  const bolaRes = await app.inject({
    method: 'POST',
    url: '/api/v1/client-master/entities',
    headers: {
      authorization: `Bearer ${authData.accessToken}`,
    },
    payload: {
      clientGroupId: foreignGroupId,
      pan: 'ABCFE1234F',
      legalName: 'Attacker Foreign Entity',
      constitution: 'LLP',
      accountingSoftware: 'TALLY_PRIME',
      isRule14bEco: false,
      rule86bExempt: false,
    },
  });

  assert.equal(bolaRes.statusCode, 403);
  const bolaBody = JSON.parse(bolaRes.body);
  assert.match(bolaBody.message, /BOLA guard/);
});

test('Fastify API: Maker-Checker Segregation blocks Staff from DSC signing', async () => {
  const app = buildApp();
  const csrfRes = await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' });
  const { csrfToken } = JSON.parse(csrfRes.body);

  // 1. Login as Staff (MFA not required for staff in demo)
  const staffLoginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'x-csrf-token': csrfToken },
    payload: {
      email: 'staff.kaur@synextax.com',
      password: 'Staff@2026!',
    },
  });

  assert.equal(staffLoginRes.statusCode, 200);
  const staffAuth = JSON.parse(staffLoginRes.body);
  assert.equal(staffAuth.user.role, 'STAFF');

  // 2. Login as Partner to create DSC challenge
  const partnerLoginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'x-csrf-token': csrfToken },
    payload: { email: 'ca.verma@synextax.com', password: 'Partner@2026!' },
  });
  const partnerMfaRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/mfa/verify',
    headers: { 'x-csrf-token': csrfToken },
    payload: { sessionToken: JSON.parse(partnerLoginRes.body).sessionToken, totpCode: '123456' },
  });
  const partnerToken = JSON.parse(partnerMfaRes.body).accessToken;

  const chalRes = await app.inject({
    method: 'POST',
    url: '/api/v1/dsc/challenge',
    headers: { authorization: `Bearer ${partnerToken}` },
    payload: {
      filingId: 'f0000000-0000-0000-0000-000000000001',
      signatoryPan: 'AABCP1332L',
      formType: 'GSTR-3B',
      digestSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
  });
  assert.equal(chalRes.statusCode, 201);
  const { challengeNonce } = JSON.parse(chalRes.body).data;

  // 3. Staff attempts to verify and sign DSC challenge: must fail with 403 Segregation of Duties Violation
  const staffSignRes = await app.inject({
    method: 'POST',
    url: '/api/v1/dsc/verify',
    headers: { authorization: `Bearer ${staffAuth.accessToken}` },
    payload: {
      challengeNonce,
      filingId: 'f0000000-0000-0000-0000-000000000001',
      certificateSubject: 'CN=Simran Kaur, SERIALNUMBER=AABCP1332L, O=Personal, C=IN',
      certificateSerialNumber: '4B89F2A10984E4',
      certificateIssuer: 'CN=e-Mudhra Sub-CA for Class 3, O=e-Mudhra, C=IN',
      signatureHex: '30450221008f1b6230450221008f1b6230450221008f1b6230450221008f1b62',
      signingTimestamp: new Date().toISOString(),
    },
  });

  assert.equal(staffSignRes.statusCode, 403);
  assert.match(JSON.parse(staffSignRes.body).error, /Segregation of Duties Violation/);

  // 4. Partner verifies and signs DSC challenge: succeeds with 200 OK
  const partnerSignRes = await app.inject({
    method: 'POST',
    url: '/api/v1/dsc/verify',
    headers: { authorization: `Bearer ${partnerToken}` },
    payload: {
      challengeNonce,
      filingId: 'f0000000-0000-0000-0000-000000000001',
      certificateSubject: 'CN=Amrinder Verma, SERIALNUMBER=AABCP1332L, O=Personal, C=IN',
      certificateSerialNumber: '4B89F2A10984E4',
      certificateIssuer: 'CN=e-Mudhra Sub-CA for Class 3, O=e-Mudhra, C=IN',
      signatureHex: '30450221008f1b6230450221008f1b6230450221008f1b6230450221008f1b62',
      signingTimestamp: new Date().toISOString(),
    },
  });

  assert.equal(partnerSignRes.statusCode, 200);
  assert.equal(JSON.parse(partnerSignRes.body).data.status, 'VERIFIED_AND_SIGNED');
});

test('Security Module: SSRF Guard blocks private networks and AWS metadata', () => {
  // Loopback
  assert.equal(validateSafeOutboundUrl('http://127.0.0.1:8080/admin').isSafe, false);
  assert.equal(validateSafeOutboundUrl('http://localhost:3000').isSafe, false);

  // Private RFC 1918
  assert.equal(validateSafeOutboundUrl('http://10.0.1.20/db').isSafe, false);
  assert.equal(validateSafeOutboundUrl('http://192.168.1.1/router').isSafe, false);
  assert.equal(validateSafeOutboundUrl('http://172.20.5.10/internal').isSafe, false);

  // AWS Cloud Metadata (IMDS)
  assert.equal(validateSafeOutboundUrl('http://169.254.169.254/latest/meta-data/').isSafe, false);

  // Disallowed non-HTTP protocols
  assert.equal(validateSafeOutboundUrl('file:///etc/passwd').isSafe, false);
  assert.equal(validateSafeOutboundUrl('gopher://127.0.0.1:70/').isSafe, false);

  // Valid public URLs
  assert.equal(validateSafeOutboundUrl('https://api.gst.gov.in/taxpayerapi/v1.0').isSafe, true);
  assert.equal(validateSafeOutboundUrl('https://einvoice1.gst.gov.in').isSafe, true);
});

test('Security Module: Webhook HMAC-SHA256 signature verification and replay prevention', () => {
  const secret = 'test_webhook_shared_secret_key_12345';
  const payload = JSON.stringify({ event: 'GSTR3B_FILED', gstin: '03AABCA1234F1Z5' });
  const now = Math.floor(Date.now() / 1000);

  // Generate valid signature
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${now}.${payload}`);
  const validSig = hmac.digest('hex');

  // Valid signature passes
  const validRes = verifyWebhookSignature({
    secret,
    signatureHeader: validSig,
    timestampHeader: now.toString(),
    payload,
  });
  assert.equal(validRes.isValid, true);

  // Tampered payload fails
  const tamperedRes = verifyWebhookSignature({
    secret,
    signatureHeader: validSig,
    timestampHeader: now.toString(),
    payload: JSON.stringify({ event: 'TAMPERED_EVENT' }),
  });
  assert.equal(tamperedRes.isValid, false);

  // Expired timestamp (> 300 seconds old) fails replay check
  const expiredTimestamp = (now - 400).toString();
  const expiredHmac = crypto.createHmac('sha256', secret).update(`${expiredTimestamp}.${payload}`).digest('hex');
  const expiredRes = verifyWebhookSignature({
    secret,
    signatureHeader: expiredHmac,
    timestampHeader: expiredTimestamp,
    payload,
  });
  assert.equal(expiredRes.isValid, false);
  assert.match(expiredRes.error || '', /Webhook payload expired/);
});

test('Resilience Module: Circuit Breaker trips after failure threshold and fails fast', async () => {
  const breaker = new CircuitBreaker({
    name: 'GSTN-Portal-GSP',
    failureThreshold: 3,
    resetTimeoutMs: 100,
    timeoutMs: 1000,
  });

  let counter = 0;
  const failingFn = async () => {
    counter++;
    throw new Error('Downstream GSTN API 502 Bad Gateway');
  };

  // 3 failures should trip circuit
  await assert.rejects(breaker.execute(failingFn));
  await assert.rejects(breaker.execute(failingFn));
  await assert.rejects(breaker.execute(failingFn));

  assert.equal(breaker.getState(), 'OPEN');

  // Subsequent call fails fast without invoking downstream function
  const callCountBefore = counter;
  await assert.rejects(breaker.execute(failingFn), /is OPEN/);
  assert.equal(counter, callCountBefore); // Downstream function not called
});

test('Resilience Module: Retry with backoff retries transient errors', async () => {
  let attempts = 0;
  const flakyOperation = async () => {
    attempts++;
    if (attempts < 3) {
      throw new Error('Network blip');
    }
    return 'SUCCESS';
  };

  const result = await retryWithBackoff(flakyOperation, {
    maxRetries: 3,
    initialDelayMs: 10,
    maxDelayMs: 50,
  });

  assert.equal(result, 'SUCCESS');
  assert.equal(attempts, 3);
});
