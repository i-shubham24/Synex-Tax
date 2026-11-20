import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../modules/auth/authService.js';

const SignupSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  firmName: z.string().min(2).max(200),
  frnNumber: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const MfaEnrollSchema = z.object({
  challengeToken: z.string(),
  totpCode: z.string().regex(/^\d{6}$/, 'Enter the 6-digit TOTP code'),
});

const MfaVerifySchema = z.object({
  challengeToken: z.string(),
  code: z.string().min(6).max(30),
});

const RefreshSchema = z.object({
  refreshToken: z.string().optional(),
});

function setRefreshCookie(reply: FastifyReply, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  const cookie = `synextax_refresh=${token}; Path=/api/v1/auth; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${isProd ? '; Secure' : ''}`;
  reply.header('Set-Cookie', cookie);
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.header('Set-Cookie', 'synextax_refresh=; Path=/api/v1/auth; HttpOnly; SameSite=Lax; Max-Age=0');
}

function extractRefreshToken(request: FastifyRequest): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, decodeURIComponent(v.join('='))];
      }),
    );
    if (cookies['synextax_refresh']) return cookies['synextax_refresh'];
  }
  return (request.body as { refreshToken?: string })?.refreshToken;
}

export function demoWorkspaceEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEMO_WORKSPACE === 'true';
}

export async function authRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  // The demo workspace has a fixed password and no MFA, so it exists only in development
  // or where it is switched on explicitly (ENABLE_DEMO_WORKSPACE=true on a demo deployment).
  if (demoWorkspaceEnabled()) {
    try {
      await AuthService.ensureDemoPartner();
    } catch {
      // Dev db might not be running yet, will seed on first demo request
    }
  }

  // 1. Signup with automatic firm provisioning and trial workspace seeding
  fastify.post('/signup', async (request: FastifyRequest, reply: FastifyReply) => {
    const parse = SignupSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    try {
      const result = await AuthService.signup({
        ...parse.data,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({
        error: err.name || 'Signup Failed',
        message: err.message,
      });
    }
  });

  // 2. Complete MFA enrollment
  fastify.post('/mfa/enroll', async (request: FastifyRequest, reply: FastifyReply) => {
    const parse = MfaEnrollSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    try {
      const tokens = await AuthService.completeMfaEnrollment(
        parse.data.challengeToken,
        parse.data.totpCode,
        request.ip,
        request.headers['user-agent'],
      );
      setRefreshCookie(reply, tokens.refreshToken);
      return reply.send(tokens);
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({
        error: err.name || 'MFA Enrollment Failed',
        message: err.message,
      });
    }
  });

  // 3. Login with rate limiting (5 req / min)
  fastify.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parse = LoginSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
      }

      try {
        const result = await AuthService.login(parse.data.email, parse.data.password);
        if (result.mfaRequired) {
          return reply.send({
            mfaRequired: true,
            challengeToken: result.challengeToken,
            message: 'Please enter your 6-digit authenticator code or backup recovery code.',
          });
        }

        if (result.tokens) {
          setRefreshCookie(reply, result.tokens.refreshToken);
          return reply.send(result.tokens);
        }

        return reply.status(500).send({ error: 'Unexpected login state' });
      } catch (err: any) {
        return reply.status(err.statusCode || 401).send({
          error: 'Authentication Failed',
          message: err.message,
        });
      }
    },
  );

  // 4. MFA Verification
  fastify.post(
    '/mfa/verify',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parse = MfaVerifySchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
      }

      try {
        const tokens = await AuthService.verifyMfa(
          parse.data.challengeToken,
          parse.data.code,
          request.ip,
          request.headers['user-agent'],
        );
        setRefreshCookie(reply, tokens.refreshToken);
        return reply.send(tokens);
      } catch (err: any) {
        return reply.status(err.statusCode || 401).send({
          error: 'MFA Verification Failed',
          message: err.message,
        });
      }
    },
  );

  // 5. Token Refresh with token rotation
  fastify.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    RefreshSchema.safeParse(request.body);
    const token = extractRefreshToken(request);

    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing refresh token in cookie or payload' });
    }

    try {
      const tokens = await AuthService.refreshToken(token, request.ip, request.headers['user-agent']);
      setRefreshCookie(reply, tokens.refreshToken);
      return reply.send(tokens);
    } catch (err: any) {
      clearRefreshCookie(reply);
      return reply.status(err.statusCode || 401).send({
        error: 'Refresh Failed',
        message: err.message,
      });
    }
  });

  // 6. Logout
  fastify.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractRefreshToken(request);
    if (token) {
      await AuthService.logout(token).catch(() => {});
    }
    clearRefreshCookie(reply);
    return reply.send({ success: true, message: 'Logged out successfully' });
  });

  // 7. Demo mode endpoint (returns real database session for CA Verma)
  fastify.post('/demo', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!demoWorkspaceEnabled()) {
      return reply.status(404).send({ error: 'Not Found' });
    }
    try {
      const demo = await AuthService.ensureDemoPartner();
      const loginRes = await AuthService.login('ca.verma@synextax.com', 'Partner@2026!');
      if (loginRes.tokens) {
        setRefreshCookie(reply, loginRes.tokens.refreshToken);
        return reply.send(loginRes.tokens);
      }
      return reply.send(demo);
    } catch (err: any) {
      return reply.status(500).send({ error: 'Demo Initialization Failed', message: err.message });
    }
  });

  // 8. Current authenticated user profile
  fastify.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    return reply.send({
      user: request.user,
    });
  });
}
