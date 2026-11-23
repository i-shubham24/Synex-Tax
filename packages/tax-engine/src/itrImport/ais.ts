/**
 * Annual Information Statement (AIS) import and comparison with the return being prepared.
 *
 * The taxpayer downloads the AIS from the e-filing portal (AIS, Download, JSON). The Department has not
 * published the layout of that JSON, so this parser does not depend on fixed paths. It walks the whole
 * document and picks out records by the names of their fields, using the column names the AIS shows on
 * screen and in its PDF and CSV (Information Code, Information Description, Information Source, Amount,
 * TDS deducted, Date of payment or credit, Quarter, Status) and common variants of them. The aliases are
 * listed in FIELD_ALIASES below; every one of them is an assumption until checked against a real file.
 *
 * Known from public material (AIS user guide on the e-filing portal; Rule 114E and Form 61A for SFT codes):
 * - Information codes look like TDS-192, TDS-194A, TCS-206C..., SFT-005, SFT-015, SFT-016(SB), SFT-016(TD),
 *   SFT-017(LES), SFT-018(EMF). SFT-005 is time deposits made (principal, not income); SFT-015 is dividend;
 *   SFT-016 is interest (SB savings, TD time deposits); SFT-017 is sale and purchase of securities; SFT-018 of
 *   mutual fund units; SFT-012 purchase or sale of immovable property.
 * - Each information line has a summary (source, count, amount) and transaction rows (quarter, date, amount,
 *   status active or inactive). Only active rows are counted.
 * - The AIS JSON meant for the offline AIS utility is password protected (PAN in capitals followed by the date
 *   of birth as DDMMYYYY). That encrypted file cannot be read here; the parser says so.
 *
 * Unconfirmed without a real file: the exact key names, how summary and transaction levels nest, how the
 * taxpayer's feedback and modified values appear, and the codes used for tax payments, refunds, interest on
 * refund, rent and GST turnover. Those are classified by their description text as a fallback.
 *
 * The file is untrusted input: only plain values are read, depth and record count are capped, and nothing is
 * evaluated.
 */

export type AisCategory =
  | 'salary' | 'savingsInterest' | 'depositInterest' | 'otherInterest' | 'refundInterest' | 'dividend'
  | 'securitiesSale' | 'mutualFundSale' | 'propertySale' | 'rent' | 'businessReceipts' | 'otherIncome'
  | 'tcs' | 'taxPayment' | 'refund' | 'purchase' | 'deposit' | 'information';

export type AisHead = 'SALARY' | 'HP' | 'CG' | 'BP' | 'OS' | 'TAXES' | 'INFO';

export interface AisLine {
  category: AisCategory;
  head: AisHead;
  code: string;
  description: string;
  source: string;
  /** TAN or PAN of the source as given; a PAN is masked to its last five characters. */
  sourceId: string;
  /** TDS or TCS section as the AIS gives it (194A), when known. */
  section?: string;
  amount: number;
  /** TDS deducted or TCS collected on the line. */
  taxDeducted: number;
  date?: string;
  quarter?: string;
  /** Extra values some lines carry: cost for a sale, BSR code and challan number for a tax payment. */
  cost?: number;
  bsr?: string;
  challan?: string;
}

export interface AisImport {
  taxpayer: { pan?: string; financialYear?: string };
  lines: AisLine[];
  inactiveSkipped: number;
  /** Records whose amounts were read but whose category could not be decided; shown for review. */
  unclassified: number;
  notes: string[];
}

export class AisImportError extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
const str = (v: unknown, max = 125) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v: unknown): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const t = v.replace(/[,\s]/g, '').replace(/^(rs\.?|inr|₹)/i, '');
    if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined;
    return Number(t);
  }
  return undefined;
};
const r0 = (v: number) => Math.round(v);
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const TAN_RE = /^[A-Z]{4}\d{5}[A-Z]$/;
export const maskPanText = (s: string) => (PAN_RE.test(s) ? `XXXXX${s.slice(5)}` : s);

/**
 * Field names looked for, after lower-casing and removing everything but letters and digits.
 * These are guesses built from the AIS screen and CSV column titles; none is confirmed by a published schema.
 */
