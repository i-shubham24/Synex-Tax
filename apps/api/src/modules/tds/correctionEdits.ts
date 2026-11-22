import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { maskPan, type ConsoStatement, type CorrectionEdits } from '@synextax/tax-engine';

/**
 * The changes behind a correction statement, as the API accepts them (shared by
 * /tds/corrections/build and the correction drafts), PAN masking of saved changes, and the
 * deductee CSV used to edit a draft in a spreadsheet.
 */

const Money = z.string().trim().regex(/^\d{1,13}(\.\d{1,2})?$/);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MASKED = /^XXXXX\d{4}[A-Z]$/;
/** A full PAN or placeholder; a masked PAN (XXXXX1234X) is accepted on draft saves and restored there. */
const PanLike = z.string().trim().toUpperCase().regex(/^([A-Z]{5}\d{4}[A-Z]|PANNOTAVBL|PANAPPLIED|PANINVALID|XXXXX\d{4}[A-Z])$/);
const Rate = z.string().trim().regex(/^\d{1,3}(\.\d{1,4})?$/);
const NewPayee = z.object({
  pan: PanLike, name: z.string().trim().min(1).max(75), section: z.string().trim().max(4), paidOn: IsoDate, amount: Money, deducted: Money,
  deposited: Money.optional(), deductedOn: IsoDate.optional(), rate: Rate.optional(),
  reason: z.string().trim().max(1).optional(), certificate: z.string().trim().max(15).optional(), form121Uin: z.string().trim().max(26).optional(),
});
const Address = z.object({
  line1: z.string().trim().max(25).optional(), line2: z.string().trim().max(25).optional(), line3: z.string().trim().max(25).optional(),
  line4: z.string().trim().max(25).optional(), district: z.string().trim().max(25).optional(),
  stateCode: z.string().trim().regex(/^\d{2}$/).optional(), pin: z.string().trim().regex(/^\d{6}$/).optional(),
}).strict();
const DeductorEditSchema = z.object({
  name: z.string().trim().min(1).max(75).optional(),
  address: Address.optional(),
  email: z.string().trim().max(75).optional(),
  phoneCountryCode: z.string().trim().regex(/^\d{1,5}$/).optional(),
  phone: z.string().trim().regex(/^\d{1,10}$/).optional(),
  type: z.string().trim().toUpperCase().regex(/^[A-Z]$/).optional(),
  gstin: z.string().trim().toUpperCase().max(15).optional(),
  responsible: z.object({
    name: z.string().trim().min(1).max(75).optional(), designation: z.string().trim().min(1).max(20).optional(), pan: PanLike.optional(),
    address: Address.optional(), email: z.string().trim().max(75).optional(),
    phoneCountryCode: z.string().trim().regex(/^\d{1,5}$/).optional(), phone: z.string().trim().regex(/^\d{1,10}$/).optional(),
  }).strict().optional(),
  government: z.object({
    stateCode: z.string().trim().max(2).optional(), ministryCode: z.string().trim().max(2).optional(),
    ministryOther: z.string().trim().max(150).optional(), ain: z.string().trim().toUpperCase().max(7).optional(),
  }).strict().optional(),
}).strict();

export const EditsSchema = z.object({
  deductor: DeductorEditSchema.optional(),
  deductees: z.array(z.object({
    challanNo: z.number().int().min(1), recordNo: z.number().int().min(1), pan: PanLike.optional(), name: z.string().trim().min(1).max(75).optional(),
    section: z.string().trim().max(4).optional(), paidOn: IsoDate.optional(), amount: Money.optional(), deducted: Money.optional(), deposited: Money.optional(),
    deductedOn: IsoDate.optional(), rate: Rate.optional(), reason: z.string().trim().max(1).optional(), certificate: z.string().trim().max(15).optional(),
  })).max(5000).default([]),
  added: z.array(NewPayee.extend({ challanNo: z.number().int().min(1) })).max(5000).default([]),
  challans: z.array(z.object({
    recordNo: z.number().int().min(1), bsr: z.string().trim().regex(/^\d{7}$/).optional(), challanNo: z.string().trim().regex(/^\d{1,5}$/).optional(), date: IsoDate.optional(),
    tax: Money.optional(), interest: Money.optional(), fee: Money.optional(), others: Money.optional(), minorHead: z.string().trim().regex(/^\d{3}$/).optional(),
  })).max(1000).default([]),
  newChallans: z.array(z.object({
    nil: z.boolean().optional(), mode: z.enum(['C', 'B']).optional(), bsr: z.string().trim().max(7), challanNo: z.string().trim().max(5), date: IsoDate,
    tax: Money, interest: Money.optional(), fee: Money.optional(), others: Money.optional(), minorHead: z.string().trim().regex(/^\d{3}$/).optional(),
    deductees: z.array(NewPayee).max(5000),
  })).max(100).default([]),
});
export type Edits = z.infer<typeof EditsSchema>;
export const CorrectionTypeSchema = z.enum(['C1', 'C2', 'C3', 'C5', 'C9']);
export const TokenSchema = z.string().trim().regex(/^\d{15}$/);

