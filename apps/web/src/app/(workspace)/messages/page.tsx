'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare, Plus } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { MessageThread } from '../../../components/messages/MessageThread';

interface Conversation { entityId: string; entityName: string; lastMessageAt: string | null; lastSide: 'FIRM' | 'CLIENT' | null; unread: number; preview: string | null; clientLogins: number }
interface Entity { id: string; name: string; clientLogins: number }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

/** The firm's inbox: one conversation per client, for the clients the signed-in member can see. */
export default function MessagesPage() {
  const { authFetch } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await authFetch('/api/v1/client/firm/conversations');
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return setError(b.message ?? 'Messages could not be loaded.');
    setError(null);
    setConversations(b.conversations);
    setEntities(b.entities);
  }, [authFetch]);

  useEffect(() => {
    load().catch(() => setError('Messages could not be loaded.'));
  }, [load]);

  const current = selected ? conversations.find((c) => c.entityId === selected) ?? entities.find((e) => e.id === selected) : null;
  const currentName = current ? ('entityName' in current ? current.entityName : current.name) : '';
  const currentLogins = current?.clientLogins ?? 0;
  const urls = useMemo(
    () =>
      selected
        ? {
            load: `/api/v1/client/firm/conversations/${selected}/messages`,
            send: `/api/v1/client/firm/conversations/${selected}/messages`,
            attach: `/api/v1/client/firm/conversations/${selected}/attachments`,
            read: `/api/v1/client/firm/conversations/${selected}/read`,
          }
        : null,
    [selected],
  );
  const attachmentUrl = useCallback((id: string) => `/api/v1/client/firm/attachments/${id}`, []);
  const without = entities.filter((e) => !conversations.some((c) => c.entityId === e.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-pos-ink">Messages</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-pos-ink/60">Conversations with your clients&apos; logins, one per client. Messages are stored encrypted and every message is logged.</p>
      </div>
      {error && <p role="status" className="text-[13.5px] text-pos-red">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <section className="pos-card p-3" aria-label="Conversations">
          <div className="flex items-center justify-between px-1 pb-2">
            <h2 className="text-[14px] font-semibold text-pos-ink">Clients</h2>
            <button type="button" onClick={() => setPicking((p) => !p)} className="inline-flex items-center gap-1 rounded-full border border-pos-line px-2.5 py-1 text-[12px] text-pos-ink/70">
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          </div>
          {picking && (
            <select
              aria-label="Start a conversation with"
              value=""
              onChange={(e) => {
                if (e.target.value) setSelected(e.target.value);
                setPicking(false);
              }}
              className="mb-2 h-10 w-full rounded-full border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink"
            >
              <option value="">Choose a client</option>
              {without.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.clientLogins ? '' : ' (no client login yet)'}
                </option>
              ))}
            </select>
          )}
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li key={c.entityId}>
                <button
                  type="button"
                  onClick={() => setSelected(c.entityId)}
                  className={`w-full rounded-[12px] px-3 py-2.5 text-left ${selected === c.entityId ? 'bg-pos-tint' : 'hover:bg-pos-muted'}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13.5px] font-medium text-pos-ink">{c.entityName}</span>
                    <span className="shrink-0 text-[11.5px] text-pos-ink/45">{when(c.lastMessageAt)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[12.5px] text-pos-ink/55">
                      {c.lastSide === 'FIRM' ? 'You: ' : ''}
                      {c.preview ?? ''}
                    </span>
                    {c.unread > 0 && <span className="shrink-0 rounded-full bg-pos-accent px-2 py-0.5 text-[11px] font-medium text-white">{c.unread}</span>}
                  </span>
                </button>
              </li>
            ))}
            {!conversations.length && <li className="px-3 py-4 text-[13px] text-pos-ink/55">No conversations yet. Choose New to write to a client.</li>}
          </ul>
        </section>

        <section className="pos-card overflow-hidden" aria-label="Conversation">
          {selected && urls ? (
            <>
              <div className="border-b border-pos-line px-4 py-3">
                <h2 className="text-[15px] font-semibold text-pos-ink">{currentName}</h2>
                <p className="text-[12.5px] text-pos-ink/55">
                  {currentLogins ? `${currentLogins} client login${currentLogins === 1 ? '' : 's'} can read this conversation.` : 'No client login yet: invite a contact from Team so they can read and reply.'}
                </p>
              </div>
              <MessageThread viewer="FIRM" loadUrl={urls.load} sendUrl={urls.send} attachUrl={urls.attach} readUrl={urls.read} attachmentUrl={attachmentUrl} onChange={load} />
            </>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 p-6 text-center text-pos-ink/55">
              <MessageSquare className="h-6 w-6" />
              <p className="text-[13.5px]">Choose a client to read and reply.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
