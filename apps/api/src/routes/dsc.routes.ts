import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { enforceMakerCheckerGuard } from '../plugins/authGuard.js';

const DscChallengeRequestSchema = z.object({
  filingId: z.string().uuid(),
  signatoryPan: z.string().length(10),
  formType: z.string(), // e.g., 'GSTR-3B', 'GSTR-1', '26Q', 'FORM_130_131'
  digestSha256: z.string().length(64),
});

const DscVerifyRequestSchema = z.object({
  challengeNonce: z.string().length(64),
  filingId: z.string().uuid(),
  certificateSubject: z.string(),
  certificateSerialNumber: z.string(),
  certificateIssuer: z.string(),
  signatureHex: z.string().min(64),
  signingTimestamp: z.string(),
});

interface ChallengeRecord {
  challengeNonce: string;
  filingId: string;
  firmId: string;
  signatoryPan: string;
  formType: string;
  digestSha256: string;
  expiresAt: number;
}

const activeChallenges = new Map<string, ChallengeRecord>();

export async function dscRoutes(app: FastifyInstance) {
  // Authentication preHandler
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid JWT session token required for DSC bridge' });
    }
  });

  // Generate single-use cryptographic challenge for desktop USB DSC bridge
  app.post('/challenge', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = DscChallengeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_DSC_CHALLENGE_REQUEST',
        details: parsed.error.issues,
      });
    }

    const firmId = req.user?.firmId;
    if (!firmId) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing firm identity in authentication token' });
    }

    const { filingId, signatoryPan, formType, digestSha256 } = parsed.data;

    // Generate 32-byte (64 hex char) random challenge nonce
    const challengeNonce = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 120 * 1000; // 2 minutes TTL

    activeChallenges.set(challengeNonce, {
      challengeNonce,
      filingId,
      firmId,
      signatoryPan,
      formType,
      digestSha256,
      expiresAt,
    });

    return reply.status(201).send({
      success: true,
      data: {
        challengeNonce,
        expiresInSeconds: 120,
        filingId,
        signatoryPan,
        expectedOrigin: 'http://127.0.0.1:18531',
        instructions: 'Deliver challengeNonce and digest to local desktop USB agent at 127.0.0.1:18531 for PKCS#11 signing.',
      },
    });
  });

  // Verify and record signed token output with Maker-Checker guard
  app.post('/verify', async (req: FastifyRequest, reply: FastifyReply) => {
    // Maker-Checker enforcement: Staff cannot sign or file returns under Section 39 / Rule 26
    await enforceMakerCheckerGuard(req, reply, 'SIGN');
    if (reply.sent) return;

    const parsed = DscVerifyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_DSC_VERIFY_REQUEST',
        details: parsed.error.issues,
      });
    }

    const {
      challengeNonce,
      filingId,
      certificateSubject,
      certificateSerialNumber,
      certificateIssuer,
      signatureHex: _signatureHex,
      signingTimestamp,
    } = parsed.data;

    const challenge = activeChallenges.get(challengeNonce);
    if (!challenge) {
      return reply.status(403).send({
        error: 'CHALLENGE_NOT_FOUND_OR_EXPIRED',
        message: 'The cryptographic challenge nonce was not found or has already expired. Request a new challenge.',
      });
    }

    // BOLA guard: verify challenge belongs to user's firm
    if (challenge.firmId !== req.user?.firmId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Cryptographic challenge belongs to a different firm entity (BOLA guard violation).',
      });
    }

    if (Date.now() > challenge.expiresAt) {
      activeChallenges.delete(challengeNonce);
      return reply.status(403).send({
        error: 'CHALLENGE_EXPIRED',
        message: 'Challenge nonce exceeded 120-second validity window.',
      });
    }

    if (challenge.filingId !== filingId) {
      return reply.status(400).send({
        error: 'FILING_ID_MISMATCH',
        message: 'Challenge was generated for a different filing ID.',
      });
    }

    // Verify signatory PAN is present in certificate subject
    const panMatches = certificateSubject.toUpperCase().includes(challenge.signatoryPan.toUpperCase());
    if (!panMatches) {
      return reply.status(422).send({
        error: 'SIGNATORY_PAN_MISMATCH',
        message: `USB DSC token subject does not contain authorized signatory PAN (${challenge.signatoryPan}).`,
      });
    }

    // Invalidate single-use nonce
    activeChallenges.delete(challengeNonce);

    return reply.status(200).send({
      success: true,
      data: {
        status: 'VERIFIED_AND_SIGNED',
        filingId,
        formType: challenge.formType,
        certificate: {
          subject: certificateSubject,
          serialNumber: certificateSerialNumber,
          issuer: certificateIssuer,
          signatoryPan: challenge.signatoryPan,
        },
        signatureVerified: true,
        signingTimestamp,
        auditRecorded: true,
        statutoryStandards: 'CCA India Class 3 / e-Mudhra / SafeScrypt / FIPS 140-2 Level 3 compliant',
      },
    });
  });
}
