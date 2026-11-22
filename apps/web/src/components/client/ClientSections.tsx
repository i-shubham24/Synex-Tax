'use client';

import React, { useState } from 'react';
import { Download, FileText, Lock, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type ItemStatus = 'MISSING' | 'RECEIVED' | 'ACCEPTED' | 'REJECTED' | 'NOT_NEEDED';
export interface Checklist { id: string; entityId: string; entityName: string; service: string; period: string; dueDate: string; items: Array<{ id: string; label: string; status: ItemStatus; files: number }> }
export interface SharedDoc { id: string; entityId: string; entityName: string; title: string; version: number; fileName: string | null; sizeBytes: number | null; updatedAt: string | null; locked: boolean; invoice: { number: string; date: string | null; total: string } | null }
export interface Filings {
  gst: Array<{ entityId: string; entityName: string; returnType: string; period: string; status: string }>;
  tds: Array<{ entityId: string; entityName: string; form: string; period: string; correction: boolean; status: string }>;
}

const ITEM: Record<ItemStatus, [string, string]> = {
  MISSING: ['Needed', 'bg-[#f2b53a]/20 text-[#8a5a00]'],
  REJECTED: ['Please send again', 'bg-pos-red/10 text-pos-red'],
  RECEIVED: ['Received', 'bg-pos-accent/10 text-pos-accent-deep'],
  ACCEPTED: ['Accepted', 'bg-pos-green/15 text-[#147a3a]'],
  NOT_NEEDED: ['Not needed', 'bg-pos-muted text-pos-ink/50'],
};

const FILING: Record<string, string> = {
  DRAFT: 'Being prepared',
  VALIDATED: 'Being prepared',
  RECONCILED: 'Being prepared',
  CLIENT_APPROVED: 'Approved by you',
  PORTAL_SAVED: 'Ready to file',
  FILED: 'Filed',
  CLOSED: 'Filed',
};

const date = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const rupees = (v: string) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const gstPeriod = (p: string) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Photos are scaled to at most 2,000 px on the long side and sent as JPEG; PDFs go as they are. */
async function prepare(file: File): Promise<{ body: Blob; type: string; name: string }> {
  if (file.type === 'application/pdf') return { body: file, type: 'application/pdf', name: file.name };
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { body: file, type: file.type || 'application/octet-stream', name: file.name };
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  return { body: blob ?? file, type: 'image/jpeg', name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
}

export function ChecklistsSection({ lists, multi, onChange }: { lists: Checklist[]; multi: boolean; onChange: () => void }) {
  const { authFetch } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  async function send(itemId: string, file: File | undefined) {
    if (!file) return;
    setBusy(itemId);
    setNote((n) => ({ ...n, [itemId]: '' }));
    try {
      const { body, type, name } = await prepare(file);
      if (body.size > 10 * 1024 * 1024) throw new Error('This file is larger than 10 MB. Send a smaller photo or split the PDF.');
      const r = await authFetch(`/api/v1/client/checklists/items/${itemId}/file`, { method: 'POST', headers: { 'content-type': type, 'x-file-name': encodeURIComponent(name) }, body });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? 'Could not send this file. Try again.');
      setNote((n) => ({ ...n, [itemId]: 'Sent. Thank you.' }));
      onChange();
    } catch (e) {
      setNote((n) => ({ ...n, [itemId]: e instanceof Error ? e.message : 'Could not send this file.' }));
    } finally {
      setBusy(null);
    }
  }

  if (!lists.length) return <p className="text-[13.5px] text-pos-ink/55">Nothing is needed from you right now.</p>;
  return (
    <div className="space-y-3">
      {lists.map((l) => {
        const open = l.items.filter((i) => i.status === 'MISSING' || i.status === 'REJECTED').length;
        return (
          <div key={l.id} className="rounded-[14px] border border-pos-line bg-pos-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[14px] font-medium">{l.service}, {l.period}{multi ? <span className="text-pos-ink/55"> for {l.entityName}</span> : null}</p>
              <p className="text-[12.5px] text-pos-ink/55">{open ? `${open} still needed, by ${date(l.dueDate)}` : 'All sent'}</p>
            </div>
            <ul className="mt-2 divide-y divide-pos-line">
              {l.items.map((i) => {
                const [label, tone] = ITEM[i.status];
                return (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13.5px]">{i.label}</p>
                      {i.files > 0 && <p className="text-[12px] text-pos-ink/50">{i.files} file{i.files === 1 ? '' : 's'} sent</p>}
                      {note[i.id] && <p role="status" className={`text-[12.5px] ${note[i.id].startsWith('Sent') ? 'text-[#147a3a]' : 'text-pos-red'}`}>{note[i.id]}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${tone}`}>{label}</span>
                      {i.status !== 'NOT_NEEDED' && (
                        <label className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-pos-line px-3 text-[12.5px] text-pos-ink/80 hover:bg-pos-muted ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                          <Upload className="h-3.5 w-3.5" /> {busy === i.id ? 'Sending' : 'Send file'}
                          <input type="file" accept="image/jpeg,image/png,application/pdf,image/*" className="sr-only" onChange={(e) => send(i.id, e.target.files?.[0])} />
                        </label>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function DocumentsSection({ docs, unavailable, multi }: { docs: SharedDoc[]; unavailable: boolean; multi: boolean }) {
  const { authFetch } = useAuth();
  const [error, setError] = useState<string | null>(null);

  async function download(d: SharedDoc) {
    setError(null);
    const r = await authFetch(`/api/v1/client/documents/${d.id}/download`);
    if (!r.ok) return setError((await r.json().catch(() => ({}))).message ?? 'The document could not be downloaded.');
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = d.fileName ?? d.title;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (unavailable) return <p className="text-[13.5px] text-pos-ink/55">Shared documents are not available on this site yet.</p>;
  if (!docs.length) return <p className="text-[13.5px] text-pos-ink/55">Your CA has not shared any documents yet.</p>;
  return (
    <>
      {error && <p role="status" className="mb-2 text-[13px] text-pos-red">{error}</p>}
      <ul className="divide-y divide-pos-line rounded-[14px] border border-pos-line bg-pos-surface">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-start gap-2.5">
              {d.locked ? <Lock className="mt-0.5 h-4 w-4 shrink-0 text-pos-ink/50" /> : <FileText className="mt-0.5 h-4 w-4 shrink-0 text-pos-accent" />}
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium">{d.title}</p>
                <p className="text-[12px] text-pos-ink/55">
                  {multi ? `${d.entityName}, ` : ''}version {d.version}{d.updatedAt ? `, ${date(d.updatedAt)}` : ''}
                </p>
                {d.locked && (
                  <p className="mt-0.5 text-[12.5px] text-[#8a5a00]">
                    {d.invoice
                      ? <>Opens once invoice <span className="font-mono">{d.invoice.number}</span> of {date(d.invoice.date)} for <span className="font-mono">{rupees(d.invoice.total)}</span> is paid.</>
                      : 'Opens once your CA’s fee is paid.'}
                  </p>
                )}
              </div>
            </div>
            {!d.locked && (
              <button type="button" onClick={() => download(d)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-pos-line px-3 text-[12.5px] text-pos-ink/80 hover:bg-pos-muted">
                <Download className="h-3.5 w-3.5" /> Download
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export function FilingsSection({ filings, multi }: { filings: Filings | null; multi: boolean }) {
  if (!filings) return null;
  const rows = [
    ...filings.gst.map((g) => ({ key: `g-${g.entityId}-${g.returnType}-${g.period}`, entity: g.entityName, name: g.returnType.replace(/^GSTR/, 'GSTR-'), period: gstPeriod(g.period), status: g.status })),
    ...filings.tds.map((t) => ({ key: `t-${t.entityId}-${t.form}-${t.period}-${t.correction}`, entity: t.entityName, name: `TDS Form ${t.form}${t.correction ? ' correction' : ''}`, period: t.period, status: t.status })),
  ];
  if (!rows.length) return <p className="text-[13.5px] text-pos-ink/55">No returns are being tracked for you yet.</p>;
  return (
    <div className="overflow-x-auto rounded-[14px] border border-pos-line bg-pos-surface">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="text-pos-ink/60">
            {multi && <th className="px-4 py-2 font-medium">Business</th>}
            <th className="px-4 py-2 font-medium">Return</th>
            <th className="px-4 py-2 font-medium">Period</th>
            <th className="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-pos-line">
          {rows.map((r) => (
            <tr key={r.key}>
              {multi && <td className="px-4 py-2">{r.entity}</td>}
              <td className="px-4 py-2">{r.name}</td>
              <td className="px-4 py-2">{r.period}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${r.status === 'FILED' || r.status === 'CLOSED' ? 'bg-pos-green/15 text-[#147a3a]' : 'bg-pos-muted text-pos-ink/65'}`}>{FILING[r.status] ?? r.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
