import { clean, n0, sum, type ItrIssue } from '../itrCommon.js';
import { deducClaimInfo, exemption54F, claimIssues, propertySale, type DeducRow, type PropertySale, type ReinvestmentClaim } from './capitalGainsProperty.js';
import { scheduleVda, type VdaTransfer } from './otherSchedules.js';

/**
 * Schedule CG, Schedule 112A and Schedule VDA for the ITR-2 and ITR-3 writers (AY 2026-27), with the set-off
 * of current-year capital losses within the head (section 70) as Table E of Schedule CG lays it out.
 */

export interface CgSale {
  /** 111A: listed equity or equity fund units held up to 12 months, STT paid. 112A: the same held longer. STCG and LTCG: other assets (not land or building). */
  kind: '111A' | '112A' | 'STCG' | 'LTCG';
  date: string; // date of transfer, YYYY-MM-DD in 2025-26
  saleValue: number; cost: number; improvement?: number; expenses?: number;
  /** 112A only */
  isin?: string; name?: string; acquiredBefore1Feb2018?: boolean; fmv31Jan2018?: number;
  /** 112A and LTCG: reinvestment in a residential house under section 54F. */
  exemption54F?: ReinvestmentClaim;
}

/** Gain on one sale; for 112A the cost of an asset bought before 1 Feb 2018 is the higher of cost and the lower of its 31 Jan 2018 value and the sale value (55(2)(ac)). */
export function cgGain(s: CgSale) {
  const sale = n0(s.saleValue);
  const fmvCap = s.kind === '112A' && s.acquiredBefore1Feb2018 ? Math.min(n0(s.fmv31Jan2018), sale) : 0;
  const cost = Math.max(n0(s.cost), fmvCap);
  return { sale, cost, fmvCap, improvement: n0(s.improvement), expenses: n0(s.expenses), gain: sale - cost - n0(s.improvement) - n0(s.expenses) };
}

export const CG_PERIODS = [['Upto15Of6', '06-15'], ['Upto15Of9', '09-15'], ['Up16Of9To15Of12', '12-15'], ['Up16Of12To15Of3', '03-15'], ['Up16Of3To31Of3', '03-31']] as const;
/** Quarter of Table F (and of the advance tax instalments) in which a date of 2025-26 falls. */
export const periodOf = (date: string) => {
  const md = date.slice(5);
  if (date.slice(0, 4) === '2025') return md <= '06-15' ? 0 : md <= '09-15' ? 1 : md <= '12-15' ? 2 : 3;
  return md <= '03-15' ? 3 : 4;
};
export const zeroRange = () => ({ DateRange: Object.fromEntries(CG_PERIODS.map(([k]) => [k, 0])) as Record<string, number> });
/** Income of a category after set-off spread over the quarters in which gains arose (rule: break-up equals the income). */
export function spreadAmounts(income: number, gainsByPeriod: number[]) {
  const r = [0, 0, 0, 0, 0];
  let left = income;
  gainsByPeriod.forEach((g, k) => { const t = Math.min(left, Math.max(0, g)); r[k] = t; left -= t; });
  if (left > 0) r[4] += left;
  return r;
}
export const rangeOf = (amounts: number[]) => ({ DateRange: Object.fromEntries(CG_PERIODS.map(([k], n) => [k, amounts[n]])) as Record<string, number> });

const ded48 = (cost: number, improvement: number, expenses: number) => ({ AquisitCost: cost, ImproveCost: improvement, ExpOnTrans: expenses, TotalDedn: cost + improvement + expenses });
const DATE_FY = /^2025-(0[4-9]|1[0-2])-\d{2}$|^2026-0[1-3]-\d{2}$/;

