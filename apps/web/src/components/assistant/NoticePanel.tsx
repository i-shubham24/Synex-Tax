'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { FilePenLine, PenLine, Printer } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Citations, DraftNote, areaCls, btnCls, errorText, ghostCls, openPrintable, type CitationView } from './shared';

interface Draft {
  text: string;
  citations: CitationView[];
  removed: Array<{ section: string }>;
}

/** Notice reply drafts: paste the notice and the facts, get a draft, then an Enhance pass. */
export function NoticePanel({ modelReady }: { modelReady: boolean }) {
  const { authFetch } = useAuth();
  const [notice, setNotice] = useState('');
  const [facts, setFacts] = useState('');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState<'draft' | 'enhance' | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Array<{ id: string; title: string }>>([]);

  const loadSaved = useCallback(async () => {
    const r = await authFetch('/api/v1/assistant/threads?kind=NOTICE');
    if (r.ok) setSaved((await r.json()).threads);
  }, [authFetch]);
  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  const call = async (kind: 'draft' | 'enhance') => {
    setBusy(kind);
    setError('');
    try {
      const r = await authFetch(`/api/v1/assistant/notice/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'draft' ? { notice, facts } : { threadId }),
      });
      if (!r.ok) return setError(await errorText(r));
      const b = await r.json();
      setThreadId(b.threadId);
      setDrafts((d) => [...(kind === 'draft' ? [] : d), { text: b.draft, citations: b.citations, removed: b.removed }]);
      void loadSaved();
    } finally {
      setBusy(null);
    }
  };

  const openSaved = async (id: string) => {
    const r = await authFetch(`/api/v1/assistant/threads/${id}`);
    if (!r.ok) return setError(await errorText(r));
    const b = await r.json();
    setThreadId(id);
    setDrafts(b.messages.filter((m: { role: string }) => m.role === 'assistant').map((m: { content: string; citations: CitationView[]; removed: Array<{ section: string }> }) => ({ text: m.content, citations: m.citations, removed: m.removed })));
  };

  const print = async () => {
    if (!threadId) return;
    const r = await authFetch(`/api/v1/assistant/threads/${threadId}/export`);
    if (r.ok) openPrintable(await r.text());
  };

  const latest = drafts[drafts.length - 1];
  return (
    <div className="space-y-4">
      <DraftNote>Draft replies are for the CA to check, complete and sign. They are not advice. Sections the mapping table cannot verify are removed and listed below the draft.</DraftNote>
      {!modelReady && <p className="rounded-[10px] border border-pos-line px-3 py-2 text-[13px] text-pos-ink/70">Notice drafts need the assistant, which is not set up (Amazon Bedrock in an India region).</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="pos-card space-y-3 p-4">
          <label className="block text-[12px] text-pos-ink/60">Notice text, as received
            <textarea rows={10} maxLength={30000} className={areaCls} value={notice} onChange={(e) => setNotice(e.target.value)} />
          </label>
          <label className="block text-[12px] text-pos-ink/60">Facts and your position
            <textarea rows={6} maxLength={10000} className={areaCls} value={facts} onChange={(e) => setFacts(e.target.value)} placeholder="What happened, figures, documents you hold" />
          </label>
          {error && <p className="text-[13px] text-[#dc2626]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnCls} disabled={!modelReady || busy !== null || notice.trim().length < 20} onClick={() => void call('draft')}><FilePenLine className="h-4 w-4" aria-hidden="true" />{busy === 'draft' ? 'Drafting' : 'Draft a reply'}</button>
            <button type="button" className={ghostCls} disabled={!modelReady || busy !== null || !threadId || !latest} onClick={() => void call('enhance')}><PenLine className="h-4 w-4" aria-hidden="true" />{busy === 'enhance' ? 'Improving' : 'Enhance'}</button>
            <button type="button" className={ghostCls} disabled={!threadId} onClick={() => void print()}><Printer className="h-4 w-4" aria-hidden="true" />Printable page</button>
          </div>
          {saved.length > 0 && (
            <div className="border-t border-pos-line pt-2 text-[12px] text-pos-ink/60">
              Saved drafts:
              <ul className="mt-1 space-y-0.5">
                {saved.slice(0, 8).map((s) => <li key={s.id}><button type="button" className="truncate text-left text-pos-accent hover:underline" onClick={() => void openSaved(s.id)}>{s.title}</button></li>)}
              </ul>
            </div>
          )}
        </div>
        <div className="pos-card p-4">
          <div className="mb-1 text-[12px] font-medium text-pos-ink/55">{drafts.length > 1 ? `Draft ${drafts.length}, after Enhance` : 'Draft reply'}</div>
          {latest ? (
            <>
              <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-pos-ink">{latest.text}</div>
              <Citations citations={latest.citations ?? []} removed={latest.removed ?? []} />
            </>
          ) : (
            <p className="text-[13px] text-pos-ink/50">The draft appears here.</p>
          )}
        </div>
      </div>
    </div>
  );
}
