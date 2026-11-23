import { n0, sum, type ItrIssue } from '../itrCommon.js';

/**
 * Losses and depreciation of earlier years for AY 2026-27 (Schedules BFLA, CFL and UD of ITR-2 and ITR-3),
 * taken as entered from the earlier years' returns.
 *
 * - House property loss: against house property income only, for 8 assessment years (section 71B).
 * - Short-term capital loss: against any capital gain; long-term capital loss: against long-term gain only;
 *   8 assessment years (section 74(1)). Neither goes against gains on virtual digital assets (115BBH(2)(b)).
 * - Business loss other than speculation: against business income, for 8 assessment years (section 72(1)
 *   and 72(3)), set off before unabsorbed depreciation (section 72(2)).
 * - Speculation loss: against speculation income only, for 4 assessment years (section 73(2) and 73(4)).
 * - Unabsorbed depreciation: no time limit, added to the depreciation of the year (section 32(2)); this
 *   file sets it against business income first and then against other heads except salaries (sections
 *   32(2), 71(1) and 71(2A)), never against gains on virtual digital assets.
 * - Section 80: business, speculation and capital losses are carried forward only where the return of the
 *   year of loss was filed within the time under section 139(3); the house property loss and unabsorbed
 *   depreciation are not subject to it.
 * - Section 115BAC(2)(ii): in the new regime, a loss or depreciation attributable to a deduction the regime
 *   does not allow cannot be set off; the amount so adjusted is entered per year (CFL column 5b, UD column 3a).
 * Losses are used oldest year first, since they lapse first. Where the Act leaves the order to the assessee,
 * this file reduces short-term gains at normal rates, then at 20%, then long-term gains under section 112
 * before 112A (which keeps the Rs 1.25 lakh exemption of 112A in use).
 */

export interface BroughtForwardYear {
  /** Assessment year of the loss, for example 2021-22. */
  ay: string;
  /** Date the return of that year was filed (Schedule CFL column 2). */
  filedOn: string;
  /** Return of that year filed within the time under section 139(3) (section 80). */
  filedInTime: boolean;
  hp?: number;
  stcl?: number;
  ltcl?: number;
  /** ITR-3: business loss other than speculation and specified business, as brought forward (column 5a). */
  business?: number;
  /** ITR-3: part of it adjusted on opting for section 115BAC(1A) (column 5b). */
  business115BAC?: number;
  /** ITR-3: speculation business loss. */
  speculation?: number;
}

export interface UnabsorbedDepreciation { ay: string; amount: number; adjusted115BAC?: number }

/** Income of the year after set-off of current-year losses (Schedule CYLA), by row. */
export interface IncomeAfterCyla { sal: number; hp: number; bp: number; spec: number; st20: number; stApp: number; ltO: number; ltA: number; os: number }

const AYS = ['2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26'];

