'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download, Eye, RotateCcw, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { DocFolder, DocRow } from './ClientDocuments';
import { fileSize, openFile, when } from './docFiles';

interface Version { version: number; fileName: string; mimeType: string; sizeBytes: number; sha256: string; uploadedVia: string; uploadedBy: string | null; restoredFrom: number | null; createdAt: string; previewable: boolean }
interface Detail { version: string; currentVersion: number; feeWaivedBy: string | null; feeWaivedAt: string | null; versions: Version[] }
interface Invoice { id: string; invoiceNo: string; date: string; total: string; paid: boolean }
interface Open { version: number; kind: 'DOWNLOAD' | 'PREVIEW'; openedAt: string; by: string; byClient: boolean }

const money = (v: string) => Number(v).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

/** One document: its versions with restore, a new version, sharing, the fee lock and the open log. */
export function DocumentPanel(props: {
  doc: DocRow;
  entityId: string;
  folders: DocFolder[];
  canLock: boolean;
  canWaive: boolean;
  canSeeOpens: boolean;
  onChange: () => Promise<void> | void;
  onMessage: (m: string | null) => void;
}) {
  const { doc, entityId, folders, canLock, canWaive, canSeeOpens, onChange, onMessage } = props;
  const { authFetch } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [opens, setOpens] = useState<Open[] | null>(null);
  const [invoiceId, setInvoiceId] = useState(doc.invoice?.id ?? '');
  const [title, setTitle] = useState(doc.title);

  const load = useCallback(async () => {
    const r = await authFetch(`/api/v1/practice/documents/${doc.id}`);
    if (r.ok) setDetail(await r.json());
    if (canSeeOpens) {
      const o = await authFetch(`/api/v1/practice/documents/${doc.id}/opens`);
      if (o.ok) setOpens((await o.json()).opens);
    }
  }, [authFetch, doc.id, canSeeOpens]);
  useEffect(() => { load().catch(() => {}); }, [load, doc.version]);
  useEffect(() => {
    if (!canLock) return;
    authFetch(`/api/v1/practice/documents/invoices?entityId=${entityId}`)
      .then((r) => (r.ok ? r.json() : { invoices: [] }))
      .then((b) => setInvoices(b.invoices))
      .catch(() => {});
  }, [authFetch, canLock, entityId]);

  const reportFailure = async (r: Response, fallback: string) => {
    if (r.ok) return false;
    onMessage(r.status === 409 ? ((await r.json().catch(() => ({}))).message ?? 'Someone changed this document. The latest is shown now.') : ((await r.json().catch(() => ({}))).message ?? fallback));
    return true;
  };

  async function patch(body: Record<string, unknown>) {
    onMessage(null);
    const r = await authFetch(`/api/v1/practice/documents/${doc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': `"${doc.version}"` }, body: JSON.stringify(body) });
    await reportFailure(r, 'The change was not saved.');
    await onChange();
  }

  async function waive(waived: boolean) {
    const r = await authFetch(`/api/v1/practice/documents/${doc.id}/waive`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': `"${doc.version}"` }, body: JSON.stringify({ waived }) });
    await reportFailure(r, 'The waiver was not saved.');
    await onChange();
  }

  async function restore(version: number) {
    const r = await authFetch(`/api/v1/practice/documents/${doc.id}/versions/${version}/restore`, { method: 'POST' });
    await reportFailure(r, 'That version was not restored.');
    await onChange();
  }

  async function newVersion(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const r = await authFetch(`/api/v1/practice/documents/${doc.id}/versions`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file });
    await reportFailure(r, 'The new version was not uploaded.');
    await onChange();
  }

  const folderLabel = (f: DocFolder): string => {
    const parent = folders.find((x) => x.id === f.parentId);
    return parent ? `${folderLabel(parent)} / ${f.name}` : f.name;
  };

  return (
    <div className="mt-3 grid gap-4 rounded-[12px] bg-pos-muted p-3 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-[12px] text-pos-ink/55">Title
            <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} className="h-9 rounded-full border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink" />
          </label>
          <button type="button" disabled={!title.trim() || title === doc.title} onClick={() => patch({ title: title.trim() })} className="h-9 rounded-full border border-pos-line px-3 text-[12.5px] text-pos-ink disabled:opacity-40">Rename</button>
          <label className="flex flex-col gap-1 text-[12px] text-pos-ink/55">Folder
            <select value={doc.folderId ?? ''} onChange={(e) => patch({ folderId: e.target.value || null })} className="h-9 rounded-full border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink">
              <option value="">All documents (top level)</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{folderLabel(f)}</option>)}
            </select>
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-medium text-pos-ink">Versions</h3>
            <label className="inline-flex cursor-pointer items-center gap-1 text-[12.5px] text-pos-accent">
              <Upload className="h-3.5 w-3.5" /> Upload a new version
              <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc,.csv,.zip" onChange={(e) => newVersion(e.target.files)} />
            </label>
          </div>
          <ul className="mt-2 space-y-1.5">
            {(detail?.versions ?? []).map((v) => (
              <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                <span className="text-pos-ink">
                  <span className="font-mono">v{v.version}</span> {v.fileName} <span className="text-pos-ink/50">({fileSize(v.sizeBytes)}, {v.uploadedVia === 'CLIENT' ? 'the client' : v.uploadedBy ?? 'the firm'}, {when(v.createdAt)}{v.restoredFrom ? `, restored from v${v.restoredFrom}` : ''})</span>
                  {v.version === detail?.currentVersion && <span className="ml-1.5 rounded-full bg-[#5fe88a]/20 px-2 py-0.5 text-[11px] text-[#147a3a]">Current</span>}
                </span>
                <span className="flex items-center gap-2">
                  {v.previewable && <button type="button" aria-label={`Preview version ${v.version}`} onClick={async () => onMessage(await openFile(authFetch, doc.id, v.version, v.fileName, true))} className="text-pos-accent"><Eye className="h-3.5 w-3.5" /></button>}
                  <button type="button" aria-label={`Download version ${v.version}`} onClick={async () => onMessage(await openFile(authFetch, doc.id, v.version, v.fileName, false))} className="text-pos-accent"><Download className="h-3.5 w-3.5" /></button>
                  {v.version !== detail?.currentVersion && <button type="button" onClick={() => restore(v.version)} className="inline-flex items-center gap-1 text-pos-ink/70"><RotateCcw className="h-3.5 w-3.5" /> Restore</button>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-[13px] font-medium text-pos-ink">Client access</h3>
          <label className="mt-2 flex items-center gap-2 text-[13px] text-pos-ink">
            <input type="checkbox" checked={doc.sharedWithClient} onChange={(e) => patch({ sharedWithClient: e.target.checked })} />
            Share with the client in their portal
          </label>
          {canLock ? (
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-[13px] text-pos-ink">
                <input type="checkbox" checked={doc.lockedUntilPaid} disabled={!doc.lockedUntilPaid && !invoiceId} onChange={(e) => patch(e.target.checked ? { lockedUntilPaid: true, feeInvoiceId: invoiceId } : { lockedUntilPaid: false })} />
                Hold back until a fee invoice is paid
              </label>
              <select value={invoiceId} onChange={(e) => { setInvoiceId(e.target.value); if (doc.lockedUntilPaid && e.target.value) patch({ feeInvoiceId: e.target.value }); }} aria-label="Fee invoice that releases the document" className="h-9 w-full rounded-full border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink">
                <option value="">Choose the fee invoice</option>
                {invoices.map((i) => <option key={i.id} value={i.id}>{i.invoiceNo}, {money(i.total)}{i.paid ? ', paid' : ''}</option>)}
              </select>
              {!invoices.length && <p className="text-[12px] text-pos-ink/50">No issued fee invoices for this client yet.</p>}
            </div>
          ) : (
            doc.lockedUntilPaid && <p className="mt-2 text-[12.5px] text-pos-ink/60">Held back until invoice <span className="font-mono">{doc.invoice?.invoiceNo}</span> is paid. A partner or manager changes this.</p>
          )}
          {doc.lockedUntilPaid && (
            <p className="mt-2 text-[12.5px] text-pos-ink/70">
              {doc.invoice?.paid ? 'The invoice is paid, so the client can open it.' : doc.feeWaived ? `Fee waived${detail?.feeWaivedBy ? ` by ${detail.feeWaivedBy}` : ''}${detail?.feeWaivedAt ? ` on ${when(detail.feeWaivedAt)}` : ''}, so the client can open it.` : doc.invoice?.status === 'CANCELLED' ? 'The linked invoice is cancelled. Choose another or remove the hold.' : 'The client sees it but cannot open it until the invoice is paid.'}
            </p>
          )}
          {doc.lockedUntilPaid && canWaive && !doc.invoice?.paid && (
            <button type="button" onClick={() => waive(!doc.feeWaived)} className="mt-2 rounded-full border border-pos-line px-3 py-1.5 text-[12.5px] text-pos-ink">{doc.feeWaived ? 'Withdraw the waiver' : 'Waive the fee for this document'}</button>
          )}
        </div>

        {canSeeOpens && (
          <div>
            <h3 className="text-[13px] font-medium text-pos-ink">Opened by</h3>
            {opens && opens.length ? (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-[12.5px]">
                {opens.map((o, i) => (
                  <li key={i} className="flex justify-between gap-2 text-pos-ink">
                    <span>{o.by}{o.byClient ? ' (client)' : ''}, {o.kind === 'PREVIEW' ? 'previewed' : 'downloaded'} <span className="font-mono">v{o.version}</span></span>
                    <span className="text-pos-ink/50">{when(o.openedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[12.5px] text-pos-ink/50">Nobody has opened it yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
