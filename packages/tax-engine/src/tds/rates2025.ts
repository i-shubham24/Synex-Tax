import Decimal from 'decimal.js';

/**
 * TDS rates and thresholds for payments to residents (Form 140 section codes), Tax Year 2026-27.
 *
 * Source: Income Tax Department, "Rates for tax deduction at source [For tax year 2026-27]"
 * (wm.incometaxindia.gov.in/w/tds-rates, as amended by the Finance Act 2026) and the Tables in
 * section 393(1), (3) and (4) of the Income-tax Act, 2025 (wm.incometaxindia.gov.in/w/section-393-5),
 * read on 21 November 2026. "Rates in force" are the rates in that chart.
 *
 * Thresholds, per section 393: tax is deducted on the whole amount once the amount (or the year's
 * aggregate, where so stated) exceeds the threshold. Where the Act taxes only the excess (purchase
 * of goods, cash withdrawals) or the threshold depends on facts not in a statement, the rule says so
 * and only the rate is checked.
 */

export type ThresholdRule =
  | { kind: 'NONE' }
  | { kind: 'AGGREGATE'; amount: number } // the year's payments to the payee under the code
  | { kind: 'SINGLE'; amount: number } // each payment on its own
  | { kind: 'MONTHLY'; amount: number } // rent: for a month or part of a month
  | { kind: 'SINGLE_OR_AGGREGATE'; single: number; aggregate: number } // contractors
  | { kind: 'EXCESS_ONLY'; amount: number } // tax only on the amount above
  | { kind: 'NOT_CHECKED'; reason: string };

export interface RateRule {
  code: string;
  section: string;
  nature: string;
  /** Percent; a function where the rate turns on the payee being a company. */
  rate: number | ((payeeIsCompany: boolean) => number);
  threshold: ThresholdRule;
}

const r = (code: string, section: string, nature: string, rate: RateRule['rate'], threshold: ThresholdRule): RateRule => ({ code, section, nature, rate, threshold });

