'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export const inputCls = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
export const selectCls = 'h-9 rounded-[10px] border border-pos-line bg-pos-surface px-2 text-[13px] text-pos-ink';
export const num = (v: string | undefined) => (v ? Number(v) : undefined);

export type Details = Record<string, string>;

/** Details every return file needs. The PAN, account number and other details are sent once and not stored. */
export const PERSON_FIELDS: Array<[key: string, label: string, type?: string]> = [
  ['firstName', 'First name'], ['surname', 'Surname'], ['pan', 'PAN'], ['dob', 'Date of birth', 'date'],
  ['fatherName', "Father's name"], ['mobile', 'Mobile'], ['email', 'Email', 'email'], ['residenceNo', 'Flat or house number'],
  ['locality', 'Area or locality'], ['city', 'City or district'], ['stateCode', 'State code (e.g. 26 Punjab)'], ['pin', 'PIN code'],
  ['place', 'Place of signing'], ['bankIfsc', 'Bank IFSC'], ['bankName', 'Bank name'], ['bankAccount', 'Account number'],
];

export function personBody(d: Details) {
  return {
    person: {
      firstName: d.firstName || undefined, surname: d.surname ?? '', pan: (d.pan ?? '').toUpperCase(), dob: d.dob ?? '',
      address: { residenceNo: d.residenceNo ?? '', locality: d.locality ?? '', city: d.city ?? '', stateCode: d.stateCode ?? '', pin: d.pin ?? '' },
      mobile: d.mobile ?? '', email: d.email ?? '', fatherName: d.fatherName ?? '', place: d.place ?? '',
    },
    bank: { ifsc: (d.bankIfsc ?? '').toUpperCase(), name: d.bankName ?? '', account: d.bankAccount ?? '', type: 'SB' },
  };
}

export function Fields({ fields, d, setD }: { fields: Array<[string, string, string?]>; d: Details; setD: (d: Details) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {fields.map(([k, label, type]) => (
        <label key={k} className="text-[12px] text-pos-ink/60">{label}
          <input type={type ?? 'text'} value={d[k] ?? ''} onChange={(e) => setD({ ...d, [k]: e.target.value })} className={inputCls} autoComplete="off" />
        </label>
      ))}
    </div>
  );
}

export function useSoftwareId() {
  const { authFetch } = useAuth();
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    authFetch('/api/v1/itr/status').then(async (r) => setConfigured(r.ok ? (await r.json()).softwareIdConfigured : false)).catch(() => setConfigured(false));
  }, [authFetch]);
  return configured;
}

export interface ExportState { issues: { field: string; message: string }[]; error: string | null; summary: Record<string, number> | null }

/** Posts the return to the API; downloads the JSON when written, otherwise keeps the checks. */
export function useItrExport(path: string) {
  const { authFetch } = useAuth();
  const [state, setState] = useState<ExportState>({ issues: [], error: null, summary: null });
  const [busy, setBusy] = useState(false);
  const run = async (body: unknown) => {
    setBusy(true);
    setState({ issues: [], error: null, summary: null });
    try {
      const r = await authFetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => ({}));
      if (r.status === 422) return setState({ issues: b.issues ?? [], error: null, summary: b.summary ?? null });
      if (!r.ok) return setState({ issues: [], error: b.message ?? 'Not prepared.', summary: null });
      setState({ issues: [], error: null, summary: b.summary ?? null });
      const url = URL.createObjectURL(new Blob([JSON.stringify(b.json)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = b.fileName; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setState({ issues: [], error: 'Could not reach the server.', summary: null });
    } finally {
      setBusy(false);
    }
  };
  return { ...state, busy, run };
}

const inr = (v: number | undefined) => `₹${(v ?? 0).toLocaleString('en-IN')}`;

export function ExportResult({ state, configured }: { state: ExportState; configured: boolean | null }) {
  const s = state.summary;
  return (
    <>
      {configured === false && <p className="rounded-[10px] bg-[#b45309]/10 px-3 py-2 text-[13px] text-[#b45309]">The schema needs the software ID the Department issues to a registered e-return intermediary. Set ITR_SOFTWARE_ID on the server once the firm is registered; until then the file is checked but not written.</p>}
      {state.error && <p className="text-[13px] text-[#dc2626]">{state.error}</p>}
      {state.issues.length > 0 && <ul className="list-disc space-y-1 pl-5 text-[13px] text-[#dc2626]">{state.issues.map((i, k) => <li key={k}>{i.message}</li>)}</ul>}
      {s && <p className="text-[13px] text-pos-ink/70">Total income <span className="font-mono">{inr(s.totalIncome)}</span>, tax <span className="font-mono">{inr(s.tax)}</span>, interest and fee <span className="font-mono">{inr(s.interest)}</span>, {s.refund ? <>refund <span className="font-mono">{inr(s.refund)}</span></> : <>to pay <span className="font-mono">{inr(s.payable)}</span></>}.</p>}
    </>
  );
}

export function RegimeAndSection({ regime, setRegime, section, setSection }: { regime: 'NEW' | 'OLD'; setRegime: (r: 'NEW' | 'OLD') => void; section: 11 | 12 | 17; setSection: (s: 11 | 12 | 17) => void }) {
  return (
    <>
      <label className="flex items-center gap-2">Regime
        <select value={regime} onChange={(e) => setRegime(e.target.value as 'NEW' | 'OLD')} className={selectCls}><option value="NEW">New</option><option value="OLD">Old (opting out)</option></select>
      </label>
      <label className="flex items-center gap-2">Return
        <select value={section} onChange={(e) => setSection(Number(e.target.value) as 11 | 12 | 17)} className={selectCls}><option value={11}>On time, 139(1)</option><option value={12}>Belated, 139(4)</option><option value={17}>Revised, 139(5)</option></select>
      </label>
    </>
  );
}