export const CorrectionBody = z.object({
  text: z.string().min(10).max(10 * 1024 * 1024),
  type: CorrectionTypeSchema.optional(),
  originalToken: TokenSchema.optional(),
  previousToken: TokenSchema.optional(),
  edits: EditsSchema.default({ deductees: [], added: [], challans: [], newChallans: [] }),
});

/** True when any PAN in the changes is still masked (only drafts can restore those). */
export function hasMaskedPan(e: Edits): boolean {
  return allPans(e).some((p) => MASKED.test(p));
}
function allPans(e: Edits): string[] {
  return [
    e.deductor?.responsible?.pan ?? '',
    ...e.deductees.map((d) => d.pan ?? ''),
    ...e.added.map((a) => a.pan),
    ...e.newChallans.flatMap((c) => c.deductees.map((d) => d.pan)),
  ];
}

/** The changes with every PAN masked, for responses. */
export function maskEdits(e: Edits): Edits {
  const m = (p: string) => maskPan(p);
  return {
    ...e,
    deductor: e.deductor && { ...e.deductor, responsible: e.deductor.responsible && { ...e.deductor.responsible, pan: e.deductor.responsible.pan && m(e.deductor.responsible.pan) } },
    deductees: e.deductees.map((d) => ({ ...d, pan: d.pan && m(d.pan) })),
    added: e.added.map((a) => ({ ...a, pan: m(a.pan) })),
    newChallans: e.newChallans.map((c) => ({ ...c, deductees: c.deductees.map((d) => ({ ...d, pan: m(d.pan) })) })),
  };
}

/**
 * Puts back full PANs where a client sent the masked form it was shown. A masked PAN matching the
 * filed PAN means no change; matching a PAN saved earlier in the draft means that PAN. Anything
 * else is reported so the full PAN can be typed again.
 */
export function restorePans(incoming: Edits, previous: Edits, conso: ConsoStatement): { edits: Edits; problems: string[] } {
  const problems: string[] = [];
  const known = new Map<string, Set<string>>();
  for (const p of allPans(previous)) if (/^[A-Z]{5}\d{4}[A-Z]$/.test(p)) (known.get(maskPan(p)) ?? known.set(maskPan(p), new Set()).get(maskPan(p))!).add(p);
  const fromSaved = (masked: string, where: string) => {
    const hits = [...(known.get(masked) ?? [])];
    if (hits.length === 1) return hits[0];
    problems.push(`${where}: type the full PAN again.`);
    return masked;
  };
  const out: Edits = structuredClone(incoming);
  for (const d of out.deductees) {
    if (!d.pan || !MASKED.test(d.pan)) continue;
    const row = conso.challans.find((c) => c.recordNo === d.challanNo)?.deductees.find((r) => r.recordNo === d.recordNo);
    if (row && maskPan(row.pan) === d.pan) delete d.pan;
    else {
      const prev = previous.deductees.find((p) => p.challanNo === d.challanNo && p.recordNo === d.recordNo)?.pan;
      d.pan = prev && maskPan(prev) === d.pan ? prev : fromSaved(d.pan, `Challan ${d.challanNo}, row ${d.recordNo}`);
    }
  }
  out.added.forEach((a, i) => { if (MASKED.test(a.pan)) a.pan = fromSaved(a.pan, `New payee ${i + 1}`); });
  out.newChallans.forEach((c, i) => c.deductees.forEach((d, j) => { if (MASKED.test(d.pan)) d.pan = fromSaved(d.pan, `New challan ${i + 1}, payee ${j + 1}`); }));
  const r = out.deductor?.responsible;
  if (r?.pan && MASKED.test(r.pan)) {
    // conso.deductor comes with the C1 reader; older builds of the engine lack it.
    const filed = (conso as { deductor?: { responsible?: { pan?: string } } }).deductor?.responsible?.pan ?? (conso.bh[58] ?? '');
    if (maskPan(filed) === r.pan) delete r.pan;
    else r.pan = fromSaved(r.pan, 'Responsible person PAN');
  }
  return { edits: out, problems };
}

