import { ISO, n0, sum, type ItrIssue } from './itrCommon.js';
import { writeItr1, type Itr1Input } from './itr1Json.js';
import { writeItr2, type Itr2Input } from './itr2Json.js';
import { writeItr3, type Itr3Input } from './itr3Json.js';
import { writeItr4, type Itr4Input } from './itr4Json.js';

/**
 * Updated return (ITR-U) under section 139(8A) for Assessment Year 2026-27, with the tax under section
 * 140B. The updated return is the ITR-1, ITR-2, ITR-3 or ITR-4 written by the existing writers with the
 * date of the updated return as the date of filing (so interest under 234A, 234B and 234C and the fee
 * under 234F run to that date), plus Part A (General information, 139(8A)) and Part B-ATI of Form ITR-U.
 *
 * Sources:
 * - Form ITR-U as substituted by the Income-tax (Ninth Amendment) Rules 2026, Notification No. 52/2026
 *   of 30 Mar 2026 (G.S.R. 233(E)): Part B-ATI items 1 to 15, with item 9 "aggregate liability" =
 *   3 + 6(ii) - (5 + 8 + 4) where a refund was issued, 3 + 6(i) - (5 + 8 + 4) where not; item 10 the
 *   additional income-tax at 25%, 50%, 60% or 70% of (9 - 7) by the period of filing; 11 = 9 + 10;
 *   13 = 11 - 12.
 * - Section 140B(3) as amended by the Finance Act 2025 (48 months): 25% within 12 months from the end of
 *   the relevant assessment year, 50% within 24, 60% within 36, 70% within 48. The end of AY 2026-27 is
 *   31 Mar 2027, so the periods end on 31 Mar 2028, 2029, 2030 and 2031.
 * - Field names: the PartA_139_8A and PartB-ATI definitions the Department added to the AY 2025-26 ITR-1
 *   to ITR-4 schemas on 01 Jan 2026 (schema change documents version 1.2 and 1.3; ReturnFileSec 21).
 *
 * Not yet fileable: the AY 2026-27 schemas the Department has released (ITR-1 V1.1, ITR-2 V1.2, ITR-3 V1.1,
 * ITR-4 V1.1) do not accept ReturnFileSec 21 or these parts; for AY 2025-26 they were added only after the
 * time for belated and revised returns ran out. Until the AY 2026-27 release, the writer works and returns
 * Part A and Part B-ATI and the 140B figures but withholds the JSON (ITRU_SCHEMA_RELEASED).
 *
 * Not covered, reported as issues: an updated return in response to a notice under section 148 (35%,
 * 60%, 70% or 80% under the Finance Act 2026, item 10 second limb), returns that reduce a loss,
 * unabsorbed depreciation or tax credit (item A12), relief under section 89, and filing on or before
 * 31 Dec 2026, while a belated or revised return can still be filed under section 139(4) or 139(5).
 */

export const ITRU_SCHEMA_RELEASED = false;

/** Reason codes in Part A item A10 (enum ReasonsForUpdatingIncome in the AY 2025-26 schemas). */
export const ITRU_REASONS = {
  '1': 'Return previously not filed',
  '2': 'Income not reported correctly',
  '3': 'Wrong heads of income chosen',
  '4': 'Reduction of carried forward loss',
  '5': 'Reduction of unabsorbed depreciation',
  '6': 'Reduction of tax credit u/s 115JB/115JC',
  '7': 'Wrong rate of tax',
  OTH: 'Others',
} as const;
export type ItrUReason = keyof typeof ITRU_REASONS;

export type ItrUBase =
  | { form: 'ITR1'; input: Itr1Input }
  | { form: 'ITR2'; input: Itr2Input }
  | { form: 'ITR3'; input: Itr3Input }
  | { form: 'ITR4'; input: Itr4Input };

export interface ItrUChallan { bsr: string; date: string; serial: number; amount: number }

