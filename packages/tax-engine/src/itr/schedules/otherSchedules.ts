import { clean, n0, sum, type ItrIssue } from '../itrCommon.js';

/**
 * Smaller schedules shared by the ITR-2 and ITR-3 writers for AY 2026-27, to the Department's schemas
 * ITR-2_2026_Main_V1.2 and ITR-3_2026_Main_V1.1 and the notified forms.
 */

const DATE_FY = /^2025-(0[4-9]|1[0-2])-\d{2}$|^2026-0[1-3]-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Schedule VDA ----------------------------------------------------------------------------------

export interface VdaTransfer { acquiredOn: string; transferredOn: string; cost: number; consideration: number }

/**
 * Schedule VDA: gains on transfer of virtual digital assets under section 115BBH, taxed at 30% (Schedule SI
 * code 5BBH). Only the cost of acquisition is deducted (115BBH(2)(a)); a loss is set off against nothing
 * (115BBH(2)(b)). Income per row is consideration less cost (validation rule 188) and the schema takes no
 * negative figure, so a row at a loss is refused rather than written as nil. Head of income: capital gains.
 */
export function scheduleVda(rows: VdaTransfer[]) {
  const issues: ItrIssue[] = [];
  const out = rows.map((r, k) => {
    if (!DATE_FY.test(r.transferredOn)) issues.push({ field: 'vda', message: `VDA transfer ${k + 1}: date of transfer must be in 2025-26 (validation rule 749).` });
    if (!ISO.test(r.acquiredOn) || r.acquiredOn > r.transferredOn) issues.push({ field: 'vda', message: `VDA transfer ${k + 1}: date of acquisition must be on or before the date of transfer.` });
    const income = n0(r.consideration) - n0(r.cost);
    if (income < 0) issues.push({ field: 'vda', message: `VDA transfer ${k + 1} is at a loss; the loss is not allowed (section 115BBH(2)(b)) and the schema takes no negative income, so this file does not write it.` });
    return { DateofAcquisition: r.acquiredOn, DateofTransfer: r.transferredOn, HeadUndIncTaxed: 'CG', AcquisitionCost: n0(r.cost), ConsidReceived: n0(r.consideration), IncomeFromVDA: Math.max(0, income), _date: r.transferredOn };
  });
  const total = sum(out.map((r) => r.IncomeFromVDA));
  return { issues, total, rows: out };
}

// Schedule EI, agricultural income and other exempt income -------------------------------------

export interface ExemptIncomeInput {
  interest?: number;
  agriculture?: {
    grossReceipts: number; expenses: number;
    /** Unabsorbed agricultural loss of the previous eight assessment years. */
    broughtForwardLoss?: number;
    lands?: { district: string; pin: string; acres: number; owned: boolean; irrigated: boolean }[];
  };
  others?: { subCategory?: string; description: string; amount: number }[];
}

/**
 * Schedule EI. Net agricultural income = gross receipts less expenses less unabsorbed agricultural loss of the
 * previous eight assessment years, nil if negative (validation rule 436); land details where it exceeds
 * Rs 5 lakh (rule 445). The net figure is also item 14 of Part B-TI, income for rate purposes (rule 508).
 */
export function scheduleEI(i: ExemptIncomeInput | undefined, extraOthers: { subCategory: string; description: string; amount: number }[], subCategories: readonly string[], form: 'ITR-2' | 'ITR-3') {
  const issues: ItrIssue[] = [];
  const ag = i?.agriculture;
  const netAgri = ag ? Math.max(0, n0(ag.grossReceipts) - n0(ag.expenses) - n0(ag.broughtForwardLoss)) : 0;
  if (netAgri > 500000 && !ag?.lands?.length) issues.push({ field: 'exemptIncome', message: 'Net agricultural income above Rs 5 lakh needs the details of each agricultural land (validation rule 445).' });
  for (const l of ag?.lands ?? []) if (!/^[1-9]\d{5}$/.test(l.pin)) issues.push({ field: 'exemptIncome', message: `PIN code of agricultural land in ${l.district} must be 6 digits.` });
  const others = [...(i?.others ?? []), ...extraOthers].filter((o) => n0(o.amount) > 0);
  for (const o of others) if (o.subCategory && !subCategories.includes(o.subCategory)) issues.push({ field: 'exemptIncome', message: `Exempt income section ${o.subCategory} is not one the schema lists.` });
  const othersTotal = sum(others.map((o) => n0(o.amount)));
  const interest = n0(i?.interest);
  const total = interest + netAgri + othersTotal;
  const any = total > 0 || !!ag;
  const schedule = any ? {
    ...(interest ? { InterestInc: interest } : {}),
    ...(ag ? { GrossAgriRecpt: n0(ag.grossReceipts), ExpIncAgri: n0(ag.expenses), UnabAgriLossPrev8: n0(ag.broughtForwardLoss) } : {}),
    NetAgriIncOrOthrIncRule7: netAgri,
    ...(ag?.lands?.length ? { ExcNetAgriInc: { ExcNetAgriIncDtls: ag.lands.map((l) => ({ NameOfDistrict: clean(l.district, 125), PinCode: Number(l.pin), MeasurementOfLand: l.acres, AgriLandOwnedFlag: l.owned ? 'O' : 'H', AgriLandIrrigatedFlag: l.irrigated ? 'IRG' : 'RF' })) } } : {}),
    ...(others.length ? { OthersInc: { OthersIncDtls: others.map((o) => ({ ...(o.subCategory ? { SubCategory: o.subCategory } : {}), Description: clean(o.description, 125), OthAmount: n0(o.amount) })) } } : {}),
    ...(form === 'ITR-2' ? { Others: othersTotal, IncNotChrgblToTax: 0 } : { Others: othersTotal }),
    TotalExemptInc: total,
  } : undefined;
  return { issues, netAgri, total, schedule };
}

