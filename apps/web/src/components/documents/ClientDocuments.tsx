'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Download, Eye, Folder, FolderPlus, History, Lock, Share2, Upload, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { DocumentPanel } from './DocumentPanel';
import { fileSize, openFile, when } from './docFiles';

export interface DocFolder { id: string; parentId: string | null; name: string; version: string }
export interface DocRow {
  id: string;
  folderId: string | null;
  title: string;
  currentVersion: number;
  versions: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  previewable: boolean;
  uploadedVia: 'FIRM' | 'CLIENT';
  uploadedBy: string | null;
  updatedAt: string;
  sharedWithClient: boolean;
  lockedUntilPaid: boolean;
  feeWaived: boolean;
  lockedForClient: boolean | null;
  invoice: { id: string; invoiceNo: string; status: string; paid: boolean; total?: string } | null;
  version: string;
}
interface Listing { folders: DocFolder[]; documents: DocRow[]; canLock: boolean; canWaive: boolean; canSeeOpens: boolean; maxBytes: number }

/** A client's documents: folders, uploads, versions, sharing and the fee lock. */
export function ClientDocuments({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const { authFetch } = useAuth();
  const [entityId, setEntityId] = useState('');
  const [data, setData] = useState<Listing | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!entityId) return setData(null);
    const r = await authFetch(`/api/v1/practice/documents?entityId=${entityId}`);
    if (r.ok) setData(await r.json());
    else setMessage((await r.json().catch(() => ({}))).message ?? 'Could not load the documents.');
  }, [authFetch, entityId]);
  useEffect(() => {
    setFolderId(null);
    setOpenDoc(null);
    load().catch(() => {});
  }, [load]);

  const folders = data?.folders ?? [];
  const path: DocFolder[] = [];
  for (let f = folders.find((x) => x.id === folderId); f; f = folders.find((x) => x.id === f!.parentId)) path.unshift(f);
  const children = folders.filter((f) => f.parentId === folderId);
  const docs = (data?.documents ?? []).filter((d) => d.folderId === folderId);

  async function addFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolder.trim()) return;
    const r = await authFetch('/api/v1/practice/documents/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityId, parentId: folderId, name: newFolder.trim() }) });
    if (r.status === 201) setNewFolder('');
    else setMessage((await r.json().catch(() => ({}))).message ?? 'Could not add the folder.');
    await load();
  }

  async function removeFolder(id: string) {
    const r = await authFetch(`/api/v1/practice/documents/folders/${id}`, { method: 'DELETE' });
    if (!r.ok) setMessage((await r.json().catch(() => ({}))).message ?? 'Could not remove the folder.');
    else if (folderId === id) setFolderId(folders.find((f) => f.id === id)?.parentId ?? null);
    await load();
  }

  async function upload(files: FileList | null) {
    if (!files?.length || !data) return;
    setBusy(true);
    setMessage(null);
    for (const file of Array.from(files)) {
      if (file.size > data.maxBytes) {
        setMessage(`${file.name} is larger than 20 MB.`);
        continue;
      }
      const q = new URLSearchParams({ entityId, ...(folderId ? { folderId } : {}) });
      const r = await authFetch(`/api/v1/practice/documents/upload?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file });
      if (r.status !== 201) setMessage(`${file.name}: ${(await r.json().catch(() => ({}))).message ?? 'not uploaded.'}`);
    }
    setBusy(false);
    if (fileInput.current) fileInput.current.value = '';
    await load();
  }

  return (
    <section className="pos-card space-y-4 p-4" aria-labelledby="client-docs">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="client-docs" className="text-[16px] font-semibold text-pos-ink">Documents</h2>
          <p className="text-[12.5px] text-pos-ink/55">Returns, computations and notices kept per client. Every upload is a new version; nothing is overwritten.</p>
        </div>
        <label className="flex flex-col gap-1 text-[12px] text-pos-ink/55">Client
          <select value={entityId} onChange={(e) => setEntityId(e.target.value)} className="h-10 min-w-[14rem] rounded-full border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink">
            <option value="">Choose a client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      {message && (
        <p role="status" className="flex items-start justify-between gap-2 rounded-[10px] bg-[#f2b53a]/15 px-3 py-2 text-[12.5px] text-[#8a5a00]">
          {message}
          <button type="button" aria-label="Dismiss" onClick={() => setMessage(null)}><X className="h-3.5 w-3.5" /></button>
        </p>
      )}

      {!entityId && <p className="text-[13px] text-pos-ink/55">Choose a client to see their documents.</p>}

      {data && (
        <>
          <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-[13px]">
            <button type="button" onClick={() => setFolderId(null)} className={folderId ? 'text-pos-accent' : 'font-medium text-pos-ink'}>All documents</button>
            {path.map((f) => (
              <span key={f.id} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-pos-ink/35" />
                <button type="button" onClick={() => setFolderId(f.id)} className={f.id === folderId ? 'font-medium text-pos-ink' : 'text-pos-accent'}>{f.name}</button>
              </span>
            ))}
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInput} type="file" multiple className="sr-only" id="doc-upload" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc,.csv,.zip" onChange={(e) => upload(e.target.files)} />
            <label htmlFor="doc-upload" className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-pos-accent px-4 text-[13px] font-medium text-white ${busy ? 'opacity-60' : ''}`}>
              <Upload className="h-4 w-4" /> {busy ? 'Uploading' : 'Upload files'}
            </label>
            <form onSubmit={addFolder} className="flex items-center gap-2">
              <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} maxLength={80} placeholder="New folder" aria-label="New folder name" className="h-9 w-40 rounded-full border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink" />
              <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-pos-line px-3 text-[13px] text-pos-ink"><FolderPlus className="h-4 w-4" /> Add</button>
            </form>
            <span className="text-[12px] text-pos-ink/50">PDF, photos, Excel, Word, CSV or ZIP, up to 20 MB each.</span>
          </div>

          <ul className="divide-y divide-pos-line rounded-[14px] border border-pos-line">
            {children.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-[13px]">
                <button type="button" onClick={() => setFolderId(f.id)} className="inline-flex items-center gap-2 text-pos-ink"><Folder className="h-4 w-4 text-pos-ink/50" /> {f.name}</button>
                <button type="button" onClick={() => removeFolder(f.id)} className="text-[12px] text-pos-ink/45 hover:text-[#dc2626]">Remove if empty</button>
              </li>
            ))}
            {docs.map((d) => (
              <li key={d.id} className="px-3 py-2.5 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-pos-ink">{d.title}</p>
                    <p className="text-[12px] text-pos-ink/55">
                      {d.fileName}, {fileSize(d.sizeBytes)}, version <span className="font-mono">{d.currentVersion}</span>
                      {d.versions > 1 ? ` of ${d.versions}` : ''}, {d.uploadedVia === 'CLIENT' ? 'from the client' : d.uploadedBy ?? 'the firm'}, {when(d.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {d.sharedWithClient && <span className="inline-flex items-center gap-1 rounded-full bg-[#2f8ae0]/10 px-2 py-0.5 text-[11px] text-[#1f6fc4]"><Share2 className="h-3 w-3" /> Shared</span>}
                    {d.sharedWithClient && d.lockedForClient && <span className="inline-flex items-center gap-1 rounded-full bg-[#f2b53a]/20 px-2 py-0.5 text-[11px] text-[#8a5a00]"><Lock className="h-3 w-3" /> Until <span className="font-mono">{d.invoice?.invoiceNo}</span> is paid</span>}
                    {d.previewable && <button type="button" onClick={async () => setMessage(await openFile(authFetch, d.id, d.currentVersion, d.fileName, true))} className="inline-flex items-center gap-1 text-pos-accent"><Eye className="h-3.5 w-3.5" /> Preview</button>}
                    <button type="button" onClick={async () => setMessage(await openFile(authFetch, d.id, d.currentVersion, d.fileName, false))} className="inline-flex items-center gap-1 text-pos-accent"><Download className="h-3.5 w-3.5" /> Download</button>
                    <button type="button" aria-expanded={openDoc === d.id} onClick={() => setOpenDoc(openDoc === d.id ? null : d.id)} className="inline-flex items-center gap-1 text-pos-ink/70"><History className="h-3.5 w-3.5" /> Versions and sharing</button>
                  </div>
                </div>
                {openDoc === d.id && (
                  <DocumentPanel
                    doc={d}
                    entityId={entityId}
                    folders={folders}
                    canLock={data.canLock}
                    canWaive={data.canWaive}
                    canSeeOpens={data.canSeeOpens}
                    onChange={load}
                    onMessage={setMessage}
                  />
                )}
              </li>
            ))}
            {!children.length && !docs.length && <li className="px-3 py-4 text-[13px] text-pos-ink/55">Nothing here yet. Upload a file or add a folder.</li>}
          </ul>
        </>
      )}
    </section>
  );
}
