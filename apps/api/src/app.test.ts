import { test, before, after } from 'node:test';
import { startDevDatabase } from '@synextax/db';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildApp } from './app.js';
import { hashPassword, verifyPassword, verifyTotpToken, generateTotpCode } from './security/cryptoUtils.js';
import { validateSafeOutboundUrl } from './security/ssrfGuard.js';
import { verifyWebhookSignature } from './security/webhookSecurity.js';
import { CircuitBreaker, retryWithBackoff } from './resilience/circuitBreaker.js';
import { validateUploadedFile, sanitizeFilename } from './security/fileUploadValidator.js';

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
     JOIN auth.identities i ON i.id = u.identity_id WHERE i.email_normalized = 'ca.verma@synextax.com' LIMIT 1`,
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

  // 3. Partner creates DSC challenge
  const chalRes = await app.inject({
    method: 'POST',
    url: '/api/v1/dsc/challenge',
    headers: { authorization: `Bearer ${partnerToken}`, 'x-csrf-token': csrfToken },
    payload: {
      filingId: filingId,
      signatoryPan: 'AABCP1332L',
      formType: 'GSTR-3B',
      digestSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
  });
  assert.equal(chalRes.statusCode, 201);
  const { challengeNonce } = JSON.parse(chalRes.body).data;

  // 4. Staff attempts to verify and sign DSC challenge: must fail with 403 Maker-Checker guard
  const staffSignRes = await app.inject({
    method: 'POST',
    url: '/api/v1/dsc/verify',
    headers: { authorization: `Bearer ${staffToken}`, 'x-csrf-token': csrfToken },
    payload: {
      challengeNonce,
      filingId: filingId,
      certificateSubject: 'CN=Simran Kaur, SERIALNUMBER=AABCP1332L, O=Personal, C=IN',
      certificateSerialNumber: '4B89F2A10984E4',
      certificateIssuer: 'CN=e-Mudhra Sub-CA for Class 3, O=e-Mudhra, C=IN',
      signatureHex: '30450221008f1b6230450221008f1b6230450221008f1b6230450221008f1b62',
      signingTimestamp: new Date().toISOString(),
    },
  });

  assert.equal(staffSignRes.statusCode, 403);
  assert.match(JSON.parse(staffSignRes.body).message, /Staff members are designated as return preparers/);

  // 4. Partner verifies and signs DSC challenge: succeeds with 200 OK
  const partnerSignRes = await app.inject({
    method: 'POST',
    url: '/api/v1/dsc/verify',
    headers: { authorization: `Bearer ${partnerToken}`, 'x-csrf-token': csrfToken },
    payload: {
      challengeNonce,
      filingId: filingId,
      certificateSubject: 'CN=Amrinder Verma, SERIALNUMBER=AABCP1332L, O=Personal, C=IN',
      certificateSerialNumber: '4B89F2A10984E4',
      certificateIssuer: 'CN=e-Mudhra Sub-CA for Class 3, O=e-Mudhra, C=IN',
      signatureHex: '30450221008f1b6230450221008f1b6230450221008f1b6230450221008f1b62',
      signingTimestamp: new Date().toISOString(),
    },
  });

  assert.equal(partnerSignRes.statusCode, 200);
  assert.equal(JSON.parse(partnerSignRes.body).data.status, 'SIGNED_UNVERIFIED');
  const trail = await devDb.db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM audit.signing_audit_logs WHERE status = 'UNVERIFIED' AND payload_hash = $1`,
    ['e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  );
  assert.equal(trail.rows[0].n, 1, 'exactly one unverified signing recorded');
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

  const renewed = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { cookie, 'x-csrf-token': csrf }, payload: {} });
  assert.equal(renewed.statusCode, 200, renewed.body);
  assert.ok(JSON.parse(renewed.body).accessToken);

  const replay = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { cookie, 'x-csrf-token': csrf }, payload: {} });
  assert.equal(replay.statusCode, 401, 'a rotated refresh token cannot be used again');
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
  assert.ok(payees.some((p: { pan: string }) => p.pan === 'BRNPA6778G'));

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
