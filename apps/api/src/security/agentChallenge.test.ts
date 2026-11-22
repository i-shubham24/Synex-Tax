import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { agentPublicKeyBase64, agentSigningKey, issueAgentChallenge, AgentKeyMissingError } from './agentChallenge.js';

test('agent challenge: signed Ed25519 token for one action, two minutes', () => {
  const key = agentSigningKey({ NODE_ENV: 'development' });
  const { token, expiresAt } = issueAgentChallenge('fvu.prepare', key, 1_800_000_000_000);
  const [v, body, sig] = token.split('.');
  assert.equal(v, 'v1');
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  assert.deepEqual([p.act, p.iat, p.exp, p.n.length], ['fvu.prepare', 1_800_000_000, 1_800_000_120, 64]);
  assert.equal(expiresAt, new Date(1_800_000_120_000).toISOString());
  const pub = crypto.createPublicKey(key);
  assert.ok(crypto.verify(null, Buffer.from(`${v}.${body}`), pub, Buffer.from(sig, 'base64url')));
  // The development key the Go agent trusts with SYNEXTAX_AGENT_DEV=1 (security/challenge_test.go).
  assert.equal(agentPublicKeyBase64(key), DEV_PUBLIC_KEY);
});

test('agent challenge: production needs its own key', () => {
  assert.throws(() => agentSigningKey({ NODE_ENV: 'production' }), AgentKeyMissingError);
  const seed = crypto.randomBytes(32).toString('base64');
  const key = agentSigningKey({ NODE_ENV: 'production', AGENT_CHALLENGE_PRIVATE_KEY: seed });
  assert.notEqual(agentPublicKeyBase64(key), DEV_PUBLIC_KEY);
});

const DEV_PUBLIC_KEY = 'zPXdy+JOBAyToL4zm84zojoeyCCnmwRTEjlZaXJJvBM=';
