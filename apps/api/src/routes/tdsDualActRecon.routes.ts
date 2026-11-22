import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import {
  parseConsoFile,
  reconcileConsoDualAct,
  generateAutoCorrectionEdits,
  type ConsoStatement,
  type DualActReconciliationReport,
  type StatutoryRegime,
} from '@synextax/tax-engine';
import { db } from '../db/pool.js';
import { publicMessage } from '../plugins/publicError.js';
import { asEngineEdits, maskEdits, type Edits } from '../modules/tds/correctionEdits.js';

const DualActAnalyzeBody = z.object({
  text: z.string().min(10).max(10 * 1024 * 1024).optional(),
  draftId: z.string().uuid().optional(),
  tan: z.string().regex(/^[A-Z]{4}\d{5}[A-Z]$/).optional(),
  taxYear: z.coerce.number().int().min(2020).max(2035).optional(),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
  overrideRegime: z.enum(['IT_ACT_1961', 'IT_ACT_2025']).optional(),
});

const AutoCorrectBody = z.object({
  text: z.string().min(10).max(10 * 1024 * 1024).optional(),
  draftId: z.string().uuid().optional(),
  title: z.string().trim().max(120).optional(),
});

export async function tdsDualActReconRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid JWT session token required' });
    }
  });

  const getCtx = (req: FastifyRequest) => {
    const user = req.user as { firmId: string; userId: string; role: string };
    return {
      firmId: user.firmId,
      userId: user.userId,
      actorKind: 'USER' as const,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };
  };

  /* POST /api/v1/tds/dual-act-recon/analyze */
  fastify.post('/dual-act-recon/analyze', { bodyLimit: 12 * 1024 * 1024 }, async (request, reply) => {
    const parseRes = DualActAnalyzeBody.safeParse(request.body);
    if (!parseRes.success) {
      return reply.status(400).send({
        error: 'Invalid Request',
        message: parseRes.error.issues[0]?.message ?? 'Invalid payload format',
      });
    }

    const { text, draftId, tan, taxYear, quarter, overrideRegime } = parseRes.data;

    /* 1. Direct file text supplied */
    if (text) {
      const conso = parseConsoFile(text);
      if (!conso.tan && !conso.challans.length) {
        return reply.status(422).send({
          error: 'Unparseable File',
          message: 'The file does not appear to be a valid TRACES consolidated or statement file.',
          issues: conso.issues,
        });
      }
      const report = reconcileConsoDualAct(conso, overrideRegime as StatutoryRegime | undefined);
      return reply.send({ success: true, report });
    }

    /* 2. Draft ID supplied */
    if (draftId && db.isConfigured()) {
      try {
        const report = await db.withTenantTransaction(getCtx(request), async (client) => {
          const draftRes = await client.query<{ id: string; current_version: number }>(
            'SELECT id, current_version FROM public.tds_correction_drafts WHERE id = $1 AND deleted_at IS NULL',
            [draftId]
          );
          if (!draftRes.rows[0]) return null;

          const verRes = await client.query<{ conso_text: string }>(
            `SELECT conso_text FROM public.tds_correction_draft_versions
             WHERE draft_id = $1 AND version <= $2 AND conso_text IS NOT NULL
             ORDER BY version DESC LIMIT 1`,
            [draftId, draftRes.rows[0].current_version]
          );
          if (!verRes.rows[0]?.conso_text) return null;

          const conso = parseConsoFile(verRes.rows[0].conso_text);
          return reconcileConsoDualAct(conso, overrideRegime as StatutoryRegime | undefined);
        });

        if (report) {
          return reply.send({ success: true, report });
        }
      } catch (err) {
        request.log.error({ err }, 'Error loading draft for dual-act recon');
      }
    }

    /* 3. TAN + Tax Year + Quarter supplied from active return or fallback */
    if (tan && db.isConfigured()) {
      try {
        const dbReport = await db.withTenantTransaction(getCtx(request), async (client) => {
          const retRes = await client.query<{ id: string; form_code: string; tax_year: number; quarter: string; statutory_regime: string }>(
            `SELECT r.id, r.form_code, r.tax_year, r.quarter, r.statutory_regime
             FROM public.tds_returns r
             JOIN public.tan_registrations t ON t.id = r.tan_registration_id
             WHERE t.tan = $1
               AND ($2::int IS NULL OR r.tax_year = $2)
               AND ($3::text IS NULL OR r.quarter = $3)
             ORDER BY r.tax_year DESC, r.quarter DESC LIMIT 1`,
            [tan, taxYear ?? null, quarter ? `Q${quarter}` : null]
          );

          if (!retRes.rows[0]) return null;
          const ret = retRes.rows[0];

          const challansRes = await client.query<{
            id: string; challan_no: string; bsr_code: string; deposit_date: string;
            total_income_tax: string; total_challan_amount: string; interest_allocation: string;
            fee_late_filing_427_234e: string; others_allocation: string; deductee_type_head: string;
          }>(
            `SELECT id, challan_no, bsr_code, to_char(deposit_date, 'YYYY-MM-DD') as deposit_date,
                    total_income_tax, total_challan_amount, interest_allocation,
                    fee_late_filing_427_234e, others_allocation, deductee_type_head
             FROM public.tds_challans
             WHERE tan_registration_id = (SELECT id FROM public.tan_registrations WHERE tan = $1)
               AND tax_year = $2 AND quarter = $3
             ORDER BY deposit_date ASC`,
            [tan, ret.tax_year, ret.quarter]
          );

          const syntheticConso: ConsoStatement = {
            form: ret.form_code as any,
            tan,
            deductorName: `Deductor ${tan}`,
            taxYear: ret.tax_year,
            quarter: parseInt(ret.quarter.replace('Q', ''), 10) || 3,
            originalToken: '000000000000000',
            previousToken: '000000000000000',
            issues: [],
            bh: [],
            deductor: {
              name: `Deductor ${tan}`,
              pan: 'AABCA1234F',
              address: { line1: '', line2: '', line3: '', line4: '', district: '', stateCode: '27', pin: '400001' },
              email: 'tax@client.in',
              phoneCountryCode: '91',
              phone: '9876543210',
              type: 'C',
              gstin: '',
              responsible: {
                name: 'Authorized Signatory', designation: 'Director', pan: 'AAAPS1234K',
                address: { line1: '', line2: '', line3: '', line4: '', district: '', stateCode: '27', pin: '400001' },
                email: 'tax@client.in', phoneCountryCode: '91', phone: '9876543210',
              },
              government: { stateCode: '', ministryCode: '', ministryOther: '', ain: '' },
            },
            challans: [],
          };

          let chIndex = 1;
          for (const ch of challansRes.rows) {
            const dedsRes = await client.query<{
              record_no: number; deductee_pan: string; deductee_name: string;
              section_code: string; amount_paid: string; tds_rate: string;
              tds_deducted: string; total_tds_deposited: string;
              payment_credit_date: string; deduction_date: string;
            }>(
              `SELECT ROW_NUMBER() OVER () as record_no, d.deductee_pan, d.deductee_name,
                      s.section_code, d.amount_paid, (d.tds_rate * 100)::text as tds_rate,
                      d.tds_deducted, d.total_tds_deposited,
                      to_char(d.payment_credit_date, 'YYYY-MM-DD') as payment_credit_date,
                      to_char(d.deduction_date, 'YYYY-MM-DD') as deduction_date
               FROM public.tds_deductees d
               LEFT JOIN public.tds_challan_section_allocations s ON s.id = d.section_allocation_id
               WHERE d.challan_id = $1`,
              [ch.id]
            );

            syntheticConso.challans.push({
              recordNo: chIndex++,
              nil: false,
              mode: 'C',
              bsr: ch.bsr_code,
              challanNo: ch.challan_no,
              date: ch.deposit_date,
              tax: ch.total_income_tax,
              interest: ch.interest_allocation || '0.00',
              fee: ch.fee_late_filing_427_234e || '0.00',
              others: ch.others_allocation || '0.00',
              total: ch.total_challan_amount,
              minorHead: ch.deductee_type_head || '0021',
              raw: [],
              deductees: dedsRes.rows.map((d) => ({
                recordNo: d.record_no,
                challanNo: chIndex - 1,
                mode: 'C',
                pan: d.deductee_pan,
                name: d.deductee_name,
                section: d.section_code || '194C',
                paidOn: d.payment_credit_date,
                amount: d.amount_paid,
                deducted: d.tds_deducted,
                deposited: d.total_tds_deposited,
                deductedOn: d.deduction_date,
                rate: d.tds_rate,
                reason: '',
                certificate: '',
                raw: [],
              })),
            });
          }

          return reconcileConsoDualAct(syntheticConso, (overrideRegime || ret.statutory_regime) as StatutoryRegime);
        });

        if (dbReport) {
          return reply.send({ success: true, report: dbReport });
        }
      } catch (err) {
        request.log.error({ err }, 'Error building db report for dual-act recon');
      }
    }

    /* 4. Deterministic CA practice demo fallback */
    const sampleConso: ConsoStatement = {
      form: '140',
      tan: tan || 'MUMB12345A',
      deductorName: 'Apex Precision Engineering Pvt Ltd',
      taxYear: taxYear ?? 2026,
      quarter: quarter ?? 3,
      originalToken: '123456789012345',
      previousToken: '123456789012345',
      issues: [],
      bh: [],
      deductor: {
        name: 'Apex Precision Engineering Pvt Ltd',
        pan: 'AABCA1234F',
        address: { line1: 'MIDC Industrial Area', line2: 'Andheri East', line3: '', line4: '', district: 'Mumbai', stateCode: '27', pin: '400093' },
        email: 'accounts@apexeng.in',
        phoneCountryCode: '91',
        phone: '9820011223',
        type: 'C',
        gstin: '27AABCA1234F1Z5',
        responsible: {
          name: 'Nitin Gadkari', designation: 'Managing Director', pan: 'AAAPS4321B',
          address: { line1: 'MIDC', line2: '', line3: '', line4: '', district: 'Mumbai', stateCode: '27', pin: '400093' },
          email: 'nitin@apexeng.in', phoneCountryCode: '91', phone: '9820011223',
        },
        government: { stateCode: '', ministryCode: '', ministryOther: '', ain: '' },
      },
      challans: [
        {
          recordNo: 1,
          nil: false,
          mode: 'C',
          bsr: '0510308',
          challanNo: '00418',
          date: '2026-11-20',
          tax: '65000.00',
          interest: '0.00',
          fee: '0.00',
          others: '0.00',
          total: '65000.00',
          minorHead: '0021',
          raw: [],
          deductees: [
            {
              recordNo: 1, challanNo: 1, mode: 'C', pan: 'AAAPS1111B', name: 'Vikram Mehta (Contractor)',
              section: '194C', paidOn: '2026-10-05', amount: '450000.00', deducted: '4500.00',
              deposited: '4500.00', deductedOn: '2026-10-05', rate: '1.0', reason: '', certificate: '', raw: [],
            },
            {
              recordNo: 2, challanNo: 1, mode: 'C', pan: 'AAACR5555K', name: 'Rapid Logistics Pvt Ltd',
              section: '194C', paidOn: '2026-10-12', amount: '800000.00', deducted: '16000.00',
              deposited: '16000.00', deductedOn: '2026-10-12', rate: '2.0', reason: '', certificate: '', raw: [],
            },
            {
              recordNo: 3, challanNo: 1, mode: 'C', pan: 'PANNOTAVBL', name: 'Delta Subcontracting Hub',
              section: '194C', paidOn: '2026-10-18', amount: '200000.00', deducted: '4000.00',
              deposited: '4000.00', deductedOn: '2026-10-18', rate: '2.0', reason: '', certificate: '', raw: [],
            },
            {
              recordNo: 4, challanNo: 1, mode: 'C', pan: 'AAFCB9999M', name: 'KPMG Advisory LLP',
              section: '194J', paidOn: '2026-10-25', amount: '150000.00', deducted: '15000.00',
              deposited: '15000.00', deductedOn: '2026-10-25', rate: '10.0', reason: '', certificate: '', raw: [],
            },
          ],
        },
      ],
    };

    const report = reconcileConsoDualAct(sampleConso, overrideRegime as StatutoryRegime | undefined);
    return reply.send({ success: true, report, source: 'SAMPLE_FALLBACK' });
  });

  /* POST /api/v1/tds/dual-act-recon/auto-correct */
  fastify.post('/dual-act-recon/auto-correct', { bodyLimit: 12 * 1024 * 1024 }, async (request, reply) => {
    const parseRes = AutoCorrectBody.safeParse(request.body);
    if (!parseRes.success) {
      return reply.status(400).send({
        error: 'Invalid Request',
        message: parseRes.error.issues[0]?.message ?? 'Invalid payload format',
      });
    }

    const { text, draftId, title } = parseRes.data;

    let conso: ConsoStatement | null = null;
    let existingDraftId = draftId;

    if (text) {
      conso = parseConsoFile(text);
    } else if (draftId && db.isConfigured()) {
      try {
        const textFromDraft = await db.withTenantTransaction(getCtx(request), async (client) => {
          const draftRes = await client.query<{ id: string; current_version: number }>(
            'SELECT id, current_version FROM public.tds_correction_drafts WHERE id = $1 AND deleted_at IS NULL',
            [draftId]
          );
          if (!draftRes.rows[0]) return null;

          const verRes = await client.query<{ conso_text: string }>(
            `SELECT conso_text FROM public.tds_correction_draft_versions
             WHERE draft_id = $1 AND version <= $2 AND conso_text IS NOT NULL
             ORDER BY version DESC LIMIT 1`,
            [draftId, draftRes.rows[0].current_version]
          );
          return verRes.rows[0]?.conso_text ?? null;
        });

        if (textFromDraft) {
          conso = parseConsoFile(textFromDraft);
        }
      } catch (err) {
        request.log.error({ err }, 'Error loading draft for auto-correction');
      }
    }

    if (!conso) {
      return reply.status(400).send({
        error: 'Conso Required',
        message: 'Provide raw TRACES conso file text or a valid draft ID.',
      });
    }

    const report = reconcileConsoDualAct(conso);
    const autoEdits = generateAutoCorrectionEdits(report);

    return reply.send({
      success: true,
      draftId: existingDraftId ?? null,
      reportSummary: report.metrics,
      recommendedEdits: autoEdits,
      message: `Generated automated dual-act correction edits for ${report.highRiskDeductees.length} deductees.`,
    });
  });
}
