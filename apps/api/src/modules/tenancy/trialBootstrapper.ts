import type pg from 'pg';
import {
  calculateGstinChecksum,
  gstDueDate,
  tdsCorrectionDeadline,
  tdsStatementDueDate,
} from '@synextax/tax-engine';

/**
 * TrialWorkspaceBootstrapper: seeds two clearly labelled sample clients into a new trial firm so
 * the first screen a partner sees has real work in it.
 *
 *  1. A textile company (GSTIN, Punjab) with a purchase register and a GSTR-2B that disagree in
 *     every way the 4-pass recon handles, IMS items still waiting, and October returns open.
 *  2. A trading company with a TAN, one ITNS 281N challan split across three sections and a
 *     draft Form 140 for Q3 of tax year 2026-27 (Income-tax Act, 2025).
 *
 * Runs inside the signed SYSTEM_JOB transaction that created the firm, so RLS and audit apply.
 * Section codes for the 2025 Act are written as "393(1)-<1961 section>" until the official FVU 1.2
 * code list is loaded; they are sample data only.
 */

function gstin(state: string, pan: string): string {
  const first14 = `${state}${pan}1Z`;
  return `${first14}${calculateGstinChecksum(first14)}`;
}

/** Last completed month in IST, as YYYY-MM (the GST period being worked on). */
export function activeGstPeriod(now = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth(); // 0-based current month, so this is the previous month 1-based
  return m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, '0')}`;
}

interface BootstrapInput {
  firmId: string;
  partnerUserId: string;
  now?: Date;
}

export interface BootstrapResult {
  groupId: string;
  entityIds: string[];
  period: string;
}

export async function bootstrapTrialWorkspace(client: pg.PoolClient, { firmId, partnerUserId, now = new Date() }: BootstrapInput): Promise<BootstrapResult> {
  const q = (text: string, values: unknown[]) => client.query(text, values);
  const period = activeGstPeriod(now);
  const [py, pm] = period.split('-').map(Number);
  const d = (day: number) => `${period}-${String(day).padStart(2, '0')}`;

  const groupId = (await q(`INSERT INTO public.client_groups (firm_id, name, code, notes, created_by) VALUES ($1, 'Sample clients', 'SAMPLE', 'Created with your trial. Delete when you add real clients.', $2) RETURNING id`, [firmId, partnerUserId])).rows[0].id as string;

  // ---------------------------------------------------------------- 1. Textile company (GST)
  const textilePan = 'AAFCP4821K';
  const textileGstin = gstin('03', textilePan);
  const textileId = (
    await q(
      `INSERT INTO public.entities (firm_id, client_group_id, legal_name, trade_name, pan, constitution, onboarding_source, created_by)
       VALUES ($1, $2, 'Phulkari Textiles Pvt Ltd (Sample)', 'Phulkari Textiles', $3, 'PRIVATE_LIMITED', 'MANUAL', $4) RETURNING id`,
      [firmId, groupId, textilePan, partnerUserId],
    )
  ).rows[0].id as string;
  const regId = (
    await q(
      `INSERT INTO public.gst_registrations (firm_id, entity_id, gstin, registration_type, filing_category, portal_registration_status, api_access_status, legal_name_on_portal, created_by)
       VALUES ($1, $2, $3, 'REGULAR', 'REGULAR_MONTHLY', 'ACTIVE', 'OTP_REQUIRED', 'PHULKARI TEXTILES PRIVATE LIMITED', $4) RETURNING id`,
      [firmId, textileId, textileGstin, partnerUserId],
    )
  ).rows[0].id as string;

  const suppliers = {
    yarn: { gstin: gstin('03', 'AABFM5521R'), name: 'Majha Yarn Traders (Sample)' },
    dye: { gstin: gstin('03', 'AADCL7713H'), name: 'Ludhiana Dye Works (Sample)' },
    surat: { gstin: gstin('24', 'AAGCS9012P'), name: 'Surat Synthetics (Sample)' },
    pack: { gstin: gstin('03', 'AAHFJ3310M'), name: 'Jalandhar Packaging (Sample)' },
  };

  // Purchase register (books). Amounts in rupees as exact decimal strings.
  const books: Array<[keyof typeof suppliers, string, number, string, string, string, string, string]> = [
    // supplier, invoice no, day, pos, taxable, igst, cgst, sgst
    ['yarn', 'MYT/26-27/0412', 4, '03', '240000.00', '0.00', '6000.00', '6000.00'],
    ['dye', 'LDW/0117', 9, '03', '85000.00', '0.00', '7650.00', '7650.00'],
    ['surat', 'SS-2210', 12, '03', '120000.00', '6000.00', '0.00', '0.00'],
    ['pack', 'JP/889', 20, '03', '32000.00', '0.00', '2880.00', '2880.00'],
  ];
  for (const [s, no, day, pos, taxable, igst, cgst, sgst] of books) {
    const total = (Number(taxable) + Number(igst) + Number(cgst) + Number(sgst)).toFixed(2);
    await q(
      `INSERT INTO public.gst_invoices_purchase (firm_id, entity_id, gst_registration_id, vendor_gstin, vendor_trade_name, invoice_num, invoice_date, doc_type, pos_state_code,
         taxable_value, igst_amount, cgst_amount, sgst_amount, total_invoice_value, return_period)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'INV', $8, $9, $10, $11, $12, $13, $14)`,
      [firmId, textileId, regId, suppliers[s].gstin, suppliers[s].name, no, d(day), pos, taxable, igst, cgst, sgst, total, period],
    );
  }

  // GSTR-2B as the supplier filed it: one exact match, one with a different invoice number format,
  // one with a lower value, one the books do not have; the packaging invoice is missing entirely.
  const twoB: Array<[keyof typeof suppliers, string, number, string, string, string, string, 'A' | 'P' | 'NONE']> = [
    ['yarn', 'MYT/26-27/0412', 4, '240000.00', '0.00', '6000.00', '6000.00', 'A'],
    ['dye', 'LDW/26-27/117', 9, '85000.00', '0.00', '7650.00', '7650.00', 'NONE'],
    ['surat', 'SS-2210', 12, '118500.00', '5925.00', '0.00', '0.00', 'NONE'],
    ['yarn', 'MYT/26-27/0431', 27, '60000.00', '0.00', '1500.00', '1500.00', 'P'],
  ];
  for (const [s, no, day, taxable, igst, cgst, sgst, action] of twoB) {
    const rec = (
      await q(
        `INSERT INTO public.gst_2b_records (firm_id, entity_id, gst_registration_id, return_period, supplier_gstin, supplier_trade_name, doc_type, doc_num, doc_date,
           taxable_value, igst_amount, cgst_amount, sgst_amount, gstr1_filing_period, ims_action_status, ims_action_taken_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'INV', $7, $8, $9, $10, $11, $12, $4, $13, CASE WHEN $13::public.ims_action = 'NONE' THEN NULL ELSE now() END) RETURNING id`,
        [firmId, textileId, regId, period, suppliers[s].gstin, suppliers[s].name, no, d(day), taxable, igst, cgst, sgst, action],
      )
    ).rows[0].id as string;
    if (action === 'P') {
      await q(
        `INSERT INTO public.ims_action_queue (firm_id, entity_id, gst_registration_id, record_2b_id, action, doc_type, action_period, created_by)
         VALUES ($1, $2, $3, $4, 'P', 'INV', $5, $6)`,
        [firmId, textileId, regId, rec, period, partnerUserId],
      );
    }
  }

  // Outward supplies for GSTR-1.
  const sales: Array<[string, number, string, string, string, string, string, string]> = [
    // invoice, day, customer gstin, pos, taxable, igst, cgst, sgst
    ['PT/26-27/0301', 5, gstin('07', 'AAACD6612E'), '07', '350000.00', '17500.00', '0.00', '0.00'],
    ['PT/26-27/0302', 14, gstin('03', 'AACFK2207N'), '03', '180000.00', '0.00', '4500.00', '4500.00'],
    ['PT/26-27/0303', 23, gstin('03', 'AADCR8841G'), '03', '95000.00', '0.00', '2375.00', '2375.00'],
  ];
  let outputTax = 0;
  for (const [no, day, cust, pos, taxable, igst, cgst, sgst] of sales) {
    const tax = Number(igst) + Number(cgst) + Number(sgst);
    outputTax += tax;
    await q(
      `INSERT INTO public.gst_invoices_sales (firm_id, entity_id, gst_registration_id, invoice_num, invoice_date, doc_type, supply_type, customer_gstin, pos_state_code,
         taxable_value, igst_rate, igst_amount, cgst_rate, cgst_amount, sgst_rate, sgst_amount, total_invoice_value, return_period, created_by)
       VALUES ($1, $2, $3, $4, $5, 'INV', 'B2B', $6, $7, $8, $9, $10, $11, $12, $11, $13, $14, $15, $16)`,
      [
        firmId, textileId, regId, no, d(day), cust, pos, taxable,
        Number(igst) > 0 ? '0.0500' : '0.0000', igst,
        Number(cgst) > 0 ? '0.0250' : '0.0000', cgst, sgst,
        (Number(taxable) + tax).toFixed(2), period, partnerUserId,
      ],
    );
  }

  await q(
    `INSERT INTO public.gst_filings (firm_id, entity_id, gst_registration_id, return_period, return_type, workflow_status, statutory_due_date, gross_tax_liability)
     VALUES ($1, $2, $3, $4, 'GSTR1', 'VALIDATED', $5, $6),
            ($1, $2, $3, $4, 'GSTR3B', 'DRAFT', $7, $6)`,
    [firmId, textileId, regId, period, gstDueDate('GSTR1', period, 'MONTHLY', '03'), outputTax.toFixed(2), gstDueDate('GSTR3B', period, 'MONTHLY', '03')],
  );

  // ---------------------------------------------------------------- 2. Trading company (TDS, 2025 Act)
  const tradingPan = 'AAJCG7392L';
  const tradingId = (
    await q(
      `INSERT INTO public.entities (firm_id, client_group_id, legal_name, trade_name, pan, constitution, onboarding_source, created_by)
       VALUES ($1, $2, 'Golden Gate Hardware Pvt Ltd (Sample)', 'Golden Gate Hardware', $3, 'PRIVATE_LIMITED', 'MANUAL', $4) RETURNING id`,
      [firmId, groupId, tradingPan, partnerUserId],
    )
  ).rows[0].id as string;
  const tanId = (
    await q(
      `INSERT INTO public.tan_registrations (firm_id, entity_id, tan, deductor_type_code, branch_name, responsible_person_name, responsible_person_designation, address, created_by)
       VALUES ($1, $2, 'AMRG04217D', 'K', 'Hall Bazaar, Amritsar', 'Director (Sample)', 'Director', '{"city":"Amritsar","state":"Punjab","pin":"143006"}', $3) RETURNING id`,
      [firmId, tradingId, partnerUserId],
    )
  ).rows[0].id as string;

  // TDS quarter that contains the active GST month (Q3 = Oct to Dec).
  const taxYear = pm >= 4 ? py : py - 1;
  const quarter = (pm >= 4 && pm <= 6 ? 1 : pm >= 7 && pm <= 9 ? 2 : pm >= 10 ? 3 : 4) as 1 | 2 | 3 | 4;
  const depositDate = pm === 12 ? `${py + 1}-01-07` : `${py}-${String(pm + 1).padStart(2, '0')}-07`;

  const sections: Array<{ code: string; deductees: Array<[string, string, string, string]> }> = [
    // pan, name, amount paid, rate
    { code: '393(1)-194C', deductees: [['BQRPS4410K', 'Sukhwinder Singh (Sample contractor)', '150000.00', '0.0100'], ['AAKFR2290D', 'Ranjit Builders (Sample firm)', '220000.00', '0.0200'], ['PANNOTAVBL', 'Unregistered labour contractor (Sample)', '40000.00', '0.2000']] },
    { code: '393(1)-194J', deductees: [['ACMPK8812B', 'Kiran Mehta (Sample consultant)', '60000.00', '0.1000']] },
    { code: '393(1)-194I', deductees: [['AAEPB5531H', 'Balwant Bedi (Sample landlord)', '75000.00', '0.1000']] },
  ];
  const tdsOf = (amount: string, rate: string) => (Math.round(Number(amount) * Number(rate) * 100) / 100).toFixed(2);
  const challanTotal = sections.flatMap((s) => s.deductees).reduce((sum, [, , a, r]) => sum + Number(tdsOf(a, r)), 0).toFixed(2);

  const challanId = (
    await q(
      `INSERT INTO public.tds_challans (firm_id, entity_id, tan_registration_id, challan_no, bsr_code, deposit_date, statutory_regime, tax_year, quarter, deductee_type_head,
         total_income_tax, total_challan_amount, created_by)
       VALUES ($1, $2, $3, '00417', '0510308', $4, 'IT_ACT_2025', $5, $6, '0021', $7, $7, $8) RETURNING id`,
      [firmId, tradingId, tanId, depositDate, taxYear, `Q${quarter}`, challanTotal, partnerUserId],
    )
  ).rows[0].id as string;

  let paid = 0;
  let deducted = 0;
  let count = 0;
  for (const s of sections) {
    const sectionTotal = s.deductees.reduce((sum, [, , a, r]) => sum + Number(tdsOf(a, r)), 0).toFixed(2);
    const allocId = (
      await q(
        `INSERT INTO public.tds_challan_section_allocations (firm_id, entity_id, challan_id, section_code, income_tax, total_section_amount)
         VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
        [firmId, tradingId, challanId, s.code, sectionTotal],
      )
    ).rows[0].id as string;
    for (const [pan, name, amount, rate] of s.deductees) {
      const tds = tdsOf(amount, rate);
      paid += Number(amount);
      deducted += Number(tds);
      count += 1;
      await q(
        `INSERT INTO public.tds_deductees (firm_id, entity_id, tan_registration_id, challan_id, section_allocation_id, deductee_pan, deductee_name, pan_status,
           payment_credit_date, amount_paid, tds_rate, tds_deducted, total_tds_deposited, deduction_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $9, $13)`,
        [firmId, tradingId, tanId, challanId, allocId, pan, name, pan === 'PANNOTAVBL' ? 'UNAVAILABLE' : 'OPERATIVE', d(Math.min(28, 10 + count * 3)), amount, rate, tds, partnerUserId],
      );
    }
  }

  const tdsDue = tdsStatementDueDate('140', taxYear, quarter);
  await q(
    `INSERT INTO public.tds_returns (firm_id, entity_id, tan_registration_id, statutory_regime, tax_year, quarter, form_code, workflow_status, statutory_due_date,
       correction_window_expires_at, total_deductees, total_amount_paid, total_tax_deducted, total_tax_deposited)
     VALUES ($1, $2, $3, 'IT_ACT_2025', $4, $5, '140', 'DRAFT', $6, $7, $8, $9, $10, $10)`,
    [firmId, tradingId, tanId, taxYear, `Q${quarter}`, tdsDue, tdsCorrectionDeadline(tdsDue), count, paid.toFixed(2), deducted.toFixed(2)],
  );

  return { groupId, entityIds: [textileId, tradingId], period };
}
