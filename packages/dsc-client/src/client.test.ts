import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DscBridgeClient } from './client.js';

// A stand-in for the agent's HTTP interface, so the client is tested against real requests.
async function fakeAgent() {
  const seen: Array<{ url: string; body: string }> = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ url: req.url ?? '', body });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/health') return res.end(JSON.stringify({ status: 'ONLINE', version: '0.1.0', tokensDetected: 1, tallyReachable: false }));
      if (req.url === '/api/v1/tokens') return res.end(JSON.stringify({ tokens: [{ id: 'AB'.repeat(20), commonName: 'Signer', token: true }], count: 1 }));
      if (req.url === '/api/v1/sign') {
        const p = JSON.parse(body);
        if (p.challengeToken !== 'v1.ok') {
          res.statusCode = 403;
          return res.end(JSON.stringify({ error: 'security: challenge token is not valid' }));
        }
        return res.end(JSON.stringify({ signature: 'c2ln', algorithm: 'RSA_PKCS1_SHA256', certificate: 'Y2VydA==', chain: [], certificateInfo: { id: p.certificateId }, signingTimestamp: '2026-11-21T10:00:00Z' }));
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen, close: () => server.close() };
}

test('DscBridgeClient: health, certificates and signing against the agent interface', async () => {
  const agent = await fakeAgent();
  try {
    const client = new DscBridgeClient({ agentBaseUrl: agent.url });
    assert.equal((await client.checkHealth()).status, 'ONLINE');
    const certs = await client.listCertificates();
    assert.equal(certs[0].token, true);

    const signed = await client.signDigest({ challengeToken: 'v1.ok', certificateId: certs[0].id, digestSha256: 'b'.repeat(64) });
    assert.equal(signed.algorithm, 'RSA_PKCS1_SHA256');
    const sent = JSON.parse(agent.seen.find((s) => s.url === '/api/v1/sign')!.body);
    assert.deepEqual(Object.keys(sent).sort(), ['certificateId', 'challengeToken', 'digestSha256'], 'no PIN is ever sent');

    await assert.rejects(client.signDigest({ challengeToken: 'v1.bad', certificateId: certs[0].id, digestSha256: 'b'.repeat(64) }), /Signing failed \(403\)/);
    await assert.rejects(client.signDigest({ challengeToken: 'v1.ok', certificateId: certs[0].id, digestSha256: 'xyz' }), /64 hex/);
  } finally {
    agent.close();
  }
});

test('DscBridgeClient: offline when the agent is not running', async () => {
  const client = new DscBridgeClient({ agentBaseUrl: 'http://127.0.0.1:59999', timeoutMs: 500 });
  const health = await client.checkHealth();
  assert.equal(health.status, 'OFFLINE');
  assert.equal(health.tokensDetected, 0);
});
