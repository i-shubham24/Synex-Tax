import { NEW_SLABS, oldSlabs } from '../tds/salary.js';
import {
  ageBandFromDob, address, assesseeName, bankRow, clean, commonChecks, creationInfo, deduction80D, interestAndFee, n0, returnSection, revisedFields, sum, tanIssues, verification,
  type Deduction80DInput, type ItrBank, type ItrFiling, type ItrIssue, type ItrOtherTds, type ItrPerson, type ItrTaxPayment, type ItrTcs,
} from './itrCommon.js';
import { specialRateTax } from './specialRateTax.js';
import type { HouseLoan } from './itr4Json.js';
import { capitalGains, zeroRange, type CgSale } from './schedules/capitalGains.js';
import type { PropertySale } from './schedules/capitalGainsProperty.js';
import { setOffBroughtForward, ITR2_CFL_KEYS, type BroughtForwardYear } from './schedules/broughtForward.js';
import {
  amt, scheduleAL, scheduleEI, scheduleFA, scheduleSpi,
  type AmtCreditYear, type AssetsLiabilities, type ClubbedIncome, type ExemptIncomeInput, type ForeignAssets, type VdaTransfer,
} from './schedules/otherSchedules.js';

export { cgGain, type CgSale } from './schedules/capitalGains.js';

/**
 * ITR-2 JSON for Assessment Year 2026-27 (income of 2025-26), to the Income Tax Department's schema
 * ITR-2_2026_Main_V1.2 (kept in packages/tax-engine/schemas/itr; every test output is validated
 * against it). Arithmetic links between schedules follow the Department's ITR-2 validation rules for
 * AY 2026-27 (version 1.0) and the notified form; rule numbers are cited below.
 *
 * Covered, for a resident individual: salary from one or more employers (with income from a retirement
 * benefit account abroad and relief under section 89A), several house properties, capital gains under
 * section 111A (20%), 112A (12.5% above Rs 1.25 lakh), 112 (12.5%; land or building with the 20%-with-
 * indexation comparison of the second proviso to 112(1)(a), stamp value under 50C, exemptions under 54,
 * 54B, 54EC and 54F), short-term gains at slab rates, virtual digital assets (115BBH at 30%, Schedule VDA);
 * interest, dividends and other income; current-year set-off (sections 70, 71) and losses brought forward
 * (Schedules BFLA and CFL); income of specified persons (Schedule SPI, section 64); exempt and agricultural
 * income for rate purposes (Schedule EI); deductions under 80C, 80CCD(1B), 80D, 80QQB, 80RRB, 80TTA and
 * 80TTB; alternate minimum tax and its credit (Schedules AMT and AMTC); surcharge with marginal relief;
 * Schedule AL above Rs 1 crore and Schedule FA (tables A1, A2, A3 and D); interest under 234A, 234B and
 * 234C (instalment by instalment) and the 234F fee.
 *
 * Not covered, reported as issues: directors and holders of unlisted shares, foreign income and foreign
 * tax credit (Schedules FSI and TR), non-residents, 89A relief on income from other sources, dividends
 * where total income exceeds Rs 2 crore, and alternate minimum tax above Rs 50 lakh of adjusted income.
 */

export const ITR2_DUE_DATE = '2026-07-31';

export interface Itr2Employer {
  tan?: string; name: string; nature: 'CGOV' | 'SGOV' | 'PSU' | 'PE' | 'PESG' | 'PEPS' | 'PEO' | 'OTH';
  address: { line: string; city: string; stateCode: string; pin: string };
  gross: number; tds: number;
  /** Income from a retirement benefit account maintained in a country notified under section 89A (US, UK, Canada; Notification 24/2022). */
  retirement89A?: { country: 'US' | 'UK' | 'CA'; amount: number };
  /** Income from a retirement benefit account in a country not notified under section 89A. */
  retirementOther?: number;
  /** Income taxable this year on which relief under 89A was claimed in an earlier year (withdrawal). */
  retirementPriorRelief?: number;
}
export interface Itr2Property { letOut: boolean; address: string; city: string; stateCode: string; pin: string; rent?: number; municipalTax?: number; loans?: HouseLoan[] }

