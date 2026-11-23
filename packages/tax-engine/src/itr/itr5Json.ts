import { clean, creationInfo, n0, sum, type ItrIssue } from './itrCommon.js';
import { buildEntity, entityAddress, entityChecks, natureRows, surchargeWithRelief, verificationBlock, type EntityCommonInput, type EntityTax, type Writer } from './itrEntity.js';

/**
 * ITR-5 JSON for Assessment Year 2026-27 (income of 2025-26) for a resident partnership firm or limited
 * liability partnership, to the Department's schema ITR-5_2026_Main_V1.1 (kept in
 * packages/tax-engine/schemas/itr; every test output is validated against it) and the ITR-5 validation
 * rules for AY 2026-27, version 1.0 of 07 Jul 2026 (rule numbers cited).
 *
 * Tax (Finance Act 2025, First Schedule Part III, paragraph C, the rates for income of 2025-26, carried
 * into Part I of the First Schedule for AY 2026-27): 30% of total income; surcharge 12% where total income
 * exceeds Rs 1 crore, with marginal relief; health and education cess 4%. Capital gains at the special
 * rates of sections 111A (20%), 112A (12.5% above Rs 1.25 lakh) and 112 (12.5%), as the Finance (No. 2)
 * Act 2024 set them for transfers after 23 Jul 2024. Section 40(b) limits on partners' interest and
 * remuneration are applied. No alternate minimum tax arises: section 115JEE(1) applies it only where
 * Chapter VI-A Part C, section 10AA or section 35AD deductions are claimed, which this file refuses.
 *
 * Not covered, reported as issues: AOP, BOI, AJP, trusts, cooperative societies and other ITR-5 statuses
 * (section 167B shares and section 115BAD or 115BAE options), presumptive income (a firm other than an LLP
 * with income under 44AD, 44ADA or 44AE can use ITR-4), losses, Chapter VI-A deductions, transfer
 * pricing, foreign assets, non-residents, and everything the shared entity engine lists.
 */

export interface Itr5Partner {
  name: string;
  pan: string;
  address: { line: string; city: string; stateCode: string; pin: string };
  /** Share in profit, per cent. */
  share: number;
  status?: 'INDIVIDUAL' | 'HUF' | 'FIRM' | 'LLP' | 'DOMESTIC_COMPANY';
  /** Working partner authorised by the deed to draw remuneration (section 40(b)(i) and Explanation 4). */
  working: boolean;
  /** Interest on capital debited, and the rate in per cent a year. */
  interest?: number;
  rate?: number;
  remuneration?: number;
}

export interface Itr5BalanceSheet {
  partnersCapital: number; // may be negative
  reserves?: number;
  securedLoansBank?: number; securedLoansOthers?: number; unsecuredLoansBank?: number; unsecuredLoansOthers?: number; advances?: number;
  grossBlock?: number; accumulatedDepreciation?: number; capitalWip?: number;
  investmentsLongTerm?: number; investmentsShortTerm?: number;
  stock?: number; debtors?: number; cashInHand?: number; bank?: number; otherCurrentAssets?: number; loansAdvances?: number; deposits?: number;
  creditors?: number; otherPayables?: number; incomeTaxProvision?: number; otherProvisions?: number;
}

export interface Itr5Input extends EntityCommonInput {
  kind: 'FIRM' | 'LLP';
  llpin?: string;
  partners: Itr5Partner[];
  balanceSheet: Itr5BalanceSheet;
  msmeRegNo?: string;
}

/** Due date under section 139(1): 31 Oct 2026 where accounts are audited (Explanation 2(a)); otherwise the date the schema and validation rule 58 allow for business income, 31 Aug 2026. */
export const itr5DueDate = (audited: boolean) => (audited ? '2026-10-31' : '2026-08-31');

