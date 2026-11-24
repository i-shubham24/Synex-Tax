'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { btnCls, dmy, errorText, Field, inputCls, inr, type Item, Notice, th, thr, td, tdr, today } from './shared';

interface StockRow {
  itemId: string;
  name: string;
  unit: string;
  openingQty: string;
  openingValue: string;
  inwardQty: string;
  inwardValue: string;
  outwardQty: string;
  returnedQty: string;
  closingQty: string;
  averageCost: string;
  closingValue: string;
  short: boolean;
}
interface Purchase {
  id: string;
  itemName: string;
  unit: string;
  supplierName: string;
  supplierGstin: string | null;
  billNo: string;
  billDate: string;
  quantity: string;
  value: string;
  status: string;
  version: string;
}

const qty = (v: string) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 });

/** Purchases entered for stock, and the register: opening, in, out, returns and closing by item. */
export function StockPanel({ gstin, items }: { gstin: string; items: Item[] }) {
  const { authFetch } = useAuth();
  const goods = items.filter((i) => !i.isService);
  const [asOn, setAsOn] = useState(today());
  const [rows, setRows] = useState<StockRow[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [form, setForm] = useState({ itemId: '', supplierName: '', supplierGstin: '', billNo: '', billDate: today(), quantity: '', value: '' });

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([authFetch(`/api/v1/billing/stock?gstin=${gstin}&to=${asOn}`), authFetch(`/api/v1/billing/purchases?gstin=${gstin}`)]);
    if (s.ok) setRows((await s.json()).rows || []);
    if (p.ok) setPurchases((await p.json()).purchases || []);
  }, [authFetch, gstin, asOn]);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await authFetch('/api/v1/billing/purchases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gstin, ...form, itemId: form.itemId || goods[0]?.id }) });
    if (!r.ok) return setMsg({ tone: 'error', text: await errorText(r) });
    setMsg({ tone: 'ok', text: 'Purchase entered.' });
    setForm({ ...form, billNo: '', quantity: '', value: '' });
    await load();
  };
  const cancel = async (p: Purchase) => {
    const r = await authFetch(`/api/v1/billing/purchases/${p.id}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json', 'if-match': `"${p.version}"` }, body: '{}' });
    if (!r.ok) return setMsg({ tone: 'error', text: await errorText(r) });
    await load();
  };

  return (
    <section className="space-y-4">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="pos-card overflow-x-auto">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-pos-line px-4 py-3">
          <h3 className="text-[14px] font-semibold text-pos-ink">Stock register</h3>
          <Field label="As on"><input type="date" value={asOn} onChange={(e) => setAsOn(e.target.value)} className={inputCls} /></Field>
        </div>
        <table className="w-full">
          <thead><tr><th className={th}>Item</th><th className={thr}>Opening</th><th className={thr}>Purchased</th><th className={thr}>Sold</th><th className={thr}>Returned</th><th className={thr}>Closing</th><th className={thr}>Average cost</th><th className={thr}>Closing value</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.itemId} className="border-t border-pos-line">
                <td className={td}>{r.name}{r.short && <span className="ml-2 text-[12px] text-[#b91c1c]">More sold than in stock</span>}</td>
                <td className={tdr}>{qty(r.openingQty)} {r.unit}</td>
                <td className={tdr}>{qty(r.inwardQty)}</td>
                <td className={tdr}>{qty(r.outwardQty)}</td>
                <td className={tdr}>{qty(r.returnedQty)}</td>
                <td className={tdr}>{qty(r.closingQty)} {r.unit}</td>
                <td className={tdr}>{Number(r.averageCost).toFixed(2)}</td>
                <td className={tdr}>{inr(r.closingValue)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className={`${td} text-pos-ink/60`}>No goods items yet.</td></tr>}
          </tbody>
        </table>
        <p className="border-t border-pos-line px-4 py-2 text-[12px] text-pos-ink/60">Sales come from invoice lines linked to an item; credit notes with quantities bring stock back. Closing stock is valued at the weighted average cost of opening stock and purchases.</p>
      </div>

      <form onSubmit={add} className="pos-card space-y-3 p-4">
        <h3 className="text-[14px] font-semibold text-pos-ink">Enter a purchase</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Item"><select required value={form.itemId || goods[0]?.id || ''} onChange={(e) => setForm({ ...form, itemId: e.target.value })} className={inputCls}>{goods.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
          <Field label="Supplier"><input required minLength={2} maxLength={100} value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} className={inputCls} /></Field>
          <Field label="Supplier GSTIN"><input maxLength={15} value={form.supplierGstin} onChange={(e) => setForm({ ...form, supplierGstin: e.target.value.toUpperCase() })} className={`${inputCls} font-mono`} /></Field>
          <Field label="Bill number"><input required maxLength={32} value={form.billNo} onChange={(e) => setForm({ ...form, billNo: e.target.value })} className={inputCls} /></Field>
          <Field label="Bill date"><input type="date" required value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value })} className={inputCls} /></Field>
          <Field label="Quantity"><input required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,3})?" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={`${inputCls} font-mono`} /></Field>
          <Field label="Value before tax"><input required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className={`${inputCls} font-mono`} /></Field>
          <div className="flex items-end"><button type="submit" disabled={!goods.length} className={btnCls}>Add purchase</button></div>
        </div>
      </form>

      <div className="pos-card overflow-x-auto">
        <table className="w-full">
          <thead><tr><th className={th}>Date</th><th className={th}>Bill</th><th className={th}>Supplier</th><th className={th}>Item</th><th className={thr}>Quantity</th><th className={thr}>Value</th><th className={th} /></tr></thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id} className={`border-t border-pos-line ${p.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
                <td className={td}>{dmy(p.billDate)}</td><td className={td}>{p.billNo}</td><td className={td}>{p.supplierName}</td><td className={td}>{p.itemName}</td>
                <td className={tdr}>{qty(p.quantity)} {p.unit}</td><td className={tdr}>{inr(p.value)}</td>
                <td className={td}>{p.status === 'ACTIVE' ? <button type="button" className="text-[13px] text-pos-ink/70 hover:text-[#b91c1c]" onClick={() => cancel(p)}>Cancel</button> : 'Cancelled'}</td>
              </tr>
            ))}
            {!purchases.length && <tr><td colSpan={7} className={`${td} text-pos-ink/60`}>No purchases entered.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
