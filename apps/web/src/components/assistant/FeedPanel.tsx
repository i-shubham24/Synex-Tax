'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, MessageSquareText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Citations, errorText, ghostCls, type CitationView } from './shared';

interface Item {
  id: string;
  source: 'CBDT' | 'EFILING' | 'CBIC' | 'GSTC';
  title: string;
  date: string | null;
  link: string;
  hasText: boolean;
}

const SOURCE_LABEL: Record<Item['source'], string> = { CBDT: 'CBDT', EFILING: 'E-filing portal', CBIC: 'CBIC GST', GSTC: 'GST Council' };

/** Notifications, circulars and press releases read daily from the official listing pages. */
export function FeedPanel({ modelReady }: { modelReady: boolean }) {
  const { authFetch } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [source, setSource] = useState<Item['source'] | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [explained, setExplained] = useState<Record<string, { text: string; citations: CitationView[]; removed: Array<{ section: string }> } | 'busy'>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const r = await authFetch(`/api/v1/assistant/feed${source ? `?source=${source}` : ''}`);
    if (r.ok) setItems((await r.json()).items);
    else setError(await errorText(r));
    setLoading(false);
  }, [authFetch, source]);
  useEffect(() => {
    void load();
  }, [load]);

  const explain = async (id: string) => {
    setExplained((e) => ({ ...e, [id]: 'busy' }));
    const r = await authFetch(`/api/v1/assistant/feed/${id}/explain`, { method: 'POST' });
    if (!r.ok) {
      setError(await errorText(r));
      setExplained((e) => {
        const n = { ...e };
        delete n[id];
        return n;
      });
      return;
    }
    const b = await r.json();
    setExplained((e) => ({ ...e, [id]: { text: b.explanation, citations: b.citations, removed: b.removed } }));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(['', 'CBDT', 'EFILING', 'CBIC', 'GSTC'] as const).map((s) => (
          <button key={s || 'all'} type="button" onClick={() => setSource(s)} className={`rounded-[10px] px-3 py-1.5 text-[13px] font-medium ${source === s ? 'bg-pos-tint text-pos-ink ring-1 ring-pos-accent' : 'bg-pos-muted text-pos-ink/70 hover:text-pos-ink'}`}>{s ? SOURCE_LABEL[s] : 'All'}</button>
        ))}
      </div>
      <p className="text-[12px] text-pos-ink/55">Read once a day from incometax.gov.in (news, including CBDT notifications and circulars), cbic-gst.gov.in and gstcouncil.gov.in. Open the official link before acting on an item. CBIC&apos;s list gives no dates; those items show the day they were first seen.</p>
      {error && <p className="text-[13px] text-[#dc2626]">{error}</p>}
      {loading ? <p className="text-[13px] text-pos-ink/60">Loading</p> : items.length === 0 ? <p className="text-[13px] text-pos-ink/60">Nothing yet. The feed fills after the daily refresh runs.</p> : (
        <ul className="space-y-2">
          {items.map((it) => {
            const ex = explained[it.id];
            return (
              <li key={it.id} className="pos-card p-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-pos-ink/55">
                  <span className="font-medium text-pos-ink/70">{SOURCE_LABEL[it.source]}</span>
                  <span className="font-mono">{it.date ?? 'date not given'}</span>
                </div>
                <p className="mt-1 text-[14px] text-pos-ink">{it.title}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a href={it.link} target="_blank" rel="noopener noreferrer" className={ghostCls}><ExternalLink className="h-4 w-4" aria-hidden="true" />Official text</a>
                  <button type="button" className={ghostCls} disabled={!modelReady || ex === 'busy'} title={modelReady ? undefined : 'The assistant is not set up'} onClick={() => void explain(it.id)}><MessageSquareText className="h-4 w-4" aria-hidden="true" />{ex === 'busy' ? 'Explaining' : 'Explain'}</button>
                </div>
                {ex && ex !== 'busy' && (
                  <div className="mt-2 rounded-[10px] bg-pos-muted p-3">
                    <div className="mb-1 text-[12px] font-medium text-pos-ink/55">Draft explanation, from the title{it.hasText ? ' and summary' : ''} only. Check the official text.</div>
                    <div className="whitespace-pre-wrap text-[13px] text-pos-ink">{ex.text}</div>
                    <Citations citations={ex.citations ?? []} removed={ex.removed ?? []} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
