'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { btnCls, currentFy, DOC_LABEL, errorText, Field, fyLabel, inputCls, Notice, type Series, th, td } from './shared';

interface SellerForm {
  address1: string;
  address2: string;
  place: string;
  pincode: string;
  phone: string;
  email: string;
  bankDetails: string;
  terms: string;
}
const EMPTY: SellerForm = { address1: '', address2: '', place: '', pincode: '', phone: '', email: '', bankDetails: '', terms: '' };

/** The client's address as printed on its invoices (rule 46(a)) and its document number series. */
export function SettingsPanel({ gstin, onChanged }: { gstin: string; onChanged: () => void }) {
  const { authFetch } = useAuth();
  const [form, setForm] = useState<SellerForm>(EMPTY);
  const [version, setVersion] = useState<string | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [ns, setNs] = useState({ fy: currentFy(), docType: 'INV', prefix: '', padWidth: 4, startNo: 1 });

  const load = useCallback(async () => {
    const [s, r] = await Promise.all([authFetch(`/api/v1/billing/seller?gstin=${gstin}`), authFetch(`/api/v1/billing/series?gstin=${gstin}`)]);
    if (s.ok) {
      const b = await s.json();
      setVersion(b.version);
      const x = b.seller;
      setForm(b.version ? { address1: x.address1 ?? '', address2: x.address2 ?? '', place: x.place ?? '', pincode: x.pincode ?? '', phone: x.phone ?? '', email: x.email ?? '', bankDetails: x.bankDetails ?? '', terms: x.terms ?? '' } : EMPTY);
    }
    if (r.ok) setSeries((await r.json()).series);
  }, [authFetch, gstin]);
  useEffect(() => {
    void load();
  }, [load]);

  const saveSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await authFetch('/api/v1/billing/seller', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(version ? { 'if-match': `"${version}"` } : {}) },
      body: JSON.stringify({ gstin, ...form }),
    });
    if (!r.ok) return setMsg({ tone: 'error', text: await errorText(r) });
    setVersion((await r.json()).version);
    setMsg({ tone: 'ok', text: 'Address saved.' });
    onChanged();
  };

  const addSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await authFetch('/api/v1/billing/series', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gstin, ...ns, prefix: ns.prefix.toUpperCase() }) });
    if (!r.ok) return setMsg({ tone: 'error', text: await errorText(r) });
    setMsg({ tone: 'ok', text: 'Series added.' });
    await load();
    onChanged();
  };

  const set = (k: keyof SellerForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const sample = `${ns.prefix.toUpperCase()}${String(ns.startNo).padStart(ns.padWidth, '0')}`;

  return (
    <section className="space-y-4">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <form onSubmit={saveSeller} className="pos-card space-y-3 p-4">
        <h3 className="text-[14px] font-semibold text-pos-ink">Address on invoices</h3>
        <p className="text-[12px] text-pos-ink/60">Rule 46(a) needs the supplier&apos;s name, address and GSTIN on each invoice. The name comes from Client Master. The e-invoice and e-way bill need the PIN code.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Address line 1"><input required maxLength={100} value={form.address1} onChange={set('address1')} className={inputCls} /></Field>
          <Field label="Address line 2"><input maxLength={100} value={form.address2} onChange={set('address2')} className={inputCls} /></Field>
          <Field label="City or town"><input required minLength={3} maxLength={50} value={form.place} onChange={set('place')} className={inputCls} /></Field>
          <Field label="PIN code"><input required pattern="[1-9][0-9]{5}" value={form.pincode} onChange={set('pincode')} className={`${inputCls} font-mono`} /></Field>
          <Field label="Phone"><input maxLength={15} value={form.phone} onChange={set('phone')} className={inputCls} /></Field>
          <Field label="Email"><input type="email" maxLength={100} value={form.email} onChange={set('email')} className={inputCls} /></Field>
          <Field label="Bank details to print"><input maxLength={300} value={form.bankDetails} onChange={set('bankDetails')} className={inputCls} /></Field>
          <Field label="Terms to print"><input maxLength={500} value={form.terms} onChange={set('terms')} className={inputCls} /></Field>
        </div>
        <button type="submit" className={btnCls}>Save address</button>
      </form>

      <div className="pos-card overflow-x-auto">
        <h3 className="border-b border-pos-line px-4 py-3 text-[14px] font-semibold text-pos-ink">Number series</h3>
        <p className="px-4 pt-3 text-[12px] text-pos-ink/60">Rule 46(b): a consecutive serial number of up to 16 characters (capital letters, digits, &quot;-&quot; and &quot;/&quot;), unique for the financial year. Keep separate series for invoices and for credit and debit notes.</p>
        <table className="mt-2 w-full">
          <thead><tr><th className={th}>Year</th><th className={th}>Document</th><th className={th}>Prefix</th><th className={th}>Next number</th></tr></thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.id} className="border-t border-pos-line"><td className={td}>{fyLabel(s.fy)}</td><td className={td}>{DOC_LABEL[s.docType]}</td><td className={`${td} font-mono`}>{s.prefix || '(none)'}</td><td className={`${td} font-mono`}>{s.nextDocNo}</td></tr>
            ))}
            {!series.length && <tr><td colSpan={4} className={`${td} text-pos-ink/60`}>No series yet. Add one below before raising invoices.</td></tr>}
          </tbody>
        </table>
        <form onSubmit={addSeries} className="grid gap-3 border-t border-pos-line p-4 sm:grid-cols-6">
          <Field label="Financial year">
            <select value={ns.fy} onChange={(e) => setNs({ ...ns, fy: Number(e.target.value) })} className={inputCls}>
              {[currentFy() + 1, currentFy(), currentFy() - 1].map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
            </select>
          </Field>
          <Field label="Document">
            <select value={ns.docType} onChange={(e) => setNs({ ...ns, docType: e.target.value })} className={inputCls}>
              {Object.entries(DOC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Prefix"><input maxLength={15} value={ns.prefix} onChange={(e) => setNs({ ...ns, prefix: e.target.value.toUpperCase() })} placeholder="AT/26-27/" className={`${inputCls} font-mono`} /></Field>
          <Field label="Digits"><input type="number" min={1} max={10} value={ns.padWidth} onChange={(e) => setNs({ ...ns, padWidth: Number(e.target.value) })} className={inputCls} /></Field>
          <Field label="Start at"><input type="number" min={1} value={ns.startNo} onChange={(e) => setNs({ ...ns, startNo: Number(e.target.value) })} className={inputCls} /></Field>
          <div className="flex flex-col justify-end gap-1">
            <span className={`text-[12px] font-mono ${sample.length > 16 ? 'text-[#b91c1c]' : 'text-pos-ink/70'}`}>{sample} ({sample.length}/16)</span>
            <button type="submit" className={btnCls}>Add series</button>
          </div>
        </form>
      </div>
    </section>
  );
}
