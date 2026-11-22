import crypto from 'node:crypto';
import { demoEnabled, secrets, JWT_AUDIENCE, JWT_ISSUER } from '../../security/env.js';
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
const challengeSecret = () => secrets.challenge();
const DEMO_EMAIL = 'ca.verma@synextax.com';
/** Access tokens are short-lived; the refresh cookie renews them. */
export const ACCESS_TOKEN_SECONDS = 3600;

export function signChallengeToken(payload: { purpose: 'MFA_ENROLL' | 'MFA_CHALLENGE'; identityId: string; userId: string; firmId: string }, expiresInSeconds = 900): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', challengeSecret()).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifyChallengeToken(token: string, expectedPurpose: 'MFA_ENROLL' | 'MFA_CHALLENGE'): { identityId: string; userId: string; firmId: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('MALFORMED_CHALLENGE_TOKEN');
  const [header, body, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', challengeSecret()).update(`${header}.${body}`).digest('base64url');
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

    // Unknown accounts, and the demo account when the demo is switched off, take the same time
    // and get the same answer as a wrong password.
    if (!identity || (emailNorm === DEMO_EMAIL && !demoEnabled())) {
      await dummyPasswordHash();
      const error: any = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    // The password is checked before the account's state is reported, so a guess learns nothing
    // about whether the account exists, is locked or is suspended.
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

    if (identity.locked_until && new Date(identity.locked_until) > new Date()) {
      const error: any = new Error('Account temporarily locked due to excessive failed attempts. Please try again later.');
      error.statusCode = 423;
      throw error;
    }
    if (identity.status !== 'ACTIVE') {
      const error: any = new Error('Account is inactive or suspended');
      error.statusCode = 403;
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

    // Wrong codes count towards the same lockout as wrong passwords (5, then 15 minutes).
    const locked = await db.withAuthTransaction(async (client) => {
      const r = await client.query('SELECT locked_until FROM auth.identities WHERE id = $1', [identityId]);
      return r.rows[0]?.locked_until && new Date(r.rows[0].locked_until) > new Date();
    });
    if (locked) {
      const error: any = new Error('Account temporarily locked due to excessive failed attempts. Please try again later.');
      error.statusCode = 423;
      throw error;
    }
    const failed = async (message: string) => {
      await db.withAuthTransaction(async (client) => {
        await client.query(
          `UPDATE auth.identities
           SET failed_attempts = failed_attempts + 1,
               locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END
           WHERE id = $1`,
          [identityId],
        );
      });
      const error: any = new Error(message);
      error.statusCode = 401;
      return error;
    };

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
        throw await failed('Invalid or replayed verification code. Please wait for the next 30-second code.');
      }

      // Single use: only one request can move the step forward.
      const claimed = await db.withAuthTransaction(async (client) => {
        const r = await client.query(
          'UPDATE auth.mfa_factors SET totp_last_used_step = $2, last_used_at = now() WHERE id = $1 AND coalesce(totp_last_used_step, 0) < $2',
          [factor.id, step],
        );
        return r.rowCount === 1;
      });
      if (!claimed) throw await failed('Invalid or replayed verification code. Please wait for the next 30-second code.');
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

      if (!factor) throw await failed('Invalid or already used recovery code');

      // Single use: only one request can revoke the code.
      const claimed = await db.withAuthTransaction(async (client) => {
        const r = await client.query('UPDATE auth.mfa_factors SET revoked_at = now(), last_used_at = now() WHERE id = $1 AND revoked_at IS NULL', [factor.id]);
        return r.rowCount === 1;
      });
      if (!claimed) throw await failed('Invalid or already used recovery code');
    }

    await db.withAuthTransaction(async (client) => {
      await client.query('UPDATE auth.identities SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [identityId]);
    });

    return this.createSession(identityId, userId, firmId, ip, userAgent);
  }

  /**
   * Rotates refresh token and returns fresh access token.
   */
  public static async refreshToken(token: string, ip?: string, userAgent?: string): Promise<AuthTokens> {
    const tokenHash = sha256(token);

    // One statement claims the session, so two simultaneous refreshes cannot both succeed.
    const outcome = await db.withAuthTransaction(async (client) => {
      const claimed = await client.query(
        `UPDATE auth.sessions s SET revoked_at = now(), revoke_reason = 'ROTATED'
         FROM auth.identities i
         WHERE s.refresh_token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND i.id = s.identity_id
         RETURNING s.identity_id, s.user_id, i.status AS identity_status`,
        [tokenHash],
      );
      const row = claimed.rows[0];
      if (!row) {
        // A token that was already rotated is being used again: it was copied. End every session
        // of that account so whoever holds the copy is signed out too.
        const reused = await client.query(
          `UPDATE auth.sessions SET revoked_at = now(), revoke_reason = 'REUSE_DETECTED'
           WHERE identity_id = (SELECT identity_id FROM auth.sessions WHERE refresh_token_hash = $1 AND revoke_reason = 'ROTATED')
             AND revoked_at IS NULL`,
          [tokenHash],
        );
        return { kind: 'invalid' as const, reuse: (reused.rowCount ?? 0) > 0 };
      }
      const m = await client.query('SELECT firm_id FROM app.list_memberships($1) WHERE user_id = $2', [row.identity_id, row.user_id]);
      return { kind: 'ok' as const, ...row, firm_id: m.rows[0]?.firm_id as string | undefined };
    });

    if (outcome.kind === 'invalid') {
      const error: any = new Error('Refresh token is invalid, expired, or revoked');
      error.statusCode = 401;
      throw error;
    }
    if (outcome.identity_status !== 'ACTIVE' || !outcome.firm_id) {
      const error: any = new Error('User membership or firm is inactive');
      error.statusCode = 403;
      throw error;
    }
    return this.createSession(outcome.identity_id, outcome.user_id, outcome.firm_id, ip, userAgent);
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
    const email = DEMO_EMAIL;
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

  // ------------------------------------------------------------------
  // Invitations, password reset, sessions and password change
  // ------------------------------------------------------------------

  /** Checks a current TOTP code for this identity: confirmed factor, not replayed. Wrong codes count towards the lockout. */
  public static async checkTotp(identityId: string, code: string): Promise<'ok' | 'invalid' | 'no_factor'> {
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
    if (!factor) return 'no_factor';
    const step = /^\d{6}$/.test(code) ? matchTotpStep(code, decryptSecret(factor.totp_secret_ciphertext)) : null;
    if (step === null || step <= (factor.totp_last_used_step || 0)) {
      await this.countFailure(identityId);
      return 'invalid';
    }
    const claimed = await db.withAuthTransaction(async (client) => {
      const r = await client.query(
        'UPDATE auth.mfa_factors SET totp_last_used_step = $2, last_used_at = now() WHERE id = $1 AND coalesce(totp_last_used_step, 0) < $2',
        [factor.id, step],
      );
      return r.rowCount === 1;
    });
    if (!claimed) {
      await this.countFailure(identityId);
      return 'invalid';
    }
    return 'ok';
  }

  private static async countFailure(identityId: string): Promise<void> {
    await db.withAuthTransaction(async (client) => {
      await client.query(
        `UPDATE auth.identities
         SET failed_attempts = failed_attempts + 1,
             locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END
         WHERE id = $1`,
        [identityId],
      );
    });
  }

  private static async isLocked(identityId: string): Promise<boolean> {
    return db.withAuthTransaction(async (client) => {
      const r = await client.query('SELECT locked_until FROM auth.identities WHERE id = $1', [identityId]);
      return Boolean(r.rows[0]?.locked_until && new Date(r.rows[0].locked_until) > new Date());
    });
  }

  private static lockedError(): Error {
    const error: any = new Error('Account temporarily locked due to excessive failed attempts. Please try again later.');
    error.statusCode = 423;
    return error;
  }

  /**
   * A login for someone a firm invited: the password, an authenticator secret waiting to be
   * confirmed and ten recovery codes. MFA is required, as for every account. Fails with 409 when the
   * email already has an account in use. A login left over from an invitation that was never
   * finished (no firm membership, authenticator never confirmed) is set up again instead.
   */
  public static async createInvitedIdentity(email: string, password: string): Promise<{ identityId: string; secret: string; qrCodeDataUrl: string; recoveryCodes: string[] }> {
    const passwordHash = await hashPassword(password);
    const totpSecret = generateTotpSecret();
    const recoveryCodes = generateRecoveryCodes(10);
    const inUse = () => {
      const error: any = new Error('This email already has a SynexTax account. Choose "I already have an account" and confirm with its password and authenticator code.');
      error.statusCode = 409;
      return error;
    };
    let identityId: string;
    try {
      identityId = await db.withAuthTransaction(async (client) => {
        const existing = (await client.query('SELECT id FROM auth.identities WHERE email_normalized = lower($1) FOR UPDATE', [email.trim()])).rows[0];
        let id: string;
        if (existing) {
          const unfinished = (
            await client.query(
              `SELECT NOT EXISTS (SELECT 1 FROM app.list_memberships($1))
                  AND NOT EXISTS (SELECT 1 FROM auth.mfa_factors WHERE identity_id = $1 AND kind = 'TOTP' AND confirmed_at IS NOT NULL AND revoked_at IS NULL) AS ok`,
              [existing.id],
            )
          ).rows[0].ok;
          if (!unfinished) throw inUse();
          id = existing.id;
          await client.query(`UPDATE auth.identities SET password_hash = $2, mfa_required = true, status = 'ACTIVE', failed_attempts = 0, locked_until = NULL WHERE id = $1`, [id, passwordHash]);
          await client.query(`UPDATE auth.mfa_factors SET revoked_at = now() WHERE identity_id = $1 AND revoked_at IS NULL`, [id]);
        } else {
          id = crypto.randomUUID();
          await client.query(`INSERT INTO auth.identities (id, email, password_hash, mfa_required, status) VALUES ($1, $2, $3, true, 'ACTIVE')`, [id, email.trim(), passwordHash]);
        }
        await client.query(
          `INSERT INTO auth.mfa_factors (identity_id, kind, label, totp_secret_ciphertext) VALUES ($1, 'TOTP', 'Authenticator App', $2)`,
          [id, encryptSecret(totpSecret)],
        );
        for (const code of recoveryCodes) {
          await client.query(
            `INSERT INTO auth.mfa_factors (identity_id, kind, label, recovery_code_hash, confirmed_at) VALUES ($1, 'RECOVERY_CODE', 'Backup Code', $2, now())`,
            [id, sha256(normalizeRecoveryCode(code))],
          );
        }
        return id;
      });
    } catch (err: any) {
      if (err?.code === '23505') throw inUse();
      throw err;
    }
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl(totpSecret, email.trim()), { margin: 1, width: 220 });
    return { identityId, secret: totpSecret, qrCodeDataUrl, recoveryCodes };
  }

  /**
   * An existing account proves itself with its password and a current authenticator code. Every
   * failure gets the same answer and counts towards the lockout.
   */
  public static async verifyExistingAccount(email: string, password: string, totpCode: string): Promise<string> {
    const generic = () => {
      const error: any = new Error('The password or authenticator code is not right for this email.');
      error.statusCode = 401;
      return error;
    };
    const emailNorm = email.trim().toLowerCase();
    const identity = await db.withAuthTransaction(async (client) => (await client.query(`SELECT id, password_hash, status FROM auth.identities WHERE email_normalized = $1`, [emailNorm])).rows[0]);
    if (!identity || !identity.password_hash || emailNorm === DEMO_EMAIL) {
      await dummyPasswordHash();
      throw generic();
    }
    if (!(await verifyPassword(identity.password_hash, password))) {
      await this.countFailure(identity.id);
      throw generic();
    }
    if (await this.isLocked(identity.id)) throw this.lockedError();
    if (identity.status !== 'ACTIVE' || (await this.checkTotp(identity.id, totpCode.trim())) !== 'ok') throw generic();
    return identity.id as string;
  }

  /**
   * Starts a password reset. Says nothing about whether the email has an account: the caller answers
   * the same either way. At most three codes an hour per account; each new code cancels the last.
   * Returns where the code went, or null when no code was made.
   */
  public static async requestPasswordReset(
    email: string,
    ip: string | undefined,
    deliver: (to: string, code: string, minutes: number) => Promise<void>,
  ): Promise<'EMAIL' | null> {
    const emailNorm = email.trim().toLowerCase();
    if (emailNorm === DEMO_EMAIL) return null;
    const MINUTES = 15;
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const id = crypto.randomUUID();
    const target = await db.withAuthTransaction(async (client) => {
      const identity = (await client.query(`SELECT id, email, status FROM auth.identities WHERE email_normalized = $1`, [emailNorm])).rows[0];
      if (!identity || identity.status !== 'ACTIVE') return null;
      const recent = Number((await client.query(`SELECT count(*)::int AS n FROM auth.password_resets WHERE identity_id = $1 AND created_at > now() - interval '1 hour'`, [identity.id])).rows[0].n);
      if (recent >= 3) return null;
      await client.query(`UPDATE auth.password_resets SET revoked_at = now() WHERE identity_id = $1 AND used_at IS NULL AND revoked_at IS NULL`, [identity.id]);
      // No mobile number is kept on a login, so the code goes by email only.
      await client.query(
        `INSERT INTO auth.password_resets (id, identity_id, code_hash, channels, requested_ip, expires_at)
         VALUES ($1, $2, $3, 'EMAIL', $4, now() + make_interval(mins => $5))`,
        [id, identity.id, sha256(`${id}:${code}`), ip || null, MINUTES],
      );
      return identity.email as string;
    });
    if (!target) return null;
    await deliver(target, code, MINUTES);
    return 'EMAIL';
  }

  /**
   * Finishes a password reset: the emailed code, the new password and a current authenticator code,
   * so a reset never gets round MFA. Every signed-in session of the account is ended.
   */
  public static async confirmPasswordReset(input: { email: string; code: string; newPassword: string; totpCode: string }): Promise<void> {
    const generic = () => {
      const error: any = new Error('That code is wrong or has expired, or the authenticator code did not match. Ask for a new code and try again.');
      error.statusCode = 400;
      return error;
    };
    const emailNorm = input.email.trim().toLowerCase();
    const found = await db.withAuthTransaction(async (client) => {
      const identity = (await client.query(`SELECT id, status FROM auth.identities WHERE email_normalized = $1`, [emailNorm])).rows[0];
      if (!identity || identity.status !== 'ACTIVE' || emailNorm === DEMO_EMAIL) return null;
      // Each guess uses up one of five attempts on the live code.
      const reset = (
        await client.query(
          `UPDATE auth.password_resets SET attempts = attempts + 1
           WHERE id = (SELECT id FROM auth.password_resets
                       WHERE identity_id = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
                       ORDER BY created_at DESC LIMIT 1)
             AND attempts < 5
           RETURNING id, code_hash`,
          [identity.id],
        )
      ).rows[0];
      return reset ? { identityId: identity.id as string, resetId: reset.id as string, codeHash: Buffer.from(reset.code_hash) } : null;
    });
    if (!found) {
      await dummyPasswordHash();
      throw generic();
    }
    const given = sha256(`${found.resetId}:${input.code.trim()}`);
    if (given.length !== found.codeHash.length || !crypto.timingSafeEqual(given, found.codeHash)) throw generic();
    if (await this.isLocked(found.identityId)) throw this.lockedError();
    if ((await this.checkTotp(found.identityId, input.totpCode.trim())) !== 'ok') throw generic();

    const passwordHash = await hashPassword(input.newPassword);
    const done = await db.withAuthTransaction(async (client) => {
      const used = await client.query(`UPDATE auth.password_resets SET used_at = now() WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL`, [found.resetId]);
      if (used.rowCount !== 1) return false;
      await client.query(`UPDATE auth.identities SET password_hash = $2, failed_attempts = 0, locked_until = NULL WHERE id = $1`, [found.identityId, passwordHash]);
      await client.query(`UPDATE auth.password_resets SET revoked_at = now() WHERE identity_id = $1 AND used_at IS NULL AND revoked_at IS NULL`, [found.identityId]);
      await client.query(`UPDATE auth.sessions SET revoked_at = now(), revoke_reason = 'PASSWORD_RESET' WHERE identity_id = $1 AND revoked_at IS NULL`, [found.identityId]);
      return true;
    });
    if (!done) throw generic();
  }

  /** The account's live sessions, newest first. */
  public static async listSessions(identityId: string): Promise<Array<{ id: string; userAgent: string | null; ip: string | null; createdAt: Date; lastSeenAt: Date | null; expiresAt: Date }>> {
    return db.withAuthTransaction(async (client) =>
      (
        await client.query(
          `SELECT id, user_agent, host(ip_addr) AS ip, created_at, last_seen_at, expires_at
           FROM auth.sessions
           WHERE identity_id = $1 AND revoked_at IS NULL AND expires_at > now()
           ORDER BY created_at DESC LIMIT 50`,
          [identityId],
        )
      ).rows.map((r) => ({ id: r.id, userAgent: r.user_agent, ip: r.ip, createdAt: r.created_at, lastSeenAt: r.last_seen_at, expiresAt: r.expires_at })),
    );
  }

  /** Ends one session of this account. False when there is no such live session. */
  public static async revokeSession(identityId: string, sessionId: string): Promise<boolean> {
    return db.withAuthTransaction(async (client) => {
      const r = await client.query(`UPDATE auth.sessions SET revoked_at = now(), revoke_reason = 'USER_REVOKED' WHERE id = $1 AND identity_id = $2 AND revoked_at IS NULL`, [sessionId, identityId]);
      return r.rowCount === 1;
    });
  }

  /** Ends every session of this account except `keepSessionId`; returns how many were ended. */
  public static async revokeOtherSessions(identityId: string, keepSessionId: string | null, reason = 'USER_REVOKED_OTHERS'): Promise<number> {
    return db.withAuthTransaction(async (client) => {
      const r = await client.query(
        `UPDATE auth.sessions SET revoked_at = now(), revoke_reason = $3
         WHERE identity_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2::uuid)`,
        [identityId, keepSessionId, reason],
      );
      return r.rowCount ?? 0;
    });
  }

  /**
   * Changes the password with the current one and a current authenticator code. Other sessions are
   * ended; this one stays signed in. Returns how many other sessions were ended.
   */
  public static async changePassword(identityId: string, currentPassword: string, newPassword: string, totpCode: string, keepSessionId: string | null): Promise<number> {
    const identity = await db.withAuthTransaction(async (client) => (await client.query(`SELECT id, password_hash, status FROM auth.identities WHERE id = $1`, [identityId])).rows[0]);
    if (!identity || identity.status !== 'ACTIVE' || !identity.password_hash) {
      const error: any = new Error('This account is not active.');
      error.statusCode = 403;
      throw error;
    }
    if (await this.isLocked(identityId)) throw this.lockedError();
    if (!(await verifyPassword(identity.password_hash, currentPassword))) {
      await this.countFailure(identityId);
      const error: any = new Error('The current password is not right.');
      error.statusCode = 400;
      throw error;
    }
    const totp = await this.checkTotp(identityId, totpCode.trim());
    if (totp !== 'ok') {
      const error: any = new Error(totp === 'no_factor' ? 'Set up an authenticator app for this account first.' : 'The authenticator code is not right, or was already used. Wait for the next code.');
      error.statusCode = 400;
      throw error;
    }
    const passwordHash = await hashPassword(newPassword);
    await db.withAuthTransaction(async (client) => {
      await client.query(`UPDATE auth.identities SET password_hash = $2, failed_attempts = 0, locked_until = NULL WHERE id = $1`, [identityId, passwordHash]);
      await client.query(`UPDATE auth.password_resets SET revoked_at = now() WHERE identity_id = $1 AND used_at IS NULL AND revoked_at IS NULL`, [identityId]);
    });
    return this.revokeOtherSessions(identityId, keepSessionId, 'PASSWORD_CHANGED');
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
    // The session id goes into the access token (sid) so the account screen can tell which
    // signed-in session is the current one.
    const sessionId = crypto.randomUUID();

    await db.withAuthTransaction(async (client) => {
      await client.query(
        `INSERT INTO auth.sessions (id, identity_id, user_id, refresh_token_hash, mfa_verified_at, ip_addr, user_agent, expires_at)
         VALUES ($7, $1, $2, $3, now(), $4, $5, $6)`,
        [identityId, userId, tokenHash, ip || null, userAgent || null, expiresAt, sessionId],
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
    const jwtSecret = secrets.jwt();
    const accessToken = signJwt(
      {
        userId: user.id,
        firmId: user.firm_id,
        identityId,
        role: user.role,
        email: user.email,
        displayName: user.display_name,
        sid: sessionId,
      },
      jwtSecret,
      ACCESS_TOKEN_SECONDS,
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'Bearer',
      expiresInSeconds: ACCESS_TOKEN_SECONDS,
      user: userPayload,
    };
  }
}

function signJwt(payload: Record<string, unknown>, secret: string, expiresInSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ ...payload, iss: JWT_ISSUER, aud: JWT_AUDIENCE, iat, exp: iat + expiresInSeconds })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}