export interface ItrUInput {
  base: ItrUBase;
  /** Date of the updated return (YYYY-MM-DD). */
  filedOn: string;
  aadhaar?: string;
  /** A8: eligible under the first to fourth provisos to section 139(8A) (no search, survey or assessment pending, not a loss return, and so on). */
  eligible: boolean;
  reasons: ItrUReason[];
  /** The last valid return for AY 2026-27, if any. */
  previous?: {
    section: '139(1)' | 'OTHER';
    form: 'ITR1' | 'ITR2' | 'ITR3' | 'ITR4' | 'ITR5' | 'ITR6' | 'ITR7';
    ack: string;
    filedOn: string;
    /** Item 1B: total income as per the last valid return. */
    totalIncome: number;
    /** Head-wise income in that return, for item 1A. */
    heads: { salary?: number; houseProperty?: number; business?: number; capitalGains?: number; otherSources?: number };
    /** Item 5: amount payable on the basis of the last valid return. */
    amountPayable: number;
    /** Item 6(i): refund claimed; 6(ii): refund issued including interest under 244A. */
    refundClaimed?: number;
    refundIssued?: number;
  };
  /** Item 8: regular assessment tax paid over and above item 5. */
  regularAssessmentTax?: number;
  /** Item 14A: tax paid under section 140B before filing. */
  payments140B?: ItrUChallan[];
}

