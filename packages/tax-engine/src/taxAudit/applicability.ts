/**
 * Whether a tax audit under section 44AB of the Income-tax Act, 1961 is required for the previous
 * year 2025-26 (assessment year 2026-27), and which clause of section 44AB applies (Form 3CD,
 * clause 8). Sources:
 *
 *  - Section 44AB(a): business turnover above Rs 1 crore; first proviso: Rs 10 crore where cash
 *    receipts and cash payments are each not more than 5% of all receipts and all payments; second
 *    proviso: a cheque or draft that is not account payee counts as cash.
 *  - Section 44AB(b): gross receipts of profession above Rs 50 lakh.
 *  - Section 44AB(c): income claimed lower than deemed under section 44AE, 44BB or 44BBB.
 *  - Section 44AB(d): income claimed lower than deemed under section 44ADA, and income above the
 *    maximum amount not chargeable to tax.
 *  - Section 44AB(e): section 44AD(4) applies and income is above the maximum amount not chargeable.
 *  - Proviso to section 44AB: no audit for a person declaring profits under section 44AD(1).
 *  - Limits for 44AD and 44ADA, as the Department applies them for AY 2026-27: ITR-3 validation rules
 *    V1.0 (AY 2026-27) rules 134, 135, 137 and 138, and the ITR-3 "defective" checks 6 to 8: 44AD
 *    turnover above Rs 2 crore with cash receipts above 5%, or above Rs 3 crore, needs an audit;
 *    44ADA receipts above Rs 50 lakh with cash receipts above 5%, or above Rs 75 lakh, need an audit.
 *  - Presumptive rates: section 44AD(1) and its proviso (6% of turnover received by banking channels,
 *    8% of the rest); section 44ADA(1) (50% of gross receipts).
 *  - Form: rule 6G(1)(a) of the Income-tax Rules, 1962 (Form 3CA where the accounts are audited under
 *    any other law) and rule 6G(1)(b) (Form 3CB otherwise); headings of Forms 3CA and 3CB.
 *
 * Not covered: the 44AB proviso for income under sections 44B and 44BBA, and who may use 44AD or
 * 44ADA (residence, kind of person, specified professions). The auditor decides those.
 */

export type Clause8Code = '44ABa' | '44ABAA' | '44ABb' | '44ABci' | '44ABcii' | '44ABciii' | '44ABd' | '44ABe' | '44AB3';

export interface ApplicabilityInput {
  business?: {
    /** Total sales, turnover or gross receipts of business in the previous year. */
    turnover: number;
    /** All amounts received in the year (sales and any other receipt) and the part in cash, a non account payee cheque or draft counting as cash. */
    totalReceipts?: number;
    cashReceipts?: number;
    /** All payments made in the year (expenditure included) and the part in cash. */
    totalPayments?: number;
    cashPayments?: number;
    /** Profits declared under section 44AD(1). digitalTurnover is the part received by account payee cheque, draft or electronic means. */
    presumptive44AD?: { declaredIncome: number; digitalTurnover: number };
    /** Section 44AD(4) applies: 44AD was used for an earlier year and profits are not declared under it now, within the five years. */
    section44AD4Applies?: boolean;
    lowerThanDeemed44AE?: boolean;
    lowerThanDeemed44BB?: boolean;
    lowerThanDeemed44BBB?: boolean;
  };
  profession?: {
    grossReceipts: number;
    cashReceipts?: number;
    /** Income claimed under section 44ADA. */
    presumptive44ADA?: { declaredIncome: number };
  };
  /** Total income is above the maximum amount not chargeable to tax. Needed for clauses (d) and (e). */
  incomeAboveExemption?: boolean;
  /** The accounts are audited under any other law (Companies Act, co-operative societies law and so on). */
  auditedUnderOtherLaw?: boolean;
}

export interface ApplicabilityFinding {
  clause?: Clause8Code;
  outcome: 'REQUIRED' | 'NOT_REQUIRED' | 'NEEDS_INPUT' | 'NOTE';
  message: string;
  source: string;
}

export interface ApplicabilityResult {
  /** null when the answer depends on figures not given. */
  required: boolean | null;
  clauses: Clause8Code[];
  /** The form of report under rule 6G(1), when an audit is required. */
  form: '3CA' | '3CB' | null;
  findings: ApplicabilityFinding[];
  missing: string[];
}

const CRORE = 1_00_00_000;
const LAKH = 1_00_000;
const pctOk = (part: number | undefined, whole: number | undefined) => (part === undefined || whole === undefined ? null : whole <= 0 ? part <= 0 : part * 100 <= whole * 5);
const rs = (v: number) => `Rs ${v.toLocaleString('en-IN')}`;

