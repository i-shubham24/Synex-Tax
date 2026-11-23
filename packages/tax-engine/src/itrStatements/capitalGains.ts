import type { CgSale } from '../itr/itr2Json.js';
import { normLabel, parseAmount, parseDate, round2, type StatementIssue } from './common.js';

/**
 * Capital gains reports from brokers and registrars, read sale by sale into the CgSale rows the
 * ITR-2 and ITR-3 writers take: Zerodha Console (Tax P&L), Groww (stocks and mutual fund capital
 * gains reports), CAMS and KFintech (consolidated mutual fund capital gains statements). Columns
 * are found by their headings; a layout that is not recognised goes to a column-mapping step, as
 * on the bank page.
 *
 * Headings expected (from reports seen in practice; none of these providers publishes a
 * specification, so each is unconfirmed and matched loosely):
 * - Zerodha Console Tax P&L, equity sheet: Symbol, ISIN, Entry Date, Exit Date, Quantity, Buy Value,
 *   Sell Value, Profit, Period of Holding, Fair Market Value, Taxable Profit, with section rows for
 *   short term, long term and intraday trades. Intraday and F&O rows are business income, not
 *   capital gains, and are skipped. The reader takes the first worksheet only; if the trades are on
 *   another sheet, save that sheet as CSV.
 * - Groww: Stock name or Scheme Name, ISIN, Quantity or Units, Buy date or Purchase Date, Buy price,
 *   Buy value, Sell date or Redeem Date, Sell price, Sell value, Realised P&L, and for funds a
 *   category and the grandfathered NAV.
 * - CAMS and KFintech: Scheme Name, ISIN, Folio, then a "Redemption" block (Date, Units, Amount,
 *   Price) and a "Purchase" block (Date, Units, Amount, Price) under two-row headings, the
 *   grandfathered NAV or market value as on 31 Jan 2018, and short and long term gain columns.
 *
 * Classification, for transfers on or after 23 July 2024 (the Finance (No. 2) Act 2024 changes):
 * - Section 2(42A): a listed security, a unit of an equity oriented fund or of UTI is short-term
 *   when held for not more than 12 months before transfer; other assets (units of other funds)
 *   for not more than 24 months.
 * - Section 111A: short-term gain on equity shares listed and sold with STT, or units of an equity
 *   oriented fund (STT paid), taxed at 20%. Section 112A: the long-term gain on the same, 12.5%
 *   above Rs 1.25 lakh, with the cost of an asset bought before 1 Feb 2018 taken under section
 *   55(2)(ac) from its value on 31 Jan 2018.
 * - Section 50AA: units of a specified mutual fund (more than 65% in debt and money market
 *   instruments) acquired on or after 1 April 2023 give short-term gain whatever the holding.
 * - Section 112: other long-term gains, 12.5% without indexation.
 * Sales before 23 July 2024 fall outside Assessment Year 2026-27 and are not classified here.
 * STT is assumed paid on shares and equity fund units sold through these platforms; the review
 * table says so. The asset type of a fund comes from the report's category column when there is
 * one; otherwise the user picks it, since it depends on the fund's holdings.
 */

export type CgRole = 'name' | 'isin' | 'buyDate' | 'sellDate' | 'quantity' | 'buyValue' | 'sellValue' | 'buyPrice' | 'sellPrice' | 'fmvValue' | 'fmvPrice' | 'expenses' | 'assetClass' | 'gain' | 'ignore';

export const CG_ROLES: Array<{ role: CgRole; label: string }> = [
  { role: 'ignore', label: 'Not used' },
  { role: 'name', label: 'Scrip or scheme' },
  { role: 'isin', label: 'ISIN' },
  { role: 'buyDate', label: 'Buy date' },
  { role: 'sellDate', label: 'Sell date' },
  { role: 'quantity', label: 'Quantity or units' },
  { role: 'buyValue', label: 'Buy value (cost)' },
  { role: 'sellValue', label: 'Sell value' },
  { role: 'buyPrice', label: 'Buy price per unit' },
  { role: 'sellPrice', label: 'Sell price per unit' },
  { role: 'fmvValue', label: 'Value on 31 Jan 2018' },
  { role: 'fmvPrice', label: 'Price or NAV on 31 Jan 2018' },
  { role: 'expenses', label: 'Transfer expenses' },
  { role: 'assetClass', label: 'Asset class or category' },
  { role: 'gain', label: 'Gain as reported' },
];

export type CgSource = 'ZERODHA' | 'GROWW' | 'CAMS' | 'KFINTECH' | 'GENERIC';
export const CG_SOURCE_NAMES: Record<CgSource, string> = { ZERODHA: 'Zerodha Console', GROWW: 'Groww', CAMS: 'CAMS', KFINTECH: 'KFintech', GENERIC: 'Other report' };

