'use client';

import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, FileUp, Loader2, ShieldCheck, X } from 'lucide-react';
import {
  CG_ASSET_NAMES,
  CG_SOURCE_NAMES,
  FORM16_FIELD_LABELS,
  classifyCgRow,
  cgMissingRoles,
  detectCgLayout,
  parseDelimited,
  parseForm16,
  parseForm26ASText,
  readCgRows,
  toCgSales,
  type CgAssetType,
  type CgLayout,
  type CgRole,
  type CgSale,
  type Form16Field,
  type Form16Result,
  type Form26ASResult,
  type ItrOtherTds,
  type ItrSalaryTds,
  type ItrTaxPayment,
  type ItrTcs,
} from '@synextax/tax-engine';
import { CgColumnMapping } from './CgColumnMapping';

/**
 * Statement imports for an income tax return: Form 16 (Form 130) PDFs, the Form 26AS text file
 * and capital gains reports. Every file is read in this browser tab; nothing is uploaded or kept.
 * The lead mounts this on the ITR page and takes the reviewed figures through `onApply`.
 */

export interface ItrStatementsApply {
  /** One per Form 16: the employer row for the ITR salary schedule. */
  employers: Array<{ tan: string; name: string; gross: number; professionalTax: number; incomeChargeable: number; tds: number }>;
  salaryTds: ItrSalaryTds[];
  otherTds: ItrOtherTds[];
  tcs: ItrTcs[];
  taxPayments: ItrTaxPayment[];
  capitalGains: CgSale[];
  /** NEW or OLD when a Form 16 states it. */
  regime: 'NEW' | 'OLD' | null;
}