export const RATES_2025: Record<string, RateRule> = Object.fromEntries(
  [
    r('1004', '392(7)', 'Accumulated balance of provident fund', 10, { kind: 'NOT_CHECKED', reason: 'Threshold depends on the employee’s service and the payment.' }),
    r('1005', '393(1) Table 1(i)', 'Insurance commission', (company) => (company ? 10 : 2), { kind: 'AGGREGATE', amount: 20000 }),
    r('1006', '393(1) Table 1(ii)', 'Commission or brokerage', 2, { kind: 'AGGREGATE', amount: 20000 }),
    r('1008', '393(1) Table 2(ii)(a)', 'Rent for machinery, plant or equipment', 2, { kind: 'MONTHLY', amount: 50000 }),
    r('1009', '393(1) Table 2(ii)(b)', 'Rent for land, building, furniture or fittings', 10, { kind: 'MONTHLY', amount: 50000 }),
    r('1011', '393(1) Table 3(ii)', 'Joint development agreement consideration', 10, { kind: 'NONE' }),
    r('1012', '393(1) Table 3(iii)', 'Compensation on compulsory acquisition', 10, { kind: 'AGGREGATE', amount: 500000 }),
    r('1013', '393(1) Table 4(i)', 'Income from mutual fund units', 10, { kind: 'AGGREGATE', amount: 10000 }),
    r('1014', '393(1) Table 4(ii)', 'Business trust interest to unit holder', 10, { kind: 'NONE' }),
    r('1015', '393(1) Table 4(ii)', 'Business trust dividend to unit holder', 10, { kind: 'NONE' }),
    r('1016', '393(1) Table 4(ii)', 'Business trust rent to unit holder', 10, { kind: 'NONE' }),
    r('1017', '393(1) Table 4(iii)', 'Investment fund income to unit holder', 10, { kind: 'NONE' }),
    r('1018', '393(1) Table 4(iv)', 'Securitisation trust income', 10, { kind: 'NONE' }),
    r('1019', '393(1) Table 5(i)', 'Interest on securities', 10, { kind: 'AGGREGATE', amount: 10000 }),
    r('1020', '393(1) Table 5(ii)(a)', 'Bank, co-operative bank or post office interest, senior citizen', 10, { kind: 'AGGREGATE', amount: 100000 }),
    r('1021', '393(1) Table 5(ii)(b)', 'Bank, co-operative bank or post office interest, others', 10, { kind: 'AGGREGATE', amount: 50000 }),
    r('1022', '393(1) Table 5(iii)', 'Other interest', 10, { kind: 'AGGREGATE', amount: 10000 }),
    r('1023', '393(1) Table 6(i)(a)', 'Contractor, individual or HUF', 1, { kind: 'SINGLE_OR_AGGREGATE', single: 30000, aggregate: 100000 }),
    r('1024', '393(1) Table 6(i)(b)', 'Contractor, others', 2, { kind: 'SINGLE_OR_AGGREGATE', single: 30000, aggregate: 100000 }),
    r('1026', '393(1) Table 6(iii)(a)', 'Technical services, film royalty, call centre', 2, { kind: 'AGGREGATE', amount: 50000 }),
    r('1027', '393(1) Table 6(iii)(b)', 'Professional services, royalty and others', 10, { kind: 'AGGREGATE', amount: 50000 }),
    // Protean's code list puts 1028 at Sl. No. 6(iii), column D (b), together with 1027.
    r('1028', '393(1) Table 6(iii)(b)', 'Director’s fees or commission', 10, { kind: 'NONE' }),
    r('1029', '393(1) Table 7', 'Dividend', 10, { kind: 'NOT_CHECKED', reason: 'No threshold, except non-cash dividends to an individual up to Rs 10,000 a year (393(4) Table 10(f)).' }),
    r('1030', '393(1) Table 8(i)', 'Life insurance payout', 2, { kind: 'AGGREGATE', amount: 100000 }),
    r('1031', '393(1) Table 8(ii)', 'Purchase of goods', 0.1, { kind: 'EXCESS_ONLY', amount: 5000000 }),
    r('1033', '393(1) Table 8(iv)', 'Business perquisite', 10, { kind: 'AGGREGATE', amount: 20000 }),
    r('1034', '393(1) Table 8(iv)', 'Business perquisite in kind', 10, { kind: 'AGGREGATE', amount: 20000 }),
    r('1035', '393(1) Table 8(v)', 'E-commerce operator to participant', 0.1, { kind: 'NOT_CHECKED', reason: 'Small individual participants are exempt under 393(4) Table 11.' }),
    r('1037', '393(1) Table 8(vi)', 'Virtual digital asset', 1, { kind: 'NOT_CHECKED', reason: 'Threshold (Rs 10,000 or Rs 50,000) turns on who pays (393(4) Table 12).' }),
    r('1038', '393(1) Table 8(vi)', 'Virtual digital asset in kind', 1, { kind: 'NOT_CHECKED', reason: 'Threshold turns on who pays.' }),
    r('1058', '393(3) Table 1', 'Lottery, crossword, card game and betting winnings', 30, { kind: 'SINGLE', amount: 10000 }),
    r('1059', '393(3) Table 1', 'Winnings in kind', 30, { kind: 'SINGLE', amount: 10000 }),
    r('1060', '393(3) Table 2', 'Online game winnings', 30, { kind: 'NONE' }),
    r('1061', '393(3) Table 2', 'Online game winnings in kind', 30, { kind: 'NONE' }),
    r('1062', '393(3) Table 3', 'Horse race winnings', 30, { kind: 'SINGLE', amount: 10000 }),
    r('1063', '393(3) Table 4', 'Commission on lottery tickets', 2, { kind: 'AGGREGATE', amount: 20000 }),
    r('1064', '393(3) Table 5(a)', 'Cash withdrawal, co-operative society', 2, { kind: 'EXCESS_ONLY', amount: 30000000 }),
    r('1065', '393(3) Table 5(b)', 'Cash withdrawal, others', 2, { kind: 'EXCESS_ONLY', amount: 10000000 }),
    r('1066', '393(3) Table 6', 'National Savings Scheme withdrawal', 10, { kind: 'AGGREGATE', amount: 2500 }),
    r('1067', '393(3) Table 7', 'Partner’s salary, commission, bonus or interest', 10, { kind: 'AGGREGATE', amount: 20000 }),
  ].map((x) => [x.code, x]),
);

