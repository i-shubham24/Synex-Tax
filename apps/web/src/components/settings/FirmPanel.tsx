'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

interface Firm {
  legalName: string;
  tradeName: string | null;
  frn: string | null;
  pan: string | null;
  gstin: string | null;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  pin: string | null;
  me: string | null;
  version: string;
  canEdit: boolean;
}

type Form = Record<'legalName' | 'tradeName' | 'frn' | 'pan' | 'gstin' | 'phone' | 'addressLine' | 'city' | 'pin', string>;

const FIELDS: Array<{ key: keyof Form; label: string; hint?: string; mono?: boolean; upper?: boolean; max: number; wide?: boolean; required?: boolean; inputMode?: 'numeric' | 'tel' }> = [
  { key: 'legalName', label: 'Firm name', max: 200, wide: true, required: true },
  { key: 'tradeName', label: 'Name used on letters and invoices', hint: 'If different from the firm name', max: 200, wide: true },
  { key: 'frn', label: 'ICAI firm registration number', hint: '6 digits and a letter, for example 014289N', mono: true, upper: true, max: 7 },
  { key: 'pan', label: 'Firm PAN', mono: true, upper: true, max: 10 },
  { key: 'gstin', label: 'Firm GSTIN', hint: 'Leave empty if the firm is not registered', mono: true, upper: true, max: 15 },
  { key: 'phone', label: 'Office phone', hint: '+91 and 10 digits, or a landline with STD code', max: 16, inputMode: 'tel' },
  { key: 'addressLine', label: 'Office address', max: 200, wide: true },
  { key: 'city', label: 'City', max: 80 },
  { key: 'pin', label: 'PIN code', mono: true, max: 6, inputMode: 'numeric' },
];

const toForm = (f: Firm): Form => ({
  legalName: f.legalName ?? '',
  tradeName: f.tradeName ?? '',
  frn: f.frn ?? '',
  pan: f.pan ?? '',
  gstin: f.gstin ?? '',
  phone: f.phone ?? '',
  addressLine: f.addressLine ?? '',
  city: f.city ?? '',
  pin: f.pin ?? '',
});

/** The firm's own details, from the server; a partner edits them. */
export function FirmPanel() {
  const { authFetch, user } = useAuth();
  const [firm, setFirm] = useState<Firm | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [state, setState] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await authFetch('/api/v1/firm');
    if (!r.ok) return setState({ tone: 'bad', text: 'The firm’s details could not be loaded.' });
    const f = (await r.json()) as Firm;
    setFirm(f);
    setForm(toForm(f));
  }, [authFetch]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !firm) return;
    setSaving(true);
    setState(null);
    try {
      const r = await authFetch('/api/v1/firm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': `"${firm.version}"` },
        body: JSON.stringify(form),
      });
      const b = await r.json().catch(() => ({}));
      if (r.status === 409) {
        setState({ tone: 'bad', text: b.message ?? 'Someone else saved first. The latest details are shown now.' });
        await load();
        return;
      }
      if (!r.ok) return setState({ tone: 'bad', text: b.message ?? 'Not saved.' });
      setFirm({ ...firm, version: b.version });
      setState({ tone: 'ok', text: 'Saved. The change is in the audit trail.' });
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full rounded-lg border border-pos-line bg-pos-surface px-3 py-2 text-sm text-pos-ink focus:border-pos-accent focus:outline-none disabled:opacity-60';

  return (
    <div className="space-y-6">
      <div className="border-b border-pos-line pb-4">
        <h3 className="text-lg font-semibold text-pos-ink">Firm</h3>
        <p className="mt-1 text-xs text-pos-ink/70">The details clients and the department see on your invoices, statements and reminders.</p>
      </div>

      {!form ? (
        <p className="text-sm text-pos-ink/60">{state?.text ?? 'Loading'}</p>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className={`block space-y-1 ${f.wide ? 'sm:col-span-2' : ''}`}>
                <span className="block text-xs font-semibold text-pos-ink">{f.label}</span>
                <input
                  className={`${input} ${f.mono ? 'font-mono' : ''} ${f.upper ? 'uppercase' : ''}`}
                  value={form[f.key]}
                  maxLength={f.max}
                  required={f.required}
                  inputMode={f.inputMode}
                  disabled={!firm?.canEdit}
                  onChange={(e) => setForm({ ...form, [f.key]: f.upper ? e.target.value.toUpperCase() : e.target.value })}
                />
                {f.hint && <span className="block text-[12px] text-pos-ink/60">{f.hint}</span>}
              </label>
            ))}
          </div>

          <div className="space-y-1 rounded-lg border border-pos-line bg-pos-muted p-3 text-xs text-pos-ink/70">
            <div>
              Signed in as <span className="font-semibold text-pos-ink">{firm?.me ?? user?.fullName}</span>, {user?.email}
            </div>
            <div>Your own name and sign-in email are changed under Security.</div>
          </div>

          {state && (
            <p role={state.tone === 'bad' ? 'alert' : 'status'} className={`text-xs ${state.tone === 'bad' ? 'text-red-600' : 'text-emerald-600'}`}>
              {state.text}
            </p>
          )}

          <div className="border-t border-pos-line pt-4">
            {firm?.canEdit ? (
              <button type="submit" disabled={saving} className="rounded-xl bg-pos-accent px-6 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-pos-accent-deep disabled:opacity-50">
                {saving ? 'Saving' : 'Save'}
              </button>
            ) : (
              <p className="text-xs text-pos-ink/60">Only a partner can change the firm’s details.</p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