export function setOffBroughtForward(inc: IncomeAfterCyla, years: BroughtForwardYear[], ud: UnabsorbedDepreciation[], form: 'ITR-2' | 'ITR-3') {
  const issues: ItrIssue[] = [];
  const err = (m: string) => issues.push({ field: 'lossesBroughtForward', message: m });
  const seen = new Set<string>();
  const rows = [...years].sort((a, b) => a.ay.localeCompare(b.ay));
  for (const y of rows) {
    if (!AYS.includes(y.ay)) err(`Losses of AY ${y.ay} cannot be carried to AY 2026-27: the limit is 8 assessment years (sections 71B, 72(3), 74).`);
    if (seen.has(y.ay)) err(`AY ${y.ay} is entered twice.`);
    seen.add(y.ay);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(y.filedOn)) err(`AY ${y.ay}: date of filing of that return is required (Schedule CFL).`);
    if (!y.filedInTime && (n0(y.stcl) || n0(y.ltcl) || n0(y.business) || n0(y.speculation))) err(`AY ${y.ay}: business and capital losses are carried forward only where that return was filed within the time under section 139(3) (section 80).`);
    if (n0(y.speculation) && y.ay < '2022-23') err(`AY ${y.ay}: a speculation loss is carried forward for 4 assessment years only (section 73(4)).`);
    if (form === 'ITR-2' && (n0(y.business) || n0(y.speculation))) err('Business losses are not part of ITR-2; use ITR-3.');
    if (n0(y.business115BAC) > n0(y.business)) err(`AY ${y.ay}: the amount adjusted under section 115BAC cannot exceed the business loss brought forward.`);
  }
  if (form === 'ITR-2' && ud.length) err('Unabsorbed depreciation is not part of ITR-2; use ITR-3.');

  const left = { ...inc };
  const used = rows.map((y) => ({ y, hp: 0, st: 0, lt: 0, bus: 0, spec: 0 }));
  const setOff = { hp: 0, bp: 0, spec: 0, st20: 0, stApp: 0, ltO: 0, ltA: 0 };
  const take = (avail: number, keys: Array<keyof typeof setOff>) => {
    let total = 0;
    for (const k of keys) { const t = Math.min(avail - total, left[k]); left[k] -= t; setOff[k] += t; total += t; }
    return total;
  };
  for (const u of used) {
    u.hp = take(n0(u.y.hp), ['hp']);
    u.bus = take(n0(u.y.business) - n0(u.y.business115BAC), ['bp', 'spec']);
    u.spec = take(n0(u.y.speculation), ['spec']);
    u.st = take(n0(u.y.stcl), ['stApp', 'st20', 'ltO', 'ltA']);
    u.lt = take(n0(u.y.ltcl), ['ltO', 'ltA']);
  }
  // Unabsorbed depreciation (Schedule UD), oldest first.
  const depSet = { bp: 0, spec: 0, hp: 0, st20: 0, stApp: 0, ltO: 0, ltA: 0, os: 0 };
  const udRows = [...ud].sort((a, b) => a.ay.localeCompare(b.ay)).map((r) => {
    let avail = Math.max(0, n0(r.amount) - n0(r.adjusted115BAC));
    let usedHere = 0;
    for (const k of ['bp', 'spec', 'hp', 'os', 'stApp', 'st20', 'ltO', 'ltA'] as const) { const t = Math.min(avail, left[k]); left[k] -= t; depSet[k] += t; avail -= t; usedHere += t; }
    return { r, used: usedHere, balance: Math.max(0, n0(r.amount) - n0(r.adjusted115BAC)) - usedHere };
  });
  const lossTotal = sum(Object.values(setOff));
  const depTotal = sum(Object.values(depSet));
  return {
    issues, left, setOff, depSet, lossTotal, depTotal, used, udRows,
    /** CFL figures carried in from earlier years, used this year and remaining. */
    earlier: { hp: sum(rows.map((y) => n0(y.hp))), st: sum(rows.map((y) => n0(y.stcl))), lt: sum(rows.map((y) => n0(y.ltcl))), bus: sum(rows.map((y) => n0(y.business) - n0(y.business115BAC))), spec: sum(rows.map((y) => n0(y.speculation))) },
    adjusted: { hp: sum(used.map((u) => u.hp)), st: sum(used.map((u) => u.st)), lt: sum(used.map((u) => u.lt)), bus: sum(used.map((u) => u.bus)), spec: sum(used.map((u) => u.spec)) },
  };
}

export type BroughtForwardResult = ReturnType<typeof setOffBroughtForward>;

/** ITR-2 Schedule CFL key for an assessment year (8th earlier year first). */
export const ITR2_CFL_KEYS: Record<string, string> = {
  '2018-19': 'LossCFFromPrev8thYearFromAY', '2019-20': 'LossCFFromPrev7thYearFromAY', '2020-21': 'LossCFFromPrev6thYearFromAY', '2021-22': 'LossCFFromPrev5thYearFromAY',
  '2022-23': 'LossCFFromPrev4thYearFromAY', '2023-24': 'LossCFFromPrev3rdYearFromAY', '2024-25': 'LossCFFromPrev2ndYearFromAY', '2025-26': 'LossCFFromPrevYrToAY',
};

/** ITR-3 Schedule CFL key for an assessment year, matched to the schema's row types (rows ix to xvi of the form). */
export const ITR3_CFL_KEYS: Record<string, string> = {
  '2018-19': 'LossCFFromPrevYrToAY', '2019-20': 'LossCFCurrentAssmntYear', '2020-21': 'LossCFCurrentAssmntYear2021', '2021-22': 'LossCFCurrentAssmntYear2022',
  '2022-23': 'LossCFCurrentAssmntYear2023', '2023-24': 'LossCFCurrentAssmntYear2024', '2024-25': 'LossCFCurrentAssmntYear2025', '2025-26': 'LossCFCurrentAssmntYear2026',
};
