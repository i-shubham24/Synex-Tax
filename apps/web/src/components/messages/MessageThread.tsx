'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, Download, Paperclip, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export interface Message {
  id: string;
  side: 'FIRM' | 'CLIENT';
  senderName: string;
  body: string | null;
  sentAt: string;
  readByFirmAt: string | null;
  readByClientAt: string | null;
  attachments: Array<{ id: string; name: string; mimeType: string; sizeBytes: number }>;
}

interface Props {
  /** The side of the person looking at the thread. */
  viewer: 'FIRM' | 'CLIENT';
  loadUrl: string;
  /** POST JSON { body } (plus whatever extra fields the endpoint needs). */
  sendUrl: string;
  sendExtra?: Record<string, string>;
  attachUrl: string;
  readUrl: string;
  readBody?: Record<string, string>;
  attachmentUrl: (id: string) => string;
  /** Called after the thread is read or a message is sent, so a list can refresh its counts. */
  onChange?: () => void;
}

const MAX_FILE = 10 * 1024 * 1024;
const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** One conversation between the firm and a client entity: messages, files and read receipts. */
export function MessageThread({ viewer, loadUrl, sendUrl, sendExtra, attachUrl, readUrl, readBody, attachmentUrl, onChange }: Props) {
  const { authFetch } = useAuth();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await authFetch(loadUrl);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(b.message ?? 'Messages could not be loaded.');
      setMessages([]);
      return;
    }
    setError(null);
    setMessages(b.messages);
    const theirs = viewer === 'CLIENT' ? 'readByClientAt' : 'readByFirmAt';
    if ((b.messages as Message[]).some((m) => !m[theirs])) {
      await authFetch(readUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(readBody ?? {}) });
      onChange?.();
    }
  }, [authFetch, loadUrl, readUrl, readBody, viewer, onChange]);

  useEffect(() => {
    setMessages(null);
    load().catch(() => setError('Messages could not be loaded.'));
    const id = window.setInterval(() => load().catch(() => {}), 20_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      const r = await authFetch(sendUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sendExtra, body }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? 'The message was not sent. Try again.');
      setText('');
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The message was not sent.');
    } finally {
      setBusy(false);
    }
  }

  async function attach(file: File | undefined) {
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    if (file.size > MAX_FILE) return setError('This file is larger than 10 MB. Send a smaller file or split the PDF.');
    setBusy(true);
    setError(null);
    try {
      const caption = text.trim().slice(0, 500);
      const r = await authFetch(attachUrl, {
        method: 'POST',
        headers: {
          'content-type': file.type || 'application/octet-stream',
          'x-file-name': encodeURIComponent(file.name),
          ...(caption ? { 'x-caption': encodeURIComponent(caption) } : {}),
        },
        body: file,
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? 'The file was not sent. Try again.');
      if (caption) setText('');
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The file was not sent.');
    } finally {
      setBusy(false);
    }
  }

  async function download(id: string, name: string) {
    const r = await authFetch(attachmentUrl(id));
    if (!r.ok) return setError((await r.json().catch(() => ({}))).message ?? 'The file could not be downloaded.');
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages === null && <p className="text-[13px] text-pos-ink/55">Loading messages</p>}
        {messages?.length === 0 && !error && <p className="text-[13px] text-pos-ink/55">No messages yet. Write the first one below.</p>}
        {messages?.map((m) => {
          const mine = m.side === viewer;
          const seen = viewer === 'FIRM' ? m.readByClientAt : m.readByFirmAt;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-[14px] px-3.5 py-2.5 ${mine ? 'bg-pos-accent text-white' : 'border border-pos-line bg-pos-muted text-pos-ink'}`}>
                {!mine && <p className="text-[12.5px] font-medium opacity-70">{m.senderName}</p>}
                {m.body === null ? (
                  <p className="text-[13.5px] italic opacity-75">This message cannot be read.</p>
                ) : (
                  m.body && <p className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.5]">{m.body}</p>
                )}
                {m.attachments.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => download(a.id, a.name)}
                    className={`mt-1.5 flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-left text-[12.5px] ${mine ? 'bg-white/15' : 'bg-pos-surface'}`}
                  >
                    <Download className="h-3.5 w-3.5 shrink-0" />
                    <span className="break-all">{a.name}</span>
                    <span className="shrink-0 opacity-70">{size(a.sizeBytes)}</span>
                  </button>
                ))}
                <p className={`mt-1 flex items-center justify-end gap-1 text-[12px] ${mine ? 'text-white/75' : 'text-pos-ink/60'}`}>
                  {time(m.sentAt)}
                  {mine && (seen ? <span className="inline-flex items-center gap-0.5"><CheckCheck className="h-3.5 w-3.5" aria-hidden /> Read</span> : <Check className="h-3.5 w-3.5" aria-label="Sent" />)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {error && <p role="status" className="px-4 pb-2 text-[13px] text-pos-red">{error}</p>}
      <form onSubmit={send} className="flex items-end gap-2 border-t border-pos-line p-3">
        <label className={`flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-pos-line text-pos-ink/70 hover:bg-pos-muted ${busy ? 'pointer-events-none opacity-50' : ''}`} title="Attach a PDF or photo">
          <Paperclip className="h-4 w-4" />
          <span className="sr-only">Attach a PDF or photo (up to 10 MB)</span>
          <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(e) => attach(e.target.files?.[0])} />
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
            }
          }}
          maxLength={4000}
          rows={1}
          placeholder="Write a message"
          aria-label="Message"
          className="min-h-10 flex-1 resize-none rounded-[20px] border border-pos-line bg-pos-surface px-4 py-2.5 text-[13.5px] text-pos-ink outline-none focus:border-pos-accent"
        />
        <button type="submit" disabled={busy || !text.trim()} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-pos-accent px-4 text-[13px] font-medium text-white disabled:opacity-50">
          <Send className="h-4 w-4" /> Send
        </button>
      </form>
    </div>
  );
}
