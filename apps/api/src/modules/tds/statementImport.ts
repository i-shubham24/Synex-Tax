import type pg from 'pg';
import { Decimal } from 'decimal.js';
import { tdsCorrectionDeadline, tdsStatementDueDate, type ParsedStatement, type TdsForm } from '@synextax/tax-engine';

export class ImportError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export interface StatementImportResult {
  returnId: string;
  challans: number;
  deductees: number;
  sections: number;
}

/**
 * Writes a parsed Form 140 regular statement as history for a TAN already in Client Master:
 * the return (source IMPORTED, closed), its challans, section allocations and deductees.
 * Runs in the caller's RLS transaction; every insert is audited by trigger.
 */
export async function commitStatement(client: pg.PoolClient, s: ParsedStatement, userId: string): Promise<StatementImportResult> {
  if (s.issues.some((i) => i.level === 'error')) throw new ImportError(422, 'The file has errors. Fix them in your return software and export again.');
  if (!s.taxYear || !s.quarter) throw new ImportError(422, 'The file does not say which tax year and quarter it is for.');

  const form = s.form as TdsForm;
  const regime = s.regime === 'IT_ACT_1961' ? 'IT_ACT_1961' : 'IT_ACT_2025';
  if (regime === 'IT_ACT_1961') {
    // An ITNS 281 challan carries exactly one section; a file that mixes sections on one challan
    // cannot be stored as filed without inventing an allocation.
    for (const c of s.challans) {
      const codes = new Set(s.deductees.filter((d) => d.challanRecordNo === c.recordNo).map((d) => d.sectionCode));
      if (codes.size > 1) throw new ImportError(422, `Challan ${c.recordNo} (BSR ${c.bsrCode}, ${c.depositDate}) has rows under ${[...codes].join(', ')}. Under the 1961 Act a challan covers one section; split it in your return software and export again.`);
    }
  }
  const tan = await client.query<{ id: string; entity_id: string }>('SELECT id, entity_id FROM public.tan_registrations WHERE tan = $1', [s.tan]);
  if (!tan.rows[0]) throw new ImportError(422, `TAN ${s.tan} is not in Client Master. Add the client and its TAN first.`);
  const { id: tanId, entity_id: entityId } = tan.rows[0];
  const quarter = `Q${s.quarter}`;

  const existing = await client.query(
    `SELECT 1 FROM public.tds_returns WHERE tan_registration_id = $1 AND statutory_regime = $5 AND tax_year = $2
       AND quarter = $3 AND form_code = $4 AND return_type = 'ORIGINAL' AND correction_no = 0`,
    [tanId, s.taxYear, quarter, form, regime],
  );
  if (existing.rows[0]) throw new ImportError(409, `Form ${form} ${quarter} for ${regime === 'IT_ACT_1961' ? 'financial' : 'tax'} year ${s.taxYear}-${String((s.taxYear + 1) % 100).padStart(2, '0')} is already in SynexTax for this TAN.`);

  const totalPaid = s.deductees.reduce((sum, d) => sum.add(d.amountPaid), new Decimal(0));
  const totalDeducted = s.deductees.reduce((sum, d) => sum.add(d.taxDeducted), new Decimal(0));
  const totalDeposited = s.deductees.reduce((sum, d) => sum.add(d.taxDeposited), new Decimal(0));
  const due = tdsStatementDueDate(form, s.taxYear, s.quarter);

  const returnId = (
    await client.query<{ id: string }>(
      `INSERT INTO public.tds_returns (firm_id, entity_id, tan_registration_id, statutory_regime, tax_year, quarter, form_code, workflow_status,
         statutory_due_date, correction_window_expires_at, total_deductees, total_amount_paid, total_tax_deducted, total_tax_deposited,
         previous_token_number_15digit, source)
       VALUES (app.current_firm_id(), $1, $2, $13, $3, $4, $12, 'DRAFT', $5, $6, $7, $8, $9, $10, $11, 'IMPORTED') RETURNING id`,
      [entityId, tanId, s.taxYear, quarter, due, tdsCorrectionDeadline(due), s.deductees.length, totalPaid.toFixed(2), totalDeducted.toFixed(2), totalDeposited.toFixed(2), /^\d{15}$/.test(s.previousToken) ? s.previousToken : null, form, regime],
    )
  ).rows[0].id;

  let sections = 0;
  for (const c of s.challans) {
    const rows = s.deductees.filter((d) => d.challanRecordNo === c.recordNo);
    // Company deductees go under head 0020, everyone else 0021 (decided by the 4th PAN character).
    const head = rows.length && rows.every((d) => d.pan[3] === 'C') ? '0020' : '0021';
    const challanId = (
      await client.query<{ id: string }>(
        `INSERT INTO public.tds_challans (firm_id, entity_id, tan_registration_id, challan_no, bsr_code, deposit_date, statutory_regime, tax_year, quarter,
           deductee_type_head, total_income_tax, interest_allocation, others_allocation, fee_late_filing_427_234e, total_challan_amount, created_by)
         VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $15, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [entityId, tanId, (c.challanNo || `BA${c.recordNo}`).slice(0, 16), c.bsrCode, c.depositDate, s.taxYear, quarter, head, c.totalTax, c.interest, c.others, c.fee, c.totalDeposit, userId, regime],
      )
    ).rows[0].id;

    const bySection = new Map<string, typeof rows>();
    for (const d of rows) bySection.set(d.sectionCode, [...(bySection.get(d.sectionCode) ?? []), d]);
    for (const [code, list] of bySection) {
      const sectionTotal = list.reduce((sum, d) => sum.add(d.taxDeposited), new Decimal(0)).toFixed(2);
      const allocId = (
        await client.query<{ id: string }>(
          `INSERT INTO public.tds_challan_section_allocations (firm_id, entity_id, challan_id, section_code, income_tax, total_section_amount)
           VALUES (app.current_firm_id(), $1, $2, $3, $4, $4) RETURNING id`,
          [entityId, challanId, code, sectionTotal],
        )
      ).rows[0].id;
      sections += 1;
      for (const d of list) {
        const literal = ['PANNOTAVBL', 'PANAPPLIED', 'PANINVALID'].includes(d.pan);
        await client.query(
          `INSERT INTO public.tds_deductees (firm_id, entity_id, tan_registration_id, challan_id, section_allocation_id, deductee_pan, deductee_name, pan_status,
             payment_credit_date, amount_paid, tds_rate, tds_deducted, total_tds_deposited, deduction_date, certificate_no, reason_for_non_deduction, created_by,
             payee_status_code, opting_out_202, remittance_nature, country_code, grossed_up, rate_basis, form15ca_ack, form121_uin,
             residence_address, residence_email, residence_contact, residence_tax_id, non_resident, permanent_establishment, form_code)
           VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                   $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)`,
          [
            entityId, tanId, challanId, allocId, d.pan, d.name.slice(0, 150) || 'Unnamed payee', literal ? 'UNAVAILABLE' : 'OPERATIVE',
            d.paymentDate, d.amountPaid, d.rate ? new Decimal(d.rate).div(100).toFixed(4) : '0.0000', d.taxDeducted, d.taxDeposited,
            d.deductionDate || d.paymentDate, d.certificateNo || null, /^[A-Z0-9]{1,8}$/.test(d.reasonCode) ? d.reasonCode : null, userId,
            /^([1-9]|10)$/.test(d.statusCode) ? d.statusCode : null, d.optingOut, /^\d{2}$/.test(d.remittanceNature) ? d.remittanceNature : null,
            /^\d{2,3}$/.test(d.countryCode) ? d.countryCode : null, d.grossedUp, ['A', 'B'].includes(d.rateBasis) ? d.rateBasis : null,
            d.form15caAck || null, d.form121Uin || null, d.residenceAddress || null, d.residenceEmail || null, d.residenceContact || null,
            d.residenceTaxId || null, d.nonResident, d.permanentEstablishment, s.form,
          ],
        );
      }
    }
  }

  // Filed outside SynexTax: keep it as closed history, which also locks the quarter's rows.
  await client.query(`UPDATE public.tds_returns SET workflow_status = 'CLOSED' WHERE id = $1`, [returnId]);
  return { returnId, challans: s.challans.length, deductees: s.deductees.length, sections };
}
