import { test, before, after } from 'node:test';
import { startDevDatabase } from '@synextax/db';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildApp } from './app.js';
import { Decimal } from 'decimal.js';
import { verifyTotpToken, generateTotpCode } from './security/cryptoUtils.js';
import { validateSafeOutboundUrl } from './security/ssrfGuard.js';
import { verifyWebhookSignature } from './security/webhookSecurity.js';
import { CircuitBreaker, retryWithBackoff } from './resilience/circuitBreaker.js';
import { validateUploadedFile, sanitizeFilename } from './security/fileUploadValidator.js';
import { TEST_LEAF_RSA, TEST_LEAF_RSA_KEY, TEST_ROOT, TEST_SUB_CA } from './security/dscSignature.fixtures.js';

// Real PostgreSQL 17 (PGlite) with all migrations, so auth and RLS run for real.
let devDb: Awaited<ReturnType<typeof startDevDatabase>>;
before(async () => {
  devDb = await startDevDatabase({ port: 0 });
  Object.assign(process.env, {
    POSTGRES_HOST: devDb.host,
    POSTGRES_PORT: String(devDb.port),
    POSTGRES_USER: 'postgres',
    POSTGRES_PASSWORD: 'postgres',
    POSTGRES_DB: 'postgres',
    POSTGRES_POOL_MAX: '1',
  });
});
after(async () => {
  const { db } = await import('./db/pool.js');
  await db.close();
  await devDb.stop();
});

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
  assert.match(JSON.parse(rejectRes.body).message, /needs a CSRF token/);

  // A forged bearer token does not excuse a request from the CSRF check.
  const forgedBearer = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { authorization: 'Bearer not-a-token' }, payload: { email: 'a@b.in', password: 'x' } });
  assert.equal(forgedBearer.statusCode, 403);

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
  const allowBody = JSON.parse(allowRes.body);
  assert.ok(allowBody.accessToken || allowBody.challengeToken);
});

test('Fastify API: Auth Flow, Argon2id Hashing, JWT Sessions, and BOLA Guards', async () => {
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
  const authData = JSON.parse(loginRes.body);
  assert.ok(authData.accessToken);
  assert.equal(authData.user.role, 'PARTNER');

  // 3. Fetch 4-Tier Hierarchy Tree
  const treeRes = await app.inject({
    method: 'GET',
    url: '/api/v1/client-master/tree',
    headers: {
      authorization: `Bearer ${authData.accessToken}`,
    },
  });

  assert.equal(treeRes.statusCode, 200);
  const treeBody = JSON.parse(treeRes.body);
  assert.ok(treeBody.groups || treeBody.totalGroups !== undefined);

  // 4. BOLA Guard Test: Attempting to create entity with foreign clientGroupId must be rejected with 403 Forbidden
  const foreignGroupId = '00000000-dead-beef-0000-000000000000';
  const bolaRes = await app.inject({
    method: 'POST',
    url: '/api/v1/client-master/entities',
    headers: {
      authorization: `Bearer ${authData.accessToken}`,
    },
    payload: {
      clientGroupId: foreignGroupId,
      pan: 'AAACG1234F',
      legalName: 'Attacker Foreign Entity',
      constitution: 'PRIVATE_LIMITED',
    },
  });

  assert.equal(bolaRes.statusCode, 403);
  const bolaBody = JSON.parse(bolaRes.body);
  assert.match(bolaBody.message, /Parent client group not found/);
});

test('Fastify API: Maker-Checker Segregation blocks Staff from DSC signing', async () => {
  const app = buildApp();
  await app.ready(); // seeds the demo firm in development
  const filingRow = await devDb.db.query<{ id: string }>(
    `SELECT f.id FROM public.gst_filings f JOIN public.users u ON u.firm_id = f.firm_id
     JOIN auth.identities i ON i.id = u.identity_id WHERE i.email_normalized = 'ca.verma@synextax.com'
     AND f.workflow_status NOT IN ('FILED','CLOSED') LIMIT 1`,
  );
  const filingId = filingRow.rows[0]?.id;
  assert.ok(filingId, 'demo firm has a bootstrapped filing');
  const csrfRes = await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' });
  const { csrfToken } = JSON.parse(csrfRes.body);

  // 1. Mint a valid Staff JWT session
  const staffToken = app.jwt.sign({
    userId: '22222222-2222-2222-2222-222222222222',
    firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    identityId: '22222222-2222-2222-2222-222222222221',
    role: 'STAFF',
    email: 'staff.kaur@synextax.com',
    displayName: 'Staff Kaur',
  });

  // 2. Mint a valid Partner JWT session
  const partnerToken = app.jwt.sign({
    userId: '11111111-1111-1111-1111-111111111111',
    firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    identityId: '00000000-0000-0000-0000-000000000001',
    role: 'PARTNER',
    email: 'ca.verma@synextax.com',
    displayName: 'CA Amrinder Verma, FCA',
  });

  // 3. Partner asks to sign; the server builds the document and its digest.
  const challenge = async (signatoryPan?: string) => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/dsc/challenge',
      headers: { authorization: `Bearer ${partnerToken}`, 'x-csrf-token': csrfToken },
      payload: { filingId, signatoryPan, formType: 'ignored', digestSha256: '0'.repeat(64) },
    });
    assert.equal(r.statusCode, 201);
    return JSON.parse(r.body).data as { challengeNonce: string; agentToken: string; digestSha256: string; payload: string };
  };
  const certB64 = new crypto.X509Certificate(TEST_LEAF_RSA).raw.toString('base64');
  const signed = (c: { challengeNonce: string; payload: string }) => ({
    challengeNonce: c.challengeNonce,
    filingId,
    algorithm: 'RSA_PKCS1_SHA256',
    signature: crypto.sign('sha256', Buffer.from(c.payload), crypto.createPrivateKey(TEST_LEAF_RSA_KEY)).toString('base64'),
    certificate: certB64,
    chain: [new crypto.X509Certificate(TEST_SUB_CA).raw.toString('base64')],
  });
  const verify = (token: string, body: object) =>
    app.inject({ method: 'POST', url: '/api/v1/dsc/verify', headers: { authorization: `Bearer ${token}`, 'x-csrf-token': csrfToken }, payload: body });

  const first = await challenge('AAAPV8912K');
  assert.equal(crypto.createHash('sha256').update(first.payload).digest('hex'), first.digestSha256);
  assert.equal(JSON.parse(first.payload).filingId, filingId);
  assert.notEqual(first.digestSha256, '0'.repeat(64), 'the browser cannot choose what is signed');
  assert.match(first.agentToken, /^v1\./);

  // 4. Staff attempts to sign: must fail with 403 Maker-Checker guard
  const staffSignRes = await verify(staffToken, signed(first));
  assert.equal(staffSignRes.statusCode, 403);
  assert.match(JSON.parse(staffSignRes.body).message, /Staff members are designated as return preparers/);

  // 5. Partner signs: the signature is checked; without trusted roots the certificate is not.
  const partnerSignRes = await verify(partnerToken, signed(first));
  assert.equal(partnerSignRes.statusCode, 200, partnerSignRes.body);
  const signedBody = JSON.parse(partnerSignRes.body).data;
  assert.equal(signedBody.status, 'SIGNED_CERTIFICATE_UNCHECKED');
  assert.equal(signedBody.signatureVerified, true);
  assert.equal(signedBody.certificate.pan, 'XXXXX8912K');
  assert.equal((await verify(partnerToken, signed(first))).statusCode, 403, 'a challenge is used once');

  // 6. With the issuing root trusted, the signing is complete.
  process.env.DSC_TRUSTED_ROOTS = TEST_ROOT;
  try {
    const second = await challenge();
    const res = await verify(partnerToken, signed(second));
    assert.equal(JSON.parse(res.body).data.status, 'SIGNED');

    // A signature over something else, and a DSC that is not the signatory's, are refused and logged.
    const third = await challenge();
    const forged = { ...signed(third), signature: signed({ ...third, payload: third.payload.replace('sign-off', 'sign-of') }).signature };
    const bad = await verify(partnerToken, forged);
    assert.equal(bad.statusCode, 422);
    assert.equal(JSON.parse(bad.body).error, 'SIGNATURE_INVALID');
    const fourth = await challenge('BBBPV8912K');
    assert.equal(JSON.parse((await verify(partnerToken, signed(fourth))).body).error, 'SIGNATORY_PAN_MISMATCH');
  } finally {
    delete process.env.DSC_TRUSTED_ROOTS;
  }

  const trail = await devDb.db.query<{ status: string; holder_pan: string | null; error_code: string | null }>(
    `SELECT status, holder_pan, error_code FROM audit.signing_audit_logs WHERE cert_serial_hex = '3A4B892F' ORDER BY signed_at, created_at`,
  );
  assert.deepEqual(
    trail.rows.map((r) => [r.status, r.error_code]),
    [['UNVERIFIED', null], ['SUCCESS', null], ['REJECTED', 'SIGNATURE_INVALID'], ['REJECTED', 'SIGNATORY_PAN_MISMATCH']],
  );
  assert.equal(trail.rows[0].holder_pan, 'AAAPV8912K');
});

