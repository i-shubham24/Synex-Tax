import { clean, creationInfo, ISO, n0, type ItrIssue } from './itrCommon.js';
import { buildEntity, entityAddress, entityChecks, natureRows, surchargeWithRelief, verificationBlock, type EntityCommonInput, type EntityTax, type Writer } from './itrEntity.js';
import { ITR6_BS_INDAS_NIL, ITR6_PL_INDAS_NIL } from './itr6IndAsNil.js';

/**
 * ITR-6 JSON for Assessment Year 2026-27 (income of 2025-26) for a domestic company not claiming
 * exemption under section 11, to the Department's schema ITR-6_2026_Main_V1.0 (kept in
 * packages/tax-engine/schemas/itr; every test output is validated against it) and the ITR-6 validation
 * rules for AY 2026-27, version 1.0, whose Annexure 2 sets out the rates used here:
 * - section 115BAA: 22% on income other than that in Schedule SI, surcharge 10% on the whole tax without
 *   any threshold, cess 4%; no minimum alternate tax (section 115JB(5A), validation rule 674);
 * - otherwise 25% where total turnover or gross receipts of previous year 2023-24 did not exceed Rs 400
 *   crore, else 30%; surcharge 7% above Rs 1 crore and 12% above Rs 10 crore, with marginal relief;
 *   cess 4%.
 * Capital gains at the special rates of sections 111A (20%), 112A (12.5% above Rs 1.25 lakh) and 112 (12.5%).
 *
 * Minimum alternate tax (section 115JB, 15% of book profit) is Phase 2B's job. For a company not under
 * 115BAA this file works the book profit only as profit after tax plus the tax debited (Explanation 1(a))
 * with the other additions and deductions entered as figures from Form 29B, and refuses the case where
 * the tax on book profit is more than the tax on total income, or where MAT credit is brought forward.
 *
 * Not covered, reported as issues: Ind AS companies, foreign companies, companies under 115BA or 115BAB,
 * section 115JB liability, MAT credit, and everything the shared entity engine lists.
 */

export interface Itr6KeyPerson { name: string; designation: 'MD' | 'DIR' | 'SEC' | 'CEO' | 'CFO' | 'MGR' | 'OPO'; pan?: string; din?: string; address: { line: string; city: string; stateCode: string; pin: string } }

export interface Itr6BalanceSheet {
  shareCapital: number; authorisedCapital?: number;
  reserves?: number; // surplus in the profit and loss account and other reserves; may be negative
  longTermBorrowingsBank?: number; longTermBorrowingsOthers?: number; deferredTaxLiability?: number; longTermProvisions?: number;
  shortTermBorrowingsBank?: number; shortTermBorrowingsOthers?: number; tradePayables?: number; otherCurrentLiabilities?: number; incomeTaxProvision?: number; otherShortTermProvisions?: number;
  tangibleGross?: number; tangibleDepreciation?: number; intangibleGross?: number; intangibleAmortisation?: number; capitalWip?: number;
  nonCurrentInvestments?: number; deferredTaxAsset?: number; longTermLoansAdvances?: number;
  currentInvestments?: number; inventories?: number; tradeReceivables?: number; cashInHand?: number; bankBalances?: number; shortTermLoansAdvances?: number; otherCurrentAssets?: number;
}

export type Itr6Regime =
  | { option: '115BAA'; /** Form 10-IC: the year of the first option, its acknowledgement and date. */ form10IC: { assessmentYear: string; ack: string; date: string } }
  | { option: 'NORMAL'; turnover2023_24UpTo400Cr: boolean; mat: { otherAdditions?: number; otherDeductions?: number }; matCreditBroughtForward?: boolean };

export interface Itr6Input extends EntityCommonInput {
  companyType: 'PUBLIC' | 'PRIVATE';
  unlisted: boolean;
  regime: Itr6Regime;
  keyPersons: Itr6KeyPerson[];
  balanceSheet: Itr6BalanceSheet;
  msmeRegNo?: string;
}

/** Due date under section 139(1), Explanation 2(a): a company, 31 Oct 2026. */
export const ITR6_DUE_DATE = '2026-10-31';

const AY_10IC = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];

