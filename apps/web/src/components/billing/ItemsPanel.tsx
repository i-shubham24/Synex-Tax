'use client';

import React, { useState } from 'react';
import { BILLING_GST_RATES, BILLING_UQC } from '@synextax/tax-engine';
import { useAuth } from '../../context/AuthContext';
import { btnCls, errorText, Field, ghostCls, inputCls, type Item, Notice, th, thr, td, tdr } from './shared';

interface Form {
  name: string;
  hsn: string;
  isService: boolean;
  unit: string;
  gstRate: number;
  cessRate: number;
  salePrice: string;
  openingQty: string;
  openingValue: string;
  active: boolean;
}
const EMPTY: Form = { name: '', hsn: '', isService: false, unit: 'NOS', gstRate: 18, cessRate: 0, salePrice: '0', openingQty: '0', openingValue: '0', active: true };

/** Goods and services the client sells: HSN or SAC, unit (UQC), GST rate and opening stock. */
export function ItemsPanel({ gstin, items, reload }: { gstin: string; items: Item[]; reload: () => void }) {
  const { authFetch } = useAuth();
  const [form, setForm] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState<Item | null>(null);
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = editing
      ? await authFetch(`/api/v1/billing/items/${editing.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'if-match': `"${editing.version}"` }, body: JSON.stringify(form) })
      : await authFetch('/api/v1/billing/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gstin, ...form }) });
    if (!r.ok) return setMsg({ tone: 'error', text: await errorText(r) });
    setMsg({ tone: 'ok', text: editing ? 'Item updated.' : 'Item added.' });
    setForm(EMPTY);
    setEditing(null);
    reload();
  };

  const edit = (i: Item) => {
    setEditing(i);
    setForm({ name: i.name, hsn: i.hsn, isService: i.isService, unit: i.unit, gstRate: i.gstRate, cessRate: i.cessRate, salePrice: i.salePrice, openingQty: i.openingQty, openingValue: i.openingValue, active: i.active });
  };

  return (
    <section className="space-y-4">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <form onSubmit={save} className="pos-card space-y-3 p-4">
        <h3 className="text-[14px] font-semibold text-pos-ink">{editing ? `Edit ${editing.name}` : 'Add an item'}</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Name"><input required minLength={3} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></Field>
          <Field label="Goods or service">
            <select value={form.isService ? 'S' : 'G'} onChange={(e) => setForm({ ...form, isService: e.target.value === 'S', unit: e.target.value === 'S' ? 'OTH' : form.unit })} className={inputCls}>
              <option value="G">Goods</option>
              <option value="S">Service</option>
            </select>
          </Field>
          <Field label={form.isService ? 'SAC' : 'HSN'} hint="4, 6 or 8 digits"><input required pattern="[0-9]{4}|[0-9]{6}|[0-9]{8}" value={form.hsn} onChange={(e) => setForm({ ...form, hsn: e.target.value.trim() })} className={`${inputCls} font-mono`} /></Field>
          <Field label="Unit (UQC)">
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={inputCls}>
              {Object.entries(BILLING_UQC as Record<string, string>).map(([k, v]) => <option key={k} value={k}>{k} {v}</option>)}
            </select>
          </Field>
          <Field label="GST rate %">
            <select value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: Number(e.target.value) })} className={inputCls}>
              {(BILLING_GST_RATES as number[]).map((r) => <option key={r} value={r}>{r}%</option>)}
            </select>
          </Field>
          <Field label="Cess rate %"><input type="number" min={0} max={999} step="0.001" value={form.cessRate} onChange={(e) => setForm({ ...form, cessRate: Number(e.target.value) })} className={inputCls} /></Field>
          <Field label="Sale rate"><input inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,3})?" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} className={`${inputCls} font-mono`} /></Field>
          {!form.isService && (
            <>
              <Field label="Opening quantity"><input inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,3})?" value={form.openingQty} onChange={(e) => setForm({ ...form, openingQty: e.target.value })} className={`${inputCls} font-mono`} /></Field>
              <Field label="Opening value"><input inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={form.openingValue} onChange={(e) => setForm({ ...form, openingValue: e.target.value })} className={`${inputCls} font-mono`} /></Field>
            </>
          )}
          <label className="flex items-center gap-2 self-end text-[13px] text-pos-ink/80"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> In use</label>
        </div>
        <div className="flex gap-2">
          <button type="submit" className={btnCls}>{editing ? 'Save item' : 'Add item'}</button>
          {editing && <button type="button" className={ghostCls} onClick={() => { setEditing(null); setForm(EMPTY); }}>Cancel edit</button>}
        </div>
      </form>

      <div className="pos-card overflow-x-auto">
        <table className="w-full">
          <thead><tr><th className={th}>Item</th><th className={th}>HSN or SAC</th><th className={th}>Unit</th><th className={thr}>GST</th><th className={thr}>Sale rate</th><th className={thr}>Opening stock</th><th className={th} /></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={`border-t border-pos-line ${i.active ? '' : 'opacity-60'}`}>
                <td className={td}>{i.name}{i.isService ? <span className="ml-2 text-[11px] text-pos-ink/60">Service</span> : null}</td>
                <td className={`${td} font-mono`}>{i.hsn}</td>
                <td className={td}>{i.unit}</td>
                <td className={tdr}>{i.gstRate}%</td>
                <td className={tdr}>{Number(i.salePrice).toFixed(2)}</td>
                <td className={tdr}>{i.isService ? '' : `${Number(i.openingQty)} ${i.unit}`}</td>
                <td className={td}><button type="button" className="text-[13px] font-medium text-pos-accent" onClick={() => edit(i)}>Edit</button></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={7} className={`${td} text-pos-ink/60`}>No items yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
