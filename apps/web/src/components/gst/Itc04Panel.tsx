'use client';

import React, { useMemo, useState } from 'react';
import { itc04Period, itc04Statement, parseJobWorkReceived, parseJobWorkSent } from '@synextax/tax-engine';

const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const th = 'px-3 py-2 text-left text-[12px] font-medium whitespace-nowrap';
const td = 'px-3 py-2 text-[13px] text-pos-ink';
const area = 'w-full rounded-[10px] border border-pos-line bg-pos-surface p-3 font-mono text-[12px] text-pos-ink outline-none focus:border-pos-accent';

/** ITC-04 from the client's job work registers, worked out in the browser. */
export function Itc04Panel() {
  const [sentText, setSentText] = useState('');
  const [recText, setRecText] = useState('');
  const [above5, setAbove5] = useState(false);
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const sent = useMemo(() => (sentText.trim() ? parseJobWorkSent(sentText) : null), [sentText]);
  const rec = useMemo(() => (recText.trim() ? parseJobWorkReceived(recText) : null), [recText]);
  const st = useMemo(() => (sent ? itc04Statement(sent.sent, rec?.received ?? [], today) : null), [sent, rec, today]);
  const period = itc04Period(today, above5);

  return (
    <section className="space-y-4">
      <div className="pos-card space-y-3 p-4 text-[13px] text-pos-ink/65">
        <p>Paste the delivery challans sent to job workers (challan no, date, job worker GSTIN or state, description, UQC, quantity, value, and type: inputs or capital goods), and the goods received back (original challan no, received on, quantity, loss, nature of job work).</p>
        <label className="flex items-center gap-2 text-pos-ink"><input type="checkbox" checked={above5} onChange={(e) => setAbove5(e.target.checked)} /> Aggregate turnover above ₹5 crore (half-yearly filing)</label>
        <p className="text-pos-ink">Current period: {period.period}, due {nice(period.dueDate)}.</p>
        <div className="grid gap-3 lg:grid-cols-2">
          <textarea aria-label="Goods sent to job workers" rows={6} value={sentText} onChange={(e) => setSentText(e.target.value)} placeholder="Challan No	Date	Job Worker GSTIN	State	Description	UQC	Qty	Value	Type" className={area} />
          <textarea aria-label="Goods received back" rows={6} value={recText} onChange={(e) => setRecText(e.target.value)} placeholder="Original Challan No	Received On	Qty	Loss	Nature" className={area} />
        </div>
        {[...(sent?.errors ?? []), ...(rec?.errors ?? [])].length > 0 && (
          <ul className="space-y-1 text-[#dc2626]">{[...(sent?.errors ?? []).map((e) => `Sent, line ${e.line}: ${e.message}`), ...(rec?.errors ?? []).map((e) => `Received, line ${e.line}: ${e.message}`)].map((m) => <li key={m}>{m}</li>)}</ul>
        )}
      </div>
      {st && (
        <section className="pos-card overflow-x-auto">
          <div className="flex flex-wrap justify-between gap-2 border-b border-pos-line px-4 py-3">
            <h2 className="text-[14px] font-semibold text-pos-ink">Job work position</h2>
            {Number(st.deemedValue) > 0 && <span className="text-[13px] font-medium text-[#dc2626]">{inr(st.deemedValue)} now counts as supplied: tax and interest are due on it.</span>}
          </div>
          <table className="w-full">
            <thead className="text-pos-ink/55"><tr><th className={th}>Challan</th><th className={th}>Sent</th><th className={th}>Job worker</th><th className={th}>Goods</th><th className={`${th} text-right`}>Sent</th><th className={`${th} text-right`}>Back</th><th className={`${th} text-right`}>Loss</th><th className={`${th} text-right`}>Still out</th><th className={th}>Return by</th></tr></thead>
            <tbody>{st.lines.map((l) => (
              <tr key={l.challanNo} className={`border-t border-pos-line ${l.deemedSupply ? 'bg-[#dc2626]/5' : ''}`}>
                <td className={td}>{l.challanNo}</td><td className={td}>{nice(l.date)}</td><td className={`${td} font-mono text-[12px]`}>{l.jobWorkerGstin ?? `Unregistered, state ${l.jobWorkerState}`}</td>
                <td className={td}>{l.description}{l.capitalGoods ? ' (capital goods)' : ''}</td>
                <td className={`${td} text-right tabular-nums`}>{Number(l.quantity)} {l.uqc}</td><td className={`${td} text-right tabular-nums`}>{Number(l.received)}</td><td className={`${td} text-right tabular-nums`}>{Number(l.loss)}</td>
                <td className={`${td} text-right tabular-nums`}>{Number(l.pending)}{Number(l.pending) > 0 ? ` (${inr(l.pendingValue)})` : ''}</td>
                <td className={`${td} ${l.deemedSupply ? 'font-medium text-[#dc2626]' : ''}`}>{nice(l.returnBy)}{l.deemedSupply ? ', passed' : ''}</td>
              </tr>
            ))}</tbody>
          </table>
          {st.unmatched.length > 0 && <p className="border-t border-pos-line px-4 py-2 text-[12px] text-[#b45309]">Received against challans not in the sent list: {st.unmatched.map((u) => u.originalChallanNo).join(', ')}.</p>}
        </section>
      )}
    </section>
  );
}