export const FIELD_ALIASES = {
  code: ['informationcode', 'infocode', 'infcode', 'sftcode', 'tdscode', 'tcscode', 'informationcategorycode', 'code'],
  section: ['section', 'tdssection', 'tcssection', 'sectioncode', 'sectionofdeduction'],
  description: ['informationdescription', 'infodescription', 'infodesc', 'description', 'informationcategory', 'category', 'categoryname', 'natureofincome', 'natureofpayment', 'nature', 'informationtype', 'type'],
  source: ['informationsource', 'infosource', 'sourcename', 'source', 'reportername', 'nameofreporter', 'reportingentityname', 'reportingentity', 'deductorname', 'nameofdeductor', 'deductorcollectorname', 'collectorname', 'nameofcollector', 'payername', 'employername', 'nameofemployer', 'bankname', 'entityname', 'name'],
  sourceId: ['tan', 'tanofdeductor', 'deductortan', 'collectortan', 'tanofcollector', 'deductorcollectortan', 'reportertan', 'reporterpan', 'reporterid', 'informationsourceid', 'sourceid', 'tanpan', 'pantan'],
  amount: ['amountpaidcredited', 'amountpaidorcredited', 'totalamountpaidcredited', 'amountpaid', 'amountcredited', 'grossamount', 'reportedvalue', 'reportedamount', 'amountreported', 'informationvalue', 'transactionamount', 'salevalue', 'salesconsideration', 'saleconsideration', 'totalsalevalue', 'interestamount', 'dividendamount', 'grosssalary', 'amountofsalary', 'taxamount', 'challanamount', 'totaltax', 'amount', 'value', 'totalvalue'],
  taxDeducted: ['tdsdeducted', 'taxdeducted', 'tdsamount', 'amountoftaxdeducted', 'tdsdeposited', 'taxdeposited', 'tcscollected', 'taxcollected', 'tcsamount', 'amountoftaxcollected', 'tds', 'tcs'],
  date: ['dateofpaymentcredit', 'dateofpaymentorcredit', 'dateofpayment', 'dateofcredit', 'paymentdate', 'transactiondate', 'dateoftransaction', 'dateofdeposit', 'depositdate', 'dateofsale', 'saledate', 'date'],
  quarter: ['quarter', 'qtr'],
  status: ['status', 'transactionstatus', 'informationstatus', 'recordstatus'],
  cost: ['costofacquisition', 'purchasevalue', 'costofpurchase', 'cost'],
  bsr: ['bsrcode', 'bsr'],
  challan: ['challanserialnumber', 'challanserialno', 'challanno', 'challannumber', 'serialnumber', 'cin'],
  pan: ['pan', 'panofthetaxpayer', 'taxpayerpan', 'assesseepan'],
  financialYear: ['financialyear', 'fy', 'fyear'],
} as const;

type Field = keyof typeof FIELD_ALIASES;

function pick(o: Obj): Partial<Record<Field, unknown>> {
  const byNorm = new Map<string, unknown>();
  for (const [k, v] of Object.entries(o)) if (v !== null && (typeof v !== 'object')) { const nk = normKey(k); if (!byNorm.has(nk)) byNorm.set(nk, v); }
  const out: Partial<Record<Field, unknown>> = {};
  for (const f of Object.keys(FIELD_ALIASES) as Field[]) {
    for (const a of FIELD_ALIASES[f]) if (byNorm.has(a)) { out[f] = byNorm.get(a); break; }
  }
  return out;
}

