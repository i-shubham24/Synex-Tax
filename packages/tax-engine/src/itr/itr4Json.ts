import { NEW_SLABS, oldSlabs } from '../tds/salary.js';
import {
  ageBandFromDob, address, deduction80D, type Deduction80DInput, assesseeName, bankRow, clean, commonChecks, creationInfo, interestAndFee, n0, returnSection, revisedFields, salaryHead, sum, tanIssues, verification,
  type ItrBank, type ItrFiling, type ItrIssue, type ItrOtherTds, type ItrPerson, type ItrSalaryTds, type ItrTaxPayment, type ItrTcs,
} from './itrCommon.js';

/**
 * ITR-4 (Sugam) JSON for Assessment Year 2026-27 (income of 2025-26), to the Income Tax Department's
 * schema ITR-4_2026_Main_V1.1 (release of 30 Jun 2026), kept in packages/tax-engine/schemas/itr. Every
 * test output is validated against it, and the Department's ITR-4 validation rules for AY 2026-27
 * (version 1.0) are followed where they decide a figure; rule numbers are cited below.
 *
 * For a resident individual with presumptive income under section 44AD (business), 44ADA
 * (profession) or 44AE (goods carriages), salary, one house property, other sources and long-term
 * gains under section 112A up to Rs 1.25 lakh, total income up to Rs 50 lakh. Not covered: HUF and
 * firm returns, exempt allowances under section 10, family pension, agricultural income, Schedule
 * 80G and other Chapter VI-A deductions than 80C, 80CCD(1B), 80D, 80TTA and 80TTB.
 *
 * The due date under section 139(1) for ITR-4 is 31 Aug 2026 (schema field ItrFilingDueDate and
 * validation rule 234).
 */

export const ITR4_DUE_DATE = '2026-08-31';

/** Business codes the schema allows under 44ADA and 44AE (enums CodeADA and CodeAE). The 44AD list has 315 codes and is checked by the schema. */
export const ITR4_CODES_44ADA = ['14001', '14002', '14003', '14004', '14006', '14008', '16001', '16002', '16003', '16004', '16005', '16007', '16008', '16009', '16013', '16018', '16019_1', '16020', '16021', '18001', '18002', '18003', '18004', '18005', '18010', '18011', '18012', '18013', '18014', '18015', '18016', '18017', '18018', '18019', '18020', '20010', '20011', '20012'] as const;
export const ITR4_CODES_44AE = ['08001', '11002', '11008', '11010', '11011', '11012', '11015'] as const;

export interface PresumptiveReceipts {
  code: string;
  name: string;
  /** Received by account payee cheque or draft, bank transfer or other prescribed electronic mode, by the due date. */
  digital: number;
  cash: number;
  otherMode?: number;
  /** Income offered, when more than the minimum; for 44AD the part on digital receipts and the part on the rest. */
  declaredDigital?: number;
  declaredOther?: number;
  declared?: number;
}

export interface GoodsCarriage {
  regNo: string;
  ownership: 'OWN' | 'LEASE' | 'HIRED';
  /** Gross vehicle weight in tonnes; above 12 tonnes the vehicle is a heavy goods vehicle (Explanation to 44AE). */
  tonnage: number;
  months: number; // months or part of a month held during the year
  declared?: number;
}

export interface BusinessFinancials {
  capital?: number; securedLoans?: number; unsecuredLoans?: number; advances?: number; sundryCreditors?: number; otherLiabilities?: number;
  fixedAssets?: number; investments?: number; inventories?: number; sundryDebtors?: number; bank?: number; cashInHand?: number; loansAdvances?: number; otherAssets?: number;
}

export interface HouseLoan { from: 'B' | 'I'; lender: string; account: string; sanctionedOn: string; amount: number; outstanding: number; interest: number }

