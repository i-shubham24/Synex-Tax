'use client';

import React, { useState } from 'react';
import { Check, Copy, Landmark } from 'lucide-react';
import type { ChallanResult, ChallanValues } from '@synextax/tax-engine';
import { useAuth } from '../../../context/AuthContext';
import { btnPrimary, fieldCls, inr, niceDate } from './returnsShared';

type Result = ChallanResult & { payOn: string; assessmentYear: string; pan: string };

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={`Copy ${label}`} onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }).catch(() => {}); }}
      className="rounded-[6px] p-1 text-pos-ink/60 hover:bg-pos-tint hover:text-pos-ink">
      {done ? <Check className="h-3.5 w-3.5 text-[#15803d]" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function ChallanTable({ c, title }: { c: ChallanValues; title: string }) {
  const rows: Array<[string, string]> = [
    ['Major head', `${c.majorHead}, ${c.majorHeadName.replace(/ \(\d+\)$/, '')}`], ['Minor head', `${c.minorHead}, ${c.minorHeadName.replace(/ \(\d+\)$/, '')}`],
    ['Tax', String(c.tax)], ['Surcharge', String(c.surcharge)], ['Cess', String(c.cess)], ['Interest', String(c.interest)],
    ['Penalty', String(c.penalty)], ['Fee', String(c.fee)], ['Others', String(c.others)], ['Total', String(c.total)],
  ];
  return (
    <div className="rounded-[12px] border border-pos-line p-3">
      <h4 className="mb-1 text-[13px] font-semibold text-pos-ink">{title}</h4>
      <dl className="divide-y divide-pos-line/60">
        {rows.map(([k, v], i) => (
          <div key={k} className={`flex items-center justify-between gap-3 py-1 text-[13px] ${k === 'Total' ? 'font-semibold text-pos-ink' : 'text-pos-ink/75'}`}>
            <dt>{k}</dt>
            <dd className="flex items-center gap-1">
              <span className={i < 2 ? 'text-pos-ink' : 'font-mono tabular-nums text-pos-ink'}>{i < 2 ? v : inr(Number(v))}</span>
              <CopyButton value={i < 2 ? v.split(',')[0] : v} label={k} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Challan values ready to paste into e-Pay Tax on the e-filing portal, worked from the saved return:
 * self-assessment tax (minor head 300) for the balance with interest, and the open advance tax instalment (100).
 */
export function ItrChallanCard({ returnId, dirty }: { returnId: string | null; dirty: boolean }) {
  const { authFetch } = useAuth();
  const [payOn, setPayOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [i234A, setI234A] = useState('');
  const [f234F, setF234F] = useState('');
  const [senior, setSenior] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const work = async () => {
    if (!returnId) return;
    setBusy(true); setError(null);
    try {
      const q = new URLSearchParams({ payOn, senior: String(senior) });
      if (i234A) q.set('interest234A', i234A);
      if (f234F) q.set('fee234F', f234F);
      const r = await authFetch(`/api/v1/itr-returns/${returnId}/challan?${q.toString()}`);
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setRes(null); setError(b.message ?? 'The challan could not be worked.'); return; }
      setRes(b as Result);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-[14px] font-semibold text-pos-ink"><Landmark className="h-4 w-4 text-pos-accent" /> Challan for e-Pay Tax</h3>
      {!returnId ? <p className="text-[13px] text-pos-ink/65">Save the return to work its challan.</p> : (
        <>
          {dirty && <p className="text-[13px] text-[#b45309]">The figures have changed since the last save; the challan uses the saved return.</p>}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-[12px] text-pos-ink/70">Date of payment<input type="date" value={payOn} onChange={(e) => setPayOn(e.target.value)} className={fieldCls} /></label>
            <label className="text-[12px] text-pos-ink/70">Interest under 234A, if any<input inputMode="numeric" value={i234A} onChange={(e) => setI234A(e.target.value.replace(/[^0-9]/g, ''))} className={`${fieldCls} font-mono`} /></label>
            <label className="text-[12px] text-pos-ink/70">Fee under 234F, if any<input inputMode="numeric" value={f234F} onChange={(e) => setF234F(e.target.value.replace(/[^0-9]/g, ''))} className={`${fieldCls} font-mono`} /></label>
            <label className="flex items-end gap-2 pb-2 text-[12px] text-pos-ink/70"><input type="checkbox" checked={senior} onChange={(e) => setSenior(e.target.checked)} /> Resident senior citizen with no business income</label>
          </div>
          <button type="button" onClick={work} disabled={busy} className={btnPrimary}>{busy ? 'Working' : 'Work the challan'}</button>
          {error && <p className="text-[13px] text-[#dc2626]">{error}</p>}
          {res && (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                {res.selfAssessment ? <ChallanTable c={res.selfAssessment} title={`Self-assessment tax, AY ${res.assessmentYear}`} /> : <p className="text-[13px] text-pos-ink/70">No self-assessment tax is due on {niceDate(res.payOn)}.</p>}
                {res.nextAdvance && <ChallanTable c={res.nextAdvance} title={`Advance tax instalment due ${niceDate(res.nextAdvance.dueDate)}`} />}
              </div>
              <p className="text-[12px] text-pos-ink/70">Interest worked to {niceDate(res.payOn)}: 234A <span className="font-mono">{inr(res.interest.i234A)}</span>, 234B <span className="font-mono">{inr(res.interest.i234B)}</span> ({res.interest.months234B} months), 234C <span className="font-mono">{inr(res.interest.i234C)}</span>. PAN on the challan: {res.pan}.</p>
              {res.instalments.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-[12px]">
                    <thead><tr className="border-b border-pos-line text-left text-pos-ink/70"><th className="py-1 font-medium">Instalment due</th><th className="py-1 text-right font-medium">Cumulative due</th><th className="py-1 text-right font-medium">Paid by then</th><th className="py-1 text-right font-medium">Shortfall</th><th className="py-1 text-right font-medium">234C</th></tr></thead>
                    <tbody>
                      {res.instalments.map((x) => (
                        <tr key={x.dueDate} className="border-b border-pos-line/60 text-pos-ink">
                          <td className="py-1">{niceDate(x.dueDate)}, {x.cumulativePercent}%</td>
                          <td className="py-1 text-right font-mono tabular-nums">{inr(x.due)}</td><td className="py-1 text-right font-mono tabular-nums">{inr(x.paidByDate)}</td>
                          <td className="py-1 text-right font-mono tabular-nums">{inr(x.shortfall)}</td><td className="py-1 text-right font-mono tabular-nums">{inr(x.interest234C)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {res.notes.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-pos-ink/70">{res.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
              <p className="text-[12px] text-pos-ink/70">Check every amount on e-Pay Tax before paying. Interest under 234A and the fee under 234F are used as entered here.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