test('Modules: a percent-encoded path is checked as the route it reaches', async () => {
  const app = buildApp();
  await app.ready();
  const staff = app.jwt.sign({ userId: '22222222-2222-2222-2222-222222222222', firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff', identityId: '22222222-2222-2222-2222-222222222221', role: 'STAFF', email: 'staff.kaur@synextax.com', displayName: 'Staff Kaur' });
  for (const url of ['/api/v1/audit/logs', '/api/v1/%61udit/logs', '/api/v1/%61%75dit/chain']) {
    const r = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${staff}` } });
    assert.equal(r.statusCode, 403, url);
  }
  // A token for another issuer or audience is refused.
  const foreign = app.jwt.sign({ userId: 'x', firmId: 'y', identityId: 'z', role: 'PARTNER', email: 'e@x.in', displayName: 'X' }, { iss: 'someone-else' } as any);
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/audit/logs', headers: { authorization: `Bearer ${foreign}` } })).statusCode, 401);
  // Internal error text never reaches the client.
  const notFound = await app.inject({ method: 'GET', url: '/api/v1/nothing-here' });
  assert.equal(notFound.statusCode, 404);
  assert.ok(JSON.parse(notFound.body).requestId);
  await app.close();
});

test('Metrics: hidden without a token; with one, counts requests by route pattern', async () => {
  const plain = buildApp();
  assert.equal((await plain.inject({ method: 'GET', url: '/metrics' })).statusCode, 404);
  await plain.close();
  process.env.METRICS_TOKEN = 'test-metrics-token-0123456789abcdef';
  try {
    const app = buildApp();
    await app.inject({ method: 'GET', url: '/health/liveness' });
    await app.inject({ method: 'GET', url: '/api/v1/portal/not-a-real-link-token-xyz' });
    assert.equal((await app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer wrong' } })).statusCode, 404);
    const r = await app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer test-metrics-token-0123456789abcdef' } });
    assert.equal(r.statusCode, 200);
    assert.match(r.body, /route="\/health\/liveness",status="2xx"\} 1/);
    assert.match(r.body, /route="\/api\/v1\/portal\/:token"/, 'the route pattern, not the link token');
    assert.doesNotMatch(r.body, /not-a-real-link-token/);
    await app.close();
  } finally {
    delete process.env.METRICS_TOKEN;
  }
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

  // IPv6 literals keep their brackets in URL.hostname; mapped and translated forms of private IPv4.
  for (const u of ['http://[::1]/', 'http://[fd00::1]/', 'http://[::ffff:169.254.169.254]/', 'http://[::ffff:7f00:1]/', 'http://[64:ff9b::a9fe:a9fe]/', 'http://user:pw@example.com/']) {
    assert.equal(validateSafeOutboundUrl(u).isSafe, false, u);
  }

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

  // The same signed message a second time is a replay; a message without a timestamp is refused.
  const replay = verifyWebhookSignature({ secret, signatureHeader: validSig, timestampHeader: now.toString(), payload });
  assert.match(replay.error || '', /replay/);
  const untimed = verifyWebhookSignature({ secret, signatureHeader: crypto.createHmac('sha256', secret).update(payload).digest('hex'), payload });
  assert.match(untimed.error || '', /timestamp/);
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

test('Security Module: Secure File Upload Validation & Path Traversal Guards', () => {
  // 1. Path traversal sanitization
  const dangerousName = '../../../../etc/passwd.json';
  const cleanName = sanitizeFilename(dangerousName);
  assert.equal(cleanName.includes('..'), false);
  assert.equal(cleanName.includes('/'), false);

  // 2. Reject binary executables disguised as JSON or CSV
  const mzExecutableBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
  const execValidation = validateUploadedFile(mzExecutableBuffer, 'statement.csv', {
    allowedExtensions: ['.csv', '.json'],
  });
  assert.equal(execValidation.valid, false);
  assert.match(execValidation.error || '', /binary executable/);

  // 3. Reject embedded script tags in text uploads
  const maliciousScriptBuffer = Buffer.from('{"name": "Client", "notes": "<script>alert(1)</script>"}', 'utf8');
  const scriptValidation = validateUploadedFile(maliciousScriptBuffer, 'client.json', {
    allowedExtensions: ['.json'],
    expectedType: 'JSON',
  });
  assert.equal(scriptValidation.valid, false);
  assert.match(scriptValidation.error || '', /Malicious embedded HTML or JavaScript/);

  // 4. Reject unpermitted extensions
  const validJsonBuffer = Buffer.from('{"status": "OK", "records": [1, 2, 3]}', 'utf8');
  const extValidation = validateUploadedFile(validJsonBuffer, 'payload.exe', {
    allowedExtensions: ['.json', '.xlsx'],
  });
  assert.equal(extValidation.valid, false);
  assert.match(extValidation.error || '', /not permitted/);

  // 5. Accept valid JSON
  const successValidation = validateUploadedFile(validJsonBuffer, 'gstr2b_oct2025.json', {
    allowedExtensions: ['.json'],
    expectedType: 'JSON',
  });
  assert.equal(successValidation.valid, true);
  assert.equal(successValidation.detectedType, 'JSON');
});

test('Demo workspace: off in production unless explicitly enabled', async () => {
  const { demoWorkspaceEnabled } = await import('./routes/auth.routes.js');
  const saved = { env: process.env.NODE_ENV, flag: process.env.ENABLE_DEMO_WORKSPACE };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_DEMO_WORKSPACE;
    assert.equal(demoWorkspaceEnabled(), false);
    process.env.ENABLE_DEMO_WORKSPACE = 'true';
    assert.equal(demoWorkspaceEnabled(), true);
    process.env.NODE_ENV = 'development';
    delete process.env.ENABLE_DEMO_WORKSPACE;
    assert.equal(demoWorkspaceEnabled(), true);
    // An unset or unknown NODE_ENV is a real deployment: no demo, no default secrets.
    for (const v of [undefined, 'staging']) {
      if (v === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = v;
      assert.equal(demoWorkspaceEnabled(), false, `NODE_ENV=${v}`);
      const saved = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      assert.throws(() => buildApp(), /JWT_SECRET must be set/);
      if (saved !== undefined) process.env.JWT_SECRET = saved;
    }
  } finally {
    process.env.NODE_ENV = saved.env;
    if (saved.flag === undefined) delete process.env.ENABLE_DEMO_WORKSPACE;
    else process.env.ENABLE_DEMO_WORKSPACE = saved.flag;
  }
});

test('Client import: red rows save nothing, a valid batch commits, re-import is refused', async () => {
  const { calculateGstinChecksum } = await import('@synextax/tax-engine');
  const gstin = (state: string, pan: string) => `${state}${pan}1Z${calculateGstinChecksum(`${state}${pan}1Z`)}`;
  const app = buildApp();
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': 'n/a' } });
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const login = demo.statusCode === 200 ? demo : await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const token = JSON.parse(login.body).accessToken;
  assert.ok(token, `demo session: ${login.statusCode} ${login.body}`);
  const auth = { authorization: `Bearer ${token}` };

  const ctxRes = await app.inject({ method: 'GET', url: '/api/v1/client-master/import/context', headers: auth });
  assert.equal(ctxRes.statusCode, 200);

  const pan = 'AAFCT' + String(1000 + Math.floor(Math.random() * 8999)) + 'K';
  const g1 = gstin('03', pan);
  const g2 = gstin('07', pan);
  const bad = await app.inject({
    method: 'POST', url: '/api/v1/client-master/import/commit', headers: auth,
    payload: { rows: [{ sourceLine: 2, raw: { legalName: 'Import Test Pvt Ltd', gstins: g1.slice(0, 14) + (g1[14] === 'A' ? 'B' : 'A') } }] },
  });
  assert.equal(bad.statusCode, 422);

  const good = await app.inject({
    method: 'POST', url: '/api/v1/client-master/import/commit', headers: auth,
    payload: {
      defaultGroupName: 'Imported in test',
      rows: [
        { sourceLine: 2, raw: { legalName: 'Import Test Pvt Ltd', gstins: g1, constitution: 'Pvt Ltd', mobile: '98140 12345', tan: 'AMRT01234Q' } },
        { sourceLine: 3, raw: { legalName: 'Import Test Pvt Ltd', gstins: g2 } },
      ],
    },
  });
  assert.equal(good.statusCode, 201, good.body);
  const result = JSON.parse(good.body);
  assert.equal(result.entitiesCreated, 1);
  assert.equal(result.gstinsAdded, 2);
  assert.equal(result.tansAdded, 1);

  const again = await app.inject({
    method: 'POST', url: '/api/v1/client-master/import/commit', headers: auth,
    payload: { rows: [{ sourceLine: 2, raw: { legalName: 'Import Test Pvt Ltd', gstins: g1 } }] },
  });
  assert.equal(again.statusCode, 422);
  assert.match(again.body, /already in Client Master/);
  await app.close();
});

test('Sessions: the refresh cookie renews the access token and is rotated', async () => {
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  assert.equal(demo.statusCode, 200);
  const setCookie = String(demo.headers['set-cookie']);
  const cookie = setCookie.split(';')[0];
  assert.match(cookie, /^synextax_refresh=.+/);
  assert.match(setCookie, /HttpOnly/);

  // A CSRF token is bound to the session cookie it was issued for.
  const anonToken = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { cookie, 'x-csrf-token': csrf }, payload: {} });
  assert.equal(anonToken.statusCode, 403, 'a token issued without this session cookie is refused');
  const tokenFor = async (c: string) => JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf', headers: { cookie: c } })).body).csrfToken;

  const renewed = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { cookie, 'x-csrf-token': await tokenFor(cookie) }, payload: {} });
  assert.equal(renewed.statusCode, 200, renewed.body);
  assert.ok(JSON.parse(renewed.body).accessToken);
  const newCookie = String(renewed.headers['set-cookie']).split(';')[0];

  const replay = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { cookie, 'x-csrf-token': await tokenFor(cookie) }, payload: {} });
  assert.equal(replay.statusCode, 401, 'a rotated refresh token cannot be used again');
  // Reusing a rotated token means it was copied: the newer session is ended too.
  const after = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { cookie: newCookie, 'x-csrf-token': await tokenFor(newCookie) }, payload: {} });
  assert.equal(after.statusCode, 401, 'reuse of a rotated token ends the whole session family');
  await app.close();
});

test('TDS: FVU dispatch only queues, it never claims validation or invents a token', async () => {
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const res = await app.inject({ method: 'POST', url: '/api/v1/tds/fvu/dispatch', headers: auth, payload: { tan: 'AMRG04217D', regime: 'IT_ACT_2025', formCode: '140' } });
  assert.equal(res.statusCode, 202, res.body);
  const data = JSON.parse(res.body).data;
  assert.equal(data.validationStatus, 'QUEUED');
  assert.equal(data.tokenNumber, undefined);
  const job = await devDb.db.query<{ status: string }>('SELECT status FROM public.tds_fvu_jobs WHERE id = $1', [data.jobId]);
  assert.equal(job.rows[0].status, 'QUEUED');
  await app.close();
});

test('Audit: the hash chain checks out and partners can export the evidence pack', async () => {
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const chain = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/audit/chain', headers: auth })).body);
  assert.equal(chain.intact, true, JSON.stringify(chain));
  assert.ok(chain.checked > 0);
  const logs = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/audit/logs', headers: auth })).body).logs;
  assert.ok(logs.some((l: { hmacSignature: string }) => /^#\d+ [0-9a-f]{12}/.test(l.hmacSignature)), 'change-log rows carry their chain hash');
  const exp = await app.inject({ method: 'GET', url: '/api/v1/audit/export', headers: auth });
  assert.equal(exp.statusCode, 200, exp.body);
  assert.match(String(exp.headers['content-disposition']), /attachment; filename="synextax-audit-/);
  const pack = JSON.parse(exp.body);
  assert.equal(pack.chain.intact, true);
  assert.equal(pack.changeLog.length, pack.chain.entries);
  assert.doesNotMatch(exp.body, /"[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]"/, 'no unmasked PAN in the export');
  await app.close();
});

test('Firm details: partners read and save them; stale and invalid saves are refused', async () => {
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const firm = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/firm', headers: auth })).body);
  assert.ok(firm.legalName);
  assert.equal(firm.canEdit, true);
  const body = { legalName: firm.legalName, tradeName: firm.tradeName ?? '', frn: '014289N', pan: '', gstin: '', phone: '+919814012345', addressLine: 'Lawrence Road', city: 'Amritsar', pin: '143001' };
  const saved = await app.inject({ method: 'PUT', url: '/api/v1/firm', headers: { ...auth, 'if-match': `"${firm.version}"` }, payload: body });
  assert.equal(saved.statusCode, 200, saved.body);
  const again = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/firm', headers: auth })).body);
  assert.deepEqual([again.phone, again.city, again.pin, again.pan], ['+919814012345', 'Amritsar', '143001', null]);
  const stale = await app.inject({ method: 'PUT', url: '/api/v1/firm', headers: { ...auth, 'if-match': `"${firm.version}"` }, payload: body });
  assert.equal(stale.statusCode, 409, 'saving over a newer version is refused');
  const bad = await app.inject({ method: 'PUT', url: '/api/v1/firm', headers: auth, payload: { ...body, pin: '043001' } });
  assert.equal(bad.statusCode, 400);
  assert.match(JSON.parse(bad.body).message, /PIN code/);
  await app.close();
});

test('PII reveal: returns the real value only after the reveal is logged', async () => {
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const list = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/client-master/entities', headers: auth })).body);
  const entity = (Array.isArray(list) ? list : list.data ?? list.entities)[0];
  assert.ok(entity?.id, 'demo firm has a client');

  const before = (await devDb.db.query<{ n: number }>('SELECT count(*)::int AS n FROM audit.pii_access_logs WHERE record_id = $1', [entity.id])).rows[0].n;
  const res = await app.inject({
    method: 'POST', url: '/api/v1/audit/reveal-pii', headers: auth,
    payload: { targetTable: 'entities', targetColumn: 'pan', recordId: entity.id, accessReason: 'Matching PAN with Form 16A for a client query' },
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.match(JSON.parse(res.body).unmaskedValue, /^[A-Z]{5}\d{4}[A-Z]$/);
  const after = (await devDb.db.query<{ n: number }>('SELECT count(*)::int AS n FROM audit.pii_access_logs WHERE record_id = $1', [entity.id])).rows[0].n;
  assert.equal(after, before + 1);

  const blocked = await app.inject({
    method: 'POST', url: '/api/v1/audit/reveal-pii', headers: auth,
    payload: { targetTable: 'entities', targetColumn: 'signatory_aadhaar', recordId: entity.id, accessReason: 'Trying to reveal a field that must not exist' },
  });
  assert.equal(blocked.statusCode, 400);
  await app.close();
});

test('TDS history: a Form 140 file is previewed, imported once, feeds payees and health', async () => {
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  // Protean's published Form 140 sample, pointed at the demo firm's sample TAN.
  const text = [
    '1^FH^NS1^R^06052026^1^D^AMRG04217D^1^Protean RPU 1.0^^^^^^^^',
    '2^BH^1^1^140^^^^^^^^AMRG04217D^^BRNPA6677G^202728^202627^Q1^FAMILY DEVELOPMENT SERVICES^INDIA^7U^^^^^19^789098^ABCD@TEST.COM^56789^6789087657^^S^BHAGYASHREE^CEO^7U^^^^^19^789098^ABCD@TESTYOUP.COM^^56789^0987678909^^11200.00^^^^^N^^04^^^^^BRNPA8898H^^^^^^^^^1060872^^^^',
    '3^CD^1^1^1^N^^10000.00^1000.00^100.00^100.00^11200.00^B^^3000012^^^^30042026^^900.00^900.00^^^^^^^^',
    '4^DD^1^1^1^O^^BRNPA6778G^ABCD^^^^^^1008^^^^02052026^1000.00^^^^900.00^900.00^^02052026^03.0000^^^^E^^^^^^^^^^^^^',
  ].join('\r\n') + '\r\n';

  const preview = JSON.parse((await app.inject({ method: 'POST', url: '/api/v1/tds/import/preview', headers: auth, payload: { text } })).body);
  assert.equal(preview.tanKnown, true);
  assert.equal(preview.deductees, 1);
  assert.deepEqual(preview.issues.filter((i: { level: string }) => i.level === 'error'), []);

  const first = await app.inject({ method: 'POST', url: '/api/v1/tds/import/commit', headers: auth, payload: { text } });
  assert.equal(first.statusCode, 201, first.body);
  const ret = await devDb.db.query<{ workflow_status: string; source: string }>('SELECT workflow_status, source FROM public.tds_returns WHERE id = $1', [JSON.parse(first.body).returnId]);
  assert.deepEqual(ret.rows[0], { workflow_status: 'CLOSED', source: 'IMPORTED' });

  const again = await app.inject({ method: 'POST', url: '/api/v1/tds/import/commit', headers: auth, payload: { text } });
  assert.equal(again.statusCode, 409);

  const payees = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/tds/payees?tan=AMRG04217D', headers: auth })).body).payees;
  assert.ok(payees.some((p: { pan: string }) => p.pan === 'XXXXX6778G'));

  const health = await app.inject({ method: 'GET', url: '/api/v1/tds/health?tan=AMRG04217D', headers: auth });
  assert.equal(health.statusCode, 200);
  const report = JSON.parse(health.body);
  assert.ok(report.challans.length >= 2, 'sample challan and imported challan');
  assert.ok(report.panIssues.some((p: { pan: string }) => p.pan === 'PANNOTAVBL'));
  await app.close();
});

test('Practice: a checklist from a template, items marked, gaps and a WhatsApp reminder', async () => {
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const entities = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/client-master/entities', headers: auth })).body);
  const entity = (Array.isArray(entities) ? entities : entities.data ?? entities.entities)[0];
  // Give the client a mobile so the reminder can open WhatsApp.
  await devDb.db.query(`INSERT INTO public.entity_contacts (firm_id, entity_id, full_name, mobile_e164, is_primary) SELECT firm_id, id, 'Owner', '+919814012345', true FROM public.entities WHERE id = $1`, [entity.id]);

  const created = await app.inject({ method: 'POST', url: '/api/v1/practice/checklists', headers: auth, payload: { entityId: entity.id, service: 'GST_MONTHLY', periodLabel: 'Oct 2026', dueDate: '2026-11-05' } });
  assert.equal(created.statusCode, 201, created.body);
  const dup = await app.inject({ method: 'POST', url: '/api/v1/practice/checklists', headers: auth, payload: { entityId: entity.id, service: 'GST_MONTHLY', periodLabel: 'Oct 2026', dueDate: '2026-11-05' } });
  assert.equal(dup.statusCode, 409);

  const list = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/practice/checklists', headers: auth })).body).checklists;
  const mine = list.find((k: { id: string }) => k.id === JSON.parse(created.body).id);
  assert.equal(mine.items.length, 6);
  const first = mine.items[0].id;
  const staleItem = await app.inject({ method: 'PATCH', url: `/api/v1/practice/items/${first}`, headers: { ...auth, 'if-match': '"2000-01-01T00:00:00.000Z"' }, payload: { status: 'RECEIVED' } });
  assert.equal(staleItem.statusCode, 409, 'an edit based on an old version of the item is refused');
  const upd = await app.inject({ method: 'PATCH', url: `/api/v1/practice/items/${first}`, headers: auth, payload: { status: 'RECEIVED', receivedVia: 'WHATSAPP' } });
  assert.equal(upd.statusCode, 200);

  const gaps = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/practice/gaps', headers: auth })).body);
  const row = [...gaps.OVERDUE, ...gaps.THIS_WEEK, ...gaps.LATER].find((r: { id: string }) => r.id === mine.id);
  assert.equal(row.outstanding.length, 5);

  const rem = JSON.parse((await app.inject({ method: 'POST', url: `/api/v1/practice/checklists/${mine.id}/reminder`, headers: auth, payload: { channel: 'WHATSAPP' } })).body);
  assert.match(rem.link, /^https:\/\/wa\.me\/919814012345\?text=/);
  assert.ok(!rem.message.includes('Sales invoices or sales register'), 'received item is not chased');
  assert.match(rem.message, /by 5 Nov 2026/, 'calendar dates are not shifted by the server timezone');
  assert.match(rem.message, /monthly GST return for Oct 2026/);
  await app.close();
});

test('TDS statement: lists what is missing, then writes a Form 140 file that reads back cleanly', async () => {
  const { parseEtdsStatement } = await import('@synextax/tax-engine');
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const returns = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/tds/returns?tan=AMRG04217D', headers: auth })).body).returns;
  const q3 = returns.find((r: { quarter: string; source?: string; workflow_status: string }) => r.quarter === 'Q3' && r.workflow_status === 'DRAFT');
  assert.ok(q3, 'sample Q3 return');

  const first = await app.inject({ method: 'POST', url: `/api/v1/tds/returns/${q3.id}/statement`, headers: auth });
  assert.equal(first.statusCode, 422);
  const missing = JSON.parse(first.body).issues.map((i: { where: string }) => i.where);
  assert.ok(missing.includes('Deductor email') && missing.includes('Responsible person PAN'), missing.join(', '));

  const addr = { line1: 'SCO 12', line3: 'Hall Bazaar', district: 'Amritsar', state: 'Punjab', pin: '143006' };
  const put = await app.inject({
    method: 'PUT', url: '/api/v1/tds/tan-details', headers: auth,
    payload: {
      tan: 'AMRG04217D', deductorType: 'K', address: addr, deductorEmail: 'accounts@goldengate.example', deductorPhone: '9814012345',
      responsible: { name: 'Harpreet Kaur', designation: 'Director', pan: 'ABCPK1234L', address: addr, email: 'hk@goldengate.example', phone: '9814012346' },
    },
  });
  assert.equal(put.statusCode, 200, put.body);

  // The Q1 statement imported earlier was filed; the next statement must quote its token.
  const q1 = returns.find((r: { quarter: string; workflow_status: string }) => r.quarter === 'Q1' && r.workflow_status === 'CLOSED');
  if (q1) {
    const tok = await app.inject({ method: 'PUT', url: `/api/v1/tds/returns/${q1.id}/token`, headers: auth, payload: { token: '123456789012345' } });
    assert.equal(tok.statusCode, 200, tok.body);
  }
  const ok = await app.inject({ method: 'POST', url: `/api/v1/tds/returns/${q3.id}/statement`, headers: auth });
  assert.equal(ok.statusCode, 200, ok.body);
  const { fileName, text } = JSON.parse(ok.body);
  assert.match(fileName, /^AMRG04217D_140_Q3_202627\.txt$/);
  const parsed = parseEtdsStatement(text);
  assert.deepEqual(parsed.issues.filter((i: { level: string }) => i.level === 'error'), []);
  assert.equal(parsed.deductees.length, 5);
  assert.deepEqual([...new Set(parsed.deductees.map((d: { sectionCode: string }) => d.sectionCode))].sort(), ['1009', '1023', '1024', '1027']);
  assert.equal(text.split('\r\n')[1].split('^')[25], '26', 'Punjab written as Protean state code 26');
  await app.close();
});

test('TDS statement: a Form 144 file imports with its non-resident fields and is written back the same', async () => {
  const { parseEtdsStatement, writeTdsStatement } = await import('@synextax/tax-engine');
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const address = { line1: 'SCO 12', district: 'Amritsar', stateCode: '26', pin: '143006' };
  const source = writeTdsStatement({
    form: '144', fileCreated: '2026-10-25', fileSequence: 1, preparedWith: 'SynexTax', tan: 'AMRG04217D', deductorPan: 'AAJCG7392L',
    deductor: { name: 'Golden Gate Hardware Pvt Ltd', address, email: 'accounts@goldengate.example', phone: '9814012345', type: 'K' },
    responsible: { name: 'Harpreet Kaur', designation: 'Director', pan: 'ABCPK1234L', address, email: 'hk@goldengate.example', phone: '9814012346' },
    taxYear: 2026, quarter: 2, earlierRegularFiled: false,
    challans: [{
      mode: 'C', bsrCode: '0510308', challanNo: '518', depositedOn: '2026-09-07', tax: 20800, interest: 0, fee: 0, others: 0, minorHead: '200',
      deductees: [{
        pan: 'AAACF1234X', name: 'Foreign Tech LLC', sectionCode: '1057', paidOn: '2026-08-20', amountPaid: 100000, taxDeducted: 20800, taxDeposited: 20800,
        deductedOn: '2026-08-20', ratePercent: 20.8, statusCode: '1', optingOut: false, remittanceNature: '21', countryCode: '267', grossedUp: false, rateBasis: 'A',
      }],
    }],
  });
  assert.deepEqual(source.issues, []);

  const imported = await app.inject({ method: 'POST', url: '/api/v1/tds/import/commit', headers: auth, payload: { text: source.text } });
  assert.equal(imported.statusCode, 201, imported.body);
  const { returnId } = JSON.parse(imported.body);
  const stored = await devDb.db.query(
    `SELECT d.payee_status_code, d.remittance_nature, d.country_code, d.rate_basis, d.grossed_up, d.opting_out_202 FROM public.tds_deductees d
     JOIN public.tds_challans c ON c.id = d.challan_id WHERE c.challan_no = '518' AND d.deductee_pan = 'AAACF1234X'`,
  );
  assert.deepEqual(stored.rows[0], { payee_status_code: '1', remittance_nature: '21', country_code: '267', rate_basis: 'A', grossed_up: false, opting_out_202: false });

  // Reopen the imported return as a draft, as a correction would, and write it again from the database.
  await devDb.db.query(`UPDATE public.tds_returns SET workflow_status = 'DRAFT' WHERE id = $1`, [returnId]);
  const out = await app.inject({ method: 'POST', url: `/api/v1/tds/returns/${returnId}/statement`, headers: auth });
  assert.equal(out.statusCode, 200, out.body);
  const { fileName, text } = JSON.parse(out.body);
  assert.match(fileName, /^AMRG04217D_144_Q2_202627\.txt$/);
  const parsed = parseEtdsStatement(text);
  assert.deepEqual(parsed.issues.filter((i: { level: string }) => i.level === 'error'), []);
  assert.equal(parsed.form, '144');
  const d = parsed.deductees[0];
  assert.deepEqual([d.sectionCode, d.statusCode, d.remittanceNature, d.countryCode, d.rateBasis, d.amountPaid], ['1057', '1', '21', '267', 'A', '100000.00']);
  await app.close();
});

test('TDS statement: a Form 138 salary file imports and is written back with SL1 and the deposit date', async () => {
  const { parseEtdsStatement, writeTdsStatement } = await import('@synextax/tax-engine');
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const address = { line1: 'SCO 12', district: 'Amritsar', stateCode: '26', pin: '143006' };
  const source = writeTdsStatement({
    form: '138', fileCreated: '2026-10-25', fileSequence: 2, preparedWith: 'SynexTax', tan: 'AMRG04217D', deductorPan: 'AAJCG7392L',
    deductor: { name: 'Golden Gate Hardware Pvt Ltd', address, email: 'accounts@goldengate.example', phone: '9814012345', type: 'K' },
    responsible: { name: 'Harpreet Kaur', designation: 'Director', pan: 'ABCPK1234L', address, email: 'hk@goldengate.example', phone: '9814012346' },
    taxYear: 2026, quarter: 2, earlierRegularFiled: false,
    challans: [{
      mode: 'C', bsrCode: '0510308', challanNo: '611', depositedOn: '2026-09-07', tax: 12000, interest: 0, fee: 0, others: 0, minorHead: '200',
      deductees: [{ pan: 'ABCPK1234L', name: 'Harpreet Kaur', sectionCode: '1002', paidOn: '2026-08-31', amountPaid: 120000, taxDeducted: 12000, taxDeposited: 12000, deductedOn: '2026-08-31', ratePercent: 0 }],
    }],
  });
  assert.deepEqual(source.issues, []);

  const imported = await app.inject({ method: 'POST', url: '/api/v1/tds/import/commit', headers: auth, payload: { text: source.text } });
  assert.equal(imported.statusCode, 201, imported.body);
  const { returnId } = JSON.parse(imported.body);
  await devDb.db.query(`UPDATE public.tds_returns SET workflow_status = 'DRAFT' WHERE id = $1`, [returnId]);
  const out = await app.inject({ method: 'POST', url: `/api/v1/tds/returns/${returnId}/statement`, headers: auth });
  assert.equal(out.statusCode, 200, out.body);
  const { fileName, text } = JSON.parse(out.body);
  assert.match(fileName, /^AMRG04217D_138_Q2_202627\.txt$/);
  const lines = text.split('\r\n');
  assert.equal(lines[0].split('^')[2], 'SL1');
  assert.deepEqual(lines[3].split('^').slice(27, 29), ['', '07092026']);
  const parsed = parseEtdsStatement(text);
  assert.deepEqual(parsed.issues.filter((i: { level: string }) => i.level === 'error'), []);
  assert.equal(parsed.form, '138');
  await app.close();
});

test('TDS history: a 1961 Act 26Q file imports under the 1961 regime; a challan mixing sections is refused', async () => {
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  // Protean's published 26Q sample, pointed at the demo firm's sample TAN.
  const lines = [
    '1^FH^NS1^R^11062020^1^D^AMRG04217D^1^NSDL RPU 3.2^^^^^^^^',
    '2^BH^1^1^26Q^^^^^^^^AMRG04217D^^BHSFB5213G^202526^202425^Q2^ABC^IT^45^BHVAN^N M MARG^BANDRA^MUMBAI^19^425006^KIRAN@GMAIL.COM^022^7456859^N^F^KIRAN^AM^45^BHVAN^N M MARG^BANDRA^MUMBAI^19^425006^KIRAN@GMAIL.COM^^022^7485963^N^1000.00^^^^N^N^^^^^^^VGSPL8523K^^^^^^^^^^^^^',
    '3^CD^1^1^1^N^^^^^^00015^^^^0000096^^05082024^^^194^1000.00^0.00^0.00^0.00^0.00^1000.00^^100.00^100.00^0.00^0.00^100.00^0.00^0.00^00001^N^^^^',
    (() => {
      const f = '4^DD^1^1^1^O^^2^^NJSPL8523K^^^HIMANI^100.00^0.00^0.00^100.00^^100.00^^^1000.00^05082024^15082024^^10.0000^^N^^^^^^^^^^^^^^^^^^^^^^^^^^'.split('^');
      f[32] = '94C'; // field 33: section code
      return f.join('^');
    })(),
  ];
  const text = lines.join('\r\n') + '\r\n';

  const preview = JSON.parse((await app.inject({ method: 'POST', url: '/api/v1/tds/import/preview', headers: auth, payload: { text } })).body);
  assert.equal(preview.regime, 'IT_ACT_1961');
  assert.deepEqual(preview.sections, [{ code: '94C', nature: '1961 Act code 94C' }]);

  // Two rows on one challan under different sections cannot be stored as an ITNS 281 challan.
  const mixed = [...lines.slice(0, 3).map((l) => l.replace('^1^1^1^N^', '^1^1^2^N^')), lines[3], lines[3].replace(/^4\^DD\^1\^1\^1\^/, '5^DD^1^1^2^').replace('^94C^', '^94J^')];
  const refused = await app.inject({ method: 'POST', url: '/api/v1/tds/import/commit', headers: auth, payload: { text: mixed.join('\r\n') + '\r\n' } });
  assert.equal(refused.statusCode, 422, refused.body);
  assert.match(JSON.parse(refused.body).message, /covers one section/);

  const ok = await app.inject({ method: 'POST', url: '/api/v1/tds/import/commit', headers: auth, payload: { text } });
  assert.equal(ok.statusCode, 201, ok.body);
  const row = await devDb.db.query(
    `SELECT r.statutory_regime, r.form_code, r.tax_year, c.statutory_regime AS challan_regime, d.form_code AS row_form, a.section_code
     FROM public.tds_returns r JOIN public.tds_challans c ON c.tan_registration_id = r.tan_registration_id AND c.tax_year = r.tax_year AND c.quarter = r.quarter
     JOIN public.tds_deductees d ON d.challan_id = c.id JOIN public.tds_challan_section_allocations a ON a.id = d.section_allocation_id
     WHERE r.id = $1`,
    [JSON.parse(ok.body).returnId],
  );
  assert.deepEqual(row.rows[0], { statutory_regime: 'IT_ACT_1961', form_code: '26Q', tax_year: 2024, challan_regime: 'IT_ACT_1961', row_form: '26Q', section_code: '94C' });
  await app.close();
});

test('TDS registers: default analysis, deposits, sections, statements and the Form 121 register, with PANs masked', async () => {
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };

  const company = await app.inject({
    method: 'POST', url: '/api/v1/tds/form121', headers: auth,
    payload: { tan: 'AMRG04217D', taxYear: 2026, pan: 'AAKCR2290D', name: 'A Company', receivedOn: '2026-04-10', estimatedIncome: 1000, estimatedTotalIncome: 1000 },
  });
  assert.equal(company.statusCode, 400);
  assert.match(JSON.parse(company.body).message, /not by companies or firms/);

  const added = await app.inject({
    method: 'POST', url: '/api/v1/tds/form121', headers: auth,
    payload: { tan: 'AMRG04217D', taxYear: 2026, pan: 'BQRPS4410K', name: 'Saving Account Holder', receivedOn: '2026-04-10', seniorCitizen: true, estimatedIncome: 40000, estimatedTotalIncome: 250000 },
  });
  assert.equal(added.statusCode, 201, added.body);

  const res = await app.inject({ method: 'GET', url: '/api/v1/tds/registers?tan=AMRG04217D&year=2026', headers: auth });
  assert.equal(res.statusCode, 200, res.body);
  assert.doesNotMatch(res.body, /\b(?!XXXXX)[A-Z]{5}\d{4}[A-Z]\b/, 'no full PAN leaves the server');
  const r = JSON.parse(res.body);
  assert.ok(r.sections.length >= 1 && r.deposits.length >= 1 && r.statements.length >= 1);
  assert.deepEqual(r.form121.map((f: { pan: string; seniorCitizen: boolean }) => [f.pan, f.seniorCitizen]), [['XXXXX4410K', true]]);
  assert.ok('interestDue' in r.analysis.totals);

  const withdrawn = await app.inject({ method: 'POST', url: `/api/v1/tds/form121/${JSON.parse(added.body).id}/withdraw`, headers: auth });
  assert.equal(withdrawn.statusCode, 200);
  await app.close();
});

test('GST: a pasted sales register is checked, imported once, and summarised for GSTR-1', async () => {
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const regs = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/gst/registrations', headers: auth })).body).registrations;
  const gstin = regs.find((r: { gstin: string }) => r.gstin.startsWith('03')).gstin;
  const text = [
    'Invoice No\tDate\tParty Name\tGSTIN\tPlace of Supply\tTaxable Value\tRate\tIGST\tCGST\tSGST',
    'QA/1\t05/09/2026\tLudhiana Traders\t03AABCL1234F1Z8\t03\t10000\t18\t0\t900\t900',
    'QA/2\t06/09/2026\tDelhi Mart\t\t07\t150000\t5\t7500\t0\t0',
    'QA/3\t07/09/2026\tWalk-in\t\t03\t2000\t18\t0\t180\t180',
  ].join('\n');

  const preview = JSON.parse((await app.inject({ method: 'POST', url: '/api/v1/gst/sales/preview', headers: auth, payload: { gstin, period: '2026-09', text } })).body);
  assert.deepEqual(preview.rows.map((r: { invoice: { section: string } | null }) => r.invoice?.section), ['B2B', 'B2CL', 'B2CS']);

  const broken = await app.inject({ method: 'POST', url: '/api/v1/gst/sales/import', headers: auth, payload: { gstin, period: '2026-09', text: text.replace('\t7500\t0\t0', '\t0\t3750\t3750') } });
  assert.equal(broken.statusCode, 422);

  const ok = await app.inject({ method: 'POST', url: '/api/v1/gst/sales/import', headers: auth, payload: { gstin, period: '2026-09', text } });
  assert.equal(ok.statusCode, 201, ok.body);
  const again = await app.inject({ method: 'POST', url: '/api/v1/gst/sales/import', headers: auth, payload: { gstin, period: '2026-09', text } });
  assert.equal(again.statusCode, 409);

  const sum = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/gst/gstr1/summary?gstin=${gstin}&from=2026-09`, headers: auth })).body);
  assert.deepEqual(sum.lines.map((l: { section: string; rate: number; taxableValue: string }) => [l.section, l.rate, l.taxableValue]), [['B2B', 18, '10000.00'], ['B2CL', 5, '150000.00'], ['B2CS', 18, '2000.00']]);
  assert.equal(sum.totals.tax, '9660.00');
  await app.close();
});