/** Firm tax for AY 2026-27 on income at the normal rate and special-rate capital gains. */
export function firmTax(normalIncome: number, sp: { st111A: number; lt112A: number; lt112: number }, totalIncome: number): EntityTax & { reliefIssue: boolean } {
  const ltA = Math.max(0, sp.lt112A - 125000); // 112A(1): 12.5% on gains above Rs 1.25 lakh
  const taxOn = (normal: number) => Math.round(normal * 0.3);
  const st = Math.round(sp.st111A * 0.2), la = Math.round(ltA * 0.125), lo = Math.round(sp.lt112 * 0.125);
  const normal = taxOn(normalIncome);
  const special = st + la + lo;
  const tax = normal + special;
  // Marginal relief needs the tax on a total income of Rs 1 crore; it is worked by taking the excess out of normal-rate income,
  // so where that income is smaller than the excess the case is refused.
  const excess = totalIncome - 10000000;
  const reliefIssue = excess > 0 && normalIncome < excess;
  const s = surchargeWithRelief(totalIncome, tax, [[10000000, 0.12]], (x) => taxOn(normalIncome - (totalIncome - x)) + special);
  const cess = Math.round((tax + s.surcharge) * 0.04);
  const si: Array<[string, number, number, number]> = [['1', 20, sp.st111A, st], ['2A', 12.5, ltA, la], ['22', 12.5, sp.lt112, lo]].filter(([, , inc]) => (inc as number) > 0) as Array<[string, number, number, number]>;
  return { normal, special, si, surcharge: s.surcharge, surchargeBeforeRelief: s.beforeRelief, cess, liability: tax + s.surcharge + cess, reliefIssue };
}