const ISO_FROM = (s: string): string | undefined => {
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  m = s.match(/^(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*[-\s/](\d{4})$/);
  if (m && months.includes(m[2].toLowerCase())) return `${m[3]}-${String(months.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
};

/** The TDS or TCS section inside a code or description: TDS-194A gives 194A, 206C(1H) gives 206C(1H). */
function sectionOf(code: string, section: string, desc: string): string | undefined {
  const s = `${section} ${code} ${desc}`.toUpperCase().replace(/(\d)-(?=[A-Z])/g, '$1');
  const m = s.match(/\b(206C[A-Z0-9()]*|19[2-6][A-Z]{0,2}(?:\([A-Z0-9]+\))?)/);
  return m ? m[1] : undefined;
}

/**
 * Category of a record from its code first and its description second. Codes from Rule 114E/Form 61A (SFT)
 * and the TDS sections of the Act; descriptions as the AIS words them (matched loosely).
 */
export function classify(code: string, desc: string, section?: string): { category: AisCategory; head: AisHead } | undefined {
  const c = code.toUpperCase().replace(/\s+/g, '');
  const d = desc.toLowerCase();
  const sec = section ?? '';
  const R = (category: AisCategory, head: AisHead) => ({ category, head });
  if (/^TCS/.test(c) || /^206C/.test(sec) || /\btcs\b|tax collected at source/.test(d)) return R('tcs', 'TAXES');
  if (/advance tax|self[- ]?assessment tax|tax payment|challan/.test(d) || /^(TP|TAXPAY)/.test(c)) return R('taxPayment', 'TAXES');
  if (/interest on (income[- ]?tax )?refund|refund interest|interest from (income[- ]?tax )?refund/.test(d) || /^IFR/.test(c)) return R('refundInterest', 'OS');
  if (/^REF|^RFD/.test(c) || /\brefund\b/.test(d)) return R('refund', 'INFO');
  // SFT codes
  if (/^SFT-?016/.test(c)) return /\(SB\)/.test(c) || /saving/.test(d) ? R('savingsInterest', 'OS') : /\(TD\)/.test(c) || /deposit/.test(d) ? R('depositInterest', 'OS') : R('otherInterest', 'OS');
  if (/^SFT-?015/.test(c)) return R('dividend', 'OS');
  if (/^SFT-?01[78]/.test(c)) {
    if (/\(PUR\)/.test(c) || /purchase/.test(d)) return R('purchase', 'INFO');
    return /^SFT-?018/.test(c) ? R('mutualFundSale', 'CG') : R('securitiesSale', 'CG');
  }
  if (/^SFT-?012/.test(c)) return /sale|sold|seller/.test(d) && !/purchase|buyer/.test(d) ? R('propertySale', 'CG') : R('purchase', 'INFO');
  if (/^SFT-?00[5]/.test(c)) return R('deposit', 'INFO');
  if (/^SFT-?00[1-4]|^SFT-?01[34]/.test(c)) return R('deposit', 'INFO');
  if (/^SFT-?0(0[6-9]|1[01])/.test(c)) return R('purchase', 'INFO');
  // TDS sections (Income-tax Act 1961)
  if (sec === '192' || /^TDS-?192$/.test(c) || /\bsalary\b|salaries/.test(d)) return R('salary', 'SALARY');
  if (sec === '194A' || /^TDS-?194A$/.test(c)) return /saving/.test(d) ? R('savingsInterest', 'OS') : R('depositInterest', 'OS');
  if (sec === '193' || /^TDS-?193$/.test(c)) return R('otherInterest', 'OS');
  if (sec === '194' || /^TDS-?194$/.test(c) || /dividend/.test(d)) return R('dividend', 'OS');
  if (/^194IA$/.test(sec) || /sale of (land|immovable|property)|transfer of immovable/.test(d)) return R('propertySale', 'CG');
  if (/^194(I|IB)$/.test(sec) || /^194I\(?[AB]\)?$/.test(sec) || /\brent\b/.test(d)) return R('rent', 'HP');
  if (/^194(C|D|H|J|JA|JB|M|O|R|S|E|G)$/.test(sec) || /turnover|gst|business receipt|commission|brokerage|professional|technical|contract/.test(d)) return R('businessReceipts', 'BP');
  if (/^194(B|BB|K|LA|N|P|Q|DA|EE)$/.test(sec) || sec === '195') return R('otherIncome', 'OS');
  if (/interest/.test(d)) return /saving/.test(d) ? R('savingsInterest', 'OS') : /deposit/.test(d) ? R('depositInterest', 'OS') : R('otherInterest', 'OS');
  if (/sale of securities|sale of (listed )?shares|equity/.test(d)) return R('securitiesSale', 'CG');
  if (/mutual fund|units/.test(d) && /sale|redemption/.test(d)) return R('mutualFundSale', 'CG');
  if (/purchase|investment/.test(d)) return R('purchase', 'INFO');
  if (/winning|lottery|gift|pension|insurance|other income/.test(d)) return R('otherIncome', 'OS');
  return undefined;
}

interface Ctx { code: string; description: string; section: string; source: string; sourceId: string; inactive: boolean }
const MAX_DEPTH = 40;
const MAX_RECORDS = 20000;

/** Accepts the parsed AIS JSON or its text. */
export function parseAis(input: unknown): AisImport {
  let root: unknown = input;
  if (typeof input === 'string') {
    const t = input.replace(/^﻿/, '').trim();
    try { root = JSON.parse(t); } catch {
      throw new AisImportError('The file could not be read as JSON. The AIS JSON downloaded for the offline AIS utility is password protected and cannot be read here; download the AIS JSON from the portal or save it from the AIS utility as JSON.');
    }
  }
  if (!isObj(root) && !Array.isArray(root)) throw new AisImportError('The file does not contain AIS information.');

  const notes: string[] = [];
  const taxpayer: AisImport['taxpayer'] = {};
  // Taxpayer details from the top two levels only.
  const top = (o: unknown, depth: number) => {
    if (!isObj(o) || depth > 2) return;
    const p = pick(o);
    const pan = str(p.pan, 10).toUpperCase();
    if (!taxpayer.pan && PAN_RE.test(pan)) taxpayer.pan = maskPanText(pan);
    if (!taxpayer.financialYear && str(p.financialYear)) taxpayer.financialYear = str(p.financialYear, 9);
    for (const v of Object.values(o)) top(v, depth + 1);
  };
  top(root, 0);

  const lines: AisLine[] = [];
  let inactiveSkipped = 0;
  let unclassified = 0;
  let records = 0;
  let encryptedLooking = false;

  interface Found { amount: number; tds: number; p: Partial<Record<Field, unknown>>; ctx: Ctx }
  const walk = (node: unknown, ctx: Ctx, depth: number): Found[] => {
    if (depth > MAX_DEPTH) throw new AisImportError('The file is nested too deeply to be an AIS.');
    if (Array.isArray(node)) return node.flatMap((x) => walk(x, ctx, depth + 1));
    if (!isObj(node)) {
      if (typeof node === 'string' && node.length > 2000 && /^[A-Za-z0-9+/=\s]+$/.test(node)) encryptedLooking = true;
      return [];
    }
    if (++records > MAX_RECORDS) throw new AisImportError('The file has more records than an AIS is expected to hold.');
    const p = pick(node);
    const code = str(p.code, 40);
    const status = str(p.status, 30).toLowerCase();
    // The taxpayer's own record (PAN and name, no information code) is not a source of information.
    const ownSource = p.pan !== undefined && !p.code ? '' : str(p.source, 125);
    const inBrackets = ownSource.match(/\(([A-Z]{4}\d{5}[A-Z]|[A-Z]{5}\d{4}[A-Z])\)/);
    const ownId = str(p.sourceId, 15).toUpperCase() || (inBrackets ? inBrackets[1] : '');
    const next: Ctx = {
      // A code without letters (a serial number) is not an information code.
      code: /[A-Za-z]/.test(code) ? code : ctx.code,
      description: str(p.description, 200) || ctx.description,
      section: str(p.section, 12) || ctx.section,
      source: ownSource || ctx.source,
      sourceId: ownId || ctx.sourceId,
      inactive: ctx.inactive || /inactive|deleted|withdrawn|denied/.test(status),
    };
    const children: Found[] = [];
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') children.push(...walk(v, next, depth + 1));
      else if (typeof v === 'string' && v.length > 2000 && /^[A-Za-z0-9+/=\s]+$/.test(v)) encryptedLooking = true;
    }
    // A summary row whose transactions were found is not counted again.
    if (children.length) return children;
    const amount = num(p.amount);
    const tds = num(p.taxDeducted) ?? 0;
    if (amount === undefined && !tds) return [];
    if (!next.code && !next.description) return [];
    return [{ amount: amount ?? 0, tds, p, ctx: next }];
  };
  const found = walk(root, { code: '', description: '', section: '', source: '', sourceId: '', inactive: false }, 0);

  for (const f of found) {
    if (f.ctx.inactive) { inactiveSkipped++; continue; }
    const section = sectionOf(f.ctx.code, f.ctx.section, f.ctx.code ? '' : f.ctx.description);
    const cls = classify(f.ctx.code, f.ctx.description, section);
    if (!cls) unclassified++;
    const id = f.ctx.sourceId;
    const date = ISO_FROM(str(f.p.date, 30));
    const cost = num(f.p.cost);
    lines.push({
      category: cls?.category ?? 'information',
      head: cls?.head ?? 'INFO',
      code: f.ctx.code,
      description: f.ctx.description,
      source: f.ctx.source,
      sourceId: PAN_RE.test(id) ? maskPanText(id) : TAN_RE.test(id) ? id : id.slice(0, 15),
      ...(section ? { section } : {}),
      amount: r0(f.amount),
      taxDeducted: r0(f.tds),
      ...(date ? { date } : {}),
      ...(str(f.p.quarter) ? { quarter: str(f.p.quarter, 10) } : {}),
      ...(cost !== undefined ? { cost: r0(cost) } : {}),
      ...(str(f.p.bsr) ? { bsr: str(f.p.bsr, 7) } : {}),
      ...(str(f.p.challan) ? { challan: str(f.p.challan, 20) } : {}),
    });
  }
  if (!lines.length) {
    throw new AisImportError(encryptedLooking
      ? 'The file looks encrypted. The AIS JSON for the offline utility is password protected and cannot be read here.'
      : 'No AIS information lines were found in the file.');
  }
  if (unclassified) notes.push(`${unclassified} line(s) could not be placed under a head; they are listed as information for review.`);
  if (inactiveSkipped) notes.push(`${inactiveSkipped} inactive line(s) were left out.`);
  return { taxpayer, lines, inactiveSkipped, unclassified, notes };
}

// ---------------- matching with the return ----------------

/**
 * The parts of the return being prepared that the comparison reads. Field names follow Itr1Input to Itr4Input,
 * so any of those can be passed as is.
 */
export interface AisReturnInput {
  salary?: { gross?: number; employers?: { tan?: string; name: string; gross?: number; incomeChargeable?: number; tds?: number }[] };
  house?: { letOut?: boolean; rent?: number };
  houses?: { letOut?: boolean; rent?: number }[];
  otherSources?: { savingsInterest?: number; depositInterest?: number; refundInterest?: number; dividends?: number; other?: number };
  capitalGains?: { kind?: string; saleValue: number }[];
  ltcg112A?: { saleValue: number };
  business?: { ad?: { digital?: number; cash?: number; otherMode?: number }; ada?: { digital?: number; cash?: number; otherMode?: number }; books?: { turnover?: number; revenue?: number } };
  tdsOther?: { tan: string; name: string; section?: string; amount?: number; tds: number }[];
  tcs?: number | { tan: string; name: string; tcs: number }[];
  taxPayments?: { bsr?: string; date: string; serial?: number; amount: number; kind?: 'ADVANCE' | 'SELF' }[];
}

export type MatchStatus = 'MATCHED' | 'DIFFERENT' | 'MISSING_IN_RETURN' | 'NOT_IN_AIS';

/** A change the user can apply to the return with one click; given only where the AIS line maps cleanly. */
export type AisAddAction =
  | { type: 'otherSources'; field: 'savingsInterest' | 'depositInterest' | 'refundInterest' | 'dividends'; amount: number }
  | { type: 'employer'; tan: string; name: string; gross: number; tds: number }
  | { type: 'tdsOther'; tan: string; name: string; section: string; amount: number; tds: number; head: 'OS' | 'HP' | 'BP' | 'NA' }
  | { type: 'tcs'; tan: string; name: string; tcs: number }
  | { type: 'taxPayment'; bsr: string; date: string; serial: number; amount: number; kind: 'ADVANCE' | 'SELF' };

export interface AisMatchRow {
  key: string;
  group: 'income' | 'employer' | 'tds' | 'tcs' | 'taxPayment';
  category: AisCategory;
  head: AisHead;
  label: string;
  payer?: string;
  payerId?: string;
  aisAmount: number;
  returnAmount: number;
  difference: number; // AIS less return
  aisTax?: number;
  returnTax?: number;
  status: MatchStatus;
  note?: string;
  add?: AisAddAction;
}

export interface AisMatch {
  rows: AisMatchRow[];
  /** AIS lines that are not income (deposits, purchases, refunds) or could not be placed: for information. */
  information: AisLine[];
  summary: { matched: number; different: number; missing: number; notInAis: number; aisIncome: number; returnIncome: number };
  tolerance: { absolute: number; percent: number };
}

export const CATEGORY_LABEL: Record<AisCategory, string> = {
  salary: 'Salary', savingsInterest: 'Interest from savings accounts', depositInterest: 'Interest from deposits', otherInterest: 'Other interest',
  refundInterest: 'Interest on income tax refund', dividend: 'Dividend', securitiesSale: 'Sale of securities', mutualFundSale: 'Sale of mutual fund units',
  propertySale: 'Sale of immovable property', rent: 'Rent received', businessReceipts: 'Business or professional receipts', otherIncome: 'Other income',
  tcs: 'Tax collected at source', taxPayment: 'Tax paid by challan', refund: 'Refund', purchase: 'Purchase or investment', deposit: 'Deposit or cash transaction', information: 'Other information',
};

/** Schema code for a TDS section (enum TDSSection in the AY 2026-27 ITR-2, ITR-3 and ITR-4 schemas); only the unambiguous ones. */
const SCHEMA_TDS_CODE: Record<string, string> = {
  '193': '193', '194': '194', '194A': '94A', '194B': '94B', '194BB': '4BB', '194C': '94C', '194D': '94D', '194DA': '4DA', '194E': '94E', '194EE': '4EE',
  '194G': '4G', '194H': '4H', '194IA': '4IA', '194IB': '4IB', '194IC': '4IC', '194K': '94K', '194LA': '4LA', '194M': '94M', '194N': '94N', '194O': '94O',
  '194P': '94P', '194Q': '94Q', '194R': '94R', '194S': '94S', '195': '195',
};

const normName = (s: string) => s.toLowerCase().replace(/\b(ltd|limited|pvt|private|the|bank|of|india)\b/g, '').replace(/[^a-z0-9]/g, '');
const sumBy = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

/**
 * Compares every AIS line with the return. Within the tolerance (the larger of `absolute` rupees and
 * `percent` of the AIS amount) a difference counts as matched.
 *
 * Interest and dividend are often reported twice by the same payer, once in the TDS statement and once in
 * the SFT return; for each payer the larger of the two is taken rather than their total.
 */
export function matchAis(ais: AisImport, ret: AisReturnInput, tolerance = { absolute: 100, percent: 1 }): AisMatch {
  const rows: AisMatchRow[] = [];
  const within = (a: number, b: number) => Math.abs(a - b) <= Math.max(tolerance.absolute, (Math.abs(a) * tolerance.percent) / 100);
  const statusOf = (a: number, b: number): MatchStatus => (b === 0 && a > 0 ? 'MISSING_IN_RETURN' : a === 0 && b > 0 ? 'NOT_IN_AIS' : within(a, b) ? 'MATCHED' : 'DIFFERENT');
  const payerKey = (l: AisLine) => (TAN_RE.test(l.sourceId) ? l.sourceId : normName(l.source) || l.sourceId || 'unknown');

  // ---- salary, by employer TAN ----
  const salaryLines = ais.lines.filter((l) => l.category === 'salary');
  const employers = ret.salary?.employers ?? [];
  const byEmployer = new Map<string, AisLine[]>();
  for (const l of salaryLines) byEmployer.set(payerKey(l), [...(byEmployer.get(payerKey(l)) ?? []), l]);
  const usedEmployers = new Set<number>();
  // A return that has only a gross salary figure (no employer rows) is compared in total.
  if (!employers.length && (ret.salary?.gross ?? 0) > 0) {
    const amount = sumBy(salaryLines, (l) => l.amount);
    const gross = ret.salary!.gross!;
    rows.push({ key: 'sal:total', group: 'employer', category: 'salary', head: 'SALARY', label: 'Salary', aisAmount: amount, returnAmount: gross, difference: amount - gross, aisTax: sumBy(salaryLines, (l) => l.taxDeducted), status: statusOf(amount, gross), note: `${byEmployer.size} employer(s) in the AIS, compared with the total in the return.` });
    byEmployer.clear();
  }
  for (const [k, ls] of byEmployer) {
    const amount = sumBy(ls, (l) => l.amount); const tds = sumBy(ls, (l) => l.taxDeducted);
    const idx = employers.findIndex((e, j) => !usedEmployers.has(j) && ((e.tan && e.tan.toUpperCase() === k) || normName(e.name) === k || (!!normName(e.name) && normName(e.name) === normName(ls[0].source))));
    const e = idx >= 0 ? employers[idx] : undefined;
    if (idx >= 0) usedEmployers.add(idx);
    // ITR-1 and ITR-4 carry income chargeable per employer; a single employer takes the gross salary.
    const retAmount = e ? e.gross ?? (employers.length === 1 && ret.salary?.gross ? ret.salary.gross : e.incomeChargeable ?? 0) : 0;
    const st = statusOf(amount, retAmount);
    const tdsDiffers = e && !within(tds, e.tds ?? 0);
    rows.push({
      key: `sal:${k}`, group: 'employer', category: 'salary', head: 'SALARY', label: 'Salary', payer: ls[0].source || e?.name, payerId: ls[0].sourceId,
      aisAmount: amount, returnAmount: retAmount, difference: amount - retAmount, aisTax: tds, returnTax: e?.tds ?? 0,
      status: st === 'MATCHED' && tdsDiffers ? 'DIFFERENT' : st,
      ...(tdsDiffers ? { note: 'TDS on salary differs from the return.' } : {}),
      ...(!e && TAN_RE.test(ls[0].sourceId) ? { add: { type: 'employer', tan: ls[0].sourceId, name: ls[0].source.slice(0, 125), gross: amount, tds } } : {}),
    });
  }
  employers.forEach((e, j) => {
    if (usedEmployers.has(j)) return;
    const amt = e.gross ?? e.incomeChargeable ?? 0;
    rows.push({ key: `sal:ret:${j}`, group: 'employer', category: 'salary', head: 'SALARY', label: 'Salary', payer: e.name, payerId: e.tan, aisAmount: 0, returnAmount: amt, difference: -amt, aisTax: 0, returnTax: e.tds ?? 0, status: 'NOT_IN_AIS' });
  });

  // ---- income categories other than salary ----
  const otherSources = ret.otherSources ?? {};
  const houses = [...(ret.houses ?? []), ...(ret.house ? [ret.house] : [])];
  const cg = ret.capitalGains ?? [];
  const bk = ret.business ?? {};
  const pres = (x?: { digital?: number; cash?: number; otherMode?: number }) => (x ? (x.digital ?? 0) + (x.cash ?? 0) + (x.otherMode ?? 0) : 0);
  const returnFor: Partial<Record<AisCategory, number>> = {
    savingsInterest: otherSources.savingsInterest ?? 0,
    depositInterest: otherSources.depositInterest ?? 0,
    otherInterest: 0,
    refundInterest: otherSources.refundInterest ?? 0,
    dividend: otherSources.dividends ?? 0,
    otherIncome: otherSources.other ?? 0,
    rent: sumBy(houses.filter((h) => h.letOut !== false), (h) => h.rent ?? 0),
    securitiesSale: sumBy(cg.filter((s) => s.kind === '111A' || s.kind === '112A'), (s) => s.saleValue) + (ret.ltcg112A?.saleValue ?? 0),
    mutualFundSale: 0,
    propertySale: sumBy(cg.filter((s) => s.kind === 'STCG' || s.kind === 'LTCG'), (s) => s.saleValue),
    businessReceipts: pres(bk.ad) + pres(bk.ada) + (bk.books?.turnover ?? bk.books?.revenue ?? 0),
  };
  const addField: Partial<Record<AisCategory, 'savingsInterest' | 'depositInterest' | 'refundInterest' | 'dividends'>> = {
    savingsInterest: 'savingsInterest', depositInterest: 'depositInterest', refundInterest: 'refundInterest', dividend: 'dividends',
  };
  const notes: Partial<Record<AisCategory, string>> = {
    otherInterest: 'Other interest goes with interest from deposits in the return.',
    securitiesSale: 'Equity and mutual fund sales are compared together with sales under 111A and 112A; gains need cost and dates from the broker statement.',
    propertySale: 'Compared with other capital asset sales in the return; the gain needs cost and dates.',
    rent: 'Compared with rent of let out houses in the return.',
    businessReceipts: 'AIS receipts include GST turnover and payments that suffered TDS; compare with turnover in the books.',
    otherIncome: 'Check the nature of each line.',
  };
  // Securities and mutual fund sales are compared together, other interest with deposit interest.
  const groups: { cats: AisCategory[]; head: AisHead; label: string; ret: number; add?: AisAddAction['type'] }[] = [
    { cats: ['savingsInterest'], head: 'OS', label: CATEGORY_LABEL.savingsInterest, ret: returnFor.savingsInterest! },
    { cats: ['depositInterest', 'otherInterest'], head: 'OS', label: CATEGORY_LABEL.depositInterest, ret: returnFor.depositInterest! },
    { cats: ['refundInterest'], head: 'OS', label: CATEGORY_LABEL.refundInterest, ret: returnFor.refundInterest! },
    { cats: ['dividend'], head: 'OS', label: CATEGORY_LABEL.dividend, ret: returnFor.dividend! },
    { cats: ['otherIncome'], head: 'OS', label: CATEGORY_LABEL.otherIncome, ret: returnFor.otherIncome! },
    { cats: ['rent'], head: 'HP', label: CATEGORY_LABEL.rent, ret: returnFor.rent! },
    { cats: ['securitiesSale', 'mutualFundSale'], head: 'CG', label: 'Sale of securities and mutual fund units', ret: returnFor.securitiesSale! },
    { cats: ['propertySale'], head: 'CG', label: CATEGORY_LABEL.propertySale, ret: returnFor.propertySale! },
    { cats: ['businessReceipts'], head: 'BP', label: CATEGORY_LABEL.businessReceipts, ret: returnFor.businessReceipts! },
  ];
  for (const g of groups) {
    const ls = ais.lines.filter((l) => g.cats.includes(l.category));
    if (!ls.length && !g.ret) continue;
    // Per payer: the larger of the TDS-reported and SFT-reported totals, so one payment reported twice counts once.
    const perPayer = new Map<string, { tdsRep: number; other: number; tax: number; source: string; id: string }>();
    for (const l of ls) {
      // Keyed by payer name: the same bank reports TDS under its TAN and SFT under its PAN.
      const k = normName(l.source) || l.sourceId || 'unknown';
      const p = perPayer.get(k) ?? { tdsRep: 0, other: 0, tax: 0, source: l.source, id: l.sourceId };
      if (/^TDS/i.test(l.code) || l.taxDeducted > 0) p.tdsRep += l.amount; else p.other += l.amount;
      p.tax += l.taxDeducted;
      perPayer.set(k, p);
    }
    const aisTotal = sumBy([...perPayer.values()], (p) => Math.max(p.tdsRep, p.other));
    const st = statusOf(aisTotal, g.ret);
    const field = g.cats.length === 1 || g.cats[0] === 'depositInterest' ? addField[g.cats[0]] : undefined;
    rows.push({
      key: `inc:${g.cats.join('+')}`, group: 'income', category: g.cats[0], head: g.head, label: g.label,
      aisAmount: aisTotal, returnAmount: g.ret, difference: aisTotal - g.ret, status: st,
      ...(notes[g.cats[0]] ? { note: notes[g.cats[0]] } : {}),
      ...(field && aisTotal > g.ret && st !== 'MATCHED' ? { add: { type: 'otherSources', field, amount: aisTotal } } : {}),
    });
    for (const [k, p] of perPayer) {
      rows.push({
        key: `inc:${g.cats.join('+')}:${k}`, group: 'income', category: g.cats[0], head: g.head, label: g.label, payer: p.source, payerId: p.id,
        aisAmount: Math.max(p.tdsRep, p.other), returnAmount: 0, difference: 0, aisTax: p.tax, status: 'MATCHED',
        note: 'Payer detail; the return shows this head as a total.',
      });
    }
  }

  // ---- TDS other than salary, by deductor TAN ----
  const tdsLines = ais.lines.filter((l) => l.category !== 'salary' && l.category !== 'tcs' && l.taxDeducted > 0);
  const retTds = ret.tdsOther ?? [];
  const byTan = new Map<string, AisLine[]>();
  for (const l of tdsLines) byTan.set(payerKey(l), [...(byTan.get(payerKey(l)) ?? []), l]);
  const usedTds = new Set<number>();
  for (const [k, ls] of byTan) {
    const tax = sumBy(ls, (l) => l.taxDeducted); const amount = sumBy(ls, (l) => l.amount);
    const matches = retTds.map((t, j) => ({ t, j })).filter(({ t, j }) => !usedTds.has(j) && (t.tan.toUpperCase() === k || normName(t.name) === normName(ls[0].source)));
    matches.forEach(({ j }) => usedTds.add(j));
    const rTax = sumBy(matches, ({ t }) => t.tds);
    const st = statusOf(tax, rTax);
    const section = ls[0].section && ls.every((l) => l.section === ls[0].section) ? ls[0].section : undefined;
    const schemaCode = section ? SCHEMA_TDS_CODE[section] : undefined;
    const head: 'OS' | 'HP' | 'BP' | 'NA' = ls[0].head === 'OS' ? 'OS' : ls[0].head === 'HP' ? 'HP' : ls[0].head === 'BP' ? 'BP' : 'NA';
    rows.push({
      key: `tds:${k}`, group: 'tds', category: ls[0].category, head: 'TAXES', label: `TDS${section ? ` under section ${section}` : ''}`, payer: ls[0].source, payerId: ls[0].sourceId,
      aisAmount: tax, returnAmount: rTax, difference: tax - rTax, status: st,
      ...(st === 'MISSING_IN_RETURN' && !schemaCode ? { note: 'The section could not be read cleanly; add this TDS by hand.' } : {}),
      ...(st === 'MISSING_IN_RETURN' && schemaCode && TAN_RE.test(ls[0].sourceId) ? { add: { type: 'tdsOther', tan: ls[0].sourceId, name: ls[0].source.slice(0, 125), section: schemaCode, amount, tds: tax, head } } : {}),
    });
  }
  retTds.forEach((t, j) => {
    if (usedTds.has(j)) return;
    rows.push({ key: `tds:ret:${j}`, group: 'tds', category: 'information', head: 'TAXES', label: 'TDS', payer: t.name, payerId: t.tan, aisAmount: 0, returnAmount: t.tds, difference: -t.tds, status: 'NOT_IN_AIS', note: 'Not found in the AIS; check Form 26AS before claiming.' });
  });

  // ---- TCS, by collector TAN ----
  const tcsLines = ais.lines.filter((l) => l.category === 'tcs');
  const retTcs = typeof ret.tcs === 'number' ? [] : ret.tcs ?? [];
  const tcsByTan = new Map<string, AisLine[]>();
  for (const l of tcsLines) tcsByTan.set(payerKey(l), [...(tcsByTan.get(payerKey(l)) ?? []), l]);
  if (typeof ret.tcs === 'number') {
    const total = sumBy(tcsLines, (l) => l.taxDeducted || l.amount);
    if (total || ret.tcs) rows.push({ key: 'tcs:total', group: 'tcs', category: 'tcs', head: 'TAXES', label: CATEGORY_LABEL.tcs, aisAmount: total, returnAmount: ret.tcs, difference: total - ret.tcs, status: statusOf(total, ret.tcs) });
  } else {
    const used = new Set<number>();
    for (const [k, ls] of tcsByTan) {
      const tax = sumBy(ls, (l) => l.taxDeducted || l.amount);
      const j = retTcs.findIndex((t, x) => !used.has(x) && (t.tan.toUpperCase() === k || normName(t.name) === normName(ls[0].source)));
      if (j >= 0) used.add(j);
      const rTax = j >= 0 ? retTcs[j].tcs : 0;
      const st = statusOf(tax, rTax);
      rows.push({
        key: `tcs:${k}`, group: 'tcs', category: 'tcs', head: 'TAXES', label: CATEGORY_LABEL.tcs, payer: ls[0].source, payerId: ls[0].sourceId, aisAmount: tax, returnAmount: rTax, difference: tax - rTax, status: st,
        ...(st === 'MISSING_IN_RETURN' && TAN_RE.test(ls[0].sourceId) ? { add: { type: 'tcs', tan: ls[0].sourceId, name: ls[0].source.slice(0, 125), tcs: tax } } : {}),
      });
    }
    retTcs.forEach((t, x) => { if (!used.has(x)) rows.push({ key: `tcs:ret:${x}`, group: 'tcs', category: 'tcs', head: 'TAXES', label: CATEGORY_LABEL.tcs, payer: t.name, payerId: t.tan, aisAmount: 0, returnAmount: t.tcs, difference: -t.tcs, status: 'NOT_IN_AIS' }); });
  }

  // ---- tax payments: by BSR code and challan number, else by date and amount ----
  const payLines = ais.lines.filter((l) => l.category === 'taxPayment');
  const retPay = ret.taxPayments ?? [];
  const usedPay = new Set<number>();
  payLines.forEach((l, i) => {
    let j = retPay.findIndex((p, x) => !usedPay.has(x) && !!l.bsr && !!l.challan && p.bsr === l.bsr && String(p.serial ?? '') === String(Number(l.challan)));
    if (j < 0) j = retPay.findIndex((p, x) => !usedPay.has(x) && p.date === l.date && within(l.amount, p.amount));
    if (j >= 0) usedPay.add(j);
    const rAmt = j >= 0 ? retPay[j].amount : 0;
    const kind: 'ADVANCE' | 'SELF' | undefined = /advance/i.test(l.description) ? 'ADVANCE' : /self/i.test(l.description) ? 'SELF' : undefined;
    const serial = Number(l.challan);
    const clean = !!(kind && l.bsr && /^\d{7}$/.test(l.bsr) && l.date && Number.isInteger(serial) && serial > 0);
    const st = statusOf(l.amount, rAmt);
    rows.push({
      key: `pay:${i}`, group: 'taxPayment', category: 'taxPayment', head: 'TAXES', label: kind === 'ADVANCE' ? 'Advance tax' : kind === 'SELF' ? 'Self-assessment tax' : CATEGORY_LABEL.taxPayment,
      payer: [l.bsr, l.challan, l.date].filter(Boolean).join(' / ') || undefined, aisAmount: l.amount, returnAmount: rAmt, difference: l.amount - rAmt, status: st,
      ...(st === 'MISSING_IN_RETURN' && clean ? { add: { type: 'taxPayment', bsr: l.bsr!, date: l.date!, serial, amount: l.amount, kind: kind! } } : {}),
    });
  });
  retPay.forEach((p, x) => { if (!usedPay.has(x)) rows.push({ key: `pay:ret:${x}`, group: 'taxPayment', category: 'taxPayment', head: 'TAXES', label: CATEGORY_LABEL.taxPayment, payer: [p.bsr, p.serial, p.date].filter(Boolean).join(' / '), aisAmount: 0, returnAmount: p.amount, difference: -p.amount, status: 'NOT_IN_AIS' }); });

  const information = ais.lines.filter((l) => l.head === 'INFO');
  const counted = rows.filter((r) => !r.note?.startsWith('Payer detail'));
  const income = rows.filter((r) => (r.group === 'income' || r.group === 'employer') && !r.note?.startsWith('Payer detail'));
  return {
    rows,
    information,
    summary: {
      matched: counted.filter((r) => r.status === 'MATCHED').length,
      different: counted.filter((r) => r.status === 'DIFFERENT').length,
      missing: counted.filter((r) => r.status === 'MISSING_IN_RETURN').length,
      notInAis: counted.filter((r) => r.status === 'NOT_IN_AIS').length,
      aisIncome: sumBy(income, (r) => r.aisAmount),
      returnIncome: sumBy(income, (r) => r.returnAmount),
    },
    tolerance,
  };
}
