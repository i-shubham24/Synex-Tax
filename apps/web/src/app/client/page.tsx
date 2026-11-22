'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MessageThread } from '../../components/messages/MessageThread';
import { ChecklistsSection, DocumentsSection, FilingsSection, type Checklist, type Filings, type SharedDoc } from '../../components/client/ClientSections';

interface Me { firm: string; name: string; entities: Array<{ id: string; name: string; tradeName: string | null; pan: string; unread: number }>; messagesEnabled: boolean }

/** A client's view: its businesses, what the firm needs, shared documents, return status and messages. */
export default function ClientHomePage() {
  const { authFetch, user } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [entityId, setEntityId] = useState<string>('');
  const [lists, setLists] = useState<Checklist[]>([]);
  const [docs, setDocs] = useState<SharedDoc[]>([]);
  const [docsUnavailable, setDocsUnavailable] = useState(false);
  const [filings, setFilings] = useState<Filings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    const r = await authFetch('/api/v1/client/me');
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return setError(b.message ?? 'Your details could not be loaded.');
    setMe(b);
    setEntityId((cur) => cur || b.entities[0]?.id || '');
  }, [authFetch]);

  const loadLists = useCallback(async () => {
    const r = await authFetch('/api/v1/client/checklists');
    if (r.ok) setLists((await r.json()).checklists);
  }, [authFetch]);

  useEffect(() => {
    if (user?.role !== 'CLIENT') return;
    loadMe().catch(() => setError('Your details could not be loaded.'));
    loadLists().catch(() => {});
    authFetch('/api/v1/client/documents')
      .then(async (r) => {
        if (r.status === 503) setDocsUnavailable(true);
        else if (r.ok) setDocs((await r.json()).documents);
      })
      .catch(() => {});
    authFetch('/api/v1/client/filings')
      .then(async (r) => (r.ok ? setFilings(await r.json()) : null))
      .catch(() => {});
  }, [user, authFetch, loadMe, loadLists]);

  const thread = useMemo(
    () => (entityId ? { load: `/api/v1/client/messages?entityId=${entityId}`, extra: { entityId }, read: { entityId } } : null),
    [entityId],
  );
  const attachmentUrl = useCallback((id: string) => `/api/v1/client/messages/attachments/${id}`, []);

  if (user?.role !== 'CLIENT') return null;
  if (error) return <p role="status" className="text-[13.5px] text-pos-red">{error}</p>;
  if (!me) return <p className="text-[13.5px] text-pos-ink/55">Loading</p>;
  if (!me.entities.length) return <p className="text-[13.5px] text-pos-ink/60">Your login is not linked to a business yet. Ask {me.firm || 'your CA'} to link it.</p>;

  const multi = me.entities.length > 1;
  const current = me.entities.find((e) => e.id === entityId) ?? me.entities[0];
  const only = <T extends { entityId: string }>(rows: T[]) => rows.filter((r) => r.entityId === current.id);
  const filtered: Filings | null = filings ? { gst: only(filings.gst), tds: only(filings.tds) } : null;

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-[24px] font-semibold tracking-[-0.01em]">Hello, {me.name}</h1>
        <p className="mt-1 text-[13.5px] text-pos-ink/60">What {me.firm} needs from you, documents they have shared, and messages.</p>
      </div>

      <nav aria-label="Your businesses" className="flex flex-wrap gap-2">
        {me.entities.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setEntityId(e.id)}
            aria-pressed={e.id === current.id}
            className={`rounded-[12px] border px-3.5 py-2 text-left ${e.id === current.id ? 'border-pos-accent bg-pos-tint' : 'border-pos-line bg-pos-surface hover:bg-pos-muted'}`}
          >
            <span className="block text-[13.5px] font-medium">{e.name}</span>
            <span className="block text-[12px] text-pos-ink/55">
              PAN <span className="font-mono">{e.pan}</span>
              {e.unread > 0 && <span className="ml-2 rounded-full bg-pos-accent px-1.5 py-0.5 text-[11px] font-medium text-white">{e.unread} new</span>}
            </span>
          </button>
        ))}
      </nav>

      <section aria-labelledby="needed">
        <h2 id="needed" className="mb-2.5 text-[16px] font-semibold">Documents needed</h2>
        <ChecklistsSection lists={only(lists)} multi={false} onChange={loadLists} />
      </section>

      <section aria-labelledby="shared">
        <h2 id="shared" className="mb-2.5 text-[16px] font-semibold">Shared with you</h2>
        <DocumentsSection docs={only(docs)} unavailable={docsUnavailable} multi={false} />
      </section>

      <section aria-labelledby="returns">
        <h2 id="returns" className="mb-2.5 text-[16px] font-semibold">Your returns</h2>
        <FilingsSection filings={filtered} multi={false} />
      </section>

      <section aria-labelledby="messages">
        <h2 id="messages" className="mb-2.5 text-[16px] font-semibold">Messages with {me.firm}{multi ? ` about ${current.name}` : ''}</h2>
        {me.messagesEnabled && thread ? (
          <div className="overflow-hidden rounded-[14px] border border-pos-line bg-pos-surface">
            <MessageThread
              viewer="CLIENT"
              loadUrl={thread.load}
              sendUrl="/api/v1/client/messages"
              sendExtra={thread.extra}
              attachUrl={`/api/v1/client/messages/attachments?entityId=${current.id}`}
              readUrl="/api/v1/client/messages/read"
              readBody={thread.read}
              attachmentUrl={attachmentUrl}
              onChange={loadMe}
            />
          </div>
        ) : (
          <p className="text-[13.5px] text-pos-ink/55">Messages are not switched on yet. Contact your CA another way.</p>
        )}
      </section>
    </div>
  );
}
