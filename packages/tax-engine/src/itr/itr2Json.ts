import { NEW_SLABS, oldSlabs } from '../tds/salary.js';
import {
  ageBandFromDob, address, assesseeName, bankRow, clean, commonChecks, creationInfo, deduction80D, interestAndFee, n0, returnSection, revisedFields, sum, tanIssues, verification,
  type Deduction80DInput, type ItrBank, type ItrFiling, type ItrIssue, type ItrOtherTds, type ItrPerson, type ItrTaxPayment, type ItrTcs,
} from './itrCommon.js';
import { specialRateTax } from './specialRateTax.js';
import type { HouseLoan } from './itr4Json.js';

/**
 * ITR-2 JSON for Assessment Year 2026-27 (income of 2025-26), to the Income Tax Department's schema
 * ITR-2_2026_Main_V1.2 (kept in packages/tax-engine/schemas/itr; every test output is validated
 * against it). Arithmetic links between schedules follow the Department's ITR-2 validation rules for
 * AY 2026-27 (version 1.0); rule numbers are cited below.
 *
 * Covered, for a resident individual with total income up to Rs 50 lakh: salary from one or more
 * employers, several house properties (let out or self-occupied), capital gains under section 111A
 * (20%), 112A (12.5% above Rs 1.25 lakh, with the 31 Jan 2018 cost rule of section 55(2)(ac)), 112 on
 * other assets (12.5% without indexation) and short-term gains at slab rates; interest, dividends and
 * other income; set-off of current-year losses within capital gains (section 70) and of a house
 * property loss up to Rs 2 lakh against other heads in the old regime (section 71(3A)); carry forward
 * of what is left (Schedule CFL, current year); deductions under 80C, 80CCD(1B), 80D, 80TTA and 80TTB.
 *
 * Not covered, reported as issues: total income above Rs 50 lakh (it needs Schedule AL and may carry
 * surcharge), sale of land or building (Schedule CG needs stamp value and buyer details, and the
 * 20%-with-indexation option for property bought before 23 July 2024), losses brought forward from
 * earlier years, directors and holders of unlisted shares, foreign assets and income, non-residents.
 */

export const ITR2_DUE_DATE = '2026-07-31';

export interface Itr2Employer {
  tan?: string; name: string; nature: 'CGOV' | 'SGOV' | 'PSU' | 'PE' | 'PESG' | 'PEPS' | 'PEO' | 'OTH';
  address: { line: string; city: string; stateCode: string; pin: string };
  gross: number; tds: number;
}
export interface Itr2Property { letOut: boolean; address: string; city: string; stateCode: string; pin: string; rent?: number; municipalTax?: number; loans?: HouseLoan[] }
export interface CgSale {
  /** 111A: listed equity or equity fund units held up to 12 months, STT paid. 112A: the same held longer. STCG and LTCG: other assets (not land or building). */
  kind: '111A' | '112A' | 'STCG' | 'LTCG';
  date: string; // date of transfer, YYYY-MM-DD in 2025-26
  saleValue: number; cost: number; improvement?: number; expenses?: number;
  /** 112A only */
  isin?: string; name?: string; acquiredBefore1Feb2018?: boolean; fmv31Jan2018?: number;
}

