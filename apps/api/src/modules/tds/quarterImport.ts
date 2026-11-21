import type pg from 'pg';
import { Decimal } from 'decimal.js';
import { tdsCorrectionDeadline, tdsStatementDueDate, type QuarterChallan, type StatementForm } from '@synextax/tax-engine';
import { ImportError } from './statementImport.js';

/**
 * Saves a quarter sheet (already checked by parseQuarterSheet) as challans, section allocations and
 * deductee rows, and opens or updates the draft return for the form and quarter. All or nothing:
 * runs inside the caller's RLS transaction.
 */
export async function commitQuarter(
  client: pg.PoolClient,
  input: { tan: string; form: StatementForm; taxYear: number; quarter: 1 | 2 | 3 | 4; challans: QuarterChallan[] },
  userId: string,
): Promise<{ returnId: string; challans: number; rows: number }> {
  const tan = (await client.query<{ id: string; entity_id: string }>('SELECT id, entity_id FROM public.tan_registrations WHERE tan = $1', [input.tan])).rows[0];
  if (!tan) throw new ImportError(422, `TAN ${input.tan} is not in Client Master.`);
  const quarter = `Q${input.quarter}`;
  const existing = (
    await client.query<{ id: string; workflow_status: string }>(
      `SELECT id, workflow_status FROM public.tds_returns WHERE tan_registration_id = $1 AND statutory_regime = 'IT_ACT_2025' AND tax_year = $2
         AND quarter = $3 AND form_code = $4 AND return_type = 'ORIGINAL' AND correction_no = 0`,
      [tan.id, input.taxYear, quarter, input.form],
    )
  ).rows[0];
  if (existing && existing.workflow_status !== 'DRAFT') throw new ImportError(409, `Form ${input.form} ${quarter} is already ${existing.workflow_status.toLowerCase()}; changes after filing go in a correction statement.`);

  let rows = 0;
  for (const c of input.challans) {
    const allRows = c.rows;
    const head = allRows.every((r) => r.pan[3] === 'C') ? '0020' : '0021';
    const total = new Decimal(c.tax).add(c.interest).add(c.fee);
    const challanId = (
      await client.query<{ id: string }>(
        `INSERT INTO public.tds_challans (firm_id, entity_id, tan_registration_id, challan_no, bsr_code, deposit_date, statutory_regime, tax_year, quarter,
           deductee_type_head, total_income_tax, interest_allocation, fee_late_filing_427_234e, total_challan_amount, created_by)
         VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, 'IT_ACT_2025', $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [tan.entity_id, tan.id, c.challanNo, c.bsr, c.depositedOn, input.taxYear, quarter, head, c.tax, c.interest, c.fee, total.toFixed(2), userId],
      )
    ).rows[0].id;
    const bySection = new Map<string, typeof allRows>();
    for (const r of allRows) bySection.set(r.section, [...(bySection.get(r.section) ?? []), r]);
    for (const [code, list] of bySection) {
      const amount = list.reduce((s, r) => s.add(r.deposited), new Decimal(0)).toFixed(2);
      const allocId = (
        await client.query<{ id: string }>(
          `INSERT INTO public.tds_challan_section_allocations (firm_id, entity_id, challan_id, section_code, income_tax, total_section_amount)
           VALUES (app.current_firm_id(), $1, $2, $3, $4, $4) RETURNING id`,
          [tan.entity_id, challanId, code, amount],
        )
      ).rows[0].id;
      for (const r of list) {
        const literal = ['PANNOTAVBL', 'PANAPPLIED', 'PANINVALID'].includes(r.pan);
        await client.query(
          `INSERT INTO public.tds_deductees (firm_id, entity_id, tan_registration_id, challan_id, section_allocation_id, deductee_pan, deductee_name, pan_status,
             payment_credit_date, amount_paid, tds_rate, tds_deducted, total_tds_deposited, deduction_date, certificate_no, reason_for_non_deduction, created_by, form_code)
           VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            tan.entity_id, tan.id, challanId, allocId, r.pan, r.name.slice(0, 75), literal ? 'UNAVAILABLE' : 'OPERATIVE', r.paidOn, r.amountPaid,
            new Decimal(r.ratePercent || 0).div(100).toFixed(4), r.tax, r.deposited, r.deductedOn ?? r.paidOn, r.certificate || null,
            /^[A-Z0-9]{1,8}$/.test(r.reason) ? r.reason : null, userId, input.form,
          ],
        );
        rows += 1;
      }
    }
  }

  // Open the draft return, or bring its totals up to date from every row now in the quarter.
  const totals = (
    await client.query<{ n: number; paid: string; ded: string; dep: string }>(
      `SELECT count(*)::int AS n, COALESCE(sum(d.amount_paid), 0)::text AS paid, COALESCE(sum(d.tds_deducted), 0)::text AS ded, COALESCE(sum(d.total_tds_deposited), 0)::text AS dep
       FROM public.tds_deductees d JOIN public.tds_challans c ON c.id = d.challan_id
       WHERE c.tan_registration_id = $1 AND c.tax_year = $2 AND c.quarter = $3 AND c.statutory_regime = 'IT_ACT_2025' AND d.form_code = $4`,
      [tan.id, input.taxYear, quarter, input.form],
    )
  ).rows[0];
  let returnId = existing?.id;
  if (returnId) {
    await client.query(
      `UPDATE public.tds_returns SET total_deductees = $2, total_amount_paid = $3, total_tax_deducted = $4, total_tax_deposited = $5 WHERE id = $1`,
      [returnId, totals.n, totals.paid, totals.ded, totals.dep],
    );
  } else {
    const due = tdsStatementDueDate(input.form, input.taxYear, input.quarter);
    returnId = (
      await client.query<{ id: string }>(
        `INSERT INTO public.tds_returns (firm_id, entity_id, tan_registration_id, statutory_regime, tax_year, quarter, form_code, workflow_status,
           statutory_due_date, correction_window_expires_at, total_deductees, total_amount_paid, total_tax_deducted, total_tax_deposited)
         VALUES (app.current_firm_id(), $1, $2, 'IT_ACT_2025', $3, $4, $5, 'DRAFT', $6, $7, $8, $9, $10, $11) RETURNING id`,
        [tan.entity_id, tan.id, input.taxYear, quarter, input.form, due, tdsCorrectionDeadline(due), totals.n, totals.paid, totals.ded, totals.dep],
      )
    ).rows[0].id;
  }
  return { returnId: returnId!, challans: input.challans.length, rows };
}
