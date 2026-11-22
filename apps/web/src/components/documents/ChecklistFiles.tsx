'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Download, Link2, MessageCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface FileRow { id: string; item_id: string; original_name: string; mime_type: string; size_bytes: number; uploaded_via: string; uploaded_at: string }
interface LinkRow { id: string; expires_at: string; revoked_at: string | null; last_used_at: string | null }

const when = (v: string) => new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

/** A checklist's upload link for the client, and the files the client has sent. */
export function ChecklistFiles({ checklistId, items, onChange }: { checklistId: string; items: Array<{ id: string; label: string }>; onChange: () => void }) {
  const { authFetch } = useAuth();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [fresh, setFresh] = useState<{ url: string; whatsapp: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const r = await authFetch(`/api/v1/practice/checklists/${checklistId}/files`);
    if (!r.ok) return;
    const b = await r.json();
    setFiles(b.files);
    setLinks(b.links);
  }, [authFetch, checklistId]);
  useEffect(() => { load(); }, [load]);

  const makeLink = async () => {
    const r = await authFetch(`/api/v1/practice/checklists/${checklistId}/upload-link`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ days: 30 }) });
    if (!r.ok) return;
    const b = await r.json();
    setFresh({ url: b.url, whatsapp: b.whatsapp });
    setCopied(false);
    load();
  };
  const revoke = async (id: string) => {
    await authFetch(`/api/v1/practice/upload-links/${id}/revoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    load();
  };
  const download = async (f: FileRow) => {
    const r = await authFetch(`/api/v1/practice/files/${f.id}`);
    if (!r.ok) return;
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = f.original_name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const active = links.filter((l) => !l.revoked_at && new Date(l.expires_at) > new Date());

  return (
    <div className="mt-3 space-y-2 border-t border-pos-line pt-3 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={makeLink} className="inline-flex items-center gap-1.5 rounded-full border border-pos-line px-3 py-1.5 text-pos-ink"><Link2 className="h-3.5 w-3.5" /> Upload link for the client</button>
        {active.length > 0 && <span className="text-pos-ink/55">{active.length} live link{active.length === 1 ? '' : 's'}{active[0].last_used_at ? `, last used ${when(active[0].last_used_at)}` : ''}</span>}
        {active.map((l) => <button key={l.id} type="button" onClick={() => revoke(l.id)} className="text-pos-ink/50 hover:text-[#dc2626]">Withdraw link ending {when(l.expires_at)}</button>)}
      </div>
      {fresh && (
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-pos-muted px-3 py-2">
          <span className="font-mono text-[11.5px] text-pos-ink break-all">{fresh.url}</span>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(fresh.url); setCopied(true); }} className="inline-flex items-center gap-1 text-pos-accent"><Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy'}</button>
          {fresh.whatsapp && <a href={fresh.whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#15803d]"><MessageCircle className="h-3.5 w-3.5" /> Send on WhatsApp</a>}
          <span className="w-full text-[11.5px] text-pos-ink/55">Shown once. It works for 30 days; anyone with it can upload to this checklist, so send it only to the client.</span>
        </div>
      )}
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-pos-ink">{items.find((i) => i.id === f.item_id)?.label ?? 'Item'}: {f.original_name} <span className="text-pos-ink/45">({size(f.size_bytes)}, {f.uploaded_via === 'PORTAL' ? 'from the client' : 'by staff'}, {when(f.uploaded_at)})</span></span>
              <button type="button" onClick={() => { download(f); onChange(); }} className="inline-flex items-center gap-1 text-pos-accent"><Download className="h-3.5 w-3.5" /> Download</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
