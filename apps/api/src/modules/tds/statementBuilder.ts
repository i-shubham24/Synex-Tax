import type pg from 'pg';
import {
  formHasSection,
  proteanStateCode,
  resolveStatementSchemaVersion,
  writeTdsStatement,
  type StatementAddress as Form140Address,
  type StatementInput,
  type WriteIssue,
} from '@synextax/tax-engine';

interface AddressJson {
  line1?: string;
  line2?: string;
  line3?: string;
  line4?: string;
  district?: string;
  city?: string;
  state?: string;
  pin?: string;
}

function toAddress(a: AddressJson | null | undefined): Form140Address {
  const x = a ?? {};
  return {
    line1: x.line1 ?? '',
    line2: x.line2,
    line3: x.line3,
    line4: x.line4,
    district: x.district ?? x.city,
    stateCode: x.state ? proteanStateCode(x.state) ?? '' : '',
    pin: x.pin ?? '',
  };
}

const qNum = (q: string) => Number(q.replace('Q', '')) as 1 | 2 | 3 | 4;

/**
 * Builds the Form 138, 140, 144 or 143 statement for one return from the database (under the caller's RLS context)
 * and writes it. Returns the file, or the list of what must be filled in first.
 */
export async function buildStatement(
  client: pg.PoolClient,
  returnId: string,
  today: string,
): Promise<{ fileName: string; text: string; issues: WriteIssue[]; tan: string; fvuVersion?: string; schemaVersion?: string } | null> {
  const ret = (
    await client.query(
      `SELECT r.id, r.tax_year, r.quarter, r.form_code, r.statutory_regime, r.workflow_status, r.tan_registration_id,
              t.tan, t.deductor_type_code, t.address, t.deductor_email, t.deductor_phone, t.gstin, t.statement_file_seq,
              t.govt_state_code, t.ministry_code, t.ministry_other, t.ain,
              t.responsible_person_name, t.responsible_person_designation, t.responsible_person_pan,
              t.responsible_address, t.responsible_email, t.responsible_phone,
              e.legal_name, e.pan AS entity_pan
       FROM public.tds_returns r
       JOIN public.tan_registrations t ON t.id = r.tan_registration_id
       JOIN public.entities e ON e.id = r.entity_id
       WHERE r.id = $1`,
      [returnId],
    )
  ).rows[0];
  if (!ret) return null;
  if (!['138', '140', '144', '143'].includes(ret.form_code) || ret.statutory_regime !== 'IT_ACT_2025') {
    return { fileName: '', text: '', tan: ret.tan, issues: [{ where: 'Form', message: `Statement files are written for Forms 138, 140, 144 and 143 under the 2025 Act; this return is Form ${ret.form_code}.` }] };
  }
  const form = ret.form_code as '138' | '140' | '144' | '143';

  const allChallans = (
    await client.query(
      `SELECT id, payment_mode, bsr_code, challan_no, deposit_date, total_income_tax, interest_allocation, fee_late_filing_427_234e, others_allocation, minor_head
       FROM public.tds_challans
       WHERE tan_registration_id = $1 AND tax_year = $2 AND quarter = $3 AND statutory_regime = 'IT_ACT_2025' AND status = 'ACTIVE'
       ORDER BY deposit_date, challan_no`,
      [ret.tan_registration_id, ret.tax_year, ret.quarter],
    )
  ).rows;
  const deductees = (
    await client.query(
      `SELECT d.challan_id, d.deductee_pan, d.deductee_name, a.section_code, d.payment_credit_date, d.amount_paid, d.tds_deducted,
              d.total_tds_deposited, d.deduction_date, d.tds_rate, d.reason_for_non_deduction, d.certificate_no,
              d.payee_status_code, d.opting_out_202, d.remittance_nature, d.country_code, d.grossed_up, d.rate_basis, d.form15ca_ack, d.form121_uin,
              d.residence_address, d.residence_email, d.residence_contact, d.residence_tax_id, d.non_resident, d.permanent_establishment, d.form_code
       FROM public.tds_deductees d JOIN public.tds_challan_section_allocations a ON a.id = d.section_allocation_id
       WHERE d.challan_id = ANY($1::uuid[])
       ORDER BY d.payment_credit_date, d.deductee_name`,
      [allChallans.map((c) => c.id)],
    )
  ).rows.filter((d) => (d.form_code ? d.form_code === form : formHasSection(form, d.section_code)));
  // A quarter's challans can serve several forms; this statement takes the ones its rows draw on.
  const challans = allChallans.filter((c) => deductees.some((d) => d.challan_id === c.id));

  const earlier = (
    await client.query(
      `SELECT latest_accepted_token_15digit AS token FROM public.tds_returns
       WHERE tan_registration_id = $1 AND form_code = $4 AND return_type = 'ORIGINAL'
         AND workflow_status IN ('FILED','CLOSED') AND (tax_year, quarter) < ($2, $3)
       ORDER BY tax_year DESC, quarter DESC LIMIT 1`,
      [ret.tan_registration_id, ret.tax_year, ret.quarter, form],
    )
  ).rows[0];

  const input: StatementInput = {
    form,
    fileCreated: today,
    fileSequence: (ret.statement_file_seq ?? 0) + 1,
    preparedWith: 'SynexTax',
    tan: ret.tan,
    deductorPan: ret.entity_pan,
    deductor: { name: ret.legal_name, address: toAddress(ret.address), email: ret.deductor_email ?? '', phone: ret.deductor_phone ?? '', type: ret.deductor_type_code ?? '', gstin: ret.gstin ?? undefined,
      government: { stateCode: ret.govt_state_code ?? undefined, ministryCode: ret.ministry_code ?? undefined, ministryOther: ret.ministry_other ?? undefined, ain: ret.ain ?? undefined } },
    responsible: {
      name: ret.responsible_person_name ?? '',
      designation: ret.responsible_person_designation ?? '',
      pan: ret.responsible_person_pan ?? '',
      address: toAddress(ret.responsible_address),
      email: ret.responsible_email ?? '',
      phone: ret.responsible_phone ?? '',
    },
    taxYear: ret.tax_year,
    quarter: qNum(ret.quarter),
    earlierRegularFiled: Boolean(earlier),
    previousToken: earlier?.token ?? undefined,
    allowForm138Q4V10: process.env.FORM_138_Q4_V10_ENABLED === 'true',
    challans: challans.map((c) => ({
      mode: c.payment_mode === 'B' ? 'B' : 'C',
      bsrCode: c.bsr_code,
      challanNo: c.challan_no,
      depositedOn: c.deposit_date,
      tax: c.total_income_tax,
      interest: c.interest_allocation,
      fee: c.fee_late_filing_427_234e,
      others: c.others_allocation,
      minorHead: (c.minor_head ?? '200') as '200' | '400' | '100',
      deductees: deductees
        .filter((d) => d.challan_id === c.id)
        .map((d) => ({
          pan: d.deductee_pan,
          name: d.deductee_name,
          sectionCode: d.section_code,
          paidOn: d.payment_credit_date,
          amountPaid: d.amount_paid,
          taxDeducted: d.tds_deducted,
          taxDeposited: d.total_tds_deposited,
          deductedOn: d.deduction_date,
          ratePercent: Number(d.tds_rate) * 100,
          reasonFlag: d.reason_for_non_deduction ?? undefined,
          certificateNo: d.certificate_no ?? undefined,
          form121Uin: d.form121_uin ?? undefined,
          statusCode: d.payee_status_code ?? undefined,
          optingOut: d.opting_out_202,
          remittanceNature: d.remittance_nature ?? undefined,
          countryCode: d.country_code ?? undefined,
          grossedUp: d.grossed_up,
          rateBasis: d.rate_basis ?? undefined,
          form15caAck: d.form15ca_ack ?? undefined,
          residenceAddress: d.residence_address ?? undefined,
          residenceEmail: d.residence_email ?? undefined,
          residenceContact: d.residence_contact ?? undefined,
          residenceTaxId: d.residence_tax_id ?? undefined,
          nonResident: d.non_resident,
          permanentEstablishment: d.permanent_establishment ?? undefined,
        })),
    })),
  };

  const { text, issues } = writeTdsStatement(input);
  const schemaMeta = resolveStatementSchemaVersion({
    regime: 'IT_ACT_2025',
    form,
    quarter: qNum(ret.quarter),
    allowForm138Q4V10: input.allowForm138Q4V10,
  });
  const fileName = `${ret.tan}_${form}_${ret.quarter}_${ret.tax_year}${String((ret.tax_year + 1) % 100).padStart(2, '0')}.txt`;
  if (!issues.length) {
    await client.query('UPDATE public.tan_registrations SET statement_file_seq = statement_file_seq + 1 WHERE id = $1', [ret.tan_registration_id]);
  }
  return {
    fileName,
    text: issues.length ? '' : text,
    issues,
    tan: ret.tan,
    fvuVersion: schemaMeta.fvuVersion,
    schemaVersion: schemaMeta.schemaVersion,
  };
}