export function rateFor(code: string, payeePan: string): number | null {
  const rule = RATES_2025[code];
  if (!rule) return null;
  return typeof rule.rate === 'function' ? rule.rate(/^[A-Z]{3}C/.test(payeePan.toUpperCase())) : rule.rate;
}

export interface RateCheckRow {
  id: string;
  pan: string;
  name: string;
  sectionCode: string;
  paidOn: string;
  amountPaid: string;
  taxDeducted: string;
  reasonCode?: string | null;
}

export interface RateFinding {
  rowId: string;
  name: string;
  pan: string;
  sectionCode: string;
  kind: 'SHORT_RATE' | 'NOT_DEDUCTED' | 'THRESHOLD_CLAIM_WRONG';
  amountPaid: string;
  deducted: string;
  expected: string;
  shortBy: string;
  message: string;
}

const NO_PAN = new Set(['PANNOTAVBL', 'PANAPPLIED', 'PANINVALID']);
/** Flags that explain a lower or nil deduction; such rows are judged by their flag, not the rate. */
const EXPLAINED = new Set(['A', 'B', 'C', 'D', 'E', 'N', 'O', 'P', 'Q', 'S', 'T', 'Z']);

/**
 * Rate and threshold checks for one TAN's rows in one tax year (Form 140 codes). Rows without a
 * PAN are left to the higher-rate check; rows with an explaining flag are not re-judged here,
 * except flag Y (below threshold), which is checked against the year's payments.
 */
export function checkRates(rows: RateCheckRow[]): RateFinding[] {
  const out: RateFinding[] = [];
  const yearTotal = new Map<string, Decimal>();
  for (const row of rows) {
    const key = `${row.pan}|${row.sectionCode}`;
    yearTotal.set(key, (yearTotal.get(key) ?? new Decimal(0)).add(row.amountPaid || 0));
  }
  for (const row of rows) {
    const rule = RATES_2025[row.sectionCode];
    if (!rule || NO_PAN.has(row.pan.toUpperCase())) continue;
    const flag = (row.reasonCode ?? '').toUpperCase();
    if (EXPLAINED.has(flag)) continue;
    const paid = new Decimal(row.amountPaid || 0);
    const ded = new Decimal(row.taxDeducted || 0);
    const rate = rateFor(row.sectionCode, row.pan)!;
    const total = yearTotal.get(`${row.pan}|${row.sectionCode}`)!;
    const t = rule.threshold;
    const crossed =
      t.kind === 'NONE' ? true
      : t.kind === 'AGGREGATE' ? total.gt(t.amount)
      : t.kind === 'SINGLE' ? paid.gt(t.amount)
      : t.kind === 'MONTHLY' ? paid.gt(t.amount)
      : t.kind === 'SINGLE_OR_AGGREGATE' ? paid.gt(t.single) || total.gt(t.aggregate)
      : null; // EXCESS_ONLY and NOT_CHECKED: rate only, when tax was deducted
    const expected = paid.mul(rate).div(100);
    const base = { rowId: row.id, name: row.name, pan: row.pan, sectionCode: row.sectionCode, amountPaid: paid.toFixed(2), deducted: ded.toFixed(2), expected: expected.toFixed(2) };

    if (flag === 'Y') {
      if (crossed === true && t.kind !== 'NONE') {
        out.push({ ...base, kind: 'THRESHOLD_CLAIM_WRONG', shortBy: expected.sub(ded).toFixed(2), message: `Marked below the threshold, but payments under ${row.sectionCode} this year come to Rs ${total.toFixed(0)}.` });
      }
      continue;
    }
    if (ded.isZero()) {
      if (crossed === true) out.push({ ...base, kind: 'NOT_DEDUCTED', shortBy: expected.toFixed(2), message: `No tax deducted and no reason given; ${rate}% applies.` });
      continue;
    }
    // Rounding to the rupee is allowed; anything more is short.
    if (crossed !== false && ded.lt(expected.sub(1)) && t.kind !== 'EXCESS_ONLY') {
      out.push({ ...base, kind: 'SHORT_RATE', shortBy: expected.sub(ded).toFixed(2), message: `Deducted at ${ded.div(paid).mul(100).toFixed(2)}%; ${rule.section} needs ${rate}%.` });
    }
  }
  return out;
}
