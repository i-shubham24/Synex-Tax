'use client';

import React, { useMemo, useState } from 'react';
import type { AisImport, AisMatch, AisMatchRow } from '@synextax/tax-engine';
import { useAuth } from '../../../context/AuthContext';
import { FileDrop } from './FileDrop';
import { inr, pageHasGains, pagePatch, pageReturn, readJsonFile, type PageValues } from './importShared';

const STATUS: Record<AisMatchRow['status'], { text: string; cls: string }> = {
  MATCHED: { text: 'Matches', cls: 'bg-[#22a356]/10 text-[#15803d]' },
  DIFFERENT: { text: 'Differs', cls: 'bg-[#b45309]/10 text-[#b45309]' },
  MISSING_IN_RETURN: { text: 'Not in return', cls: 'bg-[#dc2626]/10 text-[#dc2626]' },
  NOT_IN_AIS: { text: 'Not in AIS', cls: 'bg-pos-tint text-pos-ink/70' },
};

const HEAD: Record<string, string> = { SALARY: 'Salary', HP: 'House property', CG: 'Capital gains', BP: 'Business or profession', OS: 'Other sources' };

/**
 * Upload the AIS JSON and compare it, line by line, with the figures entered on this page.
 * The AIS layout is not published by the Department; lines the parser could not place are listed for review.
 */