test('Practice: tasks from the calendar once only; fee invoice, receipt and ledger', async () => {
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };

  const first = JSON.parse((await app.inject({ method: 'POST', url: '/api/v1/practice/tasks/generate', headers: auth, payload: { from: '2026-12-01', to: '2027-01-31' } })).body);
  assert.ok(first.added > 0, JSON.stringify(first));
  const second = JSON.parse((await app.inject({ method: 'POST', url: '/api/v1/practice/tasks/generate', headers: auth, payload: { from: '2026-12-01', to: '2027-01-31' } })).body);
  assert.equal(second.added, 0);
  const listed = await app.inject({ method: 'GET', url: '/api/v1/practice/tasks?from=2026-12-01&to=2027-01-31', headers: auth });
  assert.equal(listed.statusCode, 200, listed.body);
  const tasks = JSON.parse(listed.body).tasks;
  assert.ok(tasks.some((t: { kind: string }) => t.kind === 'TDS_STATEMENT'));
  const done = await app.inject({ method: 'PATCH', url: `/api/v1/practice/tasks/${tasks[0].id}`, headers: auth, payload: { status: 'DONE' } });
  assert.equal(done.statusCode, 200);
  // Optimistic locking: an edit based on an old version is refused; the current version is accepted.
  const stale = await app.inject({ method: 'PATCH', url: `/api/v1/practice/tasks/${tasks[0].id}`, headers: { ...auth, 'if-match': `"${tasks[0].updated_at}"` }, payload: { note: 'late edit' } });
  assert.equal(stale.statusCode, 409, stale.body);
  const fresh = await app.inject({ method: 'PATCH', url: `/api/v1/practice/tasks/${tasks[0].id}`, headers: { ...auth, 'if-match': String(done.headers.etag) }, payload: { note: 'current edit' } });
  assert.equal(fresh.statusCode, 200, fresh.body);

  const entityId = tasks[0].entity_id;
  const inv = await app.inject({
    method: 'POST', url: '/api/v1/practice/fees/invoices', headers: auth,
    payload: { entityId, date: '2026-11-01', lines: [{ sac: '998231', description: 'GST returns, Q2', amount: 10000 }] },
  });
  assert.equal(inv.statusCode, 201, inv.body);
  const invoice = JSON.parse(inv.body);
  assert.match(invoice.invoiceNo, /^[A-Z0-9]{1,4}\/26-27\/\d{4}$/);
  // The demo firm has no GSTIN of its own, so it issues a bill of supply; a registered firm adds 18%.
  assert.equal(new Decimal(invoice.total).toFixed(2), new Decimal(invoice.taxable).mul(invoice.kind === 'TAX_INVOICE' ? 1.18 : 1).toFixed(2));

  const badRef = await app.inject({ method: 'POST', url: '/api/v1/practice/fees/receipts', headers: auth, payload: { entityId, date: '2026-11-05', amount: 5000, mode: 'BANK', reference: '50100123456789' } });
  assert.equal(badRef.statusCode, 400);
  const rec = await app.inject({ method: 'POST', url: '/api/v1/practice/fees/receipts', headers: auth, payload: { entityId, date: '2026-11-05', amount: 5000, mode: 'UPI', reference: 'UPI 631234' } });
  assert.equal(rec.statusCode, 201, rec.body);
  const ledger = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/practice/fees/ledger?entityId=${entityId}`, headers: auth })).body).ledger;
  assert.equal(ledger.outstanding, new Decimal(invoice.total).sub(5000).toFixed(2));

  // Idempotency-Key: a retried receipt is recorded once; the key cannot be reused for another body.
  const key = { ...auth, 'idempotency-key': `receipt-${crypto.randomUUID()}` };
  const body = { entityId, date: '2026-11-06', amount: 1000, mode: 'UPI', reference: 'UPI 777001' };
  const once = await app.inject({ method: 'POST', url: '/api/v1/practice/fees/receipts', headers: key, payload: body });
  const twice = await app.inject({ method: 'POST', url: '/api/v1/practice/fees/receipts', headers: key, payload: body });
  assert.equal(once.statusCode, 201, once.body);
  assert.equal(twice.statusCode, 201);
  assert.equal(twice.headers['idempotent-replayed'], 'true');
  assert.equal(twice.body, once.body);
  const other = await app.inject({ method: 'POST', url: '/api/v1/practice/fees/receipts', headers: key, payload: { ...body, amount: 2000 } });
  assert.equal(other.statusCode, 422);
  const after = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/practice/fees/ledger?entityId=${entityId}`, headers: auth })).body).ledger;
  assert.equal(after.outstanding, new Decimal(invoice.total).sub(6000).toFixed(2), 'one receipt of 1000, not two');
  await app.close();
});

