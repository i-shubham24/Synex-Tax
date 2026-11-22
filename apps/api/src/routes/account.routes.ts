import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { AuthService, signChallengeToken } from '../modules/auth/authService.js';
import { accountMailer, resetCodeEmail } from '../modules/auth/accountMail.js';
import { sha256 } from '../security/authCrypto.js';
import { isLocalEnv } from '../security/env.js';
import { publicMessage } from '../plugins/publicError.js';

const TOKEN = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const PASSWORD = z.string().min(8, 'Use at least 8 characters.').max(128);
const TOTP = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.');
const EMAIL = z.string().trim().email().max(254);

const LookupBody = z.object({ token: TOKEN });
const AcceptBody = z.object({ token: TOKEN, password: PASSWORD, existingAccount: z.boolean().default(false), totpCode: TOTP.optional() });
const ResetRequestBody = z.object({ email: EMAIL });
const ResetConfirmBody = z.object({ email: EMAIL, code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.'), newPassword: PASSWORD, totpCode: TOTP });
const ChangePasswordBody = z.object({ currentPassword: z.string().min(1).max(128), newPassword: PASSWORD, totpCode: TOTP });

/** The same answer for every reset request, whether or not the email has an account. */
const RESET_ANSWER = 'If this email has a SynexTax account, a 6-digit code is on its way. It works for 15 minutes.';
/** The floor for a reset request's answer time, so a known email does not answer slower or faster. */
const RESET_FLOOR_MS = process.env.NODE_ENV === 'test' ? 0 : 1200;

const ROLE_LABEL: Record<string, string> = { MANAGER: 'Manager', STAFF: 'Team member', CLIENT: 'Client contact' };

function httpError(statusCode: number, message: string): Error {
  const e: any = new Error(message);
  e.statusCode = statusCode;
  return e;
}

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Some of the details sent are missing or not valid.';
}

/** IPv4 to its /24, IPv6 to its /48: enough to recognise a place, not a household. */
export function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/i.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (ip.includes(':')) {
    const [head] = ip.split('::');
    const groups = head.split(':').filter(Boolean).slice(0, 3);
    while (groups.length < 3) groups.push('0');
    return `${groups.join(':')}::/48`;
  }
  return null;
}

/** A plain description of the device from its user agent, such as "Chrome on Windows". */
export function describeDevice(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /curl|node|undici|okhttp|python/i.test(ua)
              ? 'Script or app'
              : 'Browser';
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iPhone or iPad'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'Mac'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : '';
  return os ? `${browser} on ${os}` : browser;
}