/**
 * EQUITY_SHARE: listed equity share sold with STT. EQUITY_FUND: unit of an equity oriented fund.
 * SPECIFIED_FUND: unit of a fund with more than 65% in debt (section 50AA). OTHER_FUND: other fund
 * units (24 months). OTHER_LISTED: other listed security (12 months, section 112 when long-term).
 */
export type CgAssetType = 'EQUITY_SHARE' | 'EQUITY_FUND' | 'SPECIFIED_FUND' | 'OTHER_FUND' | 'OTHER_LISTED' | 'UNKNOWN';
export const CG_ASSET_NAMES: Record<CgAssetType, string> = {
  EQUITY_SHARE: 'Listed equity share (STT paid)',
  EQUITY_FUND: 'Equity oriented fund (STT paid)',
  SPECIFIED_FUND: 'Debt fund (over 65% debt)',
  OTHER_FUND: 'Other fund units',
  OTHER_LISTED: 'Other listed security',
  UNKNOWN: 'Not known yet',
};

const RULES: Array<[CgRole, RegExp]> = [
  ['isin', /\bisin\b/],
  ['sellDate', /\b(sell|sale|exit|redemption|redeem|redeemed|transfer|sold)( trade| transaction)? date\b|date of (sale|sell|redemption|transfer)|^(redemption|sale|sell|sold) .*\bdate\b/],
  ['buyDate', /\b(buy|purchase|entry|acquisition|acquired|allotment)( trade| transaction)? date\b|date of (purchase|acquisition|allotment)|^(purchase|buy) .*\bdate\b/],
  ['fmvPrice', /^(?!.*cost).*(grandfathered nav|grandfathered price|fmv per (unit|share)|(nav|price|rate) (as on|on) 31|(fmv|fair market value|market value) (per|of one) (unit|share))/],
  ['fmvValue', /^(?!.*cost).*(fair market value|\bfmv\b|market value as on 31|grandfathered (market )?value|value as on 31 ?0?1 ?2018)/],
  ['quantity', /^(qty|quantity|units|no of units|no of shares|matched quantity|matched units|sold quantity|sell quantity|redeemed units|units redeemed)\b|^(redemption|sale|sold|redeemed|sell) (units|quantity|qty)\b/],
  ['sellValue', /\b(sell|sale|sold|exit|redemption|redeem) (value|amount|consideration|amt)\b|full value of consideration|sale consideration/],
  ['buyValue', /\b(buy|purchase|acquisition|entry) (value|amount|cost|amt)\b|cost of acquisition|^(total )?cost$|invested amount/],
  ['sellPrice', /\b(sell|sale|exit|redemption|redeem) (price|rate|nav)\b/],
  ['buyPrice', /\b(buy|purchase|entry|acquisition) (price|rate|nav)\b|^avg (buy )?price$|^unit cost$/],
  ['expenses', /^(brokerage|transfer expenses?|expenses?|charges|total charges)$/],
  ['assetClass', /^(asset class|category|scheme category|asset type|type|fund type|sub category)$/],
  ['gain', /^(profit|taxable profit|realised p ?& ?l|realized p ?& ?l|realised p ?l|realized p ?l|pnl|p ?& ?l|gain|gain loss|capital gain|short term( gain| capital gain)?|long term( gain| capital gain)?)( loss)?$/],
  ['name', /^(symbol|scrip|scrip name|stock|stock name|security|security name|scheme|scheme name|fund name|instrument|company name|name|name of (the )?(security|scheme|share|company))$/],
];

export function cgRole(raw: string): CgRole | null {
  const t = normLabel(raw);
  if (!t) return null;
  for (const [role, re] of RULES) if (re.test(t)) return role;
  return null;
}

export function cgRolesFromHeader(header: string[]): CgRole[] {
  const roles = header.map((h) => cgRole(h) ?? 'ignore');
  // A scheme column beats a fund (AMC) name column for the name.
  const schemeAt = header.findIndex((h, i) => roles[i] === 'name' && /scheme/.test(normLabel(h)));
  const seen = new Set<CgRole>();
  return roles.map((r, i) => {
    if (r === 'name' && schemeAt >= 0 && i !== schemeAt) return 'ignore';
    if (r !== 'ignore' && r !== 'gain' && seen.has(r)) return 'ignore';
    seen.add(r);
    return r;
  });
}

