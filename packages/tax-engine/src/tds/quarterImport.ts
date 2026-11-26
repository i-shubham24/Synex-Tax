import Decimal from 'decimal.js';
import { parseDelimited, parseIndianAmount } from '../import/clientImport.js';
import { formHasSection, type StatementForm } from './statementWriter.js';
import { linkRowsToChallans } from './challanLink.js';

/**
 * A quarter's TDS (or TCS) payments pasted from Excel: one row per payee payment, with the challan
 * that paid it on the same row. Rows are grouped into challans, so a firm can bring a quarter in
 * from its own working sheet and then write the statement file.
 */

type Field = 'bsr' | 'challanNo' | 'depositedOn' | 'interest' | 'fee' | 'section' | 'pan' | 'name' | 'amountPaid' | 'paidOn' | 'tax' | 'deposited' | 'deductedOn' | 'rate' | 'reason' | 'certificate';

const HEAD: Array<[Field, RegExp]> = [
  ['bsr', /^(bsr|bsr\s*code)$/],
  ['challanNo', /^(challan|challan\s*(no|number|serial))\.?$/],
  ['depositedOn', /^(challan|deposit|deposited)\s*(date|on)$|^date\s*of\s*deposit$/],
  ['interest', /^interest$/],
  ['fee', /^(late\s*)?fee$/],
  ['section', /^(section(\s*code)?|code|nature\s*code)$/],
  ['pan', /^(pan|payee\s*pan|deductee\s*pan|collectee\s*pan)$/],
  ['name', /^(name|payee(\s*name)?|deductee(\s*name)?|collectee(\s*name)?|party)$/],
  ['amountPaid', /^(amount(\s*(paid|credited|received))?|payment|gross)$/],
  ['paidOn', /^(paid|payment|credit(ed)?|received)\s*(on|date)$|^date\s*of\s*(payment|credit)$/],
  ['tax', /^(tds|tcs|tax(\s*(deducted|collected))?)$/],
  ['deposited', /^(tax\s*)?deposited$/],
  ['deductedOn', /^(deducted|collected|deduction|collection)\s*(on|date)$|^date\s*of\s*(deduction|collection)$/],
  ['rate', /^rate(\s*%)?$/],
  ['reason', /^(reason|flag|remarks?)$/],
  ['certificate', /^(certificate|certificate\s*no|lower\s*deduction\s*certificate)$/],
];
const match = (h: string): Field | null => {
  const t = h.toLowerCase().replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [f, re] of HEAD) if (re.test(t)) return f;
  return null;
};

