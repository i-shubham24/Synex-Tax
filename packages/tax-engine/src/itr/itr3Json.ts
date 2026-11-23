import { NEW_SLABS, oldSlabs, type AgeBand } from '../tds/salary.js';
import {
  ageBandFromDob, address, assesseeName, bankRow, clean, commonChecks, creationInfo, deduction80D, interestAndFee, n0, returnSection, revisedFields, sum, tanIssues,
  type Deduction80DInput, type ItrBank, type ItrFiling, type ItrIssue, type ItrOtherTds, type ItrPerson, type ItrTaxPayment, type ItrTcs,
} from './itrCommon.js';
import { specialRateTax } from './specialRateTax.js';
import { cgGain, type CgSale, type Itr2Employer, type Itr2Property } from './itr2Json.js';
import { presumptiveIncome, ITR4_CODES_44ADA, ITR4_CODES_44AE, type GoodsCarriage, type PresumptiveReceipts } from './itr4Json.js';

/**
 * ITR-3 JSON for Assessment Year 2026-27 (income of 2025-26), to the Income Tax Department's schema
 * ITR-3_2026_Main_V1.1 (release of 30 Jun 2026, kept in packages/tax-engine/schemas/itr; every test
 * output is validated against it). Arithmetic links between schedules follow the Department's ITR-3
 * validation rules for AY 2026-27 (version 1.0 of 18 Jun 2026); rule numbers are cited below.
 *
 * Covered, for a resident individual or HUF whose accounts need no tax audit, with total income up to
 * Rs 50 lakh:
 * - business or profession income from regular books: a summary trading account and profit and loss
 *   account (Part A-Trading, Part A-P&L) under the schema's main expense heads, a balance sheet (Part
 *   A-BS, checked to balance, rule 52), depreciation under section 32 by block (Schedules DPM, DOA,
 *   DEP) in place of the depreciation in the books, and Schedule BP worked from these (rules 237 to 269);
 * - presumptive income under section 44AD, 44ADA or 44AE (Part A-P&L items 61 to 63), with the
 *   "no accounts case" balance sheet particulars (rule 283);
 * - salary, house property, capital gains, other sources, set-off and carry forward, Chapter VI-A,
 *   tax, interest and fee, worked as the ITR-2 writer does.
 *
 * Not covered, reported as issues: a case liable to tax audit under section 44AB (the tax audit forms
 * come first), a business loss (set-off under section 71 and carry forward under section 72), partners'
 * share from firms (Schedule IF), speculative or specified business, intraday and F&O trading,
 * disallowances and deemed income under sections 36 to 43B (Part A-OI), section 50 cases where a block
 * of assets ceases or its sale value exceeds its written down value, total income above Rs 50 lakh
 * (surcharge; Schedule AL is required above Rs 1 crore, rule 905), sale of land or building, losses of
 * earlier years, directors and holders of unlisted shares, foreign assets and income, non-residents.
 */

/**
 * Due date under section 139(1) for a return without audit: the schema's ItrFilingDueDate takes only
 * 31 Aug, 31 Oct and 30 Nov 2026, and validation rules 26 and 27 keep 31 Oct and 30 Nov for audit,
 * Schedule IF and Schedule 5A cases.
 */
export const ITR3_DUE_DATE = '2026-08-31';

/** Depreciation blocks (Appendix I to the Income-tax Rules, rule 5): rate in per cent. */
export const DEP_BLOCKS = {
  PM15: 15, // plant and machinery, general rate
  PM30: 30, // plant and machinery at 30% (for example motor lorries used in a business of running them on hire)
  PM40: 40, // plant and machinery at 40% (for example computers including software)
  BLDG5: 5, // buildings mainly used for residence
  BLDG10: 10, // other buildings
  BLDG40: 40, // purely temporary erections
  FURN10: 10, // furniture and fittings
  INTANG25: 25, // know-how, patents, copyrights, trademarks, licences and similar
} as const;
export type DepBlockKind = keyof typeof DEP_BLOCKS;

export interface DepBlock {
  block: DepBlockKind;
  /** Written down value on 1 Apr 2025. */
  wdvOpening: number;
  /** Bought and put to use for 180 days or more in the year. */
  additionsFull?: number;
  /** Bought and put to use for less than 180 days: half the rate (second proviso to section 32(1)(ii)). */
  additionsHalf?: number;
  /** Sale value of assets of the block sold in the year (out of the opening value or full-rate additions). */
  realisation?: number;
}

export interface Itr3Books {
  kind: 'BUSINESS' | 'PROFESSION';
  trading: { salesGoods?: number; salesServices?: number; professionReceipts?: number; openingStock?: number; purchases?: number; directExpenses?: number; closingStock?: number };
  /** Other income of the business credited to the profit and loss account. Income of other heads (for example bank interest) is entered under those heads, not here. */
  otherIncome?: number;
  expenses?: {
    freight?: number; consumables?: number; powerFuel?: number; rent?: number; repairsBuilding?: number; repairsMachinery?: number;
    salaries?: number; bonus?: number; providentFund?: number; staffWelfare?: number; insurance?: number;
    salesPromotion?: number; advertisement?: number; commission?: number; professionalFees?: number; hotel?: number; travel?: number; conveyance?: number; telephone?: number;
    ratesTaxes?: number; auditFee?: number; interest?: number; other?: { nature: string; amount: number }[];
  };
  /** Depreciation debited in the books; replaced by depreciation under the Act (Schedule BP items 11 and 12). */
  bookDepreciation?: number;
  depreciation?: DepBlock[];
  balanceSheet: {
    capital: number; reserves?: number;
    securedLoansBank?: number; securedLoansOthers?: number; unsecuredLoansBank?: number; unsecuredLoansOthers?: number; advances?: number;
    grossBlock?: number; accumulatedDepreciation?: number; capitalWip?: number; investmentsLongTerm?: number; investmentsTrade?: number;
    stock?: number; debtors?: number; cashInHand?: number; bank?: number; otherCurrentAssets?: number; loansAdvances?: number; deposits?: number;
    creditors?: number; provisions?: number;
  };
  /** Section 44AB(a) proviso: cash receipts and cash payments each not above 5% of the totals. */
  cashReceiptsWithin5Pct?: boolean;
  cashPaymentsWithin5Pct?: boolean;
}

export interface Itr3Input {
  softwareId: string;
  createdOn: string;
  intermediaryCity: string;
  /** For a HUF, surname is the HUF's name, dob its date of formation and karta the person who verifies. */
  person: ItrPerson;
  status: 'I' | 'H';
  karta?: { name: string; pan: string };
  filing: ItrFiling & { form10IEA?: { assessmentYear: '2024-25' | '2025-26' | '2026-27'; ack: string; date?: string } };
  flags?: {
    partnerInFirm?: boolean; director?: boolean; unlistedShares?: boolean; foreignAssets?: boolean; landOrBuildingSold?: boolean; lossesBroughtForward?: boolean;
    speculativeOrFnO?: boolean; disallowances?: boolean;
    /** Section 44AD(4): opted out of 44AD within five years of opting in. */
    optedOut44AD?: boolean;
  };
  business: {
    natures: { code: string; tradeName?: string }[];
    ad?: PresumptiveReceipts;
    ada?: PresumptiveReceipts;
    ae?: { code: string; name: string; vehicles: GoodsCarriage[] };
    /** "No accounts case" balance sheet particulars (Part A-BS item 6) when no regular books are kept. */
    noAccounts?: { debtors: number; creditors: number; stock: number; cash: number };
    books?: Itr3Books;
    /** Whether section 44AA requires books (Part A-GEN item for 44AA). Left out: yes when regular books are entered, no otherwise. */
    liable44AA?: boolean;
  };
  salary?: { professionalTax?: number; employers: Itr2Employer[] };
  houses?: Itr2Property[];
  capitalGains?: CgSale[];
  otherSources?: { savingsInterest?: number; depositInterest?: number; refundInterest?: number; dividends?: number; other?: number; otherDescription?: string };
  deductions?: { section80C?: { amount: number; id: string }[]; section80CCD1B?: number; section80D?: Deduction80DInput };
  tdsOther?: ItrOtherTds[];
  tcs?: ItrTcs[];
  taxPayments?: ItrTaxPayment[];
  interest234C?: number;
  bank: ItrBank;
}

const PERIODS = [['Upto15Of6', '06-15'], ['Upto15Of9', '09-15'], ['Up16Of9To15Of12', '12-15'], ['Up16Of12To15Of3', '03-15'], ['Up16Of3To31Of3', '03-31']] as const;
const periodOf = (date: string) => {
  const md = date.slice(5);
  if (date.slice(0, 4) === '2025') return md <= '06-15' ? 0 : md <= '09-15' ? 1 : md <= '12-15' ? 2 : 3;
  return md <= '03-15' ? 3 : 4;
};
const OS_PERIODS = ['Upto15Of6', 'Up16Of6To15Of9', 'Up16Of9To15Of12', 'Up16Of12To15Of3', 'Up16Of3To31Of3'];
/** Schedule OS quarters use other key names than Schedule CG (DateRangeTypeOS). */
const zeroRangeOS = () => ({ DateRange: Object.fromEntries(OS_PERIODS.map((k) => [k, 0])) as Record<string, number> });
const zeroRange = () => ({ DateRange: Object.fromEntries(PERIODS.map(([k]) => [k, 0])) as Record<string, number> });
function spread(income: number, gainsByPeriod: number[]) {
  const r = zeroRange();
  let left = income;
  gainsByPeriod.forEach((g, k) => { const t = Math.min(left, Math.max(0, g)); r.DateRange[PERIODS[k][0]] = t; left -= t; });
  if (left > 0) r.DateRange[PERIODS[4][0]] += left;
  return r;
}
const ded48 = (cost: number, improvement: number, expenses: number) => ({ AquisitCost: cost, ImproveCost: improvement, ExpOnTrans: expenses, TotalDedn: cost + improvement + expenses });

/**
 * Depreciation on one block under section 32(1)(ii): the rate on the opening value plus additions put to
 * use for 180 days or more, less sale value; half the rate on additions used for less than 180 days
 * (second proviso). Schedule DPM and DOA items 6 = 3+4-5, 9 = 7-8, 15 = 10+11, 21 = 6+9-15 (rules 304 to 308, 316 to 321).
 */