const scoreRoles = (roles: CgRole[]) => {
  const s = new Set(roles.filter((r) => r !== 'ignore'));
  const sells = s.has('sellDate') && (s.has('sellValue') || (s.has('sellPrice') && s.has('quantity')));
  return sells ? s.size + 5 : s.size >= 4 ? s.size : 0;
};

/** A heading row with the group heading above it ("Redemption", "Purchase") put in front of each cell. */
function withGroupRow(above: string[] | undefined, row: string[]): string[] {
  if (!above) return row;
  let carry = '';
  return row.map((c, i) => {
    if ((above[i] ?? '').trim()) carry = above[i].trim();
    return carry && c.trim() && !normLabel(c).includes(normLabel(carry)) ? `${carry} ${c}` : c;
  });
}

export interface CgLayout {
  source: CgSource;
  /** Index of the heading row, or -1 when none was recognised. */
  header: number;
  /** The heading cells as used (with any group heading put in front). */
  headerCells: string[];
  roles: CgRole[];
  /** Roles still needed before rows can be read. */
  missing: string[];
}

export function detectCgSource(table: string[][]): CgSource {
  const text = table.slice(0, 40).map((r) => r.join(' ')).join(' ').toLowerCase();
  if (/zerodha|console\b|tradewise exits/.test(text)) return 'ZERODHA';
  if (/groww|nextbillion/.test(text)) return 'GROWW';
  if (/\bcams\b|computer age management/.test(text)) return 'CAMS';
  if (/kfin|karvy/.test(text)) return 'KFINTECH';
  return 'GENERIC';
}

export function cgMissingRoles(roles: CgRole[]): string[] {
  const s = new Set(roles);
  const out: string[] = [];
  if (!s.has('sellDate')) out.push('Sell date');
  if (!s.has('buyDate')) out.push('Buy date');
  if (!s.has('sellValue') && !(s.has('sellPrice') && s.has('quantity'))) out.push('Sell value (or sell price and quantity)');
  if (!s.has('buyValue') && !(s.has('buyPrice') && s.has('quantity'))) out.push('Buy value (or buy price and quantity)');
  return out;
}

export function detectCgLayout(table: string[][], within = 80): CgLayout {
  const source = detectCgSource(table);
  let best = { header: -1, cells: [] as string[], roles: [] as CgRole[], score: 0 };
  for (let i = 0; i < Math.min(within, table.length); i++) {
    for (const cells of [table[i], withGroupRow(table[i - 1], table[i])]) {
      const roles = cgRolesFromHeader(cells);
      const score = scoreRoles(roles);
      if (score > best.score) best = { header: i, cells, roles, score };
    }
  }
  return { source, header: best.header, headerCells: best.cells, roles: best.roles, missing: best.header < 0 ? cgMissingRoles([]) : cgMissingRoles(best.roles) };
}

export interface CgRow {
  /** Row number in the file, from 1. */
  line: number;
  section: string;
  name: string;
  isin: string;
  buyDate: string | null;
  sellDate: string | null;
  quantity: number | null;
  buyValue: number | null;
  sellValue: number | null;
  /** Value on 31 Jan 2018 for the quantity sold, where the report gives it. */
  fmv31Jan2018: number | null;
  expenses: number;
  assetClass: string;
  reportedGain: number | null;
  asset: CgAssetType;
  assetFrom: 'category' | 'isin' | 'report' | 'none' | 'user';
}

export interface CgReadResult {
  rows: CgRow[];
  skipped: Array<{ line: number; reason: string }>;
  issues: StatementIssue[];
}

const SKIP_SECTION = /intraday|speculat|\bf ?& ?o\b|futures|options|derivative/i;

/** Asset type from the report's category text, the ISIN and the source. */
export function guessAsset(o: { assetClass: string; isin: string; source: CgSource; section: string; buyDate: string | null }): { asset: CgAssetType; from: CgRow['assetFrom'] } {
  const c = o.assetClass.toLowerCase();
  const fundIsin = /^INF/.test(o.isin);
  const shareIsin = /^INE[0-9A-Z]{4}01[0-9A-Z]{3}$/.test(o.isin);
  if (c) {
    if (/hybrid|international|overseas|global|fund of funds?|fof|gold|silver|commodit|solution|multi asset|balanced/.test(c)) return { asset: 'UNKNOWN', from: 'none' };
    if (/debt|liquid|gilt|money market|overnight|bond|income|credit risk|duration|floater|banking and psu|corporate|treasury|ultra short|low duration/.test(c)) {
      return o.buyDate && o.buyDate >= '2023-04-01' ? { asset: 'SPECIFIED_FUND', from: 'category' } : { asset: 'OTHER_FUND', from: 'category' };
    }
    if (/equity|elss|index|arbitrage|large cap|mid cap|small cap|flexi|multi cap|sectoral|thematic|dividend yield|value|focused|contra/.test(c)) {
      return fundIsin || o.source === 'CAMS' || o.source === 'KFINTECH' ? { asset: 'EQUITY_FUND', from: 'category' } : { asset: 'EQUITY_SHARE', from: 'category' };
    }
  }
  if (shareIsin) return { asset: 'EQUITY_SHARE', from: 'isin' };
  if ((o.source === 'ZERODHA' || o.source === 'GROWW') && !fundIsin && /equity|short term|long term|stock/i.test(o.section || 'equity') && !o.isin) return { asset: 'EQUITY_SHARE', from: 'report' };
  return { asset: 'UNKNOWN', from: 'none' };
}