// Schedule SPI ----------------------------------------------------------------------------------

export interface ClubbedIncome { name: string; pan?: string; aadhaar?: string; relationship: string; amount: number; head: 'SA' | 'HP' | 'CG' | 'OS' | 'EI' | 'BP' }

/**
 * Schedule SPI: income of the spouse, minor child or others included under section 64. The notified forms
 * say the income is to be included while working the income under each head, so the rows here are a
 * statement of what the head figures already contain; each head entered must be at least the amount said to
 * be included in it.
 */
export function scheduleSpi(rows: ClubbedIncome[], heads: Partial<Record<ClubbedIncome['head'], number>>) {
  const issues: ItrIssue[] = [];
  for (const h of ['SA', 'HP', 'CG', 'OS', 'EI', 'BP'] as const) {
    const t = sum(rows.filter((r) => r.head === h).map((r) => n0(r.amount)));
    if (t > 0 && t > (heads[h] ?? 0)) issues.push({ field: 'clubbedIncome', message: `Income of specified persons included under ${h} (Rs ${t}) is more than the income entered under that head; include it in the head first.` });
  }
  for (const r of rows) if (r.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(r.pan)) issues.push({ field: 'clubbedIncome', message: `PAN of ${r.name} is not valid.` });
  const schedule = rows.length ? { SpecifiedPerson: rows.map((r) => ({ SpecifiedPersonName: clean(r.name, 125), ...(r.pan ? { PANofSpecPerson: r.pan } : {}), ...(r.aadhaar ? { AaadhaarOfSpecPerson: r.aadhaar } : {}), ReltnShip: clean(r.relationship, 50), AmtIncluded: n0(r.amount), HeadIncIncluded: r.head })) } : undefined;
  return { issues, schedule };
}

// Schedule AL -----------------------------------------------------------------------------------

export interface AssetsLiabilities {
  immovable?: { description: string; address: { residenceNo: string; locality: string; city: string; stateCode: string; pin: string }; amount: number }[];
  bankDeposits: number; sharesSecurities: number; insurance: number; loansGiven: number; cash: number;
  jewellery: number; artwork: number; vehicles: number;
  liabilities: number;
  /** ITR-3 only: interest held in the assets of a firm or AOP as a partner or member. */
  interestInFirmOrAop?: boolean;
}

/** Schedule AL: assets at cost and liabilities on 31 Mar 2026, required where total income exceeds Rs 1 crore (validation rule 456 of ITR-2, 905 of ITR-3). */
export function scheduleAL(a: AssetsLiabilities, form: 'ITR-2' | 'ITR-3') {
  return {
    ...(a.immovable?.length ? { ImmovableDetails: a.immovable.map((x) => ({ Description: clean(x.description, 25), AddressAL: { ResidenceNo: clean(x.address.residenceNo, 50), LocalityOrArea: clean(x.address.locality, 50), CityOrTownOrDistrict: clean(x.address.city, 50), StateCode: x.address.stateCode, CountryCode: '91', PinCode: Number(x.address.pin) }, Amount: n0(x.amount) })) } : {}),
    MovableAsset: { DepositsInBank: n0(a.bankDeposits), SharesAndSecurities: n0(a.sharesSecurities), InsurancePolicies: n0(a.insurance), LoansAndAdvancesGiven: n0(a.loansGiven), CashInHand: n0(a.cash), JewelleryBullionEtc: n0(a.jewellery), ArchCollDrawPaintSulpArt: n0(a.artwork), VehiclYachtsBoatsAircrafts: n0(a.vehicles) },
    ...(form === 'ITR-3' ? { InterstAOPFlag: a.interestInFirmOrAop ? 'Y' : 'N' } : {}),
    LiabilityInRelatAssets: n0(a.liabilities),
  };
}

