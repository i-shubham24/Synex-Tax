import { clean, n0, sum, type ItrIssue } from '../itrCommon.js';

/**
 * Sale of land or building and the reinvestment exemptions for AY 2026-27 (transfers in 2025-26),
 * written to Schedule CG items A1 (short-term) and B1 (long-term) and table D of the ITR-2 and ITR-3
 * schemas for AY 2026-27, as the notified forms lay them out.
 *
 * - Short-term or long-term: land or building held for more than 24 months is long-term (section 2(42A)).
 * - Full value of consideration: the stamp duty value where it exceeds 110% of the consideration, otherwise
 *   the consideration (section 50C(1) and its third proviso).
 * - Long-term gain under section 112(1)(a)(ii)(B): 12.5% on the gain without indexation (section 48 as
 *   amended by the Finance (No. 2) Act 2024). Second proviso to 112(1)(a): for a resident individual or HUF
 *   and land or building acquired before 23 July 2024, the gain with indexation at 20% is worked too and
 *   the excess of the first tax over the second is ignored (form items B1ca, B1ea, B1ei(A), B1ei(B), B1eii;
 *   validation rules 569 to 572 and 582 to 584 of ITR-2). No loss with indexation is carried anywhere.
 * - Indexation: Cost Inflation Index under section 48 Explanation (v), CBDT notifications (base year
 *   2001-02 = 100, Notification 44/2017; 2025-26 = 376, Notification 70/2025). Cost of an asset acquired
 *   before 1 Apr 2001 may be its fair market value on that date (section 55(2)(b)); improvements before
 *   that date are ignored (section 55(1)(b)).
 * - Exemptions: section 54 (long-term residential house into a new house, cost above Rs 10 crore ignored,
 *   first proviso to 54(1)), 54B (land used for agriculture into new agricultural land), 54EC (long-term
 *   land or building into specified bonds within six months, at most Rs 50 lakh, validation rule 591),
 *   54F (long-term asset other than a residential house into a house, gain x cost of the new house (at
 *   most Rs 10 crore) / net consideration, only where no more than one other house is owned on the date
 *   of transfer). Deposits in the Capital Gains Accounts Scheme before the due date count as invested
 *   (sections 54(2), 54B(2), 54F(4)). Section 54EE is not in the AY 2026-27 schemas.
 */

/** Cost Inflation Index by financial year (CBDT notifications under section 48 Explanation (v)). */
export const CII: Record<string, number> = {
  '2001-02': 100, '2002-03': 105, '2003-04': 109, '2004-05': 113, '2005-06': 117, '2006-07': 122, '2007-08': 129, '2008-09': 137,
  '2009-10': 148, '2010-11': 167, '2011-12': 184, '2012-13': 200, '2013-14': 220, '2014-15': 240, '2015-16': 254, '2016-17': 264,
  '2017-18': 272, '2018-19': 280, '2019-20': 289, '2020-21': 301, '2021-22': 317, '2022-23': 331, '2023-24': 348, '2024-25': 363,
  '2025-26': 376,
};