/** Rows of a capital gains table, given the heading row and the role of each column. */
export function readCgRows(table: string[][], header: number, roles: CgRole[], source: CgSource = 'GENERIC'): CgReadResult {
  const rows: CgRow[] = [];
  const skipped: CgReadResult['skipped'] = [];
  const issues: StatementIssue[] = [];
  const idx = (r: CgRole) => roles.indexOf(r);
  const I = Object.fromEntries(CG_ROLES.map(({ role }) => [role, idx(role)])) as Record<CgRole, number>;
  const gainCols = roles.map((r, i) => (r === 'gain' ? i : -1)).filter((i) => i >= 0);
  const headKey = (table[header] ?? []).map(normLabel).join('|');
  let section = '';
  let skipping = false;

  for (let r = header + 1; r < table.length; r++) {
    const row = table[r] ?? [];
    const cells = row.map((c) => String(c ?? '').trim());
    const filled = cells.filter(Boolean);
    if (!filled.length) continue;
    if (cells.map(normLabel).join('|') === headKey) continue;
    const get = (i: number) => (i >= 0 ? cells[i] ?? '' : '');
    const sellDate = parseDate(get(I.sellDate));
    // A row of text alone is a section title (Zerodha: "Short Term Trades", "Intraday Trades").
    if (!sellDate && filled.length <= 2 && !filled.some((c) => parseAmount(c) !== null)) {
      section = filled.join(' ').slice(0, 80);
      skipping = SKIP_SECTION.test(section);
      continue;
    }
    if (/^(total|grand total|sub ?total)\b/i.test(filled[0])) continue;
    if (!sellDate) {
      if (filled.some((c) => parseAmount(c) !== null) && filled.length >= 3) skipped.push({ line: r + 1, reason: 'No sell date could be read.' });
      continue;
    }
    if (skipping) {
      skipped.push({ line: r + 1, reason: `In "${section}": intraday and F&O trades are business income, not capital gains.` });
      continue;
    }
    const qty = parseAmount(get(I.quantity));
    const num = (i: number) => parseAmount(get(i));
    let sellValue = num(I.sellValue);
    if (sellValue === null && qty !== null && num(I.sellPrice) !== null) sellValue = round2(qty * num(I.sellPrice)!);
    let buyValue = num(I.buyValue);
    if (buyValue === null && qty !== null && num(I.buyPrice) !== null) buyValue = round2(qty * num(I.buyPrice)!);
    let fmv = num(I.fmvValue);
    if ((fmv === null || fmv === 0) && qty !== null && num(I.fmvPrice)) fmv = round2(qty * num(I.fmvPrice)!);
    const isin = get(I.isin).toUpperCase().replace(/\s+/g, '');
    const assetClass = get(I.assetClass);
    const buyDate = parseDate(get(I.buyDate));
    const g = guessAsset({ assetClass, isin, source, section, buyDate });
    const reported = gainCols.map((i) => parseAmount(cells[i])).filter((x): x is number => x !== null);
    rows.push({
      line: r + 1, section, name: get(I.name).slice(0, 125), isin,
      buyDate, sellDate, quantity: qty, buyValue: buyValue === null ? null : Math.abs(buyValue), sellValue: sellValue === null ? null : Math.abs(sellValue),
      fmv31Jan2018: fmv || null, expenses: Math.abs(num(I.expenses) ?? 0), assetClass,
      reportedGain: reported.length ? round2(reported.reduce((s, x) => s + x, 0)) : null,
      asset: g.asset, assetFrom: g.from,
    });
  }
  if (!rows.length) issues.push({ field: 'file', message: 'No sale rows were read. Check the columns chosen for sell date and values.' });
  if (rows.some((x) => x.asset === 'UNKNOWN')) issues.push({ field: 'asset', message: 'Some rows need their asset type picked (for funds it depends on how much the fund holds in equity or debt).' });
  if (rows.some((x) => x.asset === 'EQUITY_SHARE' || x.asset === 'EQUITY_FUND')) issues.push({ field: 'stt', message: 'Shares and equity fund units are taken as sold with STT paid, as on a recognised exchange or by the fund. Change the asset type of any sold off-market.' });
  return { rows, skipped, issues };
}

