import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { resolveStatementSchemaVersion } from '@synextax/tax-engine';
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
      const quarterNum = Number(ret.quarter.replace('Q', ''));
      const schemaMeta = resolveStatementSchemaVersion({
        regime: ret.statutory_regime === 'IT_ACT_1961' ? 'IT_ACT_1961' : 'IT_ACT_2025',
        form: ret.form_code,
        quarter: quarterNum,
        allowForm138Q4V10: process.env.FORM_138_Q4_V10_ENABLED === 'true',
      });

      // 2025 Act statement generation via Protean FVU 1.2 compiler (Interest Allocation & Others Allocation; no legacy Surcharge/Cess/Penalty)
      if (ret.statutory_regime === 'IT_ACT_2025') {
        const stmt = await buildStatement(client, returnId, today.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
        if (!stmt || stmt.issues.length > 0 || !stmt.text) {
          return reply.status(422).send({
            error: 'STATEMENT_VALIDATION_FAILED',
            fvuVersion: schemaMeta.fvuVersion,
            schemaVersion: schemaMeta.schemaVersion,
            issues: stmt?.issues ?? [{ where: 'Statement', message: 'Unable to compile statement text.' }],
          });
        }
        const lines = stmt.text.split('\n').filter((l) => l.trim().length > 0);
        return reply.send({
          success: true,
          fileName: stmt.fileName,
          regime: ret.statutory_regime,
          formCode: ret.form_code,
          fvuVersion: schemaMeta.fvuVersion,
          schemaVersion: schemaMeta.schemaVersion,
          lineCount: lines.length,
          txtContent: stmt.text,
        });
      }

      // 1961 Act Caret Text Compiler (<= FY 2025-26, FVU 9.5: FH=18, BH=72, CD=41, DD=54)
      const challansRes = await client.query<{
        id: string;
        bsr_code: string;
        deposit_date: string;
        challan_no: string;
        total_income_tax: string;
        interest_allocation: string;
        others_allocation: string;
        fee_late_filing_427_234e: string;
        minor_head: string | null;
      }>(
        `SELECT id, bsr_code, deposit_date::text AS deposit_date, challan_no,
                total_income_tax::text, COALESCE(interest_allocation, 0)::text AS interest_allocation,
                COALESCE(others_allocation, 0)::text AS others_allocation,
                COALESCE(fee_late_filing_427_234e, 0)::text AS fee_late_filing_427_234e,
                minor_head
         FROM public.tds_challans
         WHERE tan_registration_id = $1 AND tax_year = $2 AND quarter = $3
         ORDER BY deposit_date, challan_no`,
        [reg.id, ret.tax_year, ret.quarter],
      );

      const challanIds = challansRes.rows.map((c) => c.id);
      const deducteesRes = await client.query<{
        challan_id: string;
        deductee_pan: string;
        deductee_name: string;
        section_code: string | null;
        amount_paid: string;
        tds_deducted: string;
        total_tds_deposited: string;
        payment_credit_date: string;
        deduction_date: string | null;
        tds_rate: string | null;
      }>(
        `SELECT d.challan_id, d.deductee_pan, d.deductee_name, a.section_code,
                d.amount_paid::text, d.tds_deducted::text, COALESCE(d.total_tds_deposited, d.tds_deducted)::text AS total_tds_deposited,
                d.payment_credit_date::text AS payment_credit_date,
                d.deduction_date::text AS deduction_date, d.tds_rate::text
         FROM public.tds_deductees d
         LEFT JOIN public.tds_challan_section_allocations a ON a.id = d.section_allocation_id
         WHERE d.tan_registration_id = $1
           AND ($2::uuid[] = '{}' OR d.challan_id = ANY($2::uuid[]))
         ORDER BY d.payment_credit_date, d.deductee_name`,
        [reg.id, challanIds],
      );

      const qBounds: Record<number, [string, string]> = {
        1: [`${ret.tax_year}-04-01`, `${ret.tax_year}-06-30`],
        2: [`${ret.tax_year}-07-01`, `${ret.tax_year}-09-30`],
        3: [`${ret.tax_year}-10-01`, `${ret.tax_year}-12-31`],
        4: [`${ret.tax_year + 1}-01-01`, `${ret.tax_year + 1}-03-31`],
      };
      const [qStart, qEnd] = qBounds[quarterNum] ?? qBounds[1];
      const outOfBounds = deducteesRes.rows.filter((d) => d.payment_credit_date < qStart || d.payment_credit_date > qEnd);
      if (outOfBounds.length > 0) {
        return reply.status(422).send({
          error: 'OUT_OF_QUARTER_PAYMENT_DATE',
          message: `Date of Payment in DD row (${outOfBounds[0].payment_credit_date}) falls outside ${ret.quarter} (${qStart} to ${qEnd}).`,
        });
      }

      const toDdmmyyyy = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
      const todayIso = new Date().toISOString().slice(0, 10);
      const fileType = ret.form_code === '24Q' ? 'SL1' : ret.form_code === '27EQ' ? 'TC1' : 'NS1';

      let lineNo = 1;
      const fh = Array<string>(18).fill('');
      fh[0] = String(lineNo++); fh[1] = 'FH'; fh[2] = fileType; fh[3] = 'R'; fh[4] = toDdmmyyyy(todayIso);
      fh[5] = '1'; fh[6] = 'D'; fh[7] = reg.tan; fh[8] = '1'; fh[9] = 'SynexTax';

      const bh = Array<string>(72).fill('');
      bh[0] = String(lineNo++); bh[1] = 'BH'; bh[2] = '1'; bh[3] = String(challansRes.rows.length); bh[4] = ret.form_code;
      bh[12] = reg.tan;
      bh[15] = `${ret.tax_year + 1}${String((ret.tax_year + 2) % 100).padStart(2, '0')}`;
      bh[16] = `${ret.tax_year}${String((ret.tax_year + 1) % 100).padStart(2, '0')}`;
      bh[17] = ret.quarter;

      const records: string[][] = [fh, bh];
      challansRes.rows.forEach((c, ci) => {
        const chRows = deducteesRes.rows.filter((d) => d.challan_id === c.id);
        const cd = Array<string>(41).fill('');
        const totalDeposit = (
          Number(c.total_income_tax) + Number(c.interest_allocation) + Number(c.others_allocation) + Number(c.fee_late_filing_427_234e)
        ).toFixed(2);
        cd[0] = String(lineNo++); cd[1] = 'CD'; cd[2] = '1'; cd[3] = String(ci + 1); cd[4] = String(chRows.length);
        cd[5] = 'N'; cd[11] = c.challan_no; cd[15] = c.bsr_code; cd[17] = toDdmmyyyy(c.deposit_date);
        cd[21] = Number(c.total_income_tax).toFixed(2); cd[22] = '0.00'; cd[23] = '0.00';
        cd[24] = Number(c.interest_allocation).toFixed(2); cd[25] = Number(c.others_allocation).toFixed(2);
        cd[26] = totalDeposit; cd[36] = 'N'; cd[38] = Number(c.fee_late_filing_427_234e).toFixed(2);
        cd[39] = c.minor_head ?? '200';
        records.push(cd);

        chRows.forEach((d, di) => {
          const dd = Array<string>(54).fill('');
          dd[0] = String(lineNo++); dd[1] = 'DD'; dd[2] = '1'; dd[3] = String(ci + 1); dd[4] = String(di + 1);
          dd[5] = 'O'; dd[9] = d.deductee_pan; dd[12] = d.deductee_name;
          dd[16] = Number(d.tds_deducted).toFixed(2); dd[17] = '0.00';
          dd[18] = Number(d.total_tds_deposited).toFixed(2);
          dd[21] = Number(d.amount_paid).toFixed(2);
          dd[22] = toDdmmyyyy(d.payment_credit_date);
          dd[23] = toDdmmyyyy(d.deduction_date || d.payment_credit_date);
          dd[25] = (Number(d.tds_rate ?? 0) * 100).toFixed(4);
          dd[32] = d.section_code ?? '';
          records.push(dd);
        });
      });

      const fullTxt = records.map((r) => r.join('^')).join('\r\n') + '\r\n';
      const fileName = `${reg.tan}_${ret.form_code}_${ret.quarter}_${ret.tax_year}.txt`;

      return reply.send({
        success: true,
        fileName,
        regime: ret.statutory_regime,
        formCode: ret.form_code,
        fvuVersion: schemaMeta.fvuVersion,
        schemaVersion: schemaMeta.schemaVersion,
        lineCount: records.length,
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
        quarter: string;
      }>(
        `SELECT id, statutory_regime, form_code, quarter
         FROM public.tds_returns
         WHERE id = $1 AND tan_registration_id = $2`,
        [returnId, reg.id],
      );

      const ret = retRes.rows[0];
      if (!ret) return reply.status(404).send({ error: 'Not Found', message: 'Return not found.' });

      const schemaMeta = resolveStatementSchemaVersion({
        regime: ret.statutory_regime === 'IT_ACT_1961' ? 'IT_ACT_1961' : 'IT_ACT_2025',
        form: ret.form_code,
        quarter: Number(ret.quarter.replace('Q', '')),
        allowForm138Q4V10: process.env.FORM_138_Q4_V10_ENABLED === 'true',
      });
      const fvuVersion = schemaMeta.fvuVersion;
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
        schemaVersion: schemaMeta.schemaVersion,
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