/** Financial year (YYYY-YY) of a date; dates before 1 Apr 2001 map to 2001-02, the base year. */
export function financialYear(iso: string) {
  const y = Number(iso.slice(0, 4));
  const start = iso.slice(5) >= '04-01' ? y : y - 1;
  if (start < 2001) return '2001-02';
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export const indexed = (cost: number, fy: string) => Math.round((cost * 376) / (CII[fy] ?? 376));

const addMonths = (iso: string, m: number) => {
  const d = new Date(Date.parse(`${iso}T00:00:00Z`));
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.toISOString().slice(0, 10);
};

export interface ReinvestmentClaim {
  section: '54' | '54B' | '54EC' | '54F';
  /** Cost of the new house or agricultural land, or amount put into bonds under 54EC, within the time allowed. */
  invested: number;
  investedOn?: string;
  /** Deposit in the Capital Gains Accounts Scheme before the due date under section 139(1). */
  deposited?: number;
  depositedOn?: string;
  account?: string;
  ifsc?: string;
  /** 54F only: on the date of transfer the assessee owned no more than one residential house other than the new one. */
  atMostOneOtherHouse?: boolean;
}

export interface PropertySale {
  /** RESIDENTIAL_HOUSE for section 54, AGRI_LAND (used for agriculture in the two years before) for 54B, OTHER land or building. */
  asset: 'RESIDENTIAL_HOUSE' | 'AGRI_LAND' | 'OTHER';
  acquiredOn: string;
  soldOn: string;
  consideration: number;
  /** Value adopted or assessed by the stamp valuation authority (section 50C). */
  stampValue: number;
  /** Cost of acquisition, or the fair market value on 1 Apr 2001 for an asset acquired earlier (section 55(2)(b)). */
  cost: number;
  improvements?: { year: string; amount: number }[];
  expenses?: number;
  claims?: ReinvestmentClaim[];
  address: string;
  stateCode: string;
  pin: string;
  buyers: { name: string; pan?: string; aadhaar?: string; share: number; amount: number }[];
}

const DATE_FY = /^2025-(0[4-9]|1[0-2])-\d{2}$|^2026-0[1-3]-\d{2}$/;

function claimAmount(c: ReinvestmentClaim, gain: number, netConsideration: number) {
  const put = n0(c.invested) + n0(c.deposited);
  if (c.section === '54EC') return Math.min(gain, n0(c.invested), 5000000);
  if (c.section === '54B') return Math.min(gain, put);
  if (c.section === '54') return Math.min(gain, Math.min(put, 100000000));
  // 54F(1): gain x cost of the new asset / net consideration; whole gain where the cost is not less than it.
  const cost = Math.min(put, 100000000);
  return netConsideration <= 0 || cost >= netConsideration ? gain : Math.min(gain, Math.round((gain * cost) / netConsideration));
}

/** Exemption under 54F for a long-term asset other than land or building (shares, units, other assets). */
export function exemption54F(gain: number, netConsideration: number, c: ReinvestmentClaim | undefined) {
  return c && gain > 0 ? claimAmount(c, gain, netConsideration) : 0;
}

export function claimIssues(c: ReinvestmentClaim, where: string, longTerm: boolean, asset: PropertySale['asset'] | 'NON_PROPERTY'): string[] {
  const out: string[] = [];
  if (c.section === '54' && (asset !== 'RESIDENTIAL_HOUSE' || !longTerm)) out.push(`${where}: section 54 applies to a long-term residential house only.`);
  if (c.section === '54B' && asset !== 'AGRI_LAND') out.push(`${where}: section 54B applies to land used for agriculture in the two years before transfer.`);
  if (c.section === '54EC' && (asset === 'NON_PROPERTY' || !longTerm)) out.push(`${where}: section 54EC applies to long-term land or building only.`);
  if (c.section === '54EC' && n0(c.invested) > 5000000) out.push(`${where}: investment under section 54EC cannot exceed Rs 50 lakh (validation rule 591).`);
  if (c.section === '54F' && (asset === 'RESIDENTIAL_HOUSE' || !longTerm)) out.push(`${where}: section 54F applies to a long-term asset other than a residential house.`);
  if (c.section === '54F' && !c.atMostOneOtherHouse) out.push(`${where}: section 54F needs confirmation that no more than one other residential house was owned on the date of transfer.`);
  if (n0(c.deposited) > 0 && (!c.account || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(c.ifsc ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(c.depositedOn ?? ''))) out.push(`${where}: a Capital Gains Accounts Scheme deposit needs the account number, IFSC and date.`);
  return out;
}

export type DeducRow = { section: ReinvestmentClaim['section']; transferOn: string; claim: ReinvestmentClaim; amount: number };

export function propertySale(s: PropertySale, resident: boolean, k: number) {
  const issues: ItrIssue[] = [];
  const err = (m: string) => issues.push({ field: 'propertySales', message: `Property ${k + 1}: ${m}` });
  if (!DATE_FY.test(s.soldOn)) err(`date of transfer ${s.soldOn} is not in 2025-26.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.acquiredOn) || s.acquiredOn >= s.soldOn) err('date of acquisition must be before the date of transfer.');
  if (!s.buyers.length) err('buyer details are required for a transfer of immovable property.');
  const buyerTotal = sum(s.buyers.map((b) => n0(b.amount)));
  if (s.buyers.length && Math.abs(sum(s.buyers.map((b) => b.share)) - 100) > 0.01) err('buyer shares must add up to 100%.');
  if (!/^[1-9]\d{5}$/.test(s.pin)) err('PIN code of the property must be 6 digits.');
  const longTerm = s.soldOn > addMonths(s.acquiredOn, 24);
  const consideration = n0(s.consideration);
  const stamp = n0(s.stampValue);
  // Section 50C(1) third proviso: the consideration stands where the stamp value is not above 110% of it.
  const fullValue = stamp > consideration * 1.1 ? stamp : consideration;
  if (buyerTotal && buyerTotal !== consideration) err('amounts against buyers must add up to the consideration.');
  const cost = n0(s.cost);
  const imps = (s.improvements ?? []).filter((x) => n0(x.amount) > 0);
  for (const x of imps) if (!(x.year in CII)) err(`year of improvement ${x.year} must be from 2001-02 to 2025-26 (improvements before 1 Apr 2001 are ignored, section 55(1)(b)).`);
  const impTotal = sum(imps.map((x) => n0(x.amount)));
  const exp = n0(s.expenses);
  const claims = s.claims ?? [];
  for (const c of claims) for (const m of claimIssues(c, `Property ${k + 1}`, longTerm, s.asset)) issues.push({ field: 'propertySales', message: m });
  const gainPlain = fullValue - cost - impTotal - exp;
  const netConsideration = consideration - exp;
  let left = Math.max(0, gainPlain);
  const deduc: DeducRow[] = claims.map((c) => { const a = Math.min(left, claimAmount(c, left, netConsideration)); left -= a; return { section: c.section, transferOn: s.soldOn, claim: c, amount: a }; });
  const exemptTotal = sum(deduc.map((x) => x.amount));
  const address = { AddressOfProperty: clean(s.address, 250), StateCode: s.stateCode, CountryCode: '91', PinCode: Number(s.pin) };
  const buyers = { TrnsfImmblPrprtyDtls: s.buyers.map((b) => ({ NameOfBuyer: clean(b.name, 125), ...(b.pan ? { PANofBuyer: b.pan } : {}), ...(b.aadhaar ? { AaadhaarOfBuyer: b.aadhaar } : {}), PercentageShare: b.share, Amount: n0(b.amount), ...address })) };

  if (!longTerm) {
    const income = gainPlain - exemptTotal;
    return {
      longTerm, issues, gain: income, excess: 0, deduc, fullValue,
      row: {
        DateofPurchase: s.acquiredOn, DateofSale: s.soldOn, FullConsideration: consideration, PropertyValuation: stamp, FullConsideration50C: fullValue,
        AquisitCost: cost, ImproveCost: impTotal, ExpOnTrans: exp, TotalDedn: cost + impTotal + exp, Balance: gainPlain, DeductionUs54B: exemptTotal, STCGonImmvblPrprty: income,
        ...(s.buyers.length ? { TrnsfImmblPrprty: buyers } : {}),
      },
    };
  }
  // Second proviso to 112(1)(a): resident individual or HUF, acquired before 23 July 2024.
  const proviso = resident && s.acquiredOn < '2024-07-23';
  const fyAcq = financialYear(s.acquiredOn);
  const costIdx = proviso ? indexed(cost, fyAcq) : 0;
  const impRows = imps.map((x, n) => ({ slno: n + 1, ImproveCost: n0(x.amount), ImproveDate: x.year, CostOfImpIndex: proviso ? indexed(n0(x.amount), x.year) : 0 }));
  const impIdx = sum(impRows.map((x) => x.CostOfImpIndex));
  const dednIdx = costIdx + impIdx + exp; // biva
  const balIdx = Math.max(0, fullValue - dednIdx); // 1ca, nil if negative
  const e = gainPlain - exemptTotal; // B1e
  const ea = Math.max(0, balIdx - exemptTotal); // B1ea
  const taxA = proviso ? Math.round(Math.max(0, e) * 0.125) : 0; // B1ei(A)
  const taxB = proviso ? Math.round(ea * 0.2) : 0; // B1ei(B)
  const excess = proviso ? Math.max(0, taxA - taxB) : 0; // B1eii
  return {
    longTerm, issues, gain: e, excess, deduc, fullValue,
    row: {
      FullConsideration: consideration, DateofPurchase: s.acquiredOn, DateofSale: s.soldOn, PropertyValuation: stamp, FullConsideration50C: fullValue,
      AquisitCost: cost, AquisitCostIndex: costIdx,
      ...(impRows.length ? { CostOfImprovements: { CostOfImprovementsDtls: impRows, TotalImprovecost: impTotal, TotalindexImprovecost: impIdx } } : {}),
      ExpOnTrans: exp, TotalDedn: cost + impTotal + exp, ...(proviso ? { TotalDednForEiB: dednIdx } : {}),
      Balance: gainPlain, ...(proviso ? { BalanceForEiB: balIdx } : {}),
      ExemptionOrDednUs54: { ...(deduc.some((x) => x.amount > 0) ? { ExemptionOrDednUs54Dtls: deduc.filter((x) => x.amount > 0).map((x) => ({ ExemptionSecCode: x.section, ExemptionAmount: x.amount })) } : {}), ExemptionGrandTotal: exemptTotal },
      LTCGonImmvblPrprty: e,
      ...(proviso ? { LTCGonImmvblPrprtyBE: ea, TaxSec1121aiiB: taxA, TaxSec1121a: taxB, ExcessAmtSec1121a: excess } : {}),
      ...(s.buyers.length ? { TrnsfImmblPrprty: buyers } : {}),
    },
  };
}

/** Table D of Schedule CG (DeducClaimInfo) from the claims made on all sales. */
export function deducClaimInfo(rows: DeducRow[]) {
  const used = rows.filter((x) => x.amount > 0);
  const base = (x: DeducRow) => ({
    DateofTransfer: x.transferOn,
    ...(n0(x.claim.deposited) ? { AmtDeposited: n0(x.claim.deposited), DepositDate: x.claim.depositedOn, AccountNo: clean(x.claim.account, 20), IFSC: x.claim.ifsc } : {}),
    AmtDeducted: x.amount,
  });
  const house = (x: DeducRow) => ({ ...base(x), ...(n0(x.claim.invested) ? { CostofNewResHouse: n0(x.claim.invested), ...(x.claim.investedOn ? { DateofPurchase: x.claim.investedOn } : {}) } : {}) });
  const of = (s: ReinvestmentClaim['section']) => used.filter((x) => x.section === s);
  return {
    ...(of('54').length ? { DeducClaimDtlsUs54: of('54').map(house) } : {}),
    ...(of('54B').length ? { DeducClaimDtlsUs54B: of('54B').map((x) => ({ ...base(x), ...(n0(x.claim.invested) ? { CostofNewAgriLand: n0(x.claim.invested), ...(x.claim.investedOn ? { DateofPurchase: x.claim.investedOn } : {}) } : {}) })) } : {}),
    ...(of('54EC').length ? { DeducClaimDtlsUs54EC: of('54EC').map((x) => ({ DateofTransfer: x.transferOn, AmtInvested: n0(x.claim.invested), ...(x.claim.investedOn ? { DateofInvestment: x.claim.investedOn } : {}), AmtDeducted: x.amount })) } : {}),
    ...(of('54F').length ? { DeducClaimDtlsUs54F: of('54F').map(house) } : {}),
    TotDeductClaim: sum(used.map((x) => x.amount)),
  };
}
