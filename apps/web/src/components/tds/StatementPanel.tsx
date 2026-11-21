'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import { DEDUCTOR_TYPES, PROTEAN_STATE_CODES } from '@synextax/tax-engine';
import { useAuth } from '../../context/AuthContext';

interface ReturnRow { id: string; form_code: string; quarter: string; tax_year: number; workflow_status: string; source?: string; total_deductees: number }
interface Addr { line1: string; line2?: string; line3?: string; line4?: string; district?: string; state: string; pin: string }
const EMPTY: Addr = { line1: '', line3: '', district: '', state: 'PUNJAB', pin: '' };
const STATES = Object.keys(PROTEAN_STATE_CODES);
const input = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
const ty = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;

function AddressFields({ value, onChange, label }: { value: Addr; onChange: (a: Addr) => void; label: string }) {
  const set = (k: keyof Addr) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <fieldset className="grid gap-2 sm:grid-cols-3">
      <legend className="mb-1 text-[12px] font-medium text-pos-ink/55">{label}</legend>
      <input aria-label={`${label} flat or building`} placeholder="Flat, door or building" maxLength={25} className={input} value={value.line1} onChange={set('line1')} />
      <input aria-label={`${label} road`} placeholder="Road or street" maxLength={25} className={input} value={value.line3 ?? ''} onChange={set('line3')} />
      <input aria-label={`${label} district`} placeholder="District" maxLength={25} className={input} value={value.district ?? ''} onChange={set('district')} />
      <select aria-label={`${label} state`} className={input} value={value.state} onChange={set('state')}>
        {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <input aria-label={`${label} PIN`} placeholder="PIN" inputMode="numeric" maxLength={6} className={input} value={value.pin} onChange={set('pin')} />
    </fieldset>
  );
}