export function taxAuditApplicability(i: ApplicabilityInput): ApplicabilityResult {
  const findings: ApplicabilityFinding[] = [];
  const missing: string[] = [];
  const clauses: Clause8Code[] = [];
  let unknown = false;
  const need = (clause: Clause8Code, message: string, source: string) => {
    if (!clauses.includes(clause)) clauses.push(clause);
    findings.push({ clause, outcome: 'REQUIRED', message, source });
  };

  const b = i.business;
  if (b) {
    const t = Math.max(0, b.turnover);
    const cashRecOk = pctOk(b.cashReceipts, b.totalReceipts);
    const cashPayOk = pctOk(b.cashPayments, b.totalPayments);
    let under44AD = false;
    if (b.presumptive44AD) {
      // ITR-3 validation rules 135 and 138 (AY 2026-27): 44AD up to Rs 2 crore, or Rs 3 crore where cash receipts are not more than 5%.
      const limit = cashRecOk === true ? 3 * CRORE : 2 * CRORE;
      if (t > 3 * CRORE || (t > 2 * CRORE && cashRecOk !== true)) {
        if (t <= 3 * CRORE && cashRecOk === null) {
          unknown = true;
          missing.push('business.cashReceipts');
          findings.push({ outcome: 'NEEDS_INPUT', message: 'Turnover is between Rs 2 crore and Rs 3 crore: section 44AD is available only if cash receipts are not more than 5% of all receipts. Enter total and cash receipts.', source: 'Section 44AD(1); ITR-3 validation rules 135 and 138, AY 2026-27' });
        } else {
          findings.push({ outcome: 'NOTE', message: `Turnover of ${rs(t)} is above the ${rs(limit)} limit for section 44AD, so profits cannot be declared under it; section 44AB(a) is checked instead.`, source: 'Section 44AD(1); ITR-3 validation rules 135 and 138, AY 2026-27' });
        }
      } else {
        // Section 44AD(1) and proviso: 6% of turnover received by banking channels, 8% of the rest.
        const digital = Math.min(Math.max(0, b.presumptive44AD.digitalTurnover), t);
        const deemed = Math.ceil(digital * 0.06 + (t - digital) * 0.08);
        if (b.presumptive44AD.declaredIncome >= deemed) {
          under44AD = true;
          findings.push({ outcome: 'NOT_REQUIRED', message: `Profits of Rs ${b.presumptive44AD.declaredIncome} are declared under section 44AD (at least Rs ${deemed}, 6% and 8% of turnover). The business needs no audit under section 44AB.`, source: 'Proviso to section 44AB; section 44AD(1)' });
        } else {
          findings.push({ outcome: 'NOTE', message: `Declared profits of Rs ${b.presumptive44AD.declaredIncome} are below Rs ${deemed} (6% and 8% of turnover), so they are not declared under section 44AD(1).`, source: 'Section 44AD(1) and proviso' });
        }
      }
    }
    if (!under44AD) {
      if (t > 10 * CRORE) {
        need(cashRecOk === true && cashPayOk === true ? '44ABAA' : '44ABa', `Turnover of ${rs(t)} is above Rs 10 crore.`, 'Section 44AB(a) and first proviso');
      } else if (t > CRORE) {
        if (cashRecOk === false || cashPayOk === false) {
          need('44ABa', `Turnover of ${rs(t)} is above Rs 1 crore and cash ${cashRecOk === false ? 'receipts' : 'payments'} are more than 5% of the total.`, 'Section 44AB(a); ITR-3 validation rules 28 to 30, AY 2026-27');
        } else if (cashRecOk === null || cashPayOk === null) {
          unknown = true;
          if (cashRecOk === null) missing.push('business.cashReceipts');
          if (cashPayOk === null) missing.push('business.cashPayments');
          findings.push({ outcome: 'NEEDS_INPUT', message: `Turnover of ${rs(t)} is above Rs 1 crore. The limit is Rs 10 crore only if cash receipts and cash payments are each not more than 5% of the total; enter both.`, source: 'Section 44AB(a), first and second provisos' });
        } else {
          findings.push({ outcome: 'NOT_REQUIRED', message: `Turnover of ${rs(t)} is within Rs 10 crore and cash receipts and payments are each not more than 5%.`, source: 'Section 44AB(a), first proviso' });
        }
      } else {
        findings.push({ outcome: 'NOT_REQUIRED', message: `Turnover of ${rs(t)} is not above Rs 1 crore.`, source: 'Section 44AB(a)' });
      }
    }
    if (b.lowerThanDeemed44AE) need('44ABci', 'Income from goods carriages is claimed lower than deemed under section 44AE.', 'Section 44AB(c)');
    if (b.lowerThanDeemed44BB) need('44ABcii', 'Income is claimed lower than deemed under section 44BB.', 'Section 44AB(c)');
    if (b.lowerThanDeemed44BBB) need('44ABciii', 'Income is claimed lower than deemed under section 44BBB.', 'Section 44AB(c)');
    if (b.section44AD4Applies) {
      if (i.incomeAboveExemption === undefined) {
        unknown = true;
        missing.push('incomeAboveExemption');
        findings.push({ outcome: 'NEEDS_INPUT', message: 'Section 44AD(4) applies: an audit is required if total income is above the maximum amount not chargeable to tax. Say whether it is.', source: 'Section 44AB(e); section 44AD(5)' });
      } else if (i.incomeAboveExemption) need('44ABe', 'Section 44AD(4) applies and income is above the maximum amount not chargeable to tax.', 'Section 44AB(e); section 44AD(5)');
      else findings.push({ outcome: 'NOT_REQUIRED', message: 'Section 44AD(4) applies, but income is not above the maximum amount not chargeable to tax.', source: 'Section 44AB(e)' });
    }
  }

  const p = i.profession;
  if (p) {
    const g = Math.max(0, p.grossReceipts);
    const cashOk = pctOk(p.cashReceipts, g);
    let done = false;
    if (p.presumptive44ADA) {
      // Section 44ADA(1): up to Rs 50 lakh, or Rs 75 lakh where cash receipts are not more than 5%; ITR-3 validation rules 134 and 137.
      if (g > 50 * LAKH && g <= 75 * LAKH && cashOk === null) {
        unknown = true;
        done = true;
        missing.push('profession.cashReceipts');
        findings.push({ outcome: 'NEEDS_INPUT', message: 'Receipts are between Rs 50 lakh and Rs 75 lakh: section 44ADA is available only if cash receipts are not more than 5%. Enter cash receipts.', source: 'Section 44ADA(1); ITR-3 validation rules 134 and 137, AY 2026-27' });
      } else if (g > 75 * LAKH || (g > 50 * LAKH && !cashOk)) {
        findings.push({ outcome: 'NOTE', message: `Receipts of ${rs(g)} are above the limit for section 44ADA; section 44AB(b) is checked instead.`, source: 'Section 44ADA(1); ITR-3 validation rules 134 and 137, AY 2026-27' });
      } else {
        done = true;
        const deemed = Math.ceil(g * 0.5);
        if (p.presumptive44ADA.declaredIncome >= deemed) {
          findings.push({ outcome: 'NOT_REQUIRED', message: `Income of Rs ${p.presumptive44ADA.declaredIncome} is declared under section 44ADA (at least 50% of receipts).`, source: 'Section 44ADA(1); ITR-3 validation rules 134 and 137, AY 2026-27' });
        } else if (i.incomeAboveExemption === undefined) {
          unknown = true;
          missing.push('incomeAboveExemption');
          findings.push({ outcome: 'NEEDS_INPUT', message: `Income is claimed below Rs ${deemed} (50% of receipts): an audit is required if total income is above the maximum amount not chargeable to tax. Say whether it is.`, source: 'Section 44AB(d)' });
        } else if (i.incomeAboveExemption) need('44ABd', `Income is claimed below Rs ${deemed} (50% of receipts under section 44ADA) and total income is above the maximum amount not chargeable to tax.`, 'Section 44AB(d); ITR-3 defective-return check 8, AY 2026-27');
        else findings.push({ outcome: 'NOT_REQUIRED', message: 'Income is claimed below 50% of receipts, but total income is not above the maximum amount not chargeable to tax.', source: 'Section 44AB(d)' });
      }
    }
    if (!done) {
      if (g > 50 * LAKH) need('44ABb', `Gross receipts of profession of ${rs(g)} are above Rs 50 lakh.`, 'Section 44AB(b)');
      else findings.push({ outcome: 'NOT_REQUIRED', message: `Gross receipts of profession of ${rs(g)} are not above Rs 50 lakh.`, source: 'Section 44AB(b)' });
    }
  }

  if (!b && !p) {
    unknown = true;
    missing.push('business or profession');
  }
  const required = clauses.length ? true : unknown ? null : false;
  if (required) {
    findings.push(i.auditedUnderOtherLaw
      ? { outcome: 'NOTE', message: 'The accounts are audited under another law: the report is Form 3CA with Form 3CD.', source: 'Rule 6G(1)(a); third proviso to section 44AB' }
      : { outcome: 'NOTE', message: 'The accounts are not audited under another law: the report is Form 3CB with Form 3CD.', source: 'Rule 6G(1)(b)' });
  }
  return { required, clauses, form: required ? (i.auditedUnderOtherLaw ? '3CA' : '3CB') : null, findings, missing: [...new Set(missing)] };
}
