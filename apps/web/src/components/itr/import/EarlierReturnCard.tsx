'use client';

import React, { useState } from 'react';
import type { EarlierReturnImport, LossAmounts } from '@synextax/tax-engine';
import { useAuth } from '../../../context/AuthContext';
import { FileDrop } from './FileDrop';
import { inr, maskAccount, readJsonFile, type PageValues } from './importShared';

type Imported = EarlierReturnImport & { prefill: Record<string, unknown>; panMatchesClient?: boolean };

const LOSS_LABEL: Record<keyof LossAmounts, string> = {
  houseProperty: 'House property', business: 'Business', speculative: 'Speculative', specifiedBusiness: 'Specified business',
  shortTermCapital: 'Short term capital', longTermCapital: 'Long term capital', raceHorses: 'Race horses',
};

/** Event other ITR panels can listen to for the carried details (the PAN is never in it). */
export const EARLIER_RETURN_EVENT = 'synextax:itr-earlier-return';

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-[13px] text-pos-ink/75">
      <span>{label}</span><span className="font-mono tabular-nums text-pos-ink">{inr(value)}</span>
    </div>
  );
}

/** Upload last year's return to carry the client's details, losses and recurring schedules into this year. */
export function EarlierReturnCard({ values, onApply }: { values: PageValues; onApply: (patch: PageValues) => void }) {
  const { authFetch } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [r, setR] = useState<Imported | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const load = async (file: File) => {
    setBusy(true); setError(null); setApplied(null);
    try {
      const text = await readJsonFile(file);
      const res = await authFetch('/api/v1/itr-import/earlier-return', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setR(null); setError(b.message ?? 'The file could not be read.'); return; }
      setR(b as Imported);
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EARLIER_RETURN_EVENT, { detail: (b as Imported).prefill }));
    } catch (e) {
      setR(null);
      setError(e instanceof Error && e.message.includes('5 MB') ? e.message : 'The file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  // Recurring deductions that map onto the figures on this page; old regime only, at last year's amounts.
  const carry: Array<[key: string, label: string, amount: number]> = r ? ([
    ['deductions.section80C', 'Investments under 80C', r.chapterVIA.Section80C ?? r.section80C.reduce((s, x) => s + x.amount, 0)],
    ['deductions.healthInsurance', 'Health insurance (80D)', r.chapterVIA.Section80D ?? 0],
    ['deductions.npsSelf', 'Own NPS, additional (80CCD(1B))', r.chapterVIA.Section80CCD1B ?? 0],
  ] as Array<[string, string, number]>).filter(([, , a]) => a > 0) : [];

  const applyCarry = () => {
    const patch: PageValues = {};
    for (const [k, , a] of carry) if (!values[k]) patch[k] = String(a);
    onApply(patch);
    setApplied(Object.keys(patch).length ? `Filled ${Object.keys(patch).length} empty field(s) with last year's amounts.` : 'Those fields already have figures; nothing was changed.');
  };

  const kinds = (Object.keys(LOSS_LABEL) as (keyof LossAmounts)[]).filter((k) => r && (r.losses.availableTotal[k] > 0 || r.losses.rows.some((x) => x.amounts[k] > 0)));

  return (
    <div className="space-y-3">
      <FileDrop label="Upload last year's return" hint="ITR-1 to ITR-4 JSON as downloaded from the e-filing portal or written by SynexTax. Up to 5 MB, read once and not stored." busy={busy} onFile={load} />
      {error && <p className="text-[13px] text-[#dc2626]">{error}</p>}
      {r && (
        <div className="space-y-4">
          <p className="text-[13px] text-pos-ink/75">
            {r.form} for AY {r.assessmentYear}, {r.filing.regime === 'OLD' ? 'old regime' : 'new regime'}{r.filing.section === 12 ? ', filed late under 139(4)' : r.filing.section === 17 ? ', revised' : ''}. Carried into AY {r.carriesTo}.
            {r.panMatchesClient === false && <span className="ml-1 text-[#dc2626]">The PAN in the file is not this client&apos;s.</span>}
          </p>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-[12px] border border-pos-line p-3">
              <h3 className="mb-1 text-[13px] font-semibold text-pos-ink">Client details</h3>
              <dl className="space-y-0.5 text-[13px] text-pos-ink/75">
                <div>{[r.client.firstName, r.client.middleName, r.client.surname].filter(Boolean).join(' ')}</div>
                <div>PAN <span className="font-mono">{r.client.pan}</span>{r.client.dob ? `, born ${r.client.dob}` : ''}</div>
                {r.client.fatherName && <div>Father: {r.client.fatherName}</div>}
                <div>{[r.client.address.residenceNo, r.client.address.locality, r.client.address.city, r.client.address.pin].filter(Boolean).join(', ')}</div>
                <div>{[r.client.mobile, r.client.email].filter(Boolean).join(', ')}</div>
                {r.banks.map((b) => <div key={b.ifsc + b.account}>{b.name}, {b.ifsc}, <span className="font-mono">{maskAccount(b.account)}</span></div>)}
              </dl>
            </section>
            <section className="rounded-[12px] border border-pos-line p-3">
              <h3 className="mb-1 text-[13px] font-semibold text-pos-ink">Last year by head</h3>
              <Figure label="Salary" value={r.heads.salary} />
              <Figure label="House property" value={r.heads.houseProperty} />
              <Figure label="Business or profession" value={r.heads.business} />
              <Figure label="Capital gains" value={r.heads.capitalGains} />
              <Figure label="Other sources" value={r.heads.otherSources} />
              <Figure label="Deductions" value={r.heads.deductions} />
              <Figure label="Total income" value={r.heads.totalIncome} />
              <Figure label="Tax" value={r.heads.taxLiability} />
              <Figure label={r.heads.refund ? 'Refund' : 'Paid with return'} value={r.heads.refund || r.heads.payable} />
            </section>
            <section className="rounded-[12px] border border-pos-line p-3">
              <h3 className="mb-1 text-[13px] font-semibold text-pos-ink">Recurring items</h3>
              <ul className="space-y-1 text-[13px] text-pos-ink/75">
                {r.employers.map((e, k) => <li key={`e${k}`}>Employer: {e.name}{e.tan ? ` (${e.tan})` : ''}</li>)}
                {r.houses.map((h, k) => <li key={`h${k}`}>House {h.letOut ? 'let out' : 'self-occupied'}: {h.address}, {h.city}{h.loans?.length ? `; loan from ${h.loans.map((l) => l.lender).join(', ')}` : ''}</li>)}
                {r.section80C.map((c, k) => <li key={`c${k}`}>80C: {c.id || 'item'} <span className="font-mono">{inr(c.amount)}</span></li>)}
                {[...(r.section80D?.selfFamily?.insurers ?? []), ...(r.section80D?.parents?.insurers ?? [])].map((i, k) => <li key={`d${k}`}>80D: {i.name}, policy {i.policy}</li>)}
                {r.business?.ad && <li>44AD: {r.business.ad.name} ({r.business.ad.code})</li>}
                {r.business?.ada && <li>44ADA: {r.business.ada.name} ({r.business.ada.code})</li>}
                {r.business?.ae && <li>44AE: {r.business.ae.vehicles.length} goods carriage(s)</li>}
                {!r.employers.length && !r.houses.length && !r.section80C.length && !r.business && <li>None found.</li>}
              </ul>
            </section>
          </div>

          <section className="rounded-[12px] border border-pos-line p-3">
            <h3 className="mb-1 text-[13px] font-semibold text-pos-ink">Losses brought forward into AY {r.carriesTo}</h3>
            {kinds.length === 0 && !r.losses.unabsorbedDepreciation.length ? (
              <p className="text-[13px] text-pos-ink/60">No losses to carry forward.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-[13px]">
                  <thead><tr className="text-left text-[12px] text-pos-ink/60"><th className="py-1 pr-3 font-medium">Year of loss</th>{kinds.map((k) => <th key={k} className="py-1 pr-3 text-right font-medium">{LOSS_LABEL[k]}</th>)}</tr></thead>
                  <tbody>
                    {r.losses.available.map((row) => (
                      <tr key={row.assessmentYear} className="border-t border-pos-line">
                        <td className="py-1 pr-3 text-pos-ink">AY {row.assessmentYear}</td>
                        {kinds.map((k) => <td key={k} className="py-1 pr-3 text-right font-mono tabular-nums text-pos-ink">{row.amounts[k] ? inr(row.amounts[k]) : ''}</td>)}
                      </tr>
                    ))}
                    <tr className="border-t border-pos-line font-semibold"><td className="py-1 pr-3 text-pos-ink">Total</td>{kinds.map((k) => <td key={k} className="py-1 pr-3 text-right font-mono tabular-nums text-pos-ink">{inr(r.losses.availableTotal[k])}</td>)}</tr>
                  </tbody>
                </table>
              </div>
            )}
            {r.losses.unabsorbedDepreciation.map((u) => <p key={u.assessmentYear} className="text-[13px] text-pos-ink/75">Unabsorbed depreciation of AY {u.assessmentYear}: <span className="font-mono">{inr(u.depreciation)}</span> (section 32(2), no time limit)</p>)}
            {r.losses.lapsed.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[12px] text-pos-ink/60">
                {r.losses.lapsed.map((l, k) => <li key={k}>Not carried: {LOSS_LABEL[l.kind]} of AY {l.assessmentYear}, <span className="font-mono">{inr(l.amount)}</span>. {l.reason}</li>)}
              </ul>
            )}
          </section>

          {carry.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={applyCarry} className="rounded-full border border-pos-accent px-4 py-2 text-[13px] text-pos-accent hover:bg-pos-tint">Fill this year&apos;s deductions from last year</button>
              <span className="text-[12px] text-pos-ink/60">{carry.map(([, l, a]) => `${l} ${inr(a)}`).join(', ')}. Only empty fields are filled; confirm each with this year&apos;s receipts.</span>
            </div>
          )}
          {applied && <p className="text-[13px] text-[#15803d]">{applied}</p>}
          {r.notes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-[12px] text-pos-ink/60">{r.notes.map((x) => <li key={x}>{x}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
