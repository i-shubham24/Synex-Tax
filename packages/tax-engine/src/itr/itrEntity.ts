import { clean, floor100, interestAndFee, ISO, LAST_DAY_139_4, monthsFrom, n0, sum, tanIssues, type ItrBank, type ItrIssue, type ItrOtherTds, type ItrTaxPayment, type ItrTcs } from './itrCommon.js';
import { cgGain, type CgSale } from './itr2Json.js';
import { blockDepreciation, DEP_BLOCKS, type DepBlock, type DepBlockKind } from './itr3Json.js';

/**
 * Shared engine for the ITR-5 (firm or LLP) and ITR-6 (domestic company) JSON writers for Assessment
 * Year 2026-27 (income of 2025-26). Field names, required parts and limits come from the Department's
 * schemas ITR-5_2026_Main_V1.1 (latest release 05 Aug 2026) and ITR-6_2026_Main_V1.0 (04 Aug 2026),
 * kept in packages/tax-engine/schemas/itr; every test output is validated against them. Arithmetic
 * links between schedules follow the Department's ITR-5 validation rules for AY 2026-27 (version 1.0 of
 * 07 Jul 2026) and ITR-6 validation rules (version 1.0); rule numbers below are from those documents.
 *
 * Covered: a resident entity keeping regular books, with a summary trading account and profit and loss
 * account, a summary balance sheet, depreciation under section 32(1)(ii) by block, Schedule BP worked
 * from these, let-out house property, capital gains (111A, 112A, other short-term and other long-term,
 * not land or building), other sources (interest, dividends, other), tax at the entity rates with
 * surcharge and cess, interest under sections 234A, 234B and 234C and the fee under section 234F.
 *
 * Not covered, reported as issues: losses of any head (current or brought forward), presumptive income,
 * speculative or specified business, disallowances other than section 40(b) for firms, Chapter VI-A
 * deductions and section 10AA, transfer pricing (section 92E), foreign assets or income, non-residents.
 */

export type EntityForm = 5 | 6;

export interface EntityAddress { residenceNo: string; locality: string; city: string; stateCode: string; pin: string }

export interface EntityInfo {
  name: string;
  pan: string;
  /** Date of formation or incorporation, YYYY-MM-DD. */
  formedOn: string;
  address: EntityAddress;
  mobile: string;
  email: string;
}

/** The person verifying the return: a partner (ITR-5) or a director or principal officer (ITR-6). */
export interface EntitySignatory { name: string; fatherName: string; pan: string; capacity: string; place: string }

export interface EntityFiling { section: 11 | 12 | 17; originalAck?: string; originalFiledOn?: string }

/** Tax audit under section 44AB: the details the return takes from Form 3CA or 3CB and 3CD as filed. */
export interface EntityAudit { firmName: string; firmPan: string; reportDate: string; ack3CD: string }

export interface EntityTrading { salesGoods?: number; salesServices?: number; professionReceipts?: number; openingStock?: number; purchases?: number; directExpenses?: number; closingStock?: number }

/** Income credited to the profit and loss account other than the gross profit. */
export interface EntityOtherIncome {
  rent?: number; interest?: number; dividends?: number;
  /** Profit on sale of investments (shares, units, other capital assets) as booked. */
  profitOnInvestments?: number;
  misc?: number;
}

export interface EntityExpenses {
  freight?: number; consumables?: number; powerFuel?: number; rent?: number; repairsBuilding?: number; repairsMachinery?: number;
  salaries?: number; bonus?: number; providentFund?: number; staffWelfare?: number; insurance?: number; salesPromotion?: number; advertisement?: number;
  commission?: number; professionalFees?: number; hotel?: number; travel?: number; conveyance?: number; telephone?: number; ratesTaxes?: number; auditFee?: number;
  other?: { nature: string; amount: number }[];
}

export interface EntityBooks {
  trading: EntityTrading;
  otherIncome?: EntityOtherIncome;
  expenses?: EntityExpenses;
  /** Interest debited to the profit and loss account, to persons other than partners (resident lenders). */
  interestOthers?: number;
  bookDepreciation?: number;
  depreciation?: DepBlock[];
  /** Provision for current tax and deferred tax debited below the profit before tax. */
  currentTax?: number;
  deferredTax?: number;
  /** Section 44AB(a) proviso: cash receipts and cash payments each within 5% of the totals. */
  cashReceiptsWithin5Pct?: boolean;
  cashPaymentsWithin5Pct?: boolean;
}

export interface EntityHouse { address: string; city: string; stateCode: string; pin: string; rent: number; municipalTax?: number; interest?: number; loan?: { from: 'B' | 'I'; lender: string; account: string; sanctionedOn: string; amount: number; outstanding: number } }

export interface EntityOtherSources { savingsInterest?: number; depositInterest?: number; otherInterest?: number; dividends?: number; other?: number; otherDescription?: string }

export interface EntityCommonInput {
  softwareId: string;
  createdOn: string; // YYYY-MM-DD, also the date of filing used for interest
  intermediaryCity: string;
  entity: EntityInfo;
  signatory: EntitySignatory;
  filing: EntityFiling;
  natures: { code: string; tradeName?: string }[];
  books: EntityBooks;
  audit?: EntityAudit;
  houses?: EntityHouse[];
  capitalGains?: CgSale[];
  otherSources?: EntityOtherSources;
  tdsOther?: ItrOtherTds[];
  tcs?: ItrTcs[];
  taxPayments?: ItrTaxPayment[];
  /** Interest under 234C as worked by the user; required where capital gains or dividends arise (proviso to 234C(1)). */
  interest234C?: number;
  bank: ItrBank;
}

export interface Writer { json: Record<string, unknown> | null; issues: ItrIssue[]; summary: Record<string, number> }

const DATE_RANGE_5 = ['Upto15Of6', 'Upto15Of9', 'Up16Of9To15Of12', 'Up16Of12To15Of3', 'Up16Of3To31Of3'] as const;
const DATE_RANGE_6 = ['Upto15Of6', 'Up16Of6To15Of9', 'Up16Of9To15Of12', 'Up16Of12To15Of3', 'Up16Of3To31Of3'] as const;
const OS_RANGE = ['Upto15Of6', 'Up16Of6To15Of9', 'Up16Of9To15Of12', 'Up16Of12To15Of3', 'Up16Of3To31Of3'] as const;

/** Quarter of 2025-26 in which a date falls, as the schedules split income: to 15 Jun, 15 Sep, 15 Dec, 15 Mar, 31 Mar. */
export const periodOf = (date: string) => {
  const md = date.slice(5);
  if (date.slice(0, 4) === '2025') return md <= '06-15' ? 0 : md <= '09-15' ? 1 : md <= '12-15' ? 2 : 3;
  return md <= '03-15' ? 3 : 4;
};

const zeroRange = (keys: readonly string[]) => ({ DateRange: Object.fromEntries(keys.map((k) => [k, 0])) as Record<string, number> });
function spread(keys: readonly string[], income: number, byPeriod: number[]) {
  const r = zeroRange(keys);
  let left = income;
  byPeriod.forEach((g, k) => { const t = Math.min(left, Math.max(0, g)); r.DateRange[keys[k]] = t; left -= t; });
  if (left > 0) r.DateRange[keys[4]] += left;
  return r;
}

const ded48 = (form: EntityForm, cost: number, improvement: number, expenses: number) => ({ ...(form === 5 ? { Reduction48iii: 0 } : {}), AquisitCost: cost, ImproveCost: improvement, ExpOnTrans: expenses, TotalDedn: cost + improvement + expenses });

/**
 * Surcharge with marginal relief. `bands` are [income above, rate] in ascending order. The provisos to
 * the surcharge paragraphs of Part I of the First Schedule to the Finance Act cap income-tax and surcharge
 * at the tax (with surcharge) on a total income equal to the threshold plus the income above it.
 * `taxAt(x)` gives the income-tax on a total income of x.
 */
export function surchargeWithRelief(income: number, tax: number, bands: Array<[number, number]>, taxAt: (x: number) => number) {
  let band = -1;
  bands.forEach(([over], k) => { if (income > over) band = k; });
  if (band < 0) return { surcharge: 0, beforeRelief: 0, relief: 0 };
  const [threshold, rate] = bands[band];
  const beforeRelief = Math.round(tax * rate);
  const lowerRate = band > 0 ? bands[band - 1][1] : 0;
  const atThreshold = taxAt(threshold);
  const cap = atThreshold + Math.round(atThreshold * lowerRate) + (income - threshold);
  const relief = Math.max(0, tax + beforeRelief - cap);
  return { surcharge: beforeRelief - relief, beforeRelief, relief };
}