export function blockDepreciation(b: DepBlock) {
  const rate = DEP_BLOCKS[b.block];
  const opening = n0(b.wdvOpening), addFull = n0(b.additionsFull), addHalf = n0(b.additionsHalf), sold = n0(b.realisation);
  const fullBase = Math.max(0, opening + addFull - sold);
  const halfBase = addHalf;
  const atFull = Math.round((fullBase * rate) / 100);
  const atHalf = Math.round((halfBase * rate) / 200);
  const total = atFull + atHalf;
  return {
    rate, opening, addFull, addHalf, sold, fullBase, halfBase, atFull, atHalf, total, wdvClosing: fullBase + halfBase - total,
    detail: {
      WDVFirstDay: opening, AdditionsGrThan180Days: addFull, RealizationTotalPeriod: sold, FullRateDeprAmt: fullBase,
      AdditionsLessThan180Days: addHalf, RealizationPeriodLessThan180days: 0, HalfRateDeprAmt: halfBase,
      DepreciationAtFullRate: atFull, DepreciationAtHalfRate: atHalf, TotalDepreciation: total, DepDisAllowUs38_2: 0,
      NetAggregateDepreciation: total, ProportionateAggDepreciation: total, ExpdrOnTrforSaleAsset: 0, CapGainUs50: 0, WDVLastDay: fullBase + halfBase - total,
    },
  };
}

type Writer = { json: Record<string, unknown> | null; issues: ItrIssue[]; summary: Record<string, number> };

