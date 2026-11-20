import crypto from 'node:crypto';
import qrcode from 'qrcode';
import { db } from '../../db/pool.js';
import {
  hashPassword,
  verifyPassword,
  dummyPasswordHash,
  generateTotpSecret,
  matchTotpStep,
  otpauthUrl,
  encryptSecret,
  decryptSecret,
  sha256,
  randomToken,
  generateRecoveryCodes,
  normalizeRecoveryCode,
} from '../../security/authCrypto.js';
import { bootstrapTrialWorkspace } from '../tenancy/trialBootstrapper.js';

export interface UserSessionPayload {
  id: string;
  firmId: string;
  firmName: string;
  email: string;
  displayName: string;
  role: 'PARTNER' | 'STAFF' | 'MANAGER' | 'CLIENT';
  frnNumber?: string;
  plan: 'PILOT' | 'SOLO' | 'GROWTH' | 'SCALE';
  trialDaysRemaining: number;
}

export interface SignupInput {
  fullName: string;
  email: string;
  password: string;
  firmName: string;
  frnNumber?: string;
  ip?: string;
  userAgent?: string;
}

export interface SignupResult {
  challengeToken: string;
  secret: string;
  qrCodeDataUrl: string;
  recoveryCodes: string[];
  user: UserSessionPayload;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
  user: UserSessionPayload;
}

// Challenge token signing secret (separate from main JWT access secret)
const CHALLENGE_SECRET = process.env.CHALLENGE_JWT_SECRET || 'synextax_challenge_token_secret_min_32_bytes!';

export function signChallengeToken(payload: { purpose: 'MFA_ENROLL' | 'MFA_CHALLENGE'; identityId: string; userId: string; firmId: string }, expiresInSeconds = 900): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', CHALLENGE_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifyChallengeToken(token: string, expectedPurpose: 'MFA_ENROLL' | 'MFA_CHALLENGE'): { identityId: string; userId: string; firmId: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('MALFORMED_CHALLENGE_TOKEN');
  const [header, body, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', CHALLENGE_SECRET).update(`${header}.${body}`).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    throw new Error('INVALID_CHALLENGE_SIGNATURE');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
    purpose: string;
    identityId: string;
    userId: string;
    firmId: string;
    exp: number;
  };
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('CHALLENGE_TOKEN_EXPIRED');
  if (payload.purpose !== expectedPurpose) throw new Error('INVALID_CHALLENGE_PURPOSE');
  return { identityId: payload.identityId, userId: payload.userId, firmId: payload.firmId };
}