const MAX = { form16: 10 * 1024 * 1024, f26: 5 * 1024 * 1024, cg: 15 * 1024 * 1024 };
const inr = (v: number | null | undefined) => (v === null || v === undefined ? '' : `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
const nice = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const th = 'px-2 py-1.5 text-left text-[12px] font-medium text-pos-ink/70 whitespace-nowrap';
const td = 'px-2 py-1.5 text-[12px] text-pos-ink';
const num = `${td} text-right font-mono tabular-nums`;
const inputCls = 'h-9 rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
const btn = 'inline-flex items-center gap-1.5 rounded-full border border-pos-line px-3 py-1.5 text-[12px] text-pos-ink disabled:opacity-40';

interface CgState {
  name: string;
  table: string[][];
  layout: CgLayout;
  header: number;
  roles: CgRole[];
  assets: Record<number, CgAssetType>;
}

type Pending = { kind: 'form16' | 'cg'; name: string; buf: ArrayBuffer; wrong: boolean };

export function ItrStatementsImportPanel(props: { onApply?: (data: ItrStatementsApply) => void }) {
  const [form16s, setForm16s] = useState<Array<{ name: string; result: Form16Result; emptyPages: number[] }>>([]);
  const [f26, setF26] = useState<{ name: string; result: Form26ASResult } | null>(null);
  const [cg, setCg] = useState<CgState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [password, setPassword] = useState('');
  const [applied, setApplied] = useState(false);
  const f16Input = useRef<HTMLInputElement>(null);
  const f26Input = useRef<HTMLInputElement>(null);
  const cgInput = useRef<HTMLInputElement>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setError(null);
    setApplied(false);
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The file could not be read.');
    } finally {
      setBusy(null);
    }
  };

  const tooBig = (file: File, limit: number) => {
    if (file.size > limit) throw new Error(`${file.name} is larger than ${Math.round(limit / 1024 / 1024)} MB, which is more than this kind of statement should be.`);
  };

  /* Form 16 */
  const openForm16 = async (name: string, buf: ArrayBuffer, pw?: string) => {
    const { readPdfText, PdfPasswordError } = await import('./readPdfText');
    try {
      const r = await readPdfText(buf, pw);
      setPending(null);
      setPassword('');
      const result = parseForm16(r.lines);
      if (!r.lines.length) throw new Error(`${name} has no text layer (it may be a scan). Download Form 16 again from TRACES or the employer, as issued.`);
      setForm16s((list) => [...list.filter((x) => x.name !== name), { name, result, emptyPages: r.emptyPages }]);
    } catch (e) {
      if (e instanceof PdfPasswordError) {
        setPending({ kind: 'form16', name, buf, wrong: e.wrong });
        return;
      }
      throw e;
    }
  };
  const onForm16Files = (files: FileList) => run('Reading Form 16', async () => {
    for (const file of Array.from(files).slice(0, 10)) {
      tooBig(file, MAX.form16);
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error(`${file.name} is not a PDF.`);
      setBusy(`Reading ${file.name}`);
      await openForm16(file.name, await file.arrayBuffer());
    }
  });

  /* Form 26AS */
  const onF26File = (file: File) => run(`Reading ${file.name}`, async () => {
    tooBig(file, MAX.f26);
    if (/\.zip$/i.test(file.name)) throw new Error('TRACES gives Form 26AS as a zip with a password (the date of birth as DDMMYYYY). Unzip it on your computer and pick the .txt file inside.');
    if (/\.pdf$/i.test(file.name)) throw new Error('The Form 26AS PDF is not read yet. On TRACES choose "View As: Text", download, unzip and pick the .txt file.');
    const result = parseForm26ASText(await file.text());
    if (!result.is26AS) throw new Error(result.issues[0]?.message ?? 'This is not a Form 26AS text file.');
    setF26({ name: file.name, result });
  });

  /* Capital gains */
  const beginCg = (name: string, table: string[][]) => {
    if (table.length < 2) throw new Error(`No rows were found in ${name}.`);
    const layout = detectCgLayout(table);
    setCg({ name, table, layout, header: Math.max(0, layout.header), roles: layout.header >= 0 ? layout.roles : [], assets: {} });
  };
  const openCgPdf = async (name: string, buf: ArrayBuffer, pw?: string) => {
    const { readPdfStatement, PdfPasswordError } = await import('@/components/bank/readPdf');
    try {
      const r = await readPdfStatement(buf, { password: pw, onProgress: (m) => setBusy(m) });
      setPending(null);
      setPassword('');
      beginCg(name, r.table.rows);
    } catch (e) {
      if (e instanceof PdfPasswordError) {
        setPending({ kind: 'cg', name, buf, wrong: e.wrong });
        return;
      }
      throw e;
    }
  };
  const onCgFile = (file: File) => run(`Reading ${file.name}`, async () => {
    tooBig(file, MAX.cg);
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.pdf') || file.type === 'application/pdf') await openCgPdf(file.name, await file.arrayBuffer());
    else if (lower.endsWith('.xlsx')) {
      const { readXlsx } = await import('@/components/bank/readXlsx');
      beginCg(file.name, await readXlsx(await file.arrayBuffer()));
    } else if (lower.endsWith('.xls')) throw new Error('Older Excel files (.xls) cannot be read here. Save the report as .xlsx or CSV.');
    else beginCg(file.name, parseDelimited(await file.text()));
  });

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const p = pending;
    if (!p || !password) return;
    void run('Opening the PDF', () => (p.kind === 'form16' ? openForm16(p.name, p.buf, password) : openCgPdf(p.name, p.buf, password)));
  };

  const cgRead = useMemo(() => {
    if (!cg || cgMissingRoles(cg.roles).length) return null;
    const read = readCgRows(cg.table, cg.header, cg.roles, cg.layout.source);
    const rows = read.rows.map((r) => (cg.assets[r.line] ? { ...r, asset: cg.assets[r.line], assetFrom: 'user' as const } : r));
    return { ...read, rows, out: toCgSales(rows) };
  }, [cg]);

  const regime = form16s.map((f) => f.result.partB.regime).find((x) => x) ?? null;
  const apply = () => {
    const data: ItrStatementsApply = {
      employers: form16s.filter((f) => f.result.itr.salaryTds).map((f) => ({
        tan: f.result.itr.salaryTds!.tan, name: f.result.itr.salaryTds!.name,
        gross: f.result.itr.gross ?? 0, professionalTax: f.result.itr.professionalTax ?? 0,
        incomeChargeable: f.result.itr.salaryTds!.incomeChargeable, tds: f.result.itr.salaryTds!.tds,
      })),
      salaryTds: form16s.length ? form16s.flatMap((f) => (f.result.itr.salaryTds ? [f.result.itr.salaryTds] : [])) : f26?.result.itr.salaryTds ?? [],
      otherTds: f26?.result.itr.otherTds ?? [],
      tcs: f26?.result.itr.tcs ?? [],
      taxPayments: f26?.result.itr.taxPayments ?? [],
      capitalGains: cgRead?.out.sales ?? [],
      regime,
    };
    props.onApply?.(data);
    setApplied(true);
  };
  const anything = form16s.length > 0 || !!f26 || (cgRead?.out.sales.length ?? 0) > 0;

  return (
    <section className="pos-card space-y-4 p-4">
      <div>
        <h2 className="text-[16px] font-semibold text-pos-ink">Import statements</h2>
        <p className="mt-1 text-[13px] text-pos-ink/65">Read Form 16, Form 26AS and capital gains reports into the return. Check every figure below before using it.</p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-pos-green"><ShieldCheck className="h-4 w-4" /> Files are read in this browser tab. They are not uploaded or saved, and PANs are shown masked.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Picker title="Form 16 (Form 130)" hint="PDF as issued from TRACES, Part A and Part B. Several employers can be added." busy={!!busy} onClick={() => f16Input.current?.click()} />
        <Picker title="Form 26AS (Form 168)" hint="Text file from TRACES (View As: Text), unzipped." busy={!!busy} onClick={() => f26Input.current?.click()} />
        <Picker title="Capital gains report" hint="Zerodha Console tax P&L, Groww, CAMS or KFintech: Excel (.xlsx), CSV or PDF." busy={!!busy} onClick={() => cgInput.current?.click()} />
        <input ref={f16Input} type="file" multiple accept=".pdf,application/pdf" className="hidden" onChange={(e) => { if (e.target.files?.length) void onForm16Files(e.target.files); e.target.value = ''; }} />
        <input ref={f26Input} type="file" accept=".txt,.zip,.pdf,text/plain" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onF26File(f); e.target.value = ''; }} />
        <input ref={cgInput} type="file" accept=".xlsx,.xls,.csv,.pdf,text/csv,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onCgFile(f); e.target.value = ''; }} />
      </div>

      {busy && <p className="flex items-center gap-2 text-[13px] text-pos-ink/70" role="status"><Loader2 className="h-4 w-4 animate-spin" /> {busy}</p>}
      {pending && (
        <form onSubmit={submitPassword} className="flex flex-wrap items-end gap-2 text-[12px] text-pos-ink/65">
          <label className="flex flex-col gap-1">{pending.wrong ? 'That password did not open the file. Try again' : `${pending.name} has a password`}
            <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} w-64`} />
          </label>
          <button type="submit" disabled={!password || !!busy} className="h-9 rounded-full border border-pos-line px-4 text-[12px] text-pos-ink disabled:opacity-40">Open</button>
          <button type="button" onClick={() => { setPending(null); setPassword(''); }} className="h-9 px-2 text-[12px] text-pos-ink/65">Cancel</button>
          <span className="pb-2">The password is used only to open the file here, and is not kept.</span>
        </form>
      )}
      {error && <p className="flex items-center gap-1.5 text-[13px] text-pos-red"><AlertTriangle className="h-4 w-4" /> {error}</p>}

      {form16s.map((f) => <Form16Review key={f.name} name={f.name} r={f.result} emptyPages={f.emptyPages} onRemove={() => setForm16s((l) => l.filter((x) => x.name !== f.name))} />)}
      {f26 && <Form26ASReview name={f26.name} r={f26.result} onRemove={() => setF26(null)} />}
      {cg && (
        <ReviewCard title="Capital gains" name={cg.name} onRemove={() => setCg(null)}>
          {(cg.layout.header < 0 || cgMissingRoles(cg.roles).length > 0 || !cgRead?.rows.length) && (
            <CgColumnMapping
              header={cg.table[cg.header] ?? []}
              samples={cg.table.slice(cg.header + 1, cg.header + 3)}
              roles={cg.roles}
              source={cg.layout.source}
              headerRow={cg.header}
              rowCount={cg.table.length}
              missing={cgMissingRoles(cg.roles)}
              onRoles={(roles) => setCg({ ...cg, roles })}
              onHeaderRow={(header) => setCg({ ...cg, header })}
              onReset={() => setCg({ ...cg, header: Math.max(0, cg.layout.header), roles: cg.layout.roles })}
            />
          )}
          {cgRead && <CgReview source={CG_SOURCE_NAMES[cg.layout.source]} read={cgRead} onAsset={(line, a) => setCg({ ...cg, assets: { ...cg.assets, [line]: a } })} />}
        </ReviewCard>
      )}

      {anything && (
        <div className="flex flex-wrap items-center gap-3 border-t border-pos-line pt-3">
          <button type="button" disabled={!props.onApply} onClick={apply} className="inline-flex items-center gap-1.5 rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40">
            <CheckCircle2 className="h-4 w-4" /> Use these figures in the return
          </button>
          {applied && <span className="text-[12px] text-pos-green">Figures passed to the return. Check them there before filing.</span>}
          {form16s.length > 0 && f26 && <span className="text-[12px] text-pos-ink/65">Salary TDS is taken from Form 16; Form 26AS supplies the other TDS, TCS and tax paid.</span>}
        </div>
      )}
    </section>
  );
}

