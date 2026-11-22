/**
 * Development defaults (well-known secrets, the demo workspace, localhost origins, the local
 * upload folder) apply only when NODE_ENV says so explicitly. Anything else, including an unset
 * NODE_ENV or "staging", is treated as a real deployment and fails closed.
 */
export function isLocalEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
}

const DEV = {
  JWT_SECRET: 'synextax_super_secret_jwt_key_2026_production!',
  CSRF_SECRET: 'synextax_csrf_secret_32bytes_long_key!',
  CHALLENGE_JWT_SECRET: 'synextax_challenge_token_secret_min_32_bytes!',
  WEBHOOK_SECRET: 'synextax_statutory_webhook_hmac_secret_2026!',
};

/** Signing secrets. Each throws outside local development when it is missing, short or the default. */
export const secrets = {
  jwt: () => requireSecret('JWT_SECRET', DEV.JWT_SECRET),
  csrf: () => requireSecret('CSRF_SECRET', DEV.CSRF_SECRET),
  challenge: () => requireSecret('CHALLENGE_JWT_SECRET', DEV.CHALLENGE_JWT_SECRET),
  webhook: () => requireSecret('WEBHOOK_SECRET', DEV.WEBHOOK_SECRET),
};

/** Issuer and audience on access tokens, checked on every request. */
export const JWT_ISSUER = 'synextax-api';
export const JWT_AUDIENCE = 'synextax-web';

/**
 * The demo workspace has a fixed password and no MFA: on locally, or on a public demo deployment
 * that sets ENABLE_DEMO_WORKSPACE=true and holds no real data.
 */
export function demoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isLocalEnv(env) || env.ENABLE_DEMO_WORKSPACE === 'true';
}

/** A secret from the environment, or the development default when running locally. */
export function requireSecret(name: string, devDefault: string, opts: { minLength?: number; env?: NodeJS.ProcessEnv } = {}): string {
  const env = opts.env ?? process.env;
  const min = opts.minLength ?? 32;
  const value = env[name];
  if (value && value.length >= min && value !== devDefault) return value;
  if (isLocalEnv(env)) return value && value.length >= min ? value : devDefault;
  throw new Error(`FATAL SECURITY ERROR: ${name} must be set to a secret of at least ${min} characters (NODE_ENV=${env.NODE_ENV ?? 'unset'}).`);
}