export function writeItr3(i: Itr3Input): Writer {
  const p = i.person;
  const huf = i.status === 'H';
  const regime = i.filing.regime;
  const old = regime === 'OLD';
  // commonChecks asks for an individual's PAN; a HUF's PAN has H as the fourth letter.
  const issues: ItrIssue[] = commonChecks({ softwareId: i.softwareId, createdOn: i.createdOn, person: p, filing: i.filing, bank: i.bank, dueDate: ITR3_DUE_DATE, form: 'ITR-3' })
    .filter((x) => !(huf && x.field === 'pan' && /fourth letter/.test(x.message)));
  const err = (field: string, message: string) => issues.push({ field, message });
  if (huf && /^[A-Z]{5}\d{4}[A-Z]$/.test(p.pan) && p.pan[3] !== 'H') err('pan', 'For a HUF the fourth letter of the PAN must be H.');
  if (huf && (!i.karta || !/^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/.test(i.karta.pan) || !clean(i.karta.name, 125))) err('karta', 'A HUF return is verified by the karta: give the karta name and individual PAN.');
  if (huf && i.salary?.employers.length) err('salary', 'A HUF has no salary income (validation rule 199).');
  if (huf && i.business.ada) err('ada', 'A HUF cannot declare income under section 44ADA (validation rule 130).');
  if (huf && (i.deductions?.section80D || i.deductions?.section80CCD1B)) err('deductions', 'This file writes 80D and 80CCD(1B) for individuals only; for a HUF give 80C only.');

  const f = i.flags ?? {};
  if (f.partnerInFirm) err('flags', "A partner's share of profit, salary and interest from a firm goes in Schedule IF, which this file does not write yet.");
  if (f.director || f.unlistedShares) err('flags', 'Directors and holders of unlisted shares must give company details in the return; this file does not write them yet.');
  if (f.foreignAssets) err('flags', 'Foreign assets and income (Schedules FA, FSI, TR) are not written by this file.');
  if (f.landOrBuildingSold) err('flags', 'Sale of land or building needs stamp value, buyer details and the indexation option for property bought before 23 July 2024; not written by this file.');
  if (f.lossesBroughtForward) err('flags', 'Losses and depreciation brought forward from earlier years (Schedule BFLA, CFL and UD) are not written by this file.');
  if (f.speculativeOrFnO) err('flags', 'Speculative business, intraday and futures and options trading are not written by this file.');
  if (f.disallowances) err('flags', 'Amounts disallowable under sections 36 to 43B and deemed income (Part A-OI) are not written by this file.');
  issues.push(...tanIssues([...(i.salary?.employers ?? []).filter((e) => e.tan).map((e) => ({ tan: e.tan! })), ...(i.tdsOther ?? []), ...(i.tcs ?? [])], 'tan'));
  const age: AgeBand = huf ? 'BELOW_60' : ageBandFromDob(p.dob);

  // Business or profession
  const b = i.business;
  const pi = presumptiveIncome({ ad: b.ad, ada: b.ada, ae: b.ae });
  const bk = b.books;
  const audit = (why: string) => err('audit', `${why} A tax audit under section 44AB applies: prepare Form 3CB and 3CD in the tax audit forms first. This ITR-3 file covers cases without audit only.`);
  if (!b.ad && !b.ada && !b.ae?.vehicles.length && !bk) err('business', 'ITR-3 is for income from business or profession (validation rule 303); with none, use ITR-1 or ITR-2.');
  if (b.ad) {
    if (pi.adTurnover <= 0) err('ad', 'Turnover under section 44AD is required.');
    // Rules 135 and 138: above Rs 3 crore, or above Rs 2 crore with cash receipts over 5%, audit under 44AB.
    if (pi.adTurnover > 30000000) audit(`Turnover under section 44AD of Rs ${pi.adTurnover} is above Rs 3 crore (validation rule 138).`);
    else if (pi.adTurnover > 20000000 && n0(b.ad.cash) + n0(b.ad.otherMode) > pi.adTurnover * 0.05) audit('Turnover under section 44AD is above Rs 2 crore and receipts other than by banking channels are above 5% (validation rule 135).');
    if (f.optedOut44AD) audit('Having opted out of section 44AD within five years, section 44AD(4) and (5) apply.');
  }
  if (b.ada) {
    if (pi.adaReceipts <= 0) err('ada', 'Gross receipts under section 44ADA are required.');
    if (!(ITR4_CODES_44ADA as readonly string[]).includes(b.ada.code)) err('ada', 'Profession code under section 44ADA must be one the schema lists (enum CodeADA).');
    // Rules 134 and 137: above Rs 75 lakh, or above Rs 50 lakh with cash receipts over 5%.
    if (pi.adaReceipts > 7500000) audit(`Receipts under section 44ADA of Rs ${pi.adaReceipts} are above Rs 75 lakh (validation rule 137).`);
    else if (pi.adaReceipts > 5000000 && n0(b.ada.cash) + n0(b.ada.otherMode) > pi.adaReceipts * 0.05) audit('Receipts under section 44ADA are above Rs 50 lakh and receipts other than by banking channels are above 5% (validation rule 134).');
  }
  if (b.ae) {
    // 44AE(1): not more than ten goods carriages; rule 117: months held add to 120 at most; rule 132: no repeated registration.
    if (b.ae.vehicles.length > 10) err('ae', 'Section 44AE applies only to an owner of not more than ten goods carriages.');
    if (!(ITR4_CODES_44AE as readonly string[]).includes(b.ae.code)) err('ae', 'Business code under section 44AE must be one the schema lists (enum CodeAE).');
    const regs = new Set<string>();
    for (const v of b.ae.vehicles) {
      if (v.months < 1 || v.months > 12 || !Number.isInteger(v.months)) err('ae', `${v.regNo}: months held must be 1 to 12.`);
      if (v.tonnage < 0 || v.tonnage > 100) err('ae', `${v.regNo}: tonnage must be up to 100.`);
      if (regs.has(v.regNo)) err('ae', `${v.regNo} is entered twice (validation rule 132).`);
      regs.add(v.regNo);
    }
  }
  if (pi.total > 0 && !bk && !b.noAccounts) err('noAccounts', 'With presumptive income, give the balance sheet particulars for the no accounts case: debtors, creditors, stock and cash (validation rule 283).');

  // Trading account and profit and loss account (regular books).
  const tr = bk?.trading ?? {};
  const goods = n0(tr.salesGoods), services = n0(tr.salesServices), profRcpt = n0(tr.professionReceipts);
  const salesTotal = goods + services; // 4A(iv)
  const revenue = salesTotal + profRcpt; // 4D = Aiv + B + Cix (rule 72); duties collected are taken as nil (turnover net of GST)
  const closing = n0(tr.closingStock), opening = n0(tr.openingStock), purchases = n0(tr.purchases), direct = n0(tr.directExpenses);
  const tradingCredit = revenue + closing; // item 6
  const grossProfit = tradingCredit - opening - purchases - direct; // item 12 = 6-7-8-9-10xii-11 (rule 75)
  const ex = bk?.expenses ?? {};
  const e = (v?: number) => n0(v);
  const empTotal = e(ex.salaries) + e(ex.bonus) + e(ex.providentFund);
  const otherRows = (ex.other ?? []).filter((r) => n0(r.amount) > 0);
  const otherTotal = sum(otherRows.map((r) => n0(r.amount)));
  const otherIncome = n0(bk?.otherIncome);
  const credits = grossProfit + otherIncome; // item 15 = 13 + 14xii (rule 82)
  const debitsBeforeInterest = e(ex.freight) + e(ex.consumables) + e(ex.powerFuel) + e(ex.rent) + e(ex.repairsBuilding) + e(ex.repairsMachinery) + empTotal + e(ex.insurance)
    + e(ex.staffWelfare) + e(ex.salesPromotion) + e(ex.advertisement) + e(ex.commission) + e(ex.professionalFees) + e(ex.hotel) + e(ex.travel) + e(ex.conveyance) + e(ex.telephone)
    + e(ex.ratesTaxes) + e(ex.auditFee) + otherTotal;
  const pbidta = credits - debitsBeforeInterest; // item 50 (rule 92)
  const interestExp = e(ex.interest);
  const bookDep = n0(bk?.bookDepreciation);
  const pbt = pbidta - interestExp - bookDep; // item 53 (rule 94)

  if (bk) {
    // Section 44AB(a): business turnover above Rs 1 crore, or above Rs 10 crore where cash receipts and payments are each within 5%; (b): professional receipts above Rs 50 lakh.
    const businessTurnover = (bk.kind === 'BUSINESS' ? salesTotal : 0) + pi.adTurnover;
    if (bk.kind === 'PROFESSION' && revenue > 5000000) audit(`Gross receipts from profession of Rs ${revenue} are above Rs 50 lakh (section 44AB(b)).`);
    if (bk.kind === 'BUSINESS' && businessTurnover > 100000000) audit('Business turnover is above Rs 10 crore (section 44AB(a)).');
    else if (bk.kind === 'BUSINESS' && businessTurnover > 10000000 && !(bk.cashReceiptsWithin5Pct && bk.cashPaymentsWithin5Pct)) audit('Business turnover is above Rs 1 crore and cash receipts or cash payments are not confirmed to be within 5% of the totals (proviso to section 44AB(a)).');
    if (bk.kind === 'PROFESSION' && (goods || services)) err('books', 'For a profession enter receipts as professional receipts, not sales.');
    if (bk.kind === 'BUSINESS' && profRcpt) err('books', 'For a business enter sales of goods or services, not professional receipts.');
    if (revenue <= 0) err('books', 'Turnover or gross receipts in the books are required.');
  }

  // Depreciation under section 32 by block, with the realisation not above the written down value (section 50 not covered).
  const blocks = (bk?.depreciation ?? []).map((x) => ({ x, d: blockDepreciation(x) }));
  for (const { x, d } of blocks) {
    if (!(x.block in DEP_BLOCKS)) err('depreciation', `Block ${x.block} is not one this file writes.`);
    if (d.sold > d.opening + d.addFull) err('depreciation', `Sale value in the ${d.rate}% block is above its written down value; section 50 applies, which this file does not write.`);
  }
  if (new Set(blocks.map((y) => y.x.block)).size !== blocks.length) err('depreciation', 'Each block of assets can be entered once.');
  const depOf = (k: DepBlockKind) => sum(blocks.filter((y) => y.x.block === k).map((y) => y.d.total));
  const itDep = sum(blocks.map((y) => y.d.total));
  if (bookDep > 0 && !blocks.length) err('depreciation', 'Depreciation is debited in the books: give the blocks of assets so depreciation under section 32 can be worked (Schedule DEP, rule 240).');

  // Schedule BP (rules 237, 244, 246, 248, 262, 264, 269): profit before tax plus presumptive income, presumptive income taken out at 4a and put back at 35.
  const presumptive = pi.total;
  const profBeforeTax = (bk ? pbt : 0) + presumptive; // item 1 (rule 237)
  const a6 = profBeforeTax - presumptive; // 1 - 4a
  const a10 = a6; // 6 + 9, nothing debited for other heads or exempt income
  const a13 = a10 + bookDep - itDep; // 10 + 11 - 12iii
  const a34 = a13; // 13 + 26 - 33, no additions or deductions under 28 to 44DA
  const a36 = a34 + presumptive; // 34 + 35viii
  const bp = a36;
  if (bp < 0) err('business', 'The business shows a loss; set-off under section 71 and carry forward under section 72 are not written by this file.');

  // Balance sheet (Part A-BS, rules 52 to 60).
  const bs = bk?.balanceSheet;
  const v = (x?: number) => n0(x);
  const propFund = v(bs?.capital) + v(bs?.reserves);
  const secured = v(bs?.securedLoansBank) + v(bs?.securedLoansOthers);
  const unsecured = v(bs?.unsecuredLoansBank) + v(bs?.unsecuredLoansOthers);
  const fundSrc = propFund + secured + unsecured + v(bs?.advances);
  const netBlock = v(bs?.grossBlock) - v(bs?.accumulatedDepreciation);
  const fixedTotal = netBlock + v(bs?.capitalWip);
  const invTotal = v(bs?.investmentsLongTerm) + v(bs?.investmentsTrade);
  const cashBank = v(bs?.cashInHand) + v(bs?.bank);
  const currAssets = v(bs?.stock) + v(bs?.debtors) + cashBank + v(bs?.otherCurrentAssets);
  const loanAdv = v(bs?.loansAdvances) + v(bs?.deposits);
  const currLiab = v(bs?.creditors) + v(bs?.provisions);
  const netCurrent = currAssets + loanAdv - currLiab;
  const fundApply = fixedTotal + invTotal + netCurrent;
  if (bk && fundSrc !== fundApply) err('balanceSheet', `The balance sheet does not balance: sources of funds Rs ${fundSrc}, application of funds Rs ${fundApply} (validation rule 52).`);
  if (bs && netBlock < 0) err('balanceSheet', 'Accumulated depreciation cannot be more than the gross block.');

  // Other heads (as ITR-2)
  const employers = huf ? [] : i.salary?.employers ?? [];
  const gross = sum(employers.map((x) => n0(x.gross)));
  const std = Math.min(gross, old ? 50000 : 75000); // 16(ia)
  const pt = old ? Math.min(n0(i.salary?.professionalTax), 2500, gross - std) : 0; // 16(iii)
  const salary = gross - std - pt;

  let soInterestLeft = old ? 200000 : 0;
  const props = (i.houses ?? []).map((h, k) => {
    const loans = h.loans ?? [];
    const interestPaid = sum(loans.map((l) => n0(l.interest)));
    const alv = h.letOut ? n0(h.rent) : 0;
    const tax = h.letOut ? n0(h.municipalTax) : 0;
    const balance = Math.max(0, alv - tax);
    const thirty = Math.round(balance * 0.3); // 24(a)
    let interest = interestPaid;
    if (!h.letOut) { interest = Math.min(interestPaid, soInterestLeft); soInterestLeft -= interest; } // 24(b) second proviso
    if (!h.letOut && !old && interestPaid > 0) err('houses', 'Interest on a self-occupied home is not allowed in the new regime (115BAC(2), validation rule 224); remove it or opt for the old regime.');
    if (h.letOut && alv <= 0) err('houses', `Property ${k + 1} is let out but has no rent (validation rule 217).`);
    const income = balance - thirty - interest;
    return {
      income,
      row: {
        HPSNo: k + 1,
        AddressDetailWithZipCode: { AddrDetail: clean(h.address, 200), CityOrTownOrDistrict: clean(h.city, 50), StateCode: h.stateCode, CountryCode: '91', PinCode: Number(h.pin) },
        PropertyOwner: 'SE', PropCoOwnedFlg: 'NO', AsseseeShareProperty: 100, ifLetOut: h.letOut ? 'L' : 'S',
        Rentdetails: {
          AnnualLetableValue: alv, RentNotRealized: 0, LocalTaxes: tax, TotalUnrealizedAndTax: tax, BalanceALV: balance, AnnualOfPropOwned: balance, ThirtyPercentOfBalance: thirty, IntOnBorwCap: interest,
          ...(loans.length && interest > 0 ? { Section24B: { Section24BDtls: loans.map((l) => ({ LoanTknFrom: l.from, BankOrInstnName: clean(l.lender, 125), LoanAccNoOfBankOrInstnRefNo: clean(l.account, 20), DateofLoan: l.sanctionedOn, TotalLoanAmt: n0(l.amount), LoanOutstndngAmt: n0(l.outstanding), InterestUs24B: n0(l.interest) })), TotalInterestUs24B: interestPaid } } : {}),
          TotalDeduct: thirty + interest, IncomeOfHP: income,
        },
      },
    };
  });
  const hpTotal = sum(props.map((x) => x.income));

  const os = i.otherSources ?? {};
  const sav = n0(os.savingsInterest), dep = n0(os.depositInterest), ref = n0(os.refundInterest), div = n0(os.dividends), oth = n0(os.other);
  const osIncome = sav + dep + ref + div + oth;

  const sales = (i.capitalGains ?? []).map((s) => ({ s, g: cgGain(s) }));
  for (const { s } of sales) {
    if (!/^2025-(0[4-9]|1[0-2])-\d{2}$|^2026-0[1-3]-\d{2}$/.test(s.date)) err('capitalGains', `Transfer date ${s.date} is not in 2025-26.`);
    if (s.kind === '112A' && !/^IN[0-9A-Z]{10}$/.test(s.isin ?? '')) err('capitalGains', `${s.name ?? 'A 112A sale'} needs its ISIN for Schedule 112A.`);
  }
  const of = (k: CgSale['kind']) => sales.filter((x) => x.s.kind === k);
  const net = (k: CgSale['kind']) => sum(of(k).map((x) => x.g.gain));
  const byPeriod = (ks: CgSale['kind'][]) => PERIODS.map((_, m) => sum(sales.filter((x) => ks.includes(x.s.kind) && periodOf(x.s.date) === m).map((x) => x.g.gain)));
  const st20Raw = net('111A'), stAppRaw = net('STCG'), ltARaw = net('112A'), ltORaw = net('LTCG');
  let ltA = ltARaw, ltO = ltORaw;
  const ltNet = ltA + ltO;
  if (ltNet <= 0) { ltA = 0; ltO = 0; } else if (ltO < 0) { ltA = ltNet; ltO = 0; } else if (ltA < 0) { ltO = ltNet; ltA = 0; }
  const ltLoss = Math.max(0, -ltNet);
  // Section 70(2): a short-term loss goes against any capital gain; 70(3): a long-term loss only against long-term gains.
  let st20 = Math.max(0, st20Raw), stApp = Math.max(0, stAppRaw);
  let st20Loss = Math.max(0, -st20Raw), stAppLoss = Math.max(0, -stAppRaw);
  const so = { appIn20: 0, s20InApp: 0, s20InLt: 0, appInLt: 0 };
  so.appIn20 = Math.min(stAppLoss, st20); st20 -= so.appIn20; stAppLoss -= so.appIn20;
  so.s20InApp = Math.min(st20Loss, stApp); stApp -= so.s20InApp; st20Loss -= so.s20InApp;
  const ltBefore = ltA + ltO;
  const reduceLt = (amt: number) => { const a = Math.min(amt, ltO); ltO -= a; const c = Math.min(amt - a, ltA); ltA -= c; return a + c; };
  so.s20InLt = reduceLt(st20Loss); st20Loss -= so.s20InLt;
  so.appInLt = reduceLt(stAppLoss); stAppLoss -= so.appInLt;
  const cgAfter = { st20, stApp, lt: ltA + ltO };

  // Schedule CYLA: a house property loss against other heads, old regime only, up to Rs 2 lakh (71(3A)); none in the new regime (115BAC(2)).
  const bpPos = Math.max(0, bp);
  const hpLoss = Math.max(0, -hpTotal);
  let hpLossLeft = old ? Math.min(hpLoss, 200000) : 0;
  const take = (x: number) => { const t = Math.min(hpLossLeft, x); hpLossLeft -= t; return t; };
  const hpIn = { sal: take(salary), bp: take(bpPos), os: take(osIncome), stApp: take(cgAfter.stApp), st20: take(cgAfter.st20), lt: 0 };
  const ltBeforeHp = ltA + ltO;
  hpIn.lt = Math.min(hpLossLeft, ltBeforeHp); hpLossLeft -= hpIn.lt; reduceLt(hpIn.lt);
  const hpSetOff = hpIn.sal + hpIn.bp + hpIn.os + hpIn.stApp + hpIn.st20 + hpIn.lt;
  const hpCarried = hpLoss - hpSetOff;
  const after = { sal: salary - hpIn.sal, hp: Math.max(0, hpTotal), bp: bpPos - hpIn.bp, os: osIncome - hpIn.os, st20: cgAfter.st20 - hpIn.st20, stApp: cgAfter.stApp - hpIn.stApp, lt: ltA + ltO };
  const stclCarried = st20Loss + stAppLoss;

  const cgIncome = after.st20 + after.stApp + after.lt;
  const totalTI = salary + Math.max(0, hpTotal) + bpPos + (cgAfter.st20 + cgAfter.stApp + cgAfter.lt) + osIncome;
  const gti = after.sal + after.hp + after.bp + after.os + cgIncome;
  const splIncome = after.st20 + after.lt;

  // Chapter VI-A, old regime only (115BAC(2)), not set against income at special rates (section 80A(2) read with 111A and 112).
  const d = old ? i.deductions ?? {} : {};
  const c80Claimed = sum((d.section80C ?? []).map((r) => n0(r.amount)));
  const c80 = Math.min(c80Claimed, 150000);
  const c80ccd1b = huf ? 0 : Math.min(n0(d.section80CCD1B), 50000);
  const d80 = deduction80D(huf ? undefined : d.section80D, age);
  issues.push(...d80.issues);
  // 80TTA: individual or HUF, savings interest up to Rs 10,000 (not a senior citizen); 80TTB: resident senior citizen, up to Rs 50,000.
  const c80tta = old && age === 'BELOW_60' ? Math.min(sav, 10000) : 0;
  const c80ttb = old && !huf && age !== 'BELOW_60' ? Math.min(sav + dep, 50000) : 0;
  const partB = c80 + c80ccd1b + d80.allowed;
  const partCAD = c80tta + c80ttb;
  const viaRoom = Math.max(0, gti - splIncome);
  const partBAllowed = Math.min(partB, viaRoom);
  const partCADAllowed = Math.min(partCAD, viaRoom - partBAllowed);
  const via = partBAllowed + partCADAllowed;
  const totalIncome = Math.round((gti - via) / 10) * 10; // section 288A
  if (totalIncome > 5000000) err('income', 'Total income above Rs 50 lakh carries surcharge, and above Rs 1 crore needs Schedule AL (validation rule 905); not written by this file.');

  const tx = specialRateTax({ regime, age, totalIncome, st111A: after.st20, lt112A: ltA, lt112: ltO, noRebate: huf });
  const salaryTds = sum(employers.map((x) => n0(x.tds)));
  const otherTds = sum((i.tdsOther ?? []).map((t) => n0(t.tds)));
  const tcs = sum((i.tcs ?? []).map((t) => n0(t.tcs)));
  const payments = i.taxPayments ?? [];
  const advance = sum(payments.filter((t) => t.kind === 'ADVANCE').map((t) => n0(t.amount)));
  const selfTax = sum(payments.filter((t) => t.kind === 'SELF').map((t) => n0(t.amount)));
  // 234C(1)(b): one instalment by 15 March for an assessee with only 44AD or 44ADA business income and no capital gains or dividends.
  const presumptive234C = !!(b.ad || b.ada) && !bk && !b.ae?.vehicles.length && !sales.length && !div;
  const ii = interestAndFee({
    liability: tx.liability, tdsTcs: salaryTds + otherTds + tcs, payments, filedOn: i.createdOn, dueDate: ITR3_DUE_DATE, totalIncome,
    exemption: (old ? oldSlabs(age) : NEW_SLABS)[0][0], presumptive234C, entered234C: i.interest234C,
  });
  const interest = ii.i234A + ii.i234B + ii.i234C + ii.fee234F;
  const aggregate = tx.liability + interest;
  const paid = salaryTds + otherTds + tcs + advance + selfTax;

  // Form 10-IEA: with business income the old regime needs it, filed by the due date (section 115BAC(6); validation rules 41 to 45).
  const fy = i.filing.form10IEA;
  if (old && !/^\d{15}$/.test(fy?.ack ?? '')) err('form10IEA', 'With business income, the old regime needs Form 10-IEA filed by the due date (section 115BAC(6)); give its acknowledgement number.');
  if (old && fy?.assessmentYear === '2026-27' && !/^\d{4}-\d{2}-\d{2}$/.test(fy.date ?? '')) err('form10IEA', 'Give the date Form 10-IEA was filed for this year.');
  const regimeFlags = !old
    ? { Form10IEAEarlierAYOldRegime: 'N', F10IEACurrAYOldRegime: 'N' }
    : fy?.assessmentYear === '2026-27'
      ? { Form10IEAEarlierAYOldRegime: 'N', F10IEACurrAYOldRegime: 'Y', F10IEADateCurrAYOldTax: fy.date, F10IEAAckNoCurrAYOldTax: Number(fy.ack) }
      : { Form10IEAEarlierAYOldRegime: 'Y', Form10IEAAssYear: fy?.assessmentYear, Form10IEAEarlierAYAckOldRegime: Number(fy?.ack), F10IEAEarlierAYNewRegime: 'N', F10IEACurrAYNewRegime: 'N' };

  // Schedules
  const agg = (k: CgSale['kind']) => of(k).reduce((a, x) => ({ sale: a.sale + x.g.sale, cost: a.cost + x.g.cost, imp: a.imp + x.g.improvement, exp: a.exp + x.g.expenses }), { sale: 0, cost: 0, imp: 0, exp: 0 });
  const zero94 = () => ({ FullValueConsdRecvUnqshr: 0, FairMrktValueUnqshr: 0, FullValueConsdSec50CA: 0, FullValueConsdOthUnqshr: 0, FullConsideration: 0, DeductSec48: ded48(0, 0, 0), BalanceCG: 0, LossSec94of7Or94of8: 0, CapgainonAssets: 0 });
  const a111 = agg('111A'), aSt = agg('STCG'), aLt = agg('LTCG');
  const rows112A = of('112A');
  const sch112A = rows112A.map(({ s, g }) => ({
    ShareOnOrBefore: s.acquiredBefore1Feb2018 ? 'BE' : 'AE', ISINCode: s.isin, ShareUnitName: clean(s.name || s.isin, 125),
    TotSaleValue: g.sale, CostAcqWithoutIndx: n0(s.cost), AcquisitionCost: g.cost, LTCGBeforelower6and11: g.fmvCap,
    FairMktValuePerShareunit: 0, TotFairMktValueCapAst: s.acquiredBefore1Feb2018 ? n0(s.fmv31Jan2018) : 0, ExpExclCnctTransfer: g.expenses + g.improvement,
    TotalDeductions: g.cost + g.expenses + g.improvement, Balance: g.gain,
  }));
  const sumRow = (k: keyof (typeof sch112A)[number]) => sum(sch112A.map((r) => Number(r[k])));
  const scheduleCG = {
    ShortTermCapGainFor23: {
      SlumpSaleInStcg: { FMV11UAEii: 0, FMV11UAEiii: 0, FullConsideration: 0, NetWorthOfDivision: 0, CapgainonAssets: 0 },
      ...(a111.sale ? { EquityMFonSTT: [{ MFSectionCode: '1A', EquityMFonSTTDtls: { FullConsideration: a111.sale, DeductSec48: ded48(a111.cost, a111.imp, a111.exp), BalanceCG: st20Raw, LossSec94of7Or94of8: 0, CapgainonAssets: st20Raw } }] } : {}),
      NRITransacSec48Dtl: { NRItaxSTTPaid: 0, NRItaxSTTNotPaid: 0 },
      NRISecur115AD: zero94(),
      SaleOnOtherAssets: {
        FullValueConsdRecvUnqshr: 0, FairMrktValueUnqshr: 0, FullValueConsdSec50CA: 0, FullValueConsdOthUnqshr: aSt.sale, FullConsideration: aSt.sale,
        DeductSec48: ded48(aSt.cost, aSt.imp, aSt.exp), BalanceCG: stAppRaw, LossSec94of7Or94of8: 0, DeemedStcgOnAssets: 0,
        ExemptionOrDednUs54: { ExemptionGrandTotal: 0 }, CapgainonAssets: stAppRaw,
      },
      TotalAmtDeemedStcg: 0, PassThrIncNatureSTCG: 0, TotalAmtNotTaxUsDTAAStcg: 0, TotalAmtTaxUsDTAAStcg: 0,
      TotalSTCG: st20Raw + stAppRaw,
    },
    LongTermCapGain23: {
      SlumpSaleInLtcgDtls: {},
      SaleOfEquityShareUs112A: { BalanceCG: ltARaw, DeductionUs54F: 0, CapgainonAssets: ltARaw },
      NRISaleOfEquityShareUs112A: { BalanceCG: 0, DeductionUs54F: 0, CapgainonAssets: 0 },
      NRISaleofForeignAsset: { SaleonSpecAsset: 0, DednSpecAssetus115: 0, BalonSpeciAsset: 0 },
      SaleofAssetNADtls: aLt.sale ? {
        SaleofAssetNA: {
          FullValueConsdRecvUnqshr: 0, FairMrktValueUnqshr: 0, FullValueConsdSec50CA: 0, FullValueConsdOthUnqshr: aLt.sale, FullConsideration: aLt.sale,
          DeductSec48: ded48(aLt.cost, aLt.imp, aLt.exp), BalanceCG: ltORaw, DeductionUs54F: 0, CapgainonAssets: ltORaw,
        },
      } : {},
      TotalAmtDeemedLtcg: 0, PassThrIncNatureLTCG: 0, TotalAmtNotTaxUsDTAALtcg: 0, TotalAmtTaxUsDTAALtcg: 0,
      TotalLTCG: ltARaw + ltORaw,
    },
    SumOfCGIncm: cgAfter.st20 + cgAfter.stApp + cgAfter.lt,
    IncmFromVDATrnsf: 0,
    TotScheduleCGFor23: cgAfter.st20 + cgAfter.stApp + cgAfter.lt,
    DeducClaimInfo: { TotDeductClaim: 0 },
    CurrYrLosses: {
      InLossSetOff: { StclSetoff20Per: Math.max(0, -st20Raw), StclSetoff30Per: 0, StclSetoffAppRate: Math.max(0, -stAppRaw), StclSetoffDTAARate: 0, LtclSetOff12_5Per: ltLoss, LtclSetOffDTAARate: 0 },
      InStcg20Per: { CurrYearIncome: Math.max(0, st20Raw), StclSetoff30Per: 0, StclSetoffAppRate: so.appIn20, StclSetoffDTAARate: 0, CurrYrCapGain: cgAfter.st20 },
      InStcg30Per: { CurrYearIncome: 0, StclSetoff20Per: 0, StclSetoffAppRate: 0, StclSetoffDTAARate: 0, CurrYrCapGain: 0 },
      InStcgAppRate: { CurrYearIncome: Math.max(0, stAppRaw), StclSetoff20Per: so.s20InApp, StclSetoff30Per: 0, StclSetoffDTAARate: 0, CurrYrCapGain: cgAfter.stApp },
      InStcgDTAARate: { CurrYearIncome: 0, StclSetoff20Per: 0, StclSetoff30Per: 0, StclSetoffAppRate: 0, CurrYrCapGain: 0 },
      InLtcg12_5Per: { CurrYearIncome: ltBefore, StclSetoff20Per: so.s20InLt, StclSetoff30Per: 0, StclSetoffAppRate: so.appInLt, StclSetoffDTAARate: 0, LtclSetOffDTAARate: 0, CurrYrCapGain: cgAfter.lt },
      InLtcgDTAARate: { CurrYearIncome: 0, StclSetoff20Per: 0, StclSetoff30Per: 0, StclSetoffAppRate: 0, StclSetoffDTAARate: 0, LtclSetOff12_5Per: 0, CurrYrCapGain: 0 },
      TotLossSetOff: { StclSetoff20Per: so.s20InApp + so.s20InLt, StclSetoff30Per: 0, StclSetoffAppRate: so.appIn20 + so.appInLt, StclSetoffDTAARate: 0, LtclSetOff12_5Per: 0, LtclSetOffDTAARate: 0 },
      LossRemainSetOff: { StclSetoff20Per: st20Loss, StclSetoff30Per: 0, StclSetoffAppRate: stAppLoss, StclSetoffDTAARate: 0, LtclSetOff12_5Per: ltLoss, LtclSetOffDTAARate: 0 },
    },
    AccruOrRecOfCG: {
      ShortTermUnder20Per: spread(after.st20, byPeriod(['111A'])), ShortTermUnder30Per: zeroRange(), ShortTermUnderAppRate: spread(after.stApp, byPeriod(['STCG'])),
      ShortTermUnderDTAARate: zeroRange(), LongTermUnder12_5Per: spread(after.lt, byPeriod(['112A', 'LTCG'])), LongTermUnderDTAARate: zeroRange(), VDATrnsfGainsUnder30Per: zeroRange(),
    },
  };

  const cyla = (incomeHead: number, hpSet: number) => ({ IncCYLA: { IncOfCurYrUnderThatHead: incomeHead, HPlossCurYrSetoff: hpSet, OthSrcLossNoRaceHorseSetoff: 0, IncOfCurYrAfterSetOff: incomeHead - hpSet } });
  const cylaCg = (incomeHead: number, hpSet: number) => ({ IncCYLA: { IncOfCurYrUnderThatHead: incomeHead, HPlossCurYrSetoff: hpSet, BusLossSetoff: 0, OthSrcLossNoRaceHorseSetoff: 0, IncOfCurYrAfterSetOff: incomeHead - hpSet } });
  const bfla = (x: number) => ({ IncBFLA: { IncOfCurYrUndHeadFromCYLA: x, BFlossPrevYrUndSameHeadSetoff: 0, BFUnabsorbedDeprSetoff: 0, BFAllUs35Cl4Setoff: 0, IncOfCurYrAfterSetOffBFLosses: x } });
  const bflaPlain = (x: number) => ({ IncBFLA: { IncOfCurYrUndHeadFromCYLA: x, IncOfCurYrAfterSetOffBFLosses: x } });
  const carried = hpCarried + stclCarried + ltLoss;

  // Part A-P&L presumptive items 61 to 63 and Schedule BP item 35 (rules 98 to 118, 112 to 114).
  const plPresumptive = {
    ...(b.ad ? {
      NatOfBus44AD: [{ NameOfBusiness: clean(b.ad.name, 75), CodeAD: b.ad.code }],
      PersumptiveInc44AD: { GrsTrnOverOrReceipt: pi.adTurnover, GrsTrnOverBank: n0(b.ad.digital), GrsTotalTrnOverInCash: n0(b.ad.cash), GrsTrnOverAnyOthMode: n0(b.ad.otherMode), TotPersumptiveInc44AD: pi.adIncome, PersumptiveInc44AD6Per: pi.ad6, PersumptiveInc44AD8Per: pi.ad8 },
    } : {}),
    ...(b.ada ? {
      NatOfBus44ADA: [{ NameOfBusiness: clean(b.ada.name, 75), CodeADA: b.ada.code }],
      PersumptiveInc44ADA: { GrsReceipt: pi.adaReceipts, GrsTrnOverBank44ADA: n0(b.ada.digital), GrsTotalTrnOverInCash44ADA: n0(b.ada.cash), GrsTrnOverAnyOthMode44ADA: n0(b.ada.otherMode), TotPersumptiveInc44ADA: pi.adaIncome },
    } : {}),
    ...(b.ae?.vehicles.length ? {
      NatOfBus44AE: [{ NameOfBusiness: clean(b.ae.name, 75), CodeAE: b.ae.code }],
      GoodsDtlsUs44AE: pi.vehicles.map((x) => ({ RegNumberGoodsCarriage: clean(x.regNo, 11).toUpperCase(), OwnedLeasedHiredFlag: x.ownership, TonnageCapacity: x.tonnage, HoldingPeriod: x.months, PresumptiveIncome: x.income })),
      TotalNumOfMonths: sum(pi.vehicles.map((x) => x.months)), TotalPrsumptvIncUs44EGoods: pi.aeIncome, TotalPrsumptvIncUs44E: pi.aeIncome,
    } : {}),
  };

  const natures = b.natures.length ? b.natures : [b.ad, b.ada, b.ae].filter(Boolean).map((x) => ({ code: x!.code, tradeName: x!.name }));
  const anyBooks = !!bk;
  const businessTurnover = (bk?.kind === 'BUSINESS' ? salesTotal : 0) + pi.adTurnover;
  const auditInfo = {
    LiableSec44AAflg: (b.liable44AA ?? anyBooks) ? 'Y' : 'N',
    IncDclrdUs: anyBooks ? 'N' : 'Y',
    ...(anyBooks && bk!.kind === 'BUSINESS' ? {
      TotalSalesExcOneCr: businessTurnover <= 10000000 ? 'Upto1CR' : 'Upto10CR',
      ...(businessTurnover > 10000000 ? { AgrOFAllAmtsRcvd: 'Upto5Per', AgrOFAllPayMade: 'Upto5Per' } : {}),
    } : {}),
    LiableSec44ABflg: 'N', LiableSec92Eflg: 'N', AccountAuditFlag: 'N',
  };

  const zeroExcise = { UnionExciseDuty: 0, ServiceTax: 0, VATorSaleTax: 0, CentralGoodServiceTax: 0, StateGoodServiceTax: 0, IntegratedGoodServiceTax: 0, UnionTerrGoodServiceTax: 0, OthDutyTaxCess: 0, TotExciseCustomsVAT: 0 };
  const split3 = (others: number) => ({ NonResOtherCompany: 0, Others: others, Total: others });
  const tradingAccount = bk ? {
    SaleOfGoods: goods, SaleOfServices: services, OperatingRevenueTotal: 0, SalesGrossReceiptsTotal: salesTotal, GrossRcptFromProfession: profRcpt,
    ExciseCustomsVAT: { TotExciseCustomsVAT: 0 }, TotRevenueFrmOperations: revenue, ClsngStckOfFinishedStcks: closing, TardingAccTotCred: tradingCredit,
    OpngStckOfFinishedStcks: opening, Purchases: purchases, DirectExpenses: direct, CarriageInward: 0, PowerAndFuel: 0,
    ...(direct ? { OtherIncDtls: [{ NatureOfIncome: 'Direct expenses', Amount: direct }] } : {}), DirectExpensesTotal: direct,
    DutyTaxPay: { ExciseCustomsVAT: { TotExciseCustomsVAT: 0 } }, GoodsCostPrdcdFrmMA: 0, GrossProfitFrmBusProf: grossProfit,
  } : undefined;

  const partAPL = {
    CreditsToPL: {
      GrossProfitTrnsfFrmTrdAcc: bk ? grossProfit : 0,
      OthIncome: { RentInc: 0, Comissions: 0, Dividends: 0, InterestInc: 0, ProfitOnSaleFixedAsset: 0, ProfitOnInvChrSTT: 0, ProfitOnOthInv: 0, ProfitOnCurrFluct: 0, ProfitOnCnvInvntryToCapAsst: 0, ProfitOnAgriIncome: 0, MiscOthIncome: otherIncome, TotOthIncome: otherIncome },
      TotCreditsToPL: bk ? credits : 0,
    },
    DebitsToPL: {
      Freight: e(ex.freight), ConsumptionOfStores: e(ex.consumables), PowerFuel: e(ex.powerFuel), RentExpdr: e(ex.rent), RepairsBldg: e(ex.repairsBuilding), RepairMach: e(ex.repairsMachinery),
      EmployeeComp: { SalsWages: e(ex.salaries), Bonus: e(ex.bonus), MedExpReimb: 0, LeaveEncash: 0, LeaveTravelBenft: 0, ContToSuperAnnFund: 0, ContToPF: e(ex.providentFund), ContToGratFund: 0, ContToOthFund: 0, OthEmpBenftExpdr: 0, TotEmployeeComp: empTotal, AnyCompPaidToNonRes: 'N' },
      Insurances: { MedInsur: 0, LifeInsur: 0, KeyManInsur: 0, OthInsur: e(ex.insurance), TotInsurances: e(ex.insurance) },
      StaffWelfareExp: e(ex.staffWelfare), Entertainment: 0, Hospitality: 0, Conference: 0, SalePromoExp: e(ex.salesPromotion), Advertisement: e(ex.advertisement),
      CommissionExpdrDtls: split3(e(ex.commission)), RoyalityDtls: split3(0), ProfessionalConstDtls: split3(e(ex.professionalFees)),
      HotelBoardLodge: e(ex.hotel), TravelExp: e(ex.travel), ForeignTravelExp: 0, ConveyanceExp: e(ex.conveyance), TelephoneExp: e(ex.telephone), GuestHouseExp: 0, ClubExp: 0, FestivalCelebExp: 0, Scholarship: 0, Gift: 0, Donation: 0,
      RatesTaxesPays: { ExciseCustomsVAT: { ...zeroExcise, Cess: 0, OthDutyTaxCess: e(ex.ratesTaxes), TotExciseCustomsVAT: e(ex.ratesTaxes) } },
      AuditFee: e(ex.auditFee),
      ...(otherRows.length ? { OtherExpensesDtls: otherRows.map((r) => ({ ExpenseNature: clean(r.nature, 125) || 'Other expenses', Amount: n0(r.amount) })) } : {}),
      OtherExpenses: otherTotal,
      BadDebtDtls: { BadDebtAmtDtlsTotal: 0, OthersPANNotAvlblDtlTotal: 0, OthersAmtLt1Lakh: 0, BadDebt: 0 },
      ProvForBadDoubtDebt: 0, OthProvisionsExpdr: 0,
      PBIDTA: bk ? pbidta : 0,
      InterestExpdrtDtls: { NonResOtherCompany: 0, Others: interestExp, InterestExpdr: interestExp },
      DepreciationAmort: bookDep,
      PBT: bk ? pbt : 0,
    },
    // Rules 95 to 97: no tax provision for a proprietor; the profit goes to the proprietor's account.
    TaxProvAppr: { ProvForCurrTax: 0, ProvDefTax: 0, ProfitAfterTax: bk ? pbt : 0, BalBFPrevYr: 0, AmtAvlAppr: bk ? pbt : 0, TrfToReserves: 0, ProprietorAccBalTrf: bk ? pbt : 0 },
    ...plPresumptive,
    NoBooksOfAccPL: { GrossReceipt: 0, GrsRcptAccPayeeOrBankMode: 0, GrsRcptOtherMode: 0, GrossProfit: 0, Expenses: 0, NetProfit: 0, GrossReceiptPrf: 0, GrsRcptAccPayeeOrBankModePrf: 0, GrsRcptOtherModePrf: 0, GrossProfitPrf: 0, ExpensesPrf: 0, NetProfitPrf: 0, TotBusinessProfession: 0 },
    TurnverFrmSpecActivity: 0, NetIncomeFrmSpecActivity: 0,
  };

  const partABS = {
    FundSrc: {
      PropFund: { PropCap: v(bs?.capital), ResrNSurp: { RevResr: v(bs?.reserves), CapResr: 0, StatResr: 0, OthResr: 0, TotResrNSurp: v(bs?.reserves) }, TotPropFund: propFund },
      LoanFunds: {
        SecrLoan: { ForeignCurrLoan: 0, RupeeLoan: { FrmBank: v(bs?.securedLoansBank), FrmOthrs: v(bs?.securedLoansOthers), TotRupeeLoan: secured }, TotSecrLoan: secured },
        UnsecrLoan: { FrmBank: v(bs?.unsecuredLoansBank), FrmOthrs: v(bs?.unsecuredLoansOthers), TotUnSecrLoan: unsecured },
        TotLoanFund: secured + unsecured,
      },
      DeferredTax: 0,
      Advances: { FromPrsn: 0, FromOthers: v(bs?.advances), TotalAdvances: v(bs?.advances) },
      TotFundSrc: fundSrc,
    },
    FundApply: {
      FixedAsset: { GrossBlock: v(bs?.grossBlock), Depreciation: v(bs?.accumulatedDepreciation), NetBlock: Math.max(0, netBlock), CapWrkProg: v(bs?.capitalWip), TotFixedAsset: Math.max(0, fixedTotal) },
      Investments: {
        LongTermInv: { GovtOthSecQuoted: 0, GovOthSecUnQoted: v(bs?.investmentsLongTerm), TotLongTermInv: v(bs?.investmentsLongTerm) },
        TradeInv: { EquityShares: v(bs?.investmentsTrade), PreferShares: 0, Debenture: 0, TotTradeInv: v(bs?.investmentsTrade) },
        TotInvestments: invTotal,
      },
      CurrAssetLoanAdv: {
        CurrAsset: {
          Inventories: { StoresConsumables: 0, RawMatl: 0, StkInProcess: 0, FinOrTradGood: v(bs?.stock), TotInventries: v(bs?.stock) },
          SndryDebtors: v(bs?.debtors),
          CashOrBankBal: { CashinHand: v(bs?.cashInHand), BankBal: v(bs?.bank), TotCashOrBankBal: cashBank },
          OthCurrAsset: v(bs?.otherCurrentAssets),
          TotCurrAsset: currAssets,
        },
        LoanAdv: { AdvRecoverable: v(bs?.loansAdvances), Deposits: v(bs?.deposits), BalWithRevAuth: 0, TotLoanAdv: loanAdv },
        TotCurrAssetLoanAdv: currAssets + loanAdv,
        CurrLiabilitiesProv: {
          CurrLiabilities: { SundryCred: v(bs?.creditors), LiabForLeasedAsset: 0, AccrIntonLeasedAsset: 0, AccrIntNotDue: 0, TotCurrLiabilities: v(bs?.creditors) },
          Provisions: { ITProvision: 0, ELSuperAnnGratProvision: 0, OthProvision: v(bs?.provisions), TotProvisions: v(bs?.provisions) },
          TotCurrLiabilitiesProvision: currLiab,
        },
        NetCurrAsset: netCurrent,
      },
      MiscAdjust: { MiscExpndr: 0, DefTaxAsset: 0, AccumaltedLosses: 0, TotMiscAdjust: 0 },
      TotFundApply: fundApply,
    },
    ...(b.noAccounts && !bk ? { NoBooksOfAccBS: { TotSundryDbtAmt: n0(b.noAccounts.debtors), TotSundryCrdAmt: n0(b.noAccounts.creditors), TotStkInTradAmt: n0(b.noAccounts.stock), CashBalAmt: n0(b.noAccounts.cash) } } : {}),
  };

  const zeroHeads = { Salary: 0, HouseProperty: 0, CapitalGains: 0, OtherSources: 0, Us115BBF: 0, Us115BBG: 0, '115BBH': 0 };
  const scheduleBP = {
    BusinessIncOthThanSpec: {
      ProfBfrTaxPL: profBeforeTax, NetPLFromSpecBus: 0, NetPLFromSpecifiedBus: 0,
      IncRecCredPLOthHeadDtls: { ...zeroHeads, Dividend: 0, OtherThanDividend: 0 },
      PLUs44sChapXIIG: presumptive,
      ProfitLossInclRefrdSec: { ProfitLossUs44AD: pi.adIncome, ProfitLossUs44ADA: pi.adaIncome, ProfitLossUs44AE: pi.aeIncome, ProfitLossUs44B: 0, ProfitLossUs44BB: 0, ProfitLossUs44BBA: 0, ProfitLossUs44BBC: 0, ProfitLossUs44BBD: 0, ProfitLossUs44DA: 0 },
      TotalProfitFrmActCvrd: 0,
      ProfitFrmActCvrd: { ProfitFrmActCvrdUndrRule7: 0, ProfitFrmActCvrdUndrRule7A: 0, ProfitFrmActCvrdUndrRule7B1: 0, ProfitFrmActCvrdUndrRule7B1A: 0, ProfitFrmActCvrdUndrRule8: 0 },
      IncCredPL: { FirmShareInc: 0, AOPBOISharInc: 0, OthExempInc: 0, TotExempIncPL: 0 },
      BalancePLOthThanSpecBus: a6,
      ExpDebToPLOthHeadDtls: zeroHeads,
      ExpDebToPLExemptInc: 0, ExpDebToPLExemptIncDisAllwUs14A: 0, TotExpDebPL: 0,
      AdjustedPLOthThanSpecBus: a10,
      DepreciationDebPLCosAct: bookDep,
      DepreciationAllowITAct32: { DepreciationAllowUs32_1_ii: itDep, DepreciationAllowUs32_1_i: 0, TotDeprAllowITAct: itDep },
      AdjustPLAfterDeprOthSpecInc: a13,
      AmtDebPLDisallowUs36: 0, AmtDebPLDisallowUs37: 0, AmtDebPLDisallowUs40: 0, AmtDebPLDisallowUs40A: 0, AmtDebPLDisallowUs43B: 0, InterestDisAllowUs23SMEAct: 0,
      DeemIncUs41: 0, DeemIncUs3380HHD80IA: 0, DeemIncUs43CA: 0, OthItemDisallowUs28To44DA: 0,
      AnyOthIncNotInclInExpDisallowPL: 0, AnyOthIncNotInclInSalary: 0, AnyOthIncNotInclInBonus: 0, AnyOthIncNotInclInCommission: 0, AnyOthIncNotInclInInterest: 0, AnyOthIncNotInclInOthers: 0,
      IncProfDecLossAccICDSAdj: 0, TotAfterAddToPLDeprOthSpecInc: 0,
      DeductUs32_1_iii: 0, DebPLUs35ExcessAmt: 0, AmtDisallUs40NowAllow: 0, AmtDisallUs43BNowAllow: 0, AnyOthAmtAllDeduct: 0, DecProfIncLossAccICDSAdj: 0, TotDeductionAmts: 0,
      PLAftAdjDedBusOthThanSpec: a34,
      DeemedProfitBusUs: { Section44AD: pi.adIncome, Section44ADA: pi.adaIncome, Section44AE: pi.aeIncome, Section44B: 0, Section44BB: 0, Section44BBA: 0, Section44BBC: 0, Section44BBD: 0, Section44DA: 0, TotDeemedProfitBusUs: presumptive },
      NetPLAftAdjBusOthThanSpec: a36,
      NetPLBusOthThanSpec7A7B7C: a36,
      ChrgblIncUndrRule7: 0, DeemedChrgblIncUndrRule7A: 0, DeemedChrgblIncUndrRule7B1: 0, DeemedChrgblIncUndrRule7B1A: 0, DeemedChrgblIncUndrRule8: 0,
      IncomeOtherThanRule: a36,
      BalIncDeemedFrmAgri: 0,
    },
    SpecBusinessInc: { NetPLFrmSpecBus: 0, AdditionUs28to44DA: 0, DeductUs28to44DA: 0, AdjustedPLFrmSpecuBus: 0 },
    SpecifiedBusinessInc: { NetPLFrmSpecifiedBus: 0, AddSec28to44DA: 0, DedSec28to44DAOTDedSec35AD: 0, ProfitLossSpecifiedBusiness: 0, PLFrmSpecifiedBus: 0 },
    IncChrgUnHdProftGain: bp,
    BusSetoffCurrYr: { LossSetOffOnBusLoss: 0, TotLossSetOffOnBus: 0, LossRemainSetOffOnBus: 0 },
  };

  // Schedules DPM, DOA and DEP (rules 325 to 337).
  const dpmRates: Array<[DepBlockKind, string]> = [['PM15', 'Rate15'], ['PM30', 'Rate30'], ['PM40', 'Rate40']];
  const pmBlocks = dpmRates.filter(([k]) => blocks.some((y) => y.x.block === k));
  const detailOf = (k: DepBlockKind) => blocks.find((y) => y.x.block === k)!.d.detail;
  const doaPart = (pairs: Array<[DepBlockKind, string]>) => {
    const present = pairs.filter(([k]) => blocks.some((y) => y.x.block === k));
    return present.length ? Object.fromEntries(present.map(([k, rate]) => [rate, { DepreciationDetail: detailOf(k) }])) : undefined;
  };
  const doa = {
    Building: doaPart([['BLDG5', 'Rate5'], ['BLDG10', 'Rate10'], ['BLDG40', 'Rate40']]),
    FurnitureFittings: doaPart([['FURN10', 'Rate10']]),
    IntangibleAssets: doaPart([['INTANG25', 'Rate25']]),
  };
  const doaClean = Object.fromEntries(Object.entries(doa).filter(([, x]) => x));
  const pmTotal = depOf('PM15') + depOf('PM30') + depOf('PM40');
  const bldTotal = depOf('BLDG5') + depOf('BLDG10') + depOf('BLDG40');
  const depSchedules = blocks.length ? {
    ...(pmBlocks.length ? { ScheduleDPM: { PlantMachinery: Object.fromEntries(pmBlocks.map(([k, rate]) => [rate, { DepreciationDetail: detailOf(k) }])) } } : {}),
    ...(Object.keys(doaClean).length ? { ScheduleDOA: doaClean } : {}),
    ScheduleDEP: {
      SummaryFromDeprSch: {
        ...(pmTotal || pmBlocks.length ? { PlantMachinerySummary: { DeprBlockTot15Percent: depOf('PM15'), DeprBlockTot30Percent: depOf('PM30'), DeprBlockTot40Percent: depOf('PM40'), DeprBlockTot45Percent: 0, TotPlntMach: pmTotal } } : {}),
        ...(doa.Building ? { BuildingSummary: { DeprBlockTot5Percent: depOf('BLDG5'), DeprBlockTot10Percent: depOf('BLDG10'), DeprBlockTot40Percent: depOf('BLDG40'), TotBuildng: bldTotal } } : {}),
        ...(doa.FurnitureFittings ? { FurnitureSummary: depOf('FURN10') } : {}),
        ...(doa.IntangibleAssets ? { IntangibleAssetSummary: depOf('INTANG25') } : {}),
        TotalDepreciation: itDep,
      },
    },
  } : {};

  const verification = huf
    ? { Declaration: { AssesseeVerName: clean(i.karta?.name, 125), FatherName: clean(p.fatherName, 125), AssesseeVerPAN: i.karta?.pan ?? '' }, Capacity: 'K', Date: i.createdOn, Place: clean(p.place, 50) }
    : { Declaration: { AssesseeVerName: clean([p.firstName, p.middleName, p.surname].filter(Boolean).join(' '), 125), FatherName: clean(p.fatherName, 125), AssesseeVerPAN: p.pan }, Capacity: 'S', Date: i.createdOn, Place: clean(p.place, 50) };

  const json = {
    ITR: {
      ITR3: {
        CreationInfo: creationInfo(i.softwareId, i.createdOn, i.intermediaryCity),
        Form_ITR3: { FormName: 'ITR-3', Description: 'For Indls and HUFs having income from business or profession', AssessmentYear: '2026', SchemaVer: 'Ver1.0', FormVer: 'Ver1.0' },
        PartA_GEN1: {
          PersonalInfo: { AssesseeName: huf ? { SurNameOrOrgName: clean(p.surname, 75) } : assesseeName(p), PAN: p.pan, Address: address(p), SecondaryAdd: 'N', DOB: p.dob, Status: i.status },
          FilingStatus: {
            ReturnFileSec: returnSection(i.filing, ii.belated), IncFrmBusOrProf: 'Y', ...regimeFlags, SeventhProvisio139: 'N', ...revisedFields(i.filing),
            ResidentialStatus: 'RES', AsseseeRepFlg: 'N', CompDirectorPrvYrFlg: 'N', PartnerInFirmFlg: 'N', HeldUnlistedEqShrPrYrFlg: 'N', ForeignExchangeFlag: 'N', FiiFpiFlag: 'N', ItrFilingDueDate: ITR3_DUE_DATE,
          },
        },
        PartA_GEN2: {
          AuditInfo: auditInfo,
          NatOfBus: { NatureOfBusiness: natures.map((x) => ({ Code: x.code, ...(x.tradeName ? { TradeName1: clean(x.tradeName, 125) } : {}) })) },
        },
        PARTA_BS: partABS,
        ...(tradingAccount ? { TradingAccount: tradingAccount } : {}),
        PARTA_PL: partAPL,
        ...(employers.length ? {
          ScheduleS: {
            Salaries: employers.map((x) => ({
              NameOfEmployer: clean(x.name, 125), NatureOfEmployment: x.nature, ...(x.tan ? { TANofEmployer: x.tan } : {}),
              AddressDetail: { AddrDetail: clean(x.address.line, 200), CityOrTownOrDistrict: clean(x.address.city, 50), StateCode: x.address.stateCode, PinCode: Number(x.address.pin) },
              Salarys: { GrossSalary: n0(x.gross), Salary: n0(x.gross), ValueOfPerquisites: 0, ProfitsinLieuOfSalary: 0, IncomeNotified89A: 0, IncomeNotifiedOther89A: 0 },
            })),
            TotalGrossSalary: gross, AllwncExtentExemptUs10: 0, NetSalary: gross, DeductionUS16: std + pt, DeductionUnderSection16ia: std, EntertainmntalwncUs16ii: 0, ProfessionalTaxUs16iii: pt, TotIncUnderHeadSalaries: salary,
          },
        } : {}),
        ...(props.length ? { ScheduleHP: { PropertyDetails: props.map((x) => x.row), TotalIncomeChargeableUnHP: hpTotal } } : {}),
        ITR3ScheduleBP: scheduleBP,
        ...depSchedules,
        ...(sales.length ? { ScheduleCGFor23: scheduleCG } : {}),
        ...(rows112A.length ? { Schedule112A: { Schedule112ADtls: sch112A, SaleValue112A: sumRow('TotSaleValue'), CostAcqWithoutIndx112A: sumRow('CostAcqWithoutIndx'), AcquisitionCost112A: sumRow('AcquisitionCost'), LTCGBeforelowerB1B2112A: sumRow('LTCGBeforelower6and11'), FairMktValueCapAst112A: sumRow('TotFairMktValueCapAst'), ExpExclCnctTransfer112A: sumRow('ExpExclCnctTransfer'), Deductions112A: sumRow('TotalDeductions'), Balance112A: sumRow('Balance') } } : {}),
        ...(osIncome ? {
          ScheduleOS: {
            IncOthThanOwnRaceHorse: {
              GrossIncChrgblTaxAtAppRate: osIncome, DividendGross: div, DividendOthThan22e: div, Dividend22e: 0, InterestGross: sav + dep + ref, IntrstFrmSavingBank: sav, IntrstFrmTermDeposit: dep, IntrstFrmIncmTaxRefund: ref,
              NatofPassThrghIncome: 0, IntrstFrmOthers: 0, RentFromMachPlantBldgs: 0, Tot562x: 0, Aggrtvaluewithoutcons562x: 0, Immovpropwithoutcons562x: 0, Immovpropinadeqcons562x: 0, Anyotherpropwithoutcons562x: 0, Anyotherpropinadeqcons562x: 0,
              FamilyPension: 0, AnyOtherIncome: oth, ...(oth ? { OthersInc: { OthersIncDtls: [{ OthNatOfInc: clean(os.otherDescription || 'Other income', 50), OthAmount: oth }] } } : {}),
              IncChargeableSpecialRates: 0, LtryPzzlChrgblUs115BB: 0, IncChrgblUs115BBE: 0, CashCreditsUs68: 0, UnExplndInvstmntsUs69: 0, UnExplndMoneyUs69A: 0, UnDsclsdInvstmntsUs69B: 0, UnExplndExpndtrUs69C: 0, AmtBrwdRepaidOnHundiUs69D: 0,
              OthersGross: 0, PassThrIncOSChrgblSplRate: 0,
              Deductions: { Expenses: 0, DeductionUs57iia: 0, Depreciation: 0, TotDeductions: 0 },
              BalanceNoRaceHorse: osIncome,
            },
            TotOthSrcNoRaceHorse: osIncome,
            IncFrmLottery: zeroRangeOS(), DividendIncUs115BBDA: zeroRangeOS(), DividendIncUs115BBDAaiii: zeroRangeOS(), DividendIncUs115A1ai: zeroRangeOS(), DividendIncUs115AC: zeroRangeOS(), DividendIncUs115ACA: zeroRangeOS(), DividendIncUs115AD1i: zeroRangeOS(), DividendDTAA: zeroRangeOS(), NOT89A: zeroRangeOS(),
            IncChargeable: osIncome,
          },
        } : {}),
        ScheduleCYLA: {
          ...(employers.length ? { Salary: cyla(salary, hpIn.sal) } : {}),
          ...(hpTotal > 0 ? { HP: { IncCYLA: { IncOfCurYrUnderThatHead: hpTotal, BusLossSetoff: 0, OthSrcLossNoRaceHorseSetoff: 0, IncOfCurYrAfterSetOff: hpTotal } } } : {}),
          BusProfExclSpecProf: cyla(bpPos, hpIn.bp),
          STCG20Per: cylaCg(cgAfter.st20, hpIn.st20), STCG30Per: cylaCg(0, 0), STCGAppRate: cylaCg(cgAfter.stApp, hpIn.stApp), STCGDTAARate: cylaCg(0, 0),
          LTCG12_5Per: cylaCg(ltBeforeHp, hpIn.lt), LTCGDTAARate: cylaCg(0, 0),
          ...(osIncome ? { OthSrcExclRaceHorse: { IncCYLA: { IncOfCurYrUnderThatHead: osIncome, HPlossCurYrSetoff: hpIn.os, BusLossSetoff: 0, IncOfCurYrAfterSetOff: after.os } } } : {}),
          TotalCurYr: { TotHPlossCurYr: hpLoss, TotBusLoss: 0, TotOthSrcLossNoRaceHorse: 0 },
          TotalLossSetOff: { TotHPlossCurYrSetoff: hpSetOff, TotBusLossSetoff: 0, TotOthSrcLossNoRaceHorseSetoff: 0 },
          LossRemAftSetOff: { BalHPlossCurYrAftSetoff: hpCarried, BalBusLossAftSetoff: 0, BalOthSrcLossNoRaceHorseAftSetoff: 0 },
        },
        ScheduleBFLA: {
          Salary: bflaPlain(after.sal), ...(after.hp ? { HP: bfla(after.hp) } : {}), BusProfExclSpecProf: bfla(after.bp),
          STCG20Per: bfla(after.st20), STCG30Per: bfla(0), STCGAppRate: bfla(after.stApp), STCGDTAARate: bfla(0), LTCG12_5Per: bfla(after.lt), LTCGDTAARate: bfla(0),
          ...(osIncome ? { OthSrcExclRaceHorse: { IncBFLA: { IncOfCurYrUndHeadFromCYLA: after.os, BFUnabsorbedDeprSetoff: 0, BFAllUs35Cl4Setoff: 0, IncOfCurYrAfterSetOffBFLosses: after.os } } } : {}),
          TotalBFLossSetOff: { TotBFLossSetoff: 0, TotUnabsorbedDeprSetoff: 0, TotAllUs35cl4Setoff: 0 },
          IncomeOfCurrYrAftCYLABFLA: gti,
        },
        ...(carried ? {
          ScheduleCFL: {
            CurrentAYloss: { LossSummaryDetail: { TotalHPPTILossCF: hpCarried, BusLossOthThanSpecLossCF: 0, LossFrmSpecBusCF: 0, LossFrmSpecifiedBusCF: 0, TotalSTCGPTILossCF: stclCarried, TotalLTCGPTILossCF: ltLoss, OthSrcLossRaceHorseCF: 0 } },
            TotalLossCFSummary: { LossSummaryDetail: { TotalHPPTILossCF: hpCarried, BusLossOthThanSpecLossCF: 0, LossFrmSpecBusCF: 0, LossFrmSpecifiedBusCF: 0, TotalSTCGPTILossCF: stclCarried, TotalLTCGPTILossCF: ltLoss, OthSrcLossRaceHorseCF: 0 } },
          },
        } : {}),
        ScheduleVIA: {
          UsrDeductUndChapVIA: { Section80C: old ? c80Claimed : 0, Section80CCD1B: old && !huf ? n0(d.section80CCD1B) : 0, Section80D: old ? d80.claimed : 0, TotPartBchapterVIA: old ? c80Claimed + (huf ? 0 : n0(d.section80CCD1B)) + d80.claimed : 0, TotPartCchapterVIA: 0, Section80TTA: c80tta, Section80TTB: c80ttb, TotPartCAandDchapterVIA: partCAD, TotalChapVIADeductions: old ? c80Claimed + (huf ? 0 : n0(d.section80CCD1B)) + d80.claimed + partCAD : 0 },
          DeductUndChapVIA: { Section80C: c80, Section80CCD1B: c80ccd1b, Section80D: d80.allowed, TotPartBchapterVIA: partBAllowed, TotPartCchapterVIA: 0, Section80TTA: c80tta, Section80TTB: c80ttb, TotPartCAandDchapterVIA: partCADAllowed, TotalChapVIADeductions: via },
        },
        ...(old && c80Claimed ? { Schedule80C: { Schedule80CDtls: (d.section80C ?? []).map((r) => ({ Amount: n0(r.amount), IdentificationNo: clean(r.id, 50) })), TotalAmt: c80Claimed } } : {}),
        ...(old && d80.allowed ? { Schedule80D: d80.schedule } : {}),
        ...(tx.si.length ? { ScheduleSI: { SplCodeRateTax: tx.si.map(([c, r, inc, t]) => ({ SecCode: c, SplRatePercent: r, SplRateInc: inc, SplRateIncTax: t })), TotSplRateInc: sum(tx.si.map((x) => x[2])), TotSplRateIncTax: tx.taxSpecial } } : {}),
        'PartB-TI': {
          Salaries: after.sal + hpIn.sal, IncomeFromHP: Math.max(0, hpTotal),
          ProfBusGain: { ProfGainNoSpecBus: bpPos, ProfGainSpecBus: 0, ProfGainSpecifiedBus: 0, ProfIncome115BBF: 0, TotProfBusGain: bpPos },
          CapGain: {
            ShortTerm: { ShortTerm20Per: cgAfter.st20, ShortTerm30Per: 0, ShortTermAppRate: cgAfter.stApp, ShortTermSplRateDTAA: 0, TotalShortTerm: cgAfter.st20 + cgAfter.stApp },
            LongTerm: { LongTerm12_5Per: ltBeforeHp, LongTermSplRateDTAA: 0, TotalLongTerm: ltBeforeHp },
            ShortTermLongTermTotal: cgAfter.st20 + cgAfter.stApp + ltBeforeHp, CapGains30Per115BBH: 0, TotalCapGains: cgAfter.st20 + cgAfter.stApp + ltBeforeHp,
          },
          IncFromOS: { OtherSrcThanOwnRaceHorse: osIncome, IncChargblSplRate: 0, FromOwnRaceHorse: 0, TotIncFromOS: osIncome },
          TotalTI: totalTI, CurrentYearLoss: hpSetOff, BalanceAfterSetoffLosses: totalTI - hpSetOff, BroughtFwdLossesSetoff: 0, GrossTotalIncome: gti,
          IncChargeTaxSplRate111A112: splIncome,
          DeductionsUndSchVIADtl: { PartBchapterVIA: partBAllowed + partCADAllowed, PartCchapterVIA: 0, TotDeductUndSchVIA: via },
          DeductionsUnder10Aor10AA: 0, TotalIncome: totalIncome,
          IncChargeableTaxSplRates: splIncome, NetAgricultureIncomeOrOtherIncomeForRate: 0, AggregateIncome: totalIncome - splIncome,
          LossesOfCurrentYearCarriedFwd: carried, DeemedIncomeUs115JC: 0,
        },
        PartB_TTI: {
          ComputationOfTaxLiability: {
            TaxPayableOnDeemedTI: { TaxDeemedTISec115JC: 0, SurchargeOnAboveCrore: 0, EducationCess: 0, TotalTax: 0 },
            TaxPayableOnTI: {
              TaxAtNormalRatesOnAggrInc: tx.taxNormal, TaxAtSpecialRates: tx.taxSpecial, RebateOnAgriInc: 0, TaxPayableOnTotInc: tx.taxNormal + tx.taxSpecial,
              Rebate87A: tx.rebate, TaxPayableOnRebate: tx.afterRebate,
              Surcharge25ofSI: 0, Surcharge25ofSIBeforeMarginal: 0, SurchargeOnAboveCroreBeforeMarginal: 0, SurchargeOnAboveCrore: 0, TotalSurcharge: 0,
              EducationCess: tx.cess, GrossTaxLiability: tx.liability,
            },
            GrossTaxPayable: tx.liability, CreditUS115JD: 0, TaxPayAfterCreditUs115JD: tx.liability,
            TaxRelief: { Section89: 0, TotTaxRelief: 0 }, NetTaxLiability: tx.liability,
            IntrstPay: { IntrstPayUs234A: ii.i234A, IntrstPayUs234B: ii.i234B, IntrstPayUs234C: ii.i234C, LateFilingFee234F: ii.fee234F, TotalIntrstPay: interest },
            AggregateTaxInterestLiability: aggregate,
          },
          TaxPaid: { TaxesPaid: { AdvanceTax: advance, TDS: salaryTds + otherTds, TCS: tcs, SelfAssessmentTax: selfTax, TotalTaxesPaid: paid }, BalTaxPayable: Math.max(0, aggregate - paid) },
          Refund: { RefundDue: Math.max(0, paid - aggregate), BankAccountDtls: { BankDtlsFlag: 'Y', AddtnlBankDetails: [bankRow(i.bank)] } },
          AssetOutIndiaFlag: 'NO',
        },
        ...(payments.length ? { ScheduleIT: { TaxPayment: payments.map((x) => ({ BSRCode: x.bsr, DateDep: x.date, SrlNoOfChaln: x.serial, Amt: n0(x.amount) })), TotalTaxPayments: advance + selfTax } } : {}),
        ...(employers.some((x) => x.tan) ? { ScheduleTDS1: { TDSonSalary: employers.filter((x) => x.tan).map((x) => ({ EmployerOrDeductorOrCollectDetl: { TAN: x.tan, EmployerOrDeductorOrCollecterName: clean(x.name, 125) }, IncChrgSal: n0(x.gross), TotalTDSSal: n0(x.tds) })), TotalTDSonSalaries: salaryTds } } : {}),
        ...(i.tdsOther?.length ? { ScheduleTDS2: { TDSOthThanSalaryDtls: i.tdsOther.map((x) => ({ TDSCreditName: 'S', TANOfDeductor: x.tan, TDSSection: x.section, TaxDeductCreditDtls: { TaxDeductedOwnHands: n0(x.tds), TaxClaimedOwnHands: n0(x.tds) }, GrossAmount: n0(x.amount), HeadOfIncome: x.head ?? 'OS', AmtCarriedFwd: 0 })), TotalTDSonOthThanSals: otherTds } } : {}),
        ...(i.tcs?.length ? { ScheduleTCS: { TCS: i.tcs.map((x) => ({ TCSCreditOwner: '1', EmployerOrDeductorOrCollectTAN: x.tan, TCSCurrFYDtls: { TCSAmtCollOwnHand: n0(x.tcs) }, TCSClaimedThisYearDtls: { TCSAmtCollOwnHand: n0(x.tcs) }, AmtCarriedFwd: 0 })), TotalSchTCS: tcs } } : {}),
        Verification: verification,
      },
    },
  };
  const summary = {
    businessIncome: bp, presumptiveIncome: presumptive, profitBeforeTax: bk ? pbt : 0, depreciationAllowed: itDep,
    grossTotalIncome: gti, totalIncome, tax: tx.liability, interest, paid, payable: Math.max(0, aggregate - paid), refund: Math.max(0, paid - aggregate), lossCarriedForward: carried,
  };
  return { json: issues.length ? null : json, issues, summary };
}
