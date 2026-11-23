'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Calculator, CalendarRange, ClipboardPaste, FileCheck2, FileStack, Layers, PackageCheck } from 'lucide-react';
import { COMPOSITION_RATE, cmp08, gstr4Annual, type CompositionKind, type Gstr1SummaryLine, type SalesRowResult } from '@synextax/tax-engine';
import { useAuth } from '../../../../context/AuthContext';
import { Itc04Panel } from '../../../../components/gst/Itc04Panel';
import { Gstr3bYearPanel } from '../../../../components/gst/Gstr3bYearPanel';
import { Gstr3bCockpitPanel } from '../../../../components/gst/Gstr3bCockpitPanel';
import { Gstr9AnnualPanel } from '../../../../components/gst/Gstr9AnnualPanel';
import { MisPanel } from '../../../../components/gst/MisPanel';
import { TemplateLink } from '../../../../components/TemplateLink';

type Tab = 'cockpit' | 'register' | 'gstr1' | 'gstr3b' | 'gstr9' | 'mis' | 'composition' | 'itc04';
interface Registration { gstin: string; category: string; name: string }
interface Summary { lines: Gstr1SummaryLine[]; totals: { taxableValue: string; igst: string; cgst: string; sgst: string; cess: string; tax: string } }

const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const input = 'h-9 rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
const th = 'px-4 py-2 text-left text-[12px] font-medium whitespace-nowrap';
const td = 'px-4 py-2 text-[13px] text-pos-ink';
const num = `${td} text-right tabular-nums`;
const SECTION_LABEL: Record<string, string> = { B2B: 'B2B (4A)', B2CL: 'B2C large (5)', B2CS: 'B2C others (7)', EXPWP: 'Exports with tax (6A)', EXPWOP: 'Exports without tax (6A)', CDNR: 'Credit/debit notes, registered (9B)', CDNUR: 'Credit/debit notes, unregistered (9B)' };
const KIND_LABEL: Record<CompositionKind, string> = { MANUFACTURER: 'Manufacturer', TRADER: 'Trader or other supplier', RESTAURANT: 'Restaurant', SERVICES_10_2A: 'Services, section 10(2A)' };

const lastMonth = () => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};
const fyOf = (ym: string) => (Number(ym.slice(5, 7)) >= 4 ? Number(ym.slice(0, 4)) : Number(ym.slice(0, 4)) - 1);
const quarterMonths = (fy: number, q: number): [string, string] => {
  const start = [4, 7, 10, 1][q - 1];
  const y = q === 4 ? fy + 1 : fy;
  return [`${y}-${String(start).padStart(2, '0')}`, `${y}-${String(start + 2).padStart(2, '0')}`];
};

