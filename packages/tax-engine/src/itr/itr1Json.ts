import Decimal from 'decimal.js';
import { itrComputation } from './computation.js';
import { NEW_SLABS, oldSlabs, type AgeBand } from '../tds/salary.js';

/**
 * ITR-1 (Sahaj) JSON for Assessment Year 2026-27 (income of 2025-26), to the Income Tax
 * Department's schema ITR-1_2026_Main_V1.1 (latest release 30 Jun 2026). The schema file is kept
 * in packages/tax-engine/schemas/itr and every test output is checked against it.
 *
 * The return is uploaded on the e-filing portal. The schema requires the software ID the Department
 * gives a registered e-return intermediary (SW followed by 8 digits); without one the JSON is not
 * written. Covered: salary from employers, one house property, interest, dividends and other income,
 * long-term gains under section 112A up to Rs 1.25 lakh, Chapter VI-A deductions in the old regime,
 * TDS, TCS, advance and self-assessment tax, interest under 234A, 234B and the 234F fee. Interest
 * under 234C depends on when income arose, so it is taken as entered. Not covered: allowances
 * exempt under section 10 (HRA and others), family pension, agricultural income, section 89 relief.
 */

export interface Itr1Input {
  softwareId: string;
  createdOn: string; // YYYY-MM-DD, also the date of filing used for interest
  intermediaryCity: string;
  ageBand?: AgeBand;
  person: {
    firstName?: string;
    middleName?: string;
    surname: string;
    pan: string;
    dob: string;
    employerCategory: 'CGOV' | 'SGOV' | 'PSU' | 'PE' | 'PESG' | 'PEPS' | 'PEO' | 'OTH' | 'NA';
    address: { residenceNo: string; locality: string; city: string; stateCode: string; pin: string };
    mobile: string;
    email: string;
    fatherName: string;
    place: string;
  };
  filing: { section: 11 | 12 | 17; regime: 'NEW' | 'OLD'; originalAck?: string; originalFiledOn?: string };
  salary?: { gross: number; professionalTax?: number; employers: { tan: string; name: string; incomeChargeable: number; tds: number }[] };
  house?: { letOut: boolean; address: string; city: string; stateCode: string; pin: string; rent?: number; municipalTax?: number; interest?: number };
  otherSources?: { savingsInterest?: number; depositInterest?: number; dividends?: number; other?: number; otherDescription?: string };
  ltcg112A?: { saleValue: number; cost: number };
  deductions?: { section80C?: number; section80D?: number; section80CCD1B?: number };
  tdsOther?: { tan: string; name: string; section: string; amount: number; tds: number }[];
  tcs?: number;
  taxPayments?: { bsr: string; date: string; serial: number; amount: number; kind: 'ADVANCE' | 'SELF' }[];
  interest234C?: number;
  bank: { ifsc: string; name: string; account: string; type: 'SB' | 'CA' | 'CC' | 'OD' | 'NRO' | 'OTH' };
}

export interface Itr1Issue { field: string; message: string }

const n0 = (v: Decimal.Value | undefined) => new Decimal(v || 0).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Months or part of a month from `from` (first day) up to `to`, as sections 234A and 234B count them. */
function monthsFrom(from: string, to: string): number {
  if (to < from) return 0;
  const [fy, fm] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const [ty, tm] = [Number(to.slice(0, 4)), Number(to.slice(5, 7))];
  return (ty - fy) * 12 + (tm - fm) + 1;
}

const floor100 = (v: number) => Math.max(0, Math.floor(v / 100) * 100);

