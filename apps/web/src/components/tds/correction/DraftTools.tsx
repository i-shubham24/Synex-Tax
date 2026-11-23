'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download, FolderOpen, History, RotateCcw, Trash2, Upload } from 'lucide-react';

type AuthFetch = (url: string, init?: RequestInit) => Promise<Response>;
const pill = 'inline-flex items-center gap-1 rounded-full border border-pos-line px-3 py-1.5 text-[12.5px] text-pos-ink hover:bg-pos-tint disabled:opacity-50';
const input = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
const BASE = '/api/v1/tds/correction-drafts';

export interface DraftSummary { id: string; tan: string; form: string; taxYear: number; quarter: number; title: string | null; deductorName: string | null; currentVersion: number; updatedAt: string }
interface Version { version: number; note: string | null; revertedFrom: number | null; createdAt: string; createdBy: string | null; consoChanged: boolean }
/** A draft as GET /correction-drafts/:id returns it. */
export interface DraftView extends DraftSummary { options: { originalToken?: string; previousToken?: string }; edits: any; conso: any; needed: string[] }

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const save = (name: string, text: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
};

/** Drafts saved for this firm's corrections, to open one. */
export function DraftList({ authFetch, onOpen }: { authFetch: AuthFetch; onOpen: (id: string) => void }) {
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  useEffect(() => {
    authFetch(BASE).then((r) => (r.ok ? r.json() : { drafts: [] })).then((b) => setDrafts(b.drafts ?? [])).catch(() => setDrafts([]));
  }, [authFetch]);
  if (!drafts?.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-[13px] font-medium text-pos-ink"><FolderOpen className="h-4 w-4 text-pos-accent" /> Saved drafts</h3>
      <ul className="divide-y divide-pos-line rounded-[12px] border border-pos-line">
        {drafts.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px] text-pos-ink">
            <span>
              <span className="font-medium">{d.title || d.deductorName || d.tan}</span>
              <span className="ml-2 text-pos-ink/60"><span className="font-mono">{d.tan}</span> · Form {d.form} · Q{d.quarter} · TY {d.taxYear}-{String((d.taxYear + 1) % 100).padStart(2, '0')} · version {d.currentVersion} · {when(d.updatedAt)}</span>
            </span>
            <button type="button" onClick={() => onOpen(d.id)} className={pill}>Open</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Versions, revert, CSV export and import, and delete, for an open draft. */
export function DraftTools({
  authFetch, draft, etag, canWrite, isPartner, onChanged, onDeleted,
}: {
  authFetch: AuthFetch; draft: DraftView; etag: string; canWrite: boolean; isPartner: boolean;
  onChanged: (d: DraftView, etag: string) => void; onDeleted: () => void;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [problems, setProblems] = useState<{ line: number; message: string }[]>([]);

  const loadVersions = useCallback(async () => {
    const r = await authFetch(`${BASE}/${draft.id}/versions`);
    if (r.ok) setVersions((await r.json()).versions);
  }, [authFetch, draft.id]);
  useEffect(() => { if (showVersions) loadVersions(); }, [showVersions, loadVersions, draft.currentVersion]);

  const after = async (r: Response, done: string) => {
    const b = await r.json().catch(() => ({}));
    if (r.status === 422 && b.problems) { setProblems(b.problems); setMsg('Nothing was imported. Fix these rows and try again.'); return; }
    if (!r.ok) { setMsg(b.message ?? b.error ?? 'That did not work.'); return; }
    setProblems([]);
    setMsg(done);
    onChanged(b, r.headers.get('etag') ?? '');
  };

  const revert = async (v: number) => {
    if (!window.confirm(`Go back to version ${v}? Your current changes stay in the history as version ${draft.currentVersion}.`)) return;
    const r = await authFetch(`${BASE}/${draft.id}/versions/${v}/revert`, { method: 'POST', headers: { 'content-type': 'application/json', 'if-match': etag }, body: '{}' });
    await after(r, `Back to version ${v}, saved as a new version.`);
  };

  const exportCsv = async () => {
    setMsg(null);
    const r = await authFetch(`${BASE}/${draft.id}/export-csv`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(reveal ? { revealPans: true, reason } : {}) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(b.message ?? 'Export failed.');
    save(b.fileName, b.csv, 'text/csv');
    if (reveal) { setReveal(false); setReason(''); setMsg('Exported with full PANs; this was recorded in the PII access log.'); }
  };

  const importCsv = async (file: File) => {
    setMsg(null);
    const csv = await file.text();
    const r = await authFetch(`${BASE}/${draft.id}/import-csv`, { method: 'POST', headers: { 'content-type': 'application/json', 'if-match': etag }, body: JSON.stringify({ csv }) });
    await after(r, 'Rows imported and saved as a new version.');
  };

  const remove = async () => {
    if (!window.confirm('Delete this draft? It disappears from the list; its versions stay in the history.')) return;
    const r = await authFetch(`${BASE}/${draft.id}`, { method: 'DELETE', headers: { 'if-match': etag } });
    if (r.ok) onDeleted();
    else setMsg((await r.json().catch(() => ({}))).message ?? 'Not deleted.');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setShowVersions((s) => !s)} className={pill}><History className="h-3.5 w-3.5" /> {showVersions ? 'Hide versions' : 'Versions'}</button>
        <button type="button" onClick={exportCsv} disabled={reveal && reason.trim().length < 5} className={pill}><Download className="h-3.5 w-3.5" /> Export rows as CSV</button>
        {canWrite && (
          <label className={`${pill} cursor-pointer`}><Upload className="h-3.5 w-3.5" /> Import CSV
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importCsv(f); }} />
          </label>
        )}
        {canWrite && <button type="button" onClick={remove} className={pill}><Trash2 className="h-3.5 w-3.5" /> Delete draft</button>}
      </div>
      {isPartner && (
        <div className="space-y-2 text-[12.5px] text-pos-ink/70">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} /> Export full PANs (partner only, logged)</label>
          {reveal && <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the full PANs are needed" maxLength={500} className={input} />}
        </div>
      )}
      <p className="text-[12px] text-pos-ink/55">The CSV has one line per filed row with this draft&apos;s changes. Edit it in a spreadsheet and import it back; rows left blank in the row column are new payees. Masked PANs come back unchanged.</p>
      {msg && <p className="text-[13px] text-pos-ink">{msg}</p>}
      {problems.length > 0 && <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-[#dc2626]">{problems.map((p, i) => <li key={i}>{p.line ? `Line ${p.line}: ` : ''}{p.message}</li>)}</ul>}
      {showVersions && versions && (
        <ul className="divide-y divide-pos-line rounded-[12px] border border-pos-line">
          {versions.map((v) => (
            <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px] text-pos-ink">
              <span>
                <span className="font-medium">Version {v.version}</span>
                <span className="ml-2 text-pos-ink/60">{when(v.createdAt)}{v.createdBy ? ` · ${v.createdBy}` : ''}{v.note ? ` · ${v.note}` : ''}{v.consoChanged && v.version > 1 ? ' · new consolidated file' : ''}</span>
              </span>
              {v.version === draft.currentVersion ? <span className="text-[12px] text-pos-ink/60">Current</span>
                : canWrite && <button type="button" onClick={() => revert(v.version)} className={pill}><RotateCcw className="h-3.5 w-3.5" /> Revert to this</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