test('Team: partner sets a staff member’s screens and clients; the API refuses screens they lack', async () => {
  const app = buildApp();
  await app.ready();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const partnerToken = JSON.parse(demo.body).accessToken;
  const auth = { authorization: `Bearer ${partnerToken}` };
  const claims = JSON.parse(Buffer.from(partnerToken.split('.')[1], 'base64url').toString());

  // A staff member in the demo firm, created directly for the test.
  const identity = crypto.randomUUID();
  const staffId = crypto.randomUUID();
  await devDb.db.query(`INSERT INTO auth.identities (id, email, password_hash, mfa_required, status) VALUES ($1, $2, 'x', false, 'ACTIVE')`, [identity, `staff-${identity}@example.test`]);
  await devDb.db.query(`INSERT INTO public.users (id, firm_id, identity_id, display_name, role, status) VALUES ($1, $2, $3, 'Test Staff', 'STAFF', 'ACTIVE')`, [staffId, claims.firmId, identity]);
  const staff = { authorization: `Bearer ${app.jwt.sign({ userId: staffId, firmId: claims.firmId, identityId: identity, role: 'STAFF', email: 'staff@example.test', displayName: 'Test Staff' })}` };

  const team = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/team', headers: auth })).body);
  const member = team.members.find((m: { id: string }) => m.id === staffId);
  assert.deepEqual(member.modules, ['GST', 'TDS', 'PRACTICE', 'DOCUMENTS', 'CLIENTS']);
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/team', headers: staff })).statusCode, 403);

  // Staff cannot see fees by default; TDS is allowed until the partner takes it away.
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/practice/fees/clients', headers: staff })).statusCode, 403);
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/tds/returns?tan=AMRG04217D', headers: staff })).statusCode, 200);
  assert.equal((await app.inject({ method: 'PUT', url: `/api/v1/team/${staffId}/modules`, headers: auth, payload: { modules: ['GST'] } })).statusCode, 200);
  // Optimistic locking: a change based on an old version of the member is refused.
  const stale = await app.inject({ method: 'PUT', url: `/api/v1/team/${staffId}/modules`, headers: { ...auth, 'if-match': '"2000-01-01T00:00:00.000Z"' }, payload: { modules: ['GST', 'TDS'] } });
  assert.equal(stale.statusCode, 409, stale.body);
  const listed = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/team', headers: auth })).body).members.find((m: { id: string }) => m.id === staffId);
  const current = await app.inject({ method: 'PUT', url: `/api/v1/team/${staffId}/modules`, headers: { ...auth, 'if-match': `"${listed.version}"` }, payload: { modules: ['GST'] } });
  assert.equal(current.statusCode, 200, current.body);
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/tds/returns?tan=AMRG04217D', headers: staff })).statusCode, 403);
  assert.deepEqual(JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/team/me', headers: staff })).body).modules, ['GST']);

  // Client access: none until assigned.
  const before = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/gst/registrations', headers: staff })).body).registrations.length;
  assert.equal(before, 0);
  const client = team.clients[0];
  assert.equal((await app.inject({ method: 'POST', url: `/api/v1/team/${staffId}/clients`, headers: auth, payload: { entityId: client.id } })).statusCode, 201);
  const regs = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/gst/registrations', headers: staff })).body).registrations;
  const all = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/gst/registrations', headers: auth })).body).registrations;
  assert.ok(regs.length <= all.length);
  await app.close();
});

test('TDS quarter sheet: pasted payments become challans, rows and a draft return that writes a clean file', async () => {
  const { parseEtdsStatement } = await import('@synextax/tax-engine');
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const sheet = [
    'BSR Code\tChallan No\tChallan Date\tSection\tPAN\tName\tAmount Paid\tPaid On\tTDS',
    '0510308\t00731\t07/08/2026\t1027\tABCPK1234L\tDr Kaur\t60,000\t15/07/2026\t6,000',
    '0510308\t00731\t07/08/2026\t1023\tBQRPS4410K\tSingh Transport\t1,00,000\t20/07/2026\t1,000',
  ].join('\n');
  const body = { tan: 'AMRG04217D', form: '140', taxYear: 2026, quarter: 2, text: sheet };

  const preview = JSON.parse((await app.inject({ method: 'POST', url: '/api/v1/tds/quarter/preview', headers: auth, payload: body })).body);
  assert.deepEqual([preview.errors, preview.challans.length, preview.challans[0].tax], [[], 1, '7000.00']);
  const bad = await app.inject({ method: 'POST', url: '/api/v1/tds/quarter/import', headers: auth, payload: { ...body, text: sheet.replace('1027', '194J') } });
  assert.equal(bad.statusCode, 422);

  const ok = await app.inject({ method: 'POST', url: '/api/v1/tds/quarter/import', headers: auth, payload: body });
  assert.equal(ok.statusCode, 201, ok.body);
  const { returnId, rows } = JSON.parse(ok.body);
  assert.equal(rows, 2);
  const again = await app.inject({ method: 'POST', url: '/api/v1/tds/quarter/import', headers: auth, payload: body });
  assert.equal(again.statusCode, 409);

  const file = await app.inject({ method: 'POST', url: `/api/v1/tds/returns/${returnId}/statement`, headers: auth });
  assert.equal(file.statusCode, 200, file.body);
  const parsed = parseEtdsStatement(JSON.parse(file.body).text);
  assert.deepEqual(parsed.issues.filter((i: { level: string }) => i.level === 'error'), []);
  assert.deepEqual(parsed.deductees.map((d: { sectionCode: string; taxDeducted: string }) => [d.sectionCode, d.taxDeducted]).sort(), [['1023', '1000.00'], ['1027', '6000.00']]);

  // The challan endpoint now saves what it accepts.
  const tanId = (await devDb.db.query(`SELECT id, entity_id FROM public.tan_registrations WHERE tan = 'AMRG04217D'`)).rows[0] as { id: string; entity_id: string };
  const ch = await app.inject({
    method: 'POST', url: '/api/v1/tds/challans', headers: auth,
    payload: { entityId: tanId.entity_id, tanRegistrationId: tanId.id, statutoryRegime: 'IT_ACT_2025', taxYear: 2026, quarter: 'Q3', challanNo: '00999', bsrCode: '0510308', depositDate: '2026-11-07', deducteeTypeHead: '0021', minorHead: '200', interestAllocation: '0.00', othersAllocation: '0.00', feeLateFiling: '0.00', totalChallanAmount: '500.00', sectionAllocations: [{ sectionCode: '1027', incomeTax: '500.00', surcharge: '0.00', cess: '0.00', totalSectionAmount: '500.00' }] },
  });
  assert.equal(ch.statusCode, 201, ch.body);
  const saved = await devDb.db.query(`SELECT total_challan_amount::text AS t FROM public.tds_challans WHERE id = $1`, [JSON.parse(ch.body).data.challanId]);
  assert.equal((saved.rows[0] as { t: string }).t, '500.00');
  await app.close();
});

test('GST: the year’s 3B summary reads the imported sales register', async () => {
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const regs = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/gst/registrations', headers: auth })).body).registrations;
  const reg = regs.find((r: { gstin: string; category: string }) => r.gstin.startsWith('03') && r.category === 'REGULAR_MONTHLY') ?? regs[0];
  const res = await app.inject({ method: 'GET', url: `/api/v1/gst/gstr3b/year?gstin=${reg.gstin}&fy=2026`, headers: auth });
  assert.equal(res.statusCode, 200, res.body);
  const y = JSON.parse(res.body);
  assert.equal(y.year, '2026-27');
  assert.ok(y.months.length === 12 || y.months.length === 4);
  await app.close();
});

test('Client upload portal: a link opens the checklist, a photo lands on the item, staff download it; bad files and dead links are refused', async () => {
  const { LocalFileStore, setFileStore } = await import('./modules/storage/fileStore.js');
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synextax-files-'));
  setFileStore(new LocalFileStore(dir));
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const entityId = (await devDb.db.query(`SELECT entity_id FROM public.tan_registrations WHERE tan = 'AMRG04217D'`)).rows[0] as { entity_id: string };
  const created = await app.inject({ method: 'POST', url: '/api/v1/practice/checklists', headers: auth, payload: { entityId: entityId.entity_id, service: 'GST_MONTHLY', periodLabel: 'Portal test', dueDate: '2026-12-11' } });
  assert.equal(created.statusCode, 201, created.body);
  const checklistId = JSON.parse(created.body).id;

  const link = JSON.parse((await app.inject({ method: 'POST', url: `/api/v1/practice/checklists/${checklistId}/upload-link`, headers: auth, payload: { days: 7 } })).body);
  const token = link.url.split('/upload/')[1];
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const stored = await devDb.db.query(`SELECT token_sha256 FROM public.doc_upload_links WHERE id = $1`, [link.id]);
  assert.notEqual((stored.rows[0] as { token_sha256: string }).token_sha256, token, 'only the hash is kept');

  const page = await app.inject({ method: 'GET', url: `/api/v1/portal/${token}` });
  assert.equal(page.statusCode, 200, page.body);
  const view = JSON.parse(page.body);
  assert.ok(view.items.length > 0 && view.client);
  assert.doesNotMatch(page.body, /\b[A-Z]{5}\d{4}[A-Z]\b/, 'no PAN on the client page');
  const itemId = view.items[0].id;

  const pcsrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
  const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 1)]);
  const badType = await app.inject({ method: 'POST', url: `/api/v1/portal/${token}/items/${itemId}/file`, headers: { 'content-type': 'application/octet-stream', 'x-csrf-token': pcsrf }, payload: exe });
  assert.equal(badType.statusCode, 415);
  const up = await app.inject({ method: 'POST', url: `/api/v1/portal/${token}/items/${itemId}/file`, headers: { 'content-type': 'image/jpeg', 'x-csrf-token': pcsrf, 'x-file-name': 'bill%201.jpg' }, payload: jpeg });
  assert.equal(up.statusCode, 201, up.body);
  const after = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/portal/${token}` })).body);
  assert.equal(after.items[0].status, 'RECEIVED');

  const files = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/practice/checklists/${checklistId}/files`, headers: auth })).body).files;
  assert.equal(files.length, 1);
  const dl = await app.inject({ method: 'GET', url: `/api/v1/practice/files/${files[0].id}`, headers: auth });
  assert.equal(dl.statusCode, 200);
  assert.deepEqual(dl.rawPayload, jpeg);
  assert.equal(dl.headers['x-content-type-options'], 'nosniff');

  await app.inject({ method: 'POST', url: `/api/v1/practice/upload-links/${link.id}/revoke`, headers: auth });
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/portal/${token}` })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/portal/${'x'.repeat(43)}` })).statusCode, 404);
  setFileStore(undefined);
  await app.close();
});