export interface Itr2Input {
  softwareId: string;
  createdOn: string;
  intermediaryCity: string;
  person: ItrPerson;
  filing: ItrFiling;
  flags?: { director?: boolean; unlistedShares?: boolean; foreignAssets?: boolean; landOrBuildingSold?: boolean; lossesBroughtForward?: boolean; foreignIncome?: boolean };
  salary?: {
    professionalTax?: number; employers: Itr2Employer[];
    /** Income from a notified-country retirement account claimed for relief under section 89A this year (Form 10-EE filed by the due date, rule 21AAA). */
    relief89A?: { amount: number; form10EEFiled: boolean };
  };
  houses?: Itr2Property[];
  capitalGains?: CgSale[];
  /** Sale of land or building (Schedule CG items A1 and B1). */
  propertySales?: PropertySale[];
  /** Transfers of virtual digital assets (Schedule VDA). */
  vda?: VdaTransfer[];
  otherSources?: { savingsInterest?: number; depositInterest?: number; refundInterest?: number; dividends?: number; other?: number; otherDescription?: string };
  exemptIncome?: ExemptIncomeInput;
  clubbedIncome?: ClubbedIncome[];
  lossesBroughtForward?: BroughtForwardYear[];
  deductions?: {
    section80C?: { amount: number; id: string }[]; section80CCD1B?: number; section80D?: Deduction80DInput;
    /** Royalty of an author (80QQB) and on a patent (80RRB), each up to Rs 3 lakh, with the Form 10CCD or 10CCE acknowledgement. */
    section80QQB?: { amount: number; form10CCDAck: string };
    section80RRB?: { amount: number; form10CCEAck: string };
  };
  /** AMT credit brought forward from earlier years (section 115JD), as in the earlier returns. */
  amtCredit?: AmtCreditYear[];
  assetsLiabilities?: AssetsLiabilities;
  foreignAssets?: ForeignAssets;
  tdsOther?: (ItrOtherTds & { head?: 'HP' | 'OS' | 'NA' | 'BP' })[];
  tcs?: ItrTcs[];
  taxPayments?: ItrTaxPayment[];
  /** @deprecated 234C is now worked instalment by instalment from the advance tax dates; this field is ignored. */
  interest234C?: number;
  bank: ItrBank;
}

const EI_SUBCATEGORIES = ['10(30)', '10(31)', '10(37)', '10(10BB)', '10(10BC)', '10(17A)', '10(12AB)', '10(15)', '10(23FBB)', '10(23FD)', '10(35)', '10(35A)', '10(23FBC)', '10(33)', '10(4B)', '10(4C)', '10(4E)', '10(36)', '10(37A)', '10(12C)', '10(18)', '10(19)', 'DMD', '10(32)', '10(43)', '10(19A)', '10(26)', '10(26AAA)', '10(10D)', '10(11)', '10(11A)', '10(12)', '10(12A)', '10(12AA)', '10(12B)', '10(12BA)', '10(13)', '10(2)', '10(16)', '10(4)(ii)', '10(4)(i)', '10(4F)', '10(4G)', '10(6B)', '10(6D)', 'Incmexmptcircular', 'Incmexmptnotification', 'Receiptnotincme', '10(8)', '10(8A)', '10(8B)', '10(9)'] as const;