function isoDate(raw: string): string | null {
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(raw.trim()) ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const iso = m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const PAN_LITERALS = new Set(['PANNOTAVBL', 'PANAPPLIED', 'PANINVALID']);

export interface QuarterRow {
  line: number;
  section: string;
  pan: string;
  name: string;
  amountPaid: string;
  paidOn: string;
  tax: string;
  deposited: string;
  deductedOn: string | null;
  ratePercent: string;
  reason: string;
  certificate: string;
}

export interface QuarterChallan {
  key: string;
  bsr: string;
  challanNo: string;
  depositedOn: string;
  interest: string;
  fee: string;
  tax: string; // sum of tax deposited on its rows
  rows: QuarterRow[];
}

/** A challan list pasted separately: BSR code, challan number, date, tax, and optionally interest and fee. */
export interface ChallanListEntry { bsr: string; challanNo: string; depositedOn: string; tax: string; interest: string; fee: string }

export function parseChallanList(text: string): { challans: ChallanListEntry[]; errors: Array<{ line: number; message: string }> } {
  const heads: Array<[keyof ChallanListEntry, RegExp]> = [
    ['bsr', /^(bsr|bsr\s*code)$/],
    ['challanNo', /^(challan|challan\s*(no|number|serial))\.?$/],
    ['depositedOn', /^((challan|deposit)\s*)?date$|^deposited\s*on$/],
    ['tax', /^(tax|income\s*tax|tds|amount)$/],
    ['interest', /^interest$/],
    ['fee', /^(late\s*)?fee$/],
  ];
  const t = parseDelimited(text);
  let hi = 0;
  let best = -1;
  const keyOf = (h: string) => heads.find(([, re]) => re.test(h.toLowerCase().replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim()))?.[0] ?? null;
  for (let i = 0; i < Math.min(15, t.length); i++) {
    const n = t[i].filter((c) => keyOf(c)).length;
    if (n > best) { best = n; hi = i; }
  }
  const map = (t[hi] ?? []).map(keyOf);
  const challans: ChallanListEntry[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  for (let r = hi + 1; r < t.length; r++) {
    const raw: Partial<Record<keyof ChallanListEntry, string>> = {};
    t[r].forEach((c, i) => { const k = map[i]; if (k && raw[k] === undefined) raw[k] = c.trim(); });
    if (!raw.bsr && !raw.tax) continue;
    const bsr = (raw.bsr ?? '').replace(/\D/g, '');
    const challanNo = (raw.challanNo ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    const depositedOn = isoDate(raw.depositedOn ?? '');
    const tax = parseIndianAmount(raw.tax ?? '');
    const e: string[] = [];
    if (!/^\d{7}$/.test(bsr)) e.push('BSR code must be 7 digits.');
    if (!/^\d{1,5}$/.test(challanNo)) e.push('Challan number must be up to 5 digits.');
    if (!depositedOn) e.push('Date is not a date (dd/mm/yyyy).');
    if (tax === null || !new Decimal(tax).gt(0)) e.push('Tax must be more than zero.');
    if (e.length) { errors.push({ line: r + 1, message: e.join(' ') }); continue; }
    challans.push({ bsr, challanNo, depositedOn: depositedOn!, tax: new Decimal(tax!).toFixed(2), interest: new Decimal(parseIndianAmount(raw.interest || '0') ?? 0).toFixed(2), fee: new Decimal(parseIndianAmount(raw.fee || '0') ?? 0).toFixed(2) });
  }
  return { challans, errors };
}

export function parseQuarterSheet(text: string, opts: { form: StatementForm; taxYear: number; quarter: 1 | 2 | 3 | 4; challanList?: ChallanListEntry[] }): { challans: QuarterChallan[]; errors: Array<{ line: number; message: string }>; missing: Field[] } {
  const table = parseDelimited(text);
  let hi = 0;
  let best = -1;
  for (let i = 0; i < Math.min(15, table.length); i++) {
    const n = table[i].filter((c) => match(c)).length;
    if (n > best) { best = n; hi = i; }
  }
  const map = (table[hi] ?? []).map(match);
  // With a separate challan list, rows need no challan columns: they are linked by month.
  const linking = !!opts.challanList && !map.includes('bsr');
  const required: Field[] = linking ? ['section', 'pan', 'name', 'amountPaid', 'paidOn', 'tax'] : ['bsr', 'challanNo', 'depositedOn', 'section', 'pan', 'name', 'amountPaid', 'paidOn', 'tax'];
  const missing = required.filter((f) => !map.includes(f));
  const errors: Array<{ line: number; message: string }> = [];
  if (missing.length) return { challans: [], errors, missing };

  const starts = [`${opts.taxYear}-04-01`, `${opts.taxYear}-07-01`, `${opts.taxYear}-10-01`, `${opts.taxYear + 1}-01-01`];
  const ends = [`${opts.taxYear}-06-30`, `${opts.taxYear}-09-30`, `${opts.taxYear}-12-31`, `${opts.taxYear + 1}-03-31`];
  const [qs, qe] = [starts[opts.quarter - 1], ends[opts.quarter - 1]];
  const groups = new Map<string, QuarterChallan>();
  const pending: QuarterRow[] = [];

  for (let r = hi + 1; r < table.length; r++) {
    const raw: Partial<Record<Field, string>> = {};
    table[r].forEach((c, i) => { const f = map[i]; if (f && raw[f] === undefined) raw[f] = c.trim(); });
    if (!raw.pan && !raw.amountPaid) continue;
    const line = r + 1;
    const err = (m: string) => errors.push({ line, message: m });
    const before = errors.length;

    const bsr = (raw.bsr ?? '').replace(/\D/g, '');
    if (!linking && !/^\d{7}$/.test(bsr)) err('BSR code must be 7 digits.');
    const challanNo = (raw.challanNo ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    if (!linking && !/^\d{1,5}$/.test(challanNo)) err('Challan serial number must be up to 5 digits.');
    const depositedOn = linking ? '' : isoDate(raw.depositedOn ?? '');
    if (!linking && !depositedOn) err(`Challan date "${raw.depositedOn ?? ''}" is not a date (dd/mm/yyyy).`);
    const section = (raw.section ?? '').trim();
    if (!formHasSection(opts.form, section)) err(`Code ${section || '(blank)'} is not in Annexure 2 of Form ${opts.form}.`);
    const pan = (raw.pan ?? '').toUpperCase().replace(/\s/g, '');
    if (!PAN_RE.test(pan) && !PAN_LITERALS.has(pan)) err('PAN must be valid, or PANNOTAVBL / PANAPPLIED / PANINVALID.');
    const name = (raw.name ?? '').trim();
    if (!name) err('Name is required.');
    const amountPaid = parseIndianAmount(raw.amountPaid ?? '');
    if (amountPaid === null || !new Decimal(amountPaid).gt(0)) err('Amount paid must be more than zero.');
    const paidOn = isoDate(raw.paidOn ?? '');
    if (!paidOn || paidOn < qs || paidOn > qe) err(`Date paid must fall within Q${opts.quarter} (${qs} to ${qe}).`);
    const tax = parseIndianAmount(raw.tax ?? '0');
    if (tax === null) err('Tax is not a number.');
    const deposited = raw.deposited ? parseIndianAmount(raw.deposited) : tax;
    if (deposited === null) err('Tax deposited is not a number.');
    const deductedOn = raw.deductedOn ? isoDate(raw.deductedOn) : paidOn;
    if (tax && new Decimal(tax).gt(0) && !deductedOn) err('Date of deduction is not a date.');
    if (errors.length > before) continue;

    const rate = raw.rate ? String(raw.rate).replace('%', '').trim() : new Decimal(amountPaid!).gt(0) ? new Decimal(tax!).div(amountPaid!).mul(100).toFixed(4) : '0';
    const qrow: QuarterRow = { line, section, pan, name, amountPaid: new Decimal(amountPaid!).toFixed(2), paidOn: paidOn!, tax: new Decimal(tax!).toFixed(2), deposited: new Decimal(deposited!).toFixed(2), deductedOn: new Decimal(tax!).gt(0) ? deductedOn : null, ratePercent: rate, reason: (raw.reason ?? '').toUpperCase(), certificate: (raw.certificate ?? '').toUpperCase() };
    if (linking) {
      pending.push(qrow);
      continue;
    }
    const key = `${bsr}|${challanNo}|${depositedOn}`;
    const g = groups.get(key) ?? { key, bsr, challanNo, depositedOn: depositedOn!, interest: '0.00', fee: '0.00', tax: '0.00', rows: [] };
    if (raw.interest && new Decimal(parseIndianAmount(raw.interest) ?? 0).gt(0)) g.interest = new Decimal(parseIndianAmount(raw.interest)!).toFixed(2);
    if (raw.fee && new Decimal(parseIndianAmount(raw.fee) ?? 0).gt(0)) g.fee = new Decimal(parseIndianAmount(raw.fee)!).toFixed(2);
    g.tax = new Decimal(g.tax).add(deposited!).toFixed(2);
    g.rows.push(qrow);
    groups.set(key, g);
  }

  if (linking && opts.challanList) {
    const list = opts.challanList;
    const keyOf = (c: ChallanListEntry) => `${c.bsr}|${c.challanNo}|${c.depositedOn}`;
    const res = linkRowsToChallans(
      pending.map((r) => ({ key: String(r.line), deductedOn: r.deductedOn ?? r.paidOn, tax: r.deposited })),
      list.map((c) => ({ key: keyOf(c), depositedOn: c.depositedOn, tax: c.tax })),
    );
    for (const u of res.unlinked) errors.push({ line: Number(u.key), message: u.reason });
    for (const r of pending) {
      const ck = res.links[String(r.line)];
      if (!ck) continue;
      const c = list.find((x) => keyOf(x) === ck)!;
      const g = groups.get(ck) ?? { key: ck, bsr: c.bsr, challanNo: c.challanNo, depositedOn: c.depositedOn, interest: c.interest, fee: c.fee, tax: '0.00', rows: [] };
      g.tax = new Decimal(g.tax).add(r.deposited).toFixed(2);
      g.rows.push(r);
      groups.set(ck, g);
    }
  }
  return { challans: [...groups.values()], errors, missing };
}

export interface CsiRecord {
  bsrCode: string;
  challanDate: string; // YYYY-MM-DD
  challanNo: string; // 5-digit padded serial
  amount: string;
  majorHead: '0020' | '0021';
  minorHead?: string;
  tan?: string;
  bankName?: string;
}

/**
 * Parse a Protean / NSDL OLTAS .csi (Challan Status Inquiry) caret-delimited file.
 * Format: DDMMYYYY^BSR^CHALLAN_SERIAL^AMOUNT^MAJOR_HEAD[^MINOR_HEAD^TAN^BANK]
 */
export function parseCsiFile(text: string): {
  records: CsiRecord[];
  errors: Array<{ line: number; message: string }>;
} {
  const records: CsiRecord[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;
    // Skip OLTAS header/trailer markers if present
    if (/^(FH|BH|CH)\^/i.test(rawLine) && !/^\d{8}\^/.test(rawLine)) continue;

    const parts = rawLine.includes('^') ? rawLine.split('^') : rawLine.split(',');
    if (parts.length < 4) {
      errors.push({ line: i + 1, message: 'CSI line has fewer than 4 fields (expected Date^BSR^Serial^Amount).' });
      continue;
    }

    const rawDate = parts[0].trim();
    const ddmmyyyy = /^(\d{2})(\d{2})(\d{4})$/.exec(rawDate);
    const challanDate = ddmmyyyy ? `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}` : isoDate(rawDate);
    if (!challanDate || new Date(`${challanDate}T00:00:00Z`).toISOString().slice(0, 10) !== challanDate) {
      errors.push({ line: i + 1, message: `Invalid CSI deposit date "${rawDate}".` });
      continue;
    }

    const bsrCode = parts[1].trim().replace(/\D/g, '');
    if (!/^\d{7}$/.test(bsrCode)) {
      errors.push({ line: i + 1, message: `Invalid 7-digit BSR code "${parts[1].trim()}".` });
      continue;
    }

    const serialDigits = parts[2].trim().replace(/\D/g, '');
    if (!/^\d{1,5}$/.test(serialDigits)) {
      errors.push({ line: i + 1, message: `Invalid challan serial "${parts[2].trim()}".` });
      continue;
    }
    const challanNo = serialDigits.padStart(5, '0');

    const amtParsed = parseIndianAmount(parts[3].trim());
    if (amtParsed === null) {
      errors.push({ line: i + 1, message: `Invalid CSI amount "${parts[3].trim()}".` });
      continue;
    }
    const amount = new Decimal(amtParsed).toFixed(2);
    const rawMajor = (parts[4] ?? '0021').trim();
    const majorHead: '0020' | '0021' = rawMajor === '0020' ? '0020' : '0021';

    records.push({
      bsrCode,
      challanDate,
      challanNo,
      amount,
      majorHead,
      minorHead: parts[5]?.trim() || undefined,
      tan: parts[6]?.trim().toUpperCase() || undefined,
      bankName: parts[7]?.trim() || undefined,
    });
  }

  return { records, errors };
}

export interface BookChallanForCsiMatch {
  id: string;
  bsrCode: string;
  challanNo: string;
  challanDate: string;
  totalAmount: string;
}

export interface CsiMatchInputRecord {
  bsrCode: string;
  challanNo: string;
  challanDate: string;
  amount: string;
  majorHead?: '0020' | '0021';
}

export interface CsiMatchedItem {
  challanId: string;
  bsrCode: string;
  challanNo: string;
  challanDate: string;
  amount: string;
  cin: string;
}

/**
 * Match book challans with Protean CSI records by (BSR, 5-digit padded Serial, Deposit Date)
 * within the Rs 0.05 rounding tolerance. Amount is never dropped from comparison, and date is
 * always part of the key because serial numbers reset per BSR branch per day.
 */
export function matchChallansWithCsi(
  challans: BookChallanForCsiMatch[],
  csiRecords: CsiMatchInputRecord[],
): {
  matched: CsiMatchedItem[];
  unmatchedBook: string[];
  unmatchedCsi: Array<{ bsrCode: string; challanNo: string; challanDate: string; amount: string }>;
} {
  const normBsr = (s: string) => s.trim().replace(/\D/g, '').padStart(7, '0');
  const normSerial = (s: string) => s.trim().replace(/\D/g, '').padStart(5, '0');
  const normDate = (s: string) => isoDate(s) ?? s.trim().slice(0, 10);
  const keyOf = (bsr: string, serial: string, date: string) => `${normBsr(bsr)}-${normSerial(serial)}-${normDate(date)}`;

  const pool = new Map<string, Array<CsiMatchInputRecord & { used?: boolean }>>();
  for (const rec of csiRecords) {
    const key = keyOf(rec.bsrCode, rec.challanNo, rec.challanDate);
    const list = pool.get(key) ?? [];
    list.push({ ...rec, used: false });
    pool.set(key, list);
  }

  const matched: CsiMatchedItem[] = [];
  const unmatchedBook: string[] = [];

  for (const ch of challans) {
    const key = keyOf(ch.bsrCode, ch.challanNo, ch.challanDate);
    const candidates = pool.get(key) ?? [];
    const bookAmt = new Decimal(ch.totalAmount || 0);
    const hit = candidates.find((c) => !c.used && bookAmt.sub(new Decimal(c.amount || 0)).abs().lte(0.05));
    if (hit) {
      hit.used = true;
      const d = normDate(hit.challanDate).replace(/-/g, '');
      matched.push({
        challanId: ch.id,
        bsrCode: normBsr(ch.bsrCode),
        challanNo: normSerial(ch.challanNo),
        challanDate: normDate(ch.challanDate),
        amount: bookAmt.toFixed(2),
        cin: `${normBsr(ch.bsrCode)}${d}${normSerial(ch.challanNo)}`,
      });
    } else {
      unmatchedBook.push(ch.id);
    }
  }

  const unmatchedCsi: Array<{ bsrCode: string; challanNo: string; challanDate: string; amount: string }> = [];
  for (const list of pool.values()) {
    for (const item of list) {
      if (!item.used) {
        unmatchedCsi.push({
          bsrCode: normBsr(item.bsrCode),
          challanNo: normSerial(item.challanNo),
          challanDate: normDate(item.challanDate),
          amount: new Decimal(item.amount || 0).toFixed(2),
        });
      }
    }
  }

  return { matched, unmatchedBook, unmatchedCsi };
}