export function capitalGains(o: { form: 'ITR-2' | 'ITR-3'; sales: CgSale[]; property: PropertySale[]; vda: VdaTransfer[] }) {
  const issues: ItrIssue[] = [];
  const err = (field: string, message: string) => issues.push({ field, message });
  const sales = o.sales.map((s) => ({ s, g: cgGain(s) }));
  for (const { s } of sales) {
    if (!DATE_FY.test(s.date)) err('capitalGains', `Transfer date ${s.date} is not in 2025-26.`);
    if (s.kind === '112A' && !/^IN[0-9A-Z]{10}$/.test(s.isin ?? '')) err('capitalGains', `${s.name ?? 'A 112A sale'} needs its ISIN for Schedule 112A.`);
    if (s.exemption54F) for (const m of claimIssues(s.exemption54F, s.name ?? `Sale of ${s.date}`, s.kind === '112A' || s.kind === 'LTCG', 'NON_PROPERTY')) err('capitalGains', m);
    if (s.exemption54F && s.exemption54F.section !== '54F') err('capitalGains', 'Only section 54F applies to a sale other than land or building.');
  }
  // Section 54F on shares, units and other long-term assets: gain x cost of the new house / net consideration.
  const f54 = sales.map(({ s, g }) => (s.kind === '112A' || s.kind === 'LTCG' ? exemption54F(Math.max(0, g.gain), g.sale - g.expenses, s.exemption54F) : 0));
  const deduc: DeducRow[] = [];
  sales.forEach(({ s }, k) => { if (s.exemption54F && f54[k] > 0) deduc.push({ section: '54F', transferOn: s.date, claim: s.exemption54F, amount: f54[k] }); });
  const props = o.property.map((p, k) => propertySale(p, true, k));
  for (const p of props) issues.push(...p.issues);
  deduc.push(...props.flatMap((p) => p.deduc));
  const stProps = props.filter((p) => !p.longTerm);
  const ltProps = props.filter((p) => p.longTerm);
  const excess = sum(ltProps.map((p) => p.excess)); // B1h
  const vda = scheduleVda(o.vda);
  issues.push(...vda.issues);

  const idx = (k: CgSale['kind']) => sales.map((x, n) => ({ ...x, f54: f54[n] })).filter((x) => x.s.kind === k);
  const net = (k: CgSale['kind']) => sum(idx(k).map((x) => x.g.gain - x.f54));
  const stLand = sum(stProps.map((p) => p.gain));
  const ltLand = sum(ltProps.map((p) => p.gain));
  const st20Raw = net('111A'), stAppRaw = net('STCG') + stLand, ltARaw = net('112A'), ltORaw = net('LTCG') + ltLand;
  const byPeriodOf = (ks: CgSale['kind'][]) => CG_PERIODS.map((_, n) => sum(ks.flatMap(idx).filter((x) => periodOf(x.s.date) === n).map((x) => x.g.gain - x.f54)));
  // Gains by quarter, with property sales added by their dates.
  const landByPeriod = (lt: boolean) => CG_PERIODS.map((_, n) => sum(props.map((p, k) => (p.longTerm === lt && periodOf(o.property[k].soldOn) === n ? p.gain : 0))));
  const periods = {
    st20: byPeriodOf(['111A']),
    stApp: byPeriodOf(['STCG']).map((v, n) => v + landByPeriod(false)[n]),
    lt: byPeriodOf(['112A', 'LTCG']).map((v, n) => v + landByPeriod(true)[n]),
    vda: CG_PERIODS.map((_, n) => sum(vda.rows.filter((r) => periodOf(r._date) === n).map((r) => r.IncomeFromVDA))),
  };

  // 12.5% row nets 112A and 112 (one row in the schema); a loss in one is set against the other.
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
  const after = { st20, stApp, ltA, ltO, lt: ltA + ltO };

  // Schedule CG items.
  const agg = (k: CgSale['kind']) => idx(k).reduce((a, x) => ({ sale: a.sale + x.g.sale, cost: a.cost + x.g.cost, imp: a.imp + x.g.improvement, exp: a.exp + x.g.expenses, f54: a.f54 + x.f54 }), { sale: 0, cost: 0, imp: 0, exp: 0, f54: 0 });
  const zero94 = () => ({ FullValueConsdRecvUnqshr: 0, FairMrktValueUnqshr: 0, FullValueConsdSec50CA: 0, FullValueConsdOthUnqshr: 0, FullConsideration: 0, DeductSec48: ded48(0, 0, 0), BalanceCG: 0, LossSec94of7Or94of8: 0, CapgainonAssets: 0 });
  const a111 = agg('111A'), aSt = agg('STCG'), aLt = agg('LTCG'), a112A = agg('112A');
  const itr3 = o.form === 'ITR-3';
  const rows112A = idx('112A');
  const sch112ARows = rows112A.map(({ s, g }) => ({
    ShareOnOrBefore: s.acquiredBefore1Feb2018 ? 'BE' : 'AE', ISINCode: s.isin, ShareUnitName: clean(s.name || s.isin, 125),
    TotSaleValue: g.sale, CostAcqWithoutIndx: n0(s.cost), AcquisitionCost: g.cost, [itr3 ? 'LTCGBeforelower6and11' : 'LTCGBeforelowerB1B2']: g.fmvCap,
    FairMktValuePerShareunit: 0, TotFairMktValueCapAst: s.acquiredBefore1Feb2018 ? n0(s.fmv31Jan2018) : 0, ExpExclCnctTransfer: g.expenses + g.improvement,
    TotalDeductions: g.cost + g.expenses + g.improvement, Balance: g.gain,
  }));
  const sumRow = (k: string) => sum(sch112ARows.map((r) => Number((r as Record<string, unknown>)[k])));
  const schedule112A = rows112A.length ? {
    Schedule112ADtls: sch112ARows, SaleValue112A: sumRow('TotSaleValue'), CostAcqWithoutIndx112A: sumRow('CostAcqWithoutIndx'), AcquisitionCost112A: sumRow('AcquisitionCost'),
    LTCGBeforelowerB1B2112A: sumRow(itr3 ? 'LTCGBeforelower6and11' : 'LTCGBeforelowerB1B2'), FairMktValueCapAst112A: sumRow('TotFairMktValueCapAst'), ExpExclCnctTransfer112A: sumRow('ExpExclCnctTransfer'),
    Deductions112A: sumRow('TotalDeductions'), Balance112A: sumRow('Balance'), ...(itr3 ? {} : { TotalBalance112A: sumRow('Balance') }),
  } : undefined;

  const otherSt = {
    FullValueConsdRecvUnqshr: 0, FairMrktValueUnqshr: 0, FullValueConsdSec50CA: 0, FullValueConsdOthUnqshr: aSt.sale, FullConsideration: aSt.sale,
    DeductSec48: ded48(aSt.cost, aSt.imp, aSt.exp), BalanceCG: aSt.sale - aSt.cost - aSt.imp - aSt.exp, LossSec94of7Or94of8: 0,
    ...(itr3 ? { DeemedStcgOnAssets: 0, ExemptionOrDednUs54: { ExemptionGrandTotal: 0 } } : {}), CapgainonAssets: net('STCG'),
  };
  const cgIncome = after.st20 + after.stApp + after.lt;
  const scheduleCG = {
    ShortTermCapGainFor23: {
      ...(itr3 ? { SlumpSaleInStcg: { FMV11UAEii: 0, FMV11UAEiii: 0, FullConsideration: 0, NetWorthOfDivision: 0, CapgainonAssets: 0 } } : {}),
      ...(stProps.length ? { SaleofLandBuild: { SaleofLandBuildDtls: stProps.map((p) => p.row) } } : {}),
      ...(a111.sale ? { EquityMFonSTT: [{ MFSectionCode: '1A', EquityMFonSTTDtls: { FullConsideration: a111.sale, DeductSec48: ded48(a111.cost, a111.imp, a111.exp), BalanceCG: st20Raw, LossSec94of7Or94of8: 0, CapgainonAssets: st20Raw } }] } : {}),
      NRITransacSec48Dtl: { NRItaxSTTPaid: 0, NRItaxSTTNotPaid: 0 },
      NRISecur115AD: zero94(),
      SaleOnOtherAssets: aSt.sale || itr3 ? otherSt : zero94(),
      TotalAmtDeemedStcg: 0, PassThrIncNatureSTCG: 0, TotalAmtNotTaxUsDTAAStcg: 0, TotalAmtTaxUsDTAAStcg: 0,
      TotalSTCG: st20Raw + stAppRaw,
    },
    LongTermCapGain23: {
      ...(itr3 ? { SlumpSaleInLtcgDtls: {} } : {}),
      ...(ltProps.length ? { SaleofLandBuild: { SaleofLandBuildDtls: ltProps.map((p) => p.row), TotalLTCGImmblPrprty: ltLand, TotalExcessTax: excess } } : {}),
      SaleOfEquityShareUs112A: { BalanceCG: a112A.sale - a112A.cost - a112A.imp - a112A.exp, DeductionUs54F: a112A.f54, CapgainonAssets: ltARaw },
      NRISaleOfEquityShareUs112A: { BalanceCG: 0, DeductionUs54F: 0, CapgainonAssets: 0 },
      NRISaleofForeignAsset: { SaleonSpecAsset: 0, DednSpecAssetus115: 0, BalonSpeciAsset: 0 },
      SaleofAssetNADtls: aLt.sale ? {
        SaleofAssetNA: {
          FullValueConsdRecvUnqshr: 0, FairMrktValueUnqshr: 0, FullValueConsdSec50CA: 0, FullValueConsdOthUnqshr: aLt.sale, FullConsideration: aLt.sale,
          DeductSec48: ded48(aLt.cost, aLt.imp, aLt.exp), BalanceCG: aLt.sale - aLt.cost - aLt.imp - aLt.exp, DeductionUs54F: aLt.f54, CapgainonAssets: net('LTCG'),
        },
      } : {},
      TotalAmtDeemedLtcg: 0, PassThrIncNatureLTCG: 0, TotalAmtNotTaxUsDTAALtcg: 0, TotalAmtTaxUsDTAALtcg: 0,
      TotalLTCG: ltARaw + ltORaw,
    },
    SumOfCGIncm: cgIncome,
    IncmFromVDATrnsf: vda.total,
    TotScheduleCGFor23: cgIncome + vda.total,
    ...(deduc.some((x) => x.amount > 0) || itr3 ? { DeducClaimInfo: deducClaimInfo(deduc) } : {}),
    CurrYrLosses: {
      InLossSetOff: { StclSetoff20Per: Math.max(0, -st20Raw), StclSetoff30Per: 0, StclSetoffAppRate: Math.max(0, -stAppRaw), StclSetoffDTAARate: 0, LtclSetOff12_5Per: ltLoss, LtclSetOffDTAARate: 0 },
      InStcg20Per: { CurrYearIncome: Math.max(0, st20Raw), StclSetoff30Per: 0, StclSetoffAppRate: so.appIn20, StclSetoffDTAARate: 0, CurrYrCapGain: after.st20 },
      InStcg30Per: { CurrYearIncome: 0, StclSetoff20Per: 0, StclSetoffAppRate: 0, StclSetoffDTAARate: 0, CurrYrCapGain: 0 },
      InStcgAppRate: { CurrYearIncome: Math.max(0, stAppRaw), StclSetoff20Per: so.s20InApp, StclSetoff30Per: 0, StclSetoffDTAARate: 0, CurrYrCapGain: after.stApp },
      InStcgDTAARate: { CurrYearIncome: 0, StclSetoff20Per: 0, StclSetoff30Per: 0, StclSetoffAppRate: 0, CurrYrCapGain: 0 },
      InLtcg12_5Per: { CurrYearIncome: ltBefore, StclSetoff20Per: so.s20InLt, StclSetoff30Per: 0, StclSetoffAppRate: so.appInLt, StclSetoffDTAARate: 0, LtclSetOffDTAARate: 0, CurrYrCapGain: after.lt },
      InLtcgDTAARate: { CurrYearIncome: 0, StclSetoff20Per: 0, StclSetoff30Per: 0, StclSetoffAppRate: 0, StclSetoffDTAARate: 0, LtclSetOff12_5Per: 0, CurrYrCapGain: 0 },
      TotLossSetOff: { StclSetoff20Per: so.s20InApp + so.s20InLt, StclSetoff30Per: 0, StclSetoffAppRate: so.appIn20 + so.appInLt, StclSetoffDTAARate: 0, LtclSetOff12_5Per: 0, LtclSetOffDTAARate: 0 },
      LossRemainSetOff: { StclSetoff20Per: st20Loss, StclSetoff30Per: 0, StclSetoffAppRate: stAppLoss, StclSetoffDTAARate: 0, LtclSetOff12_5Per: ltLoss, LtclSetOffDTAARate: 0 },
    },
  };
  /** Table F: income of each category after all set-offs (as in Schedule BFLA), by the quarter it arose. */
  const tableF = (fin: { st20: number; stApp: number; lt: number }) => {
    const q = { st20: spreadAmounts(fin.st20, periods.st20), stApp: spreadAmounts(fin.stApp, periods.stApp), lt: spreadAmounts(fin.lt, periods.lt), vda: spreadAmounts(vda.total, periods.vda) };
    return {
      quarters: q,
      table: {
        ShortTermUnder20Per: rangeOf(q.st20), ShortTermUnder30Per: zeroRange(), ShortTermUnderAppRate: rangeOf(q.stApp),
        ShortTermUnderDTAARate: zeroRange(), LongTermUnder12_5Per: rangeOf(q.lt), LongTermUnderDTAARate: zeroRange(),
        ...(vda.total || itr3 ? { VDATrnsfGainsUnder30Per: rangeOf(q.vda) } : {}),
      },
    };
  };
  return {
    issues, any: sales.length + props.length > 0, scheduleCG, schedule112A, tableF, excess, vda,
    raw: { st20Raw, stAppRaw, ltARaw, ltORaw }, ltBefore, after, st20Loss, stAppLoss, ltLoss, stclCarried: st20Loss + stAppLoss,
    reduceLt: (amt: number) => reduceLt(amt), current: () => ({ ltA, ltO }),
  };
}
