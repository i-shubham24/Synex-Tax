import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../db/pool.js';
import { getTenantContext, resolveTanRegistration } from './tdsHelper.js';
import { buildStatement } from './statementBuilder.js';

export async function fvuRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid session required.' });
    }
  });

  // POST /api/v1/tds/:tanId/returns/:returnId/compile-txt
  fastify.post('/:tanId/returns/:returnId/compile-txt', async (req: FastifyRequest<{ Params: { tanId: string; returnId: string } }>, reply: FastifyReply) => {
    const { tanId, returnId } = req.params;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveTanRegistration(client, tanId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'TAN registration not found.' });

      const retRes = await client.query<{
        id: string;
        form_code: string;
        statutory_regime: string;
        tax_year: number;
        quarter: string;
        workflow_status: string;
      }>(
        `SELECT id, form_code, statutory_regime, tax_year, quarter, workflow_status
         FROM public.tds_returns
         WHERE id = $1 AND tan_registration_id = $2`,
        [returnId, reg.id],
      );

      const ret = retRes.rows[0];
      if (!ret) return reply.status(404).send({ error: 'Not Found', message: 'TDS return statement not found.' });

      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      // Attempt 2025 Act statement generation first
      if (ret.statutory_regime === 'IT_ACT_2025') {
        const stmt = await buildStatement(client, returnId, today);
        if (stmt && stmt.text) {
          const lines = stmt.text.split('\n').filter((l) => l.trim().length > 0);
          return reply.send({
            success: true,
            fileName: stmt.fileName,
            regime: ret.statutory_regime,
            formCode: ret.form_code,
            lineCount: lines.length,
            txtContent: stmt.text,
          });
        }
      }

      // 1961 Act Caret Text Compiler fallback
      const challansRes = await client.query<{
        id: string;
        bsr_code: string;
        deposit_date: string;
        challan_no: string;
        total_income_tax: string;
      }>(
        `SELECT id, bsr_code, deposit_date, challan_no, total_income_tax
         FROM public.tds_challans
         WHERE tan_registration_id = $1 AND tax_year = $2 AND quarter = $3`,
        [reg.id, ret.tax_year, ret.quarter],
      );

      const deducteesRes = await client.query<{
        deductee_pan: string;
        deductee_name: string;
        amount_paid: string;
        tds_deducted: string;
        payment_credit_date: string;
      }>(
        `SELECT d.deductee_pan, d.deductee_name, d.amount_paid, d.tds_deducted, d.payment_credit_date
         FROM public.tds_deductees d
         WHERE d.tan_registration_id = $1`,
        [reg.id],
      );

      const headerLine = `1^FH^NSDL-TDS-Statement^${today}^1^${reg.tan}^${ret.form_code}^^^^^^^^`;
      const batchLine = `2^BH^1^${challansRes.rows.length}^${ret.form_code}^^^^^^^${reg.tan}^^^^^^^^`;
      const challanLines = challansRes.rows.map(
        (c, idx) => `3^CD^1^${idx + 1}^1^${c.bsr_code}^${c.deposit_date.replace(/-/g, '')}^${c.challan_no}^${c.total_income_tax}^0.00^0.00^0.00^${c.total_income_tax}^^^^^^^`,
      );
      const deducteeLines = deducteesRes.rows.map(
        (d, idx) => `4^DD^1^1^${idx + 1}^${d.deductee_pan}^${d.deductee_name}^${d.amount_paid}^${d.tds_deducted}^0.00^0.00^${d.tds_deducted}^${d.payment_credit_date.replace(/-/g, '')}^^^^^^^`,
      );

      const fullTxt = [headerLine, batchLine, ...challanLines, ...deducteeLines].join('\n');
      const fileName = `${reg.tan}_${ret.form_code}_${ret.quarter}_${ret.tax_year}.txt`;

      return reply.send({
        success: true,
        fileName,
        regime: ret.statutory_regime,
        formCode: ret.form_code,
        lineCount: [headerLine, batchLine, ...challanLines, ...deducteeLines].length,
        txtContent: fullTxt,
      });
    });
  });

  // POST /api/v1/tds/:tanId/returns/:returnId/validate-fvu
  fastify.post('/:tanId/returns/:returnId/validate-fvu', async (req: FastifyRequest<{ Params: { tanId: string; returnId: string } }>, reply: FastifyReply) => {
    const { tanId, returnId } = req.params;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveTanRegistration(client, tanId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'TAN registration not found.' });

      const retRes = await client.query<{
        id: string;
        statutory_regime: string;
        form_code: string;
      }>(
        `SELECT id, statutory_regime, form_code
         FROM public.tds_returns
         WHERE id = $1 AND tan_registration_id = $2`,
        [returnId, reg.id],
      );

      const ret = retRes.rows[0];
      if (!ret) return reply.status(404).send({ error: 'Not Found', message: 'Return not found.' });

      const fvuVersion = ret.statutory_regime === 'IT_ACT_1961' ? '9.5' : '1.2';
      const dockerImage = fvuVersion === '9.5' ? 'synextax/fvu-runner:v9.5' : 'synextax/fvu-runner:v1.2';

      // Check deductees for validation errors (e.g. invalid PAN or unallocated section)
      const deducteesRes = await client.query<{
        id: string;
        deductee_pan: string;
        pan_status: string;
        deductee_name: string;
      }>(
        `SELECT id, deductee_pan, pan_status, deductee_name
         FROM public.tds_deductees
         WHERE tan_registration_id = $1`,
        [reg.id],
      );

      const invalidDeductees = deducteesRes.rows.filter(
        (d) => d.pan_status === 'INVALID' || (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(d.deductee_pan) && !['PANNOTAVBL', 'PANAPPLIED', 'PANINVALID'].includes(d.deductee_pan)),
      );

      // This is SynTax's own pre-check, not Protean's FVU. A clean pre-check queues the job for the
      // FVU worker (workers/fvu-v1-2, workers/fvu-v9-5); only that worker may mark it SUCCESS and
      // name a .fvu file. Until the official JARs are mounted, run FVU on the desktop agent.
      let status = 'QUEUED';
      const clickableErrors: Array<{ line: number; recordId: string; errorCode: string; message: string }> = [];

      if (invalidDeductees.length > 0) {
        status = 'VALIDATION_FAILED';
        invalidDeductees.forEach((inv, idx) => {
          clickableErrors.push({
            line: 12 + idx,
            recordId: inv.id,
            errorCode: 'PRECHECK_PAN', // SynTax's own code, not a Protean FVU error code
            message: `Invalid PAN structure or checksum for deductee ${inv.deductee_name} (${inv.deductee_pan}).`,
          });
        });
      }

      // Record FVU job in public.tds_fvu_jobs
      const fvuJobSql = `
        INSERT INTO public.tds_fvu_jobs (
          firm_id, entity_id, return_id, fvu_version, docker_image,
          input_file_s3, output_fvu_s3, error_file_s3, status, error_summary,
          started_at, completed_at
        ) VALUES (
          app.current_firm_id(), $1, $2, $3, $4,
          $5, $6, $7, $8, $9,
          now(), now()
        ) RETURNING id, status, fvu_version, created_at;
      `;

      const inputS3 = `s3://synextax-fvu/${reg.tan}/${returnId}/input.txt`;
      const outputFvuS3 = null;
      const errorFileS3 = null;

      const jobRes = await client.query(fvuJobSql, [
        reg.entity_id, returnId, fvuVersion, dockerImage,
        inputS3, outputFvuS3, errorFileS3, status, JSON.stringify({ errors: clickableErrors }),
      ]);

      return reply.send({
        success: true,
        jobId: jobRes.rows[0].id,
        fvuVersion,
        status,
        fvuExecuted: false,
        precheck: clickableErrors.length === 0 ? 'PASSED' : 'FAILED',
        errorCount: clickableErrors.length,
        clickableErrors,
        errors: clickableErrors,
      });
    });
  });

  // GET /api/v1/tds/:tanId/fvu/jobs/:jobId/errors
  fastify.get('/:tanId/fvu/jobs/:jobId/errors', async (req: FastifyRequest<{ Params: { tanId: string; jobId: string } }>, reply: FastifyReply) => {
    const { tanId, jobId } = req.params;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveTanRegistration(client, tanId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'TAN registration not found.' });

      const jobRes = await client.query<{
        id: string;
        fvu_version: string;
        status: string;
        error_summary: { errors: any[] };
      }>(
        `SELECT id, fvu_version, status, error_summary
         FROM public.tds_fvu_jobs
         WHERE id = $1`,
        [jobId],
      );

      const job = jobRes.rows[0];
      if (!job) return reply.status(404).send({ error: 'Not Found', message: 'FVU job not found.' });

      return reply.send({
        success: true,
        jobId: job.id,
        status: job.status,
        errors: job.error_summary?.errors ?? [],
      });
    });
  });
}
