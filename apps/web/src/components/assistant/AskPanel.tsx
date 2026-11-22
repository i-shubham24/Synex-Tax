'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Printer, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Citations, DraftNote, areaCls, btnCls, errorText, ghostCls, openPrintable, type CitationView } from './shared';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  citations: CitationView[];
  removed: Array<{ section: string }>;
}
interface Thread {
  id: string;
  kind: 'QUESTION' | 'NOTICE';
  title: string;
  updatedAt: string;
}

/** Questions on income tax, GST, TDS and TCS. Saved per user; exportable as a printable page. */
export function AskPanel({ modelReady }: { modelReady: boolean }) {
  const { authFetch } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadThreads = useCallback(async () => {
    const r = await authFetch('/api/v1/assistant/threads?kind=QUESTION');
    if (r.ok) setThreads((await r.json()).threads);
  }, [authFetch]);
  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const open = async (id: string) => {
    setError('');
    const r = await authFetch(`/api/v1/assistant/threads/${id}`);
    if (!r.ok) return setError(await errorText(r));
    setThreadId(id);
    setMessages((await r.json()).messages);
  };

  const ask = async () => {
    if (question.trim().length < 3) return;
    setBusy(true);
    setError('');
    const q = question.trim();
    try {
      const r = await authFetch('/api/v1/assistant/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, ...(threadId ? { threadId } : {}) }) });
      if (!r.ok) return setError(await errorText(r));
      const b = await r.json();
      setThreadId(b.threadId);
      setMessages((m) => [...m, { role: 'user', content: q, citations: [], removed: [] }, { role: 'assistant', content: b.answer, citations: b.citations, removed: b.removed }]);
      setQuestion('');
      void loadThreads();
    } finally {
      setBusy(false);
    }
  };

  const exportThread = async () => {
    if (!threadId) return;
    const r = await authFetch(`/api/v1/assistant/threads/${threadId}/export`);
    if (r.ok) openPrintable(await r.text());
    else setError(await errorText(r));
  };

  const remove = async (id: string) => {
    const r = await authFetch(`/api/v1/assistant/threads/${id}`, { method: 'DELETE' });
    if (r.ok || r.status === 204) {
      if (id === threadId) {
        setThreadId(null);
        setMessages([]);
      }
      void loadThreads();
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="pos-card p-3">
        <button type="button" className={`${ghostCls} mb-2 w-full justify-center`} onClick={() => { setThreadId(null); setMessages([]); }}>New question</button>
        <ul className="space-y-1">
          {threads.map((t) => (
            <li key={t.id} className={`group flex items-center gap-1 rounded-[8px] px-2 py-1.5 text-[13px] ${t.id === threadId ? 'bg-pos-tint text-pos-ink' : 'text-pos-ink/70 hover:bg-pos-muted'}`}>
              <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => void open(t.id)} title={t.title}>{t.title}</button>
              <button type="button" aria-label="Delete conversation" className="opacity-60 hover:opacity-100" onClick={() => void remove(t.id)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
            </li>
          ))}
          {threads.length === 0 && <li className="px-2 text-[12px] text-pos-ink/50">Your saved questions appear here.</li>}
        </ul>
      </aside>
      <section className="space-y-3">
        <DraftNote />
        {!modelReady && <p className="rounded-[10px] border border-pos-line px-3 py-2 text-[13px] text-pos-ink/70">The assistant is not set up: it needs Amazon Bedrock in an India region. Calculators, templates and the feed still work.</p>}
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={m.id ?? i} className={`pos-card p-4 ${m.role === 'user' ? 'bg-pos-muted' : ''}`}>
              <div className="mb-1 text-[12px] font-medium text-pos-ink/55">{m.role === 'user' ? 'Question' : 'Draft answer'}</div>
              <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-pos-ink">{m.content}</div>
              {m.role === 'assistant' && <Citations citations={m.citations ?? []} removed={m.removed ?? []} />}
            </div>
          ))}
        </div>
        <div className="pos-card space-y-2 p-4">
          <label className="block text-[12px] text-pos-ink/60" htmlFor="assistant-question">Question on income tax, GST, TDS or TCS</label>
          <textarea id="assistant-question" rows={3} maxLength={4000} className={areaCls} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="For example: TDS on rent paid by a firm to an individual landlord from April 2026" />
          {error && <p className="text-[13px] text-[#dc2626]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnCls} disabled={busy || !modelReady || question.trim().length < 3} onClick={() => void ask()}><Send className="h-4 w-4" aria-hidden="true" />{busy ? 'Asking' : threadId ? 'Ask a follow-up' : 'Ask'}</button>
            <button type="button" className={ghostCls} disabled={!threadId} onClick={() => void exportThread()}><Printer className="h-4 w-4" aria-hidden="true" />Printable page</button>
          </div>
        </div>
      </section>
    </div>
  );
}
