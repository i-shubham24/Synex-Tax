import Decimal from 'decimal.js';
import { parseDelimited, parseIndianAmount } from '../import/clientImport.js';
import { validateGstin } from '../validators/gstin.js';

/**
 * ITC-04: goods a principal sends to job workers and gets back (section 143 of the CGST Act).
 *
 *   Table 4   goods sent out on a delivery challan
 *   Table 5   goods received back, or sent on from the job worker's premises, against each challan
 *
 * Inputs not back within one year, and capital goods within three, are treated as supplied by the
 * principal on the day they were sent, with tax and interest due. Filed half-yearly by those with
 * aggregate turnover above Rs 5 crore (April to September by 25 October, October to March by
 * 25 April) and yearly by everyone else (by 25 April).
 */

export interface JobWorkSent {
  line: number;
  challanNo: string;
  date: string; // ISO
  jobWorkerGstin: string | null;
  jobWorkerState: string;
  description: string;
  uqc: string;
  quantity: string;
  taxableValue: string;
  capitalGoods: boolean;
}

export interface JobWorkReceived {
  line: number;
  originalChallanNo: string;
  originalDate: string;
  date: string;
  quantity: string;
  loss: string; // losses and wastes
  nature: string;
}

export interface Itc04Line extends JobWorkSent {
  received: string;
  loss: string;
  pending: string;
  pendingValue: string;
  returnBy: string; // the date after which what is still out counts as supplied
  deemedSupply: boolean;
}

const D = (v: string | number) => new Decimal(v || 0);

function iso(raw: string): string | null {
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(raw.trim()) ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const s = m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s ? s : null;
}
const addYears = (isoDate: string, n: number) => `${Number(isoDate.slice(0, 4)) + n}${isoDate.slice(4)}`;

function rows(text: string, heads: Record<string, RegExp>): { header: string[]; data: Array<Record<string, string>>; start: number } {
  const t = parseDelimited(text);
  let hi = 0;
  let best = -1;
  const keyOf = (h: string) => Object.entries(heads).find(([, re]) => re.test(h.toLowerCase().replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim()))?.[0] ?? null;
  for (let i = 0; i < Math.min(15, t.length); i++) {
    const n = t[i].filter((c) => keyOf(c)).length;
    if (n > best) { best = n; hi = i; }
  }
  const map = (t[hi] ?? []).map(keyOf);
  const data = t.slice(hi + 1).map((r) => {
    const o: Record<string, string> = {};
    r.forEach((c, i) => { const k = map[i]; if (k && o[k] === undefined) o[k] = c.trim(); });
    return o;
  });
  return { header: map.filter((x): x is string => !!x), data, start: hi + 2 };
}

const SENT_HEADS: Record<string, RegExp> = {
  challanNo: /^(challan|delivery\s*challan)\s*(no|number)?$/,
  date: /^(challan\s*)?date$/,
  gstin: /^(job\s*worker\s*)?gstin$/,
  state: /^(job\s*worker\s*)?state$/,
  description: /^(description|goods|item)$/,
  uqc: /^(uqc|unit)$/,
  quantity: /^(qty|quantity)$/,
  value: /^(taxable\s*)?value$/,
  type: /^(type|kind|goods\s*type)$/,
};
const RECEIVED_HEADS: Record<string, RegExp> = {
  originalChallanNo: /^(original\s*challan|challan)\s*(no|number)?$/,
  originalDate: /^(original\s*challan\s*date|challan\s*date)$/,
  date: /^(received|receipt)\s*(on|date)?$|^date\s*received$/,
  quantity: /^(qty|quantity)(\s*received)?$/,
  loss: /^(loss|losses|waste|losses\s*(and|&)\s*wastes?)$/,
  nature: /^(nature(\s*of\s*job\s*work)?|process)$/,
};