// Schedule FA -----------------------------------------------------------------------------------

type Country = { countryName: string; countryCode: string; zip: string };
export interface ForeignAssets {
  /** A1: foreign depository accounts held at any time in calendar year 2025. */
  bankAccounts?: (Country & { bank: string; address: string; account: string; status: 'OWNER' | 'BENEFICIAL_OWNER' | 'BENIFICIARY'; openedOn: string; peak: number; closing: number; interest: number })[];
  /** A2: foreign custodial accounts. */
  custodialAccounts?: (Country & { institution: string; address: string; account: string; status: 'OWNER' | 'BENEFICIAL_OWNER' | 'BENIFICIARY'; openedOn: string; peak: number; closing: number; grossPaid: number; nature: 'I' | 'D' | 'S' | 'O' | 'N' })[];
  /** A3: foreign equity and debt interest. */
  equityDebt?: (Country & { entity: string; address: string; nature: string; acquiredOn: string; initial: number; peak: number; closing: number; grossPaid: number; grossProceeds: number })[];
  /** D: immovable property outside India. */
  immovable?: (Country & { address?: string; ownership: 'DIRECT' | 'BENEFICIAL_OWNER' | 'BENIFICIARY'; acquiredOn: string; investment: number; income: number; natureOfIncome: string; taxableAmount: number; schedule: 'SA' | 'HP' | 'CG' | 'OS' | 'EI' | 'NI'; scheduleItem: string })[];
}

/**
 * Schedule FA, tables A1, A2, A3 and D (foreign assets held at any time in the calendar year ending 31 Dec
 * 2025, as the notified forms state). Required of a resident holding any asset outside India (Part B-TTI item
 * 19, validation rule 746). Income from these assets must already be in the heads of income; foreign tax
 * credit (Schedules FSI and TR) is not written by this file.
 */
export function scheduleFA(f: ForeignAssets) {
  const issues: ItrIssue[] = [];
  const all = [...(f.bankAccounts ?? []), ...(f.custodialAccounts ?? []), ...(f.equityDebt ?? []), ...(f.immovable ?? [])];
  for (const r of all) if (!r.countryCode || r.countryCode === '91' || !clean(r.zip, 8)) issues.push({ field: 'foreignAssets', message: `${r.countryName || 'A foreign asset'}: country code (other than India) and ZIP code are required.` });
  const c = (r: Country) => ({ CountryName: clean(r.countryName, 55), CountryCodeExcludingIndia: r.countryCode, ZipCode: clean(r.zip, 8) });
  const schedule = {
    ...(f.bankAccounts?.length ? { DetailsForiegnBank: f.bankAccounts.map((r) => ({ ...c(r), Bankname: clean(r.bank, 125), AddressOfBank: clean(r.address, 200), ForeignAccountNumber: clean(r.account, 34), OwnerStatus: r.status, AccOpenDate: r.openedOn, PeakBalanceDuringYear: n0(r.peak), ClosingBalance: n0(r.closing), IntrstAccured: n0(r.interest) })) } : {}),
    ...(f.custodialAccounts?.length ? { DtlsForeignCustodialAcc: f.custodialAccounts.map((r) => ({ ...c(r), FinancialInstName: clean(r.institution, 125), FinancialInstAddress: clean(r.address, 200), AccountNumber: clean(r.account, 34), Status: r.status, AccOpenDate: r.openedOn, PeakBalanceDuringPeriod: n0(r.peak), ClosingBalance: n0(r.closing), GrossAmtPaidCredited: n0(r.grossPaid), NatureOfAmount: r.nature })) } : {}),
    ...(f.equityDebt?.length ? { DtlsForeignEquityDebtInterest: f.equityDebt.map((r) => ({ ...c(r), NameOfEntity: clean(r.entity, 125), AddressOfEntity: clean(r.address, 200), NatureOfEntity: clean(r.nature, 34), InterestAcquiringDate: r.acquiredOn, InitialValOfInvstmnt: n0(r.initial), PeakBalanceDuringPeriod: n0(r.peak), ClosingBalance: n0(r.closing), TotGrossAmtPaidCredited: n0(r.grossPaid), TotGrossProceeds: n0(r.grossProceeds) })) } : {}),
    ...(f.immovable?.length ? { DetailsImmovableProperty: f.immovable.map((r) => ({ ...c(r), ...(r.address ? { AddressOfProperty: clean(r.address, 200) } : {}), Ownership: r.ownership, DateOfAcq: r.acquiredOn, TotalInvestment: n0(r.investment), IncDrvProperty: n0(r.income), NatureOfInc: clean(r.natureOfIncome, 100), IncTaxAmt: n0(r.taxableAmount), IncTaxSch: r.schedule, IncTaxSchNo: clean(r.scheduleItem, 50) })) } : {}),
  };
  return { issues, any: all.length > 0, schedule };
}