export class AuthService {
  /**
   * Registers a new CA firm + partner account in PostgreSQL 17.
   * Runs the firm creation inside a signed SYSTEM_JOB transaction and seeds trial workspace.
   */
  public static async signup(input: SignupInput): Promise<SignupResult> {
    const emailNorm = input.email.trim().toLowerCase();

    // Check if email already registered
    const existing = await db.withAuthTransaction(async (client) => {
      const res = await client.query('SELECT id FROM auth.identities WHERE email_normalized = $1', [emailNorm]);
      return res.rows[0];
    });
    if (existing) {
      const error: any = new Error('Email address already registered. Please sign in instead.');
      error.statusCode = 409;
      throw error;
    }

    const passwordHash = await hashPassword(input.password);
    const identityId = crypto.randomUUID();
    const firmId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    // 1. Create Identity in auth schema
    await db.withAuthTransaction(async (client) => {
      await client.query(
        `INSERT INTO auth.identities (id, email, password_hash, mfa_required, status)
         VALUES ($1, $2, $3, true, 'ACTIVE')`,
        [identityId, input.email.trim(), passwordHash],
      );
    });

    // 2. Provision Firm, Partner User, and Trial Workspace inside signed platform transaction
    await db.withSystemTransaction(firmId, async (client) => {
      await client.query(
        `INSERT INTO public.firms (id, legal_name, trade_name, firm_kind, icai_frn, plan_code, trial_ends_at, status)
         VALUES ($1, $2, $2, 'CA_FIRM', $3, 'PILOT', now() + interval '14 days', 'ACTIVE')`,
        [firmId, input.firmName.trim(), input.frnNumber?.trim() || null],
      );

      await client.query(
        `INSERT INTO public.users (id, firm_id, identity_id, display_name, role, status)
         VALUES ($1, $2, $3, $4, 'PARTNER', 'ACTIVE')`,
        [userId, firmId, identityId, input.fullName.trim()],
      );

      // Seed 2 realistic Amritsar sample clients (Phulkari Textiles & Majha Spices)
      await bootstrapTrialWorkspace(client, { firmId, partnerUserId: userId });
    });

    // 3. Generate TOTP secret and recovery codes
    const totpSecret = generateTotpSecret();
    const encryptedSecret = encryptSecret(totpSecret);
    const recoveryCodes = generateRecoveryCodes(10);

    await db.withAuthTransaction(async (client) => {
      // Save unconfirmed TOTP factor
      await client.query(
        `INSERT INTO auth.mfa_factors (identity_id, kind, label, totp_secret_ciphertext)
         VALUES ($1, 'TOTP', 'Authenticator App', $2)`,
        [identityId, encryptedSecret],
      );

      // Save hashed recovery codes
      for (const code of recoveryCodes) {
        const norm = normalizeRecoveryCode(code);
        const codeHash = sha256(norm);
        await client.query(
          `INSERT INTO auth.mfa_factors (identity_id, kind, label, recovery_code_hash, confirmed_at)
           VALUES ($1, 'RECOVERY_CODE', 'Backup Code', $2, now())`,
          [identityId, codeHash],
        );
      }
    });

    const url = otpauthUrl(totpSecret, input.email.trim());
    const qrCodeDataUrl = await qrcode.toDataURL(url, { margin: 1, width: 220 });

    const challengeToken = signChallengeToken({
      purpose: 'MFA_ENROLL',
      identityId,
      userId,
      firmId,
    }, 900);

    return {
      challengeToken,
      secret: totpSecret,
      qrCodeDataUrl,
      recoveryCodes,
      user: {
        id: userId,
        firmId,
        firmName: input.firmName.trim(),
        email: input.email.trim(),
        displayName: input.fullName.trim(),
        role: 'PARTNER',
        frnNumber: input.frnNumber?.trim(),
        plan: 'PILOT',
        trialDaysRemaining: 14,
      },
    };
  }

