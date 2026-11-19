import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DscBridgeClient } from './client.js';

test('DscBridgeClient: Mock mode health check and token discovery', async () => {
  const client = new DscBridgeClient({ mockMode: true });

  const health = await client.checkHealth();
  assert.equal(health.status, 'ONLINE');
  assert.equal(health.tokensDetected, 1);
  assert.equal(health.tallyReachable, true);

  const tokens = await client.listTokens();
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].signatoryPan, 'AABCP1332L');
  assert.equal(tokens[0].isClass3, true);
});

test('DscBridgeClient: Mock mode hardware digest signing with PAN validation', async () => {
  const client = new DscBridgeClient({ mockMode: true });

  const validNonce = 'a'.repeat(64);
  const validDigest = 'b'.repeat(64);

  // Success signing with matching PAN
  const signResult = await client.signDigest({
    challengeNonce: validNonce,
    digestSha256: validDigest,
    tokenPin: '12345678',
    expectedPan: 'AABCP1332L',
  });

  assert.ok(signResult.signatureHex);
  assert.equal(signResult.certificate.signatoryPan, 'AABCP1332L');
  assert.equal(signResult.algorithm, 'SHA256withRSA/PKCS1Padding');

  // Error handling: mismatched PAN
  await assert.rejects(
    async () => {
      await client.signDigest({
        challengeNonce: validNonce,
        digestSha256: validDigest,
        tokenPin: '12345678',
        expectedPan: 'DIFFERENT1',
      });
    },
    /does not match expected signatory PAN/
  );

  // Error handling: missing PIN
  await assert.rejects(
    async () => {
      await client.signDigest({
        challengeNonce: validNonce,
        digestSha256: validDigest,
        tokenPin: '',
      });
    },
    /Token PIN is required/
  );
});

test('DscBridgeClient: Offline detection when daemon is unreachable', async () => {
  // Point to a non-existent port without mock mode
  const client = new DscBridgeClient({ agentBaseUrl: 'http://127.0.0.1:59999', timeoutMs: 500 });
  const health = await client.checkHealth();
  assert.equal(health.status, 'OFFLINE');
  assert.equal(health.tokensDetected, 0);
});
