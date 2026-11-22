import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { enforceMakerCheckerGuard } from '../plugins/authGuard.js';
import { db } from '../db/pool.js';
import { AgentKeyMissingError, issueAgentChallenge } from '../security/agentChallenge.js';
import { checkDscSignature, trustedRoots, type DscCertInfo } from '../security/dscSignature.js';
import { isLocalEnv } from '../security/env.js';

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

const Pan = z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/);
const Base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);

const DscChallengeRequestSchema = z.object({
  filingId: z.guid(),
  // The authorised signatory, when known; the certificate must then carry this PAN.
  signatoryPan: Pan.optional(),
});

const DscVerifyRequestSchema = z.object({
  challengeNonce: z.string().length(64),
  filingId: z.guid(),
  signature: Base64.max(2048),
  algorithm: z.enum(['RSA_PKCS1_SHA256', 'ECDSA_SHA256']),
  certificate: Base64.max(16384),
  chain: z.array(Base64.max(16384)).max(6).optional(),
});

interface ChallengeRecord {
  challengeNonce: string;
  filingId: string;
  firmId: string;
  entityId: string;
  signatoryPan: string | null;
  formType: string;
  payload: string;
  digestSha256: string;
  expiresAt: number;
}

const activeChallenges = new Map<string, ChallengeRecord>();

const maskPan = (pan: string | null) => (pan ? `XXXXX${pan.slice(5)}` : null);
const operationFor = (form: string) =>
  /130|131|133|16/.test(form) ? 'FORM_130_131_PADES' : /^(GSTR|GST)/i.test(form) ? 'GST_RETFILE_PKCS7' : 'TRACES_BATCH_PADES';

/**
 * Signing a return with a Class 3 DSC through the desktop agent:
 * 1. POST /challenge: the server builds the document to sign from the return itself, keeps it,
 *    and returns its SHA-256 digest with a server-signed agent token.
 * 2. The browser asks the agent to sign that digest with a certificate on the computer; the
 *    token's own driver asks for the PIN.
 * 3. POST /verify: the server checks the signature with the certificate's public key, and the
 *    certificate against the trusted roots (DSC_TRUSTED_ROOTS), and records the attempt.
 */