  /**
   * Completes MFA enrollment by verifying the first TOTP code from user authenticator.
   */
  public static async completeMfaEnrollment(
    challengeToken: string,
    totpCode: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const { identityId, userId, firmId } = verifyChallengeToken(challengeToken, 'MFA_ENROLL');

    // Retrieve unconfirmed TOTP factor
    const factor = await db.withAuthTransaction(async (client) => {
      const res = await client.query(
        `SELECT id, totp_secret_ciphertext
         FROM auth.mfa_factors
         WHERE identity_id = $1 AND kind = 'TOTP' AND confirmed_at IS NULL AND revoked_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [identityId],
      );
      return res.rows[0];
    });

    if (!factor) {
      const error: any = new Error('No pending MFA enrollment found');
      error.statusCode = 400;
      throw error;
    }

    const secret = decryptSecret(factor.totp_secret_ciphertext);
    const step = matchTotpStep(totpCode, secret);
    if (step === null) {
      const error: any = new Error('Invalid 6-digit TOTP code. Please check your authenticator clock.');
      error.statusCode = 401;
      throw error;
    }

    // Confirm factor
    await db.withAuthTransaction(async (client) => {
      await client.query(
        `UPDATE auth.mfa_factors
         SET confirmed_at = now(), totp_last_used_step = $2, last_used_at = now()
         WHERE id = $1`,
        [factor.id, step],
      );
    });

    // Create session and issue tokens
    return this.createSession(identityId, userId, firmId, ip, userAgent);
  }

  /**
   * Password login with rate limiting, Argon2id verification and timing-attack protection.
   */
  public static async login(
    email: string,
    password: string,
  ): Promise<{ mfaRequired: boolean; challengeToken?: string; tokens?: AuthTokens }> {
    const emailNorm = email.trim().toLowerCase();

    const identity = await db.withAuthTransaction(async (client) => {
      const res = await client.query(
        `SELECT id, email, password_hash, mfa_required, failed_attempts, locked_until, status
         FROM auth.identities
         WHERE email_normalized = $1`,
        [emailNorm],
      );
      return res.rows[0];
    });

    // Constant-time dummy verification when user is unknown
    if (!identity) {
      await dummyPasswordHash();
      const error: any = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    if (identity.status !== 'ACTIVE') {
      const error: any = new Error('Account is inactive or suspended');
      error.statusCode = 403;
      throw error;
    }

    if (identity.locked_until && new Date(identity.locked_until) > new Date()) {
      const error: any = new Error('Account temporarily locked due to excessive failed attempts. Please try again later.');
      error.statusCode = 423;
      throw error;
    }

    const valid = await verifyPassword(identity.password_hash, password);
    if (!valid) {
      await db.withAuthTransaction(async (client) => {
        await client.query(
          `UPDATE auth.identities
           SET failed_attempts = failed_attempts + 1,
               locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END
           WHERE id = $1`,
          [identity.id],
        );
      });
      const error: any = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    // Reset failed attempts on valid password
    await db.withAuthTransaction(async (client) => {
      await client.query('UPDATE auth.identities SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [identity.id]);
    });

    // Fetch firm memberships
    const memberships = await db.withAuthTransaction(async (client) => {
      const res = await client.query('SELECT user_id, firm_id, firm_name, role, display_name, trial_ends_at FROM app.list_memberships($1)', [identity.id]);
      return res.rows;
    });

    if (!memberships || memberships.length === 0) {
      const error: any = new Error('No active firm memberships found for this account');
      error.statusCode = 403;
      throw error;
    }

    const defaultMembership = memberships[0];

    // MFA Challenge required?
    if (identity.mfa_required) {
      const challengeToken = signChallengeToken({
        purpose: 'MFA_CHALLENGE',
        identityId: identity.id,
        userId: defaultMembership.user_id,
        firmId: defaultMembership.firm_id,
      }, 300);

      return {
        mfaRequired: true,
        challengeToken,
      };
    }

    // No MFA required (e.g., demo)
    const tokens = await this.createSession(identity.id, defaultMembership.user_id, defaultMembership.firm_id);
    return {
      mfaRequired: false,
      tokens,
    };
  }

  /**
   * Verifies MFA TOTP code or recovery code.
   */
  public static async verifyMfa(
    challengeToken: string,
    code: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const { identityId, userId, firmId } = verifyChallengeToken(challengeToken, 'MFA_CHALLENGE');
    const cleanCode = code.trim();

    const isSixDigit = /^\d{6}$/.test(cleanCode);

    if (isSixDigit) {
      // TOTP verification
      const factor = await db.withAuthTransaction(async (client) => {
        const res = await client.query(
          `SELECT id, totp_secret_ciphertext, totp_last_used_step
           FROM auth.mfa_factors
           WHERE identity_id = $1 AND kind = 'TOTP' AND confirmed_at IS NOT NULL AND revoked_at IS NULL
           ORDER BY created_at DESC LIMIT 1`,
          [identityId],
        );
        return res.rows[0];
      });

      if (!factor) {
        const error: any = new Error('No verified authenticator factor found');
        error.statusCode = 400;
        throw error;
      }

      const secret = decryptSecret(factor.totp_secret_ciphertext);
      const step = matchTotpStep(cleanCode, secret);

      if (step === null || step <= (factor.totp_last_used_step || 0)) {
        const error: any = new Error('Invalid or replayed verification code. Please wait for the next 30-second code.');
        error.statusCode = 401;
        throw error;
      }

      // Update last used step
      await db.withAuthTransaction(async (client) => {
        await client.query('UPDATE auth.mfa_factors SET totp_last_used_step = $2, last_used_at = now() WHERE id = $1', [factor.id, step]);
      });
    } else {
      // Recovery code verification
      const norm = normalizeRecoveryCode(cleanCode);
      const codeHash = sha256(norm);

      const factor = await db.withAuthTransaction(async (client) => {
        const res = await client.query(
          `SELECT id FROM auth.mfa_factors
           WHERE identity_id = $1 AND kind = 'RECOVERY_CODE' AND recovery_code_hash = $2 AND revoked_at IS NULL
           LIMIT 1`,
          [identityId, codeHash],
        );
        return res.rows[0];
      });

      if (!factor) {
        const error: any = new Error('Invalid or already used recovery code');
        error.statusCode = 401;
        throw error;
      }

      // Single-use: revoke the used recovery code
      await db.withAuthTransaction(async (client) => {
        await client.query("UPDATE auth.mfa_factors SET revoked_at = now(), last_used_at = now() WHERE id = $1", [factor.id]);
      });
    }

    return this.createSession(identityId, userId, firmId, ip, userAgent);
  }

  /**
   * Rotates refresh token and returns fresh access token.
   */
  public static async refreshToken(token: string, ip?: string, userAgent?: string): Promise<AuthTokens> {
    const tokenHash = sha256(token);

    // The auth role reads only auth.* tables; firm membership comes from app.list_memberships,
    // which returns active users of active firms only.
    const session = await db.withAuthTransaction(async (client) => {
      const res = await client.query(
        `SELECT s.id, s.identity_id, s.user_id, s.expires_at, s.revoked_at, i.email, i.status AS identity_status
         FROM auth.sessions s
         JOIN auth.identities i ON i.id = s.identity_id
         WHERE s.refresh_token_hash = $1`,
        [tokenHash],
      );
      const row = res.rows[0];
      if (!row) return undefined;
      const m = await client.query('SELECT firm_id FROM app.list_memberships($1) WHERE user_id = $2', [row.identity_id, row.user_id]);
      return { ...row, firm_id: m.rows[0]?.firm_id as string | undefined };
    });

    if (!session || session.revoked_at || new Date(session.expires_at) < new Date()) {
      const error: any = new Error('Refresh token is invalid, expired, or revoked');
      error.statusCode = 401;
      throw error;
    }

    if (session.identity_status !== 'ACTIVE' || !session.firm_id) {
      const error: any = new Error('User membership or firm is inactive');
      error.statusCode = 403;
      throw error;
    }

    // Revoke old session
    await db.withAuthTransaction(async (client) => {
      await client.query("UPDATE auth.sessions SET revoked_at = now(), revoke_reason = 'ROTATED' WHERE id = $1", [session.id]);
    });

    // Create fresh session
    return this.createSession(session.identity_id, session.user_id, session.firm_id, ip, userAgent);
  }

  /**
   * Revokes a session upon logout.
   */
  public static async logout(token: string): Promise<void> {
    if (!token) return;
    const tokenHash = sha256(token);
    await db.withAuthTransaction(async (client) => {
      await client.query(
        "UPDATE auth.sessions SET revoked_at = now(), revoke_reason = 'USER_LOGOUT' WHERE refresh_token_hash = $1",
        [tokenHash],
      );
    });
  }

  /**
   * Ensures the demo CA firm and partner exist in PostgreSQL 17 so demo logins work against real DB.
   */
  public static async ensureDemoPartner(): Promise<{ firmId: string; userId: string; identityId: string }> {
    const email = 'ca.verma@synextax.com';
    const existing = await db.withAuthTransaction(async (client) => {
      const res = await client.query('SELECT id FROM auth.identities WHERE email_normalized = lower($1)', [email]);
      return res.rows[0];
    });

    if (existing) {
      const memberships = await db.withAuthTransaction(async (client) => {
        const res = await client.query('SELECT user_id, firm_id FROM app.list_memberships($1)', [existing.id]);
        return res.rows[0];
      });
      if (memberships) {
        return { firmId: memberships.firm_id, userId: memberships.user_id, identityId: existing.id };
      }
    }

    const identityId = '00000000-0000-0000-0000-000000000001';
    const firmId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const userId = '11111111-1111-1111-1111-111111111111';
    const passwordHash = await hashPassword('Partner@2026!');

    await db.withAuthTransaction(async (client) => {
      await client.query(
        `INSERT INTO auth.identities (id, email, password_hash, mfa_required, status)
         VALUES ($1, $2, $3, false, 'ACTIVE')
         ON CONFLICT (id) DO NOTHING`,
        [identityId, email, passwordHash],
      );
    });

    await db.withSystemTransaction(firmId, async (client) => {
      await client.query(
        `INSERT INTO public.firms (id, legal_name, trade_name, firm_kind, icai_frn, plan_code, trial_ends_at, status)
         VALUES ($1, 'Verma & Associates CA (Amritsar)', 'Verma & Associates CA', 'CA_FIRM', '014289N', 'PILOT', now() + interval '14 days', 'ACTIVE')
         ON CONFLICT (id) DO NOTHING`,
        [firmId],
      );

      await client.query(
        `INSERT INTO public.users (id, firm_id, identity_id, display_name, role, status)
         VALUES ($1, $2, $3, 'CA Amrinder Verma, FCA', 'PARTNER', 'ACTIVE')
         ON CONFLICT (id) DO NOTHING`,
        [userId, firmId, identityId],
      );

      // Seed 2 realistic Amritsar clients
      await bootstrapTrialWorkspace(client, { firmId, partnerUserId: userId });
    });

    return { firmId, userId, identityId };
  }

  /**
   * Helper to insert session and mint access + refresh tokens.
   */
  private static async createSession(
    identityId: string,
    userId: string,
    firmId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const rawRefreshToken = randomToken(40);
    const tokenHash = sha256(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000); // 30 days

    await db.withAuthTransaction(async (client) => {
      await client.query(
        `INSERT INTO auth.sessions (identity_id, user_id, refresh_token_hash, mfa_verified_at, ip_addr, user_agent, expires_at)
         VALUES ($1, $2, $3, now(), $4, $5, $6)`,
        [identityId, userId, tokenHash, ip || null, userAgent || null, expiresAt],
      );
    });

    // Fetch user details for token via security definer membership lookup
    const user = await db.withAuthTransaction(async (client) => {
      const emailRes = await client.query('SELECT email FROM auth.identities WHERE id = $1', [identityId]);
      const memRes = await client.query(
        'SELECT user_id, firm_id, firm_name, role, display_name, trial_ends_at FROM app.list_memberships($1)',
        [identityId],
      );
      const mem = memRes.rows.find((r: any) => r.user_id === userId) || memRes.rows[0];
      return {
        id: mem?.user_id || userId,
        firm_id: mem?.firm_id || firmId,
        display_name: mem?.display_name || 'SynexTax User',
        role: mem?.role || 'STAFF',
        trade_name: mem?.firm_name || 'SynexTax Firm',
        legal_name: mem?.firm_name || 'SynexTax Firm',
        plan_code: 'PILOT',
        trial_ends_at: mem?.trial_ends_at || null,
        email: emailRes.rows[0]?.email || '',
        icai_membership_no: null,
      };
    });

    let trialDaysRemaining = 14;
    if (user.trial_ends_at) {
      const diffMs = new Date(user.trial_ends_at).getTime() - Date.now();
      trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 3600 * 1000)));
    }

    const userPayload: UserSessionPayload = {
      id: user.id,
      firmId: user.firm_id,
      firmName: user.trade_name || user.legal_name,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      frnNumber: user.icai_membership_no || undefined,
      plan: (user.plan_code as 'PILOT' | 'SOLO' | 'GROWTH' | 'SCALE') || 'PILOT',
      trialDaysRemaining,
    };

    // Fastify JWT access token
    const jwtSecret = process.env.JWT_SECRET || 'synextax_super_secret_jwt_key_2026_production!';
    const accessToken = signJwt(
      {
        userId: user.id,
        firmId: user.firm_id,
        identityId,
        role: user.role,
        email: user.email,
        displayName: user.display_name,
      },
      jwtSecret,
      8 * 3600,
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'Bearer',
      expiresInSeconds: 28800,
      user: userPayload,
    };
  }
}

function signJwt(payload: Record<string, unknown>, secret: string, expiresInSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}