export interface Itr4Input {
  softwareId: string;
  createdOn: string; // YYYY-MM-DD, also the date of filing used for interest
  intermediaryCity: string;
  person: ItrPerson;
  /** The new regime applies unless the taxpayer opted out by Form 10-IEA by the due date (section 115BAC(6)). */
  filing: ItrFiling & { form10IEA?: { assessmentYear: '2024-25' | '2025-26' | '2026-27'; ack: string; date?: string } };
  salary?: { gross: number; professionalTax?: number; employers: ItrSalaryTds[] };
  house?: { letOut: boolean; address: string; city: string; stateCode: string; pin: string; rent?: number; municipalTax?: number; loans?: HouseLoan[] };
  otherSources?: { savingsInterest?: number; depositInterest?: number; dividends?: number; other?: number; otherDescription?: string };
  ltcg112A?: { saleValue: number; cost: number };
  business: {
    ad?: PresumptiveReceipts;
    ada?: PresumptiveReceipts;
    ae?: { code: string; name: string; vehicles: GoodsCarriage[] };
    gstins?: { gstin: string; turnover: number }[];
    financials?: BusinessFinancials;
  };
  deductions?: {
    section80C?: { amount: number; id: string }[];
    section80CCD1B?: number;
    section80D?: Deduction80DInput;
  };
  tdsOther?: ItrOtherTds[];
  tcs?: ItrTcs[];
  taxPayments?: ItrTaxPayment[];
  interest234C?: number;
  bank: ItrBank;
}

const ceilPct = (amount: number, pct: number) => Math.ceil((amount * pct) / 100);

/** Minimum presumptive income per goods carriage under 44AE(2): Rs 1,000 per tonne a month for a heavy goods vehicle, Rs 7,500 a month for any other. */
export const min44AE = (v: Pick<GoodsCarriage, 'tonnage' | 'months'>) => (v.tonnage > 12 ? 1000 * v.tonnage * v.months : 7500 * v.months);

export function presumptiveIncome(b: Itr4Input['business']) {
  const ad = b.ad;
  const adTurnover = ad ? n0(ad.digital) + n0(ad.cash) + n0(ad.otherMode) : 0;
  // 44AD(1) proviso: 6% of turnover received by banking channels, 8% of the rest (validation rules 5 to 7).
  const ad6 = ad ? Math.max(n0(ad.declaredDigital), ceilPct(n0(ad.digital), 6)) : 0;
  const ad8 = ad ? Math.max(n0(ad.declaredOther), ceilPct(n0(ad.cash) + n0(ad.otherMode), 8)) : 0;
  const ada = b.ada;
  const adaReceipts = ada ? n0(ada.digital) + n0(ada.cash) + n0(ada.otherMode) : 0;
  // 44ADA(1): 50% of gross receipts (validation rule 14).
  const adaIncome = ada ? Math.max(n0(ada.declared), ceilPct(adaReceipts, 50)) : 0;
  const vehicles = (b.ae?.vehicles ?? []).map((v) => ({ ...v, income: Math.max(n0(v.declared), min44AE(v)) }));
  const aeIncome = sum(vehicles.map((v) => v.income));
  return { adTurnover, ad6, ad8, adIncome: ad6 + ad8, adaReceipts, adaIncome, vehicles, aeIncome, total: ad6 + ad8 + adaIncome + aeIncome };
}