export function parseJobWorkSent(text: string): { sent: JobWorkSent[]; errors: Array<{ line: number; message: string }> } {
  const { data, start } = rows(text, SENT_HEADS);
  const sent: JobWorkSent[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  data.forEach((r, i) => {
    const line = start + i;
    if (!r.challanNo && !r.quantity) return;
    const date = iso(r.date ?? '');
    const gstin = (r.gstin ?? '').toUpperCase() || null;
    const qty = parseIndianAmount(r.quantity ?? '');
    const value = parseIndianAmount(r.value ?? '');
    const e: string[] = [];
    if (!r.challanNo) e.push('Challan number is missing.');
    if (!date) e.push('Challan date is not a date.');
    if (gstin && !validateGstin(gstin).isValid) e.push(`GSTIN ${gstin} is not valid.`);
    if (!gstin && !r.state) e.push('Give the job worker’s GSTIN, or the state if unregistered.');
    if (qty === null || !D(qty).gt(0)) e.push('Quantity must be more than zero.');
    if (value === null) e.push('Value is not a number.');
    if (e.length) return errors.push({ line, message: e.join(' ') });
    sent.push({
      line, challanNo: r.challanNo.toUpperCase(), date: date!, jobWorkerGstin: gstin, jobWorkerState: gstin ? gstin.slice(0, 2) : r.state, description: r.description ?? '',
      uqc: (r.uqc ?? 'NOS').toUpperCase(), quantity: D(qty!).toFixed(3), taxableValue: D(value!).toFixed(2), capitalGoods: /capital/i.test(r.type ?? ''),
    });
  });
  return { sent, errors };
}

export function parseJobWorkReceived(text: string): { received: JobWorkReceived[]; errors: Array<{ line: number; message: string }> } {
  const { data, start } = rows(text, RECEIVED_HEADS);
  const received: JobWorkReceived[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  data.forEach((r, i) => {
    const line = start + i;
    if (!r.originalChallanNo && !r.quantity) return;
    const date = iso(r.date ?? '');
    const qty = parseIndianAmount(r.quantity ?? '');
    const loss = parseIndianAmount(r.loss || '0');
    const e: string[] = [];
    if (!r.originalChallanNo) e.push('The original challan number is missing.');
    if (!date) e.push('Date received is not a date.');
    if (qty === null || D(qty).lt(0) || loss === null) e.push('Quantity or loss is not a number.');
    if (e.length) return errors.push({ line, message: e.join(' ') });
    received.push({ line, originalChallanNo: r.originalChallanNo.toUpperCase(), originalDate: iso(r.originalDate ?? '') ?? '', date: date!, quantity: D(qty!).toFixed(3), loss: D(loss!).toFixed(3), nature: r.nature ?? '' });
  });
  return { received, errors };
}

/** Return period and due date of ITC-04 for a date, by turnover band. */
export function itc04Period(onDate: string, aatoAbove5Cr: boolean): { period: string; dueDate: string } {
  const y = Number(onDate.slice(0, 4));
  const m = Number(onDate.slice(5, 7));
  const fy = m >= 4 ? y : y - 1;
  const fyl = `${fy}-${String((fy + 1) % 100).padStart(2, '0')}`;
  if (!aatoAbove5Cr) return { period: `April to March ${fyl}`, dueDate: `${fy + 1}-04-25` };
  return m >= 4 && m <= 9 ? { period: `April to September ${fyl}`, dueDate: `${fy}-10-25` } : { period: `October to March ${fyl}`, dueDate: `${fy + 1}-04-25` };
}

/** Each challan with what came back, what is still with the job worker, and what has become a supply. */
export function itc04Statement(sent: JobWorkSent[], received: JobWorkReceived[], today: string): { lines: Itc04Line[]; unmatched: JobWorkReceived[]; deemedValue: string } {
  const unmatched: JobWorkReceived[] = [];
  const byChallan = new Map<string, JobWorkReceived[]>();
  for (const r of received) {
    if (!sent.some((s) => s.challanNo === r.originalChallanNo)) unmatched.push(r);
    else byChallan.set(r.originalChallanNo, [...(byChallan.get(r.originalChallanNo) ?? []), r]);
  }
  let deemed = new Decimal(0);
  const lines = sent.map((s) => {
    const back = byChallan.get(s.challanNo) ?? [];
    const got = back.reduce((a, r) => a.add(r.quantity), new Decimal(0));
    const loss = back.reduce((a, r) => a.add(r.loss), new Decimal(0));
    const pending = Decimal.max(0, D(s.quantity).sub(got).sub(loss));
    const pendingValue = D(s.quantity).gt(0) ? D(s.taxableValue).mul(pending).div(s.quantity) : new Decimal(0);
    const returnBy = addYears(s.date, s.capitalGoods ? 3 : 1);
    const deemedSupply = pending.gt(0) && today > returnBy;
    if (deemedSupply) deemed = deemed.add(pendingValue);
    return { ...s, received: got.toFixed(3), loss: loss.toFixed(3), pending: pending.toFixed(3), pendingValue: pendingValue.toFixed(2), returnBy, deemedSupply };
  });
  return { lines, unmatched, deemedValue: deemed.toFixed(2) };
}
