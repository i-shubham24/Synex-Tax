'use client';

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { btnCls, type Customer, errorText, Field, ghostCls, inputCls, Notice, STATES, stateName, th, td } from './shared';

interface Form {
  legalName: string;
  tradeName: string;
  gstin: string;
  stateCode: string;
  address1: string;
  address2: string;
  place: string;
  pincode: string;
  phone: string;
  email: string;
  active: boolean;
}

/** Buyers of the client: registered (with GSTIN) or unregistered, with the state used for place of supply. */
export function CustomersPanel({ gstin, customers, reload }: { gstin: string; customers: Customer[]; reload: () => void }) {
  const { authFetch } = useAuth();
  const blank: Form = { legalName: '', tradeName: '', gstin: '', stateCode: gstin.slice(0, 2), address1: '', address2: '', place: '', pincode: '', phone: '', email: '', active: true };
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { ...form, gstin: form.gstin.trim().toUpperCase() || null };
    const r = editing
      ? await authFetch(`/api/v1/billing/customers/${editing.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'if-match': `"${editing.version}"` }, body: JSON.stringify(body) })
      : await authFetch('/api/v1/billing/customers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientGstin: gstin, ...body }) });
    if (!r.ok) return setMsg({ tone: 'error', text: await errorText(r) });
    setMsg({ tone: 'ok', text: editing ? 'Customer updated.' : 'Customer added.' });
    setForm(blank);
    setEditing(null);
    reload();
  };

  const edit = (c: Customer) => {
    setEditing(c);
    setForm({ legalName: c.legalName, tradeName: c.tradeName ?? '', gstin: c.gstin ?? '', stateCode: c.stateCode, address1: c.address1, address2: c.address2 ?? '', place: c.place, pincode: c.pincode ?? '', phone: c.phone ?? '', email: c.email ?? '', active: c.active });
  };
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <section className="space-y-4">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <form onSubmit={save} className="pos-card space-y-3 p-4">
        <h3 className="text-[14px] font-semibold text-pos-ink">{editing ? `Edit ${editing.legalName}` : 'Add a customer'}</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Legal name"><input required minLength={3} maxLength={100} value={form.legalName} onChange={set('legalName')} className={inputCls} /></Field>
          <Field label="Trade name"><input maxLength={100} value={form.tradeName} onChange={set('tradeName')} className={inputCls} /></Field>
          <Field label="GSTIN" hint="Leave blank for an unregistered buyer">
            <input
              maxLength={15}
              value={form.gstin}
              onChange={(e) => {
                const g = e.target.value.toUpperCase();
                setForm({ ...form, gstin: g, stateCode: /^[0-9]{2}/.test(g) ? g.slice(0, 2) : form.stateCode });
              }}
              className={`${inputCls} font-mono`}
            />
          </Field>
          <Field label="State">
            <select value={form.stateCode} onChange={(e) => setForm({ ...form, stateCode: e.target.value })} className={inputCls}>
              {STATES.map(([code, name]) => <option key={code} value={code}>{code} {name}</option>)}
            </select>
          </Field>
          <Field label="Address line 1"><input required maxLength={100} value={form.address1} onChange={set('address1')} className={inputCls} /></Field>
          <Field label="Address line 2"><input maxLength={100} value={form.address2} onChange={set('address2')} className={inputCls} /></Field>
          <Field label="City or town"><input required minLength={3} maxLength={50} value={form.place} onChange={set('place')} className={inputCls} /></Field>
          <Field label="PIN code" hint="Needed for the e-invoice and e-way bill"><input pattern="[1-9][0-9]{5}" value={form.pincode} onChange={set('pincode')} className={`${inputCls} font-mono`} /></Field>
          <Field label="Phone"><input maxLength={15} value={form.phone} onChange={set('phone')} className={inputCls} /></Field>
          <Field label="Email"><input type="email" maxLength={100} value={form.email} onChange={set('email')} className={inputCls} /></Field>
          <label className="flex items-center gap-2 self-end text-[13px] text-pos-ink/80"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> In use</label>
        </div>
        <div className="flex gap-2">
          <button type="submit" className={btnCls}>{editing ? 'Save customer' : 'Add customer'}</button>
          {editing && <button type="button" className={ghostCls} onClick={() => { setEditing(null); setForm(blank); }}>Cancel edit</button>}
        </div>
      </form>

      <div className="pos-card overflow-x-auto">
        <table className="w-full">
          <thead><tr><th className={th}>Customer</th><th className={th}>GSTIN</th><th className={th}>State</th><th className={th}>Place</th><th className={th} /></tr></thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className={`border-t border-pos-line ${c.active ? '' : 'opacity-60'}`}>
                <td className={td}>{c.legalName}</td>
                <td className={`${td} font-mono text-[12px]`}>{c.gstin ?? 'Unregistered'}</td>
                <td className={td}>{stateName(c.stateCode)}</td>
                <td className={td}>{c.place}{c.pincode ? ` ${c.pincode}` : ''}</td>
                <td className={td}><button type="button" className="text-[13px] font-medium text-pos-accent" onClick={() => edit(c)}>Edit</button></td>
              </tr>
            ))}
            {!customers.length && <tr><td colSpan={5} className={`${td} text-pos-ink/60`}>No customers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