test('Lower-deduction certificates: recorded, listed with usage, and a flag A row without one is caught', async () => {
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const bad = await app.inject({ method: 'POST', url: '/api/v1/tds/certificates', headers: auth, payload: { tan: 'AMRG04217D', certificateNo: 'SHORT', pan: 'ABCPK1234L', name: 'Dr Kaur', sectionCode: '1027', ratePercent: 2, amountLimit: 500000, validFrom: '2026-04-01', validTo: '2027-03-31' } });
  assert.equal(bad.statusCode, 400);
  const ok = await app.inject({ method: 'POST', url: '/api/v1/tds/certificates', headers: auth, payload: { tan: 'AMRG04217D', certificateNo: 'ABCDE12345', pan: 'ABCPK1234L', name: 'Dr Kaur', sectionCode: '1027', ratePercent: 2, amountLimit: 500000, validFrom: '2026-04-01', validTo: '2027-03-31' } });
  assert.equal(ok.statusCode, 201, ok.body);
  // A flag A row in the quarter with a certificate number not in the register.
  const tan = (await devDb.db.query(`SELECT id FROM public.tan_registrations WHERE tan = 'AMRG04217D'`)).rows[0] as { id: string };
  await devDb.db.query(`UPDATE public.tds_deductees SET reason_for_non_deduction = 'A', certificate_no = 'ZZZZZ99999' WHERE id = (SELECT id FROM public.tds_deductees WHERE tan_registration_id = $1 AND deductee_name = 'Dr Kaur' LIMIT 1)`, [tan.id]);
  const reg = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/tds/registers?tan=AMRG04217D&year=2026', headers: auth })).body);
  assert.deepEqual(reg.certificates.map((c: { certificateNo: string; pan: string; remaining: string }) => [c.certificateNo, c.pan, c.remaining]), [['ABCDE12345', 'XXXXX1234L', '500000.00']]);
  assert.ok(reg.certificateFindings.some((f: { message: string }) => /not in the register/.test(f.message)));
  assert.ok(Array.isArray(reg.rateFindings));
  await app.close();
});

