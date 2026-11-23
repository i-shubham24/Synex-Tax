'use client';

import React, { useEffect, useState } from 'react';
import type { Gstr3bMonth } from '@synextax/tax-engine';
import { useAuth } from '../../context/AuthContext';

const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const month = (p: string) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const th = 'px-3 py-2 text-right text-[12px] font-medium whitespace-nowrap';
const td = 'px-3 py-2 text-right text-[13px] tabular-nums text-pos-ink';
const STATE: Record<Gstr3bMonth['state'], [string, string]> = {
  FILED: ['Filed', 'text-[#15803d]'], FILED_LATE: ['Filed late', 'text-[#b45309]'], OVERDUE: ['Overdue', 'text-[#dc2626]'], NOT_DUE: ['Not due', 'text-pos-ink/60'], IN_PROGRESS: ['In progress', 'text-pos-ink/70'], NOT_RECORDED: ['Not in SynexTax', 'text-pos-ink/60'],
};

interface Year { year: string; months: Gstr3bMonth[]; totals: Record<string, string>; netOutputShortfall: string; netExcessCredit: string }

/** GSTR-3B for a year against GSTR-1 and GSTR-2B. */
export function Gstr3bYearPanel({ gstin }: { gstin: string }) {
  const { authFetch } = useAuth();
  const now = new Date();
  const thisFy = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const [fy, setFy] = useState(thisFy);
  const [data, setData] = useState<Year | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!gstin) return;
    authFetch(`/api/v1/gst/gstr3b/year?gstin=${gstin}&fy=${fy}`).then(async (r) => {
      const b = await r.json().catch(() => ({}));
      if (r.ok) { setData(b); setError(null); } else { setData(null); setError(b.message ?? 'Could not load the year.'); }
    });
  }, [authFetch, gstin, fy]);
  const diff = (v: string) => (Number(v) === 0 ? <span className="text-pos-ink/60">0</span> : <span className="text-[#dc2626]">{inr(v)}</span>);

  return (
    <section className="space-y-3">
      <label className="flex items-center gap-2 text-[13px] text-pos-ink/60">Financial year
        <select value={fy} onChange={(e) => setFy(Number(e.target.value))} className="h-9 rounded-[10px] border border-pos-line bg-pos-surface px-2 text-pos-ink">
          {[0, 1, 2, 3].map((i) => thisFy - i).map((y) => <option key={y} value={y}>{y}-{String((y + 1) % 100).padStart(2, '0')}</option>)}
        </select>
      </label>
      {error && <p className="text-[13px] text-[#dc2626]">{error}</p>}
      {data && (
        <div className="pos-card overflow-x-auto">
          <table className="w-full">
            <thead className="text-pos-ink/55"><tr><th className={`${th} text-left`}>Period</th><th className={th}>Tax in GSTR-1</th><th className={th}>Tax in 3B</th><th className={th}>3B short by</th><th className={th}>Credit in 2B</th><th className={th}>Credit in 3B</th><th className={th}>Claimed over 2B</th><th className={th}>Cash paid</th><th className={`${th} text-left`}>3B</th></tr></thead>
            <tbody>
              {data.months.map((m) => (
                <tr key={m.period} className="border-t border-pos-line">
                  <td className={`${td} text-left`}>{month(m.period)}</td><td className={td}>{inr(m.gstr1Tax)}</td><td className={td}>{inr(m.gstr3bTax)}</td><td className={td}>{diff(m.outputDifference)}</td>
                  <td className={td}>{inr(m.itc2b)}</td><td className={td}>{inr(m.itc3b)}</td><td className={td}>{diff(m.itcDifference)}</td><td className={td}>{inr(m.cashPaid)}</td>
                  <td className={`${td} text-left ${STATE[m.state][1]}`}>{STATE[m.state][0]}{m.daysLate ? `, ${m.daysLate} ${m.daysLate === 1 ? 'day' : 'days'}` : ''}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-pos-line font-semibold"><td className={`${td} text-left`}>Year</td><td className={td}>{inr(data.totals.gstr1Tax)}</td><td className={td}>{inr(data.totals.gstr3bTax)}</td><td className={td}>{diff(data.netOutputShortfall)}</td><td className={td}>{inr(data.totals.itc2b)}</td><td className={td}>{inr(data.totals.itc3b)}</td><td className={td}>{diff(data.netExcessCredit)}</td><td className={td}>{inr(data.totals.cashPaid)}</td><td className={td} /></tr>
            </tbody>
          </table>
          <p className="border-t border-pos-line px-4 py-2 text-[12px] text-pos-ink/55">GSTR-1 tax comes from the sales register kept here and 2B credit from the GSTR-2B records; differences in one month made good in another settle in the year total.</p>
        </div>
      )}
    </section>
  );
}