export interface Itr2Input {
  softwareId: string;
  createdOn: string;
  intermediaryCity: string;
  person: ItrPerson;
  filing: ItrFiling;
  flags?: { director?: boolean; unlistedShares?: boolean; foreignAssets?: boolean; landOrBuildingSold?: boolean; lossesBroughtForward?: boolean };
  salary?: { professionalTax?: number; employers: Itr2Employer[] };
  houses?: Itr2Property[];
  capitalGains?: CgSale[];
  otherSources?: { savingsInterest?: number; depositInterest?: number; refundInterest?: number; dividends?: number; other?: number; otherDescription?: string };
  deductions?: { section80C?: { amount: number; id: string }[]; section80CCD1B?: number; section80D?: Deduction80DInput };
  tdsOther?: (ItrOtherTds & { head?: 'HP' | 'OS' | 'NA' | 'BP' })[];
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
const zeroRange = () => ({ DateRange: Object.fromEntries(PERIODS.map(([k]) => [k, 0])) as Record<string, number> });
/** Income of a category after set-off spread over the quarters in which gains arose (rule: break-up equals the income). */
function spread(income: number, gainsByPeriod: number[]) {
  const r = zeroRange();
  let left = income;
  gainsByPeriod.forEach((g, k) => { const t = Math.min(left, Math.max(0, g)); r.DateRange[PERIODS[k][0]] = t; left -= t; });
  if (left > 0) r.DateRange[PERIODS[4][0]] += left;
  return r;
}

const ded48 = (cost: number, improvement: number, expenses: number) => ({ AquisitCost: cost, ImproveCost: improvement, ExpOnTrans: expenses, TotalDedn: cost + improvement + expenses });

/** Gain on one sale; for 112A the cost of an asset bought before 1 Feb 2018 is the higher of cost and the lower of its 31 Jan 2018 value and the sale value (55(2)(ac)). */
export function cgGain(s: CgSale) {
  const sale = n0(s.saleValue);
  const fmvCap = s.kind === '112A' && s.acquiredBefore1Feb2018 ? Math.min(n0(s.fmv31Jan2018), sale) : 0;
  const cost = Math.max(n0(s.cost), fmvCap);
  return { sale, cost, fmvCap, improvement: n0(s.improvement), expenses: n0(s.expenses), gain: sale - cost - n0(s.improvement) - n0(s.expenses) };
}

export function writeItr2(i: Itr2Input): { json: Record<string, unknown> | null; issues: ItrIssue[]; summary: Record<string, number> } {
  const p = i.person;
  const regime = i.filing.regime;
  const old = regime === 'OLD';
  const issues: ItrIssue[] = commonChecks({ softwareId: i.softwareId, createdOn: i.createdOn, person: p, filing: i.filing, bank: i.bank, dueDate: ITR2_DUE_DATE, form: 'ITR-2' });
  const err = (field: string, message: string) => issues.push({ field, message });
  const f = i.flags ?? {};
  if (f.director || f.unlistedShares) err('flags', 'Directors and holders of unlisted shares must give company details in the return; this file does not write them yet.');
  if (f.foreignAssets) err('flags', 'Foreign assets and income (Schedules FA, FSI, TR) are not written by this file.');
  if (f.landOrBuildingSold) err('flags', 'Sale of land or building needs stamp value, buyer details and the indexation option for property bought before 23 July 2024; not written by this file.');
  if (f.lossesBroughtForward) err('flags', 'Losses brought forward from earlier years (Schedule BFLA and CFL rows) are not written by this file.');
  issues.push(...tanIssues([...(i.salary?.employers ?? []).filter((e) => e.tan).map((e) => ({ tan: e.tan! })), ...(i.tdsOther ?? []), ...(i.tcs ?? [])], 'tan'));
  const age = ageBandFromDob(p.dob);

  // Salary (Schedule S): standard deduction 16(ia) Rs 75,000 new regime, Rs 50,000 old; professional tax 16(iii) old regime up to Rs 2,500.
  const employers = i.salary?.employers ?? [];
  const gross = sum(employers.map((e) => n0(e.gross)));
  const std = Math.min(gross, old ? 50000 : 75000);
  const pt = old ? Math.min(n0(i.salary?.professionalTax), 2500, gross - std) : 0;
  const salary = gross - std - pt;

  // House property (Schedule HP): 30% of annual value under 24(a), interest under 24(b); self-occupied interest up to Rs 2 lakh in all, old regime only.
  let soInterestLeft = old ? 200000 : 0;
  const props = (i.houses ?? []).map((h, k) => {
    const loans = h.loans ?? [];
    const interestPaid = sum(loans.map((l) => n0(l.interest)));
    const alv = h.letOut ? n0(h.rent) : 0;
    const tax = h.letOut ? n0(h.municipalTax) : 0;
    const balance = Math.max(0, alv - tax);
    const thirty = Math.round(balance * 0.3);
    let interest = interestPaid;
    if (!h.letOut) { interest = Math.min(interestPaid, soInterestLeft); soInterestLeft -= interest; }
    if (!h.letOut && !old && interestPaid > 0) err('houses', 'Interest on a self-occupied home is not allowed in the new regime (115BAC(2)); remove it or opt for the old regime.');
    if (h.letOut && alv <= 0) err('houses', `Property ${k + 1} is let out but has no rent.`);
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

  // Other sources (Schedule OS), all at slab rates.
  const os = i.otherSources ?? {};
  const sav = n0(os.savingsInterest), dep = n0(os.depositInterest), ref = n0(os.refundInterest), div = n0(os.dividends), oth = n0(os.other);
  const osIncome = sav + dep + ref + div + oth;

  // Capital gains by category.
  const sales = (i.capitalGains ?? []).map((s) => ({ s, g: cgGain(s) }));
  for (const { s } of sales) {
    if (!/^2025-(0[4-9]|1[0-2])-\d{2}$|^2026-0[1-3]-\d{2}$/.test(s.date)) err('capitalGains', `Transfer date ${s.date} is not in 2025-26.`);
    if (s.kind === '112A' && !/^IN[0-9A-Z]{10}$/.test(s.isin ?? '')) err('capitalGains', `${s.name ?? 'A 112A sale'} needs its ISIN for Schedule 112A.`);
  }
  const of = (k: CgSale['kind']) => sales.filter((x) => x.s.kind === k);
  const net = (k: CgSale['kind']) => sum(of(k).map((x) => x.g.gain));
  const byPeriod = (ks: CgSale['kind'][]) => PERIODS.map((_, n) => sum(sales.filter((x) => ks.includes(x.s.kind) && periodOf(x.s.date) === n).map((x) => x.g.gain)));
  const st20Raw = net('111A'), stAppRaw = net('STCG'), ltARaw = net('112A'), ltORaw = net('LTCG');
  // 12.5% row nets 112A and 112 (one row in the schema); a loss in one is set against the other.
  let ltA = ltARaw, ltO = ltORaw;
  const ltNet = ltA + ltO;
  if (ltNet <= 0) { ltA = 0; ltO = 0; } else if (ltO < 0) { ltA = ltNet; ltO = 0; } else if (ltA < 0) { ltO = ltNet; ltA = 0; }
  const ltLoss = Math.max(0, -ltNet);
  // Section 70(2): a short-term loss goes against any capital gain; 70(3): a long-term loss only against long-term gains.
  let st20 = Math.max(0, st20Raw), stApp = Math.max(0, stAppRaw);
  let st20Loss = Math.max(0, -st20Raw), stAppLoss = Math.max(0, -stAppRaw);
  const so = { appIn20: 0, s20InApp: 0, s20InLt: 0, appInLt: 0 };
  const use = (avail: number, against: number) => Math.min(avail, against);
  so.appIn20 = use(stAppLoss, st20); st20 -= so.appIn20; stAppLoss -= so.appIn20;
  so.s20InApp = use(st20Loss, stApp); stApp -= so.s20InApp; st20Loss -= so.s20InApp;
  const ltBefore = ltA + ltO;
  const reduceLt = (amt: number) => { const a = Math.min(amt, ltO); ltO -= a; const b = Math.min(amt - a, ltA); ltA -= b; return a + b; };
  so.s20InLt = reduceLt(st20Loss); st20Loss -= so.s20InLt;
  so.appInLt = reduceLt(stAppLoss); stAppLoss -= so.appInLt;
  const cgAfter = { st20, stApp, lt: ltA + ltO };

  // Schedule CYLA: a house property loss against other heads, old regime only, up to Rs 2 lakh (71(3A)); none in the new regime (rule 264).
  const hpLoss = Math.max(0, -hpTotal);
  let hpLossLeft = old ? Math.min(hpLoss, 200000) : 0;
  const take = (v: number) => { const t = Math.min(hpLossLeft, v); hpLossLeft -= t; return t; };
  const hpIn = { sal: take(salary), os: take(osIncome), stApp: take(cgAfter.stApp), st20: take(cgAfter.st20), lt: 0 };
  const ltBeforeHp = ltA + ltO;
  hpIn.lt = Math.min(hpLossLeft, ltBeforeHp); hpLossLeft -= hpIn.lt; reduceLt(hpIn.lt);
  const hpSetOff = hpIn.sal + hpIn.os + hpIn.stApp + hpIn.st20 + hpIn.lt;
  const hpCarried = hpLoss - hpSetOff;
  const after = { sal: salary - hpIn.sal, hp: Math.max(0, hpTotal), os: osIncome - hpIn.os, st20: cgAfter.st20 - hpIn.st20, stApp: cgAfter.stApp - hpIn.stApp, lt: ltA + ltO };
  const stclCarried = st20Loss + stAppLoss;

  const cgIncome = after.st20 + after.stApp + after.lt;
  const totalTI = salary + Math.max(0, hpTotal) + (cgAfter.st20 + cgAfter.stApp + cgAfter.lt) + osIncome;
  const gti = after.sal + after.hp + after.os + cgIncome;
  const splIncome = after.st20 + after.lt; // 111A, 112 and 112A in Part B-TI item 9

  // Chapter VI-A (old regime only) up to GTI less special-rate income (rule 509).
  const d = old ? i.deductions ?? {} : {};
  const c80Claimed = sum((d.section80C ?? []).map((r) => n0(r.amount)));
  const c80 = Math.min(c80Claimed, 150000);
  const c80ccd1b = Math.min(n0(d.section80CCD1B), 50000);
  const d80 = deduction80D(d.section80D, age);
  issues.push(...d80.issues);
  const c80tta = old && age === 'BELOW_60' ? Math.min(sav, 10000) : 0;
  const c80ttb = old && age !== 'BELOW_60' ? Math.min(sav + dep, 50000) : 0;
  const viaClaimed = c80 + c80ccd1b + d80.allowed + c80tta + c80ttb;
  const via = Math.min(viaClaimed, Math.max(0, gti - splIncome));
  // Total income rounded to the nearest Rs 10 (section 288A; rule 506).
  const totalIncome = Math.round((gti - via) / 10) * 10;
  if (totalIncome > 5000000) err('income', 'Total income above Rs 50 lakh needs Schedule AL (assets and liabilities) and may carry surcharge; not written by this file.');

  const tx = specialRateTax({ regime, age, totalIncome, st111A: after.st20, lt112A: ltA, lt112: ltO });
  const salaryTds = sum(employers.map((e) => n0(e.tds)));
  const otherTds = sum((i.tdsOther ?? []).map((t) => n0(t.tds)));
  const tcs = sum((i.tcs ?? []).map((t) => n0(t.tcs)));
  const payments = i.taxPayments ?? [];
  const advance = sum(payments.filter((t) => t.kind === 'ADVANCE').map((t) => n0(t.amount)));
  const selfTax = sum(payments.filter((t) => t.kind === 'SELF').map((t) => n0(t.amount)));
  const ii = interestAndFee({ liability: tx.liability, tdsTcs: salaryTds + otherTds + tcs, payments, filedOn: i.createdOn, dueDate: ITR2_DUE_DATE, totalIncome, exemption: (old ? oldSlabs(age) : NEW_SLABS)[0][0], entered234C: i.interest234C ?? 0 });
  const interest = ii.i234A + ii.i234B + ii.i234C + ii.fee234F;
  const aggregate = tx.liability + interest;
  const paid = salaryTds + otherTds + tcs + advance + selfTax;

  // Schedule CG
  const agg = (k: CgSale['kind']) => of(k).reduce((a, x) => ({ sale: a.sale + x.g.sale, cost: a.cost + x.g.cost, imp: a.imp + x.g.improvement, exp: a.exp + x.g.expenses }), { sale: 0, cost: 0, imp: 0, exp: 0 });
  const zero94 = () => ({ FullValueConsdRecvUnqshr: 0, FairMrktValueUnqshr: 0, FullValueConsdSec50CA: 0, FullValueConsdOthUnqshr: 0, FullConsideration: 0, DeductSec48: ded48(0, 0, 0), BalanceCG: 0, LossSec94of7Or94of8: 0, CapgainonAssets: 0 });
  const a111 = agg('111A'), aSt = agg('STCG'), aLt = agg('LTCG');
  const sl = (a: ReturnType<typeof agg>, extra: Record<string, number> = {}) => ({
    FullValueConsdRecvUnqshr: 0, FairMrktValueUnqshr: 0, FullValueConsdSec50CA: 0, FullValueConsdOthUnqshr: a.sale, FullConsideration: a.sale,
    DeductSec48: ded48(a.cost, a.imp, a.exp), BalanceCG: a.sale - a.cost - a.imp - a.exp, ...extra,
  });
  const rows112A = of('112A');
  const sch112A = rows112A.map(({ s, g }) => ({
    ShareOnOrBefore: s.acquiredBefore1Feb2018 ? 'BE' : 'AE', ISINCode: s.isin, ShareUnitName: clean(s.name || s.isin, 125),
    TotSaleValue: g.sale, CostAcqWithoutIndx: n0(s.cost), AcquisitionCost: g.cost, LTCGBeforelowerB1B2: g.fmvCap,
    FairMktValuePerShareunit: 0, TotFairMktValueCapAst: s.acquiredBefore1Feb2018 ? n0(s.fmv31Jan2018) : 0, ExpExclCnctTransfer: g.expenses + g.improvement,
    TotalDeductions: g.cost + g.expenses + g.improvement, Balance: g.gain,
  }));
  const sumRow = (k: keyof (typeof sch112A)[number]) => sum(sch112A.map((r) => Number(r[k])));
  const scheduleCG = {
    ShortTermCapGainFor23: {
      ...(a111.sale ? { EquityMFonSTT: [{ MFSectionCode: '1A', EquityMFonSTTDtls: { FullConsideration: a111.sale, DeductSec48: ded48(a111.cost, a111.imp, a111.exp), BalanceCG: st20Raw, LossSec94of7Or94of8: 0, CapgainonAssets: st20Raw } }] } : {}),
      NRITransacSec48Dtl: { NRItaxSTTPaid: 0, NRItaxSTTNotPaid: 0 },
      NRISecur115AD: zero94(),
      SaleOnOtherAssets: aSt.sale ? sl(aSt, { LossSec94of7Or94of8: 0, CapgainonAssets: stAppRaw }) : zero94(),
      TotalAmtDeemedStcg: 0, PassThrIncNatureSTCG: 0, TotalAmtNotTaxUsDTAAStcg: 0, TotalAmtTaxUsDTAAStcg: 0,
      TotalSTCG: st20Raw + stAppRaw,
    },
    LongTermCapGain23: {
      SaleOfEquityShareUs112A: { BalanceCG: ltARaw, DeductionUs54F: 0, CapgainonAssets: ltARaw },
      NRISaleOfEquityShareUs112A: { BalanceCG: 0, DeductionUs54F: 0, CapgainonAssets: 0 },
      NRISaleofForeignAsset: { SaleonSpecAsset: 0, DednSpecAssetus115: 0, BalonSpeciAsset: 0 },
      SaleofAssetNADtls: aLt.sale ? { SaleofAssetNA: sl(aLt, { DeductionUs54F: 0, CapgainonAssets: ltORaw }) } : {},
      TotalAmtDeemedLtcg: 0, PassThrIncNatureLTCG: 0, TotalAmtNotTaxUsDTAALtcg: 0, TotalAmtTaxUsDTAALtcg: 0,
      TotalLTCG: ltARaw + ltORaw,
    },
    SumOfCGIncm: cgAfter.st20 + cgAfter.stApp + cgAfter.lt,
    IncmFromVDATrnsf: 0,
    TotScheduleCGFor23: cgAfter.st20 + cgAfter.stApp + cgAfter.lt,
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
      ShortTermUnderDTAARate: zeroRange(), LongTermUnder12_5Per: spread(after.lt, byPeriod(['112A', 'LTCG'])), LongTermUnderDTAARate: zeroRange(),
    },
  };

  const cyla = (incomeHead: number, hpSet: number) => ({ IncCYLA: { IncOfCurYrUnderThatHead: incomeHead, HPlossCurYrSetoff: hpSet, OthSrcLossNoRaceHorseSetoff: 0, IncOfCurYrAfterSetOff: incomeHead - hpSet } });
  const bfla = (v: number, withSame = true) => ({ IncBFLA: { IncOfCurYrUndHeadFromCYLA: v, ...(withSame ? { BFlossPrevYrUndSameHeadSetoff: 0 } : {}), IncOfCurYrAfterSetOffBFLosses: v } });
  const zeroCyla = () => ({ IncCYLA: { IncOfCurYrUnderThatHead: 0, IncOfCurYrAfterSetOff: 0 } });
  const carried = hpCarried + stclCarried + ltLoss;

  const json = {
    ITR: {
      ITR2: {
        CreationInfo: creationInfo(i.softwareId, i.createdOn, i.intermediaryCity),
        Form_ITR2: { FormName: 'ITR-2', Description: 'For Indls and HUFs not having income from profits and gains of business or profession', AssessmentYear: '2026', SchemaVer: 'Ver1.0', FormVer: 'Ver1.0' },
        PartA_GEN1: {
          PersonalInfo: { AssesseeName: assesseeName(p), PAN: p.pan, Address: address(p), SecondaryAdd: 'N', DOB: p.dob, Status: 'I' },
          FilingStatus: {
            ReturnFileSec: returnSection(i.filing, ii.belated), OptOutNewTaxRegime: old ? 'Y' : 'N', SeventhProvisio139: 'N', ...revisedFields(i.filing),
            ResidentialStatus: 'RES', AsseseeRepFlg: 'N', FiiFpiFlag: 'N', CompDirectorPrvYrFlg: 'N', HeldUnlistedEqShrPrYrFlg: 'N', ItrFilingDueDate: ITR2_DUE_DATE,
          },
        },
        ...(employers.length ? {
          ScheduleS: {
            Salaries: employers.map((e) => ({
              NameOfEmployer: clean(e.name, 125), NatureOfEmployment: e.nature, ...(e.tan ? { TANofEmployer: e.tan } : {}),
              AddressDetail: { AddrDetail: clean(e.address.line, 200), CityOrTownOrDistrict: clean(e.address.city, 50), StateCode: e.address.stateCode, PinCode: Number(e.address.pin) },
              Salarys: { GrossSalary: n0(e.gross), Salary: n0(e.gross), ValueOfPerquisites: 0, ProfitsinLieuOfSalary: 0, IncomeNotified89A: 0, IncomeNotifiedOther89A: 0 },
            })),
            TotalGrossSalary: gross, AllwncExtentExemptUs10: 0, NetSalary: gross, DeductionUS16: std + pt, DeductionUnderSection16ia: std, EntertainmntalwncUs16ii: 0, ProfessionalTaxUs16iii: pt, TotIncUnderHeadSalaries: salary,
          },
        } : {}),
        ...(props.length ? { ScheduleHP: { PropertyDetails: props.map((x) => x.row), TotalIncomeChargeableUnHP: hpTotal } } : {}),
        ...(sales.length ? { ScheduleCGFor23: scheduleCG } : {}),
        ...(rows112A.length ? { Schedule112A: { Schedule112ADtls: sch112A, SaleValue112A: sumRow('TotSaleValue'), CostAcqWithoutIndx112A: sumRow('CostAcqWithoutIndx'), AcquisitionCost112A: sumRow('AcquisitionCost'), LTCGBeforelowerB1B2112A: sumRow('LTCGBeforelowerB1B2'), FairMktValueCapAst112A: sumRow('TotFairMktValueCapAst'), ExpExclCnctTransfer112A: sumRow('ExpExclCnctTransfer'), Deductions112A: sumRow('TotalDeductions'), Balance112A: sumRow('Balance'), TotalBalance112A: sumRow('Balance') } } : {}),
        ...(osIncome ? {
          ScheduleOS: {
            IncOthThanOwnRaceHorse: {
              GrossIncChrgblTaxAtAppRate: osIncome, DividendGross: div, DividendOthThan22e: div, InterestGross: sav + dep + ref, IntrstFrmSavingBank: sav, IntrstFrmTermDeposit: dep, IntrstFrmIncmTaxRefund: ref,
              NatofPassThrghIncome: 0, IntrstFrmOthers: 0, RentFromMachPlantBldgs: 0, Tot562x: 0, Aggrtvaluewithoutcons562x: 0, Immovpropwithoutcons562x: 0, Immovpropinadeqcons562x: 0, Anyotherpropwithoutcons562x: 0, Anyotherpropinadeqcons562x: 0,
              FamilyPension: 0, IncomeNotified89AOS: 0, AnyOtherIncome: oth, ...(oth ? { OthersInc: { OthersIncDtls: [{ OthNatOfInc: clean(os.otherDescription || 'Other income', 50), OthAmount: oth }] } } : {}),
              IncChargeableSpecialRates: 0, LtryPzzlChrgblUs115BB: 0, IncChrgblUs115BBE: 0, CashCreditsUs68: 0, UnExplndInvstmntsUs69: 0, UnExplndMoneyUs69A: 0, UnDsclsdInvstmntsUs69B: 0, UnExplndExpndtrUs69C: 0, AmtBrwdRepaidOnHundiUs69D: 0,
              TaxAccumulatedBalRecPF: { TotalIncomeBenefit: 0, TotalTaxBenefit: 0 }, OthersGross: 0, PassThrIncOSChrgblSplRate: 0,
              Deductions: { Expenses: 0, DeductionUs57iia: 0, Depreciation: 0, TotDeductions: 0 },
              BalanceNoRaceHorse: osIncome,
            },
            TotOthSrcNoRaceHorse: osIncome,
            IncFrmLottery: zeroRange(), DividendIncUs115BBDA: zeroRange(), DividendIncUs115BBDAaiii: zeroRange(), DividendIncUs115A1ai: zeroRange(), DividendIncUs115AC: zeroRange(), DividendIncUs115ACA: zeroRange(), DividendIncUs115AD1i: zeroRange(), DividendDTAA: zeroRange(), NOT89A: zeroRange(),
            IncChargeable: osIncome,
          },
        } : {}),
        ScheduleCYLA: {
          ...(employers.length ? { Salary: cyla(salary, hpIn.sal) } : {}),
          ...(hpTotal > 0 ? { HP: { IncCYLA: { IncOfCurYrUnderThatHead: hpTotal, OthSrcLossNoRaceHorseSetoff: 0, IncOfCurYrAfterSetOff: hpTotal } } } : {}),
          STCG20Per: cyla(cgAfter.st20, hpIn.st20), STCG30Per: zeroCyla(), STCGAppRate: cyla(cgAfter.stApp, hpIn.stApp), STCGDTAARate: zeroCyla(),
          LTCG12_5Per: cyla(ltBeforeHp, hpIn.lt), LTCGDTAARate: zeroCyla(),
          ...(osIncome ? { OthSrcExclRaceHorse: { IncCYLA: { IncOfCurYrUnderThatHead: osIncome, HPlossCurYrSetoff: hpIn.os, IncOfCurYrAfterSetOff: after.os } } } : {}),
          TotalCurYr: { TotHPlossCurYr: hpLoss, TotOthSrcLossNoRaceHorse: 0 },
          TotalLossSetOff: { TotHPlossCurYrSetoff: hpSetOff, TotOthSrcLossNoRaceHorseSetoff: 0 },
          LossRemAftSetOff: { BalHPlossCurYrAftSetoff: hpCarried, BalOthSrcLossNoRaceHorseAftSetoff: 0 },
        },
        ScheduleBFLA: {
          Salary: bfla(after.sal, false), ...(after.hp ? { HP: bfla(after.hp) } : {}),
          STCG20Per: bfla(after.st20), STCG30Per: bfla(0), STCGAppRate: bfla(after.stApp), STCGDTAARate: bfla(0), LTCG12_5Per: bfla(after.lt), LTCGDTAARate: bfla(0),
          ...(osIncome ? { OthSrcExclRaceHorse: bfla(after.os, false) } : {}),
          TotalBFLossSetOff: { TotBFLossSetoff: 0 },
          IncomeOfCurrYrAftCYLABFLA: gti,
        },
        ...(carried ? {
          ScheduleCFL: {
            TotalOfBFLossesEarlierYrs: { LossSummaryDetail: { TotalHPPTILossCF: 0, TotalSTCGPTILossCF: 0, TotalLTCGPTILossCF: 0 } },
            CurrentAYloss: { LossSummaryDetail: { TotalHPPTILossCF: hpCarried, TotalSTCGPTILossCF: stclCarried, TotalLTCGPTILossCF: ltLoss } },
            TotalLossCFSummary: { LossSummaryDetail: { TotalHPPTILossCF: hpCarried, TotalSTCGPTILossCF: stclCarried, TotalLTCGPTILossCF: ltLoss } },
          },
        } : {}),
        ScheduleVIA: {
          UsrDeductUndChapVIA: { Section80C: old ? c80Claimed : 0, Section80CCD1B: old ? n0(d.section80CCD1B) : 0, Section80D: old ? d80.claimed : 0, Section80G: 0, Section80GGA: 0, Section80TTA: c80tta, Section80TTB: c80ttb, TotalChapVIADeductions: old ? c80Claimed + n0(d.section80CCD1B) + d80.claimed + c80tta + c80ttb : 0 },
          DeductUndChapVIA: { Section80C: c80, Section80CCD1B: c80ccd1b, Section80D: d80.allowed, Section80G: 0, Section80GGA: 0, Section80TTA: c80tta, Section80TTB: c80ttb, TotalChapVIADeductions: via },
        },
        ...(old && c80Claimed ? { Schedule80C: { Schedule80CDtls: (d.section80C ?? []).map((r) => ({ Amount: n0(r.amount), IdentificationNo: clean(r.id, 50) })), TotalAmt: c80Claimed } } : {}),
        ...(old && d80.allowed ? { Schedule80D: d80.schedule } : {}),
        ...(tx.si.length ? { ScheduleSI: { SplCodeRateTax: tx.si.map(([c, r, inc, t]) => ({ SecCode: c, SplRatePercent: r, SplRateInc: inc, SplRateIncTax: t })), TotSplRateInc: sum(tx.si.map((x) => x[2])), TotSplRateIncTax: tx.taxSpecial } } : {}),
        'PartB-TI': {
          Salaries: after.sal + hpIn.sal, IncomeFromHP: Math.max(0, hpTotal),
          CapGain: {
            ShortTerm: { ShortTerm20Per: cgAfter.st20, ShortTerm30Per: 0, ShortTermAppRate: cgAfter.stApp, ShortTermSplRateDTAA: 0, TotalShortTerm: cgAfter.st20 + cgAfter.stApp },
            LongTerm: { LongTerm12_5Per: ltBeforeHp, LongTermSplRateDTAA: 0, TotalLongTerm: ltBeforeHp },
            ShortTermLongTermTotal: cgAfter.st20 + cgAfter.stApp + ltBeforeHp, CapGains30Per115BBH: 0, TotalCapGains: cgAfter.st20 + cgAfter.stApp + ltBeforeHp,
          },
          IncFromOS: { OtherSrcThanOwnRaceHorse: osIncome, IncChargblSplRate: 0, FromOwnRaceHorse: 0, TotIncFromOS: osIncome },
          TotalTI: totalTI, CurrentYearLoss: hpSetOff, BalanceAfterSetoffLosses: totalTI - hpSetOff, BroughtFwdLossesSetoff: 0, GrossTotalIncome: gti,
          IncChargeTaxSplRate111A112: splIncome, DeductionsUnderScheduleVIA: via, TotalIncome: totalIncome,
          IncChargeableTaxSplRates: splIncome, NetAgricultureIncomeOrOtherIncomeForRate: 0, AggregateIncome: totalIncome - splIncome,
          LossesOfCurrentYearCarriedFwd: carried, DeemedIncomeUs115JC: 0,
        },
        PartB_TTI: {
          TaxPayDeemedTotIncUs115JC: 0, Surcharge: 0, HealthEduCess: 0, TotalTaxPayablDeemedTotInc: 0,
          ComputationOfTaxLiability: {
            TaxPayableOnTI: { TaxAtNormalRatesOnAggrInc: tx.taxNormal, TaxAtSpecialRates: tx.taxSpecial, RebateOnAgriInc: 0, TaxPayableOnTotInc: tx.taxNormal + tx.taxSpecial },
            Rebate87A: tx.rebate, TaxPayableOnRebate: tx.afterRebate,
            Surcharge25ofSI: 0, SurchargeOnAboveCrore: 0, Surcharge25ofSIBeforeMarginal: 0, SurchargeOnAboveCroreBeforeMarginal: 0, TotalSurcharge: 0,
            EducationCess: tx.cess, GrossTaxLiability: tx.liability, GrossTaxPayable: tx.liability, CreditUS115JD: 0, TaxPayAfterCreditUs115JD: tx.liability,
            TaxRelief: { Section89: 0, TotTaxRelief: 0 }, NetTaxLiability: tx.liability,
            IntrstPay: { IntrstPayUs234A: ii.i234A, IntrstPayUs234B: ii.i234B, IntrstPayUs234C: ii.i234C, LateFilingFee234F: ii.fee234F, TotalIntrstPay: interest },
            AggregateTaxInterestLiability: aggregate,
          },
          TaxPaid: { TaxesPaid: { AdvanceTax: advance, TDS: salaryTds + otherTds, TCS: tcs, SelfAssessmentTax: selfTax, TotalTaxesPaid: paid }, BalTaxPayable: Math.max(0, aggregate - paid) },
          Refund: { RefundDue: Math.max(0, paid - aggregate), BankAccountDtls: { BankDtlsFlag: 'Y', AddtnlBankDetails: [bankRow(i.bank)] } },
          AssetOutIndiaFlag: 'NO',
        },
        ...(payments.length ? { ScheduleIT: { TaxPayment: payments.map((x) => ({ BSRCode: x.bsr, DateDep: x.date, SrlNoOfChaln: x.serial, Amt: n0(x.amount) })), TotalTaxPayments: advance + selfTax } } : {}),
        ...(employers.some((e) => e.tan) ? { ScheduleTDS1: { TDSonSalary: employers.filter((e) => e.tan).map((e) => ({ EmployerOrDeductorOrCollectDetl: { TAN: e.tan, EmployerOrDeductorOrCollecterName: clean(e.name, 125) }, IncChrgSal: n0(e.gross), TotalTDSSal: n0(e.tds) })), TotalTDSonSalaries: salaryTds } } : {}),
        ...(i.tdsOther?.length ? { ScheduleTDS2: { TDSOthThanSalaryDtls: i.tdsOther.map((x) => ({ TDSCreditName: 'S', TANOfDeductor: x.tan, TDSSection: x.section, TaxDeductCreditDtls: { TaxDeductedOwnHands: n0(x.tds), TaxClaimedOwnHands: n0(x.tds) }, GrossAmount: n0(x.amount), HeadOfIncome: x.head === 'BP' ? 'NA' : x.head ?? 'OS', AmtCarriedFwd: 0 })), TotalTDSonOthThanSals: otherTds } } : {}),
        ...(i.tcs?.length ? { ScheduleTCS: { TCS: i.tcs.map((x) => ({ TCSCreditOwner: '1', EmployerOrDeductorOrCollectTAN: x.tan, TCSCurrFYDtls: { TCSAmtCollOwnHand: n0(x.tcs) }, TCSClaimedThisYearDtls: { TCSAmtCollOwnHand: n0(x.tcs) }, AmtCarriedFwd: 0 })), TotalSchTCS: tcs } } : {}),
        Verification: verification(p),
      },
    },
  };
  const summary = { grossTotalIncome: gti, totalIncome, tax: tx.liability, interest, paid, payable: Math.max(0, aggregate - paid), refund: Math.max(0, paid - aggregate), lossCarriedForward: carried };
  return { json: issues.length ? null : json, issues, summary };
}
