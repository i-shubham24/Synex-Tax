'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Mail, MessageCircle, Plus } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { ChecklistFiles } from '../../../components/documents/ChecklistFiles';
import { ClientDocuments } from '../../../components/documents/ClientDocuments';
import { ReminderSettings } from '../../../components/documents/ReminderSettings';

type Status = 'MISSING' | 'RECEIVED' | 'ACCEPTED' | 'REJECTED' | 'NOT_NEEDED';
interface Item { id: string; label: string; status: Status; version?: string }
interface Checklist { id: string; entityId: string; clientName: string; service: string; periodLabel: string; dueDate: string; status: string; lastReminder: string | null; items: Item[] }
interface GapRow extends Checklist { outstanding: string[]; done: number; total: number }
type Gaps = Record<'OVERDUE' | 'THIS_WEEK' | 'LATER', GapRow[]>;

const STATUS_LABEL: Record<Status, string> = { MISSING: 'Missing', RECEIVED: 'Received', ACCEPTED: 'Accepted', REJECTED: 'Sent back', NOT_NEEDED: 'Not needed' };
const STATUS_CHIP: Record<Status, string> = {
  MISSING: 'bg-[#dc2626]/10 text-[#b91c1c]',
  RECEIVED: 'bg-[#2f8ae0]/10 text-[#1f6fc4]',
  ACCEPTED: 'bg-[#5fe88a]/20 text-[#147a3a]',
  REJECTED: 'bg-[#f2b53a]/20 text-[#8a5a00]',
  NOT_NEEDED: 'bg-pos-muted text-pos-ink/50',
};
const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function DocumentsPage() {
  const { authFetch } = useAuth();
  const [gaps, setGaps] = useState<Gaps | null>(null);
  const [lists, setLists] = useState<Checklist[]>([]);
  const [services, setServices] = useState<Array<{ id: string; label: string }>>([]);
  const [clients, setClients] = useState<Array<{ id: string; legal_name?: string; legalName?: string }>>([]);
  const [form, setForm] = useState({ entityId: '', service: 'GST_MONTHLY', periodLabel: '', dueDate: '' });
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ text: string; link: string | null } | null>(null);
  const [tab, setTab] = useState<'checklists' | 'documents' | 'reminders'>('checklists');

  const load = useCallback(async () => {
    const [g, l] = await Promise.all([authFetch('/api/v1/practice/gaps'), authFetch('/api/v1/practice/checklists')]);
    if (g.ok) setGaps(await g.json());
    if (l.ok) {
      const body = await l.json();
      setLists(body.checklists);
      setServices(body.services);
    }
  }, [authFetch]);

  useEffect(() => {
    load().catch(() => {});
    authFetch('/api/v1/client-master/entities')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setClients(Array.isArray(d) ? d : d.data ?? d.entities ?? []))
      .catch(() => {});
  }, [load, authFetch]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const r = await authFetch('/api/v1/practice/checklists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (r.status === 201) {
      setForm({ ...form, periodLabel: '', dueDate: '' });
      await load();
    } else setMessage((await r.json()).message ?? 'Could not create the checklist.');
  }

  async function setItem(id: string, status: Status) {
    // The version this screen showed: if someone changed the item since, the API answers 409.
    const version = lists.flatMap((l) => l.items).find((i) => i.id === id)?.version;
    const r = await authFetch(`/api/v1/practice/items/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(version ? { 'If-Match': `"${version}"` } : {}) }, body: JSON.stringify({ status }) });
    if (r.status === 409) setMessage('Someone updated this item while you had the page open. The latest is shown now.');
    await load();
  }

  async function remind(id: string, channel: 'WHATSAPP' | 'EMAIL') {
    const r = await authFetch(`/api/v1/practice/checklists/${id}/reminder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel }) });
    const body = await r.json();
    if (body.link) window.open(body.link, '_blank', 'noopener');
    setPreview({ text: body.message, link: body.link });
    if (body.missingContact) setMessage(channel === 'WHATSAPP' ? 'No mobile number for this client. Copy the message below, or add a contact in Client Master.' : 'No email for this client. Copy the message below.');
    await load();
  }

  const columns: Array<[keyof Gaps, string, string]> = [
    ['OVERDUE', 'Overdue', 'text-[#dc2626]'],
    ['THIS_WEEK', 'Due this week', 'text-[#b45309]'],
    ['LATER', 'Later', 'text-pos-ink/60'],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-pos-ink">Client documents</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-pos-ink/60">What each client still owes you for this month&apos;s work, and a reminder ready to send. Every change is logged.</p>
      </div>

      <div role="tablist" aria-label="Documents sections" className="inline-flex rounded-full border border-pos-line p-1">
        {([['checklists', 'Checklists'], ['documents', 'Documents'], ['reminders', 'Automatic reminders']] as const).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-full px-4 py-1.5 text-[13px] ${tab === key ? 'bg-pos-ink font-medium text-pos-surface' : 'text-pos-ink/65'}`}>{label}</button>
        ))}
      </div>

      {tab === 'documents' && <ClientDocuments clients={clients.map((c) => ({ id: c.id, name: c.legal_name ?? c.legalName ?? 'Client' }))} />}
      {tab === 'reminders' && <ReminderSettings />}

      {tab === 'checklists' && (<>

      <div className="grid gap-4 lg:grid-cols-3">
        {columns.map(([key, title, tone]) => (
          <section key={key} className="pos-card p-4" aria-labelledby={`gap-${key}`}>
            <h2 id={`gap-${key}`} className={`text-[14px] font-semibold ${tone}`}>{title} <span className="text-pos-ink/40">{gaps?.[key].length ?? 0}</span></h2>
            <ul className="mt-3 space-y-3">
              {(gaps?.[key] ?? []).map((g) => (
                <li key={g.id} className="rounded-[14px] border border-pos-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[13.5px] font-medium text-pos-ink">{g.clientName}</p>
                      <p className="text-[12px] text-pos-ink/55">{services.find((s) => s.id === g.service)?.label ?? g.service}, {g.periodLabel}, due {nice(g.dueDate)}</p>
                    </div>
                    <span className="text-[12px] tabular-nums text-pos-ink/50">{g.done}/{g.total}</span>
                  </div>
                  <ul className="mt-2 list-disc pl-4 text-[12.5px] text-pos-ink/70">{g.outstanding.map((o) => <li key={o}>{o}</li>)}</ul>
                  <div className="mt-2.5 flex gap-2">
                    <button type="button" onClick={() => remind(g.id, 'WHATSAPP')} className="inline-flex items-center gap-1.5 rounded-full bg-[#22a356] px-3 py-1.5 text-[12px] font-medium text-white"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</button>
                    <button type="button" onClick={() => remind(g.id, 'EMAIL')} className="inline-flex items-center gap-1.5 rounded-full border border-pos-line px-3 py-1.5 text-[12px] text-pos-ink/70"><Mail className="h-3.5 w-3.5" /> Email</button>
                    {g.lastReminder && <span className="self-center text-[11.5px] text-pos-ink/45">reminded {new Date(g.lastReminder).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {message && <p role="status" className="text-[13.5px] text-[#b45309]">{message}</p>}
      {preview && (
        <div className="pos-card p-4">
          <p className="text-[12.5px] font-medium text-pos-ink/60">Reminder text {preview.link ? '(opened in a new tab; send it there)' : ''}</p>
          <pre className="mt-2 whitespace-pre-wrap rounded-[12px] bg-pos-muted p-3 text-[12.5px] text-pos-ink">{preview.text}</pre>
          <button type="button" onClick={() => navigator.clipboard?.writeText(preview.text)} className="mt-2 rounded-full border border-pos-line px-3 py-1.5 text-[12px] text-pos-ink/70">Copy text</button>
        </div>
      )}

      <form onSubmit={create} className="pos-card flex flex-wrap items-end gap-3 p-4" aria-label="New checklist">
        <label className="flex flex-col gap-1 text-[12px] text-pos-ink/55">Client
          <select required value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })} className="h-10 min-w-[14rem] rounded-full border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink">
            <option value="">Choose</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name ?? c.legalName}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-pos-ink/55">Service
          <select value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} className="h-10 rounded-full border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink">
            {services.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-pos-ink/55">Period
          <input required placeholder="Nov 2026" value={form.periodLabel} onChange={(e) => setForm({ ...form, periodLabel: e.target.value })} className="h-10 w-32 rounded-full border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-pos-ink/55">Documents due
          <input required type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="h-10 rounded-full border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink" />
        </label>
        <button type="submit" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-pos-accent px-4 text-[13px] font-medium text-white"><Plus className="h-4 w-4" /> New checklist</button>
      </form>

      <section className="space-y-3" aria-label="All checklists">
        {lists.map((k) => (
          <details key={k.id} className="pos-card p-4" open={k.status === 'OPEN' && lists.length <= 3}>
            <summary className="cursor-pointer text-[13.5px] text-pos-ink">
              <span className="font-medium">{k.clientName}</span>, {services.find((s) => s.id === k.service)?.label ?? k.service}, {k.periodLabel}
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${k.status === 'COMPLETE' ? 'bg-[#5fe88a]/20 text-[#147a3a]' : 'bg-pos-muted text-pos-ink/60'}`}>{k.status === 'COMPLETE' ? 'Complete' : `Due ${nice(k.dueDate)}`}</span>
            </summary>
            <ul className="mt-3 divide-y divide-pos-line">
              {k.items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                  <span className="text-pos-ink">{i.label}</span>
                  <span className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP[i.status]}`}>{STATUS_LABEL[i.status]}</span>
                    <select aria-label={`Status of ${i.label}`} value={i.status} onChange={(e) => setItem(i.id, e.target.value as Status)} className="rounded-full border border-pos-line bg-pos-surface px-2 py-1 text-[12px] text-pos-ink">
                      {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </span>
                </li>
              ))}
            </ul>
            <ChecklistFiles checklistId={k.id} items={k.items} onChange={load} />
          </details>
        ))}
        {!lists.length && <p className="text-[13.5px] text-pos-ink/55">No checklists yet. Create one above for a client and period.</p>}
      </section>
      </>)}
    </div>
  );
}