/**
 * 234C for an assessee not on 44AD or 44ADA: 1% a month on the shortfall of advance tax paid by
 * 15 Jun, 15 Sep and 15 Dec (three months each) against 15%, 45% and 75% of the tax due on the returned
 * income, and for one month on the shortfall by 15 Mar against 100% (234C(1)(a)); none on the first
 * instalment where 12% was paid, or on the second where 36% was paid (provisos). The amount is rounded
 * down to Rs 100 (rule 119A). No interest where the tax due is under Rs 10,000 (section 208).
 */
export function interest234C(taxDue: number, payments: ItrTaxPayment[]) {
  if (taxDue < 10000) return 0;
  const paidBy = (d: string) => sum(payments.filter((p) => p.kind === 'ADVANCE' && p.date <= d).map((p) => n0(p.amount)));
  const steps: Array<[string, number, number, number]> = [['2025-06-15', 0.15, 3, 0.12], ['2025-09-15', 0.45, 3, 0.36], ['2025-12-15', 0.75, 3, 0], ['2026-03-15', 1, 1, 0]];
  let total = 0;
  for (const [date, share, months, safe] of steps) {
    const paid = paidBy(date);
    if (safe && paid >= taxDue * safe) continue;
    total += floor100(taxDue * share - paid) * 0.01 * months;
  }
  return n0(total);
}

/** Checks every entity return needs. */
export function entityChecks(i: EntityCommonInput, form: EntityForm): ItrIssue[] {
  const issues: ItrIssue[] = [];
  const err = (field: string, message: string) => issues.push({ field, message });
  const e = i.entity;
  if (!/^SW\d{8}$/.test(i.softwareId)) err('softwareId', 'The Department issues a software ID (SW and 8 digits) to registered e-return intermediaries; it is needed to write the JSON.');
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(e.pan)) err('pan', 'PAN is not valid.');
  if (!ISO.test(e.formedOn) || e.formedOn > '2026-03-31') err('formedOn', 'Date of formation or incorporation is required, on or before 31 Mar 2026.');
  if (!ISO.test(i.createdOn)) err('createdOn', 'Date is required.');
  if (!clean(e.name, 125)) err('name', 'Name is required.');
  if (!/^[1-9]\d{5}$/.test(e.address.pin)) err('pin', 'PIN code must be 6 digits.');
  if (!/^[1-9]\d{9}$/.test(e.mobile)) err('mobile', 'Mobile number must be 10 digits (validation rule 4).');
  if (!/^\d{2}$/.test(e.address.stateCode)) err('stateCode', 'State code must be two digits from the Department list.');
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(i.bank.ifsc)) err('ifsc', 'IFSC is not valid.');
  if (!/^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/.test(i.signatory.pan)) err('signatory', 'The return is verified by an individual: give an individual PAN (fourth letter P) for the person signing.');
  if (!clean(i.signatory.fatherName, 125) || !clean(i.signatory.name, 125)) err('signatory', "Name and father's name of the person verifying the return are required.");
  if (i.filing.section === 17 && (!/^\d{15}$/.test(i.filing.originalAck ?? '') || !ISO.test(i.filing.originalFiledOn ?? ''))) err('originalAck', 'A revised return needs the acknowledgement number and date of the original return.');
  if (i.filing.section !== 11 && i.createdOn > LAST_DAY_139_4) err('section', 'A belated or revised return for AY 2026-27 can be filed only up to 31 Dec 2026 (section 139(4) and 139(5)).');
  if (!i.natures.length) err('natures', 'Nature of business is required (validation rule 17).');
  for (const nb of i.natures) if (!/^\d{5}$/.test(nb.code)) err('natures', `Business code ${nb.code} must be the 5-digit code from the Department list.`);
  issues.push(...tanIssues([...(i.tdsOther ?? []), ...(i.tcs ?? [])], 'tan'));
  for (const p of i.taxPayments ?? []) if (!/^\d{7}$/.test(p.bsr) || !ISO.test(p.date)) err('taxPayments', 'Each challan needs a 7-digit BSR code and the date of deposit.');
  return issues;
}

export interface EntityBuildOptions {
  form: EntityForm;
  /** Firm only: partner rows with the interest and remuneration debited. */
  partners?: Array<{ interest: number; rate: number; remuneration: number; working: boolean }>;
  /** Taxes on normal income and on special-rate income; returns the liability parts. */
  tax: (normalIncome: number, special: { st111A: number; lt112A: number; lt112: number }, totalIncome: number) => EntityTax;
  dueDate: string;
}

export interface EntityTax {
  normal: number; // tax on income at the normal rate
  special: number; // tax at special rates
  si: Array<[string, number, number, number]>; // Schedule SI rows: code, rate, income, tax
  surcharge: number;
  surchargeBeforeRelief: number;
  cess: number;
  liability: number; // tax, surcharge and cess
}