export function asEngineEdits(e: Edits): CorrectionEdits {
  return e as CorrectionEdits;
}

// ---------------------------------------------------------------- CSV of deductee rows

export const CSV_COLUMNS = ['challan', 'row', 'pan', 'name', 'section', 'paid_on', 'amount', 'deducted', 'deposited', 'deducted_on', 'rate', 'reason', 'certificate'] as const;
const FIELD: Record<string, string> = { pan: 'pan', name: 'name', section: 'section', paid_on: 'paidOn', amount: 'amount', deducted: 'deducted', deposited: 'deposited', deducted_on: 'deductedOn', rate: 'rate', reason: 'reason', certificate: 'certificate' };

/** Spreadsheet formula injection: a cell starting with = + - @ is written with a leading apostrophe. */
const cell = (v: string) => {
  const s = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Filed rows with the draft's changes applied, then new rows (no row number). PANs masked unless reveal. */
export function exportCsv(conso: ConsoStatement, e: Edits, reveal: boolean): string {
  const pan = (p: string) => (reveal ? p : maskPan(p));
  const lines = [CSV_COLUMNS.join(',')];
  for (const ch of conso.challans) {
    for (const d of ch.deductees) {
      const x = e.deductees.find((k) => k.challanNo === ch.recordNo && k.recordNo === d.recordNo) ?? {};
      const v = { ...d, ...Object.fromEntries(Object.entries(x).filter(([, val]) => val !== undefined)) } as Record<string, unknown>;
      lines.push([String(ch.recordNo), String(d.recordNo), pan(String(v.pan)), ...CSV_COLUMNS.slice(3).map((c) => String(v[FIELD[c]] ?? ''))].map(cell).join(','));
    }
  }
  for (const a of e.added) {
    const v = a as unknown as Record<string, unknown>;
    lines.push([String(a.challanNo), '', pan(a.pan), ...CSV_COLUMNS.slice(3).map((c) => String(v[FIELD[c]] ?? ''))].map(cell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(f); f = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else f += c;
  }
  row.push(f);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const toIso = (v: string) => {
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : t;
};

/**
 * Reads the CSV back into the draft's changes. A row with a row number replaces that row's changes
 * with whatever differs from the filed row; rows without one replace the new payees. Rows of the
 * file that are left out of the CSV keep their changes.
 */
export function importCsv(text: string, conso: ConsoStatement, current: Edits): { edits: Edits; problems: { line: number; message: string }[]; changedRows: number; newRows: number } {
  const problems: { line: number; message: string }[] = [];
  const rows = parseCsv(text);
  const head = (rows.shift() ?? []).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const missing = CSV_COLUMNS.filter((c) => !head.includes(c));
  if (missing.length) return { edits: current, problems: [{ line: 1, message: `Columns missing: ${missing.join(', ')}.` }], changedRows: 0, newRows: 0 };
  const col = (r: string[], c: string) => (r[head.indexOf(c)] ?? '').trim().replace(/^'(?=[=+\-@])/, '');
  const deductees = new Map(current.deductees.map((d) => [`${d.challanNo}:${d.recordNo}`, d]));
  const added: Edits['added'] = [];
  let changedRows = 0;
  rows.forEach((r, i) => {
    const line = i + 2;
    const challanNo = Number(col(r, 'challan'));
    const rowNo = col(r, 'row');
    const ch = conso.challans.find((c) => c.recordNo === challanNo);
    if (!ch) return problems.push({ line, message: `Challan ${col(r, 'challan') || '(blank)'} is not in the consolidated file.` });
    const v: Record<string, string> = {};
    for (const c of CSV_COLUMNS.slice(2)) v[FIELD[c]] = c === 'paid_on' || c === 'deducted_on' ? toIso(col(r, c)) : c === 'pan' || c === 'reason' ? col(r, c).toUpperCase() : col(r, c);
    for (const k of ['amount', 'deducted', 'deposited']) if (v[k] && !/^\d{1,13}(\.\d{1,2})?$/.test(v[k].replace(/,/g, ''))) problems.push({ line, message: `${k} is not an amount.` });
    for (const k of ['amount', 'deducted', 'deposited']) v[k] = v[k].replace(/,/g, '');
    for (const k of ['paidOn', 'deductedOn']) if (v[k] && !/^\d{4}-\d{2}-\d{2}$/.test(v[k])) problems.push({ line, message: `${k === 'paidOn' ? 'Paid on' : 'Deducted on'} is not a date (use YYYY-MM-DD or DD/MM/YYYY).` });
    if (v.pan && !/^([A-Z]{5}\d{4}[A-Z]|PANNOTAVBL|PANAPPLIED|PANINVALID|XXXXX\d{4}[A-Z])$/.test(v.pan)) problems.push({ line, message: 'PAN is not valid.' });
    if (v.name.length > 75) problems.push({ line, message: 'Name can be at most 75 characters.' });
    if (!rowNo) {
      if (!v.pan || !v.name || !v.paidOn || !v.amount || !v.deducted) return problems.push({ line, message: 'A new payee needs PAN, name, paid on, amount and tax deducted.' });
      added.push({ challanNo, pan: v.pan, name: v.name, section: v.section, paidOn: v.paidOn, amount: v.amount, deducted: v.deducted, deposited: v.deposited || undefined, deductedOn: v.deductedOn || undefined, rate: v.rate || undefined, reason: v.reason || undefined, certificate: v.certificate || undefined });
      return;
    }
    const filed = ch.deductees.find((d) => d.recordNo === Number(rowNo));
    if (!filed) return problems.push({ line, message: `Row ${rowNo} is not under challan ${challanNo}.` });
    const edit: Record<string, unknown> = { challanNo, recordNo: filed.recordNo };
    const prev = deductees.get(`${challanNo}:${filed.recordNo}`);
    if (v.pan && v.pan !== filed.pan && v.pan !== maskPan(filed.pan)) edit.pan = MASKED.test(v.pan) && prev?.pan && maskPan(prev.pan) === v.pan ? prev.pan : v.pan;
    for (const k of ['name', 'section', 'paidOn', 'deductedOn', 'reason', 'certificate']) if (v[k] !== (filed as unknown as Record<string, string>)[k]) edit[k] = v[k];
    for (const k of ['amount', 'deducted', 'deposited', 'rate']) {
      const was = (filed as unknown as Record<string, string>)[k];
      if (v[k] && !new Decimal(v[k]).eq(new Decimal(was || 0))) edit[k] = v[k];
    }
    if (edit.name === '') delete edit.name;
    const key = `${challanNo}:${filed.recordNo}`;
    if (Object.keys(edit).length > 2) {
      deductees.set(key, edit as Edits['deductees'][number]);
      changedRows++;
    } else deductees.delete(key);
  });
  const next = { ...current, deductees: [...deductees.values()], added };
  const parsed = EditsSchema.safeParse(next);
  if (!parsed.success && !problems.length) problems.push({ line: 0, message: parsed.error.issues[0]?.message ?? 'Check the rows.' });
  return { edits: parsed.success ? parsed.data : current, problems, changedRows, newRows: added.length };
}

/** What a consolidated file holds, for the screen: every PAN masked. */
export function consoPreview(c: ConsoStatement) {
  const d = (c as { deductor?: Record<string, any> }).deductor;
  return {
    form: c.form, tan: c.tan, deductorName: c.deductorName, taxYear: c.taxYear, quarter: c.quarter,
    originalToken: c.originalToken, previousToken: c.previousToken, issues: c.issues,
    deductor: d ? { ...d, pan: maskPan(String(d.pan ?? '')), responsible: { ...d.responsible, pan: maskPan(String(d.responsible?.pan ?? '')) } } : null,
    challans: c.challans.map((ch) => ({
      recordNo: ch.recordNo, nil: ch.nil, mode: ch.mode, bsr: ch.bsr, challanNo: ch.challanNo, date: ch.date, tax: ch.tax, interest: ch.interest, fee: ch.fee, others: ch.others, total: ch.total, minorHead: ch.minorHead,
      deductees: ch.deductees.map((r) => ({
        recordNo: r.recordNo, mode: r.mode, pan: maskPan(r.pan), panPlaceholder: !/^[A-Z]{5}\d{4}[A-Z]$/.test(r.pan), name: r.name, section: r.section, paidOn: r.paidOn,
        amount: r.amount, deducted: r.deducted, deposited: r.deposited, deductedOn: r.deductedOn, rate: r.rate, reason: r.reason, certificate: r.certificate,
      })),
    })),
  };
}
