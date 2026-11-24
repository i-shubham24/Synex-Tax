'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { btnCls, errorText, Field, inputCls, inr, Notice, th, thr, td, tdr } from './shared';

interface Data {
  documents: number;
  sections: Array<{ section: string; table: string; documents: number; taxable: string; igst: string; cgst: string; sgst: string; cess: string }>;
  hsn: Array<{ tab: string; hsn: string; uqc: string; rate: number; quantity: string; taxable: string; igst: string; cgst: string; sgst: string; cess: string; totalValue: string }>;
  documentsIssued: Array<{ nature: string; series: string; from: string; to: string; total: number; cancelled: number; netIssued: number }>;
  pushes: Array<{ batch: string; documents: number; rows: number; superseded: boolean; at: string }>;
}

const lastMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** GSTR-1 tables built from the month's invoices and notes, and the hand-over to the GSTR-1 screens. */
export function Gstr1Panel({ gstin }: { gstin: string }) {
  const { authFetch } = useAuth();
  const [period, setPeriod] = useState(lastMonth());
  const [data, setData] = useState<Data | null>(null);
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await authFetch(`/api/v1/billing/gstr1?gstin=${gstin}&period=${period}`);
    setData(r.ok ? await r.json() : null);
  }, [authFetch, gstin, period]);
  useEffect(() => {
    void load();
  }, [load]);

  const push = async () => {
    setBusy(true);
    const r = await authFetch('/api/v1/billing/gstr1/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gstin, period }) });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: 'error', text: await errorText(r) });
    const b = await r.json();
    setMsg({ tone: 'ok', text: `${b.documents} document(s) written to the sales register for ${period}${b.replaced ? ', replacing the earlier hand-over' : ''}. The GSTR-1 summary and returns screens now include them.` });
    await load();
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Return period"><input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={inputCls} /></Field>
        <button type="button" disabled={busy || !data?.documents} className={btnCls} onClick={push}>Send to GSTR-1 preparation</button>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {data && (
        <>
          <div className="pos-card overflow-x-auto">
            <h3 className="border-b border-pos-line px-4 py-3 text-[14px] font-semibold text-pos-ink">By section</h3>
            <table className="w-full">
              <thead><tr><th className={th}>Section</th><th className={th}>Table</th><th className={thr}>Documents</th><th className={thr}>Taxable</th><th className={thr}>IGST</th><th className={thr}>CGST</th><th className={thr}>SGST</th><th className={thr}>Cess</th></tr></thead>
              <tbody>
                {data.sections.map((s) => <tr key={`${s.section}-${s.table}`} className="border-t border-pos-line"><td className={td}>{s.section}</td><td className={td}>{s.table}</td><td className={tdr}>{s.documents}</td><td className={tdr}>{inr(s.taxable)}</td><td className={tdr}>{inr(s.igst)}</td><td className={tdr}>{inr(s.cgst)}</td><td className={tdr}>{inr(s.sgst)}</td><td className={tdr}>{inr(s.cess)}</td></tr>)}
                {!data.sections.length && <tr><td colSpan={8} className={`${td} text-pos-ink/60`}>No active documents in this month.</td></tr>}
              </tbody>
            </table>
            <p className="border-t border-pos-line px-4 py-2 text-[12px] text-pos-ink/60">Credit notes reduce the figures. Notes to unregistered buyers adjust B2CS unless they relate to a large inter-state sale (CDNUR).</p>
          </div>
          <div className="pos-card overflow-x-auto">
            <h3 className="border-b border-pos-line px-4 py-3 text-[14px] font-semibold text-pos-ink">HSN summary (table 12)</h3>
            <table className="w-full">
              <thead><tr><th className={th}>Tab</th><th className={th}>HSN or SAC</th><th className={th}>UQC</th><th className={thr}>Rate</th><th className={thr}>Quantity</th><th className={thr}>Taxable</th><th className={thr}>IGST</th><th className={thr}>CGST</th><th className={thr}>SGST</th><th className={thr}>Cess</th><th className={thr}>Total</th></tr></thead>
              <tbody>
                {data.hsn.map((h) => <tr key={`${h.tab}-${h.hsn}-${h.uqc}-${h.rate}`} className="border-t border-pos-line"><td className={td}>{h.tab}</td><td className={`${td} font-mono`}>{h.hsn}</td><td className={td}>{h.uqc}</td><td className={tdr}>{h.rate}%</td><td className={tdr}>{Number(h.quantity).toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td><td className={tdr}>{inr(h.taxable)}</td><td className={tdr}>{inr(h.igst)}</td><td className={tdr}>{inr(h.cgst)}</td><td className={tdr}>{inr(h.sgst)}</td><td className={tdr}>{inr(h.cess)}</td><td className={tdr}>{inr(h.totalValue)}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div className="pos-card overflow-x-auto">
            <h3 className="border-b border-pos-line px-4 py-3 text-[14px] font-semibold text-pos-ink">Documents issued (table 13)</h3>
            <table className="w-full">
              <thead><tr><th className={th}>Nature</th><th className={th}>From</th><th className={th}>To</th><th className={thr}>Total</th><th className={thr}>Cancelled</th><th className={thr}>Net issued</th></tr></thead>
              <tbody>
                {data.documentsIssued.map((d) => <tr key={`${d.nature}-${d.series}`} className="border-t border-pos-line"><td className={td}>{d.nature}</td><td className={`${td} font-mono`}>{d.from}</td><td className={`${td} font-mono`}>{d.to}</td><td className={tdr}>{d.total}</td><td className={tdr}>{d.cancelled}</td><td className={tdr}>{d.netIssued}</td></tr>)}
              </tbody>
            </table>
          </div>
          {data.pushes.length > 0 && (
            <p className="text-[12px] text-pos-ink/70">Last sent {new Date(data.pushes[0].at).toLocaleString('en-IN')}: {data.pushes[0].documents} document(s), {data.pushes[0].rows} sales register row(s). Send again after any change; the earlier rows are replaced.</p>
          )}
        </>
      )}
    </section>
  );
}