/** Works the books, the heads of income, set-off checks, tax, interest and the common schedules. */
export function buildEntity(i: EntityCommonInput, o: EntityBuildOptions) {
  const form = o.form;
  const issues: ItrIssue[] = [];
  const err = (field: string, message: string) => issues.push({ field, message });
  const bk = i.books;

  // Trading account (Part A-Trading account) and profit and loss account (Part A-P&L).
  const tr = bk.trading ?? {};
  const goods = n0(tr.salesGoods), services = n0(tr.salesServices), profRcpt = n0(tr.professionReceipts);
  const salesTotal = goods + services;
  const revenue = salesTotal + profRcpt; // duties collected are taken as nil (turnover net of GST)
  const closing = n0(tr.closingStock), opening = n0(tr.openingStock), purchases = n0(tr.purchases), direct = n0(tr.directExpenses);
  const tradingCredit = revenue + closing;
  const grossProfit = tradingCredit - opening - purchases - direct;
  const oi = bk.otherIncome ?? {};
  const rentInc = n0(oi.rent), interestInc = n0(oi.interest), divInc = n0(oi.dividends), invProfit = n0(oi.profitOnInvestments), misc = n0(oi.misc);
  const otherIncomeTotal = rentInc + interestInc + divInc + invProfit + misc;
  const credits = grossProfit + otherIncomeTotal; // item 15 = 13 + 14 (rule 111)
  const ex = bk.expenses ?? {};
  const e = (v?: number) => n0(v);
  const empTotal = e(ex.salaries) + e(ex.bonus) + e(ex.providentFund);
  const otherRows = (ex.other ?? []).filter((r) => n0(r.amount) > 0);
  const otherTotal = sum(otherRows.map((r) => n0(r.amount)));
  const partners = o.partners ?? [];
  const partnerRemuneration = form === 5 ? sum(partners.map((p) => n0(p.remuneration))) : 0;
  const partnerInterest = form === 5 ? sum(partners.map((p) => n0(p.interest))) : 0;
  const debitsBeforeInterest = e(ex.freight) + e(ex.consumables) + e(ex.powerFuel) + e(ex.rent) + e(ex.repairsBuilding) + e(ex.repairsMachinery) + empTotal + e(ex.insurance)
    + e(ex.staffWelfare) + e(ex.salesPromotion) + e(ex.advertisement) + e(ex.commission) + e(ex.professionalFees) + e(ex.hotel) + e(ex.travel) + e(ex.conveyance) + e(ex.telephone)
    + e(ex.ratesTaxes) + e(ex.auditFee) + partnerRemuneration + otherTotal;
  const pbidta = credits - debitsBeforeInterest; // item 51 (rule 121)
  const interestOthers = n0(bk.interestOthers);
  const interestExp = interestOthers + partnerInterest; // item 52iii (rule 122)
  const bookDep = n0(bk.bookDepreciation);
  const pbt = pbidta - interestExp - bookDep; // item 54 = 51 - 52iii - 53 (rule 123)
  const currTax = n0(bk.currentTax), defTax = n0(bk.deferredTax);
  const pat = pbt - currTax - defTax; // item 57 (rule 125)

  if (revenue <= 0) err('books', 'Turnover or gross receipts in the books are required.');
  if (profRcpt && salesTotal) err('books', 'Give either business sales or professional receipts; a return with both is not written by this file.');

  // Section 44AB: (a) business turnover above Rs 1 crore, or Rs 10 crore where cash receipts and cash payments are each within 5%;
  // (b) professional receipts above Rs 50 lakh. A company is audited under the Companies Act in any case.
  const within5 = !!(bk.cashReceiptsWithin5Pct && bk.cashPaymentsWithin5Pct);
  const liable44AB = salesTotal > 100000000 || (salesTotal > 10000000 && !within5) || profRcpt > 5000000;
  if (liable44AB && !i.audit) err('audit', 'A tax audit under section 44AB applies: give the auditor firm, its PAN, the date of the report and the acknowledgement number of Form 3CD (validation rules 2 and 164).');
  if (i.audit) {
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(i.audit.firmPan)) err('audit', 'Auditor PAN is not valid.');
    if (!/^\d{15}$/.test(i.audit.ack3CD)) err('audit', 'Acknowledgement number of the audit report must be 15 digits.');
    if (!ISO.test(i.audit.reportDate) || i.audit.reportDate > i.createdOn) err('audit', 'Date of furnishing the audit report must be on or before the date of filing (validation rule 15).');
  }

  // Depreciation under section 32(1)(ii) by block; section 50 cases (sale value above the block) are not written.
  const blocks = (bk.depreciation ?? []).map((x) => ({ x, d: blockDepreciation(x) }));
  for (const { x, d } of blocks) {
    if (!(x.block in DEP_BLOCKS)) err('depreciation', `Block ${x.block} is not one this file writes.`);
    if (d.sold > d.opening + d.addFull) err('depreciation', `Sale value in the ${d.rate}% block is above its written down value; section 50 applies, which this file does not write.`);
  }
  if (new Set(blocks.map((y) => y.x.block)).size !== blocks.length) err('depreciation', 'Each block of assets can be entered once.');
  const depOf = (k: DepBlockKind) => sum(blocks.filter((y) => y.x.block === k).map((y) => y.d.total));
  const itDep = sum(blocks.map((y) => y.d.total));
  if (bookDep > 0 && !blocks.length) err('depreciation', 'Depreciation is debited in the books: give the blocks of assets so depreciation under section 32 can be worked (Schedule DEP).');

  // Section 40(b) for a firm: interest to a partner above 12% simple a year, and remuneration to partners above
  // the limit on book profit (Rs 3 lakh or 90% of the first Rs 6 lakh, whichever is more, and 60% of the rest,
  // as substituted by the Finance (No. 2) Act 2024), are not allowed; remuneration only to working partners.
  const interestDisallowed = n0(sum(partners.map((p) => (p.rate > 12 && p.rate > 0 ? (n0(p.interest) * (p.rate - 12)) / p.rate : 0))));
  const nonWorking = sum(partners.filter((p) => !p.working).map((p) => n0(p.remuneration)));

  // Other heads credited to the profit and loss account are taken out of Schedule BP (items 3a to 3e) and taxed under their heads.
  const houses = i.houses ?? [];
  const hpRows = houses.map((h, k) => {
    const alv = n0(h.rent);
    const tax = n0(h.municipalTax);
    const balance = Math.max(0, alv - tax);
    const thirty = Math.round(balance * 0.3); // 24(a)
    const interest = n0(h.interest); // 24(b), let-out property
    if (alv <= 0) err('houses', `Property ${k + 1} needs the rent (validation rule 198).`);
    if (interest > 0 && !h.loan) err('houses', `Property ${k + 1}: interest under section 24(b) needs the loan details (validation rule 206).`);
    return {
      income: balance - thirty - interest,
      row: {
        HPSNo: k + 1,
        AddressDetailWithZipCode: { AddrDetail: clean(h.address, 200), CityOrTownOrDistrict: clean(h.city, 50), StateCode: h.stateCode, CountryCode: '91', PinCode: Number(h.pin) },
        PropertyOwner: 'SE', PropCoOwnedFlg: 'NO', AssessePercentShareProp: 100, ifLetOut: 'Y',
        Rentdetails: {
          AnnualLetableValue: alv, RentNotRealized: 0, LocalTaxes: tax, TotalUnrealizedAndTax: tax, BalanceALV: balance, AnnualOfPropOwned: balance, ThirtyPercentOfBalance: thirty, IntOnBorwCap: interest,
          ...(interest > 0 && h.loan ? { Section24B: { Section24BDtls: [{ LoanTknFrom: h.loan.from, BankOrInstnName: clean(h.loan.lender, 125), LoanAccNoOfBankOrInstnRefNo: clean(h.loan.account, 20), DateofLoan: h.loan.sanctionedOn, TotalLoanAmt: n0(h.loan.amount), LoanOutstndngAmt: n0(h.loan.outstanding), InterestUs24B: interest }], TotalInterestUs24B: interest } } : {}),
          TotalDeduct: thirty + interest, ...(form === 6 ? { ArrearsUnrealizedRentRcvd: 0 } : {}), IncomeOfHP: balance - thirty - interest,
        },
      },
    };
  });
  const hpTotal = sum(hpRows.map((r) => r.income));
  if (hpRows.some((r) => r.income < 0)) err('houses', 'A loss from house property and its set-off are not written by this file.');

  const os = i.otherSources ?? {};
  const sav = n0(os.savingsInterest), dep = n0(os.depositInterest), othInt = n0(os.otherInterest), div = n0(os.dividends), oth = n0(os.other);
  const osIncome = sav + dep + othInt + div + oth;

  const sales = (i.capitalGains ?? []).map((s) => ({ s, g: cgGain(s) }));
  for (const { s } of sales) {
    if (!/^2025-(0[4-9]|1[0-2])-\d{2}$|^2026-0[1-3]-\d{2}$/.test(s.date)) err('capitalGains', `Transfer date ${s.date} is not in 2025-26.`);
    if (s.kind === '112A' && !/^IN[0-9A-Z]{10}$/.test(s.isin ?? '')) err('capitalGains', `${s.name ?? 'A 112A sale'} needs its ISIN for Schedule 112A.`);
    if (s.kind === '112A' && s.acquiredBefore1Feb2018) err('capitalGains', 'Shares or units acquired before 1 Feb 2018 (grandfathering under section 55(2)(ac)) are not written by this file for an entity.');
  }
  const of = (k: CgSale['kind']) => sales.filter((x) => x.s.kind === k);
  const net = (k: CgSale['kind']) => sum(of(k).map((x) => x.g.gain));
  const st20 = net('111A'), stApp = net('STCG'), ltA = net('112A'), ltO = net('LTCG');
  if ([st20, stApp, ltA, ltO].some((x) => x < 0)) err('capitalGains', 'A net capital loss in any class and its set-off under section 70 or 74 are not written by this file.');
  const cgIncome = Math.max(0, st20) + Math.max(0, stApp) + Math.max(0, ltA) + Math.max(0, ltO);

  // Schedule BP (rules 212 to 232): A1 profit before tax, less other heads credited (3a to 3c), plus disallowances (A14 to A26), plus book
  // depreciation less depreciation allowed (A11, A12).
  const less = { hp: rentInc, cg: invProfit, osDiv: divInc, osOther: interestInc };
  const a6 = pbt - less.hp - less.cg - less.osDiv - less.osOther;
  const a10 = a6; // nothing debited for other heads or exempt income
  const a13 = a10 + bookDep - itDep; // 10 + 11 - 12iii (rule 215)
  const dis40 = form === 5 ? interestDisallowed + nonWorking : 0;
  // Book profit for 40(b)(v): Explanation 3, the profit worked under sections 28 to 44D before the remuneration to partners.
  const bookProfit = a13 + dis40 + partnerRemuneration;
  const remLimit = form === 5 ? Math.max(300000, Math.round(0.9 * Math.min(Math.max(bookProfit, 0), 600000))) + Math.round(0.6 * Math.max(0, bookProfit - 600000)) : 0;
  const workingRem = partnerRemuneration - nonWorking;
  const remDisallowed = form === 5 ? Math.max(0, workingRem - remLimit) : 0;
  const a16 = dis40 + remDisallowed; // A16 = Part A-OI 8Aj (rule 220)
  const a26 = a16;
  const a34 = a13 + a26; // 13 + 26 - 33 (rule 230)
  const bp = a34;
  if (bp < 0) err('books', 'The business shows a loss; set-off under section 71 and carry forward under section 72 are not written by this file.');
  if (less.hp > 0 && !houses.length) err('houses', 'Rent is credited in the books: give the let-out property for Schedule HP (validation rule 209).');
  if (less.cg > 0 && !sales.length) err('capitalGains', 'Profit on investments is credited in the books: give the sales for Schedule CG (validation rule 257).');
  if ((less.osDiv > 0 && div < less.osDiv) || (less.osOther > 0 && sav + dep + othInt < less.osOther)) err('otherSources', 'Interest and dividends credited in the books must be offered under other sources at least in the same amount (validation rules 210 and 260).');

  // Total income (Part B-TI). No losses, so gross total income is the sum of the heads.
  const gti = Math.max(0, hpTotal) + Math.max(0, bp) + cgIncome + osIncome;
  const totalIncome = Math.round(gti / 10) * 10; // section 288A
  const splIncome = Math.max(0, st20) + Math.max(0, ltA) + Math.max(0, ltO);
  const normalIncome = Math.max(0, totalIncome - splIncome);
  const tx = o.tax(normalIncome, { st111A: Math.max(0, st20), lt112A: Math.max(0, ltA), lt112: Math.max(0, ltO) }, totalIncome);

  const otherTds = sum((i.tdsOther ?? []).map((t) => n0(t.tds)));
  const tcs = sum((i.tcs ?? []).map((t) => n0(t.tcs)));
  const payments = i.taxPayments ?? [];
  const advance = sum(payments.filter((t) => t.kind === 'ADVANCE').map((t) => n0(t.amount)));
  const selfTax = sum(payments.filter((t) => t.kind === 'SELF').map((t) => n0(t.amount)));
  const needs234C = (sales.length > 0 || div > 0) && i.interest234C === undefined;
  if (needs234C && tx.liability - otherTds - tcs >= 10000) err('interest234C', 'With capital gains or dividends, 234C depends on when they arose (proviso to section 234C(1)); give the 234C interest as worked.');
  const entered234C = i.interest234C ?? interest234C(Math.max(0, tx.liability - otherTds - tcs), payments);
  // 234F applies to every firm and company that files late: none of them has a basic exemption (exemption passed as -1).
  const ii = interestAndFee({ liability: tx.liability, tdsTcs: otherTds + tcs, payments, filedOn: i.createdOn, dueDate: o.dueDate, totalIncome, exemption: -1, entered234C });
  const interest = ii.i234A + ii.i234B + ii.i234C + ii.fee234F;
  const aggregate = tx.liability + interest;
  const paid = otherTds + tcs + advance + selfTax;

  // Schedules shared by both forms.
  const dr = form === 5 ? DATE_RANGE_5 : DATE_RANGE_6;
  const byPeriod = (ks: CgSale['kind'][]) => [0, 1, 2, 3, 4].map((m) => sum(sales.filter((x) => ks.includes(x.s.kind) && periodOf(x.s.date) === m).map((x) => x.g.gain)));
  const agg = (k: CgSale['kind']) => of(k).reduce((a, x) => ({ sale: a.sale + x.g.sale, cost: a.cost + x.g.cost, imp: a.imp + x.g.improvement, exp: a.exp + x.g.expenses }), { sale: 0, cost: 0, imp: 0, exp: 0 });
  const zero94 = () => ({ FullValueConsdRecvUnqshr: 0, FairMrktValueUnqshr: 0, FullValueConsdSec50CA: 0, FullValueConsdOthUnqshr: 0, FullConsideration: 0, DeductSec48: ded48(form, 0, 0, 0), BalanceCG: 0, LossSec94of7Or94of8: 0, CapgainonAssets: 0 });
  const a111 = agg('111A'), aSt = agg('STCG'), aLt = agg('LTCG');
  const rows112A = of('112A');
  const sch112A = rows112A.map(({ s, g }) => ({
    ShareOnOrBefore: 'AE', ISINCode: s.isin, ShareUnitName: clean(s.name || s.isin, 125),
    TotSaleValue: g.sale, CostAcqWithoutIndx: n0(s.cost), AcquisitionCost: g.cost, LTCGBeforelower6and11: 0,
    FairMktValuePerShareunit: 0, TotFairMktValueCapAst: 0, ExpExclCnctTransfer: g.expenses + g.improvement,
    TotalDeductions: g.cost + g.expenses + g.improvement, Balance: g.gain,
  }));
  const sumRow = (k: keyof (typeof sch112A)[number]) => sum(sch112A.map((r) => Number(r[k])));
  const cgRange = (k: string, v: number, ks: CgSale['kind'][]) => [k, spread(dr, v, byPeriod(ks))] as const;
  const scheduleCG = sales.length ? {
    ShortTermCapGain: {
      SlumpSaleInStcg: { FMV11UAEii: 0, FMV11UAEiii: 0, FullConsideration: 0, NetWorthOfDivision: 0, CapgainonAssets: 0 },
      ...(a111.sale ? { EquityMFonSTT: [{ MFSectionCode: '1A', EquityMFonSTTDtls: { FullConsideration: a111.sale, DeductSec48: ded48(form, a111.cost, a111.imp, a111.exp), BalanceCG: st20, LossSec94of7Or94of8: 0, CapgainonAssets: st20 } }] } : {}),
      NRITransacSec48Dtl: { NRItaxSTTPaid: 0, NRItaxSTTNotPaid: 0 },
      NRISecur115AD: zero94(),
      SaleOnOtherAssets: {
        FullValueConsdRecvUnqshr: 0, FairMrktValueUnqshr: 0, FullValueConsdSec50CA: 0, FullValueConsdOthUnqshr: aSt.sale, FullConsideration: aSt.sale,
        DeductSec48: ded48(form, aSt.cost, aSt.imp, aSt.exp), BalanceCG: stApp, LossSec94of7Or94of8: 0, DeemedSTCGDeprAsset: 0,
        ExemptionOrDednUs54: { ExemptionGrandTotal: 0 }, CapgainonAssets: stApp,
      },
      TotalAmtDeemedStcg: 0, PassThrIncNatureSTCG: 0, TotalAmtNotTaxUsDTAAStcg: 0, TotalAmtTaxUsDTAAStcg: 0,
      TotalSTCG: st20 + stApp,
    },
    LongTermCapGain: {
      SlumpSaleInLtcgDtls: {},
      SaleOfEquityShareUs112A: { CapgainonAssets: ltA },
      NRISaleOfEquityShareUs112A: { CapgainonAssets: 0 },
      SaleofAssetNADtls: aLt.sale ? {
        SaleofAssetNA: {
          FullValueConsdRecvUnqshr: 0, FairMrktValueUnqshr: 0, FullValueConsdSec50CA: 0, FullValueConsdOthUnqshr: aLt.sale, FullConsideration: aLt.sale,
          DeductSec48: ded48(form, aLt.cost, aLt.imp, aLt.exp), BalanceCG: ltO, CapgainonAssets: ltO,
        },
      } : {},
      TotalAmtDeemedLtcg: 0, PassThrIncNatureLTCG: 0, TotalAmtNotTaxUsDTAALtcg: 0, TotalAmtTaxUsDTAALtcg: 0,
      TotalLTCG: ltA + ltO,
    },
    DeducClaimInfo: { TotDeductClaim: 0 },
    CurrYrLosses: {
      InLossSetOff: { StclSetoff20Per: 0, StclSetoff30Per: 0, StclSetoffAppRate: 0, StclSetoffDTAARate: 0, LtclSetOff12_5Per: 0, LtclSetOffDTAARate: 0 },
      InStcg20Per: { CurrYearIncome: st20, StclSetoff30Per: 0, StclSetoffAppRate: 0, StclSetoffDTAARate: 0, CurrYrCapGain: st20 },
      InStcg30Per: { CurrYearIncome: 0, StclSetoff20Per: 0, StclSetoffAppRate: 0, StclSetoffDTAARate: 0, CurrYrCapGain: 0 },
      InStcgAppRate: { CurrYearIncome: stApp, StclSetoff20Per: 0, StclSetoff30Per: 0, StclSetoffDTAARate: 0, CurrYrCapGain: stApp },
      InStcgDTAARate: { CurrYearIncome: 0, StclSetoff20Per: 0, StclSetoff30Per: 0, StclSetoffAppRate: 0, CurrYrCapGain: 0 },
      InLtcg12_5Per: { CurrYearIncome: ltA + ltO, StclSetoff20Per: 0, StclSetoff30Per: 0, StclSetoffAppRate: 0, StclSetoffDTAARate: 0, LtclSetOffDTAARate: 0, CurrYrCapGain: ltA + ltO },
      InLtcgDTAARate: { CurrYearIncome: 0, StclSetoff20Per: 0, StclSetoff30Per: 0, StclSetoffAppRate: 0, StclSetoffDTAARate: 0, LtclSetOff12_5Per: 0, CurrYrCapGain: 0 },
      TotLossSetOff: { StclSetoff20Per: 0, StclSetoff30Per: 0, StclSetoffAppRate: 0, StclSetoffDTAARate: 0, LtclSetOff12_5Per: 0, LtclSetOffDTAARate: 0 },
      LossRemainSetOff: { StclSetoff20Per: 0, StclSetoff30Per: 0, StclSetoffAppRate: 0, StclSetoffDTAARate: 0, LtclSetOff12_5Per: 0, LtclSetOffDTAARate: 0 },
    },
    AccruOrRecOfCG: Object.fromEntries([
      cgRange('ShortTermUnder20Per', st20, ['111A']), [ 'ShortTermUnder30Per', zeroRange(dr)], cgRange('ShortTermUnderAppRate', stApp, ['STCG']), ['ShortTermUnderDTAARate', zeroRange(dr)],
      cgRange('LongTermUnder12_5Per', ltA + ltO, ['112A', 'LTCG']), ['LongTermUnderDTAARate', zeroRange(dr)], ...(form === 6 ? [['VDATrnsfGainsUnder30Per', zeroRange(dr)] as const] : []),
    ]),
    IncChargeableHeadCapGain: cgIncome,
    SumOfCGIncm: cgIncome,
    IncmFromVDATrnsf: 0,
  } : undefined;

  const schedule112A = rows112A.length ? { Schedule112ADtls: sch112A, SaleValue112A: sumRow('TotSaleValue'), CostAcqWithoutIndx112A: sumRow('CostAcqWithoutIndx'), AcquisitionCost112A: sumRow('AcquisitionCost'), LTCGBeforelowerB1B2112A: 0, FairMktValueCapAst112A: 0, ExpExclCnctTransfer112A: sumRow('ExpExclCnctTransfer'), Deductions112A: sumRow('TotalDeductions'), Balance112A: sumRow('Balance') } : undefined;

  const osRanges = Object.fromEntries((form === 5
    ? ['IncFrmLottery', 'DividendIncUs115BBDA', 'DividendIncUs115BBDAaiii', 'DividendIncUs115A1ai', 'DividendIncUs115AC', 'DividendIncUs115AD1iDiv', 'DividendIncUs115AD1IBd', 'DividendDTAA']
    : ['IncFrmLottery', 'DividendIncUs115BBDA', 'DividendIncUs115BBDAaiii', 'DividendIncUs115A1ai', 'DividendIncUs115AC', 'DividendIncUs115AD1iDiv', 'DividendIncUs115AD1IBd', 'DividendDTAA']).map((k) => [k, zeroRange(OS_RANGE)]));
  const scheduleOS = osIncome ? {
    IncOthThanOwnRaceHorse: {
      GrossIncChrgblTaxAtAppRate: osIncome, DividendGross: div, DividendOthThan22e: div, Dividend22e: 0, ...(form === 6 ? { Dividend22f: 0 } : {}),
      InterestGross: sav + dep + othInt, IntrstFrmSavingBank: sav, IntrstFrmTermDeposit: dep, IntrstFrmIncmTaxRefund: 0, NatofPassThrghIncome: 0, IntrstFrmOthers: othInt,
      RentFromMachPlantBldgs: 0, Tot562x: 0, Aggrtvaluewithoutcons562x: 0, Immovpropwithoutcons562x: 0, Immovpropinadeqcons562x: 0, Anyotherpropwithoutcons562x: 0, Anyotherpropinadeqcons562x: 0,
      AnyOtherIncome: oth, ...(oth ? { OthersInc: { OthersIncDtls: [{ NatureDesc: 'OTH', OthNatOfInc: clean(os.otherDescription || 'Other income', 50), OthAmount: oth }] } } : {}),
      IncChargeableSpecialRates: 0, LtryPzzlChrgblUs115BB: 0, IncChrgblUs115BBE: 0, CashCreditsUs68: 0, UnExplndInvstmntsUs69: 0, UnExplndMoneyUs69A: 0, UnDsclsdInvstmntsUs69B: 0, UnExplndExpndtrUs69C: 0, AmtBrwdRepaidOnHundiUs69D: 0,
      OthersGross: 0, PassThrIncOSChrgblSplRate: 0,
      Deductions: { Depreciation: 0, TotDeductions: 0 },
      BalanceNoRaceHorse: osIncome,
    },
    TotOthSrcNoRaceHorse: osIncome,
    IncChargeableFrmOthSrc: osIncome,
    ...osRanges,
  } : undefined;

  // Schedules DPM, DOA and DEP.
  const dpmRates: Array<[DepBlockKind, string]> = [['PM15', 'Rate15'], ['PM30', 'Rate30'], ['PM40', 'Rate40']];
  const detailOf = (k: DepBlockKind) => {
    const d = blocks.find((y) => y.x.block === k)!.d.detail as Record<string, number>;
    const { RealizationPeriodLessThan180days, ...rest } = d;
    return { ...rest, RealizationPeriodDuringYear: RealizationPeriodLessThan180days };
  };
  const pmBlocks = dpmRates.filter(([k]) => blocks.some((y) => y.x.block === k));
  const doaPart = (pairs: Array<[DepBlockKind, string]>) => {
    const present = pairs.filter(([k]) => blocks.some((y) => y.x.block === k));
    return present.length ? Object.fromEntries(present.map(([k, rate]) => [rate, { DepreciationDetail: detailOf(k) }])) : undefined;
  };
  const doa = { Building: doaPart([['BLDG5', 'Rate5'], ['BLDG10', 'Rate10'], ['BLDG40', 'Rate40']]), FurnitureFittings: doaPart([['FURN10', 'Rate10']]), IntangibleAssets: doaPart([['INTANG25', 'Rate25']]) };
  const doaClean = Object.fromEntries(Object.entries(doa).filter(([, x]) => x));
  const pmTotal = depOf('PM15') + depOf('PM30') + depOf('PM40');
  const depSchedules = blocks.length ? {
    ...(pmBlocks.length ? { ScheduleDPM: { PlantMachinery: Object.fromEntries(pmBlocks.map(([k, rate]) => [rate, { DepreciationDetail: detailOf(k) }])) } } : {}),
    ...(Object.keys(doaClean).length ? { ScheduleDOA: doaClean } : {}),
    ScheduleDEP: {
      SummaryFromDeprSch: {
        ...(pmBlocks.length ? { PlantMachinerySummary: { DeprBlockTot15Percent: depOf('PM15'), DeprBlockTot30Percent: depOf('PM30'), DeprBlockTot40Percent: depOf('PM40'), DeprBlockTot45Percent: 0, TotPlntMach: pmTotal } } : {}),
        ...(doa.Building ? { BuildingSummary: { DeprBlockTot5Percent: depOf('BLDG5'), DeprBlockTot10Percent: depOf('BLDG10'), DeprBlockTot40Percent: depOf('BLDG40'), TotBuildng: depOf('BLDG5') + depOf('BLDG10') + depOf('BLDG40') } } : {}),
        ...(doa.FurnitureFittings ? { FurnitureSummary: depOf('FURN10') } : {}),
        ...(doa.IntangibleAssets ? { IntangibleAssetSummary: depOf('INTANG25') } : {}),
        TotalDepreciation: itDep,
      },
    },
  } : {};

  const zeroExcise = { UnionExciseDuty: 0, ServiceTax: 0, VATorSaleTax: 0, CentralGoodServiceTax: 0, StateGoodServiceTax: 0, IntegratedGoodServiceTax: 0, UnionTerrGoodServiceTax: 0, OthDutyTaxCess: 0, TotExciseCustomsVAT: 0 };
  const split3 = (others: number) => ({ NonResOtherCompany: 0, Others: others, Total: others });
  const tradingAccount = {
    SaleOfGoods: goods, SaleOfServices: services, OperatingRevenueTotal: 0, SalesGrossReceiptsTotal: salesTotal, GrossRcptFromProfession: profRcpt,
    ExciseCustomsVAT: { ...zeroExcise }, TotRevenueFrmOperations: revenue, ClsngStckOfFinishedStcks: closing, TardingAccTotCred: tradingCredit,
    OpngStckOfFinishedStcks: opening, Purchases: purchases, DirectExpenses: direct, CarriageInward: 0, PowerAndFuel: 0,
    ...(form === 5 ? { DirectExpensesTotal: direct } : { TotOthDirectExpenses: 0 }),
    DutyTaxPay: { ExciseCustomsVAT: { CustomDuty: 0, CounterVailDuty: 0, SplAddDuty: 0, ...zeroExcise } }, GoodsCostPrdcdFrmMA: 0, GrossProfitFrmBusProf: grossProfit,
  };

  const partAPL = {
    CreditsToPL: {
      GrossProfitTrnsfFrmTrdAcc: grossProfit,
      OthIncome: {
        RentInc: rentInc, Comissions: 0, Dividends: divInc, InterestInc: interestInc, ProfitOnSaleFixedAsset: 0, ProfitOnInvChrSTT: 0, ProfitOnOthInv: invProfit, ProfitOnCurrFluct: 0,
        ProfitOnCnvInvntryToCapAsst: 0, ProfitOnAgriIncome: 0, MiscOthIncome: misc, TotOthIncome: otherIncomeTotal,
      },
      TotCreditsToPL: credits,
    },
    DebitsToPL: {
      DebitPlAcnt: {
        Freight: e(ex.freight), ConsumptionOfStores: e(ex.consumables), PowerFuel: e(ex.powerFuel), RentExpdr: e(ex.rent), RepairsBldg: e(ex.repairsBuilding), RepairMach: e(ex.repairsMachinery),
        EmployeeComp: { SalsWages: e(ex.salaries), Bonus: e(ex.bonus), MedExpReimb: 0, LeaveEncash: 0, LeaveTravelBenft: 0, ContToSuperAnnFund: 0, ContToPF: e(ex.providentFund), ContToGratFund: 0, ContToOthFund: 0, OthEmpBenftExpdr: 0, TotEmployeeComp: empTotal },
        Insurances: { MedInsur: 0, LifeInsur: 0, KeyManInsur: 0, OthInsur: e(ex.insurance), TotInsurances: e(ex.insurance) },
        StaffWelfareExp: e(ex.staffWelfare), Entertainment: 0, Hospitality: 0, Conference: 0, SalePromoExp: e(ex.salesPromotion), Advertisement: e(ex.advertisement),
        CommissionExpdrDtls: split3(e(ex.commission)), RoyalityDtls: split3(0), ProfessionalConstDtls: split3(e(ex.professionalFees)),
        HotelBoardLodge: e(ex.hotel), TravelExp: e(ex.travel), ForeignTravelExp: 0, ConveyanceExp: e(ex.conveyance), TelephoneExp: e(ex.telephone), GuestHouseExp: 0, ClubExp: 0, FestivalCelebExp: 0, Scholarship: 0, Gift: 0, Donation: 0,
        RatesTaxesPays: { ExciseCustomsVAT: { ...zeroExcise, OthDutyTaxCess: e(ex.ratesTaxes), TotExciseCustomsVAT: e(ex.ratesTaxes) } },
        AuditFee: e(ex.auditFee),
        ...(form === 5 ? { SalRemuneration: partnerRemuneration } : {}),
        ...(otherRows.length ? { OtherExpensesDtls: otherRows.map((r) => ({ ExpenseNature: clean(r.nature, 50) || 'Other expenses', Amount: n0(r.amount) })) } : {}),
        OtherExpenses: otherTotal,
        BadDebtDtls: { BadDebtAmtDtlsTotal: 0, OthersPANNotAvlblDtlTotal: 0, OthersAmtLt1Lakh: 0, BadDebt: 0 },
        ProvForBadDoubtDebt: 0, OthProvisionsExpdr: 0,
        PBIDTA: pbidta,
        InterestExpdrtDtls: form === 5
          ? { NonResOtherCompany: 0, Others: 0, ResPartners: partnerInterest, ResOthers: interestOthers, InterestExpdr: interestExp }
          : { NonResOtherCompany: 0, Others: interestOthers, InterestExpdr: interestExp },
        DepreciationAmort: bookDep,
        PBT: pbt,
      },
      TaxProvAppr: {
        ProvForCurrTax: currTax, ProvDefTax: defTax, ProfitAfterTax: pat, BalBFPrevYr: 0, AmtAvlAppr: pat,
        Appropriations: form === 5 ? { TrfToReserves: 0 } : { TrfToReserves: 0, ProposedDividend: 0, TaxOnDividend: 0, AppropriationsCSR: 0, AnyOtherAppr: 0, TotAppropriations: 0 },
        // ITR-5 item 60 and 61: the balance goes to the partners' accounts; for a company it stays in the profit and loss balance.
        PartnerAccBalTrf: form === 5 ? pat : 0,
      },
    },
  };

  const plOthHeads = { HouseProperty: less.hp, CapitalGains: less.cg, OtherSources: less.osDiv + less.osOther, UnderSec115BBF: 0, UnderSec115BBG: 0, Dividend: less.osDiv, OtherThanDividend: less.osOther };
  const scheduleBP = {
    BusinessIncOthThanSpec: {
      ProfBfrTaxPL: pbt, NetPLFromSpecBus: 0, NetProfLossSpecifiedBus: 0,
      IncRecCredPLOthHeadDtls: plOthHeads,
      PLUs44sChapXIIGOthrUs115B: 0,
      ProfitLossInclRefrdSec: form === 5
        ? { ProfitLossUs44AD: 0, ProfitLossUs44ADA: 0, ProfitLossUs44AE: 0, ProfitLossUs44B: 0, ProfitLossUs44BB: 0, ProfitLossUs44BBA: 0, ProfitLossUs44BBC: 0, ProfitLossUs44BBD: 0, ProfitLossUs44DA: 0, FirstSchITActOthr115B: 0 }
        : { ProfitLossUs44AE: 0, ProfitLossUs44B: 0, ProfitLossUs44BB: 0, ProfitLossUs44BBA: 0, ProfitLossUs44BBB: 0, ProfitLossUs44BBC: 0, ProfitLossUs44BBD: 0, ProfitLossUs44D: 0, ProfitLossUs44DA: 0, ProfitChapterXIIG: 0, FirstSchITActOthr115B: 0 },
      ...(form === 6 ? { PLUs44sChapXIIGUs115B: 0 } : {}),
      TotalProfitFrmActCvrd: 0,
      ProfitFrmActCvrd: { ProfitFrmActCvrdUndrRule7: 0, ProfitFrmActCvrdUndrRule7A: 0, ProfitFrmActCvrdUndrRule7B1: 0, ProfitFrmActCvrdUndrRule7B1A: 0, ProfitFrmActCvrdUndrRule8: 0 },
      IncCredPL: { FirmShareInc: 0, AOPBOISharInc: 0, OthExempInc: 0, TotExempInc: 0 },
      ...(form === 6 ? { ProfitFrmEligBus10TIA: 0 } : {}),
      BalancePLOthThanSpecBus: a6,
      ExpDebToPLOthHeadDtls: { HouseProperty: 0, CapitalGains: 0, OtherSources: 0, UnderSec115BBF: 0, UnderSec115BBG: 0 },
      ExpDebToPLExemptInc: 0, ExpDebToPLExemptIncDisAllwUs14A: 0, TotExpDebPL: 0,
      AdjustedPLOthThanSpecBus: a10,
      DepreciationDebPLCosAct: bookDep,
      DepreciationAllowITAct32: { DepreciationAllowUs32_1_ii: itDep, DepreciationAllowUs32_1_i: 0, TotDeprAllowITAct: itDep },
      AdjustPLAfterDeprOthSpecInc: a13,
      AmtDebPLDisallowUs36: 0, AmtDebPLDisallowUs37: 0, AmtDebPLDisallowUs40: a16, AmtDebPLDisallowUs40A: 0, AmtDebPLDisallowUs43B: 0, InterestDisAllowUs23SMEAct: 0,
      DeemIncUs41: 0, DeemIncUs3380HHD80IA: 0, DeemIncUs43CA: 0,
      ...(form === 5 ? { OthItemDisallowUs28To44DB: 0, SalaryExpDisallowPL: 0, BonusExpDisallowPL: 0 } : { OthItemDisallowUs28To44DA: 0, Amt32AC: 0 }),
      AnyOthIncNotInclInExpDisallowPL: 0, CommissionExpDisallowPL: 0, InterestExpDisallowPL: 0, OthersExpDisallowPL: 0,
      IncProfDecLossAccICDSAdj: 0, TotAfterAddToPLDeprOthSpecInc: a26,
      DeductUs32_1_iii: 0, DebPLUs35ExcessAmt: 0, AmtDisallUs40NowAllow: 0, AmtDisallUs43BNowAllow: 0, AnyOthAmtAllDeduct: 0, DecProfIncLossAccICDSAdj: 0, TotDeductionAmts: 0,
      PLAftAdjDedBusOthThanSpec: a34,
      DeemedProfitBusUs: form === 5
        ? { Section44AD: 0, Section44ADA: 0, Section44AE: 0, Section44B: 0, Section44BB: 0, Section44BBA: 0, Section44BBC: 0, Section44BBD: 0, Section44DA: 0, FirstSchTActOther: 0, TotDeemedProfitBusUs: 0 }
        : { Section44AE: 0, Section44B: 0, Section44BB: 0, Section44BBA: 0, Section44BBB: 0, Section44BBC: 0, Section44BBD: 0, Section44D: 0, Section44DA: 0, ChapterXIIG: 0, FirstSchTActOther: 0, TotDeemedProfitBusUs: 0 },
      NetPLAftAdjBusOthThanSpec: a34,
      NetPLBusOthThanSpec7A7B7C: a34,
      ChrgblIncUndrRule7: 0, DeemedChrgblIncUndrRule7A: 0, DeemedChrgblIncUndrRule7B1: 0, DeemedChrgblIncUndrRule7B1A: 0, DeemedChrgblIncUndrRule8: 0,
      IncomeOtherThanRule: a34,
      BalIncDeemedFrmAgri: 0,
    },
    SpecBusinessInc: form === 5 ? { NetPLFrmSpecBus: 0, AdditionUs28to44DB: 0, DeductUs28to44DB: 0, AdjustedPLFrmSpecuBus: 0 } : { NetPLFrmSpecBus: 0, AdditionUs28to44DA: 0, DeductUs28to44DA: 0, AdjustedPLFrmSpecuBus: 0 },
    IncSpecifiedBusiness: form === 5
      ? { NetPLFrmSpecifiedBus: 0, AddSec28to44DB: 0, DedSec28to44DBOTDedSec35AD: 0, ProfitLossSpecifiedBusiness: 0, ProfitLossSpecifiedBusFinal: 0 }
      : { NetPLFrmSpecifiedBus: 0, AddSec28to44DA: 0, DedSec28to44DAOTDedSec35AD: 0, ProfitLossSpecifiedBusiness: 0, DedSec35AD1: 0, ProfitLossSpecifiedBusFinal: 0 },
    IncChrgUnHdProftGain: Math.max(0, bp),
    BusSetoffCurrYr: { LossSetOffOnBusLoss: 0, TotLossSetOffOnBus: 0, LossRemainSetOffOnBus: Math.max(0, bp) },
  };

  const zero43B = { TaxDutyCesAmt: 0, ContToEmpPFSFGF: 0, EmpBonusComm: 0, SumPayaleLoanBrToFinComp: 0, IntPayaleToFI: 0, IntPayaleToFISchBank: 0, LeaveEncashPayable: 0, TotAmtUs43b: 0 };
  // Part A-OI as each schema lays it out; for a firm item 8A(h) carries the section 40(b) amount (rule 220 links it to Schedule BP A16).
  const partAOI = form === 5 ? {
    MethodOfAcct: 'MERC', ChangeInAcctMethFlg: 'N', ProfDeviatDueAcctMeth: 0, DecProOrIncLossUs145_2: 0,
    NoCredToPLAmt: { Section28Items: 0, ProformaCreditsDue: 0, PrevYrEscalClaim: 0, OthItemInc: 0, CapReceipt: 0, TotNoCredToPLAmt: 0 },
    AmtDisallUs36: { StkInsurPrem: 0, EmpHealthInsurPrem: 0, EmpBonusCommSum: 0, IntOnBorrCap: 0, ZeroCoupBondDisc: 0, RecogPFContribAmt: 0, AppSuperAnnFundAmt: 0, PensionSchemeSec80CCD: 0, AppGratFundAmt: 0, OthFundAmt: 0, EmpContributionCredits: 0, BadDebtDoubtAmt: 0, BadDebtDoubtProvn: 0, SpecResrvTranfr: 0, FamPlanPromoExp: 0, SecuritiesPaidAmt: 0, MrktLossOthExpLossICDS: 0, ExpGovtApprovedSugarPrice: 0, AnyOthDisallowance: 0, TotAmtDisallUs36: 0 },
    AmtDisallUs37: { CapitalNatureExp: 0, PersonalExp: 0, BusOrProfessnExp: 0, PoliticPartyExp: 0, LawVoilatPenalExp: 0, OthPenalFineExp: 0, OffenceExp: 0, ContigentLiability: 0, OthAmtNotAllowUs37: 0, TotAmtDisallUs37: 0 },
    AmtDisallUs40: { NonCompChapXVIIBAmt: 0, NonComp40aiiChapXVIIBAmt: 0, NonComp40aibChapXVIIBAmt: 0, NonComp40aiiiChapXVIIBAmt: 0, TaxAmtOnProfits: 0, WTAmt: 0, RolyatyOrServiceFee: 0, IntSalBonPartner: a16, AnyOthDisallowance: 0, TotAmtDisallUs40: a16, AnyAmtOfSec40AllowPrevYr: 0 },
    AmtDisallUs40A: { AmtPaidUs40A2b: 0, AmtGT20kCash: 0, ProvPmtGrat: 0, ContToSetupTrust: 0, AnyOthDisallowance: 0, TotAmtDisallUs40A: 0 },
    AmtDisallUs43BPyNowAll: { AmtUs43B: zero43B },
    AmtDisall43B: { AmtUs43B: zero43B },
    AmtExciseCustomsVATOutstanding: { ExciseCustomsVAT: zeroExcise },
    DeemedProfUs33ABs: 0, ProfTaxAmtUs41: 0, PriorAmtIncCrDrPL: 0, AmountOfExpDisAllwUs14A: 0, ScheduleTPSAFlg: 'N',
  } : {
    MethodOfAcct: 'MERC', ChangeInAcctMethFlg: 'N', ProfDeviatDueAcctMeth: 0, DecProOrIncLossUs145_2: 0,
    NoCredToPLAmt: { Section28Items: 0, ProformaCreditsDue: 0, PrevYrEscalClaim: 0, OthItemInc: 0, CapReceipt: 0, TotNoCredToPLAmt: 0 },
    AmtDisallUs36: { StkInsurPrem: 0, EmpHealthInsurPrem: 0, EmpBonusCommSum: 0, IntOnBorrCap: 0, ZeroCoupBondDisc: 0, RecogPFContribAmt: 0, AppSuperAnnFundAmt: 0, PensionSchemeSec80CCD: 0, AppGratFundAmt: 0, OthFundAmt: 0, EmpContributionCredits: 0, BadDebtDoubtAmt: 0, BadDebtDoubtProvn: 0, SpecResrvTranfr: 0, FamPlanPromoExp: 0, SecuritiesPaidAmt: 0, MrktLossOthExpLossICDS: 0, AnyOthDisallowance: 0, TotAmtDisallUs36: 0 },
    AmtDisallUs37: { CapitalNatureExp: 0, PersonalExp: 0, BusOrProfessnExp: 0, PoliticPartyExp: 0, LawVoilatPenalExp: 0, OthPenalFineExp: 0, OffenceExp: 0, SocialRespCSR: 0, ContigentLiability: 0, OthAmtNotAllowUs37: 0, TotAmtDisallUs37: 0 },
    AmtDisallUs40: { NonCompChapXVIIBAmt: 0, NonComp40aiaChapXVIIBAmt: 0, NonComp40aibChapXVIIBAmt: 0, NonComp40aiiiChapXVIIBAmt: 0, TaxAmtOnProfits: 0, WTAmt: 0, RolyatyOrServiceFee: 0, IntSalBonPartner: 0, TotAmtDisallUs40: 0 },
    AmtDisallUs40A: { AmtPaidUs40A2b: 0, AmtGT20kCash: 0, ProvPmtGrat: 0, ContToSetupTrust: 0, TotAmtDisallUs40A: 0 },
    AmtDisallUs43BPyNowAll: { AmtUs43B: zero43B },
    AmtDisall43B: { AmtUs43B: { ...zero43B, RailwayAsstsPyble: 0 } },
    AmtExciseCustomsVATOutstanding: { ExciseCustomsVAT: { TotExciseCustomsVAT: 0 } },
    DeemedProfUs33ABs: 0, ProfTaxAmtUs41: 0, PriorAmtIncCrDrPL: 0, AmountOfExpDisAllwUs14A: 0, ScheduleTPSAFlg: 'N',
  };

  const scheduleSI = tx.si.length ? { SplCodeRateTax: tx.si.map(([c, r, inc, t]) => ({ SecCode: c, SplRatePercent: r, SplRateInc: inc, SplRateIncTax: t })), TotSplRateInc: sum(tx.si.map((x) => x[2])), TotSplRateIncTax: tx.special } : undefined;

  const cyla = (x: number) => ({ IncCYLA: { IncOfCurYrUnderThatHead: x, IncOfCurYrAfterSetOff: x } });
  const bfla = (x: number) => ({ IncBFLA: { IncOfCurYrUndHeadFromCYLA: x, BFlossPrevYrUndSameHeadSetoff: 0, BFUnabsorbedDeprSetoff: 0, BFAllUs35Cl4Setoff: 0, IncOfCurYrAfterSetOffBFLosses: x } });
  const scheduleCYLA = {
    ...(hpTotal > 0 ? { HP: cyla(hpTotal) } : {}),
    BusProfExclSpecProf: cyla(Math.max(0, bp)),
    STCG20Per: cyla(Math.max(0, st20)), STCG30Per: cyla(0), STCGAppRate: cyla(Math.max(0, stApp)), STCGDTAARate: cyla(0), LTCG12_5Per: cyla(Math.max(0, ltA + ltO)), LTCGDTAARate: cyla(0),
    ...(osIncome ? { OthSrcExclRaceHorseLottery: cyla(osIncome) } : {}),
  };
  const scheduleBFLA = {
    ...(hpTotal > 0 ? { HP: bfla(hpTotal) } : {}),
    BusProfExclSpecProf: bfla(Math.max(0, bp)),
    STCG20Per: bfla(Math.max(0, st20)), STCG30Per: bfla(0), STCGAppRate: bfla(Math.max(0, stApp)), STCGDTAARate: bfla(0), LTCG12_5Per: bfla(Math.max(0, ltA + ltO)), LTCGDTAARate: bfla(0),
    ...(osIncome ? { OthSrcExclRaceHorse: { IncBFLA: { IncOfCurYrUndHeadFromCYLA: osIncome, BFUnabsorbedDeprSetoff: 0, BFAllUs35Cl4Setoff: 0, IncOfCurYrAfterSetOffBFLosses: osIncome } } } : {}),
    TotalBFLossSetOff: { TotBFLossSetoff: 0, TotUnabsorbedDeprSetoff: 0, TotAllUs35cl4Setoff: 0 },
    IncomeOfCurrYrAftCYLABFLA: gti,
  };

  const taxSchedules = {
    ...(payments.length ? { ScheduleIT: { TaxPayment: payments.map((x) => ({ BSRCode: x.bsr, DateDep: x.date, SrlNoOfChaln: x.serial, Amt: n0(x.amount) })), TotalTaxPayments: advance + selfTax } } : {}),
    ...(i.tdsOther?.length ? { ScheduleTDS2: { TDSOthThanSalaryDtls: i.tdsOther.map((x) => ({ TDSCreditName: 'S', TANOfDeductor: x.tan, TDSSection: x.section, TaxDeductCreditDtls: { TaxDeductedOwnHands: n0(x.tds), TaxClaimedOwnHands: n0(x.tds) }, GrossAmount: n0(x.amount), HeadOfIncome: x.head ?? 'BP', AmtCarriedFwd: 0 })), TotalTDSonOthThanSals: otherTds } } : {}),
    ...(i.tcs?.length ? { ScheduleTCS: { TCSDetails: i.tcs.map((x) => ({ EmployerOrDeductorOrCollectDetl: { TCSCreditName: 'S', TAN: x.tan }, TCSCurrFYDtls: { TCSAmtCollOwnHands: n0(x.tcs) }, TCSClaimedThisYearDtls: { TCSAmtCollOwnHands: n0(x.tcs) }, AmtCarriedFwd: 0 })), TotalSchTCS: tcs } } : {}),
  };

  const ttiCore = {
    IntrstPay: { IntrstPayUs234A: ii.i234A, IntrstPayUs234B: ii.i234B, IntrstPayUs234C: ii.i234C, LateFilingFee234F: ii.fee234F, TotalIntrstPay: interest },
    AggregateTaxInterestLiability: aggregate,
  };
  const taxPaidBlock = {
    TaxPaid: { TaxesPaid: { AdvanceTax: advance, TDS: otherTds, TCS: tcs, SelfAssessmentTax: selfTax, TotalTaxesPaid: paid }, BalTaxPayable: Math.max(0, aggregate - paid) },
    Refund: { RefundDue: Math.max(0, paid - aggregate), BankAccountDtls: { BankDtlsFlag: 'Y', AddtnlBankDetails: [{ IFSCCode: i.bank.ifsc, BankName: clean(i.bank.name, 125), BankAccountNo: clean(i.bank.account, 20), AccountType: i.bank.type, UseForRefund: 'true' }] } },
  };

  const filingSection = i.filing.section === 11 && ii.belated ? 12 : i.filing.section;

  return {
    issues, form,
    numbers: {
      revenue, salesTotal, profRcpt, grossProfit, credits, pbidta, pbt, pat, currTax, defTax, bookDep, itDep, bp, a16, remDisallowed, interestDisallowed, nonWorking, bookProfit, remLimit,
      hpTotal, cgIncome, st20, stApp, ltA, ltO, osIncome, gti, totalIncome, splIncome, normalIncome, liable44AB, within5,
      otherTds, tcs, selfTax, paid, interest, aggregate, ...ii,
    },
    tx, filingSection,
    parts: {
      tradingAccount, partAPL, partAOI, scheduleBP, scheduleCG, schedule112A, scheduleOS, depSchedules, scheduleSI, scheduleCYLA, scheduleBFLA, taxSchedules, ttiCore, taxPaidBlock,
      scheduleHP: hpRows.length ? { PropertyDetails: hpRows.map((r) => r.row), TotalIncomeChargeableUnHP: hpTotal } : undefined,
    },
  };
}

/** Months from the due date used by 234A, for display. */
export const lateMonths = (dueDate: string, filedOn: string) => (filedOn > dueDate ? monthsFrom(dueDate, filedOn) : 0);

/** Nature of business rows. */
export const natureRows = (natures: EntityCommonInput['natures']) => ({ NatureOfBusiness: natures.map((x) => ({ Code: x.code, ...(x.tradeName ? { TradeName1: clean(x.tradeName, 125) } : {}) })) });

/** Address block for Part A-General. */
export const entityAddress = (e: EntityInfo) => ({
  ResidenceNo: clean(e.address.residenceNo, 50), LocalityOrArea: clean(e.address.locality, 50), CityOrTownOrDistrict: clean(e.address.city, 50), StateCode: e.address.stateCode,
  CountryCode: '91', PinCode: Number(e.address.pin), CountryCodeMobile: 91, MobileNo: Number(e.mobile), EmailAddress: clean(e.email, 125),
});

export const verificationBlock = (s: EntitySignatory, date: string) => ({
  Declaration: { AssesseeVerName: clean(s.name, 125), FatherName: clean(s.fatherName, 125), AssesseeVerPAN: s.pan, Capacity: s.capacity, Place: clean(s.place, 50), Date: date },
});
