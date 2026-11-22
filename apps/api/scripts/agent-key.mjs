// Prints a new Ed25519 key pair for desktop agent challenges.
//   AGENT_CHALLENGE_PRIVATE_KEY goes in the API's environment (keep it secret).
//   SYNEXTAX_AGENT_PUBLIC_KEY goes on each computer running the agent (or into its build).
import crypto from 'node:crypto';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('base64');
const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
console.log(`AGENT_CHALLENGE_PRIVATE_KEY=${seed}`);
console.log(`SYNEXTAX_AGENT_PUBLIC_KEY=${pub}`);
