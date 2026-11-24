'use client';

import React, { useMemo, useState } from 'react';
import { BILLING_GST_RATES, billingFinancialYear, BILLING_UQC, computeBillingDoc } from '@synextax/tax-engine';
import { useAuth } from '../../context/AuthContext';
import { btnCls, type Customer, DOC_LABEL, errorText, Field, fyLabel, ghostCls, inputCls, inr, type Item, Notice, type Series, STATES, th, thr, td, tdr, today } from './shared';

interface Line {
  itemId: string;
  description: string;
  hsn: string;
  isService: boolean;
  unit: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  gstRate: number;
  cessRate: number;
}
const blankLine: Line = { itemId: '', description: '', hsn: '', isService: false, unit: 'NOS', quantity: '1', unitPrice: '0', discount: '0', gstRate: 18, cessRate: 0 };
const smallCls = 'h-8 w-full rounded-[8px] border border-pos-line bg-pos-surface px-2 text-[13px] text-pos-ink outline-none focus:border-pos-accent';

/** Entry of a tax invoice, credit note or debit note, with the tax worked out as you type. */
export function InvoiceEntry({ gstin, items, customers, series, onSaved }: { gstin: string; items: Item[]; customers: Customer[]; series: Series[]; onSaved: (id: string) => void }) {
  const { authFetch } = useAuth();
  const [docDate, setDocDate] = useState(today());
  const fy = /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? billingFinancialYear(docDate) : 0;
  const usable = series.filter((s) => s.fy === fy);
  const [seriesId, setSeriesId] = useState('');
  const chosen = usable.find((s) => s.id === seriesId) ?? usable[0];
  const [customerId, setCustomerId] = useState('');
  const customer = customers.find((c) => c.id === customerId);
  const [pos, setPos] = useState('');
  const [reverseCharge, setReverseCharge] = useState(false);
  const [originalDocNo, setOriginalDocNo] = useState('');
  const [originalDocDate, setOriginalDocDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ ...blankLine }]);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const placeOfSupply = pos || customer?.stateCode || gstin.slice(0, 2);
  const docType = chosen?.docType ?? 'INV';

  const preview = useMemo(() => {
    if (!chosen) return null;
    try {
      return computeBillingDoc({
        docType,
        docNo: chosen.nextDocNo,
        docDate,
        supplierGstin: gstin,
        customerGstin: customer?.gstin ?? null,
        placeOfSupply,
        reverseCharge,
        originalDocNo: originalDocNo || null,
        originalDocDate: originalDocDate || null,
        lines: lines.map((l) => ({ ...l, itemId: l.itemId || null })),
      });
    } catch {
      return null;
    }
  }, [chosen, docType, docDate, gstin, customer, placeOfSupply, reverseCharge, originalDocNo, originalDocDate, lines]);

  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const pickItem = (i: number, id: string) => {
    const it = items.find((x) => x.id === id);
    if (!it) return setLine(i, { itemId: '' });
    setLine(i, { itemId: it.id, description: it.name, hsn: it.hsn, isService: it.isService, unit: it.unit, unitPrice: String(Number(it.salePrice)), gstRate: it.gstRate, cessRate: it.cessRate });
  };

  const save = async () => {
    if (!chosen || !customer) return setMsg('Choose a number series and a customer.');
    setSaving(true);
    setMsg(null);
    const r = await authFetch('/api/v1/billing/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gstin,
        seriesId: chosen.id,
        docDate,
        customerId: customer.id,
        placeOfSupply,
        reverseCharge,
        originalDocNo: docType === 'INV' ? null : originalDocNo,
        originalDocDate: docType === 'INV' ? null : originalDocDate,
        notes,
        lines: lines.map((l) => ({ ...l, itemId: l.itemId || null })),
      }),
    });
    setSaving(false);
    if (!r.ok) return setMsg(await errorText(r));
    const b = await r.json();
    setLines([{ ...blankLine }]);
    setOriginalDocNo('');
    setOriginalDocDate('');
    setNotes('');
    onSaved(b.document.id);
  };

  const t = preview?.totals;
  return (
    <section className="space-y-4">
      {msg && <Notice tone="error">{msg}</Notice>}
      <div className="pos-card space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Date"><input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className={inputCls} /></Field>
          <Field label="Series" hint={chosen ? `Next number ${chosen.nextDocNo}` : `No series for ${fy ? fyLabel(fy) : 'this year'}: add one in Settings`}>
            <select value={chosen?.id ?? ''} onChange={(e) => setSeriesId(e.target.value)} className={inputCls}>
              {usable.map((s) => <option key={s.id} value={s.id}>{DOC_LABEL[s.docType]} {s.prefix || '(no prefix)'}</option>)}
            </select>
          </Field>
          <Field label="Customer">
            <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setPos(''); }} className={inputCls}>
              <option value="">Choose</option>
              {customers.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.legalName}{c.gstin ? ` (${c.gstin})` : ' (unregistered)'}</option>)}
            </select>
          </Field>
          <Field label="Place of supply" hint="Defaults to the customer's state">
            <select value={placeOfSupply} onChange={(e) => setPos(e.target.value)} className={inputCls}>
              {STATES.map(([code, name]) => <option key={code} value={code}>{code} {name}</option>)}
            </select>
          </Field>
          {docType !== 'INV' && (
            <>
              <Field label="Original invoice number"><input maxLength={16} value={originalDocNo} onChange={(e) => setOriginalDocNo(e.target.value.toUpperCase())} className={`${inputCls} font-mono`} /></Field>
              <Field label="Original invoice date"><input type="date" value={originalDocDate} onChange={(e) => setOriginalDocDate(e.target.value)} className={inputCls} /></Field>
            </>
          )}
          <label className="flex items-center gap-2 self-end text-[13px] text-pos-ink/80">
            <input type="checkbox" checked={reverseCharge} disabled={!customer?.gstin} onChange={(e) => setReverseCharge(e.target.checked)} /> Tax payable on reverse charge
          </label>
        </div>
        {preview && <p className="text-[12px] text-pos-ink/70">{preview.interState ? 'Inter-state supply: IGST' : 'Intra-state supply: CGST and SGST'}. GSTR-1 table {preview.table} ({preview.section}).</p>}
      </div>

      <div className="pos-card overflow-x-auto">
        <table className="w-full min-w-[960px]">
          <thead>
            <tr><th className={th}>Item</th><th className={th}>Description</th><th className={th}>HSN or SAC</th><th className={th}>Unit</th><th className={thr}>Quantity</th><th className={thr}>Rate</th><th className={thr}>Discount</th><th className={thr}>GST %</th><th className={thr}>Taxable</th><th className={thr}>Tax</th><th className={th} /></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const c = preview?.lines[i];
              const tax = c ? Number(c.igst) + Number(c.cgst) + Number(c.sgst) + Number(c.cess) : 0;
              return (
                <tr key={i} className="border-t border-pos-line align-top">
                  <td className="px-2 py-2"><select aria-label="Item" value={l.itemId} onChange={(e) => pickItem(i, e.target.value)} className={smallCls}><option value="">Free text</option>{items.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
                  <td className="px-2 py-2"><input aria-label="Description" value={l.description} maxLength={300} onChange={(e) => setLine(i, { description: e.target.value })} className={smallCls} /></td>
                  <td className="px-2 py-2"><input aria-label="HSN or SAC" value={l.hsn} maxLength={8} onChange={(e) => setLine(i, { hsn: e.target.value.trim() })} className={`${smallCls} w-24 font-mono`} /></td>
                  <td className="px-2 py-2"><select aria-label="Unit" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} className={`${smallCls} w-20`}>{Object.keys(BILLING_UQC as Record<string, string>).map((u) => <option key={u} value={u}>{u}</option>)}</select></td>
                  <td className="px-2 py-2"><input aria-label="Quantity" inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className={`${smallCls} w-24 text-right font-mono`} /></td>
                  <td className="px-2 py-2"><input aria-label="Rate" inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} className={`${smallCls} w-28 text-right font-mono`} /></td>
                  <td className="px-2 py-2"><input aria-label="Discount" inputMode="decimal" value={l.discount} onChange={(e) => setLine(i, { discount: e.target.value })} className={`${smallCls} w-24 text-right font-mono`} /></td>
                  <td className="px-2 py-2"><select aria-label="GST rate" value={l.gstRate} onChange={(e) => setLine(i, { gstRate: Number(e.target.value) })} className={`${smallCls} w-20`}>{(BILLING_GST_RATES as number[]).map((r) => <option key={r} value={r}>{r}</option>)}</select></td>
                  <td className={tdr}>{c ? inr(c.taxable) : ''}</td>
                  <td className={tdr}>{c ? inr(tax) : ''}</td>
                  <td className="px-2 py-2">{lines.length > 1 && <button type="button" className="text-[13px] text-pos-ink/70 hover:text-[#b91c1c]" onClick={() => setLines(lines.filter((_, k) => k !== i))}>Remove</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-pos-line p-3"><button type="button" className={ghostCls} onClick={() => setLines([...lines, { ...blankLine }])}>Add line</button></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="pos-card space-y-2 p-4">
          <Field label="Notes to print"><input maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} /></Field>
          {preview && preview.errors.length > 0 && <Notice tone="error"><ul className="list-disc pl-4">{preview.errors.map((e) => <li key={e}>{e}</li>)}</ul></Notice>}
          {preview && preview.warnings.length > 0 && <Notice tone="info"><ul className="list-disc pl-4">{preview.warnings.map((e) => <li key={e}>{e}</li>)}</ul></Notice>}
        </div>
        <div className="pos-card p-4">
          {t && (
            <table className="w-full">
              <tbody>
                <tr><td className={td}>Taxable value</td><td className={tdr}>{inr(t.taxable)}</td></tr>
                {Number(t.igst) > 0 && <tr><td className={td}>IGST</td><td className={tdr}>{inr(t.igst)}</td></tr>}
                {Number(t.cgst) > 0 && <tr><td className={td}>CGST</td><td className={tdr}>{inr(t.cgst)}</td></tr>}
                {Number(t.sgst) > 0 && <tr><td className={td}>SGST or UTGST</td><td className={tdr}>{inr(t.sgst)}</td></tr>}
                {Number(t.cess) > 0 && <tr><td className={td}>Cess</td><td className={tdr}>{inr(t.cess)}</td></tr>}
                {Number(t.roundOff) !== 0 && <tr><td className={td}>Round off</td><td className={tdr}>{t.roundOff}</td></tr>}
                <tr className="border-t border-pos-line font-semibold"><td className={td}>{reverseCharge ? 'Amount payable (tax paid by the buyer)' : 'Invoice value'}</td><td className={tdr}>{inr(t.amountPayable)}</td></tr>
              </tbody>
            </table>
          )}
          <button type="button" disabled={saving || !preview || preview.errors.length > 0 || !customer} onClick={save} className={`${btnCls} mt-3`}>Save {DOC_LABEL[docType].toLowerCase()}</button>
        </div>
      </div>
    </section>
  );
}