export function AisCompareCard({ values, onApply }: { values: PageValues; onApply: (patch: PageValues) => void }) {
  const { authFetch } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [data, setData] = useState<{ ais: AisImport; match: AisMatch } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const compare = async (fileText: string) => {
    setBusy(true); setError(null);
    try {
      const res = await authFetch('/api/v1/itr-import/ais', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: fileText, return: pageReturn(values) }) });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setData(null); setError(b.message ?? 'The AIS could not be read.'); return; }
      setData(b);
    } catch {
      setData(null); setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };
  const load = async (file: File) => {
    try {
      const t = await readJsonFile(file);
      setText(t);
      await compare(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The file could not be read.');
    }
  };

  // The page holds TDS, TCS and challans as totals, so they are compared here as totals.
  const credits = useMemo(() => {
    if (!data) return [];
    const lines = data.ais.lines;
    const tds = lines.filter((l) => l.category !== 'tcs').reduce((s, l) => s + l.taxDeducted, 0);
    const tcs = lines.filter((l) => l.category === 'tcs').reduce((s, l) => s + (l.taxDeducted || l.amount), 0);
    const pays = lines.filter((l) => l.category === 'taxPayment');
    const adv = pays.filter((l) => /advance/i.test(l.description)).reduce((s, l) => s + l.amount, 0);
    const self = pays.filter((l) => /self/i.test(l.description)).reduce((s, l) => s + l.amount, 0);
    const splitClean = adv + self === pays.reduce((s, l) => s + l.amount, 0);
    const v = (k: string) => Number(values[k] || 0);
    const list: { key: string; label: string; ais: number; page: number; patch: PageValues | null }[] = [
      { key: 'tds', label: 'TDS', ais: tds, page: v('taxesPaid.tds'), patch: { 'taxesPaid.tds': String(tds) } },
      { key: 'tcs', label: 'TCS', ais: tcs, page: v('taxesPaid.tcs'), patch: { 'taxesPaid.tcs': String(tcs) } },
      { key: 'adv', label: 'Advance tax', ais: adv, page: v('taxesPaid.advanceTax'), patch: splitClean ? { 'taxesPaid.advanceTax': String(adv) } : null },
      { key: 'sat', label: 'Self-assessment tax', ais: self, page: v('taxesPaid.selfAssessment'), patch: splitClean ? { 'taxesPaid.selfAssessment': String(self) } : null },
    ];
    return list.filter((c) => c.ais || c.page);
  }, [data, values]);

  const rows = data?.match.rows.filter((r) => r.group === 'income' || r.group === 'employer') ?? [];
  const headRows = rows.filter((r) => !r.note?.startsWith('Payer detail'));
  const payerRows = (r: AisMatchRow) => rows.filter((x) => x.note?.startsWith('Payer detail') && x.key.startsWith(`${r.key}:`));
  const gains = pageHasGains(values);
  const s = data?.match.summary;

  return (
    <div className="space-y-3">
      <FileDrop label="Upload AIS JSON" hint="From the e-filing portal: AIS, Download, JSON. Up to 5 MB, read once and not stored." busy={busy} onFile={load} />
      {error && <p className="text-[13px] text-[#dc2626]">{error}</p>}
      {data && s && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-pos-ink/75">
            <span>AIS{data.ais.taxpayer.financialYear ? ` for FY ${data.ais.taxpayer.financialYear}` : ''}{data.ais.taxpayer.pan ? `, PAN ${data.ais.taxpayer.pan}` : ''}:</span>
            <span className="rounded-full bg-[#22a356]/10 px-2 py-0.5 text-[#15803d]">{s.matched} match</span>
            <span className="rounded-full bg-[#b45309]/10 px-2 py-0.5 text-[#b45309]">{s.different} differ</span>
            <span className="rounded-full bg-[#dc2626]/10 px-2 py-0.5 text-[#dc2626]">{s.missing} not in return</span>
            {text && <button type="button" disabled={busy} onClick={() => compare(text)} className="ml-auto rounded-full border border-pos-line px-3 py-1 text-[12px] text-pos-ink hover:bg-pos-tint disabled:opacity-50">Compare again with the figures above</button>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-pos-ink/60">
                  <th className="py-1 pr-3 font-medium">Head</th><th className="py-1 pr-3 font-medium">Information</th>
                  <th className="py-1 pr-3 text-right font-medium">AIS</th><th className="py-1 pr-3 text-right font-medium">Return</th><th className="py-1 pr-3 text-right font-medium">Difference</th>
                  <th className="py-1 pr-3 font-medium">Status</th><th className="py-1 font-medium" />
                </tr>
              </thead>
              <tbody>
                {headRows.map((r) => {
                  const patch = r.add ? pagePatch(values, r.add) : null;
                  const detail = payerRows(r);
                  const cgCheck = r.head === 'CG' && gains;
                  return (
                    <React.Fragment key={r.key}>
                      <tr className="border-t border-pos-line align-top">
                        <td className="py-1.5 pr-3 text-pos-ink/75">{HEAD[r.head] ?? r.head}</td>
                        <td className="py-1.5 pr-3 text-pos-ink">
                          {r.label}{r.payer ? `, ${r.payer}` : ''}
                          {detail.length > 0 && <button type="button" onClick={() => setOpen({ ...open, [r.key]: !open[r.key] })} className="ml-2 text-[12px] text-pos-accent">{open[r.key] ? 'Hide payers' : `${detail.length} payer(s)`}</button>}
                          {r.note && <div className="text-[12px] text-pos-ink/60">{cgCheck ? 'The figures above are gains, not sale values; compare the sale value with the broker statement.' : r.note}</div>}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-pos-ink">{inr(r.aisAmount)}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-pos-ink">{cgCheck ? '' : inr(r.returnAmount)}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-pos-ink">{cgCheck ? '' : inr(r.difference)}</td>
                        <td className="py-1.5 pr-3">{cgCheck ? <span className="rounded-full bg-pos-tint px-2 py-0.5 text-[12px] text-pos-ink/70">Check</span> : <span className={`rounded-full px-2 py-0.5 text-[12px] ${STATUS[r.status].cls}`}>{STATUS[r.status].text}</span>}</td>
                        <td className="py-1.5 text-right">{patch && <button type="button" onClick={() => onApply(patch.patch)} className="rounded-full border border-pos-accent px-3 py-1 text-[12px] text-pos-accent hover:bg-pos-tint">{patch.label}</button>}</td>
                      </tr>
                      {open[r.key] && detail.map((d) => (
                        <tr key={d.key} className="text-pos-ink/75">
                          <td /><td className="py-0.5 pr-3 pl-3 text-[12px]">{d.payer || 'Unnamed source'}{d.payerId ? ` (${d.payerId})` : ''}</td>
                          <td className="py-0.5 pr-3 text-right font-mono text-[12px] tabular-nums">{inr(d.aisAmount)}</td><td colSpan={4} className="text-[12px]">{d.aisTax ? <>TDS <span className="font-mono">{inr(d.aisTax)}</span></> : null}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
                {credits.map((c) => {
                  const same = Math.abs(c.ais - c.page) <= 100;
                  return (
                    <tr key={c.key} className="border-t border-pos-line">
                      <td className="py-1.5 pr-3 text-pos-ink/75">Taxes paid</td><td className="py-1.5 pr-3 text-pos-ink">{c.label}</td>
                      <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-pos-ink">{inr(c.ais)}</td><td className="py-1.5 pr-3 text-right font-mono tabular-nums text-pos-ink">{inr(c.page)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-pos-ink">{inr(c.ais - c.page)}</td>
                      <td className="py-1.5 pr-3"><span className={`rounded-full px-2 py-0.5 text-[12px] ${same ? STATUS.MATCHED.cls : c.page ? STATUS.DIFFERENT.cls : STATUS.MISSING_IN_RETURN.cls}`}>{same ? 'Matches' : c.page ? 'Differs' : 'Not in return'}</span></td>
                      <td className="py-1.5 text-right">{!same && c.patch && <button type="button" onClick={() => onApply(c.patch!)} className="rounded-full border border-pos-accent px-3 py-1 text-[12px] text-pos-accent hover:bg-pos-tint">Use AIS figure</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data.match.information.length > 0 && (
            <details className="text-[13px] text-pos-ink/75">
              <summary className="cursor-pointer text-pos-ink">Other AIS information ({data.match.information.length}): deposits, purchases, refunds and lines not placed under a head</summary>
              <ul className="mt-1 space-y-0.5 pl-4">
                {data.match.information.map((l, k) => <li key={k}>{l.code ? `${l.code}, ` : ''}{l.description || 'No description'}{l.source ? `, ${l.source}` : ''}: <span className="font-mono">{inr(l.amount)}</span></li>)}
              </ul>
            </details>
          )}
          {data.ais.notes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-[12px] text-pos-ink/60">{data.ais.notes.map((x) => <li key={x}>{x}</li>)}</ul>}
          <p className="text-[12px] text-pos-ink/60">Differences within ₹{data.match.tolerance.absolute} or {data.match.tolerance.percent}% count as matching. Interest or dividend that a payer reports both with TDS and in its SFT return is counted once. The AIS layout is not published by the Department, so check any line that looks out of place against the AIS on the portal.</p>
        </div>
      )}
    </div>
  );
}