/** Company tax for AY 2026-27 under section 115BAA or at the normal rates (Annexure 2 to the ITR-6 validation rules). */
export function companyTax(regime: '115BAA' | 'NORMAL25' | 'NORMAL30', normalIncome: number, sp: { st111A: number; lt112A: number; lt112: number }, totalIncome: number): EntityTax & { reliefIssue: boolean } {
  const rate = regime === '115BAA' ? 0.22 : regime === 'NORMAL25' ? 0.25 : 0.3;
  const ltA = Math.max(0, sp.lt112A - 125000);
  const st = Math.round(sp.st111A * 0.2), la = Math.round(ltA * 0.125), lo = Math.round(sp.lt112 * 0.125);
  const normal = Math.round(normalIncome * rate);
  const special = st + la + lo;
  const tax = normal + special;
  let surcharge = 0, before = 0, reliefIssue = false;
  if (regime === '115BAA') { surcharge = Math.round(tax * 0.1); before = surcharge; } else {
    const bands: Array<[number, number]> = [[10000000, 0.07], [100000000, 0.12]];
    const threshold = totalIncome > 100000000 ? 100000000 : 10000000;
    reliefIssue = totalIncome > threshold && normalIncome < totalIncome - threshold;
    const s = surchargeWithRelief(totalIncome, tax, bands, (x) => Math.round((normalIncome - (totalIncome - x)) * rate) + special);
    surcharge = s.surcharge; before = s.beforeRelief;
  }
  const cess = Math.round((tax + surcharge) * 0.04);
  const si: Array<[string, number, number, number]> = [['1', 20, sp.st111A, st], ['2A', 12.5, ltA, la], ['22', 12.5, sp.lt112, lo]].filter(([, , inc]) => (inc as number) > 0) as Array<[string, number, number, number]>;
  return { normal, special, si, surcharge, surchargeBeforeRelief: before, cess, liability: tax + surcharge + cess, reliefIssue };
}

/** Tax on book profit under section 115JB(1): 15%, surcharge 7% above Rs 1 crore and 12% above Rs 10 crore with marginal relief, cess 4%. */
export function matTax(bookProfit: number) {
  const bp = Math.max(0, Math.round(bookProfit));
  const tax = Math.round(bp * 0.15);
  const s = surchargeWithRelief(bp, tax, [[10000000, 0.07], [100000000, 0.12]], (x) => Math.round(x * 0.15));
  const cess = Math.round((tax + s.surcharge) * 0.04);
  return { bookProfit: bp, tax, surcharge: s.surcharge, cess, total: tax + s.surcharge + cess };
}

