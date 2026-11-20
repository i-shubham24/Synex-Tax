import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { enforceMakerCheckerGuard } from '../plugins/authGuard.js';
import { db } from '../db/pool.js';

const getCtx = (req: FastifyRequest) => {
  const user = req.user as { firmId: string; userId: string; role: string };
  return {
    firmId: user.firmId,
    userId: user.userId,
    actorKind: 'USER' as const,
    ip: req.ip,
    userAgent: req.headers['user-agent'] as string,
    requestId: req.id,
  };
};

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

  // Query detected Class 3 USB Cryptographic Tokens
  app.get('/tokens', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      agentStatus: 'ONLINE',
      agentVersion: '0.1.0',
      listenAddress: '127.0.0.1:18531',
      tokensDetected: 1,
      tokens: [
        {
          id: 'token-epass-01',
          tokenModel: 'ePass2003 Auto / mToken CryptoID',
          manufacturer: 'Feitian Technologies / HyperSecu',
          serialNumber: 'FT2003A-9018442',
          tokenProfile: 'FIPS_140_3',
          fipsLevel: 'FIPS 140-3 Level 3',
          slotId: 0,
          status: 'READY_FOR_SIGNING',
          certificate: {
            subject: 'CN=CA Amrinder Verma, SERIALNUMBER=014289N, OID.2.5.4.45=AAAPV8912K, O=Verma & Associates CA, C=IN',
            holderName: 'CA Amrinder Verma, FCA',
            holderPan: 'AAAPV8912K',
            issuer: 'e-Mudhra Sub-CA for Class 3 Individual 2024',
            serialNumberHex: '3A4B892F10E401',
            validFrom: '2024-10-15T00:00:00Z',
            validTo: '2027-10-14T23:59:59Z',
            keyAlgorithm: 'RSA 2048-bit (SHA-256)',
            certificateClass: 'Class 3 (Signing & Encryption)',
          },
        },
      ],
    });
  });

  // Generate single-use cryptographic challenge for desktop USB DSC bridge
  // Open returns in this firm that can be sent for signing (RLS limits staff to their clients).
  app.get('/signable', async (req: FastifyRequest, reply: FastifyReply) => {
    const rows = await db.withTenantTransaction(getCtx(req), async (client: any) => {
      const res = await client.query(
        `SELECT f.id, f.return_type AS form, f.return_period AS period, e.legal_name AS client
         FROM public.gst_filings f JOIN public.entities e ON e.id = f.entity_id
         WHERE f.workflow_status NOT IN ('FILED','CLOSED')
         UNION ALL
         SELECT r.id, 'FORM_' || r.form_code, r.quarter || ' TY ' || r.tax_year, e.legal_name
         FROM public.tds_returns r JOIN public.entities e ON e.id = r.entity_id
         WHERE r.workflow_status NOT IN ('FILED','CLOSED')
         ORDER BY 3 DESC
         LIMIT 50`,
      );
      return res.rows;
    });
    return reply.send({ success: true, data: rows });
  });

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

    // The local agent does not yet sign on a hardware token (it returns a simulated value and no
    // certificate), so the server cannot verify the signature. Never let that reach a live filing.
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SIMULATED_DSC !== 'true') {
      return reply.status(503).send({
        error: 'DSC_SIGNING_UNAVAILABLE',
        message: 'Hardware DSC signing is not available yet. Use EVC, or sign on the portal.',
      });
    }

    // Every signing attempt is written to the append-only signing trail through the audit writer
    // function, against the filing's own entity. If it cannot be recorded, the signing fails.
    try {
      await db.withTenantTransaction(getCtx(req), async (client: any) => {
        const filing = await client.query(
          `SELECT entity_id FROM public.gst_filings WHERE id = $1
           UNION ALL
           SELECT entity_id FROM public.tds_returns WHERE id = $1
           LIMIT 1`,
          [filingId],
        );
        if (!filing.rows[0]) {
          const err: any = new Error('FILING_NOT_FOUND');
          err.statusCode = 404;
          throw err;
        }
        // The 32-byte challenge nonce is stored as a UUID-shaped value (first 16 bytes).
        const n = challengeNonce;
        const nonceUuid = `${n.slice(0, 8)}-${n.slice(8, 12)}-${n.slice(12, 16)}-${n.slice(16, 20)}-${n.slice(20, 32)}`;
        await client.query(
          `SELECT audit.log_signing_event(app.current_firm_id(), $1, NULL, $2, $3, $4, $5, $6, $7::uuid, $8, $9, NULL, NULL)`,
          [
            filing.rows[0].entity_id,
            certificateSerialNumber.slice(0, 64),
            challenge.signatoryPan,
            (certificateSubject.split(',')[0] ?? '').replace('CN=', '').slice(0, 150),
            /130|131|133|16/.test(challenge.formType)
              ? 'FORM_130_131_PADES'
              : /^(GSTR|GST)/i.test(challenge.formType)
                ? 'GST_RETFILE_PKCS7'
                : 'TRACES_BATCH_PADES',
            challenge.digestSha256,
            nonceUuid,
            'UNKNOWN',
            'UNVERIFIED',
          ],
        );
      });
    } catch (err: any) {
      if (err.statusCode === 404) {
        return reply.status(404).send({ error: 'FILING_NOT_FOUND', message: 'This filing does not exist in your firm.' });
      }
      req.log.error({ err: err.code ?? err.message }, 'DSC signing audit write failed');
      return reply.status(503).send({
        error: 'AUDIT_UNAVAILABLE',
        message: 'The signing could not be recorded in the audit trail, so it was not accepted. Try again.',
      });
    }

    return reply.status(200).send({
      success: true,
      data: {
        status: 'SIGNED_UNVERIFIED',
        filingId,
        formType: challenge.formType,
        certificate: {
          subject: certificateSubject,
          serialNumber: certificateSerialNumber,
          issuer: certificateIssuer,
          signatoryPan: challenge.signatoryPan,
        },
        // No certificate or CMS structure is sent yet, so the server cannot check the signature.
        signatureVerified: false,
        signingTimestamp,
        auditRecorded: true,
      },
    });
  });
}
