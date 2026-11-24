'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, Printer } from 'lucide-react';
import { itrComputation, itrInputFromValues } from '@synextax/tax-engine';
import { useAuth } from '../../../../../context/AuthContext';
import { STATUS_LABEL, btnPrimary, btnQuiet, inr, niceDate, type SavedReturn } from '../../../../../components/itr/returns/returnsShared';

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  body * { visibility: hidden !important; }
  #itr-computation, #itr-computation * { visibility: visible !important; }
  #itr-computation { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: 0 !important; }
  .no-print { display: none !important; }
}`;

function Line({ label, value, strong, indent }: { label: string; value: number | undefined | null; strong?: boolean; indent?: boolean }) {
  if (value === undefined || value === null) return null;
  return (
    <tr className={strong ? 'font-semibold text-pos-ink' : 'text-pos-ink/80'}>
      <td className={`py-1 pr-4 text-[13px] ${indent ? 'pl-4' : ''}`}>{label}</td>
      <td className="py-1 text-right font-mono text-[13px] tabular-nums">{inr(value)}</td>
    </tr>
  );
}

/**
 * Computation of income for a saved return, styled for printing. It is the firm's own working from the saved
 * figures (and, for AY 2026-27, the tax engine), not a form of the Income-tax Department. The PAN is masked
 * unless the user chooses to show it.
 */
export default function ItrComputationPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { authFetch, user } = useAuth();
  const [r, setR] = useState<SavedReturn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullPan, setFullPan] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    authFetch(`/api/v1/itr-returns/${encodeURIComponent(id)}`)
      .then(async (res) => (res.ok ? setR(await res.json()) : setError(res.status === 404 ? 'This saved return was not found.' : 'The saved return could not be opened.')))
      .catch(() => setError('Could not reach the server.'));
  }, [authFetch, id]);

  const showPan = async () => {
    if (fullPan) { setFullPan(null); return; }
    const res = await authFetch(`/api/v1/itr-returns/${encodeURIComponent(id)}/pan`);
    if (res.ok) setFullPan((await res.json()).pan ?? null);
  };

  const s = r?.summary;
  const both = useMemo(() => (r && s?.basis === 'ENGINE' ? itrComputation(itrInputFromValues(r.input.values ?? {}, r.input.ageBand, r.input.metroCity)) : null), [r, s?.basis]);
  const firm = r?.firmName || user?.firmName || 'the firm';
  const notes = (r?.notes ?? '').split('\n').map((x) => x.trim()).filter(Boolean);

  if (error) return <p className="text-[14px] text-[#dc2626]">{error}</p>;
  if (!r || !s) return <p className="text-[14px] text-pos-ink/65">Opening the saved return.</p>;

  return (
    <div className="space-y-4">
      <style>{PRINT_CSS}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href="/itr" className={btnQuiet}><ArrowLeft className="h-4 w-4" /> Back to income tax</Link>
        <div className="flex gap-2">
          <button type="button" onClick={showPan} className={btnQuiet}>{fullPan ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {fullPan ? 'Mask PAN' : 'Show full PAN'}</button>
          <button type="button" onClick={() => window.print()} className={btnPrimary}><Printer className="h-4 w-4" /> Print</button>
        </div>
      </div>

      <article id="itr-computation" className="pos-card mx-auto max-w-[820px] space-y-5 bg-pos-surface p-8">
        <header className="space-y-1 border-b border-pos-line pb-4">
          <p className="text-[12px] font-medium text-pos-ink/70">Computation of income prepared by {firm}</p>
          <h1 className="text-[22px] font-semibold text-pos-ink">{r.entityName}</h1>
          <dl className="grid gap-x-6 gap-y-1 text-[13px] text-pos-ink/80 sm:grid-cols-2">
            <div className="flex gap-2"><dt className="text-pos-ink/70">PAN</dt><dd className="font-mono">{fullPan ?? r.pan}</dd></div>
            <div className="flex gap-2"><dt className="text-pos-ink/70">Assessment year</dt><dd>{r.assessmentYear} (previous year {Number(r.assessmentYear.slice(0, 4)) - 1}-{r.assessmentYear.slice(2, 4)})</dd></div>
            <div className="flex gap-2"><dt className="text-pos-ink/70">Return form</dt><dd>{r.form}</dd></div>
            <div className="flex gap-2"><dt className="text-pos-ink/70">Regime</dt><dd>{r.regime === 'NEW' ? 'New regime' : 'Old regime (opted out of the new regime)'}</dd></div>
            <div className="flex gap-2"><dt className="text-pos-ink/70">Status</dt><dd>{STATUS_LABEL[r.status]}</dd></div>
            {r.status === 'FILED' && <div className="flex gap-2"><dt className="text-pos-ink/70">Acknowledgement</dt><dd className="font-mono">{r.ackNumber}, {niceDate(r.filedOn)}</dd></div>}
          </dl>
        </header>

        <section>
          <h2 className="mb-1 text-[14px] font-semibold text-pos-ink">Income</h2>
          <table className="w-full">
            <tbody>
              {s.heads && (
                <>
                  <Line label="Income from salary" value={s.heads.salary} indent />
                  <Line label="Income from house property" value={s.heads.houseProperty} indent />
                  <Line label="Profits and gains of business or profession" value={s.heads.business} indent />
                  <Line label="Capital gains taxed at slab rates" value={s.heads.capitalGainsNormal} indent />
                  <Line label="Capital gains taxed at special rates" value={s.heads.capitalGainsSpecial} indent />
                  <Line label="Income from other sources" value={s.heads.otherSources} indent />
                </>
              )}
              <Line label="Gross total income" value={s.grossTotalIncome} strong />
              <Line label="Less: deductions under Chapter VI-A" value={s.deductions} />
              <Line label="Total income" value={s.totalIncome} strong />
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="mb-1 text-[14px] font-semibold text-pos-ink">Tax</h2>
          <table className="w-full">
            <tbody>
              {s.rebate !== undefined && s.rebate > 0 && <Line label="Rebate allowed" value={s.rebate} indent />}
              <Line label="Tax on total income, after rebate" value={s.tax} />
              <Line label="Surcharge" value={s.surcharge} />
              <Line label="Health and education cess" value={s.cess} />
              <Line label="Total tax" value={s.totalTax} strong />
              <Line label="Less: TDS and TCS" value={s.tdsTcs} indent />
              <Line label="Less: advance tax" value={s.advanceTax} indent />
              <Line label="Less: self-assessment tax" value={s.selfAssessment} indent />
              <tr className="font-semibold text-pos-ink">
                <td className="border-t border-pos-line py-1.5 pr-4 text-[13px]">{s.payable > 0 ? 'Tax payable' : s.payable < 0 ? 'Refund due' : 'Nothing payable'}</td>
                <td className="border-t border-pos-line py-1.5 text-right font-mono text-[13px] tabular-nums">{inr(Math.abs(s.payable))}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-[12px] text-pos-ink/70">Interest under sections 234A, 234B and 234C and the fee under 234F, if any, are not included above.</p>
        </section>

        {both && (
          <section>
            <h2 className="mb-1 text-[14px] font-semibold text-pos-ink">Regime comparison</h2>
            <p className="text-[13px] text-pos-ink/80">Total tax under the new regime <span className="font-mono">{inr(Number(both.NEW.totalTax))}</span>; under the old regime <span className="font-mono">{inr(Number(both.OLD.totalTax))}</span>.</p>
          </section>
        )}

        {(notes.length > 0 || s.notes.length > 0) && (
          <section>
            <h2 className="mb-1 text-[14px] font-semibold text-pos-ink">Notes to the return</h2>
            <ol className="list-decimal space-y-0.5 pl-5 text-[13px] text-pos-ink/80">
              {notes.map((n, i) => <li key={`n${i}`}>{n}</li>)}
              {s.notes.map((n) => <li key={n}>{n}</li>)}
            </ol>
          </section>
        )}

        <footer className="space-y-1 border-t border-pos-line pt-3 text-[12px] text-pos-ink/70">
          <p>
            {s.basis === 'ENGINE'
              ? `Worked by ${firm} from the figures saved for this return, at the rates for AY ${r.assessmentYear}.`
              : `Figures as entered by ${firm} from the return as filed; the tax was not worked again here.`}
          </p>
          <p>This computation is prepared by {firm} from the client&apos;s records for the client&apos;s reference. It is not a form or document issued by the Income-tax Department.</p>
          <p>Printed on {niceDate(new Date().toISOString().slice(0, 10))}.</p>
        </footer>
      </article>
    </div>
  );
}