function SummaryTable({ s }: { s: Summary }) {
  if (!s.lines.length) return <p className="px-4 py-4 text-[13px] text-pos-ink/55">No invoices for this period.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="text-pos-ink/55"><tr><th className={th}>Table</th><th className={th}>Place of supply</th><th className={`${th} text-right`}>Rate</th><th className={`${th} text-right`}>Documents</th><th className={`${th} text-right`}>Taxable value</th><th className={`${th} text-right`}>IGST</th><th className={`${th} text-right`}>CGST</th><th className={`${th} text-right`}>SGST</th><th className={`${th} text-right`}>Cess</th></tr></thead>
        <tbody>
          {s.lines.map((l) => (
            <tr key={`${l.section}-${l.pos}-${l.rate}`} className="border-t border-pos-line"><td className={td}>{SECTION_LABEL[l.section]}</td><td className={td}>{l.pos ?? ''}</td><td className={num}>{l.rate}%</td><td className={num}>{l.documents}</td><td className={num}>{inr(l.taxableValue)}</td><td className={num}>{inr(l.igst)}</td><td className={num}>{inr(l.cgst)}</td><td className={num}>{inr(l.sgst)}</td><td className={num}>{inr(l.cess)}</td></tr>
          ))}
          <tr className="border-t-2 border-pos-line font-semibold"><td className={td}>Total</td><td className={td} /><td className={td} /><td className={td} /><td className={num}>{inr(s.totals.taxableValue)}</td><td className={num}>{inr(s.totals.igst)}</td><td className={num}>{inr(s.totals.cgst)}</td><td className={num}>{inr(s.totals.sgst)}</td><td className={num}>{inr(s.totals.cess)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

export default function GstReturnsPage() {
  const { authFetch } = useAuth();
  const [tab, setTab] = useState<Tab>('cockpit');
  const [regs, setRegs] = useState<Registration[]>([]);
  const [gstin, setGstin] = useState('');
  const [period, setPeriod] = useState(lastMonth());
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{ rows: SalesRowResult[]; missing: string[]; unmapped: string[]; summary: Summary } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Composition
  const [kind, setKind] = useState<CompositionKind>('TRADER');
  const [fy, setFy] = useState(fyOf(lastMonth()));
  const [quarters, setQuarters] = useState(() => [1, 2, 3, 4].map(() => ({ taxable: '', exempt: '', rcmCgst: '', rcmSgst: '', rcmIgst: '', paidOn: '' })));

  useEffect(() => {
    authFetch('/api/v1/gst/registrations').then(async (r) => {
      if (!r.ok) return;
      const list: Registration[] = (await r.json()).registrations;
      setRegs(list);
      if (list[0]) setGstin(list[0].gstin);
    });
  }, [authFetch]);

  const reg = regs.find((r) => r.gstin === gstin);
  useEffect(() => {
    if (reg?.category === 'COMPOSITION_10_2A') setKind('SERVICES_10_2A');
  }, [reg?.category]);

  const loadSummary = useCallback(async () => {
    if (!gstin) return;
    const r = await authFetch(`/api/v1/gst/gstr1/summary?gstin=${gstin}&from=${period}`);
    setSummary(r.ok ? await r.json() : null);
  }, [authFetch, gstin, period]);
  useEffect(() => { if (tab === 'gstr1') loadSummary(); }, [tab, loadSummary]);

  const send = async (path: 'preview' | 'import') => {
    setBusy(true);
    setMessage(null);
    const r = await authFetch(`/api/v1/gst/sales/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gstin, period, text }) });
    const body = await r.json().catch(() => ({}));
    setBusy(false);
    if (path === 'preview') {
      if (r.ok) setPreview(body);
      else setMessage({ tone: 'bad', text: body.message ?? 'Could not read the register.' });
      return;
    }
    if (r.ok) {
      setMessage({ tone: 'ok', text: `Imported ${body.imported} invoice(s) for ${period}.` });
      setPreview(null);
      setText('');
    } else setMessage({ tone: 'bad', text: body.message ?? 'Not imported.' });
  };

  const fillFromSales = async (q: number) => {
    const [from, to] = quarterMonths(fy, q);
    const r = await authFetch(`/api/v1/gst/gstr1/summary?gstin=${gstin}&from=${from}&to=${to}`);
    if (!r.ok) return;
    const s: Summary = await r.json();
    setQuarters((qs) => qs.map((x, i) => (i === q - 1 ? { ...x, taxable: s.totals.taxableValue } : x)));
  };

  const results = useMemo(
    () =>
      quarters
        .map((q, i) => (q.taxable === '' ? null : cmp08({ kind, fyStart: fy, quarter: (i + 1) as 1 | 2 | 3 | 4, taxableTurnover: q.taxable || 0, exemptTurnover: q.exempt || 0, rcmCgst: q.rcmCgst || 0, rcmSgst: q.rcmSgst || 0, rcmIgst: q.rcmIgst || 0, paidOn: q.paidOn || null })))
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [quarters, kind, fy],
  );
  const annual = results.length ? gstr4Annual(fy, results) : null;
  const errors = preview?.rows.filter((r) => r.errors.length) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/gst" className="inline-flex items-center gap-1.5 text-[13px] text-pos-ink/55 hover:text-pos-accent"><ArrowLeft className="h-4 w-4" /> GST and IMS</Link>
        <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-pos-ink">GST returns</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-pos-ink/60">Practice-wide GSTR-3B autofill and Rule 88A set-off cockpit, sales registers, GSTR-1 summaries, and composition returns.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist">
          {([['cockpit', '3B Cockpit', Layers], ['register', 'Sales register', ClipboardPaste], ['gstr1', 'GSTR-1 summary', FileStack], ['gstr3b', '3B for the year', CalendarRange], ['gstr9', 'GSTR-9 & 9C', FileCheck2], ['mis', 'MIS and parties', BarChart3], ['composition', 'CMP-08 and GSTR-4', Calculator], ['itc04', 'ITC-04 job work', PackageCheck]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] ${tab === id ? 'bg-pos-accent text-white' : 'border border-pos-line text-pos-ink/70 hover:bg-pos-tint'}`}><Icon className="h-4 w-4" /> {label}</button>
          ))}
        </div>
        {tab !== 'cockpit' && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-pos-ink/60">
            <label className="flex items-center gap-2">GSTIN
              <select value={gstin} onChange={(e) => setGstin(e.target.value)} className={`${input} font-mono`}>
                {!regs.length && <option value="">No GSTINs</option>}
                {regs.map((r) => <option key={r.gstin} value={r.gstin}>{r.gstin} {r.name}</option>)}
              </select>
            </label>
            {(tab === 'register' || tab === 'gstr1') && <label className="flex items-center gap-2">Month<input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={input} /></label>}
          </div>
        )}
      </div>

      {message && <p role="status" className={`rounded-[10px] px-3 py-2 text-[13px] ${message.tone === 'ok' ? 'bg-[#22a356]/10 text-[#15803d]' : 'bg-[#dc2626]/5 text-[#dc2626]'}`}>{message.text}</p>}

      {tab === 'cockpit' && <Gstr3bCockpitPanel />}

      {tab === 'register' && (
        <section className="pos-card space-y-3 p-4">
          <p className="text-[13px] text-pos-ink/65">Copy the sales register from Excel, or open the CSV your billing software exports, and paste it here. Columns are matched by their headings: invoice number, date, party GSTIN, place of supply, taxable value, rate, IGST, CGST, SGST, and optionally cess, invoice value, type (credit or debit note), reverse charge and export type. Every row is checked before anything is saved.</p>
          <TemplateLink fileName="sales-register-template.csv" label="Sales register template" headers={['Invoice No', 'Date', 'Party Name', 'GSTIN', 'Place of Supply', 'Taxable Value', 'Rate', 'IGST', 'CGST', 'SGST', 'Cess', 'Invoice Value', 'Type', 'Reverse Charge', 'Export Type']} example={['GG/101', '05/10/2026', 'Ludhiana Traders', '03AABCL1234F1Z8', '03', '10000', '18', '0', '900', '900', '0', '11800', 'INV', 'N', '']} />
          <textarea aria-label="Sales register" value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} rows={8} className="w-full rounded-[10px] border border-pos-line bg-pos-surface p-3 font-mono text-[12px] text-pos-ink outline-none focus:border-pos-accent" placeholder="Invoice No	Date	Party Name	GSTIN	Place of Supply	Taxable Value	Rate	IGST	CGST	SGST" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!text.trim() || !gstin || busy} onClick={() => send('preview')} className="rounded-full border border-pos-line px-4 py-2 text-[13px] text-pos-ink disabled:opacity-40">Check</button>
            <button type="button" disabled={!preview || errors.length > 0 || !preview.rows.length || busy} onClick={() => send('import')} className="rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40">Import {preview ? preview.rows.filter((r) => r.invoice).length : ''} invoice(s)</button>
          </div>
          {preview && preview.missing.length > 0 && <p className="text-[13px] text-[#dc2626]">Columns not found: {preview.missing.join(', ')}. Check the heading row.</p>}
          {preview && preview.unmapped.length > 0 && <p className="text-[12px] text-pos-ink/55">Columns left out: {preview.unmapped.join(', ')}.</p>}
          {errors.length > 0 && (
            <ul className="space-y-1 text-[13px]">
              {errors.map((r) => <li key={r.sourceLine} className="text-[#dc2626]">Line {r.sourceLine}: {r.errors.join(' ')}</li>)}
            </ul>
          )}
          {preview && preview.rows.some((r) => r.warnings.length) && (
            <ul className="space-y-1 text-[13px]">{preview.rows.filter((r) => r.warnings.length).map((r) => <li key={r.sourceLine} className="text-[#b45309]">Line {r.sourceLine}: {r.warnings.join(' ')}</li>)}</ul>
          )}
          {preview && preview.summary.lines.length > 0 && <div className="rounded-[10px] border border-pos-line"><SummaryTable s={preview.summary} /></div>}
        </section>
      )}

      {tab === 'gstr1' && (
        <section className="pos-card overflow-hidden">
          <h2 className="border-b border-pos-line px-4 py-3 text-[14px] font-semibold text-pos-ink">GSTR-1 for {period}, from the sales register kept here</h2>
          {summary ? <SummaryTable s={summary} /> : <p className="px-4 py-4 text-[13px] text-pos-ink/55">Choose a GSTIN.</p>}
          <p className="border-t border-pos-line px-4 py-3 text-[12px] text-pos-ink/55">Filing GSTR-1 from SynexTax needs a GST Suvidha Provider connection, which is being set up. Until then, use this summary to check the return you upload.</p>
        </section>
      )}

      {tab === 'itc04' && <Itc04Panel />}
      {tab === 'gstr3b' && <Gstr3bYearPanel gstin={gstin} />}
      {tab === 'gstr9' && <Gstr9AnnualPanel />}
      {tab === 'mis' && <MisPanel gstin={gstin} />}

      {tab === 'composition' && (
        <section className="space-y-4">
          <div className="pos-card flex flex-wrap items-end gap-3 p-4 text-[13px]">
            <label className="flex flex-col gap-1 text-pos-ink/60">Kind of supplier
              <select value={kind} onChange={(e) => setKind(e.target.value as CompositionKind)} className={input}>
                {(Object.keys(KIND_LABEL) as CompositionKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]} ({COMPOSITION_RATE[k]}%)</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-pos-ink/60">Financial year
              <select value={fy} onChange={(e) => setFy(Number(e.target.value))} className={input}>
                {[0, 1, 2, 3].map((i) => fyOf(lastMonth()) - i).map((y) => <option key={y} value={y}>{y}-{String((y + 1) % 100).padStart(2, '0')}</option>)}
              </select>
            </label>
            <p className="max-w-xl text-[12px] text-pos-ink/55">Manufacturers and restaurants pay on all turnover in the State; traders and section 10(2A) suppliers on taxable turnover only. CMP-08 is due on the 18th after each quarter; interest is 18% a year for each day late.</p>
          </div>
          <div className="pos-card overflow-x-auto">
            <table className="w-full">
              <thead className="text-pos-ink/55"><tr><th className={th}>Quarter</th><th className={th}>Taxable turnover</th><th className={th}>Exempt turnover</th><th className={th}>Reverse charge CGST</th><th className={th}>Reverse charge SGST</th><th className={th}>Reverse charge IGST</th><th className={th}>Paid on</th><th className={`${th} text-right`}>Tax</th><th className={`${th} text-right`}>Interest</th></tr></thead>
              <tbody>
                {quarters.map((q, i) => {
                  const r = results.find((x) => x.period.startsWith(`Q${i + 1} `));
                  const set = (k: keyof typeof q) => (e: React.ChangeEvent<HTMLInputElement>) => setQuarters((qs) => qs.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)));
                  return (
                    <tr key={i} className="border-t border-pos-line">
                      <td className={td}>Q{i + 1}<div className="text-[12px] text-pos-ink/60">due {r?.dueDate ?? ''}</div></td>
                      <td className={td}><div className="flex gap-1"><input aria-label={`Q${i + 1} taxable turnover`} inputMode="decimal" className={`${input} w-32`} value={q.taxable} onChange={set('taxable')} /><button type="button" onClick={() => fillFromSales(i + 1)} disabled={!gstin} className="text-[12px] text-pos-accent disabled:opacity-40">from sales</button></div></td>
                      <td className={td}><input aria-label={`Q${i + 1} exempt turnover`} inputMode="decimal" className={`${input} w-28`} value={q.exempt} onChange={set('exempt')} /></td>
                      <td className={td}><input aria-label={`Q${i + 1} reverse charge CGST`} inputMode="decimal" className={`${input} w-24`} value={q.rcmCgst} onChange={set('rcmCgst')} /></td>
                      <td className={td}><input aria-label={`Q${i + 1} reverse charge SGST`} inputMode="decimal" className={`${input} w-24`} value={q.rcmSgst} onChange={set('rcmSgst')} /></td>
                      <td className={td}><input aria-label={`Q${i + 1} reverse charge IGST`} inputMode="decimal" className={`${input} w-24`} value={q.rcmIgst} onChange={set('rcmIgst')} /></td>
                      <td className={td}><input aria-label={`Q${i + 1} paid on`} type="date" className={input} value={q.paidOn} onChange={set('paidOn')} /></td>
                      <td className={num}>{r ? inr(r.total) : ''}</td>
                      <td className={num}>{r ? inr(r.interest) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {annual && (
            <div className="pos-card p-4 text-[13px]">
              <h2 className="text-[14px] font-semibold text-pos-ink">GSTR-4 for {annual.year} (due {annual.dueDate})</h2>
              <p className="mt-1 text-pos-ink/65">Tax declared in CMP-08: CGST {inr(annual.declared.cgst)}, SGST {inr(annual.declared.sgst)}, IGST {inr(annual.declared.igst)}; total {inr(annual.declared.total)}.</p>
              {annual.missingQuarters.length > 0 && <p className="mt-1 text-[#b45309]">Quarters not entered yet: {annual.missingQuarters.join(', ')}.</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