/** Period of filing (item A11) and the additional income-tax rate under section 140B(3). */
export function itrUPeriod(filedOn: string): { period: '1' | '2' | '3' | '4'; rate: number } | null {
  if (filedOn <= '2028-03-31') return { period: '1', rate: 0.25 };
  if (filedOn <= '2029-03-31') return { period: '2', rate: 0.5 };
  if (filedOn <= '2030-03-31') return { period: '3', rate: 0.6 };
  if (filedOn <= '2031-03-31') return { period: '4', rate: 0.7 };
  return null;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Head-wise income and the 234F fee from the base return as each form lays them out. */
function headsOf(form: ItrUBase['form'], json: Record<string, any>) {
  const r = json.ITR[form];
  if (form === 'ITR1' || form === 'ITR4') {
    const d = r[form === 'ITR1' ? 'ITR1_IncomeDeductions' : 'IncomeDeductions'];
    const fee = num(r[form === 'ITR1' ? 'ITR1_TaxComputation' : 'TaxComputation']?.IntrstPay?.LateFilingFee234F);
    return { salary: num(d.IncomeFromSal), houseProperty: num(d.TotalIncomeChargeableUnHP), business: num(d.IncomeFromBusinessProf), capitalGains: num(r.LTCG112A?.LongCap112A), otherSources: num(d.IncomeOthSrc), fee };
  }
  const ti = r['PartB-TI'];
  const fee = num(r.PartB_TTI?.ComputationOfTaxLiability?.IntrstPay?.LateFilingFee234F);
  return { salary: num(ti.Salaries), houseProperty: num(ti.IncomeFromHP), business: num(ti.ProfBusGain?.TotProfBusGain), capitalGains: num(ti.CapGain?.TotalCapGains), otherSources: num(ti.IncFromOS?.TotIncFromOS), fee };
}

export function writeItrU(i: ItrUInput): { json: Record<string, unknown> | null; issues: ItrIssue[]; summary: Record<string, number>; parts: Record<string, unknown> | null } {
  const issues: ItrIssue[] = [];
  const err = (field: string, message: string) => issues.push({ field, message });
  if (!ISO.test(i.filedOn)) err('filedOn', 'Date of the updated return is required.');
  else if (i.filedOn <= '2026-12-31') err('filedOn', 'Up to 31 Dec 2026 a belated or revised return can still be filed under section 139(4) or 139(5); file that instead of an updated return.');
  const per = itrUPeriod(i.filedOn);
  if (ISO.test(i.filedOn) && !per) err('filedOn', 'An updated return for AY 2026-27 can be filed only up to 31 Mar 2031, 48 months from the end of the assessment year (section 139(8A)).');
  if (!i.eligible) err('eligible', 'Confirm eligibility under the first to fourth provisos to section 139(8A) (item A8); an ineligible person cannot file an updated return.');
  if (!i.reasons?.length) err('reasons', 'Give at least one reason for updating the income (item A10).');
  if (i.reasons?.some((x) => x === '4' || x === '5' || x === '6')) err('reasons', 'An updated return that reduces a carried forward loss, unabsorbed depreciation or tax credit (item A12) is not written by this file.');
  if (i.aadhaar && !/^\d{12}$/.test(i.aadhaar)) err('aadhaar', 'Aadhaar must be 12 digits.');
  const prev = i.previous;
  if (prev) {
    if (!/^\d{15}$/.test(prev.ack) || !ISO.test(prev.filedOn)) err('previous', 'Give the acknowledgement number and date of the last valid return.');
    if (i.reasons?.includes('1')) err('reasons', '"Return previously not filed" cannot be chosen when a return was filed.');
  } else if (i.reasons?.length && !i.reasons.includes('1')) err('reasons', 'Where no return was filed for the year, the reason is "Return previously not filed".');

  // The updated return itself, written with the date of the updated return as the date of filing.
  const base = i.base;
  const at = { createdOn: i.filedOn, filing: { ...base.input.filing, section: 11 as const, originalAck: undefined, originalFiledOn: undefined } };
  const out = base.form === 'ITR1' ? writeItr1({ ...base.input, ...at })
    : base.form === 'ITR2' ? writeItr2({ ...base.input, ...at, filing: { ...base.input.filing, ...at.filing } })
      : base.form === 'ITR3' ? writeItr3({ ...base.input, ...at, filing: { ...base.input.filing, ...at.filing } })
        : writeItr4({ ...base.input, ...at, filing: { ...base.input.filing, ...at.filing } });
  issues.push(...out.issues.filter((x) => x.field !== 'section'));
  if (!out.json) return { json: null, issues, summary: out.summary, parts: null };

  const h = headsOf(base.form, out.json as Record<string, any>);
  const ph = prev?.heads ?? {};
  const add = {
    Salaries: h.salary - n0(ph.salary), IncomeFromHP: h.houseProperty - n0(ph.houseProperty), IncomeFromBP: h.business - n0(ph.business),
    IncomeFromCG: h.capitalGains - n0(ph.capitalGains), IncomeFromOS: h.otherSources - n0(ph.otherSources),
  };
  const addTotal = sum(Object.values(add));
  const s = out.summary;
  const l2 = n0(s.totalIncome);
  const l3 = n0(s.payable);
  const l4 = n0(s.refund);
  const l5 = n0(prev?.amountPayable);
  const l6i = n0(prev?.refundClaimed), l6ii = n0(prev?.refundIssued);
  const l7 = h.fee;
  const l8 = n0(i.regularAssessmentTax);
  const refundIssued = l6ii > 0;
  const l9 = l3 + (refundIssued ? l6ii : l6i) - (l5 + l8 + l4);
  // Third proviso to 139(8A): no updated return that results in or increases a refund, or lowers the tax liability.
  if (l4 > (refundIssued ? l6ii : l6i)) err('refund', 'An updated return cannot result in a refund or increase the refund of the earlier return (section 139(8A), third proviso).');
  if (l9 < 0) err('liability', 'The updated return shows a lower liability than the last return; section 139(8A) does not allow it.');
  if (l2 <= 0 && !prev) err('income', 'An updated return cannot be a return of loss (section 139(8A), third proviso).');
  const rate = per?.rate ?? 0;
  const l10 = Math.round(Math.max(0, l9 - l7) * rate);
  const l11 = Math.max(0, l9) + l10;
  const challans = i.payments140B ?? [];
  for (const c of challans) if (!/^\d{7}$/.test(c.bsr) || !ISO.test(c.date) || c.date > i.filedOn) err('payments140B', 'Each 140B challan needs a 7-digit BSR code and a date on or before the date of the updated return.');
  const l12 = sum(challans.map((c) => n0(c.amount)));
  const l13 = Math.max(0, l11 - l12);
  if (l13 > 0) err('payments140B', `Pay Rs ${l13} under section 140B before filing; an updated return without proof of that payment is defective (section 139(9), Explanation).`);

  const pan = (out.json as any).ITR[base.form].PersonalInfo?.PAN ?? (out.json as any).ITR[base.form].PartA_GEN1?.PersonalInfo?.PAN;
  const name = base.input.person.surname;
  const partA = {
    PAN: pan, Name: [base.input.person.firstName, base.input.person.surname].filter(Boolean).join(' ') || name, ...(i.aadhaar ? { AadhaarCardNo: i.aadhaar } : {}),
    AssessmentYear: '2026',
    PreviouslyFiledForThisAY: prev ? 'Y' : 'N',
    ...(prev ? { PreviouslyFiledForThisAY_139_8A: prev.section === '139(1)' ? '1' : '2', Applicable_139_8A: { ITRForm: prev.form, AcknowledgementNo: prev.ack, OrigRetFiledDate: prev.filedOn } } : {}),
    LaidOutIn_139_8A: i.eligible ? 'Y' : 'N',
    ITRFormUpdatingInc: base.form,
    UpdatingInc: { ReasonsForUpdatingIncDtls: (i.reasons ?? []).map((x) => ({ ReasonsForUpdatingIncome: x })) },
    UpdatedReturnDuringPeriod: per?.period ?? '1',
  };
  const partB = {
    HeadOfInc: { ...add, Total: addTotal },
    LatestTotInc: n0(prev?.totalIncome),
    UpdatedTotInc: l2, AmtPayable: l3, AmtRefundable: l4, LastAmtPayable: l5, Refund: l6i, TotRefund: l6ii, FeeIncUS234F: l7, RegAssessementTAX: l8,
    AggrLiabilityRefund: refundIssued ? Math.max(0, l9) : 0, AggrLiabilityNoRefund: refundIssued ? 0 : Math.max(0, l9),
    AddtnlIncTax: l10, NetPayable: l11, TaxUS140B: l12, TaxDue10_11: l13,
    ...(challans.length ? { ScheduleIT1: { TaxPayment1: { TaxPayments: challans.map((c, k) => ({ slno: k + 1, BSRCode: c.bsr, DateDep: c.date, SrlNoOfChaln: c.serial, Amt: n0(c.amount) })) }, Total: l12 } } : {}),
    ReleifUS89: 0,
  };

  if (!ITRU_SCHEMA_RELEASED) err('schema', 'The Department has not yet released AY 2026-27 schemas that accept an updated return (ReturnFileSec 21 with Part A 139(8A) and Part B-ATI); the figures are worked, the JSON is written once the schema is out.');

  const r = (out.json as any).ITR[base.form];
  const fs = r.FilingStatus ?? r.PartA_GEN1?.FilingStatus;
  const merged = { ITR: { [base.form]: { ...r, ...(r.FilingStatus ? { FilingStatus: { ...fs, ReturnFileSec: 21 } } : { PartA_GEN1: { ...r.PartA_GEN1, FilingStatus: { ...fs, ReturnFileSec: 21 } } }), PartA_139_8A: partA, 'PartB-ATI': partB } } };
  const summary = {
    additionalIncome: addTotal, updatedTotalIncome: l2, amountPayable: l3, refundable: l4, lastAmountPayable: l5, fee234F: l7,
    aggregateLiability: l9, additionalTaxRate: rate * 100, additionalTax: l10, netPayable: l11, paid140B: l12, taxDue: l13,
  };
  return { json: issues.length ? null : merged, issues, summary, parts: { PartA_139_8A: partA, 'PartB-ATI': partB } };
}
