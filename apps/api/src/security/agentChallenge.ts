import crypto from 'node:crypto';
import { isLocalEnv } from './env.js';

/**
 * Challenge tokens for the SynexTax desktop agent. The agent trusts only tokens signed with this
 * server's Ed25519 key, so a web page cannot make up its own. Format, matched by
 * apps/dsc-agent/security/challenge.go: "v1.<base64url payload>.<base64url signature>".
 *
 * Production: AGENT_CHALLENGE_PRIVATE_KEY holds the key (PKCS#8 PEM, or the 32-byte seed in
 * base64). The agent gets the public half (`npm run agent-key -w @synextax/api` prints both).
 * Development: a fixed key the agent trusts only when started with SYNEXTAX_AGENT_DEV=1.
 */

export const AGENT_ACTIONS = ['dsc.sign', 'backup.run', 'fvu.prepare', 'certs.read'] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

const DEV_SEED = 'synextax-dev-agent-challenge-key';
const TTL_SECONDS = 120;
// PKCS#8 prefix for an Ed25519 private key; the 32-byte seed follows.
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export class AgentKeyMissingError extends Error {}

function keyFromSeed(seed: Buffer): crypto.KeyObject {
  return crypto.createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' });
}

let cached: crypto.KeyObject | null | undefined;

export function agentSigningKey(env: NodeJS.ProcessEnv = process.env): crypto.KeyObject {
  if (env === process.env && cached) return cached;
  const raw = env.AGENT_CHALLENGE_PRIVATE_KEY?.trim();
  let key: crypto.KeyObject;
  if (raw) {
    key = raw.includes('BEGIN') ? crypto.createPrivateKey(raw) : keyFromSeed(Buffer.from(raw, 'base64'));
    if (key.asymmetricKeyType !== 'ed25519') throw new AgentKeyMissingError('AGENT_CHALLENGE_PRIVATE_KEY must be an Ed25519 key.');
  } else if (!isLocalEnv(env)) {
    throw new AgentKeyMissingError('AGENT_CHALLENGE_PRIVATE_KEY is not set, so the desktop agent cannot be used.');
  } else {
    key = keyFromSeed(crypto.createHash('sha256').update(DEV_SEED).digest());
  }
  if (env === process.env) cached = key;
  return key;
}

/** The raw 32-byte public key in base64, as the agent's SYNEXTAX_AGENT_PUBLIC_KEY expects. */
export function agentPublicKeyBase64(key: crypto.KeyObject): string {
  const spki = crypto.createPublicKey(key).export({ format: 'der', type: 'spki' });
  return Buffer.from(spki.subarray(spki.length - 32)).toString('base64');
}

export function issueAgentChallenge(action: AgentAction, key: crypto.KeyObject = agentSigningKey(), now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const payload = { n: crypto.randomBytes(32).toString('hex'), act: action, iat, exp: iat + TTL_SECONDS };
  const head = `v1.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  const sig = crypto.sign(null, Buffer.from(head), key).toString('base64url');
  return { token: `${head}.${sig}`, expiresAt: new Date(payload.exp * 1000).toISOString() };
}