const addMonths = (iso: string, months: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export const NEW_RATES_FROM = '2024-07-23';

export interface CgClassified {
  kind: CgSale['kind'] | null;
  term: 'SHORT' | 'LONG' | null;
  /** Months the asset must be held for more than to be long-term, or null (section 50AA). */
  threshold: number | null;
  note: string;
  /** True when the sale is within three days of the long-term date: worth checking by hand. */
  nearBoundary: boolean;
}

/** Section and term for one sale, by asset type and holding period (see the rules at the top). */
export function classifyCgRow(row: Pick<CgRow, 'asset' | 'buyDate' | 'sellDate'>): CgClassified {
  const none = (note: string): CgClassified => ({ kind: null, term: null, threshold: null, note, nearBoundary: false });
  if (!row.sellDate) return none('No sell date.');
  if (row.sellDate < NEW_RATES_FROM) return none('Sold before 23 July 2024, outside Assessment Year 2026-27; not classified.');
  if (row.asset === 'UNKNOWN') return none('Pick the asset type.');
  if (row.asset === 'SPECIFIED_FUND') {
    if (!row.buyDate) return none('No buy date.');
    if (row.buyDate >= '2023-04-01') return { kind: 'STCG', term: 'SHORT', threshold: null, note: 'Section 50AA: debt fund units bought on or after 1 Apr 2023 give short-term gain at slab rates.', nearBoundary: false };
  }
  if (!row.buyDate) return none('No buy date.');
  if (row.buyDate > row.sellDate) return none('Buy date is after the sell date.');
  const months = row.asset === 'EQUITY_SHARE' || row.asset === 'EQUITY_FUND' || row.asset === 'OTHER_LISTED' ? 12 : 24;
  const longFrom = addMonths(row.buyDate, months);
  const long = row.sellDate > longFrom;
  const nearBoundary = Math.abs(dayDiff(longFrom, row.sellDate)) <= 3;
  const equity = row.asset === 'EQUITY_SHARE' || row.asset === 'EQUITY_FUND';
  const kind: CgSale['kind'] = equity ? (long ? '112A' : '111A') : long ? 'LTCG' : 'STCG';
  const note = equity
    ? long ? 'Held over 12 months: section 112A.' : 'Held 12 months or less: section 111A.'
    : long ? `Held over ${months} months: long-term, section 112 at 12.5% without indexation.` : `Held ${months} months or less: short-term, at slab rates.`;
  return { kind, term: long ? 'LONG' : 'SHORT', threshold: months, note: nearBoundary ? `${note} The sale is within 3 days of the ${months}-month mark; check the holding period.` : note, nearBoundary };
}

/** The CgSale rows for the ITR writers, from rows that could be classified and have both values. */
export function toCgSales(rows: CgRow[]): { sales: CgSale[]; issues: StatementIssue[] } {
  const sales: CgSale[] = [];
  const issues: StatementIssue[] = [];
  for (const r of rows) {
    const c = classifyCgRow(r);
    if (!c.kind) {
      issues.push({ field: `row ${r.line}`, message: `${r.name || 'Row'}: ${c.note}` });
      continue;
    }
    if (r.sellValue === null || r.buyValue === null) {
      issues.push({ field: `row ${r.line}`, message: `${r.name || 'Row'}: the buy or sell value is missing.` });
      continue;
    }
    const before2018 = c.kind === '112A' && !!r.buyDate && r.buyDate < '2018-02-01';
    if (before2018 && !r.fmv31Jan2018) issues.push({ field: `row ${r.line}`, message: `${r.name || 'Row'}: bought before 1 Feb 2018 but no value on 31 Jan 2018 was read; the cost is taken as is until it is entered.` });
    sales.push({
      kind: c.kind, date: r.sellDate!, saleValue: Math.round(r.sellValue), cost: Math.round(r.buyValue),
      ...(r.expenses ? { expenses: Math.round(r.expenses) } : {}),
      ...(c.kind === '112A' ? { isin: r.isin || undefined, name: r.name || undefined, acquiredBefore1Feb2018: before2018, ...(before2018 && r.fmv31Jan2018 ? { fmv31Jan2018: Math.round(r.fmv31Jan2018) } : {}) } : {}),
    });
  }
  return { sales, issues };
}
