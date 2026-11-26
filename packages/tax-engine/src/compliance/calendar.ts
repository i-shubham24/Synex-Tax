/**
 * Statutory calendar. Pure functions over ISO dates (YYYY-MM-DD), computed in UTC so
 * results never shift with the server or browser time zone.
 */

export type IsoDate = string;

const toMs = (d: IsoDate) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const fromMs = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');

export function makeDate(year: number, month: number, day: number): IsoDate {
  // month is 1-based; normalise overflow (e.g. month 13)
  return fromMs(Date.UTC(year, month - 1, day));
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return fromMs(toMs(d) + n * 86_400_000);
}

export function addYears(d: IsoDate, n: number): IsoDate {
  const y = Number(d.slice(0, 4)) + n;
  const m = Number(d.slice(5, 7));
  const day = Number(d.slice(8, 10));
  // 29 Feb rolls to 28 Feb in non-leap years
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(Math.min(day, last))}`;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toMs(to) - toMs(from)) / 86_400_000);
}

/** Indian financial year / tax year (April to March) start year for a date. */
export function taxYearStart(d: IsoDate): number {
  const y = Number(d.slice(0, 4));
  return Number(d.slice(5, 7)) >= 4 ? y : y - 1;
}

export function taxYearEnd(d: IsoDate): IsoDate {
  return `${taxYearStart(d) + 1}-03-31`;
}

/* ---------------------------------------------------------------- GST */

export type GstCadence = 'MONTHLY' | 'QRMP';
export type GstReturnType = 'GSTR1' | 'IFF' | 'GSTR3B' | 'PMT06';

// QRMP GSTR-3B: 22nd for these states/UTs, 24th for all others (Punjab, 03, files on the 24th).
const QRMP_3B_22ND = new Set(['22', '23', '24', '26', '27', '29', '30', '31', '32', '33', '34', '35', '36', '37']);

/**
 * Due date for a GST return.
 * @param period YYYY-MM of the tax period (for QRMP GSTR-1/3B, the quarter's last month)
 */
export function gstDueDate(type: GstReturnType, period: string, cadence: GstCadence, stateCode: string): IsoDate {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7));
  if (type === 'IFF') return makeDate(y, m + 1, 13);
  if (type === 'PMT06') return makeDate(y, m + 1, 25);
  if (type === 'GSTR1') return makeDate(y, m + 1, cadence === 'QRMP' ? 13 : 11);
  if (cadence === 'MONTHLY') return makeDate(y, m + 1, 20);
  return makeDate(y, m + 1, QRMP_3B_22ND.has(stateCode) ? 22 : 24);
}

/**
 * Sections 37(5), 39(11), 44(2), 52(13) CGST: a return cannot be filed after three years
 * from its due date. The portal enforces this from the July 2025 tax period.
 */
export function gstReturnBarDate(dueDate: IsoDate): IsoDate {
  return addYears(dueDate, 3);
}

export type ExpiryLevel = 'BARRED' | 'CRITICAL' | 'WATCH' | 'OK';

export function gstReturnExpiry(dueDate: IsoDate, today: IsoDate, criticalDays = 90) {
  const barDate = gstReturnBarDate(dueDate);
  const daysLeft = daysBetween(today, barDate);
  const level: ExpiryLevel = daysLeft < 0 ? 'BARRED' : daysLeft <= criticalDays ? 'CRITICAL' : daysLeft <= criticalDays * 2 ? 'WATCH' : 'OK';
  return { barDate, daysLeft, level };
}

/* ---------------------------------------------------------------- TDS */

export type StatutoryRegime = 'IT_ACT_1961' | 'IT_ACT_2025';
export const REGIME_CUTOVER: IsoDate = '2026-04-01';

/** Transactions dated on or before 31 Mar 2026 belong to the 1961 Act; from 1 Apr 2026 to the 2025 Act. */
export function regimeFor(transactionDate: IsoDate): StatutoryRegime {
  return transactionDate < REGIME_CUTOVER ? 'IT_ACT_1961' : 'IT_ACT_2025';
}

export type TdsForm = '24Q' | '26Q' | '27Q' | '27EQ' | '138' | '140' | '143' | '144';

export const FORM_REGIME: Record<TdsForm, StatutoryRegime> = {
  '24Q': 'IT_ACT_1961', '26Q': 'IT_ACT_1961', '27Q': 'IT_ACT_1961', '27EQ': 'IT_ACT_1961',
  '138': 'IT_ACT_2025', '140': 'IT_ACT_2025', '143': 'IT_ACT_2025', '144': 'IT_ACT_2025',
};

/**
 * Quarterly statement due date. Rule 219(4) (2026 Rules) puts every form on the 31st;
 * legacy Form 27EQ (TCS) stayed on the 15th.
 * @param fyStart start year of the FY / Tax Year (2026 for TY 2026-27)
 */
export function tdsStatementDueDate(form: TdsForm, fyStart: number, quarter: 1 | 2 | 3 | 4): IsoDate {
  const day = form === '27EQ' ? 15 : 31;
  switch (quarter) {
    case 1:
      return makeDate(fyStart, 7, day);
    case 2:
      return makeDate(fyStart, 10, day);
    case 3:
      return makeDate(fyStart + 1, 1, day);
    default:
      return makeDate(fyStart + 1, 5, day);
  }
}

/**
 * Section 397(3)(f), Income-tax Act 2025: a correction statement may be delivered only within
 * two years from the end of the tax year in which the original statement was due. Applied to
 * legacy 1961-Act statements too from 1 Apr 2026.
 * Anchor: the tax year containing the original due date (FY 2025-26 Q4, due 31 May 2026,
 * corrects until 31 Mar 2029). Confirm edge cases with the CA advisor before relying on them.
 */
export function tdsCorrectionDeadline(originalDueDate: IsoDate): IsoDate {
  return `${taxYearStart(originalDueDate) + 3}-03-31`;
}

/** Section 427 (2025 Act) / 234E (1961 Act): Rs 200 per day of default, capped at the TDS/TCS amount. */
export function lateFilingFee(dueDate: IsoDate, filedOn: IsoDate, taxDeductedOrCollected: number): number {
  const days = daysBetween(dueDate, filedOn);
  if (days <= 0) return 0;
  return Math.min(200 * days, Math.max(0, taxDeductedOrCollected));
}