function Picker(props: { title: string; hint: string; busy: boolean; onClick: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-[12px] border border-pos-line p-3">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-pos-ink"><FileText className="h-4 w-4" /> {props.title}</h3>
      <p className="flex-1 text-[12px] text-pos-ink/65">{props.hint}</p>
      <button type="button" disabled={props.busy} onClick={props.onClick} className={`${btn} self-start`}><FileUp className="h-4 w-4" /> Choose file</button>
    </div>
  );
}

function ReviewCard(props: { title: string; name: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-[12px] border border-pos-line p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-pos-ink">{props.title} <span className="font-normal text-pos-ink/65">from {props.name}</span></h3>
        <button type="button" aria-label={`Remove ${props.name}`} onClick={props.onRemove} className="rounded-full p-1 text-pos-ink/65 hover:text-pos-ink"><X className="h-4 w-4" /></button>
      </div>
      {props.children}
    </div>
  );
}

function Notes(props: { issues: Array<{ field: string; message: string }>; missing?: Array<{ label: string }> }) {
  if (!props.issues.length && !props.missing?.length) return null;
  return (
    <div className="space-y-1 text-[12px]">
      {props.missing && props.missing.length > 0 && <p className="text-[#b45309]">Not found in the file, enter by hand: {props.missing.map((m) => m.label).join('; ')}.</p>}
      {props.issues.map((i, k) => <p key={k} className="flex gap-1.5 text-pos-ink/70"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#b45309]" /> {i.message}</p>)}
    </div>
  );
}

const PART_B_ORDER: Form16Field[] = ['grossSalary', 'exemptTotal', 'salaryCurrentEmployer', 'standardDeduction', 'professionalTax', 'chargeableSalary', 'houseProperty', 'otherSources', 'grossTotalIncome', 'ded80C', 'ded80CCD1B', 'ded80CCD2', 'ded80D', 'chapterVIATotal', 'totalTaxableIncome', 'taxOnTotalIncome', 'rebate87A', 'cess', 'relief89', 'netTaxPayable'];

function Form16Review(props: { name: string; r: Form16Result; emptyPages: number[]; onRemove: () => void }) {
  const { r } = props;
  const a = r.partA;
  return (
    <ReviewCard title={r.form === 'FORM130' ? 'Form 130' : 'Form 16'} name={props.name} onRemove={props.onRemove}>
      <dl className="grid gap-x-4 gap-y-1 text-[12px] sm:grid-cols-3">
        <Item k="Employer" v={a.employerName} />
        <Item k="Employer TAN" v={a.employerTan} mono />
        <Item k="Employee PAN" v={a.employeePan} mono />
        <Item k="Assessment year" v={a.assessmentYear} mono />
        <Item k="Period" v={a.periodFrom ? `${nice(a.periodFrom)} to ${nice(a.periodTo)}` : null} />
        <Item k="Regime in Part B" v={r.partB.regime === 'NEW' ? 'New regime' : r.partB.regime === 'OLD' ? 'Old regime (opted out)' : null} />
      </dl>
      {a.quarters.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className={th}>Quarter</th><th className={th}>Receipt</th><th className={`${th} text-right`}>Paid or credited</th><th className={`${th} text-right`}>Tax deducted</th><th className={`${th} text-right`}>Tax deposited</th></tr></thead>
            <tbody>
              {a.quarters.map((q) => <tr key={q.quarter} className="border-t border-pos-line"><td className={td}>{q.quarter}</td><td className={`${td} font-mono`}>{q.receipt}</td><td className={num}>{inr(q.paid)}</td><td className={num}>{inr(q.deducted)}</td><td className={num}>{inr(q.deposited)}</td></tr>)}
              <tr className="border-t border-pos-line font-medium"><td className={td} colSpan={2}>Total</td><td className={num}>{inr(a.totalPaid)}</td><td className={num}>{inr(a.totalDeducted)}</td><td className={num}>{inr(a.totalDeposited)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
      {r.partB.found && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className={th}>Part B</th><th className={`${th} text-right`}>Amount</th><th className={th}>Read from</th></tr></thead>
            <tbody>
              {PART_B_ORDER.filter((k) => r.partB.figures[k] !== undefined).map((k) => (
                <tr key={k} className="border-t border-pos-line">
                  <td className={td}>{FORM16_FIELD_LABELS[k]}</td>
                  <td className={num}>{inr(r.partB.figures[k])}</td>
                  <td className="max-w-[360px] truncate px-2 py-1.5 text-[11px] text-pos-ink/60" title={r.partB.sources[k]}>{r.partB.sources[k]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {props.emptyPages.length > 0 && <p className="text-[12px] text-pos-ink/65">Pages {props.emptyPages.join(', ')} had little or no text and were not read.</p>}
      <Notes issues={r.issues} missing={r.missing} />
    </ReviewCard>
  );
}

function Item(props: { k: string; v: string | null; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="text-pos-ink/65">{props.k}</dt>
      <dd className={props.v ? `text-pos-ink ${props.mono ? 'font-mono' : ''}` : 'text-[#b45309]'}>{props.v ?? 'not found'}</dd>
    </div>
  );
}

function Form26ASReview(props: { name: string; r: Form26ASResult; onRemove: () => void }) {
  const { r } = props;
  return (
    <ReviewCard title="Form 26AS" name={props.name} onRemove={props.onRemove}>
      <dl className="grid gap-x-4 gap-y-1 text-[12px] sm:grid-cols-3">
        <Item k="PAN" v={r.header.pan} mono />
        <Item k="Assessment year" v={r.header.assessmentYear} mono />
        <Item k="PAN status" v={r.header.panStatus} />
      </dl>
      {r.tds.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className={th}>Deductor</th><th className={th}>TAN</th><th className={th}>Section</th><th className={th}>ITR code</th><th className={`${th} text-right`}>Amount paid</th><th className={`${th} text-right`}>TDS</th><th className={th}>Booking</th></tr></thead>
            <tbody>
              {r.tds.map((t) => (
                <tr key={`${t.kind}|${t.tan}|${t.section}`} className="border-t border-pos-line">
                  <td className={td}>{t.name}{t.kind === 'TDS_15GH' ? ' (15G/15H)' : ''}</td>
                  <td className={`${td} font-mono`}>{t.tan}</td>
                  <td className={`${td} font-mono`}>{t.section || 'not read'}</td>
                  <td className={`${td} font-mono`}>{t.section === '192' ? 'Salary' : t.sectionCode ?? <span className="font-sans text-[#b45309]">pick</span>}</td>
                  <td className={num}>{inr(t.amount)}</td>
                  <td className={num}>{inr(t.tds)}</td>
                  <td className={`${td} font-mono`}>{Object.entries(t.status).map(([s, n]) => `${s} ${n}`).join(', ')}</td>
                </tr>
              ))}
              <tr className="border-t border-pos-line font-medium"><td className={td} colSpan={5}>Total TDS</td><td className={num}>{inr(r.totals.tds)}</td><td /></tr>
            </tbody>
          </table>
        </div>
      )}
      {r.tcs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className={th}>Collector</th><th className={th}>TAN</th><th className={th}>Section</th><th className={`${th} text-right`}>Amount</th><th className={`${th} text-right`}>TCS</th></tr></thead>
            <tbody>{r.tcs.map((t) => <tr key={`${t.tan}|${t.section}`} className="border-t border-pos-line"><td className={td}>{t.name}</td><td className={`${td} font-mono`}>{t.tan}</td><td className={`${td} font-mono`}>{t.section}</td><td className={num}>{inr(t.amount)}</td><td className={num}>{inr(t.tcs)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {r.taxPaid.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className={th}>Tax paid</th><th className={th}>BSR code</th><th className={th}>Date</th><th className={th}>Challan</th><th className={`${th} text-right`}>Amount</th></tr></thead>
            <tbody>{r.taxPaid.map((c, k) => <tr key={k} className="border-t border-pos-line"><td className={td}>{c.kind === 'ADVANCE' ? 'Advance tax' : c.kind === 'SELF' ? 'Self-assessment tax' : `Minor head ${c.minorHead}`}</td><td className={`${td} font-mono`}>{c.bsr}</td><td className={td}>{nice(c.date)}</td><td className={`${td} font-mono`}>{c.serial}</td><td className={num}>{inr(c.total)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {r.refunds.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className={th}>Refund for</th><th className={th}>Mode</th><th className={th}>Paid on</th><th className={`${th} text-right`}>Refund</th><th className={`${th} text-right`}>Interest</th></tr></thead>
            <tbody>{r.refunds.map((x, k) => <tr key={k} className="border-t border-pos-line"><td className={`${td} font-mono`}>{x.assessmentYear}</td><td className={td}>{x.mode}</td><td className={td}>{nice(x.date)}</td><td className={num}>{inr(x.amount)}</td><td className={num}>{inr(x.interest)}</td></tr>)}</tbody>
          </table>
          <p className="mt-1 text-[12px] text-pos-ink/65">Interest on a refund is income of the year it is received; it is shown here, not added to the return.</p>
        </div>
      )}
      <Notes issues={r.issues} />
    </ReviewCard>
  );
}

const ASSETS = Object.keys(CG_ASSET_NAMES) as CgAssetType[];
const KIND_NAMES: Record<CgSale['kind'], string> = { '111A': 'Short-term, 111A', '112A': 'Long-term, 112A', STCG: 'Short-term, slab', LTCG: 'Long-term, 112' };

function CgReview(props: {
  source: string;
  read: ReturnType<typeof readCgRows> & { out: ReturnType<typeof toCgSales> };
  onAsset: (line: number, asset: CgAssetType) => void;
}) {
  const { read } = props;
  const byKind = new Map<CgSale['kind'], { sale: number; cost: number; n: number }>();
  for (const s of read.out.sales) {
    const t = byKind.get(s.kind) ?? { sale: 0, cost: 0, n: 0 };
    byKind.set(s.kind, { sale: t.sale + s.saleValue, cost: t.cost + s.cost, n: t.n + 1 });
  }
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-pos-ink/65">Read as {props.source}: {read.rows.length} sales{read.skipped.length ? `, ${read.skipped.length} rows left out` : ''}.</p>
      {byKind.size > 0 && (
        <div className="flex flex-wrap gap-3">
          {[...byKind.entries()].map(([k, t]) => (
            <div key={k} className="rounded-[10px] bg-pos-muted px-3 py-2 text-[12px]">
              <p className="text-pos-ink/70">{KIND_NAMES[k]} ({t.n})</p>
              <p className="font-mono text-pos-ink">{inr(t.sale - t.cost)}</p>
            </div>
          ))}
        </div>
      )}
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-pos-surface"><tr>
            <th className={th}>Scrip or scheme</th><th className={th}>ISIN</th><th className={th}>Bought</th><th className={th}>Sold</th>
            <th className={`${th} text-right`}>Quantity</th><th className={`${th} text-right`}>Cost</th><th className={`${th} text-right`}>Sale value</th><th className={`${th} text-right`}>31 Jan 2018 value</th>
            <th className={th}>Asset type</th><th className={th}>Treated as</th>
          </tr></thead>
          <tbody>
            {read.rows.map((r) => {
              const c = classifyCgRow(r);
              return (
                <tr key={r.line} className="border-t border-pos-line align-top">
                  <td className={td}>{r.name || <span className="text-pos-ink/60">row {r.line}</span>}</td>
                  <td className={`${td} font-mono`}>{r.isin}</td>
                  <td className={`${td} whitespace-nowrap`}>{nice(r.buyDate)}</td>
                  <td className={`${td} whitespace-nowrap`}>{nice(r.sellDate)}</td>
                  <td className={num}>{r.quantity ?? ''}</td>
                  <td className={num}>{inr(r.buyValue)}</td>
                  <td className={num}>{inr(r.sellValue)}</td>
                  <td className={num}>{inr(r.fmv31Jan2018)}</td>
                  <td className={td}>
                    <select aria-label={`Asset type for row ${r.line}`} value={r.asset} onChange={(e) => props.onAsset(r.line, e.target.value as CgAssetType)}
                      className={`h-8 rounded-[8px] border bg-pos-surface px-2 text-[12px] text-pos-ink ${r.asset === 'UNKNOWN' ? 'border-[#b45309]/60' : 'border-pos-line'}`}>
                      {ASSETS.map((a) => <option key={a} value={a}>{CG_ASSET_NAMES[a]}</option>)}
                    </select>
                  </td>
                  <td className={`${td} min-w-[200px]`}>
                    <span className={c.kind ? 'text-pos-ink' : 'text-[#b45309]'}>{c.kind ? KIND_NAMES[c.kind] : 'Not classified'}</span>
                    <span className={`block text-[11px] ${c.nearBoundary ? 'text-[#b45309]' : 'text-pos-ink/60'}`}>{c.note}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {read.skipped.length > 0 && (
        <details className="text-[12px] text-pos-ink/70">
          <summary className="cursor-pointer">Rows left out ({read.skipped.length})</summary>
          <ul className="mt-1 space-y-0.5">{read.skipped.slice(0, 50).map((s) => <li key={s.line}>Row {s.line}: {s.reason}</li>)}</ul>
        </details>
      )}
      <Notes issues={[...read.issues, ...read.out.issues.filter((i) => !/Pick the asset type/.test(i.message))]} />
    </div>
  );
}
