'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { invoiceHtml, printDocument, type PrintableDoc, type PrintableSeller } from './printInvoice';
import { btnCls, DOC_LABEL, dmy, downloadText, errorText, Field, ghostCls, inputCls, inr, Notice, stateName, th, thr, td, tdr } from './shared';

interface Row {
  id: string;
  docType: string;
  docNo: string;
  docDate: string;
  buyerName: string;
  buyerGstin: string | null;
  section: string;
  taxable: string;
  tax: string;
  invoiceValue: string;
  status: string;
  irn: string | null;
  ewbNo: string | null;
}

interface Detail extends PrintableDoc {
  id: string;
  section: string;
  cancelReason: string | null;
  ewayBillRequired: boolean;
  consignmentValue: string;
  transport: Transport | null;
  version: string;
}
interface Transport {
  mode: 1 | 2 | 3 | 4;
  distanceKm: number;
  vehicleNo?: string | null;
  vehicleType?: 'R' | 'O' | null;
  transporterId?: string | null;
  transporterName?: string | null;
  transDocNo?: string | null;
  transDocDate?: string | null;
}

/** Invoices and notes raised, and for each: print, e-invoice and e-way bill JSON, the numbers from the portals, and cancel. */
export function DocumentsPanel({ gstin, openId, onChanged }: { gstin: string; openId: string | null; onChanged: () => void }) {
  const { authFetch } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string | null>(openId);

  const load = useCallback(async () => {
    const r = await authFetch(`/api/v1/billing/documents?gstin=${gstin}`);
    if (r.ok) setRows((await r.json()).documents);
  }, [authFetch, gstin]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setSelected(openId), [openId]);

  return (
    <section className="space-y-4">
      {selected && (
        <DocumentView
          id={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            void load();
            onChanged();
          }}
        />
      )}
      <div className="pos-card overflow-x-auto">
        <table className="w-full">
          <thead><tr><th className={th}>Number</th><th className={th}>Date</th><th className={th}>Type</th><th className={th}>Customer</th><th className={th}>GSTR-1</th><th className={thr}>Taxable</th><th className={thr}>Tax</th><th className={thr}>Value</th><th className={th}>IRN</th><th className={th}>E-way bill</th><th className={th}>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`cursor-pointer border-t border-pos-line hover:bg-pos-muted ${r.status === 'CANCELLED' ? 'opacity-60' : ''}`} onClick={() => setSelected(r.id)}>
                <td className={`${td} font-mono`}>{r.docNo}</td>
                <td className={td}>{dmy(r.docDate)}</td>
                <td className={td}>{DOC_LABEL[r.docType]}</td>
                <td className={td}>{r.buyerName}</td>
                <td className={td}>{r.section}</td>
                <td className={tdr}>{inr(r.taxable)}</td>
                <td className={tdr}>{inr(r.tax)}</td>
                <td className={tdr}>{inr(r.invoiceValue)}</td>
                <td className={td}>{r.irn ? 'Recorded' : r.buyerGstin && r.status === 'ACTIVE' ? 'Pending' : ''}</td>
                <td className={`${td} font-mono`}>{r.ewbNo ?? ''}</td>
                <td className={td}>{r.status === 'CANCELLED' ? 'Cancelled' : 'Active'}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={11} className={`${td} text-pos-ink/60`}>No invoices or notes yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DocumentView({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { authFetch } = useAuth();
  const [doc, setDoc] = useState<Detail | null>(null);
  const [seller, setSeller] = useState<PrintableSeller | null>(null);
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok' | 'info'; text: string } | null>(null);
  const [irn, setIrn] = useState({ irn: '', ackNo: '', ackDate: '' });
  const [ewb, setEwb] = useState({ ewbNo: '', ewbDate: '' });
  const [transport, setTransport] = useState<Transport>({ mode: 1, distanceKm: 0, vehicleType: 'R' });
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    const r = await authFetch(`/api/v1/billing/documents/${id}`);
    if (!r.ok) return setMsg({ tone: 'error', text: await errorText(r) });
    const b = await r.json();
    setDoc(b.document);
    setSeller(b.seller);
    if (b.document.transport) setTransport(b.document.transport);
  }, [authFetch, id]);
  useEffect(() => {
    setMsg(null);
    void load();
  }, [load]);

  if (!doc || !seller) return msg ? <Notice tone="error">{msg.text}</Notice> : null;
  const active = doc.status === 'ACTIVE';
  const json = { 'content-type': 'application/json', 'if-match': `"${doc.version}"` };

  const download = async (url: string, init: RequestInit | undefined, name: string) => {
    const r = await authFetch(url, init);
    if (!r.ok) return setMsg({ tone: 'error', text: await errorText(r) });
    downloadText(name, await r.text());
    setMsg({ tone: 'ok', text: 'JSON downloaded. Upload it on the portal, then record the number it gives below.' });
    if (init?.method === 'POST') await load();
  };
  const fileSafe = doc.docNo.replace(/[^A-Za-z0-9-]/g, '-');

  const send = async (url: string, method: string, body: unknown, ok: string) => {
    const r = await authFetch(url, { method, headers: json, body: JSON.stringify(body) });
    if (!r.ok) return setMsg({ tone: 'error', text: await errorText(r) });
    const b = await r.json().catch(() => ({}));
    setMsg({ tone: 'ok', text: [ok, ...((b as { reminders?: string[] }).reminders ?? [])].join(' ') });
    await load();
    onChanged();
  };

  return (
    <div className="pos-card space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[16px] font-semibold text-pos-ink">{DOC_LABEL[doc.docType]} <span className="font-mono">{doc.docNo}</span></h3>
          <p className="text-[13px] text-pos-ink/70">{dmy(doc.docDate)} to {doc.buyer.legalName} ({doc.buyer.gstin ?? 'unregistered'}). Place of supply {stateName(doc.placeOfSupply)}. GSTR-1 {doc.section}.{doc.status === 'CANCELLED' ? ` Cancelled: ${doc.cancelReason ?? ''}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ghostCls} onClick={() => { if (!printDocument(invoiceHtml(doc, seller))) setMsg({ tone: 'error', text: 'Allow pop-ups for this site to print.' }); }}>Print</button>
          <button type="button" className={ghostCls} onClick={onClose}>Close</button>
        </div>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr><th className={th}>Description</th><th className={th}>HSN</th><th className={thr}>Quantity</th><th className={thr}>Rate</th><th className={thr}>Taxable</th><th className={thr}>GST</th><th className={thr}>Total</th></tr></thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.lineNo} className="border-t border-pos-line"><td className={td}>{l.description}</td><td className={`${td} font-mono`}>{l.hsn}</td><td className={tdr}>{Number(l.quantity)} {l.isService ? '' : l.unit}</td><td className={tdr}>{Number(l.unitPrice).toFixed(2)}</td><td className={tdr}>{inr(l.taxable)}</td><td className={tdr}>{l.gstRate}%</td><td className={tdr}>{inr(l.total)}</td></tr>
            ))}
            <tr className="border-t-2 border-pos-line font-semibold"><td className={td} colSpan={4}>{doc.reverseCharge ? 'Amount payable (reverse charge)' : 'Invoice value'}</td><td className={tdr}>{inr(doc.totals.taxable)}</td><td className={tdr}>{inr(doc.totals.tax)}</td><td className={tdr}>{inr(doc.totals.amountPayable)}</td></tr>
          </tbody>
        </table>
      </div>

      {active && doc.buyer.gstin && (
        <div className="space-y-2 rounded-[10px] border border-pos-line p-3">
          <h4 className="text-[14px] font-semibold text-pos-ink">E-invoice</h4>
          <p className="text-[12px] text-pos-ink/70">The JSON follows the e-invoice schema INV-01 version 1.1. Upload it on the IRP (bulk upload); SynexTax does not call the IRP. Then record the IRN and acknowledgement here.</p>
          <button type="button" className={btnCls} onClick={() => download(`/api/v1/billing/documents/${doc.id}/einvoice`, undefined, `einvoice-${fileSafe}.json`)}>Download JSON for the IRP</button>
          {doc.irn ? (
            <p className="text-[13px] text-pos-ink/80">IRN <span className="break-all font-mono text-[12px]">{doc.irn}</span>, ack no. <span className="font-mono">{doc.ackNo}</span></p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-4">
              <Field label="IRN (64 characters)"><input value={irn.irn} onChange={(e) => setIrn({ ...irn, irn: e.target.value.trim() })} className={`${inputCls} font-mono`} /></Field>
              <Field label="Ack no."><input value={irn.ackNo} onChange={(e) => setIrn({ ...irn, ackNo: e.target.value.trim() })} className={`${inputCls} font-mono`} /></Field>
              <Field label="Ack date and time"><input type="datetime-local" value={irn.ackDate} onChange={(e) => setIrn({ ...irn, ackDate: e.target.value })} className={inputCls} /></Field>
              <div className="flex items-end"><button type="button" className={ghostCls} onClick={() => send(`/api/v1/billing/documents/${doc.id}/irn`, 'PUT', irn, 'IRN recorded.')}>Record IRN</button></div>
            </div>
          )}
        </div>
      )}

      {active && doc.docType === 'INV' && (
        <div className="space-y-2 rounded-[10px] border border-pos-line p-3">
          <h4 className="text-[14px] font-semibold text-pos-ink">E-way bill</h4>
          <p className="text-[12px] text-pos-ink/70">
            Consignment value of taxable goods {inr(doc.consignmentValue)}. {doc.ewayBillRequired ? 'Above Rs 50,000 (rule 138): an e-way bill is needed before the goods move.' : 'Not above Rs 50,000 (rule 138); check the state limit for movement within the state.'} The JSON follows NIC&apos;s bulk generation format; upload it on the e-way bill portal.
          </p>
          <div className="grid gap-2 sm:grid-cols-4">
            <Field label="Mode">
              <select value={transport.mode} onChange={(e) => setTransport({ ...transport, mode: Number(e.target.value) as Transport['mode'] })} className={inputCls}>
                <option value={1}>Road</option><option value={2}>Rail</option><option value={3}>Air</option><option value={4}>Ship or road cum ship</option>
              </select>
            </Field>
            <Field label="Distance (km)"><input type="number" min={1} max={4000} value={transport.distanceKm || ''} onChange={(e) => setTransport({ ...transport, distanceKm: Number(e.target.value) })} className={inputCls} /></Field>
            {transport.mode === 1 ? (
              <>
                <Field label="Vehicle number"><input value={transport.vehicleNo ?? ''} onChange={(e) => setTransport({ ...transport, vehicleNo: e.target.value.toUpperCase() })} className={`${inputCls} font-mono`} /></Field>
                <Field label="Vehicle type"><select value={transport.vehicleType ?? 'R'} onChange={(e) => setTransport({ ...transport, vehicleType: e.target.value as 'R' | 'O' })} className={inputCls}><option value="R">Regular</option><option value="O">Over dimensional cargo</option></select></Field>
              </>
            ) : (
              <>
                <Field label="Transport document no."><input maxLength={15} value={transport.transDocNo ?? ''} onChange={(e) => setTransport({ ...transport, transDocNo: e.target.value })} className={`${inputCls} font-mono`} /></Field>
                <Field label="Transport document date"><input type="date" value={transport.transDocDate ?? ''} onChange={(e) => setTransport({ ...transport, transDocDate: e.target.value })} className={inputCls} /></Field>
              </>
            )}
            <Field label="Transporter id (GSTIN or TRANSIN)"><input maxLength={15} value={transport.transporterId ?? ''} onChange={(e) => setTransport({ ...transport, transporterId: e.target.value.toUpperCase() })} className={`${inputCls} font-mono`} /></Field>
            <Field label="Transporter name"><input maxLength={100} value={transport.transporterName ?? ''} onChange={(e) => setTransport({ ...transport, transporterName: e.target.value })} className={inputCls} /></Field>
          </div>
          <button type="button" className={btnCls} onClick={() => download(`/api/v1/billing/documents/${doc.id}/ewaybill-json`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(transport) }, `ewaybill-${fileSafe}.json`)}>Download e-way bill JSON</button>
          {doc.ewbNo ? (
            <p className="text-[13px] text-pos-ink/80">E-way bill no. <span className="font-mono">{doc.ewbNo}</span></p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-4">
              <Field label="E-way bill no."><input value={ewb.ewbNo} onChange={(e) => setEwb({ ...ewb, ewbNo: e.target.value.trim() })} className={`${inputCls} font-mono`} /></Field>
              <Field label="Generated on"><input type="datetime-local" value={ewb.ewbDate} onChange={(e) => setEwb({ ...ewb, ewbDate: e.target.value })} className={inputCls} /></Field>
              <div className="flex items-end"><button type="button" className={ghostCls} onClick={() => send(`/api/v1/billing/documents/${doc.id}/ewb`, 'PUT', ewb, 'E-way bill number recorded.')}>Record e-way bill</button></div>
            </div>
          )}
        </div>
      )}

      {active && (
        <div className="flex flex-wrap items-end gap-2 rounded-[10px] border border-pos-line p-3">
          <Field label="Reason for cancelling"><input maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} w-72`} /></Field>
          <button type="button" disabled={reason.trim().length < 3} className={ghostCls} onClick={() => send(`/api/v1/billing/documents/${doc.id}/cancel`, 'POST', { reason }, 'Document cancelled. Its number stays used and is shown as cancelled in GSTR-1 table 13.')}>Cancel document</button>
          <p className="w-full text-[12px] text-pos-ink/60">Documents are cancelled, never deleted. To correct a document already reported, issue a credit or debit note.</p>
        </div>
      )}
    </div>
  );
}