export function writeItr2(i: Itr2Input): { json: Record<string, unknown> | null; issues: ItrIssue[]; summary: Record<string, number> } {
  const p = i.person;
  const regime = i.filing.regime;
  const old = regime === 'OLD';
  const issues: ItrIssue[] = commonChecks({ softwareId: i.softwareId, createdOn: i.createdOn, person: p, filing: i.filing, bank: i.bank, dueDate: ITR2_DUE_DATE, form: 'ITR-2' });
  const err = (field: string, message: string) => issues.push({ field, message });
  const f = i.flags ?? {};
  if (f.director || f.unlistedShares) err('flags', 'Directors and holders of unlisted shares must give company details in the return; this file does not write them yet.');
  if (f.foreignIncome) err('flags', 'Foreign income and relief for foreign tax (Schedules FSI and TR) are not written by this file.');
  if (f.foreignAssets && !i.foreignAssets) err('foreignAssets', 'Foreign assets are held: give them for Schedule FA (validation rule 746).');
  if (f.landOrBuildingSold && !i.propertySales?.length) err('propertySales', 'A sale of land or building is flagged: give each sale with its stamp value and buyers for Schedule CG.');
  if (f.lossesBroughtForward && !i.lossesBroughtForward?.length) err('lossesBroughtForward', 'Losses brought forward: give each earlier year as in Schedule CFL of that return.');
  issues.push(...tanIssues([...(i.salary?.employers ?? []).filter((e) => e.tan).map((e) => ({ tan: e.tan! })), ...(i.tdsOther ?? []), ...(i.tcs ?? [])], 'tan'));
  const age = ageBandFromDob(p.dob);

  // Salary (Schedule S): standard deduction 16(ia) Rs 75,000 new regime, Rs 50,000 old; professional tax 16(iii) old regime up to Rs 2,500.
  // Section 89A and rule 21AAA: income of a notified-country retirement account may be taxed on withdrawal instead (item 3a).
  const employers = i.salary?.employers ?? [];
  const empGross = (e: Itr2Employer) => n0(e.gross) + n0(e.retirement89A?.amount) + n0(e.retirementOther) + n0(e.retirementPriorRelief);
  const gross = sum(employers.map(empGross));
  const notified89A = sum(employers.map((e) => n0(e.retirement89A?.amount)));
  const r89 = i.salary?.relief89A;
  const relief89A = r89 ? n0(r89.amount) : 0;
  if (relief89A > notified89A) err('salary', 'Relief under section 89A can be claimed only on income from a retirement benefit account in a notified country.');
  if (relief89A && !r89?.form10EEFiled) err('salary', 'Relief under section 89A needs Form 10-EE furnished by the due date under section 139(1) (rule 21AAA(2)).');
  const netSalary = gross - relief89A;
  const std = Math.min(netSalary, old ? 50000 : 75000);
  const pt = old ? Math.min(n0(i.salary?.professionalTax), 2500, netSalary - std) : 0;
  const salary = netSalary - std - pt;

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

  // Capital gains (Schedules CG, 112A, VDA) with set-off within the head (section 70).
  const cg = capitalGains({ form: 'ITR-2', sales: i.capitalGains ?? [], property: i.propertySales ?? [], vda: i.vda ?? [] });
  issues.push(...cg.issues);
  const cgAfter = cg.after;
  const vda = cg.vda.total;

  // Schedule CYLA: a house property loss against other heads, old regime only, up to Rs 2 lakh (71(3A)); none in the new regime (rule 264).
  const hpLoss = Math.max(0, -hpTotal);
  let hpLossLeft = old ? Math.min(hpLoss, 200000) : 0;
  const take = (v: number) => { const t = Math.min(hpLossLeft, v); hpLossLeft -= t; return t; };
  const hpIn = { sal: take(salary), os: take(osIncome), stApp: take(cgAfter.stApp), st20: take(cgAfter.st20), lt: 0 };
  const ltBeforeHp = cgAfter.lt;
  hpIn.lt = Math.min(hpLossLeft, ltBeforeHp); hpLossLeft -= hpIn.lt; cg.reduceLt(hpIn.lt);
  const hpSetOff = hpIn.sal + hpIn.os + hpIn.stApp + hpIn.st20 + hpIn.lt;
  const hpCarried = hpLoss - hpSetOff;
  const lt0 = cg.current();
  const cyla = { sal: salary - hpIn.sal, hp: Math.max(0, hpTotal), bp: 0, spec: 0, os: osIncome - hpIn.os, st20: cgAfter.st20 - hpIn.st20, stApp: cgAfter.stApp - hpIn.stApp, ltA: lt0.ltA, ltO: lt0.ltO };

  // Schedule BFLA: losses of earlier years (sections 71B, 74).
  const bf = setOffBroughtForward(cyla, i.lossesBroughtForward ?? [], [], 'ITR-2');
  issues.push(...bf.issues);
  const after = { ...bf.left, lt: bf.left.ltA + bf.left.ltO };

  const totalTI = salary + Math.max(0, hpTotal) + (cgAfter.st20 + cgAfter.stApp + cgAfter.lt) + vda + osIncome;
  const bflaTotal = after.sal + after.hp + after.os + after.st20 + after.stApp + after.lt;
  const gti = bflaTotal + vda;
  const splIncome = after.st20 + after.lt + vda; // 111A, 112, 112A and 115BBH in Part B-TI item 10

  // Schedule SPI: income of specified persons included under section 64.
  const ei = scheduleEI(i.exemptIncome, [], EI_SUBCATEGORIES, 'ITR-2');
  issues.push(...ei.issues);
  const spi = scheduleSpi(i.clubbedIncome ?? [], { SA: salary, HP: Math.abs(hpTotal), CG: Math.abs(cg.raw.st20Raw) + Math.abs(cg.raw.stAppRaw) + Math.abs(cg.raw.ltARaw) + Math.abs(cg.raw.ltORaw) + vda, OS: osIncome, EI: ei.total });
  issues.push(...spi.issues);
  if ((i.clubbedIncome ?? []).some((r) => r.head === 'BP')) err('clubbedIncome', 'Business income of a specified person goes in ITR-3.');

  // Chapter VI-A (old regime only) up to GTI less special-rate income (rule 509).
  const d = old ? i.deductions ?? {} : {};
  if (!old && (i.deductions?.section80QQB || i.deductions?.section80RRB)) err('deductions', 'Deductions under 80QQB and 80RRB are not allowed in the new regime (validation rule 342).');
  const c80Claimed = sum((d.section80C ?? []).map((r) => n0(r.amount)));
  const c80 = Math.min(c80Claimed, 150000);
  const c80ccd1b = Math.min(n0(d.section80CCD1B), 50000);
  const d80 = deduction80D(d.section80D, age);
  issues.push(...d80.issues);
  const c80tta = old && age === 'BELOW_60' ? Math.min(sav, 10000) : 0;
  const c80ttb = old && age !== 'BELOW_60' ? Math.min(sav + dep, 50000) : 0;
  // 80QQB and 80RRB: up to Rs 3 lakh each (80QQB(1), 80RRB(1)), not more than the royalty in other sources (rule 337), return by the due date (rules 340, 341).
  const qqb = Math.min(n0(d.section80QQB?.amount), 300000);
  const rrb = Math.min(n0(d.section80RRB?.amount), 300000);
  if (qqb + rrb > oth) err('deductions', 'Deductions under 80QQB and 80RRB cannot exceed the royalty income entered under other sources (validation rule 337).');
  if ((qqb || rrb) && i.createdOn > ITR2_DUE_DATE) err('deductions', 'Deductions under 80QQB and 80RRB need the return filed by the due date (validation rules 340 and 341).');
  if (qqb && !/^\d{15}$/.test(d.section80QQB?.form10CCDAck ?? '')) err('deductions', 'Give the acknowledgement number of Form 10CCD for 80QQB (validation rule 648).');
  if (rrb && !/^\d{15}$/.test(d.section80RRB?.form10CCEAck ?? '')) err('deductions', 'Give the acknowledgement number of Form 10CCE for 80RRB (validation rule 649).');
  const viaClaimed = c80 + c80ccd1b + d80.allowed + c80tta + c80ttb + qqb + rrb;
  const via = Math.min(viaClaimed, Math.max(0, gti - splIncome));
  // Specified deductions for 115JC: Part C of Chapter VI-A as allowed (rule 421).
  const specified = Math.min(qqb + rrb, via);
  // Total income rounded to the nearest Rs 10 (section 288A; rule 506).
  const totalIncome = Math.round((gti - via) / 10) * 10;
  const al = i.assetsLiabilities;
  if (totalIncome > 10000000 && !al) err('assetsLiabilities', 'Total income exceeds Rs 1 crore: Schedule AL (assets and liabilities on 31 Mar 2026) is required (validation rule 456).');
  const fa = scheduleFA(i.foreignAssets ?? {});
  issues.push(...fa.issues);
  if (vda && !old && totalIncome <= 1200000) err('vda', 'With total income up to Rs 12 lakh the 87A rebate question for tax under 115BBH arises; this file does not write it.');
  if (vda && old && totalIncome <= 500000) err('vda', 'With total income up to Rs 5 lakh the 87A rebate question for tax under 115BBH arises; this file does not write it.');

  const taxOn = (ti: number, st: number, ltA: number, ltO: number, vd: number) => specialRateTax({ regime, age, totalIncome: ti, st111A: st, lt112A: ltA, lt112: ltO, vda: vd, excess112: cg.excess, agri: ei.netAgri, dividends: div });
  const tx = taxOn(totalIncome, after.st20, after.ltA, after.ltO, vda);
  if (tx.refusal) err('income', tx.refusal);
  const regular = tx.liability; // Part B-TTI item 7
  const am = amt(totalIncome, specified, regular, i.amtCredit ?? [], old);
  issues.push(...am.issues);
  const grossPayable = Math.max(regular, am.deemed); // item 8
  const afterCredit = grossPayable - am.utilised; // item 10
  const netTax = afterCredit;

  const salaryTds = sum(employers.map((e) => n0(e.tds)));
  const otherTds = sum((i.tdsOther ?? []).map((t) => n0(t.tds)));
  const tcs = sum((i.tcs ?? []).map((t) => n0(t.tcs)));
  const payments = i.taxPayments ?? [];
  const advance = sum(payments.filter((t) => t.kind === 'ADVANCE').map((t) => n0(t.amount)));
  const selfTax = sum(payments.filter((t) => t.kind === 'SELF').map((t) => n0(t.amount)));
  // Second proviso to 234C(1): tax due at each instalment leaving out gains that arose after its date (Table F quarters).
  const tf = cg.tableF({ st20: after.st20, stApp: after.stApp, lt: after.lt });
  const later = (k: number, q: number[]) => sum(q.slice(k + 1));
  const dueBeforeLaterGains = [0, 1, 2, 3].map((k) => {
    const lst = later(k, tf.quarters.st20), lapp = later(k, tf.quarters.stApp), llt = later(k, tf.quarters.lt), lv = later(k, tf.quarters.vda);
    const ltOcut = Math.min(after.ltO, llt);
    const t = taxOn(Math.max(0, totalIncome - lst - lapp - llt - lv), after.st20 - lst, after.ltA - (llt - ltOcut), after.ltO - ltOcut, vda - lv);
    return Math.max(t.liability, am.deemed) - am.utilised;
  });
  const ii = interestAndFee({
    liability: netTax, tdsTcs: salaryTds + otherTds + tcs, payments, filedOn: i.createdOn, dueDate: ITR2_DUE_DATE, totalIncome, exemption: (old ? oldSlabs(age) : NEW_SLABS)[0][0],
    dueBeforeLaterGains, noAdvanceTax: age !== 'BELOW_60',
  });
  const interest = ii.i234A + ii.i234B + ii.i234C + ii.fee234F;
  const aggregate = netTax + interest;
  const paid = salaryTds + otherTds + tcs + advance + selfTax;

  const cyl = (incomeHead: number, hpSet: number) => ({ IncCYLA: { IncOfCurYrUnderThatHead: incomeHead, HPlossCurYrSetoff: hpSet, OthSrcLossNoRaceHorseSetoff: 0, IncOfCurYrAfterSetOff: incomeHead - hpSet } });
  const bfla = (from: number, set: number) => ({ IncBFLA: { IncOfCurYrUndHeadFromCYLA: from, BFlossPrevYrUndSameHeadSetoff: set, IncOfCurYrAfterSetOffBFLosses: from - set } });
  const plain = (v: number) => ({ IncBFLA: { IncOfCurYrUndHeadFromCYLA: v, IncOfCurYrAfterSetOffBFLosses: v } });
  const zeroCyla = () => ({ IncCYLA: { IncOfCurYrUnderThatHead: 0, IncOfCurYrAfterSetOff: 0 } });
  const currentCarried = hpCarried + cg.stclCarried + cg.ltLoss;
  // Losses of AY 2018-19 not used this year lapse: the 8 assessment years end with AY 2026-27 (sections 71B, 74).
  const y18 = bf.used.find((u) => u.y.ay === '2018-19');
  const lapse = y18 ? { hp: n0(y18.y.hp) - y18.hp, st: n0(y18.y.stcl) - y18.st, lt: n0(y18.y.ltcl) - y18.lt } : { hp: 0, st: 0, lt: 0 };
  const bfRemain = { hp: bf.earlier.hp - bf.adjusted.hp - lapse.hp, st: bf.earlier.st - bf.adjusted.st - lapse.st, lt: bf.earlier.lt - bf.adjusted.lt - lapse.lt };
  const lossRow = (hp: number, st: number, lt: number) => ({ LossSummaryDetail: { TotalHPPTILossCF: hp, TotalSTCGPTILossCF: st, TotalLTCGPTILossCF: lt } });
  const bfYears = i.lossesBroughtForward ?? [];

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
              Salarys: {
                GrossSalary: empGross(e), Salary: n0(e.gross), ValueOfPerquisites: 0, ProfitsinLieuOfSalary: 0,
                IncomeNotified89A: n0(e.retirement89A?.amount), ...(e.retirement89A && n0(e.retirement89A.amount) ? { IncomeNotified89AType: [{ NOT89ACountrycode: e.retirement89A.country, NOT89AAmount: n0(e.retirement89A.amount) }] } : {}),
                IncomeNotifiedOther89A: n0(e.retirementOther), ...(n0(e.retirementPriorRelief) ? { IncomeNotifiedPrYr89A: n0(e.retirementPriorRelief) } : {}),
              },
            })),
            TotalGrossSalary: gross, AllwncExtentExemptUs10: 0, ...(relief89A ? { Increliefus89A: relief89A } : {}), NetSalary: netSalary, DeductionUS16: std + pt, DeductionUnderSection16ia: std, EntertainmntalwncUs16ii: 0, ProfessionalTaxUs16iii: pt, TotIncUnderHeadSalaries: salary,
          },
        } : {}),
        ...(props.length ? { ScheduleHP: { PropertyDetails: props.map((x) => x.row), TotalIncomeChargeableUnHP: hpTotal } } : {}),
        ...(cg.any || vda ? { ScheduleCGFor23: { ...cg.scheduleCG, AccruOrRecOfCG: tf.table } } : {}),
        ...(cg.schedule112A ? { Schedule112A: cg.schedule112A } : {}),
        ...(cg.vda.rows.length ? { ScheduleVDA: { ScheduleVDADtls: cg.vda.rows.map(({ _date, ...r }) => r), TotIncCapGain: vda } } : {}),
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
          ...(employers.length ? { Salary: cyl(salary, hpIn.sal) } : {}),
          ...(hpTotal > 0 ? { HP: { IncCYLA: { IncOfCurYrUnderThatHead: hpTotal, OthSrcLossNoRaceHorseSetoff: 0, IncOfCurYrAfterSetOff: hpTotal } } } : {}),
          STCG20Per: cyl(cgAfter.st20, hpIn.st20), STCG30Per: zeroCyla(), STCGAppRate: cyl(cgAfter.stApp, hpIn.stApp), STCGDTAARate: zeroCyla(),
          LTCG12_5Per: cyl(ltBeforeHp, hpIn.lt), LTCGDTAARate: zeroCyla(),
          ...(osIncome ? { OthSrcExclRaceHorse: { IncCYLA: { IncOfCurYrUnderThatHead: osIncome, HPlossCurYrSetoff: hpIn.os, IncOfCurYrAfterSetOff: cyla.os } } } : {}),
          TotalCurYr: { TotHPlossCurYr: hpLoss, TotOthSrcLossNoRaceHorse: 0 },
          TotalLossSetOff: { TotHPlossCurYrSetoff: hpSetOff, TotOthSrcLossNoRaceHorseSetoff: 0 },
          LossRemAftSetOff: { BalHPlossCurYrAftSetoff: hpCarried, BalOthSrcLossNoRaceHorseAftSetoff: 0 },
        },
        ScheduleBFLA: {
          Salary: plain(after.sal), ...(cyla.hp ? { HP: bfla(cyla.hp, bf.setOff.hp) } : {}),
          STCG20Per: bfla(cyla.st20, bf.setOff.st20), STCG30Per: bfla(0, 0), STCGAppRate: bfla(cyla.stApp, bf.setOff.stApp), STCGDTAARate: bfla(0, 0),
          LTCG12_5Per: bfla(cyla.ltA + cyla.ltO, bf.setOff.ltA + bf.setOff.ltO), LTCGDTAARate: bfla(0, 0),
          ...(osIncome ? { OthSrcExclRaceHorse: plain(after.os) } : {}),
          TotalBFLossSetOff: { TotBFLossSetoff: bf.lossTotal },
          IncomeOfCurrYrAftCYLABFLA: bflaTotal,
        },
        ...(currentCarried || bfYears.length ? {
          ScheduleCFL: {
            ...Object.fromEntries(bfYears.filter((y) => ITR2_CFL_KEYS[y.ay]).map((y) => [ITR2_CFL_KEYS[y.ay], { CarryFwdLossDetail: { DateOfFiling: y.filedOn, TotalHPPTILossCF: n0(y.hp), TotalSTCGPTILossCF: n0(y.stcl), TotalLTCGPTILossCF: n0(y.ltcl) } }])),
            TotalOfBFLossesEarlierYrs: lossRow(bf.earlier.hp, bf.earlier.st, bf.earlier.lt),
            ...(bfYears.length ? { AdjTotBFLossInBFLA: lossRow(bf.adjusted.hp, bf.adjusted.st, bf.adjusted.lt) } : {}),
            CurrentAYloss: lossRow(hpCarried, cg.stclCarried, cg.ltLoss),
            TotalLossCFSummary: lossRow(bfRemain.hp + hpCarried, bfRemain.st + cg.stclCarried, bfRemain.lt + cg.ltLoss),
          },
        } : {}),
        ScheduleVIA: {
          UsrDeductUndChapVIA: {
            Section80C: old ? c80Claimed : 0, Section80CCD1B: old ? n0(d.section80CCD1B) : 0, Section80D: old ? d80.claimed : 0, Section80G: 0, Section80GGA: 0,
            ...(qqb ? { Section80QQB: n0(d.section80QQB?.amount), Form10CCDAckNum: d.section80QQB?.form10CCDAck } : {}), ...(rrb ? { Section80RRB: n0(d.section80RRB?.amount), Form10CCEAckNum: d.section80RRB?.form10CCEAck } : {}),
            Section80TTA: c80tta, Section80TTB: c80ttb, TotalChapVIADeductions: old ? c80Claimed + n0(d.section80CCD1B) + d80.claimed + c80tta + c80ttb + n0(d.section80QQB?.amount) + n0(d.section80RRB?.amount) : 0,
          },
          DeductUndChapVIA: { Section80C: c80, Section80CCD1B: c80ccd1b, Section80D: d80.allowed, Section80G: 0, Section80GGA: 0, ...(qqb ? { Section80QQB: qqb } : {}), ...(rrb ? { Section80RRB: rrb } : {}), Section80TTA: c80tta, Section80TTB: c80ttb, TotalChapVIADeductions: via },
        },
        ...(old && c80Claimed ? { Schedule80C: { Schedule80CDtls: (d.section80C ?? []).map((r) => ({ Amount: n0(r.amount), IdentificationNo: clean(r.id, 50) })), TotalAmt: c80Claimed } } : {}),
        ...(old && d80.allowed ? { Schedule80D: d80.schedule } : {}),
        ...(old && (specified || (i.amtCredit ?? []).length) ? { ScheduleAMT: { TotalIncItemPartBTI: totalIncome, DeductionClaimUndrAnySec: specified, AdjustedUnderSec115JC: am.ati, TaxPayableUnderSec115JC: am.tax } } : {}),
        ...(old && (am.deemed || (i.amtCredit ?? []).length) ? { ScheduleAMTC: am.amtc } : {}),
        ...(spi.schedule ? { ScheduleSPI: spi.schedule } : {}),
        ...(tx.si.length ? { ScheduleSI: { SplCodeRateTax: tx.si.map(([c, r, inc, t]) => ({ SecCode: c, SplRatePercent: r, SplRateInc: inc, SplRateIncTax: t })), TotSplRateInc: sum(tx.si.map((x) => x[2])), TotSplRateIncTax: tx.taxSpecial } } : {}),
        ...(ei.schedule ? { ScheduleEI: ei.schedule } : {}),
        ...(fa.any ? { ScheduleFA: fa.schedule } : {}),
        ...(al ? { ScheduleAL: scheduleAL(al, 'ITR-2') } : {}),
        'PartB-TI': {
          Salaries: after.sal + hpIn.sal, IncomeFromHP: Math.max(0, hpTotal),
          CapGain: {
            ShortTerm: { ShortTerm20Per: cgAfter.st20, ShortTerm30Per: 0, ShortTermAppRate: cgAfter.stApp, ShortTermSplRateDTAA: 0, TotalShortTerm: cgAfter.st20 + cgAfter.stApp },
            LongTerm: { LongTerm12_5Per: ltBeforeHp, LongTermSplRateDTAA: 0, TotalLongTerm: ltBeforeHp },
            ShortTermLongTermTotal: cgAfter.st20 + cgAfter.stApp + ltBeforeHp, CapGains30Per115BBH: vda, TotalCapGains: cgAfter.st20 + cgAfter.stApp + ltBeforeHp + vda,
          },
          IncFromOS: { OtherSrcThanOwnRaceHorse: osIncome, IncChargblSplRate: 0, FromOwnRaceHorse: 0, TotIncFromOS: osIncome },
          TotalTI: totalTI, CurrentYearLoss: hpSetOff, BalanceAfterSetoffLosses: totalTI - hpSetOff, BroughtFwdLossesSetoff: bf.lossTotal, GrossTotalIncome: gti,
          IncChargeTaxSplRate111A112: splIncome, DeductionsUnderScheduleVIA: via, TotalIncome: totalIncome,
          IncChargeableTaxSplRates: splIncome, NetAgricultureIncomeOrOtherIncomeForRate: ei.netAgri, AggregateIncome: totalIncome - splIncome + ei.netAgri,
          LossesOfCurrentYearCarriedFwd: currentCarried, DeemedIncomeUs115JC: old && (specified || (i.amtCredit ?? []).length) ? am.ati : 0,
        },
        PartB_TTI: {
          TaxPayDeemedTotIncUs115JC: am.tax, Surcharge: 0, HealthEduCess: am.cess, TotalTaxPayablDeemedTotInc: am.deemed,
          ComputationOfTaxLiability: {
            TaxPayableOnTI: { TaxAtNormalRatesOnAggrInc: tx.taxNormal, TaxAtSpecialRates: tx.taxSpecial, RebateOnAgriInc: tx.agriRebate, TaxPayableOnTotInc: tx.taxNormal + tx.taxSpecial - tx.agriRebate },
            Rebate87A: tx.rebate, TaxPayableOnRebate: tx.afterRebate,
            Surcharge25ofSI: 0, SurchargeOnAboveCrore: tx.surcharge, Surcharge25ofSIBeforeMarginal: 0, SurchargeOnAboveCroreBeforeMarginal: tx.surchargeBeforeRelief, TotalSurcharge: tx.surcharge,
            EducationCess: tx.cess, GrossTaxLiability: regular, GrossTaxPayable: grossPayable, CreditUS115JD: am.utilised, TaxPayAfterCreditUs115JD: afterCredit,
            TaxRelief: { Section89: 0, TotTaxRelief: 0 }, NetTaxLiability: netTax,
            IntrstPay: { IntrstPayUs234A: ii.i234A, IntrstPayUs234B: ii.i234B, IntrstPayUs234C: ii.i234C, LateFilingFee234F: ii.fee234F, TotalIntrstPay: interest },
            AggregateTaxInterestLiability: aggregate,
          },
          TaxPaid: { TaxesPaid: { AdvanceTax: advance, TDS: salaryTds + otherTds, TCS: tcs, SelfAssessmentTax: selfTax, TotalTaxesPaid: paid }, BalTaxPayable: Math.max(0, aggregate - paid) },
          Refund: { RefundDue: Math.max(0, paid - aggregate), BankAccountDtls: { BankDtlsFlag: 'Y', AddtnlBankDetails: [bankRow(i.bank)] } },
          AssetOutIndiaFlag: fa.any ? 'YES' : 'NO',
        },
        ...(payments.length ? { ScheduleIT: { TaxPayment: payments.map((x) => ({ BSRCode: x.bsr, DateDep: x.date, SrlNoOfChaln: x.serial, Amt: n0(x.amount) })), TotalTaxPayments: advance + selfTax } } : {}),
        ...(employers.some((e) => e.tan) ? { ScheduleTDS1: { TDSonSalary: employers.filter((e) => e.tan).map((e) => ({ EmployerOrDeductorOrCollectDetl: { TAN: e.tan, EmployerOrDeductorOrCollecterName: clean(e.name, 125) }, IncChrgSal: n0(e.gross), TotalTDSSal: n0(e.tds) })), TotalTDSonSalaries: salaryTds } } : {}),
        ...(i.tdsOther?.length ? { ScheduleTDS2: { TDSOthThanSalaryDtls: i.tdsOther.map((x) => ({ TDSCreditName: 'S', TANOfDeductor: x.tan, TDSSection: x.section, TaxDeductCreditDtls: { TaxDeductedOwnHands: n0(x.tds), TaxClaimedOwnHands: n0(x.tds) }, GrossAmount: n0(x.amount), HeadOfIncome: x.head === 'BP' ? 'NA' : x.head ?? 'OS', AmtCarriedFwd: 0 })), TotalTDSonOthThanSals: otherTds } } : {}),
        ...(i.tcs?.length ? { ScheduleTCS: { TCS: i.tcs.map((x) => ({ TCSCreditOwner: '1', EmployerOrDeductorOrCollectTAN: x.tan, TCSCurrFYDtls: { TCSAmtCollOwnHand: n0(x.tcs) }, TCSClaimedThisYearDtls: { TCSAmtCollOwnHand: n0(x.tcs) }, AmtCarriedFwd: 0 })), TotalSchTCS: tcs } } : {}),
        Verification: verification(p),
      },
    },
  };
  const summary = {
    grossTotalIncome: gti, totalIncome, tax: netTax, surcharge: tx.surcharge, amt: am.deemed, amtCreditUsed: am.utilised, interest, paid,
    payable: Math.max(0, aggregate - paid), refund: Math.max(0, paid - aggregate), lossCarriedForward: currentCarried, broughtForwardSetOff: bf.lossTotal, excessTaxIgnored112: cg.excess,
  };
  return { json: issues.length ? null : json, issues, summary };
}

