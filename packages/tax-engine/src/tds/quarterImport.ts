import Decimal from 'decimal.js';
import { parseDelimited, parseIndianAmount } from '../import/clientImport.js';
import { formHasSection, type StatementForm } from './statementWriter.js';

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

export function parseQuarterSheet(text: string, opts: { form: StatementForm; taxYear: number; quarter: 1 | 2 | 3 | 4 }): { challans: QuarterChallan[]; errors: Array<{ line: number; message: string }>; missing: Field[] } {
  const table = parseDelimited(text);
  let hi = 0;
  let best = -1;
  for (let i = 0; i < Math.min(15, table.length); i++) {
    const n = table[i].filter((c) => match(c)).length;
    if (n > best) { best = n; hi = i; }
  }
  const map = (table[hi] ?? []).map(match);
  const required: Field[] = ['bsr', 'challanNo', 'depositedOn', 'section', 'pan', 'name', 'amountPaid', 'paidOn', 'tax'];
  const missing = required.filter((f) => !map.includes(f));
  const errors: Array<{ line: number; message: string }> = [];
  if (missing.length) return { challans: [], errors, missing };

  const starts = [`${opts.taxYear}-04-01`, `${opts.taxYear}-07-01`, `${opts.taxYear}-10-01`, `${opts.taxYear + 1}-01-01`];
  const ends = [`${opts.taxYear}-06-30`, `${opts.taxYear}-09-30`, `${opts.taxYear}-12-31`, `${opts.taxYear + 1}-03-31`];
  const [qs, qe] = [starts[opts.quarter - 1], ends[opts.quarter - 1]];
  const groups = new Map<string, QuarterChallan>();

  for (let r = hi + 1; r < table.length; r++) {
    const raw: Partial<Record<Field, string>> = {};
    table[r].forEach((c, i) => { const f = map[i]; if (f && raw[f] === undefined) raw[f] = c.trim(); });
    if (!raw.pan && !raw.amountPaid) continue;
    const line = r + 1;
    const err = (m: string) => errors.push({ line, message: m });
    const before = errors.length;

    const bsr = (raw.bsr ?? '').replace(/\D/g, '');
    if (!/^\d{7}$/.test(bsr)) err('BSR code must be 7 digits.');
    const challanNo = (raw.challanNo ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    if (!/^\d{1,5}$/.test(challanNo)) err('Challan serial number must be up to 5 digits.');
    const depositedOn = isoDate(raw.depositedOn ?? '');
    if (!depositedOn) err(`Challan date "${raw.depositedOn ?? ''}" is not a date (dd/mm/yyyy).`);
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

    const key = `${bsr}|${challanNo}|${depositedOn}`;
    const g = groups.get(key) ?? { key, bsr, challanNo, depositedOn: depositedOn!, interest: '0.00', fee: '0.00', tax: '0.00', rows: [] };
    if (raw.interest && new Decimal(parseIndianAmount(raw.interest) ?? 0).gt(0)) g.interest = new Decimal(parseIndianAmount(raw.interest)!).toFixed(2);
    if (raw.fee && new Decimal(parseIndianAmount(raw.fee) ?? 0).gt(0)) g.fee = new Decimal(parseIndianAmount(raw.fee)!).toFixed(2);
    g.tax = new Decimal(g.tax).add(deposited!).toFixed(2);
    const rate = raw.rate ? String(raw.rate).replace('%', '').trim() : new Decimal(amountPaid!).gt(0) ? new Decimal(tax!).div(amountPaid!).mul(100).toFixed(4) : '0';
    g.rows.push({ line, section, pan, name, amountPaid: new Decimal(amountPaid!).toFixed(2), paidOn: paidOn!, tax: new Decimal(tax!).toFixed(2), deposited: new Decimal(deposited!).toFixed(2), deductedOn: new Decimal(tax!).gt(0) ? deductedOn : null, ratePercent: rate, reason: (raw.reason ?? '').toUpperCase(), certificate: (raw.certificate ?? '').toUpperCase() });
    groups.set(key, g);
  }
  return { challans: [...groups.values()], errors, missing };
}
