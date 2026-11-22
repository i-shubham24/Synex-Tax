'use client';

import React, { useEffect, useState } from 'react';
import type { MisMonth, Party } from '@synextax/tax-engine';
import { useAuth } from '../../context/AuthContext';

const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const month = (p: string) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const th = 'px-3 py-2 text-right text-[12px] font-medium whitespace-nowrap';
const td = 'px-3 py-2 text-right text-[13px] tabular-nums text-pos-ink';

interface Mis { year: string; months: MisMonth[]; totals: Record<string, string>; topCustomers: Party[]; topSuppliers: Party[]; parties: Party[] }

/** Month-by-month sales, purchases and tax for a GSTIN, and everyone it deals with. */
export function MisPanel({ gstin }: { gstin: string }) {
  const { authFetch } = useAuth();
  const now = new Date();
  const thisFy = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const [fy, setFy] = useState(thisFy);
  const [data, setData] = useState<Mis | null>(null);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    if (!gstin) return;
    authFetch(`/api/v1/gst/mis?gstin=${gstin}&fy=${fy}`).then(async (r) => setData(r.ok ? await r.json() : null));
  }, [authFetch, gstin, fy]);
  const parties = (data?.parties ?? []).filter((p) => !filter || `${p.name} ${p.gstin ?? ''}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <section className="space-y-4">
      <label className="flex items-center gap-2 text-[13px] text-pos-ink/60">Financial year
        <select value={fy} onChange={(e) => setFy(Number(e.target.value))} className="h-9 rounded-[10px] border border-pos-line bg-pos-surface px-2 text-pos-ink">{[0, 1, 2, 3].map((i) => thisFy - i).map((y) => <option key={y} value={y}>{y}-{String((y + 1) % 100).padStart(2, '0')}</option>)}</select>
      </label>
      {data && (
        <>
          <div className="pos-card overflow-x-auto">
            <table className="w-full">
              <thead className="text-pos-ink/55"><tr><th className={`${th} text-left`}>Month</th><th className={th}>Sales</th><th className={th}>Output tax</th><th className={th}>Purchases</th><th className={th}>Input credit</th><th className={th}>Net tax</th><th className={th}>Documents</th></tr></thead>
              <tbody>
                {data.months.map((m) => <tr key={m.period} className="border-t border-pos-line"><td className={`${td} text-left`}>{month(m.period)}</td><td className={td}>{inr(m.sales)}</td><td className={td}>{inr(m.outputTax)}</td><td className={td}>{inr(m.purchases)}</td><td className={td}>{inr(m.inputTax)}</td><td className={td}>{inr(m.netTax)}</td><td className={td}>{m.documents || ''}</td></tr>)}
                <tr className="border-t-2 border-pos-line font-semibold"><td className={`${td} text-left`}>Year</td><td className={td}>{inr(data.totals.sales)}</td><td className={td}>{inr(data.totals.outputTax)}</td><td className={td}>{inr(data.totals.purchases)}</td><td className={td}>{inr(data.totals.inputTax)}</td><td className={td}>{inr(data.totals.netTax)}</td><td className={td} /></tr>
              </tbody>
            </table>
            <p className="border-t border-pos-line px-4 py-2 text-[12px] text-pos-ink/55">From the sales and purchase registers kept here. Input credit leaves out blocked credit and reversals.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {([['Top customers', data.topCustomers, 'sales'], ['Top suppliers', data.topSuppliers, 'purchases']] as const).map(([title, list, key]) => (
              <div key={title} className="pos-card overflow-hidden">
                <h3 className="border-b border-pos-line px-4 py-3 text-[14px] font-semibold text-pos-ink">{title}</h3>
                {list.length ? <ul>{list.map((p) => <li key={`${p.gstin}-${p.name}`} className="flex justify-between gap-2 border-t border-pos-line px-4 py-2 text-[13px] first:border-t-0"><span className="text-pos-ink">{p.name}</span><span className="tabular-nums text-pos-ink/70">{inr(p[key])}</span></li>)}</ul> : <p className="px-4 py-3 text-[13px] text-pos-ink/55">None this year.</p>}
              </div>
            ))}
          </div>
          <div className="pos-card overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pos-line px-4 py-3">
              <h3 className="text-[14px] font-semibold text-pos-ink">Parties ({data.parties.length})</h3>
              <input aria-label="Find a party" placeholder="Find by name or GSTIN" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px]" />
            </div>
            <table className="w-full">
              <thead className="text-pos-ink/55"><tr><th className={`${th} text-left`}>Party</th><th className={`${th} text-left`}>GSTIN</th><th className={`${th} text-left`}>State</th><th className={`${th} text-left`}>Role</th><th className={th}>Sales</th><th className={th}>Purchases</th></tr></thead>
              <tbody>{parties.map((p) => (
                <tr key={`${p.gstin}-${p.name}`} className="border-t border-pos-line"><td className={`${td} text-left`}>{p.name}</td><td className={`${td} text-left font-mono text-[12px] ${p.gstinValid === false ? 'text-[#dc2626]' : ''}`}>{p.gstin ?? 'Unregistered'}{p.gstinValid === false ? ' (not valid)' : ''}</td><td className={`${td} text-left`}>{p.state ?? ''}</td><td className={`${td} text-left`}>{p.side === 'BOTH' ? 'Customer and supplier' : p.side === 'CUSTOMER' ? 'Customer' : 'Supplier'}</td><td className={td}>{Number(p.sales) ? inr(p.sales) : ''}</td><td className={td}>{Number(p.purchases) ? inr(p.purchases) : ''}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