// Schedule AMT and AMTC -------------------------------------------------------------------------

export interface AmtCreditYear { ay: string; gross: number; setOffEarlier: number }

/**
 * Alternate minimum tax for an individual or HUF (sections 115JC, 115JEE): where deductions under Chapter
 * VI-A Part C (here 80QQB and 80RRB, validation rule 421 of ITR-2), 10AA or 35AD are claimed and the adjusted
 * total income exceeds Rs 20 lakh (115JEE(2)), tax is 18.5% of it plus cess (rule 428). Old regime only: under
 * section 115BAC the schedules stay blank and no credit is used (rules 430 and 431).
 * AMT credit (section 115JD): the excess of AMT over regular tax is carried forward for 15 assessment years
 * and set off in a year in which regular tax exceeds AMT, to the extent of the difference.
 * Surcharge on AMT is not worked: an adjusted total income above Rs 50 lakh is refused.
 */
export function amt(totalIncome: number, specifiedDeductions: number, regularTax: number, credits: AmtCreditYear[], old: boolean) {
  const issues: ItrIssue[] = [];
  const ati = totalIncome + specifiedDeductions;
  const applies = old && specifiedDeductions > 0 && ati > 2000000;
  if (applies && ati > 5000000) issues.push({ field: 'amt', message: 'Adjusted total income under section 115JC above Rs 50 lakh would carry surcharge on the alternate minimum tax; not written by this file.' });
  const tax = applies ? Math.round(ati * 0.185) : 0;
  const cess = Math.round(tax * 0.04);
  const deemed = tax + cess; // Part B-TTI 1d
  for (const c of credits) {
    const start = Number(c.ay.slice(0, 4));
    if (!/^\d{4}-\d{2}$/.test(c.ay) || start < 2011 || start > 2025) issues.push({ field: 'amtCredit', message: `AMT credit of AY ${c.ay}: credit is carried forward for 15 assessment years only (section 115JD(4)).` });
    if (n0(c.setOffEarlier) > n0(c.gross)) issues.push({ field: 'amtCredit', message: `AMT credit of AY ${c.ay}: set off in earlier years cannot exceed the credit.` });
  }
  const room = old && regularTax > deemed ? regularTax - deemed : 0; // AMTC item 3
  let left = room;
  const rows = [...credits].sort((a, b) => a.ay.localeCompare(b.ay)).map((c) => {
    const bal = Math.max(0, n0(c.gross) - n0(c.setOffEarlier));
    const used = Math.min(bal, left);
    left -= used;
    return { AssYr: c.ay, Gross: n0(c.gross), AmtCreditSetOfEy: n0(c.setOffEarlier), AmtCreditBalBroughtFwd: bal, AmtCreditUtilized: old ? used : 0, BalAmtCreditCarryFwd: old ? bal - used : 0 };
  });
  const utilised = sum(rows.map((r) => r.AmtCreditUtilized));
  const currentCredit = deemed > regularTax ? deemed - regularTax : 0;
  const amtc = {
    TaxSection115JC: deemed, TaxOthProvisions: regularTax, AmtTaxCreditAvailable: room,
    ...(rows.length ? { ScheduleAMTCDtls: rows } : {}),
    CurrAssYr: '2026-27', CurrYrAmtCreditFwd: currentCredit, CurrYrCreditCarryFwd: currentCredit,
    TotAMTGross: sum(rows.map((r) => r.Gross)) + currentCredit, TotSetOffEys: sum(rows.map((r) => r.AmtCreditSetOfEy)), TotBalBF: sum(rows.map((r) => r.AmtCreditBalBroughtFwd)) + currentCredit,
    TotAmtCreditUtilisedCY: utilised, TotBalAMTCreditCF: sum(rows.map((r) => r.BalAmtCreditCarryFwd)) + currentCredit,
    TaxSection115JD: utilised, AmtLiabilityAvailable: sum(rows.map((r) => r.BalAmtCreditCarryFwd)) + currentCredit,
  };
  return { issues, applies, ati, tax, cess, deemed, utilised, currentCredit, amtc };
}
