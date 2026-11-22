'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Item { id: string; label: string; status: 'MISSING' | 'RECEIVED' | 'ACCEPTED' | 'REJECTED' | 'NOT_NEEDED'; files: number }
interface View { firm: string; client: string; checklist: { service: string; period: string } | null; expiresAt: string; items: Item[] }

const STATUS: Record<Item['status'], [string, string]> = {
  MISSING: ['Needed', 'bg-amber-100 text-amber-800'],
  REJECTED: ['Please send again', 'bg-red-100 text-red-700'],
  RECEIVED: ['Received', 'bg-emerald-100 text-emerald-800'],
  ACCEPTED: ['Accepted', 'bg-emerald-100 text-emerald-800'],
  NOT_NEEDED: ['Not needed', 'bg-slate-100 text-slate-600'],
};

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

export default function UploadPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const r = await fetch(`/api/v1/portal/${encodeURIComponent(token)}`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return setError(b.message ?? 'This link is not working. Ask your CA for a new one.');
    setView(b);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const send = async (item: Item, file: File | undefined) => {
    if (!file) return;
    setBusy(item.id);
    setNote({ ...note, [item.id]: '' });
    try {
      const { body, type, name } = await prepare(file);
      if (body.size > 10 * 1024 * 1024) throw new Error('This file is larger than 10 MB. Send a smaller photo or split the PDF.');
      const csrf = (await (await fetch('/api/v1/auth/csrf')).json()).csrfToken as string;
      const r = await fetch(`/api/v1/portal/${encodeURIComponent(token)}/items/${item.id}/file`, {
        method: 'POST',
        headers: { 'content-type': type, 'x-csrf-token': csrf, 'x-file-name': encodeURIComponent(name) },
        body,
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.message ?? 'Could not send this file. Try again.');
      setNote((n) => ({ ...n, [item.id]: 'Sent. Thank you.' }));
      await load();
    } catch (e) {
      setNote((n) => ({ ...n, [item.id]: e instanceof Error ? e.message : 'Could not send this file.' }));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <main className="mx-auto max-w-md px-5 py-16 text-center"><h1 className="text-xl font-semibold text-slate-900">Link not working</h1><p className="mt-3 text-slate-600">{error}</p></main>;
  if (!view) return <main className="mx-auto max-w-md px-5 py-16 text-center text-slate-500">Opening your checklist</main>;

  const open = view.items.filter((i) => i.status === 'MISSING' || i.status === 'REJECTED').length;
  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16 pt-8">
      <p className="text-sm text-slate-500">{view.firm}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{view.client}</h1>
      {view.checklist && <p className="mt-1 text-slate-600">{view.checklist.service}, {view.checklist.period}</p>}
      <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{open ? `${open} document${open === 1 ? '' : 's'} still needed. Take a photo or choose a file for each one.` : 'Everything on this list has been sent. Thank you.'}</p>
      <ul className="mt-5 space-y-3">
        {view.items.map((item) => {
          const [label, tone] = STATUS[item.status];
          const canSend = item.status !== 'NOT_NEEDED';
          return (
            <li key={item.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-slate-900">{item.label}</p>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{label}</span>
              </div>
              {item.files > 0 && <p className="mt-1 text-xs text-slate-500">{item.files} file{item.files === 1 ? '' : 's'} sent</p>}
              {canSend && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className={`flex h-11 cursor-pointer items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                    {busy === item.id ? 'Sending' : 'Take photo'}
                    <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => send(item, e.target.files?.[0])} />
                  </label>
                  <label className={`flex h-11 cursor-pointer items-center justify-center rounded-full border border-slate-300 text-sm font-medium text-slate-800 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                    Choose file
                    <input type="file" accept="image/jpeg,image/png,application/pdf,image/*" className="sr-only" onChange={(e) => send(item, e.target.files?.[0])} />
                  </label>
                </div>
              )}
              {note[item.id] && <p role="status" className={`mt-2 text-sm ${note[item.id].startsWith('Sent') ? 'text-emerald-700' : 'text-red-700'}`}>{note[item.id]}</p>}
            </li>
          );
        })}
      </ul>
      <p className="mt-8 text-center text-xs text-slate-400">This link works until {new Date(view.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}. Files go only to {view.firm}.</p>
    </main>
  );
}