export function writeItr1(i: Itr1Input): { json: Record<string, unknown> | null; issues: Itr1Issue[]; summary: Record<string, number> } {
  const issues: Itr1Issue[] = [];
  const err = (field: string, message: string) => issues.push({ field, message });
  const p = i.person;
  const regime = i.filing.regime;

  if (!/^SW\d{8}$/.test(i.softwareId)) err('softwareId', 'The Department issues a software ID (SW and 8 digits) to registered e-return intermediaries; it is needed to write the JSON.');
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(p.pan)) err('pan', 'PAN is not valid.');
  if (p.pan[3] !== 'P') err('pan', 'ITR-1 is for individuals; the fourth letter of the PAN must be P.');
  if (!ISO.test(p.dob) || p.dob > '2026-03-31') err('dob', 'Date of birth is required, on or before 31 Mar 2026.');
  if (!ISO.test(i.createdOn)) err('createdOn', 'Date is required.');
  if (!/^[1-9]\d{5}$/.test(p.address.pin)) err('pin', 'PIN code must be 6 digits.');
  if (!/^[1-9]\d{9}$/.test(p.mobile)) err('mobile', 'Mobile number must be 10 digits.');
  if (!/^\d{2}$/.test(p.address.stateCode)) err('stateCode', 'State code must be two digits from the Department list.');
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(i.bank.ifsc)) err('ifsc', 'IFSC is not valid.');
  if (!clean(p.fatherName, 125)) err('fatherName', "Father's name is required for the verification.");
  if (i.filing.section === 17 && (!/^\d{15}$/.test(i.filing.originalAck ?? '') || !ISO.test(i.filing.originalFiledOn ?? ''))) err('originalAck', 'A revised return needs the acknowledgement number and date of the original return.');
  const ltcgGain = i.ltcg112A ? Math.max(0, n0(i.ltcg112A.saleValue) - n0(i.ltcg112A.cost)) : 0;
  if (ltcgGain > 125000) err('ltcg112A', 'ITR-1 takes long-term gains under section 112A only up to Rs 1.25 lakh; use ITR-2.');

  // Deductions allowed (old regime only), in the form the computation takes them.
  const age = i.ageBand ?? 'BELOW_60';
  const os = i.otherSources ?? {};
  const d = regime === 'OLD' ? i.deductions ?? {} : {};
  const c80 = Math.min(n0(d.section80C), 150000);
  const c80ccd1b = Math.min(n0(d.section80CCD1B), 50000);
  const c80d = Math.min(n0(d.section80D), age === 'BELOW_60' ? 75000 : 100000);
  const c80tta = regime === 'OLD' && age === 'BELOW_60' ? Math.min(n0(os.savingsInterest), 10000) : 0;
  const c80ttb = regime === 'OLD' && age !== 'BELOW_60' ? Math.min(n0(os.savingsInterest) + n0(os.depositInterest), 50000) : 0;

  const prepaidTds = (i.salary?.employers ?? []).reduce((s, e) => s + n0(e.tds), 0) + (i.tdsOther ?? []).reduce((s, t) => s + n0(t.tds), 0);
  const advance = (i.taxPayments ?? []).filter((t) => t.kind === 'ADVANCE').reduce((s, t) => s + n0(t.amount), 0);
  const selfTax = (i.taxPayments ?? []).filter((t) => t.kind === 'SELF').reduce((s, t) => s + n0(t.amount), 0);

  const h = i.house;
  const comp = itrComputation({
    ageBand: age,
    salary: i.salary ? { gross: i.salary.gross, professionalTax: i.salary.professionalTax } : undefined,
    house: h ? (h.letOut ? { letOut: [{ rent: h.rent ?? 0, municipalTax: h.municipalTax, interest: h.interest }] } : { selfOccupiedInterest: h.interest }) : undefined,
    capitalGains: ltcgGain ? { equityLongTerm: ltcgGain } : undefined,
    otherSources: { savingsInterest: os.savingsInterest, depositInterest: os.depositInterest, dividends: os.dividends, other: os.other },
    deductions: { section80C: c80, npsSelf: c80ccd1b, healthInsurance: c80d },
    taxesPaid: { tds: prepaidTds, tcs: i.tcs, advanceTax: advance, selfAssessment: selfTax },
  })[regime];

  // Salary
  const gross = n0(i.salary?.gross);
  const std = Math.min(gross, regime === 'NEW' ? 75000 : 50000);
  const pt = regime === 'OLD' ? Math.min(n0(i.salary?.professionalTax), 2500) : 0;
  const salaryIncome = Math.max(0, gross - std - pt);

  // House property, worked the way the schedule shows it.
  let propertyDetails: unknown[] | undefined;
  let hpIncome = 0;
  if (h) {
    const alv = h.letOut ? n0(h.rent) : 0;
    const tax = h.letOut ? n0(h.municipalTax) : 0;
    const balance = Math.max(0, alv - tax);
    const thirty = n0(new Decimal(balance).mul(0.3));
    const interest = h.letOut ? n0(h.interest) : regime === 'OLD' ? Math.min(n0(h.interest), 200000) : 0;
    hpIncome = balance - thirty - interest;
    if (hpIncome < 0 && regime === 'NEW') hpIncome = 0;
    if (hpIncome < -200000) hpIncome = -200000;
    propertyDetails = [{
      HPSNo: 1,
      AddressDetailWithZipCode: { AddrDetail: clean(h.address, 50), CityOrTownOrDistrict: clean(h.city, 50), StateCode: h.stateCode, CountryCode: '91', PinCode: Number(h.pin) },
      PropertyOwner: 'SE',
      PropCoOwnedFlg: 'NO',
      ifLetOut: h.letOut ? 'L' : 'S',
      Rentdetails: { AnnualLetableValue: alv, LocalTaxes: tax, TotalUnrealizedAndTax: tax, BalanceALV: balance, AnnualOfPropOwned: balance, ThirtyPercentOfBalance: thirty, IntOnBorwCap: interest, TotalDeduct: thirty + interest, IncomeOfHP: balance - thirty - interest },
    }];
  }
  if (new Decimal(comp.heads.houseProperty).toNumber() !== hpIncome) err('house', 'House property income does not agree with the computation.');

  const osRows = [
    ['SAV', os.savingsInterest], ['IFD', os.depositInterest], ['DIV', os.dividends], ['OTH', os.other],
  ].filter(([, v]) => n0(v as number) > 0).map(([k, v]) => ({ OthSrcNatureDesc: k, ...(k === 'OTH' ? { OthSrcOthNatOfInc: clean(os.otherDescription || 'Other income', 125) } : {}), OthSrcOthAmount: n0(v as number) }));
  const osIncome = osRows.reduce((s, r) => s + r.OthSrcOthAmount, 0);

  const gti = salaryIncome + hpIncome + osIncome;
  const via = { c80, c80ccd1b, c80d, c80tta, c80ttb };
  const viaTotal = Math.min(c80 + c80ccd1b + c80d + c80tta + c80ttb, Math.max(0, gti));
  const totalIncome = n0(comp.totalIncome);
  if (totalIncome > 5125000 || gti > 5000000) err('income', 'ITR-1 is for total income up to Rs 50 lakh; use ITR-2.');

  // Tax
  const taxBeforeRebate = n0(new Decimal(comp.taxOnNormal).add(comp.taxOnSpecial));
  const rebate = Math.min(n0(comp.rebate), taxBeforeRebate);
  const afterRebate = taxBeforeRebate - rebate;
  const cess = n0(new Decimal(afterRebate).mul(0.04));
  const grossLiability = afterRebate + cess;
  if (n0(comp.surcharge) > 0) err('income', 'Surcharge applies; ITR-1 cannot be used.');

  // Interest and fee. Assessed tax is the liability less TDS and TCS.
  const tcs = n0(i.tcs);
  const assessed = Math.max(0, grossLiability - prepaidTds - tcs);
  const filedOn = i.createdOn;
  const belated = i.filing.section === 12 || filedOn > '2026-07-31';
  const i234A = belated ? floor100(assessed - advance) * 0.01 * monthsFrom('2026-08-01', filedOn) : 0;
  const i234B = assessed >= 10000 && advance < assessed * 0.9 ? floor100(assessed - advance) * 0.01 * monthsFrom('2026-04-01', filedOn) : 0;
  const i234C = n0(i.interest234C);
  const exemption = (regime === 'NEW' ? NEW_SLABS : oldSlabs(age))[0][0];
  const fee234F = belated && totalIncome > exemption ? (totalIncome > 500000 ? 5000 : 1000) : 0;
  const interest = n0(i234A) + n0(i234B) + i234C + fee234F;
  const taxPlusInterest = grossLiability + interest;
  const paid = prepaidTds + tcs + advance + selfTax;

  const zeroVia = { Section80C: 0, Section80CCC: 0, Section80CCDEmployeeOrSE: 0, Section80CCD1B: 0, Section80CCDEmployer: 0, Section80D: 0, Section80DD: 0, Section80DDB: 0, Section80E: 0, Section80EE: 0, Section80G: 0, Section80GG: 0, Section80GGA: 0, Section80GGC: 0, Section80U: 0, Section80TTA: 0, Section80TTB: 0, AnyOthSec80CCH: 0 };
  const claimed = regime === 'OLD' ? { Section80C: n0(d.section80C), Section80CCD1B: n0(d.section80CCD1B), Section80D: n0(d.section80D), Section80TTA: c80tta, Section80TTB: c80ttb } : {};
  const allowed = regime === 'OLD' ? { Section80C: via.c80, Section80CCD1B: via.c80ccd1b, Section80D: via.c80d, Section80TTA: via.c80tta, Section80TTB: via.c80ttb } : {};
  const usr = { ...zeroVia, ...claimed };
  const dedAllowed = { ...zeroVia, Section80EEA: 0, Section80EEB: 0, ...allowed };

  const employers = i.salary?.employers ?? [];
  const json = {
    ITR: {
      ITR1: {
        CreationInfo: { SWVersionNo: '1.0', SWCreatedBy: i.softwareId, JSONCreatedBy: i.softwareId, JSONCreationDate: i.createdOn, IntermediaryCity: clean(i.intermediaryCity, 25) || 'Delhi', Digest: '-' },
        Form_ITR1: { FormName: 'ITR-1', Description: 'For Indls having Income from Salary, Pension, family pension and Interest', AssessmentYear: '2026', SchemaVer: 'Ver1.0', FormVer: 'Ver1.0' },
        PersonalInfo: {
          AssesseeName: { ...(p.firstName ? { FirstName: clean(p.firstName, 25) } : {}), ...(p.middleName ? { MiddleName: clean(p.middleName, 25) } : {}), SurNameOrOrgName: clean(p.surname, 75) },
          PAN: p.pan,
          Address: { ResidenceNo: clean(p.address.residenceNo, 50), LocalityOrArea: clean(p.address.locality, 50), CityOrTownOrDistrict: clean(p.address.city, 50), StateCode: p.address.stateCode, CountryCode: '91', PinCode: Number(p.address.pin), CountryCodeMobile: 91, MobileNo: Number(p.mobile), EmailAddress: clean(p.email, 125) },
          SecondaryAdd: 'N',
          DOB: p.dob,
          EmployerCategory: p.employerCategory,
        },
        FilingStatus: {
          ReturnFileSec: belated && i.filing.section === 11 ? 12 : i.filing.section,
          OptOutNewTaxRegime: regime === 'OLD' ? 'Y' : 'N',
          ...(i.filing.section === 17 ? { ReceiptNo: i.filing.originalAck, OrigRetFiledDate: i.filing.originalFiledOn } : {}),
          AsseseeRepFlg: 'N',
          ItrFilingDueDate: '2026-07-31',
        },
        ITR1_IncomeDeductions: {
          GrossSalary: gross, Salary: gross, NetSalary: gross, DeductionUs16: std + pt, DeductionUs16ia: std, ...(pt ? { ProfessionalTaxUs16iii: pt } : {}), IncomeFromSal: salaryIncome,
          ...(propertyDetails ? { PropertyDetails: propertyDetails } : {}),
          TotalIncomeChargeableUnHP: hpIncome,
          IncomeOthSrc: osIncome,
          ...(osRows.length ? { OthersInc: { OthersIncDtlsOthSrc: osRows } } : {}),
          GrossTotIncome: gti,
          GrossTotIncomeIncLTCG112A: gti + ltcgGain,
          UsrDeductUndChapVIA: { ...usr, TotalChapVIADeductions: Object.values(usr).reduce((s, v) => s + v, 0) },
          DeductUndChapVIA: { ...dedAllowed, TotalChapVIADeductions: viaTotal },
          TotalIncome: totalIncome,
        },
        ITR1_TaxComputation: {
          TotalTaxPayable: taxBeforeRebate, Rebate87A: rebate, TaxPayableOnRebate: afterRebate, EducationCess: cess, GrossTaxLiability: grossLiability, Section89: 0, NetTaxLiability: grossLiability,
          TotalIntrstPay: interest,
          IntrstPay: { IntrstPayUs234A: n0(i234A), IntrstPayUs234B: n0(i234B), IntrstPayUs234C: i234C, LateFilingFee234F: fee234F },
          TotTaxPlusIntrstPay: taxPlusInterest,
        },
        TaxPaid: { TaxesPaid: { AdvanceTax: advance, TDS: prepaidTds, TCS: tcs, SelfAssessmentTax: selfTax, TotalTaxesPaid: paid }, BalTaxPayable: Math.max(0, taxPlusInterest - paid) },
        Refund: { RefundDue: Math.max(0, paid - taxPlusInterest), BankAccountDtls: { AddtnlBankDetails: [{ IFSCCode: i.bank.ifsc, BankName: clean(i.bank.name, 125), BankAccountNo: clean(i.bank.account, 20), AccountType: i.bank.type, UseForRefund: 'true' }] } },
        ...(employers.length ? { TDSonSalaries: { TDSonSalary: employers.map((e) => ({ EmployerOrDeductorOrCollectDetl: { TAN: e.tan, EmployerOrDeductorOrCollecterName: clean(e.name, 125) }, IncChrgSal: n0(e.incomeChargeable), TotalTDSSal: n0(e.tds) })), TotalTDSonSalaries: employers.reduce((s, e) => s + n0(e.tds), 0) } } : {}),
        ...(i.tdsOther?.length ? { TDSonOthThanSals: { TDSonOthThanSal: i.tdsOther.map((t) => ({ EmployerOrDeductorOrCollectDetl: { TAN: t.tan, EmployerOrDeductorOrCollecterName: clean(t.name, 125) }, TDSSection: t.section, AmtForTaxDeduct: n0(t.amount), DeductedYr: '2025', TotTDSOnAmtPaid: n0(t.tds), ClaimOutOfTotTDSOnAmtPaid: n0(t.tds) })), TotalTDSonOthThanSals: i.tdsOther.reduce((s, t) => s + n0(t.tds), 0) } } : {}),
        ...(i.taxPayments?.length ? { TaxPayments: { TaxPayment: i.taxPayments.map((t) => ({ BSRCode: t.bsr, DateDep: t.date, SrlNoOfChaln: t.serial, Amt: n0(t.amount) })), TotalTaxPayments: advance + selfTax } } : {}),
        ...(i.ltcg112A ? { LTCG112A: { TotSaleCnsdrn: n0(i.ltcg112A.saleValue), TotCstAcqisn: n0(i.ltcg112A.cost), LongCap112A: ltcgGain } } : {}),
        Verification: { Declaration: { AssesseeVerName: clean([p.firstName, p.middleName, p.surname].filter(Boolean).join(' '), 127), FatherName: clean(p.fatherName, 125), AssesseeVerPAN: p.pan }, Capacity: 'S', Place: clean(p.place, 50) },
      },
    },
  };
  const summary = { grossTotalIncome: gti, totalIncome, tax: grossLiability, interest, paid, payable: Math.max(0, taxPlusInterest - paid), refund: Math.max(0, paid - taxPlusInterest) };
  return { json: issues.length ? null : json, issues, summary };
}