export function writeItr4(i: Itr4Input): { json: Record<string, unknown> | null; issues: ItrIssue[]; summary: Record<string, number> } {
  const p = i.person;
  const regime = i.filing.regime;
  const issues: ItrIssue[] = commonChecks({ softwareId: i.softwareId, createdOn: i.createdOn, person: p, filing: i.filing, bank: i.bank, dueDate: ITR4_DUE_DATE, form: 'ITR-4' });
  const err = (field: string, message: string) => issues.push({ field, message });
  const age = ageBandFromDob(p.dob);
  const b = i.business ?? {};
  const pi = presumptiveIncome(b);

  // Eligibility for the presumptive sections and for ITR-4.
  if (!b.ad && !b.ada && !b.ae?.vehicles.length) err('business', 'ITR-4 is for income under section 44AD, 44ADA or 44AE (rule 12(1)(ca) and validation rule 140); with none, use ITR-1 or ITR-2.');
  if (b.ad) {
    // 44AD(1): turnover up to Rs 2 crore, or Rs 3 crore where cash receipts are not more than 5% of the total (proviso, Finance Act 2023).
    const limit = n0(b.ad.cash) <= pi.adTurnover * 0.05 ? 30000000 : 20000000;
    if (pi.adTurnover > limit) err('ad', `Turnover of Rs ${pi.adTurnover} is above the 44AD limit of Rs ${limit / 100000} lakh; use ITR-3.`);
    if (!/^\d{5}$/.test(b.ad.code)) err('ad', 'Business code under 44AD must be the 5-digit code from the Department list.');
    if (pi.adTurnover <= 0) err('ad', 'Turnover under 44AD is required.');
  }
  if (b.ada) {
    // 44ADA(1): gross receipts up to Rs 50 lakh, or Rs 75 lakh where cash receipts are not more than 5%.
    const limit = n0(b.ada.cash) <= pi.adaReceipts * 0.05 ? 7500000 : 5000000;
    if (pi.adaReceipts > limit) err('ada', `Receipts of Rs ${pi.adaReceipts} are above the 44ADA limit of Rs ${limit / 100000} lakh; use ITR-3.`);
    if (!(ITR4_CODES_44ADA as readonly string[]).includes(b.ada.code)) err('ada', 'Profession code under 44ADA must be one the schema lists (see the Department list).');
    if (pi.adaReceipts <= 0) err('ada', 'Gross receipts under 44ADA are required.');
  }
  if (b.ae) {
    // 44AE(1): not more than ten goods carriages at any time in the year. Schema: holding period 1 to 12 months, tonnage up to 100.
    if (b.ae.vehicles.length > 10) err('ae', 'Section 44AE applies only to an owner of not more than ten goods carriages.');
    if (!(ITR4_CODES_44AE as readonly string[]).includes(b.ae.code)) err('ae', 'Business code under 44AE must be one the schema lists.');
    const regs = new Set<string>();
    for (const v of b.ae.vehicles) {
      if (v.months < 1 || v.months > 12 || !Number.isInteger(v.months)) err('ae', `${v.regNo}: months held must be 1 to 12.`);
      if (v.tonnage < 0 || v.tonnage > 100 || !Number.isInteger(v.tonnage)) err('ae', `${v.regNo}: tonnage must be a whole number up to 100.`);
      if (regs.has(v.regNo)) err('ae', `${v.regNo} is entered twice (validation rule 213).`);
      regs.add(v.regNo);
    }
  }
  if ((b.ad || b.ada) && !b.financials) err('financials', 'With turnover under 44AD or 44ADA, the financial particulars (creditors, stock, debtors, cash and bank) are required (validation rule 139).');
  const ltcgGain = i.ltcg112A ? Math.max(0, n0(i.ltcg112A.saleValue) - n0(i.ltcg112A.cost)) : 0;
  if (ltcgGain > 125000) err('ltcg112A', 'ITR-4 takes long-term gains under section 112A only up to Rs 1.25 lakh; use ITR-3.');
  if (regime === 'OLD' && !/^\d{15}$/.test(i.filing.form10IEA?.ack ?? '')) err('form10IEA', 'With business income, the old regime needs Form 10-IEA filed by the due date (section 115BAC(6)); give its acknowledgement number.');
  if (regime === 'OLD' && i.filing.form10IEA?.assessmentYear === '2026-27' && !/^\d{4}-\d{2}-\d{2}$/.test(i.filing.form10IEA.date ?? '')) err('form10IEA', 'Give the date Form 10-IEA was filed for this year.');
  issues.push(...tanIssues([...(i.salary?.employers ?? []), ...(i.tdsOther ?? []), ...(i.tcs ?? [])], 'tan'));

  // Deductions (old regime only), as the schema caps them.
  const os = i.otherSources ?? {};
  const old = regime === 'OLD';
  const d = old ? i.deductions ?? {} : {};
  const c80Claimed = sum((d.section80C ?? []).map((r) => n0(r.amount)));
  const c80 = Math.min(c80Claimed, 150000);
  const c80ccd1b = Math.min(n0(d.section80CCD1B), 50000);
  const d80 = deduction80D(d.section80D, age);
  issues.push(...d80.issues);
  const c80d = d80.allowed;
  const c80tta = old && age === 'BELOW_60' ? Math.min(n0(os.savingsInterest), 10000) : 0;
  const c80ttb = old && age !== 'BELOW_60' ? Math.min(n0(os.savingsInterest) + n0(os.depositInterest), 50000) : 0;
  const salaryTds = sum((i.salary?.employers ?? []).map((e) => n0(e.tds)));
  const otherTds = sum((i.tdsOther ?? []).map((t) => n0(t.tds)));
  const tcs = sum((i.tcs ?? []).map((t) => n0(t.tcs)));
  const payments = i.taxPayments ?? [];
  const advance = sum(payments.filter((t) => t.kind === 'ADVANCE').map((t) => n0(t.amount)));
  const selfTax = sum(payments.filter((t) => t.kind === 'SELF').map((t) => n0(t.amount)));

  // Salary
  const gross = n0(i.salary?.gross);
  const sal = salaryHead(gross, n0(i.salary?.professionalTax), regime);

  // House property: 30% of the annual value and interest under 24(b); self-occupied interest up to Rs 2 lakh, old regime only.
  const h = i.house;
  const loans = h?.loans ?? [];
  const interestPaid = sum(loans.map((l) => n0(l.interest)));
  let hpIncome = 0;
  let propertyDetails: unknown[] | undefined;
  if (h) {
    const alv = h.letOut ? n0(h.rent) : 0;
    const tax = h.letOut ? n0(h.municipalTax) : 0;
    const balance = Math.max(0, alv - tax);
    const thirty = Math.round(balance * 0.3);
    const interest = h.letOut ? interestPaid : old ? Math.min(interestPaid, 200000) : 0;
    hpIncome = balance - thirty - interest;
    if (hpIncome < 0 && !old) hpIncome = 0; // 115BAC(2): no set-off of a house property loss in the new regime
    if (hpIncome < -200000) hpIncome = -200000; // 71(3A)
    propertyDetails = [{
      HPSNo: 1,
      AddressDetailWithZipCode: { AddrDetail: clean(h.address, 50), CityOrTownOrDistrict: clean(h.city, 50), StateCode: h.stateCode, CountryCode: '91', PinCode: Number(h.pin) },
      PropertyOwner: 'SE',
      PropCoOwnedFlg: 'NO',
      ifLetOut: h.letOut ? 'L' : 'S',
      Rentdetails: {
        AnnualLetableValue: alv, LocalTaxes: tax, TotalUnrealizedAndTax: tax, BalanceALV: balance, AnnualOfPropOwned: balance, ThirtyPercentOfBalance: thirty, IntOnBorwCap: interest,
        ...(loans.length && interest > 0 ? { Section24B: { Section24BDtls: loans.map((l) => ({ LoanTknFrom: l.from, BankOrInstnName: clean(l.lender, 125), LoanAccNoOfBankOrInstnRefNo: clean(l.account, 20), DateofLoan: l.sanctionedOn, TotalLoanAmt: n0(l.amount), LoanOutstndngAmt: n0(l.outstanding), InterestUs24B: n0(l.interest) })), TotalInterestUs24B: interestPaid } } : {}),
        TotalDeduct: thirty + interest, IncomeOfHP: balance - thirty - interest,
      },
    }];
    if (!h.letOut && !old && interestPaid > 0) err('house', 'Interest on a self-occupied home is not allowed in the new regime (validation rule 302); remove it or opt for the old regime.');
    if (h.letOut && alv <= 0) err('house', 'A let-out property needs the rent (validation rule 59).');
  }

  const osRows = ([['SAV', os.savingsInterest], ['IFD', os.depositInterest], ['DIV', os.dividends], ['OTH', os.other]] as const)
    .filter(([, v]) => n0(v) > 0).map(([k, v]) => ({ OthSrcNatureDesc: k, ...(k === 'OTH' ? { OthSrcOthNatOfInc: clean(os.otherDescription || 'Other income', 125) } : {}), OthSrcOthAmount: n0(v) }));
  const osIncome = sum(osRows.map((r) => r.OthSrcOthAmount));

  const bp = pi.total;
  const gti = sal.income + hpIncome + bp + osIncome;
  const viaTotal = Math.min(c80 + c80ccd1b + c80d + c80tta + c80ttb, Math.max(0, gti));
  const totalIncome = Math.max(0, gti + ltcgGain - viaTotal);
  if (totalIncome > 5125000 || gti > 5000000) err('income', 'ITR-4 is for total income up to Rs 50 lakh; use ITR-3.');

  // Tax on total income, rounded to the nearest Rs 10 (section 288A), at the slab rates for the regime and age; LTCG
  // under 112A up to Rs 1.25 lakh is exempt. Rebate under 87A: new regime up to Rs 60,000 where total income is not
  // above Rs 12 lakh with marginal relief above it (validation rule 227); old regime up to Rs 12,500 to Rs 5 lakh (rule 229).
  const t = taxFor(totalIncome - ltcgGain, regime, age);
  const cess = Math.round((t.tax - t.rebate) * 0.04);
  const grossLiability = t.tax - t.rebate + cess;

  const presumptive234C = !!(b.ad || b.ada) && !b.ae?.vehicles.length && !n0(os.dividends) && !ltcgGain;
  const ii = interestAndFee({
    liability: grossLiability, tdsTcs: salaryTds + otherTds + tcs, payments, filedOn: i.createdOn, dueDate: ITR4_DUE_DATE, totalIncome,
    exemption: (regime === 'NEW' ? NEW_SLABS : oldSlabs(age))[0][0], presumptive234C, entered234C: i.interest234C,
  });
  const interest = ii.i234A + ii.i234B + ii.i234C + ii.fee234F;
  const taxPlusInterest = grossLiability + interest;
  const paid = salaryTds + otherTds + tcs + advance + selfTax;

  const zeroVia = { Section80C: 0, Section80CCC: 0, Section80CCDEmployeeOrSE: 0, Section80CCD1B: 0, Section80CCDEmployer: 0, Section80D: 0, Section80DD: 0, Section80DDB: 0, Section80E: 0, Section80EE: 0, Section80EEA: 0, Section80EEB: 0, Section80G: 0, Section80GG: 0, Section80GGC: 0, Section80U: 0, Section80TTA: 0, Section80TTB: 0, AnyOthSec80CCH: 0 };
  const usr = { ...zeroVia, ...(old ? { Section80C: c80Claimed, Section80CCD1B: n0(d.section80CCD1B), Section80D: d80.claimed, Section80TTA: c80tta, Section80TTB: c80ttb } : {}) };
  const allowed = { ...zeroVia, ...(old ? { Section80C: c80, Section80CCD1B: c80ccd1b, Section80D: c80d, Section80TTA: c80tta, Section80TTB: c80ttb } : {}) };
  const usrTotal = sum(Object.values(usr));

  const fy = i.filing.form10IEA;
  const regimeFlags = !old
    ? { Form10IEAEarlierAYOldRegime: 'N', F10IEACurrAYOldRegime: 'N' }
    : fy?.assessmentYear === '2026-27'
      ? { Form10IEAEarlierAYOldRegime: 'N', F10IEACurrAYOldRegime: 'Y', F10IEADateCurrAYOldTax: fy.date, F10IEAAckNoCurrAYOldTax: Number(fy.ack) }
      : { Form10IEAEarlierAYOldRegime: 'Y', Form10IEAAssYear: fy?.assessmentYear, Form10IEAEarlierAYAckOldRegime: Number(fy?.ack), F10IEAEarlierAYNewRegime: 'N', F10IEACurrAYNewRegime: 'N' };

  const fin = b.financials ?? {};
  const liabilities = [fin.capital, fin.securedLoans, fin.unsecuredLoans, fin.advances, fin.sundryCreditors, fin.otherLiabilities].map(n0);
  const assets = [fin.fixedAssets, fin.investments, fin.inventories, fin.sundryDebtors, fin.bank, fin.cashInHand, fin.loansAdvances, fin.otherAssets].map(n0);

  const scheduleBP = {
    ...(b.ad ? {
      NatOfBus44AD: [{ NameOfBusiness: clean(b.ad.name, 75), CodeAD: b.ad.code }],
      PersumptiveInc44AD: { GrsTotalTrnOver: pi.adTurnover, GrsTrnOverBank: n0(b.ad.digital), GrsTotalTrnOverInCash: n0(b.ad.cash), GrsTrnOverAnyOthMode: n0(b.ad.otherMode), PersumptiveInc44AD6Per: pi.ad6, PersumptiveInc44AD8Per: pi.ad8, TotPersumptiveInc44AD: pi.adIncome },
    } : {}),
    ...(b.ada ? {
      NatOfBus44ADA: [{ NameOfBusiness: clean(b.ada.name, 75), CodeADA: b.ada.code }],
      PersumptiveInc44ADA: { GrsReceipt: pi.adaReceipts, GrsTrnOverBank44ADA: n0(b.ada.digital), GrsTotalTrnOverInCash44ADA: n0(b.ada.cash), GrsTrnOverAnyOthMode44ADA: n0(b.ada.otherMode), TotPersumptiveInc44ADA: pi.adaIncome },
    } : {}),
    ...(b.ae?.vehicles.length ? {
      NatOfBus44AE: [{ NameOfBusiness: clean(b.ae.name, 75), CodeAE: b.ae.code }],
      GoodsDtlsUs44AE: pi.vehicles.map((v) => ({ RegNumberGoodsCarriage: clean(v.regNo, 11).toUpperCase(), OwnedLeasedHiredFlag: v.ownership, TonnageCapacity: v.tonnage, HoldingPeriod: v.months, PresumptiveIncome: v.income })),
    } : {}),
    // Validation rule 97: 44AE income less salary and interest to partners (nil for an individual); rule 2 of the second table: the head is 44AD + 44ADA + 44AE.
    PersumptiveInc44AE: { TotPersumInc44AE: pi.aeIncome, TotalPersumptiveInc: pi.aeIncome, IncChargeableUnderBus: bp },
    ...(b.gstins?.length ? { TurnoverGrsRcptForGSTIN: b.gstins.map((g) => ({ GSTINNo: g.gstin, AmtTurnGrossRcptGSTIN: n0(g.turnover) })), TotalTurnoverGrsRcptGSTIN: sum(b.gstins.map((g) => n0(g.turnover))) } : {}),
    ...(b.financials ? {
      FinanclPartclrOfBusiness: {
        PartnerMemberOwnCapital: liabilities[0], SecuredLoans: liabilities[1], UnSecuredLoans: liabilities[2], Advances: liabilities[3], SundryCreditors: liabilities[4], OthrCurrLiab: liabilities[5], TotCapLiabilities: sum(liabilities),
        FixedAssets: assets[0], Investments: assets[1], Inventories: assets[2], SundryDebtors: assets[3], BalWithBanks: assets[4], CashInHand: assets[5], LoansAndAdvances: assets[6], OtherAssets: assets[7], TotalAssets: sum(assets),
      },
    } : {}),
  };

  const employers = i.salary?.employers ?? [];
  const json = {
    ITR: {
      ITR4: {
        CreationInfo: creationInfo(i.softwareId, i.createdOn, i.intermediaryCity),
        Form_ITR4: { FormName: 'ITR-4', Description: 'For Individuals, HUFs and Firms (other than LLP) with presumptive income', AssessmentYear: '2026', SchemaVer: 'Ver1.0', FormVer: 'Ver1.0' },
        PersonalInfo: { AssesseeName: assesseeName(p), PAN: p.pan, Address: address(p), SecondaryAdd: 'N', DOB: p.dob, EmployerCategory: gross > 0 ? p.employerCategory ?? 'OTH' : 'NA', Status: 'I' },
        FilingStatus: { ReturnFileSec: returnSection(i.filing, ii.belated), ...regimeFlags, ...revisedFields(i.filing), AsseseeRepFlg: 'N', ItrFilingDueDate: ITR4_DUE_DATE },
        IncomeDeductions: {
          IncomeFromBusinessProf: bp,
          GrossSalary: gross, Salary: gross, NetSalary: gross, DeductionUs16: sal.std + sal.pt, DeductionUs16ia: sal.std, ...(sal.pt ? { ProfessionalTaxUs16iii: sal.pt } : {}), IncomeFromSal: sal.income,
          ...(propertyDetails ? { PropertyDetails: propertyDetails } : {}),
          TotalIncomeChargeableUnHP: hpIncome,
          IncomeOthSrc: osIncome,
          ...(osRows.length ? { OthersInc: { OthersIncDtlsOthSrc: osRows } } : {}),
          GrossTotIncome: gti,
          GrossTotIncomeIncLTCG112A: gti + ltcgGain,
          UsrDeductUndChapVIA: { ...usr, TotalChapVIADeductions: usrTotal },
          DeductUndChapVIA: { ...allowed, TotalChapVIADeductions: viaTotal },
          TotalIncome: totalIncome,
        },
        TaxComputation: {
          TotalTaxPayable: t.tax, Rebate87A: t.rebate, TaxPayableOnRebate: t.tax - t.rebate, EducationCess: cess, GrossTaxLiability: grossLiability, Section89: 0, NetTaxLiability: grossLiability,
          IntrstPay: { IntrstPayUs234A: ii.i234A, IntrstPayUs234B: ii.i234B, IntrstPayUs234C: ii.i234C, LateFilingFee234F: ii.fee234F },
          TotTaxPlusIntrstPay: taxPlusInterest,
        },
        TaxPaid: { TaxesPaid: { AdvanceTax: advance, TDS: salaryTds + otherTds, TCS: tcs, SelfAssessmentTax: selfTax, TotalTaxesPaid: paid }, BalTaxPayable: Math.max(0, taxPlusInterest - paid) },
        Refund: { RefundDue: Math.max(0, paid - taxPlusInterest), BankAccountDtls: { AddtnlBankDetails: [bankRow(i.bank)] } },
        ...(old && c80Claimed ? { Schedule80C: { Schedule80CDtls: (d.section80C ?? []).map((r) => ({ Amount: n0(r.amount), IdentificationNo: clean(r.id, 50) })), TotalAmt: c80Claimed } } : {}),
        ...(old && c80d ? { Schedule80D: d80.schedule } : {}),
        ...(ltcgGain || i.ltcg112A ? { LTCG112A: { TotSaleCnsdrn: n0(i.ltcg112A!.saleValue), TotCstAcqisn: n0(i.ltcg112A!.cost), LongCap112A: ltcgGain } } : {}),
        Verification: verification(p),
        ScheduleBP: scheduleBP,
        ...(payments.length ? { ScheduleIT: { TaxPayment: payments.map((x) => ({ BSRCode: x.bsr, DateDep: x.date, SrlNoOfChaln: x.serial, Amt: n0(x.amount) })), TotalTaxPayments: advance + selfTax } } : {}),
        ...(i.tcs?.length ? { ScheduleTCS: { TCS: i.tcs.map((x) => ({ EmployerOrDeductorOrCollectDetl: { TAN: x.tan, EmployerOrDeductorOrCollecterName: clean(x.name, 125) }, Amtfrom26AS: n0(x.tcs), TotalTCS: n0(x.tcs), AmtTCSClaimedThisYear: n0(x.tcs) })), TotalSchTCS: tcs } } : {}),
        ...(employers.length ? { TDSonSalaries: { TDSonSalary: employers.map((e) => ({ EmployerOrDeductorOrCollectDetl: { TAN: e.tan, EmployerOrDeductorOrCollecterName: clean(e.name, 125) }, IncChrgSal: n0(e.incomeChargeable), TotalTDSSal: n0(e.tds) })), TotalTDSonSalaries: salaryTds } } : {}),
        ...(i.tdsOther?.length ? { TDSonOthThanSals: { TDSonOthThanSalDtls: i.tdsOther.map((x) => ({ TANOfDeductor: x.tan, TDSDeducted: n0(x.tds), TDSSection: x.section, TDSClaimed: n0(x.tds), GrossAmount: n0(x.amount), HeadOfIncome: x.head ?? 'OS', TDSCreditCarriedFwd: 0 })), TotalTDSonOthThanSals: otherTds } } : {}),
      },
    },
  };
  const summary = { grossTotalIncome: gti + ltcgGain, businessIncome: bp, totalIncome, tax: grossLiability, interest, paid, payable: Math.max(0, taxPlusInterest - paid), refund: Math.max(0, paid - taxPlusInterest) };
  return { json: issues.length ? null : json, issues, summary };
}

/**
 * Tax at slab rates on income rounded to the nearest Rs 10 (section 288A), with the 87A rebate:
 * new regime (115BAC(1A)) up to Rs 60,000 where total income is not above Rs 12 lakh, and marginal
 * relief so the tax does not exceed the income above Rs 12 lakh; old regime up to Rs 12,500 where
 * total income is not above Rs 5 lakh.
 */
export function taxFor(income: number, regime: 'NEW' | 'OLD', age: ReturnType<typeof ageBandFromDob>) {
  const rounded = Math.round(Math.max(0, income) / 10) * 10;
  const slabs = regime === 'NEW' ? NEW_SLABS : oldSlabs(age);
  let tax = 0;
  let prev = 0;
  for (const [upto, rate] of slabs as Array<[number, number]>) {
    if (rounded > prev) tax += (Math.min(rounded, upto) - prev) * rate;
    prev = upto;
  }
  tax = Math.round(tax);
  let rebate = 0;
  if (regime === 'NEW') {
    if (rounded <= 1200000) rebate = Math.min(tax, 60000);
    else if (tax > rounded - 1200000) rebate = tax - (rounded - 1200000);
  } else if (rounded <= 500000) rebate = Math.min(tax, 12500);
  return { income: rounded, tax, rebate };
}
