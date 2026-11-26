import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/pool.js';
import { enforceMakerCheckerGuard } from '../../plugins/authGuard.js';
import { maskPan, parseConsoFile, correctionTypesNeeded } from '@synextax/tax-engine';
import { getTenantContext, resolveTanRegistration } from './tdsHelper.js';

const PrnTokenSchema = z.object({
  tokenNumber: z.string().regex(/^[0-9]{15}$/, 'Provisional Receipt Number (PRN) must be exactly 15 digits.'),
  version: z.coerce.number().int().positive().optional(),
});

const ConsoDiffSchema = z.object({
  consoContent: z.string().min(10, 'TRACES conso content is required.'),
});

const KycRevealSchema = z.object({
  accessReason: z.string().trim().min(5, 'State why full deductee PANs are needed (at least 5 characters).'),
});

function parseIfMatchVersion(headerVal: string | string[] | undefined): number | null {
  const raw = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (!raw) return null;
  const cleaned = raw.replace(/^W\//i, '').replace(/"/g, '').trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function tracesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid session required.' });
    }
  });

  // POST /api/v1/tds/:tanId/returns/:returnId/prn-token
  fastify.post('/:tanId/returns/:returnId/prn-token', async (req: FastifyRequest<{ Params: { tanId: string; returnId: string } }>, reply: FastifyReply) => {
    await enforceMakerCheckerGuard(req, reply, 'FILE');
    if (reply.sent) return;

    const { tanId, returnId } = req.params;
    const parsed = PrnTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Invalid 15-digit PRN token.', details: parsed.error.issues });
    }

    const expectedVersion = parseIfMatchVersion(req.headers['if-match']) ?? parsed.data.version ?? null;
    if (expectedVersion === null) {
      return reply.status(428).send({
        error: 'VERSION_REQUIRED',
        message: 'Include the current return version in the If-Match header before recording a PRN.',
      });
    }

    const { tokenNumber } = parsed.data;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveTanRegistration(client, tanId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'TAN registration not found.' });

      const currentRes = await client.query<{ id: string; version: number }>(
        `SELECT id, version FROM public.tds_returns WHERE id = $1 AND tan_registration_id = $2 FOR UPDATE`,
        [returnId, reg.id],
      );
      if (!currentRes.rows[0]) {
        return reply.status(404).send({ error: 'Not Found', message: 'TDS return statement not found.' });
      }
      if (Number(currentRes.rows[0].version) !== expectedVersion) {
        return reply.status(409).send({
          error: 'VERSION_CONFLICT',
          message: 'This return was updated by another user. Refresh and retry.',
          currentVersion: currentRes.rows[0].version,
        });
      }

      const updateRes = await client.query(
        `UPDATE public.tds_returns
         SET latest_accepted_token_15digit = $1,
             workflow_status = 'FILED',
             signed_by_user_id = COALESCE(signed_by_user_id, app.current_user_id()),
             filed_at = now(),
             version = version + 1,
             updated_at = now()
         WHERE id = $2 AND tan_registration_id = $3 AND version = $4
         RETURNING id, form_code, tax_year, quarter, latest_accepted_token_15digit, workflow_status, signed_by_user_id, filed_at, version`,
        [tokenNumber, returnId, reg.id, expectedVersion],
      );

      if (!updateRes.rows[0]) {
        return reply.status(409).send({
          error: 'VERSION_CONFLICT',
          message: 'Concurrent update detected while saving PRN token.',
        });
      }

      return reply.send({
        success: true,
        tokenNumber,
        returnStatement: updateRes.rows[0],
      });
    });
  });

  // GET /api/v1/tds/:tanId/traces/kyc-cheat-sheet/:token
  fastify.get('/:tanId/traces/kyc-cheat-sheet/:token', async (req: FastifyRequest<{ Params: { tanId: string; token: string } }>, reply: FastifyReply) => {
    const { tanId, token } = req.params;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveTanRegistration(client, tanId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'TAN registration not found.' });

      // Look up return with token
      const retRes = await client.query<{
        id: string;
        tax_year: number;
        quarter: string;
      }>(
        `SELECT id, tax_year, quarter
         FROM public.tds_returns
         WHERE tan_registration_id = $1 AND (latest_accepted_token_15digit = $2 OR id::text = $2)`,
        [reg.id, token],
      );

      const ret = retRes.rows[0];
      const taxYear = ret?.tax_year ?? 2026;
      const quarter = ret?.quarter ?? 'Q1';

      // Find highest-value challan
      const challanRes = await client.query<{
        id: string;
        bsr_code: string;
        deposit_date: string;
        challan_no: string;
        total_challan_amount: string;
      }>(
        `SELECT id, bsr_code, deposit_date, challan_no, total_challan_amount
         FROM public.tds_challans
         WHERE tan_registration_id = $1 AND tax_year = $2 AND quarter = $3
         ORDER BY total_challan_amount DESC LIMIT 1`,
        [reg.id, taxYear, quarter],
      );

      const challan = challanRes.rows[0];
      let panCombinations: Array<{ deducteeId: string; pan: string; masked: boolean; amount: string }> = [];

      if (challan) {
        const panRes = await client.query<{ id: string; deductee_pan: string; total_tds_deposited: string }>(
          `SELECT id, deductee_pan, total_tds_deposited
           FROM public.tds_deductees
           WHERE challan_id = $1
           ORDER BY total_tds_deposited DESC LIMIT 3`,
          [challan.id],
        );
        panCombinations = panRes.rows.map((p) => ({
          deducteeId: p.id,
          pan: maskPan(p.deductee_pan),
          masked: true,
          amount: p.total_tds_deposited,
        }));
      }

      return reply.send({
        success: true,
        tan: reg.tan,
        token,
        taxYear,
        quarter,
        cheatSheet: {
          prn: token,
          challan: challan
            ? {
                bsrCode: challan.bsr_code,
                depositDate: challan.deposit_date,
                challanSerial: challan.challan_no,
                challanAmount: challan.total_challan_amount,
              }
            : null,
          panCombinations,
        },
      });
    });
  });

  // POST /api/v1/tds/:tanId/traces/kyc-cheat-sheet/:token/reveal (logged PII reveal, PARTNER/MANAGER only)
  fastify.post('/:tanId/traces/kyc-cheat-sheet/:token/reveal', async (req: FastifyRequest<{ Params: { tanId: string; token: string } }>, reply: FastifyReply) => {
    if (!['PARTNER', 'MANAGER'].includes(req.user.role)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Only a Partner or Manager may reveal unmasked deductee PANs for TRACES login.',
      });
    }

    const parsed = KycRevealSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'REASON_REQUIRED',
        message: 'State why full deductee PANs are needed (at least 5 characters).',
        details: parsed.error.issues,
      });
    }

    const { tanId, token } = req.params;
    const { accessReason } = parsed.data;
    const ctx = getTenantContext(req);

    try {
      const revealed = await db.withTenantTransaction(ctx, async (client) => {
        const reg = await resolveTanRegistration(client, tanId);
        if (!reg) return null;

        const retRes = await client.query<{ id: string; tax_year: number; quarter: string }>(
          `SELECT id, tax_year, quarter
           FROM public.tds_returns
           WHERE tan_registration_id = $1 AND (latest_accepted_token_15digit = $2 OR id::text = $2)`,
          [reg.id, token],
        );
        const ret = retRes.rows[0];
        const taxYear = ret?.tax_year ?? 2026;
        const quarter = ret?.quarter ?? 'Q1';

        const challanRes = await client.query<{ id: string; entity_id: string }>(
          `SELECT id, entity_id
           FROM public.tds_challans
           WHERE tan_registration_id = $1 AND tax_year = $2 AND quarter = $3
           ORDER BY total_challan_amount DESC LIMIT 1`,
          [reg.id, taxYear, quarter],
        );
        const challan = challanRes.rows[0];
        if (!challan) return { panCombinations: [] as Array<{ deducteeId: string; pan: string; masked: boolean; amount: string }> };

        const panRes = await client.query<{ id: string; entity_id: string; deductee_pan: string; total_tds_deposited: string }>(
          `SELECT id, entity_id, deductee_pan, total_tds_deposited
           FROM public.tds_deductees
           WHERE challan_id = $1
           ORDER BY total_tds_deposited DESC LIMIT 3`,
          [challan.id],
        );

        const items: Array<{ deducteeId: string; pan: string; masked: boolean; amount: string }> = [];
        for (const p of panRes.rows) {
          await client.query(
            `SELECT audit.log_pii_access(app.current_firm_id(), $1, 'tds_deductees', 'deductee_pan', $2, $3)`,
            [p.entity_id ?? reg.entity_id, p.id, accessReason],
          );
          items.push({
            deducteeId: p.id,
            pan: p.deductee_pan,
            masked: false,
            amount: p.total_tds_deposited,
          });
        }
        return { panCombinations: items };
      });

      if (!revealed) {
        return reply.status(404).send({ error: 'Not Found', message: 'TAN registration not found.' });
      }
      return reply.send({ success: true, ...revealed, logged: true });
    } catch (err: any) {
      if (/PII_REASON_REQUIRED/.test(err?.message ?? '')) {
        return reply.status(400).send({ error: 'REASON_REQUIRED', message: 'State why the full PAN is needed (at least 5 characters).' });
      }
      req.log.error({ err: err?.code ?? err?.message }, 'TRACES KYC PAN reveal audit write failed');
      return reply.status(503).send({
        error: 'REVEAL_NOT_LOGGED',
        message: 'The reveal could not be recorded in the PII audit log, so full PANs were not returned.',
      });
    }
  });

  // POST /api/v1/tds/:tanId/traces/conso-diff
  fastify.post('/:tanId/traces/conso-diff', async (req: FastifyRequest<{ Params: { tanId: string } }>, reply: FastifyReply) => {
    const { tanId } = req.params;
    const parsed = ConsoDiffSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Invalid TRACES conso payload.', details: parsed.error.issues });
    }

    const { consoContent } = parsed.data;
    const conso = parseConsoFile(consoContent);
    if (!conso.fh?.length && !conso.bh.length && conso.challans.length === 0) {
      return reply.status(422).send({
        error: 'INVALID_CONSO_FILE',
        message: 'Uploaded file does not match the Protean caret-delimited .conso format.',
        issues: conso.issues,
      });
    }

    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveTanRegistration(client, tanId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'TAN registration not found.' });

      const challanDbRes = await client.query<{
        id: string;
        bsr_code: string;
        challan_no: string;
        deposit_date: string;
        total_challan_amount: string;
      }>(
        `SELECT id, bsr_code, challan_no, deposit_date::text, total_challan_amount::text
         FROM public.tds_challans
         WHERE tan_registration_id = $1`,
        [reg.id],
      );

      const dedDbRes = await client.query<{
        deductee_pan: string;
        total_tds_deposited: string;
      }>(
        `SELECT deductee_pan, total_tds_deposited::text
         FROM public.tds_deductees
         WHERE tan_registration_id = $1`,
        [reg.id],
      );

      const localChallans = challanDbRes.rows;
      const localDeductees = dedDbRes.rows;

      const consoTan = conso.tan ?? '';
      const c1Status = consoTan && consoTan !== reg.tan ? 'DISCREPANCY' : 'MATCHED';

      const normKey = (bsr: string, serial: string, date: string) =>
        `${bsr.trim().replace(/\D/g, '').padStart(7, '0')}|${serial.trim().replace(/\D/g, '').padStart(5, '0')}|${date.slice(0, 10)}`;
      const localChallanSet = new Set(localChallans.map((c) => normKey(c.bsr_code, c.challan_no, c.deposit_date)));
      const matchedChallans = conso.challans.filter((c) => localChallanSet.has(normKey(c.bsr, c.challanNo, c.date)));
      const missingInBooksChallans = conso.challans.length - matchedChallans.length;
      const c2Status = conso.challans.length === localChallans.length && missingInBooksChallans === 0 ? 'MATCHED' : 'DISCREPANCY';

      const consoDeductees = conso.challans.flatMap((c) => c.deductees);
      const missingPanCount = consoDeductees.filter((d) => ['PANNOTAVBL', 'PANAPPLIED', 'PANINVALID'].includes(d.pan)).length;
      const correctionsSet = new Set(correctionTypesNeeded(conso, {}));
      if (missingPanCount > 0) correctionsSet.add('C3');
      if (missingInBooksChallans > 0) correctionsSet.add('C9');
      const c3Status = consoDeductees.length === localDeductees.length && missingPanCount === 0 ? 'MATCHED' : 'DISCREPANCY';

      const c9Required = missingInBooksChallans > 0 || missingPanCount > 0;
      const diffs = [
        {
          recordType: 'C1' as const,
          description: 'Deductor Header & TAN Match',
          systemValue: reg.tan,
          consoValue: consoTan || 'Not present in FH/BH header',
          status: c1Status,
        },
        {
          recordType: 'C2' as const,
          description: 'Challan Records (BSR, Serial, Deposit Date)',
          systemValue: `${localChallans.length} challans in books`,
          consoValue: `${conso.challans.length} in .conso (${missingInBooksChallans} unmatched)`,
          status: c2Status,
        },
        {
          recordType: 'C3' as const,
          description: 'Deductee Records & PAN Status',
          systemValue: `${localDeductees.length} deductees in books`,
          consoValue: `${consoDeductees.length} in .conso (${missingPanCount} PAN placeholders)`,
          status: c3Status,
        },
        {
          recordType: 'C9' as const,
          description: 'Challan Addition / Short-Deduction Action',
          systemValue: 'Books baseline',
          consoValue: c9Required ? `Corrections suggested: ${[...correctionsSet].join(', ') || 'Review challans'}` : 'No additions needed',
          status: c9Required ? 'DISCREPANCY' : 'MATCHED',
        },
      ];

      const totalTaxDeposited = conso.challans
        .reduce((sum, c) => sum + Number(c.total || 0), 0)
        .toFixed(2);

      return reply.send({
        success: true,
        tan: reg.tan,
        diffs,
        issues: conso.issues,
        correctionTypesNeeded: [...correctionsSet],
        consoSummary: {
          form: conso.form,
          quarter: conso.quarter,
          taxYear: conso.taxYear,
          totalChallans: conso.challans.length,
          totalDeductees: consoDeductees.length,
          taxDeposited: totalTaxDeposited,
          sampleDeducteePans: consoDeductees.slice(0, 3).map((d) => maskPan(d.pan)),
        },
        batchSigningPayload: {
          supportedForms: ['130', '131', '133'],
          requiresPadesSigning: true,
          padesReady: false,
        },
      });
    });
  });
}