test('Salary register: an employee is added and the year’s tax, TDS so far and monthly deduction come back, PAN masked', async () => {
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const add = await app.inject({ method: 'POST', url: '/api/v1/tds/salary/employees', headers: auth, payload: { tan: 'AMRG04217D', taxYear: 2026, pan: 'ABCPK1234L', name: 'Harpreet Kaur', monthlyGross: 150000, monthlyBasicDa: 75000 } });
  assert.equal(add.statusCode, 201, add.body);
  const dup = await app.inject({ method: 'POST', url: '/api/v1/tds/salary/employees', headers: auth, payload: { tan: 'AMRG04217D', taxYear: 2026, pan: 'ABCPK1234L', name: 'Harpreet Kaur', monthlyGross: 150000 } });
  assert.equal(dup.statusCode, 409);
  const res = await app.inject({ method: 'GET', url: '/api/v1/tds/salary?tan=AMRG04217D&year=2026', headers: auth });
  assert.equal(res.statusCode, 200, res.body);
  assert.doesNotMatch(res.body, /\b(?!XXXXX)[A-Z]{5}\d{4}[A-Z]\b/);
  const line = JSON.parse(res.body).register[0];
  // The Form 138 import earlier deducted 12,000 from this PAN in Q2.
  assert.deepEqual([line.name, line.regime, line.monthsWorked, line.deductedSoFar], ['Harpreet Kaur', 'NEW', 12, '12000.00']);
  assert.ok(Number(line.annualTax) > 0 && Number(line.monthlyTds) > 0);
  await app.close();
});

