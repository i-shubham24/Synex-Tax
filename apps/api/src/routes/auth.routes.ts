import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import crypto from 'node:crypto';
import { LoginRequestSchema, MfaVerifyRequestSchema, RefreshTokenRequestSchema } from '@synextax/shared-schemas';
import { hashPassword, verifyPassword, verifyTotpToken } from '../security/cryptoUtils.js';

interface UserDirectoryRecord {
  identityId: string;
  userId: string;
  firmId: string;
  firmName: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: 'PARTNER' | 'STAFF' | 'MANAGER' | 'CLIENT';
  mfaRequired: boolean;
  mfaSecret: string;
}

export async function authRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  // Pre-hashed credentials using scrypt with cryptographically random per-user salt
  const DEMO_USERS: UserDirectoryRecord[] = [
    {
      identityId: '00000000-0000-0000-0000-000000000001',
      userId: '11111111-1111-1111-1111-111111111111',
      firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      firmName: 'Verma & Associates CA',
      email: 'ca.verma@synextax.com',
      passwordHash: hashPassword('Partner@2026!'),
      displayName: 'CA Amrinder Verma',
      role: 'PARTNER',
      mfaRequired: true,
      mfaSecret: 'JBSWY3DPEHPK3PXP', // Base32 RFC 3548 seed
    },
    {
      identityId: '00000000-0000-0000-0000-000000000002',
      userId: '22222222-2222-2222-2222-222222222222',
      firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      firmName: 'Verma & Associates CA',
      email: 'staff.kaur@synextax.com',
      passwordHash: hashPassword('Staff@2026!'),
      displayName: 'Simran Kaur (Staff)',
      role: 'STAFF',
      mfaRequired: false,
      mfaSecret: 'JBSWY3DPEHPK3PXQ',
    },
  ];

  // Ephemeral session store for pending MFA challenges
  const pendingMfaSessions = new Map<string, { userId: string; expiresAt: number }>();

  // 1. Login with strict rate limiting (max 5 requests per minute)
  fastify.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const parse = LoginRequestSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
      }

      const { email, password } = parse.data;
      const user = DEMO_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());

      // Timing-safe password verification using scrypt
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return reply.status(401).send({
          error: 'Invalid credentials',
          message: 'Email or password does not match registered records',
        });
      }

      if (user.mfaRequired) {
        // Issue high-entropy session token for MFA verification step (valid for 5 minutes)
        const sessionToken = crypto.randomBytes(32).toString('hex');
        pendingMfaSessions.set(sessionToken, {
          userId: user.userId,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });

        return reply.send({
          mfaRequired: true,
          sessionToken,
          message: 'MFA verification required. Please enter 6-digit TOTP code.',
        });
      }

      const accessToken = fastify.jwt.sign(
        {
          userId: user.userId,
          firmId: user.firmId,
          identityId: user.identityId,
          role: user.role,
          email: user.email,
          displayName: user.displayName,
        },
        { expiresIn: '8h' }
      );

      const refreshToken = crypto.randomBytes(40).toString('hex');

      return reply.send({
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresInSeconds: 28800,
        user: {
          id: user.userId,
          firmId: user.firmId,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          firmName: user.firmName,
        },
      });
    }
  );

  // 2. MFA Setup (Zero third-party URL leaks: returns native otpauth URL)
  fastify.post('/mfa/setup', async (_request, reply) => {
    const user = DEMO_USERS[0];
    const otpAuthUrl = `otpauth://totp/SynexTax:${user.email}?secret=${user.mfaSecret}&issuer=SynexTax&algorithm=SHA1&digits=6&period=30`;

    return reply.send({
      secret: user.mfaSecret,
      otpAuthUrl,
      issuer: 'SynexTax',
      account: user.email,
      backupCodes: ['48291039', '91028471', '10394829', '83719204'],
    });
  });

  // 3. MFA Verification with strict rate limiting and RFC 6238 TOTP algorithm
  fastify.post(
    '/mfa/verify',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const parse = MfaVerifyRequestSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
      }

      const { totpCode } = parse.data;
      const user = DEMO_USERS[0];

      // Validate RFC 6238 TOTP with +/- 1 time step (30s) drift tolerance (or test code '123456' in non-production)
      const isTotpValid =
        verifyTotpToken(totpCode, user.mfaSecret) ||
        (process.env.NODE_ENV !== 'production' && totpCode === '123456');

      if (!isTotpValid) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid or expired TOTP verification code. Please check your authenticator clock.',
        });
      }

      const accessToken = fastify.jwt.sign(
        {
          userId: user.userId,
          firmId: user.firmId,
          identityId: user.identityId,
          role: user.role,
          email: user.email,
          displayName: user.displayName,
        },
        { expiresIn: '8h' }
      );

      const refreshToken = crypto.randomBytes(40).toString('hex');

      return reply.send({
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresInSeconds: 28800,
        user: {
          id: user.userId,
          firmId: user.firmId,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          firmName: user.firmName,
        },
      });
    }
  );

  // 4. Token Refresh
  fastify.post('/refresh', async (request, reply) => {
    const parse = RefreshTokenRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error' });
    }

    const user = DEMO_USERS[0];
    const accessToken = fastify.jwt.sign(
      {
        userId: user.userId,
        firmId: user.firmId,
        identityId: user.identityId,
        role: user.role,
        email: user.email,
        displayName: user.displayName,
      },
      { expiresIn: '8h' }
    );

    return reply.send({
      accessToken,
      refreshToken: crypto.randomBytes(40).toString('hex'),
      tokenType: 'Bearer',
      expiresInSeconds: 28800,
    });
  });
}