/** Invitation acceptance, password reset, signed-in sessions and password change. Mounted at /api/v1/account. */
export async function accountRoutes(fastify: FastifyInstance) {
  const signedIn = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  };
  const sid = (request: FastifyRequest) => {
    const v = (request.user as { sid?: unknown }).sid;
    return typeof v === 'string' && z.guid().safeParse(v).success ? v : null;
  };
  const fail = (reply: FastifyReply, err: any, fallback = 500) => reply.status(err?.statusCode || fallback).send({ error: 'Request failed', message: publicMessage(err) });

  const resolveInvite = (token: string) =>
    db.withAnonymousTransaction(async (c) =>
      (
        await c.query<{ invitation_id: string; firm_id: string; firm_name: string; email: string; display_name: string; role: string; expires_at: Date }>(
          'SELECT * FROM app.resolve_invitation($1)',
          [sha256(token)],
        )
      ).rows[0] ?? null,
    );
  const GONE = 'This invitation link has expired, was already used or was withdrawn. Ask the firm for a new one.';

  // ------------------------------------------------------------------ invitations
  // The token travels in the body, not the path, so it never lands in access logs.
  fastify.post('/invites/lookup', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const b = LookupBody.safeParse(request.body);
    if (!b.success) return reply.status(404).send({ error: 'Not found', message: GONE });
    const inv = await resolveInvite(b.data.token);
    if (!inv) return reply.status(404).send({ error: 'Not found', message: GONE });
    return reply.send({ firmName: inv.firm_name, name: inv.display_name, email: inv.email, role: inv.role, roleLabel: ROLE_LABEL[inv.role] ?? inv.role, expiresAt: new Date(inv.expires_at).toISOString() });
  });

  fastify.post('/invites/accept', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const b = AcceptBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: firstIssue(b.error) });
    if (b.data.existingAccount && !b.data.totpCode) return reply.status(400).send({ error: 'Invalid', message: 'Enter the 6-digit code from your authenticator app.' });
    try {
      const inv = await resolveInvite(b.data.token);
      if (!inv) throw httpError(404, GONE);

      let identityId: string;
      let enrolment: Awaited<ReturnType<typeof AuthService.createInvitedIdentity>> | null = null;
      if (b.data.existingAccount) {
        identityId = await AuthService.verifyExistingAccount(inv.email, b.data.password, b.data.totpCode!);
      } else {
        enrolment = await AuthService.createInvitedIdentity(inv.email, b.data.password);
        identityId = enrolment.identityId;
      }

      // The membership, its clients and the claim on the invitation happen together, or not at all.
      const userId = crypto.randomUUID();
      await db.withSystemTransaction(
        inv.firm_id,
        async (c) => {
          const row = (
            await c.query(
              `SELECT id, role, display_name, designation, entity_ids, access_level, invited_by
               FROM public.user_invitations WHERE id = $1 AND status = 'PENDING' AND expires_at > now() FOR UPDATE`,
              [inv.invitation_id],
            )
          ).rows[0];
          if (!row) throw httpError(404, GONE);
          try {
            await c.query(
              `INSERT INTO public.users (id, firm_id, identity_id, display_name, role, designation, status, created_by)
               VALUES ($1, app.current_firm_id(), $2, $3, $4, $5, 'ACTIVE', $6)`,
              [userId, identityId, row.display_name, row.role, row.designation, row.invited_by],
            );
          } catch (err: any) {
            if (err?.code === '23505') throw httpError(409, 'You are already a member of this firm. Sign in instead.');
            throw err;
          }
          if (row.entity_ids?.length) {
            await c.query(
              `INSERT INTO public.user_client_assignments (firm_id, user_id, entity_id, access_level, assigned_by)
               SELECT app.current_firm_id(), $1, e.id, $2, $3 FROM public.entities e WHERE e.id = ANY($4::uuid[])`,
              [userId, row.access_level, row.invited_by, row.entity_ids],
            );
          }
          await c.query(`UPDATE public.user_invitations SET status = 'ACCEPTED', accepted_user_id = $2, accepted_at = now() WHERE id = $1`, [row.id, userId]);
        },
        { ip: request.ip, requestId: request.id, userAgent: request.headers['user-agent'] },
      );

      if (!enrolment) return reply.send({ existingAccount: true, firmName: inv.firm_name, message: `You have joined ${inv.firm_name}. Sign in with your usual password and authenticator code.` });
      // Next step: the invitee scans the QR code and confirms one code at /api/v1/auth/mfa/enroll.
      return reply.status(201).send({
        existingAccount: false,
        firmName: inv.firm_name,
        challengeToken: signChallengeToken({ purpose: 'MFA_ENROLL', identityId, userId, firmId: inv.firm_id }, 900),
        secret: enrolment.secret,
        qrCodeDataUrl: enrolment.qrCodeDataUrl,
        recoveryCodes: enrolment.recoveryCodes,
      });
    } catch (err: any) {
      if (!err?.statusCode) request.log.error({ err }, 'Invitation acceptance failed');
      return fail(reply, err);
    }
  });

  // ------------------------------------------------------------------ password reset
  fastify.post('/password-reset/request', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const b = ResetRequestBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Enter the email you sign in with.' });
    const started = Date.now();
    const mailer = accountMailer();
    try {
      await AuthService.requestPasswordReset(b.data.email, request.ip, async (to, code, minutes) => {
        if (mailer) {
          await mailer.send(resetCodeEmail({ to, code, minutes }));
        } else if (isLocalEnv() && process.env.NODE_ENV !== 'test') {
          // Local development without SES: the code goes to the server console so the flow can be tried.
          request.log.warn(`Password reset code (local development, email not configured): ${code}`);
        }
      });
    } catch (err) {
      // The caller gets the same answer whatever happened; the failure is for the operators.
      request.log.error({ err }, 'Password reset request failed');
    }
    const wait = RESET_FLOOR_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return reply.status(202).send({ ok: true, message: RESET_ANSWER, emailConfigured: Boolean(mailer) });
  });

  fastify.post('/password-reset/confirm', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const b = ResetConfirmBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: firstIssue(b.error) });
    try {
      await AuthService.confirmPasswordReset(b.data);
      return reply.send({ ok: true, message: 'Your password is changed and every signed-in session has been ended. Sign in with the new password.' });
    } catch (err: any) {
      if (!err?.statusCode) request.log.error({ err }, 'Password reset failed');
      return fail(reply, err);
    }
  });

  // ------------------------------------------------------------------ signed-in sessions
  fastify.get('/sessions', { preHandler: signedIn }, async (request, reply) => {
    const current = sid(request);
    const rows = await AuthService.listSessions(request.user.identityId);
    reply.header('Cache-Control', 'no-store');
    return reply.send({
      currentSessionKnown: Boolean(current),
      sessions: rows.map((s) => ({
        id: s.id,
        device: describeDevice(s.userAgent),
        ipMasked: maskIp(s.ip),
        lastUsedAt: new Date(s.lastSeenAt ?? s.createdAt).toISOString(),
        expiresAt: new Date(s.expiresAt).toISOString(),
        current: s.id === current,
      })),
    });
  });

  fastify.post('/sessions/:id/revoke', { preHandler: signedIn, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!z.guid().safeParse(id).success) return reply.status(400).send({ error: 'Invalid' });
    const ok = await AuthService.revokeSession(request.user.identityId, id);
    if (!ok) return reply.status(404).send({ error: 'Not found', message: 'That session has already ended.' });
    return reply.send({ ok: true, current: id === sid(request) });
  });

  fastify.post('/sessions/revoke-others', { preHandler: signedIn, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const current = sid(request);
    const ended = await AuthService.revokeOtherSessions(request.user.identityId, current);
    return reply.send({ ok: true, ended, keptCurrent: Boolean(current) });
  });

  // ------------------------------------------------------------------ password change
  fastify.post('/password', { preHandler: signedIn, config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const b = ChangePasswordBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: firstIssue(b.error) });
    if (b.data.currentPassword === b.data.newPassword) return reply.status(400).send({ error: 'Invalid', message: 'Choose a password different from the current one.' });
    try {
      const ended = await AuthService.changePassword(request.user.identityId, b.data.currentPassword, b.data.newPassword, b.data.totpCode, sid(request));
      return reply.send({ ok: true, endedOtherSessions: ended, message: ended ? `Password changed. ${ended} other session${ended === 1 ? '' : 's'} signed out.` : 'Password changed.' });
    } catch (err: any) {
      if (!err?.statusCode) request.log.error({ err }, 'Password change failed');
      return fail(reply, err);
    }
  });
}