/** Prepare the upload-ready Form 138, 140, 144 or 143 text file for a return; fix whatever the file format requires first. */
export function StatementPanel({ tan }: { tan: string }) {
  const { authFetch, user } = useAuth();
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [issues, setIssues] = useState<Array<{ where: string; message: string }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [d, setD] = useState({ deductorType: 'K', address: EMPTY, deductorEmail: '', deductorPhone: '', gstin: '', rName: '', rDesignation: '', rPan: '', rAddress: EMPTY, rEmail: '', rPhone: '' });
  const canEdit = ['PARTNER', 'MANAGER'].includes(user?.role ?? '');

  const load = useCallback(async () => {
    if (!tan) return;
    const r = await authFetch(`/api/v1/tds/returns?tan=${tan}`);
    if (r.ok) setReturns((await r.json()).returns);
    const t = await authFetch(`/api/v1/tds/tan-details?tan=${tan}`);
    if (t.ok) {
      const x = await t.json();
      const addr = (a: Partial<Addr> | null): Addr => ({ ...EMPTY, ...(a ?? {}), state: String(a?.state ?? 'PUNJAB').toUpperCase() });
      setD({
        deductorType: x.deductor_type_code || 'K', address: addr(x.address), deductorEmail: x.deductor_email ?? '', deductorPhone: x.deductor_phone ?? '', gstin: x.gstin ?? '',
        rName: x.responsible_person_name ?? '', rDesignation: x.responsible_person_designation ?? '', rPan: x.responsible_person_pan ?? '',
        rAddress: addr(x.responsible_address), rEmail: x.responsible_email ?? '', rPhone: x.responsible_phone ?? '',
      });
    }
  }, [authFetch, tan]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function write(id: string) {
    setMessage(null);
    setIssues([]);
    const r = await authFetch(`/api/v1/tds/returns/${id}/statement`, { method: 'POST' });
    const body = await r.json();
    if (r.ok) {
      const url = URL.createObjectURL(new Blob([body.text], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = body.fileName;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`${body.fileName} is ready. Validate it with Protean's FVU 1.2 before uploading; SynexTax checked the file format rules it can check without the FVU.`);
    } else {
      setIssues(body.issues ?? []);
      if ((body.issues ?? []).some((i: { where: string }) => /Deductor|Responsible/.test(i.where))) setShowDetails(true);
    }
  }

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    const r = await authFetch('/api/v1/tds/tan-details', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tan, deductorType: d.deductorType, address: d.address, deductorEmail: d.deductorEmail, deductorPhone: d.deductorPhone, gstin: d.gstin,
        responsible: { name: d.rName, designation: d.rDesignation, pan: d.rPan.toUpperCase(), address: d.rAddress, email: d.rEmail, phone: d.rPhone },
      }),
    });
    setMessage(r.ok ? 'Details saved. Write the statement again.' : 'Check the details: phone numbers have 10 digits, PAN is 10 characters.');
    if (r.ok) setShowDetails(false);
  }

  async function saveToken(id: string) {
    const token = window.prompt('15-digit token number received for this statement');
    if (!token) return;
    const r = await authFetch(`/api/v1/tds/returns/${id}/token`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token.trim() }) });
    setMessage(r.ok ? 'Token number saved.' : (await r.json()).error);
  }

  if (!tan) return <p className="pos-card p-4 text-[13.5px] text-pos-ink/60">Choose a TAN above to prepare its statements.</p>;

  return (
    <div className="space-y-4">
      <section className="pos-card overflow-hidden">
        <h2 className="border-b border-pos-line px-4 py-3 text-[14px] font-semibold text-pos-ink">Statements for {tan}</h2>
        <ul>
          {returns.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-pos-line px-4 py-2.5 text-[13px] first:border-t-0">
              <span className="text-pos-ink">Form {r.form_code}, {r.quarter} {/Q$/.test(r.form_code) ? 'FY' : 'TY'} {ty(r.tax_year)} <span className="text-pos-ink/45">({r.workflow_status.toLowerCase()}{r.source === 'IMPORTED' ? ', imported' : ''}, {r.total_deductees} {Number(r.total_deductees) === 1 ? 'row' : 'rows'})</span></span>
              {['FILED', 'CLOSED'].includes(r.workflow_status) ? (
                <button type="button" onClick={() => saveToken(r.id)} className="rounded-full border border-pos-line px-3 py-1 text-[12px] text-pos-ink/70">Record token number</button>
              ) : ['138', '140', '144', '143'].includes(r.form_code) ? (
                <button type="button" onClick={() => write(r.id)} className="inline-flex items-center gap-1.5 rounded-full bg-pos-accent px-3 py-1 text-[12px] font-medium text-white"><Download className="h-3.5 w-3.5" /> Write statement file</button>
              ) : (
                <span className="text-[12px] text-pos-ink/45">Form {r.form_code} files are coming</span>
              )}
            </li>
          ))}
          {!returns.length && <li className="px-4 py-3 text-[13px] text-pos-ink/55">No returns for this TAN yet.</li>}
        </ul>
      </section>

      {issues.length > 0 && (
        <section className="pos-card p-4">
          <h3 className="text-[13.5px] font-semibold text-[#b91c1c]">Fix these before the file can be written</h3>
          <ul className="mt-2 space-y-1 text-[13px]">
            {issues.map((i, k) => <li key={k} className="flex gap-2 text-pos-ink/80"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#b45309]" /><span><b>{i.where}:</b> {i.message}</span></li>)}
          </ul>
        </section>
      )}

      {showDetails && canEdit && (
        <form onSubmit={saveDetails} className="pos-card space-y-4 p-4" aria-label="Deductor details for the statement">
          <h3 className="text-[13.5px] font-semibold text-pos-ink">Deductor and responsible person</h3>
          <div className="grid gap-2 sm:grid-cols-4">
            <select aria-label="Deductor category" className={input} value={d.deductorType} onChange={(e) => setD({ ...d, deductorType: e.target.value })}>
              {Object.entries(DEDUCTOR_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input aria-label="Deductor email" placeholder="Deductor email" className={input} value={d.deductorEmail} onChange={(e) => setD({ ...d, deductorEmail: e.target.value })} />
            <input aria-label="Deductor phone" placeholder="Phone (10 digits)" inputMode="numeric" maxLength={10} className={input} value={d.deductorPhone} onChange={(e) => setD({ ...d, deductorPhone: e.target.value.replace(/\D/g, '') })} />
            <input aria-label="Deductor GSTIN" placeholder="GSTIN (optional)" maxLength={15} className={input} value={d.gstin} onChange={(e) => setD({ ...d, gstin: e.target.value.toUpperCase() })} />
          </div>
          <AddressFields label="Deductor address" value={d.address} onChange={(a) => setD({ ...d, address: a })} />
          <div className="grid gap-2 sm:grid-cols-5">
            <input aria-label="Responsible person name" placeholder="Responsible person" className={input} value={d.rName} onChange={(e) => setD({ ...d, rName: e.target.value })} />
            <input aria-label="Designation" placeholder="Designation" maxLength={20} className={input} value={d.rDesignation} onChange={(e) => setD({ ...d, rDesignation: e.target.value })} />
            <input aria-label="Responsible person PAN" placeholder="PAN" maxLength={10} className={`${input} font-mono uppercase`} value={d.rPan} onChange={(e) => setD({ ...d, rPan: e.target.value })} />
            <input aria-label="Responsible person email" placeholder="Email" className={input} value={d.rEmail} onChange={(e) => setD({ ...d, rEmail: e.target.value })} />
            <input aria-label="Responsible person phone" placeholder="Phone (10 digits)" inputMode="numeric" maxLength={10} className={input} value={d.rPhone} onChange={(e) => setD({ ...d, rPhone: e.target.value.replace(/\D/g, '') })} />
          </div>
          <AddressFields label="Responsible person address" value={d.rAddress} onChange={(a) => setD({ ...d, rAddress: a })} />
          <button type="submit" className="rounded-full bg-[#22a356] px-4 py-2 text-[13px] font-medium text-white">Save details</button>
        </form>
      )}
      {message && <p role="status" className="text-[13.5px] text-pos-ink/75">{message}</p>}
    </div>
  );
}