export function writeItr5(i: Itr5Input): Writer {
  const issues: ItrIssue[] = entityChecks(i, 5);
  const err = (field: string, message: string) => issues.push({ field, message });
  const e = i.entity;
  if (/^[A-Z]{5}\d{4}[A-Z]$/.test(e.pan) && e.pan[3] !== 'F') err('pan', 'ITR-5 here is written for a firm or LLP: the fourth letter of the PAN must be F.');
  if (i.kind === 'LLP' && i.llpin && !/^[A-Z0-9-]{8}$/.test(i.llpin)) err('llpin', 'LLPIN must be 8 characters, as the MCA issues it.');
  const partners = i.partners ?? [];
  if (partners.length < 2) err('partners', 'A firm or LLP has at least two partners; give each partner.');
  const shares = Math.round(sum(partners.map((p) => p.share)) * 100) / 100;
  if (partners.length && shares !== 100) err('partners', `Partners' shares add up to ${shares}%; they must add up to 100%.`);
  for (const p of partners) {
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(p.pan)) err('partners', `${clean(p.name, 40) || 'A partner'}: PAN is not valid.`);
    if (n0(p.interest) > 0 && !(n0(p.rate) > 0)) err('partners', `${clean(p.name, 40) || 'A partner'}: give the rate of interest on capital.`);
  }
  if (!partners.some((p) => p.pan === i.signatory.pan)) err('signatory', 'The person verifying must be one of the partners (validation rule 18).');
  if (!['MP', 'DP', 'PA'].includes(i.signatory.capacity)) err('signatory', 'Capacity for a firm or LLP is managing partner (MP), designated partner (DP) or partner (PA).');
  if (i.kind === 'LLP' && i.signatory.capacity !== 'DP') err('signatory', 'An LLP return is verified by a designated partner (section 140(cd)).');

  const audited = !!i.audit;
  const dueDate = itr5DueDate(audited);
  let reliefIssue = false;
  const b = buildEntity(i, {
    form: 5, dueDate,
    partners: partners.map((p) => ({ interest: n0(p.interest), rate: n0(p.rate), remuneration: n0(p.remuneration), working: p.working })),
    tax: (normal, sp, ti) => { const t = firmTax(normal, sp, ti); reliefIssue = t.reliefIssue; return t; },
  });
  issues.push(...b.issues);
  if (reliefIssue) err('income', 'Marginal relief on surcharge where special-rate income is above the excess over Rs 1 crore is not written by this file.');
  const n = b.numbers;

  // Balance sheet (Part A-BS): sources of funds must equal application of funds.
  const bs = i.balanceSheet ?? ({ partnersCapital: 0 } as Itr5BalanceSheet);
  const v = (x?: number) => n0(x);
  const capital = Math.round(bs.partnersCapital ?? 0);
  const partnerFund = capital + v(bs.reserves);
  const secured = v(bs.securedLoansBank) + v(bs.securedLoansOthers);
  const unsecured = v(bs.unsecuredLoansBank) + v(bs.unsecuredLoansOthers);
  const fundSrc = partnerFund + secured + unsecured + v(bs.advances);
  const netBlock = v(bs.grossBlock) - v(bs.accumulatedDepreciation);
  const fixedTotal = netBlock + v(bs.capitalWip);
  const invTotal = v(bs.investmentsLongTerm) + v(bs.investmentsShortTerm);
  const cashBank = v(bs.cashInHand) + v(bs.bank);
  const currAssets = v(bs.stock) + v(bs.debtors) + cashBank + v(bs.otherCurrentAssets);
  const loanAdv = v(bs.loansAdvances) + v(bs.deposits);
  const currLiab = v(bs.creditors) + v(bs.otherPayables);
  const provisions = v(bs.incomeTaxProvision) + v(bs.otherProvisions);
  const netCurrent = currAssets + loanAdv - currLiab - provisions;
  const fundApply = fixedTotal + invTotal + netCurrent;
  if (fundSrc !== fundApply) err('balanceSheet', `The balance sheet does not balance: sources of funds Rs ${fundSrc}, application of funds Rs ${fundApply}.`);
  if (netBlock < 0) err('balanceSheet', 'Accumulated depreciation cannot be more than the gross block.');

  const partABS = {
    FundSrc: {
      PartnerOrMemberFund: { PartnerOrMemberCap: capital, ResrNSurp: { RevResr: v(bs.reserves), CapResr: 0, StatResr: 0, OthResr: 0, CreditBalOfPLAccount: 0, TotResrNSurp: v(bs.reserves) }, TotPartnerOrMemberFund: partnerFund },
      LoanFunds: {
        SecrLoan: { ForeignCurrLoan: 0, RupeeLoan: { FrmBank: v(bs.securedLoansBank), FrmOthrs: v(bs.securedLoansOthers), TotRupeeLoan: secured }, TotSecrLoan: secured },
        UnsecrLoan: { ForeignCurrencyLoans: 0, RupeeLoan: { FrmBank: v(bs.unsecuredLoansBank), FrmPersonSpcfdUs40A2b: 0, FrmOthrs: v(bs.unsecuredLoansOthers), TotRupeeLoan: unsecured }, TotUnSecrLoan: unsecured },
        TotLoanFund: secured + unsecured,
      },
      DeferredTax: 0,
      Advances: { FrmPersonSpcfdUs40A2b: 0, FrmOthers: v(bs.advances), TotalAdvances: v(bs.advances) },
      TotFundSrc: fundSrc,
    },
    FundApply: {
      FixedAsset: { GrossBlock: v(bs.grossBlock), Depreciation: v(bs.accumulatedDepreciation), NetBlock: Math.max(0, netBlock), CapWrkProg: v(bs.capitalWip), TotFixedAsset: Math.max(0, fixedTotal) },
      Investments: {
        LongTermInv: { InvInProperty: 0, EquityInstruments: { ListedEquities: 0, UnListedEquities: 0, Total: 0 }, PreferenceShares: 0, GovtOrTrustSecurities: 0, DebenturesOrBonds: 0, MutualFunds: 0, Others: v(bs.investmentsLongTerm), TotLongTermInv: v(bs.investmentsLongTerm) },
        ShortTermInv: { EquityInstruments: { ListedEquities: 0, UnListedEquities: 0, Total: 0 }, PreferenceShares: 0, GovtOrTrustSecurities: 0, DebenturesOrBonds: 0, MutualFunds: 0, Others: v(bs.investmentsShortTerm), TotShortTermInv: v(bs.investmentsShortTerm) },
        TotInvestments: invTotal,
      },
      CurrAssetLoanAdv: {
        CurrAsset: {
          Inventories: { RawMatl: 0, WorkInProgress: 0, FinOrTradGood: v(bs.stock), StkInTrade: 0, StoresConsumables: 0, LooseTools: 0, Others: 0, TotInventries: v(bs.stock) },
          SundryDebtorDtls: { OutstandindMorethanOneYr: 0, Others: v(bs.debtors), TotalSundryDebtors: v(bs.debtors) },
          CashOrBankBal: { BankBal: v(bs.bank), CashinHand: v(bs.cashInHand), Others: 0, TotCashOrBankBal: cashBank },
          OthCurrAsset: v(bs.otherCurrentAssets),
          TotCurrAsset: currAssets,
        },
        LoanAdv: { AdvRecoverable: v(bs.loansAdvances), Deposits: v(bs.deposits), BalWithRevAuth: 0, TotLoanAdv: loanAdv, LoanAdvIncluded: { PurposeOFBusOrProf: loanAdv, NotForPurposeOFBusOrProf: 0 } },
        TotCurrAssetLoanAdv: currAssets + loanAdv,
        CurrLiabilitiesProv: {
          CurrLiabilities: { SundryCreditorDtls: { OutstandindMorethanOneYr: 0, Others: v(bs.creditors), TotalSundryCreditors: v(bs.creditors) }, LiabForLeasedAsset: 0, AccrIntonLeasedAsset: 0, AccrIntNotDue: 0, IncRecvdInAdv: 0, OtherPayables: v(bs.otherPayables), TotCurrLiabilities: currLiab },
          Provisions: { ITProvision: v(bs.incomeTaxProvision), ELSuperAnnGratProvision: 0, OthProvision: v(bs.otherProvisions), TotProvisions: provisions },
          TotCurrLiabilitiesProvision: currLiab + provisions,
        },
        NetCurrAsset: netCurrent,
      },
      MiscAdjust: { MiscExpndr: 0, DefTaxAsset: 0, AccumultedLosses: 0, TotMiscAdjust: 0 },
      TotFundApply: fundApply,
    },
  };

  const salesBand = n.salesTotal <= 10000000 ? 'Upto1CR' : n.salesTotal <= 100000000 ? 'Upto10CR' : 'MoreThan10CR';
  const gen2 = {
    LiableSec44AAflg: 'Y',
    IncDclrdUs: 'N',
    ...(n.salesTotal > 0 ? { TotalSalesExcOneCr: salesBand } : {}),
    ...(salesBand === 'Upto10CR' ? { AgrOFAllAmtsRcvd: i.books.cashReceiptsWithin5Pct ? 'Upto5Per' : 'MoreThan5Per', AgrOFAllPayMade: i.books.cashPaymentsWithin5Pct ? 'Upto5Per' : 'MoreThan5Per' } : {}),
    LiableSec44ABflg: n.liable44AB ? 'Y' : 'N',
    ...(n.liable44AB ? { Cndnfor44AB: 'bi' } : {}),
    ...(i.audit ? {
      AuditedByAccountantFlg: 'Y',
      AuditInfo: { AuditReportFurnishDate: i.audit.reportDate, AudFrmName: clean(i.audit.firmName, 125), AudFrmPAN: i.audit.firmPan, AckNum44AB: Number(i.audit.ack3CD) },
    } : {}),
    LiableSec92Eflg: 'N',
    AccountAuditFlag: 'N',
    PrevYrMemPartChange: 'N',
    PartnerOrMemberInfo: partners.map((p) => ({
      PartnerOrMemberName: clean(p.name, 125),
      AddressDetailWithZipCode: { AddrDetail: clean(p.address.line, 200), CityOrTownOrDistrict: clean(p.address.city, 50), StateCode: p.address.stateCode, CountryCode: '91', PinCode: Number(p.address.pin) },
      SharePercentage: p.share, PAN: p.pan, Status: p.status ?? (p.working ? 'IND_WORKING' : 'INDIVIDUAL'), RateOfInterest: n0(p.rate), RemunerationPaid: n0(p.remuneration),
    })),
    NatOfBus: natureRows(i.natures),
  };

  const t = b.tx;
  const gross = t.normal + t.special;
  const json = {
    ITR: {
      ITR5: {
        CreationInfo: creationInfo(i.softwareId, i.createdOn, i.intermediaryCity),
        Form_ITR5: { FormName: 'ITR-5', Description: 'For persons other than individuals, HUFs, companies and those filing ITR-7', AssessmentYear: '2026', SchemaVer: 'Ver1.0', FormVer: 'Ver1.0' },
        PartA_GEN1: {
          OrgFirmInfo: {
            AssesseeName: { SurNameOrOrgName: clean(e.name, 125) }, PAN: e.pan, ...(i.kind === 'LLP' && i.llpin ? { LLPINissuedByMCA: i.llpin } : {}),
            Address: entityAddress(e), DateOFFormOrIncorp: e.formedOn, StatusOrCompanyType: '1', SubStatus: i.kind === 'LLP' ? '5' : '10',
          },
          FilingStatus: {
            ReturnFileSec: { IncomeTaxSec: b.filingSection },
            IncFrmBusOrProf: 'Y',
            BusinessTrustFlag: 'N', InvstmntFundRefrdSec115UB: 'N',
            ...(i.filing.section === 17 ? { ReceiptNo: Number(i.filing.originalAck), OrigRetFiledDate: i.filing.originalFiledOn } : {}),
            ResidentialStatus: 'RES', ForeignExchangeFlag: 'N', StartUpDPIITFlag: 'N', InterMinisterialCertFlag: 'N',
            ifMSME: i.msmeRegNo ? 'Y' : 'N', ...(i.msmeRegNo ? { RegNumMSMEDAct2006: clean(i.msmeRegNo, 50) } : {}),
            FiiFpiFlag: 'N', AsseseeRepFlg: 'N', PartnerInFirmFlg: 'N', HeldUnlistedEqShrPrYrFlg: 'N',
            ItrFilingDueDate: dueDate,
          },
        },
        PartA_GEN2: gen2,
        PARTA_BS: partABS,
        TradingAccount: b.parts.tradingAccount,
        PARTA_PL: {
          ...b.parts.partAPL,
          PersumptiveInc44AD: { GrsTrnOverOrReceipt: 0, TotPersumptiveInc44AD: 0 },
          PersumptiveInc44ADA: { GrsReceipt: 0 },
          TotalPrsumptvIncUs44E: 0,
          NoBooksOfAccPL: { GrossReceipt: 0, GrsRcptAccPayeeOrBankMode: 0, GrsRcptOtherMode: 0, GrossProfit: 0, Expenses: 0, NetProfit: 0, GrossReceiptPrf: 0, GrsRcptAccPayeeOrBankModePrf: 0, GrsRcptOtherModePrf: 0, GrossProfitPrf: 0, ExpensesPrf: 0, NetProfitPrf: 0, TotBusinessProfession: 0 },
          TurnverFrmSpecActivity: 0, NetIncomeFrmSpecActivity: 0,
        },
        PARTA_OI: b.parts.partAOI,
        ...(b.parts.scheduleHP ? { ScheduleHP: b.parts.scheduleHP } : {}),
        CorpScheduleBP: b.parts.scheduleBP,
        ...b.parts.depSchedules,
        ...(b.parts.scheduleCG ? { ScheduleCG: b.parts.scheduleCG } : {}),
        ...(b.parts.schedule112A ? { Schedule112A: b.parts.schedule112A } : {}),
        ...(b.parts.scheduleOS ? { ScheduleOS: b.parts.scheduleOS } : {}),
        ScheduleCYLA: b.parts.scheduleCYLA,
        ScheduleBFLA: b.parts.scheduleBFLA,
        ...(b.parts.scheduleSI ? { ScheduleSI: b.parts.scheduleSI } : {}),
        'PartB-TI': {
          IncomeFromHP: Math.max(0, n.hpTotal),
          ProfBusGain: { ProfGainNoSpecBus: Math.max(0, n.bp), ProfGainSpecBus: 0, ProfGainSpecifiedBus: 0, IncChrgblTaxSplRate: 0, TotProfBusGain: Math.max(0, n.bp) },
          CapGain: {
            ShortTerm: { ShortTerm20Per: n.st20, ShortTerm30Per: 0, ShortTermAppRate: n.stApp, ShortTermSplRateDTAA: 0, TotalShortTerm: n.st20 + n.stApp },
            LongTerm: { LongTerm12_5Per: n.ltA + n.ltO, LongTermSplRateDTAA: 0, TotalLongTerm: n.ltA + n.ltO },
            ShortTermLongTermTotal: n.cgIncome, CapGains30Per115BBH: 0, TotalCapGains: n.cgIncome,
          },
          IncFromOS: { OtherSrcThanOwnRaceHorse: n.osIncome, IncChargblSplRate: 0, FromOwnRaceHorse: 0, TotIncFromOS: n.osIncome },
          TotalTI: n.gti, CurrentYearLoss: 0, BalanceAfterSetoffLosses: n.gti, BroughtFwdLossesSetoff: 0, GrossTotalIncome: n.gti,
          IncChargeTaxSplRate111A112: n.splIncome,
          DeductionsUndSchVIADtl: { PartBchapterVIA: 0, PartCchapterVIA: 0, TotDeductUndSchVIA: 0 },
          DeductionsUnder10Aor10AA: 0, TotalIncome: n.totalIncome,
          IncChargeableTaxSplRates: n.splIncome, NetAgricultureIncomeOrOtherIncomeForRate: 0, AggregateIncome: n.normalIncome,
          LossesOfCurrentYearCarriedFwd: 0, DeemedTotIncSec115JC: 0,
        },
        PartB_TTI: {
          ComputationOfTaxLiability: {
            TaxPayableOnDeemedTI: { TaxDeemedTISec115JC: 0, Surcharge: 0, EducationCess: 0, TotalTax: 0 },
            TaxPayableOnTI: {
              TaxAtNormalRates: t.normal, TaxAtSpecialRates: t.special, RebateOnAgriInc: 0, TaxPayableOnTotInc: gross,
              Surcharge25ofSI: 0, SurchargeOnTaxPayable: t.surcharge, Surcharge25ofSIBeforeMarginal: 0, SurchargeOnTaxPayableBeforeMarginal: t.surchargeBeforeRelief,
              TotalSurcharge: t.surcharge, EducationCess: t.cess, GrossTaxLiability: t.liability,
            },
            GrossTaxPayable: t.liability, CreditUS115JD: 0, TaxPaidUnderCredit: t.liability,
            TaxRelief: { Section90: 0, Section91: 0, TotTaxRelief: 0 },
            NetTaxLiability: t.liability,
            ...b.parts.ttiCore,
          },
          ...b.parts.taxPaidBlock,
        },
        ...b.parts.taxSchedules,
        Verification: verificationBlock(i.signatory, i.createdOn),
      },
    },
  };
  const summary = {
    turnover: n.revenue, profitBeforeTax: n.pbt, businessIncome: n.bp, depreciationAllowed: n.itDep, disallowed40b: n.a16, partnerRemunerationLimit: n.remLimit,
    grossTotalIncome: n.gti, totalIncome: n.totalIncome, tax: t.liability, surcharge: t.surcharge, interest: n.interest, paid: n.paid,
    payable: Math.max(0, n.aggregate - n.paid), refund: Math.max(0, n.paid - n.aggregate),
  };
  return { json: issues.length ? null : json, issues, summary };
}