export async function dscRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid JWT session token required for DSC bridge' });
    }
  });

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

  // A signed, single-use token the desktop agent requires before it acts (FVU, backups).
  app.post('/agent-challenge', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.user.role === 'CLIENT') return reply.status(403).send({ error: 'Forbidden', message: 'A client login cannot use the desktop agent.' });
    const parsed = z.object({ action: z.enum(['backup.run', 'fvu.prepare']) }).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_ACTION', message: 'Say which agent action this is for.' });
    try {
      return reply.status(201).send(issueAgentChallenge(parsed.data.action));
    } catch (err) {
      if (err instanceof AgentKeyMissingError) return reply.status(503).send({ error: 'AGENT_KEY_MISSING', message: err.message });
      throw err;
    }
  });

  app.post('/challenge', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!['PARTNER', 'MANAGER'].includes(req.user.role)) return reply.status(403).send({ error: 'Forbidden', message: 'A partner or manager signs returns.' });
    const parsed = DscChallengeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_DSC_CHALLENGE_REQUEST', message: 'Choose a return to sign.' });
    }
    const firmId = req.user?.firmId;
    if (!firmId) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing firm identity in authentication token' });
    }
    const { filingId, signatoryPan } = parsed.data;

    let agentToken: string;
    try {
      agentToken = issueAgentChallenge('dsc.sign').token;
    } catch (err) {
      if (err instanceof AgentKeyMissingError) return reply.status(503).send({ error: 'AGENT_KEY_MISSING', message: err.message });
      throw err;
    }

    const row = await db.withTenantTransaction(getCtx(req), async (client: any) => {
      const res = await client.query(
        `SELECT f.id, f.entity_id, 'GST' AS kind, f.return_type AS form, f.return_period AS period, e.legal_name AS client,
                json_build_object('grossTaxLiability', f.gross_tax_liability::text, 'itcClaimed', f.total_itc_claimed::text) AS figures
         FROM public.gst_filings f JOIN public.entities e ON e.id = f.entity_id
         WHERE f.id = $1 AND f.workflow_status NOT IN ('FILED','CLOSED')
         UNION ALL
         SELECT r.id, r.entity_id, 'TDS', 'FORM_' || r.form_code, r.quarter || ' TY ' || r.tax_year, e.legal_name,
                json_build_object('returnType', r.return_type, 'correctionNo', r.correction_no, 'deductees', r.total_deductees,
                                  'amountPaid', r.total_amount_paid::text, 'taxDeducted', r.total_tax_deducted::text,
                                  'taxDeposited', r.total_tax_deposited::text)
         FROM public.tds_returns r JOIN public.entities e ON e.id = r.entity_id
         WHERE r.id = $1 AND r.workflow_status NOT IN ('FILED','CLOSED')
         LIMIT 1`,
        [filingId],
      );
      return res.rows[0] as
        | { id: string; entity_id: string; kind: string; form: string; period: string; client: string; figures: Record<string, unknown> }
        | undefined;
    });
    if (!row) return reply.status(404).send({ error: 'FILING_NOT_FOUND', message: 'There is no open return with this id in your firm.' });

    const challengeNonce = crypto.randomBytes(32).toString('hex');
    const payload = JSON.stringify({
      purpose: 'SynexTax return sign-off',
      firmId,
      filingId: row.id,
      kind: row.kind,
      form: row.form,
      period: row.period,
      client: row.client,
      figures: row.figures,
      nonce: challengeNonce,
      issuedAt: new Date().toISOString(),
    });
    const digestSha256 = crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
    activeChallenges.set(challengeNonce, {
      challengeNonce,
      filingId: row.id,
      firmId,
      entityId: row.entity_id,
      signatoryPan: signatoryPan ?? null,
      formType: row.form,
      payload,
      digestSha256,
      expiresAt: Date.now() + 120 * 1000,
    });

    return reply.status(201).send({
      success: true,
      data: {
        challengeNonce,
        agentToken,
        digestSha256,
        payload,
        document: { form: row.form, period: row.period, client: row.client },
        expiresInSeconds: 120,
      },
    });
  });

  // Check the signature and record it, with the Maker-Checker guard
  app.post('/verify', async (req: FastifyRequest, reply: FastifyReply) => {
    // Maker-Checker enforcement: Staff cannot sign or file returns under Section 39 / Rule 26
    await enforceMakerCheckerGuard(req, reply, 'SIGN');
    if (reply.sent) return;

    const parsed = DscVerifyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_DSC_VERIFY_REQUEST', message: 'The signature from the agent was incomplete.' });
    }
    const { challengeNonce, filingId, signature, algorithm, certificate, chain } = parsed.data;

    const challenge = activeChallenges.get(challengeNonce);
    if (!challenge) {
      return reply.status(403).send({
        error: 'CHALLENGE_NOT_FOUND_OR_EXPIRED',
        message: 'This signing request was not found or has expired. Start again.',
      });
    }
    // BOLA guard: the challenge belongs to the caller's firm
    if (challenge.firmId !== req.user?.firmId) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'This signing request belongs to another firm.' });
    }
    // Single use, whatever the outcome.
    activeChallenges.delete(challengeNonce);
    if (Date.now() > challenge.expiresAt) {
      return reply.status(403).send({ error: 'CHALLENGE_EXPIRED', message: 'The two minutes to sign have passed. Start again.' });
    }
    if (challenge.filingId !== filingId) {
      return reply.status(400).send({ error: 'FILING_ID_MISMATCH', message: 'This signature was requested for a different return.' });
    }

    const roots = trustedRoots();
    const production = !isLocalEnv();
    if (production && roots.length === 0) {
      return reply.status(503).send({
        error: 'DSC_ROOTS_MISSING',
        message: 'DSC signing is not set up on this server: the CCA India root certificates are not configured.',
      });
    }

    const check = checkDscSignature({ payload: challenge.payload, signature, algorithm, certificate, chain, roots, expectedPan: challenge.signatoryPan });

    // Every attempt, accepted or not, goes to the append-only signing trail.
    const record = (cert: DscCertInfo | undefined, status: string, errorCode: string | null, errorMessage: string | null) =>
      db.withTenantTransaction(getCtx(req), async (client: any) => {
        const n = challengeNonce;
        const nonceUuid = `${n.slice(0, 8)}-${n.slice(8, 12)}-${n.slice(12, 16)}-${n.slice(16, 20)}-${n.slice(20, 32)}`;
        await client.query(
          `SELECT audit.log_signing_event(app.current_firm_id(), $1, NULL, $2, $3, $4, $5, $6, $7::uuid, $8, $9, $10, $11)`,
          [
            challenge.entityId,
            (cert?.serialHex ?? 'UNKNOWN').slice(0, 64),
            cert?.pan ?? challenge.signatoryPan,
            (cert?.commonName ?? '').slice(0, 150) || null,
            operationFor(challenge.formType),
            challenge.digestSha256,
            nonceUuid,
            'UNKNOWN',
            status,
            errorCode,
            errorMessage,
          ],
        );
      });

    const rejection = !check.ok
      ? check
      : production && !check.chainVerified
        ? { ok: false as const, error: 'CERTIFICATE_NOT_TRUSTED', message: 'This DSC was not issued under a trusted CCA India root.', cert: check.cert }
        : null;
    if (rejection) {
      try {
        await record(rejection.cert, 'REJECTED', rejection.error, rejection.message);
      } catch (err: any) {
        req.log.error({ err: err.code ?? err.message }, 'DSC signing audit write failed');
      }
      return reply.status(422).send({ error: rejection.error, message: rejection.message });
    }

    const ok = check as Extract<typeof check, { ok: true }>;
    // If the signing cannot be recorded, it is not accepted.
    try {
      await record(ok.cert, ok.chainVerified ? 'SUCCESS' : 'UNVERIFIED', null, null);
    } catch (err: any) {
      req.log.error({ err: err.code ?? err.message }, 'DSC signing audit write failed');
      return reply.status(503).send({
        error: 'AUDIT_UNAVAILABLE',
        message: 'The signing could not be recorded in the audit trail, so it was not accepted. Try again.',
      });
    }

    return reply.status(200).send({
      success: true,
      data: {
        status: ok.chainVerified ? 'SIGNED' : 'SIGNED_CERTIFICATE_UNCHECKED',
        filingId,
        formType: challenge.formType,
        digestSha256: challenge.digestSha256,
        signatureVerified: true,
        chainVerified: ok.chainVerified,
        certificate: {
          commonName: ok.cert.commonName,
          issuer: ok.cert.issuer,
          serialNumber: ok.cert.serialHex,
          validTo: ok.cert.validTo,
          pan: maskPan(ok.cert.pan),
        },
        signedAt: new Date().toISOString(),
        auditRecorded: true,
      },
    });
  });
}