export function writeItr6(i: Itr6Input): Writer {
  const issues: ItrIssue[] = entityChecks(i, 6);
  const err = (field: string, message: string) => issues.push({ field, message });
  const e = i.entity;
  if (/^[A-Z]{5}\d{4}[A-Z]$/.test(e.pan) && e.pan[3] !== 'C') err('pan', 'ITR-6 is for companies: the fourth letter of the PAN must be C.');
  const kp = i.keyPersons ?? [];
  if (!kp.length) err('keyPersons', 'Give at least one key person (director, managing director or principal officer).');
  if (!kp.some((k) => k.pan === i.signatory.pan)) err('signatory', 'The person verifying must be one of the key persons (validation rule 868).');
  if (!['MD', 'DR', 'PO', 'AS'].includes(i.signatory.capacity)) err('signatory', 'Capacity for a company is managing director (MD), director (DR), principal officer (PO) or authorised signatory (AS).');
  for (const k of kp) if (k.din && !/^\d{8}$/.test(k.din)) err('keyPersons', `${clean(k.name, 40)}: DIN must be 8 digits.`);

  const r = i.regime;
  if (r.option === '115BAA') {
    if (!AY_10IC.includes(r.form10IC?.assessmentYear) || !/^\d{15}$/.test(r.form10IC?.ack ?? '') || !ISO.test(r.form10IC?.date ?? '')) err('regime', 'Section 115BAA needs Form 10-IC: the assessment year of the option, its 15-digit acknowledgement and date (validation rules 15 and 16).');
    if (r.form10IC?.assessmentYear === '2026-27' && r.form10IC.date > ITR6_DUE_DATE) err('regime', 'For a first option this year, Form 10-IC must be filed by the due date under section 139(1) (section 115BAA(5)).');
  } else if (r.matCreditBroughtForward) err('regime', 'MAT credit under section 115JAA brought forward is not written by this file (Phase 2B).');

  const taxRegime = r.option === '115BAA' ? '115BAA' : r.turnover2023_24UpTo400Cr ? 'NORMAL25' : 'NORMAL30';
  let reliefIssue = false;
  const b = buildEntity(i, { form: 6, dueDate: ITR6_DUE_DATE, tax: (normal, sp, ti) => { const t = companyTax(taxRegime, normal, sp, ti); reliefIssue = t.reliefIssue; return t; } });
  issues.push(...b.issues);
  if (reliefIssue) err('income', 'Marginal relief on surcharge where special-rate income is above the excess over the threshold is not written by this file.');
  const n = b.numbers;
  const t = b.tx;

  // Section 115JB, companies not under 115BAA: book profit from profit after tax plus income-tax debited (Explanation 1(a)), with other
  // adjustments as entered (Form 29B). Schedule MAT items 7 = 4 + 5n - 6l and 9 = 7 + 8e - 8j (rules 667, 668).
  const matIn = r.option === 'NORMAL' ? r.mat ?? {} : undefined;
  const addOthers = n0(matIn?.otherAdditions), dedOthers = n0(matIn?.otherDeductions);
  const itDebited = n.currTax + n.defTax;
  const bookProfit = n.pat + itDebited + addOthers - dedOthers;
  const mat = matIn ? matTax(bookProfit) : undefined;
  if (mat && mat.total > t.liability) err('mat', `Tax on book profit under section 115JB (Rs ${mat.total}) is more than the tax on total income (Rs ${t.liability}); MAT applies, which this file does not write yet (Phase 2B).`);

  // Balance sheet (Part A-BS, Schedule III): equity and liabilities must equal assets.
  const bs = i.balanceSheet ?? ({ shareCapital: 0 } as Itr6BalanceSheet);
  const v = (x?: number) => n0(x);
  const reserves = Math.round(bs.reserves ?? 0);
  const shareCap = v(bs.shareCapital);
  const shFund = shareCap + reserves;
  const ltb = v(bs.longTermBorrowingsBank) + v(bs.longTermBorrowingsOthers);
  const nonCurrLiab = ltb + v(bs.deferredTaxLiability) + v(bs.longTermProvisions);
  const stb = v(bs.shortTermBorrowingsBank) + v(bs.shortTermBorrowingsOthers);
  const stProv = v(bs.incomeTaxProvision) + v(bs.otherShortTermProvisions);
  const currLiab = stb + v(bs.tradePayables) + v(bs.otherCurrentLiabilities) + stProv;
  const totEqLiab = shFund + nonCurrLiab + currLiab;
  const tangNet = v(bs.tangibleGross) - v(bs.tangibleDepreciation);
  const intangNet = v(bs.intangibleGross) - v(bs.intangibleAmortisation);
  const fixed = tangNet + intangNet + v(bs.capitalWip);
  const nonCurrAssets = fixed + v(bs.nonCurrentInvestments) + v(bs.deferredTaxAsset) + v(bs.longTermLoansAdvances);
  const cash = v(bs.cashInHand) + v(bs.bankBalances);
  const currAssets = v(bs.currentInvestments) + v(bs.inventories) + v(bs.tradeReceivables) + cash + v(bs.shortTermLoansAdvances) + v(bs.otherCurrentAssets);
  const totalAssets = nonCurrAssets + currAssets;
  if (totEqLiab !== totalAssets) err('balanceSheet', `The balance sheet does not balance: equity and liabilities Rs ${totEqLiab}, assets Rs ${totalAssets}.`);
  if (tangNet < 0 || intangNet < 0) err('balanceSheet', 'Accumulated depreciation or amortisation cannot be more than the gross block.');

  const partABS = {
    EquityAndLiablities: {
      ShareHolderFund: {
        ShareCapital: { Authorised: v(bs.authorisedCapital) || shareCap, IssuedSubsPaidUp: shareCap, SubscribedNotFullyPaid: 0, TotShareCapital: shareCap },
        ResrNSurp: { CapResr: 0, CapRedempResr: 0, SecurPremResr: 0, DebunRedResr: 0, RevResr: 0, ShareOptOSAmount: 0, OtherResrvTotal: 0, PLAccount: reserves, TotResrNSurp: reserves },
        MoneyRecvdAgainstShares: 0, TotShareHolderFund: shFund,
      },
      ShareAppMoneyAllot: { PendingLtOneYr: 0, PendingMtOneYr: 0, Total: 0 },
      NonCurrLiabilities: {
        LongTermBorrowings: {
          BondsDebentures: { ForeignCurrency: 0, Rupee: 0, Total: 0 },
          TermLoans: { ForeignCurrency: 0, RupeeLoans: { FromBanks: v(bs.longTermBorrowingsBank), FromOthers: v(bs.longTermBorrowingsOthers), Total: ltb }, TotalTermLoans: ltb },
          DeferredPymtLiabilities: 0, DepositsFrmRelatedParties: 0, OtherDeposits: 0, LoansAndAdv: 0, OthersLoanAdv: 0, LongTermMaturities: 0, TotalLTBorrowings: ltb,
        },
        NetDefferedTaxLiability: v(bs.deferredTaxLiability),
        OthLongTermLiablities: { TradePayables: 0, Others: 0, TotalOthLtLiabilities: 0 },
        LongTermProvisions: { ProvEmpBenefits: 0, Others: v(bs.longTermProvisions), Total: v(bs.longTermProvisions) },
        TotalNonCurrLiabilites: nonCurrLiab,
      },
      CurrentLiabilities: {
        ShortTrmBorrowings: {
          LoansRepaybleOnDemand: { FromBanks: v(bs.shortTermBorrowingsBank), FrmNonBanking: 0, OthFinanceInst: 0, Others: v(bs.shortTermBorrowingsOthers), TotLoansRepaybleOnDemand: stb },
          DepositsFrmRelatedParties: 0, LoansAndAdv: 0, OthLoansAndAdv: 0, OthDeposits: 0, TotShortTrmBorrowings: stb,
        },
        TradePayables: { OSMoreThanOneYr: 0, Others: v(bs.tradePayables), TotalTradePayables: v(bs.tradePayables) },
        OthCurrLiabilities: { CurrMatOnLTDebt: 0, CurrMatFinanceOblg: 0, AccrInterestNotDue: 0, AccrInterest: 0, IncRecvdAdvance: 0, UnpaidDividend: 0, AppMonyRecvdAllotSecurities: 0, UnpaidMatDeposits: 0, UnpaidMatureDebenture: 0, OthPayables: v(bs.otherCurrentLiabilities), TotOthCurrLiabilities: v(bs.otherCurrentLiabilities) },
        ShortTermProv: { EmpBenefitProv: 0, ITProvision: v(bs.incomeTaxProvision), ProposedDividend: 0, TaxOnDividend: 0, OthProvision: v(bs.otherShortTermProvisions), TotShortTermProvisions: stProv },
        TotCurrLiabilitiesProvision: currLiab,
      },
      TotEquityAndLiabilities: totEqLiab,
    },
    Assets: {
      NonCurrAssets: {
        FixedAsset: {
          Tangible: { GrossBlock: v(bs.tangibleGross), Depreciation: v(bs.tangibleDepreciation), ImpairmentLosses: 0, NetBlock: Math.max(0, tangNet) },
          InTangible: { GrossBlock: v(bs.intangibleGross), Amortization: v(bs.intangibleAmortisation), ImpairmentLosses: 0, NetBlock: Math.max(0, intangNet) },
          CapWrkProg: v(bs.capitalWip), IntangibleAssetUnDev: 0, TotFixedAsset: Math.max(0, fixed),
        },
        NonCurrInvstmnts: { InvInProperty: 0, EquityInstruments: { ListedEquities: 0, UnListedEquities: 0, Total: 0 }, PreferenceShares: 0, GovtOrTrustSecurities: 0, DebenturesOrBonds: 0, MutualFunds: 0, InvstmntInPrtnrShipFirm: 0, OtherInvstmnts: v(bs.nonCurrentInvestments), TotNonCurrInvstmnts: v(bs.nonCurrentInvestments) },
        NetDeferredTaxAssets: v(bs.deferredTaxAsset),
        LongTrmLoanAdv: { CapitalAdv: 0, SecurityDeposits: 0, LoanAdvRelatedParties: 0, OthLoanAdv: v(bs.longTermLoansAdvances), TotLTLoanAdv: v(bs.longTermLoansAdvances), LTLoanAdvDtls: { BusOrProf: v(bs.longTermLoansAdvances), NotForBusOrProf: 0, ShareHolderUs2_22: 0 } },
        OthNonCurrAssets: { LTTradeReceivables: { Secured: 0, Unsecured: 0, Doubtful: 0, TotOthNonCurrAssets: 0 }, Others: 0, Total: 0, NonCurrAssetUs2_22: 0 },
        TotNonCurrAssets: nonCurrAssets,
      },
      CurrentAssets: {
        CurrInvstmnts: { EquityInstruments: { ListedEquities: 0, UnListedEquities: 0, Total: 0 }, PreferenceShares: 0, GovtOrTrustSecurities: 0, DebenturesOrBonds: 0, MutualFunds: 0, InvstmntInPrtnrShipFirm: 0, OtherInvstmnts: v(bs.currentInvestments), TotCurrInvstmnts: v(bs.currentInvestments) },
        Inventories: { RawMatl: 0, WorkInProgress: 0, FinOrTradGood: v(bs.inventories), StkInTrade: 0, StoresConsumables: 0, LooseTools: 0, Others: 0, TotInventries: v(bs.inventories) },
        TradeReceivables: { OSMoreThanSixMonths: 0, Others: v(bs.tradeReceivables), TotalTradeReceivables: v(bs.tradeReceivables) },
        CashNCashEquivalents: { BalWithBanks: v(bs.bankBalances), ChequesDrafts: 0, CashInHand: v(bs.cashInHand), Others: 0, TotCashNCashEquivalents: cash },
        TotShortTermLoanAdv: { LoanAdv: 0, Others: v(bs.shortTermLoansAdvances), TotShrtTermLoans: v(bs.shortTermLoansAdvances), STLoanAdvDtls: { BusOrProf: v(bs.shortTermLoansAdvances), NotForBusOrProf: 0, ShareHolderUs2_22: 0 } },
        OtherCurrAssets: v(bs.otherCurrentAssets),
        TotCurrAssets: currAssets,
      },
    },
    TotalAssets: totalAssets,
  };

  const salesBand = n.salesTotal <= 10000000 ? 'Upto1CR' : n.salesTotal <= 100000000 ? 'Upto10CR' : 'MoreThan10CR';
  const kpAddr = (a: Itr6KeyPerson['address']) => ({ AddrDetail: clean(a.line, 200), CityOrTownOrDistrict: clean(a.city, 50), StateCode: a.stateCode, CountryCode: '91', PinCode: Number(a.pin) });
  const gen2 = {
    LiableSec44AAflg: 'Y', IncDclrdUs: 'N',
    ...(n.salesTotal > 0 ? { TotalSalesExcOneCr: salesBand } : {}),
    ...(salesBand === 'Upto10CR' ? { AgrOFAllAmtsRcvd: i.books.cashReceiptsWithin5Pct ? 'Upto5Per' : 'MoreThan5Per', AgrOFAllPayMade: i.books.cashPaymentsWithin5Pct ? 'Upto5Per' : 'MoreThan5Per' } : {}),
    LiableSec44ABflg: n.liable44AB ? 'Y' : 'N',
    ...(n.liable44AB && i.audit ? { AuditedByAccountantFlg: 'Y', AuditInfo: { AuditReportFurnishDate: i.audit.reportDate, AudFrmName: clean(i.audit.firmName, 125), AudFrmPAN: i.audit.firmPan, AckNum44AB: Number(i.audit.ack3CD) } } : {}),
    LiableSec92Eflg: 'N', AccountAuditFlag: 'N',
    HoldingStatus: { NatOfCompFlg: '4' },
    KeyPersons: kp.map((k) => ({ PersonName: clean(k.name, 125), Designation: k.designation, AddressDetailWithZipCode: kpAddr(k.address), ...(k.pan ? { KeyPerPAN: k.pan } : {}), ...(k.din ? { DirectorIdNo: k.din } : {}) })),
    NatureOfComp: { PubSectCompUs2_36AFlg: 'N', RBICompFlg: 'N', CompLes40PercSharGovRBIFlg: 'N', BankCompUs5Flg: 'N', SchedBankOfRBIActFlg: 'N', CompWithIRDARegisterFlg: 'N', NonBankFIICompFlg: 'N', CompanyUnlistedFlag: i.unlisted ? 'Y' : 'N' },
    NatOfBus: natureRows(i.natures),
  };

  const regimeFields = r.option === '115BAA'
    ? (r.form10IC.assessmentYear === '2026-27'
      ? { Section115BA: 'NA', Section115CurrAY: 'Y', SectionCurrAY: '115BAA', Section115CurrAYDate: r.form10IC.date, Section115CurrAYRecNo: Number(r.form10IC.ack) }
      : { Section115BA: '115BAA', Section115BAAY: r.form10IC.assessmentYear, ReceiptNo115BA: Number(r.form10IC.ack), '115BAFormFiledDate': r.form10IC.date, Section115CurrAY: 'N' })
    : { Section115BA: 'NA', Section115CurrAY: 'N', GrossReceipt: r.turnover2023_24UpTo400Cr ? 'Y' : 'N' };

  const scheduleMAT = mat ? {
    PLAcntPrepSchedVICompAct: '1', PLAcntPrepAsperAGM: '1', ProfAfterTaxPLAcnt: n.pat,
    Additions: { ITPaidInclDefTax: itDebited, ResvrNo33AC: 0, ProvUncertainLiab: 0, ProvLossOfSubsComp: 0, DividendPaidOrProposed: 0, ExpendExempIncUs10s: 0, ExpAopBoi: 0, ExpClauseFb: 0, NotLossClauseFc: 0, NotLossUs115bbf: 0, DepreciatAttribToRevalAsset: 0, GainClauseK: 0, Others: addOthers, TotAdditions: itDebited + addOthers },
    Deducts: { AmtWithdrawFromResvrIfCredPL: 0, IncExempIncUs10s: 0, AmtWithdrawFromResvrIfCredPLNoAttrib: 0, ShareIncAopBoi: 0, IncClauseiid: 0, NotGainClauseiie: 0, LossTrnsClauseiif: 0, UnAbsorbedDepreciat: 0, ProSickIndustryOrExcedAccumLos: 0, Others: dedOthers, TotDeducts: dedOthers },
    BookProfUs115JB: bookProfit, FinancialStamentFlag: 'N',
    DeemedTotalIncUs115JB: mat.bookProfit, DeemedTotalIncUs115JBIFSC: 0, DeemedTotalIncUs115JBOther: mat.bookProfit, TaxPayableUs115JB: mat.tax,
  } : undefined;

  const json = {
    ITR: {
      ITR6: {
        CreationInfo: creationInfo(i.softwareId, i.createdOn, i.intermediaryCity),
        Form_ITR6: { FormName: 'ITR-6', Description: 'For Companies other than companies claiming exemption under section 11', AssessmentYear: '2026', SchemaVer: 'Ver1.0', FormVer: 'Ver1.0' },
        PartA_GEN1: {
          OrgFirmInfo: { AssesseeName: { SurNameOrOrgName: clean(e.name, 125) }, PAN: e.pan, Address: entityAddress(e), DateOFFormOrIncorp: e.formedOn, StatusOrCompanyType: i.companyType === 'PUBLIC' ? '6' : '7', DomesticCompFlg: 'Y' },
          FilingStatus: {
            ReturnFileSec: { IncomeTaxSec: b.filingSection },
            ...(i.filing.section === 17 ? { ReceiptNo: Number(i.filing.originalAck), OrigRetFiledDate: i.filing.originalFiledOn } : {}),
            ResidentialStatus: 'RES', ...regimeFields,
            FinancialStmtFlag: 'N', UnderLiquidation: 'N', FiiFpiFlag: 'N', Sec581AFlag: 'N', AsseseeRepFlg: 'N', StartUpDPIITFlag: 'N',
            ItrFilingDueDate: ITR6_DUE_DATE,
            ifMSME: i.msmeRegNo ? 'Y' : 'N', ...(i.msmeRegNo ? { RegNumMSMEDAct2006: clean(i.msmeRegNo, 50) } : {}),
            ...(n.liable44AB ? { Cndnfor44AB: 'bi' } : {}),
          },
        },
        PartA_GEN2For6: gen2,
        PARTA_BSFor6FrmAY13: partABS,
        PARTA_BSIndAS: ITR6_BS_INDAS_NIL,
        TradingAccount: b.parts.tradingAccount,
        PARTA_PL: { ...b.parts.partAPL, TotalNumOfMonths: 0 },
        PARTA_PLIndAS: ITR6_PL_INDAS_NIL,
        PARTA_OI: b.parts.partAOI,
        ...(b.parts.scheduleHP ? { ScheduleHP: b.parts.scheduleHP } : {}),
        CorpScheduleBP: b.parts.scheduleBP,
        ...b.parts.depSchedules,
        ...(b.parts.scheduleCG ? { ScheduleCG: b.parts.scheduleCG } : {}),
        ...(b.parts.schedule112A ? { Schedule112A: b.parts.schedule112A } : {}),
        ...(b.parts.scheduleOS ? { ScheduleOS: b.parts.scheduleOS } : {}),
        ScheduleCYLA: b.parts.scheduleCYLA,
        ScheduleBFLA: b.parts.scheduleBFLA,
        ...(scheduleMAT ? { ScheduleMAT: scheduleMAT } : {}),
        ...(b.parts.scheduleSI ? { ScheduleSI: b.parts.scheduleSI } : {}),
        'PartB-TI': {
          IncomeFromHP: Math.max(0, n.hpTotal),
          ProfBusGain: { ProfGainNoSpecBus: Math.max(0, n.bp), IncmForeignCompRule10TIA: 0, ProfGainSpecBus: 0, ProfGainSpecifiedBus: 0, IncChrgblTaxSplRate: 0, TotProfBusGain: Math.max(0, n.bp) },
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
          IncChargeableTaxSplRates: n.splIncome, IncChargeableTaxNormalRates: n.normalIncome, NetAgricultureIncomeOrOtherIncomeForRate: 0,
          LossesOfCurrentYearCarriedFwd: 0, ...(mat ? { DeemedTotIncSec115JB: mat.bookProfit } : {}),
        },
        PartB_TTI: {
          ComputationOfTaxLiability: {
            TaxPayableOnDeemedTI: mat ? { TaxDeemedTISec115JB: mat.tax, Surcharge: mat.surcharge, EducationCess: mat.cess, TotalTax: mat.total } : { TaxDeemedTISec115JB: 0, Surcharge: 0, EducationCess: 0, TotalTax: 0 },
            TaxPayableOnTI: {
              TaxAtNormalRates: t.normal, TaxAtSpecialRates: t.special, TaxPayableOnTotInc: t.normal + t.special,
              Surcharge25ofSI: 0, SurchargeOnTaxPayable: t.surcharge, TotalSurcharge: t.surcharge, EducationCess: t.cess, GrossTaxLiability: t.liability,
            },
            GrossTaxPayable: t.liability, CredUs115JAATaxPaid: 0, TaxPayableAfterCredUs115JAA: t.liability,
            TaxRelief: { Section90: 0, Section91: 0, TotTaxRelief: 0 },
            NetTaxLiability: t.liability,
            ...b.parts.ttiCore,
          },
          ...b.parts.taxPaidBlock,
          AssetOutsideIndiaFlg: 'NO',
        },
        ...b.parts.taxSchedules,
        Verification: verificationBlock(i.signatory, i.createdOn),
      },
    },
  };
  const summary = {
    turnover: n.revenue, profitBeforeTax: n.pbt, businessIncome: n.bp, depreciationAllowed: n.itDep, grossTotalIncome: n.gti, totalIncome: n.totalIncome,
    tax: t.liability, surcharge: t.surcharge, bookProfit: mat ? mat.bookProfit : 0, matTax: mat ? mat.total : 0, interest: n.interest, paid: n.paid,
    payable: Math.max(0, n.aggregate - n.paid), refund: Math.max(0, n.paid - n.aggregate),
  };
  return { json: issues.length ? null : json, issues, summary };
}