test('GST MIS: months and parties for a GSTIN and year', async () => {
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const regs = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/gst/registrations', headers: auth })).body).registrations;
  const gstin = regs.find((r: { gstin: string }) => r.gstin.startsWith('03')).gstin;
  const res = await app.inject({ method: 'GET', url: `/api/v1/gst/mis?gstin=${gstin}&fy=2026`, headers: auth });
  assert.equal(res.statusCode, 200, res.body);
  const m = JSON.parse(res.body);
  assert.equal(m.months.length, 12);
  // The sales register imported earlier in September 2026.
  assert.equal(m.months.find((x: { period: string }) => x.period === '2026-09').sales, '162000.00');
  assert.ok(m.parties.some((p: { name: string }) => p.name === 'Ludhiana Traders'));
  await app.close();
});

test('Corrections, ITR-1, agent tokens and connections over the API', async () => {
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(login.body).accessToken}` };
  const token = '123456789012345';
  const conso = [
    '1^FH^NS1^R^06052026^1^D^AMRG04217D^1^RPU^^^^^^^^',
    `2^BH^1^1^140^^^${token}^${token}^^^^AMRG04217D^^AAJCG7392L^202728^202627^Q1^GOLDEN GATE^INDIA^7U^^^^^19^789098^A@B.COM^91^6789087657^^K^R SHARMA^CEO^7U^^^^^19^789098^A@B.COM^^91^0987678909^^11200.00^^^^^N^^^^^^^ABCPS1234K^^^^^^^^^^^^^^`,
    '3^CD^1^1^1^N^^10000.00^1000.00^100.00^100.00^11200.00^C^^3000012^^00123^^30042026^^900.00^900.00^200^1000.00^100.00^^^^^',
    '4^DD^1^1^1^O^^BRNPA6778G^ABCD^^^^^^1008^^^^02052026^1000.00^^^^900.00^900.00^^02052026^03.0000^^^^^^^^^^^^^^^^^^',
  ].join('\r\n');

  const preview = await app.inject({ method: 'POST', url: '/api/v1/tds/corrections/preview', headers: auth, payload: { text: conso } });
  assert.equal(preview.statusCode, 200, preview.body);
  const p = JSON.parse(preview.body);
  assert.equal(p.tanKnown, true);
  assert.equal(p.challans[0].deductees[0].pan, 'XXXXX6778G', 'PANs leave the server masked');

  const build = await app.inject({ method: 'POST', url: '/api/v1/tds/corrections/build', headers: auth, payload: { text: conso, edits: { deductees: [{ challanNo: 1, recordNo: 1, pan: 'BRNPA6779H' }] } } });
  assert.equal(build.statusCode, 200, build.body);
  const b = JSON.parse(build.body);
  assert.equal(b.type, 'C5');
  assert.match(b.text.split('\r\n')[1], /\^BH\^1\^1\^140\^C5\^/);

  // ITR-1 is checked, but not written without the Department's software ID.
  const prev = process.env.ITR_SOFTWARE_ID;
  delete process.env.ITR_SOFTWARE_ID;
  const itr = await app.inject({
    method: 'POST', url: '/api/v1/itr/itr1', headers: auth,
    payload: {
      person: { surname: 'Verma', pan: 'ABCPV1234K', dob: '1985-04-12', employerCategory: 'OTH', address: { residenceNo: '12', locality: 'Model Town', city: 'Ludhiana', stateCode: '26', pin: '141002' }, mobile: '9876543210', email: 'a@example.com', fatherName: 'R K Verma', place: 'Ludhiana' },
      filing: { section: 12, regime: 'NEW' }, salary: { gross: 900000, employers: [] }, bank: { ifsc: 'HDFC0001234', name: 'HDFC Bank', account: '50100123456789', type: 'SB' },
    },
  });
  if (prev) process.env.ITR_SOFTWARE_ID = prev;
  assert.equal(itr.statusCode, 422, itr.body);
  assert.match(JSON.parse(itr.body).issues[0].message, /software ID/);

  const challenge = await app.inject({ method: 'POST', url: '/api/v1/dsc/agent-challenge', headers: auth, payload: { action: 'fvu.prepare' } });
  assert.equal(challenge.statusCode, 201, challenge.body);
  assert.match(JSON.parse(challenge.body).token, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$/);
  const badAction = await app.inject({ method: 'POST', url: '/api/v1/dsc/agent-challenge', headers: auth, payload: { action: 'dsc.sign' } });
  assert.equal(badAction.statusCode, 400);

  const status = await app.inject({ method: 'GET', url: '/api/v1/integrations/status', headers: auth });
  assert.equal(status.statusCode, 200);
  assert.equal(JSON.parse(status.body).email, false);
});
