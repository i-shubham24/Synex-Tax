'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { PracticeTask } from './TaskBoard';

interface Meeting { id: string; title: string; startsAt: string; durationMinutes: number; location: string | null; entityId: string | null; client: string | null; notes: string | null; status: 'SCHEDULED' | 'CANCELLED'; createdBy: string | null; canEdit: boolean; version: string }
type Item =
  | { type: 'task'; day: string; key: string; label: string; sub: string; tone: 'return' | 'deposit'; done: boolean; overdue: boolean }
  | { type: 'meeting'; day: string; key: string; label: string; sub: string; time: string; meeting: Meeting };

/** Payments due; every other task kind is a return or statement to file. */
const DEPOSIT_KINDS = new Set(['PMT06', 'TDS_DEPOSIT']);
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_MS = 86_400_000;

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const weekday = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday 0
const mondayOf = (iso: string) => addDays(iso, -weekday(iso));
const istDay = (instant: string) => new Date(Date.parse(instant) + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const istTime = (instant: string) => new Date(instant).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const monthTitle = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayTitle = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const input = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';

/**
 * Month and week calendar of task due dates (returns and deposits) and firm meetings. Anyone in the
 * firm can add a meeting; the person who added it, a manager or a partner can cancel it.
 */
export function PracticeCalendar() {
  const { authFetch } = useAuth();
  const [view, setView] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(istToday());
  const [tasks, setTasks] = useState<PracticeTask[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', date: istToday(), time: '11:00', duration: '30', location: '', entityId: '', notes: '' });

  // The visible range: whole weeks, Monday to Sunday.
  const { start, days } = useMemo(() => {
    if (view === 'week') {
      const s = mondayOf(anchor);
      return { start: s, days: Array.from({ length: 7 }, (_, i) => addDays(s, i)) };
    }
    const first = `${anchor.slice(0, 7)}-01`;
    const s = mondayOf(first);
    const nextMonth = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 1)).toISOString().slice(0, 10);
    const count = Math.ceil((Date.parse(`${nextMonth}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / DAY_MS / 7) * 7;
    return { start: s, days: Array.from({ length: count }, (_, i) => addDays(s, i)) };
  }, [view, anchor]);
  const end = days[days.length - 1];

  const load = useCallback(async () => {
    const [t, m] = await Promise.all([authFetch(`/api/v1/practice/tasks?from=${start}&to=${end}`), authFetch(`/api/v1/team/meetings?from=${start}&to=${end}`)]);
    setTasks(t.ok ? (await t.json()).tasks : []);
    setMeetings(m.ok ? (await m.json()).meetings : []);
    if (!t.ok && t.status === 403) setMessage({ tone: 'bad', text: 'Task due dates are hidden: your partner has not given you the tasks screen.' });
  }, [authFetch, start, end]);
  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    const push = (it: Item) => map.set(it.day, [...(map.get(it.day) ?? []), it]);
    for (const m of meetings) push({ type: 'meeting', day: istDay(m.startsAt), key: `m-${m.id}`, label: m.title, sub: [m.client, m.location].filter(Boolean).join(', '), time: istTime(m.startsAt), meeting: m });
    for (const t of tasks) {
      if (t.status === 'NOT_APPLICABLE') continue;
      push({ type: 'task', day: t.due_date, key: `t-${t.id}`, label: t.title, sub: t.client, tone: DEPOSIT_KINDS.has(t.kind) ? 'deposit' : 'return', done: t.status === 'DONE', overdue: t.overdue });
    }
    for (const list of map.values()) list.sort((a, b) => (a.type === b.type ? 0 : a.type === 'meeting' ? -1 : 1));
    return map;
  }, [tasks, meetings]);

  const clients = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tasks) seen.set(t.entity_id, t.client);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);

  const shift = (n: -1 | 1) => {
    if (view === 'week') return setAnchor(addDays(anchor, 7 * n));
    const d = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 1 + n, 1));
    setAnchor(d.toISOString().slice(0, 10));
  };

  const addMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const r = await authFetch('/api/v1/team/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        startsAt: `${form.date}T${form.time}:00+05:30`,
        durationMinutes: Number(form.duration),
        location: form.location || undefined,
        entityId: form.entityId || null,
        notes: form.notes || undefined,
      }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return setMessage({ tone: 'bad', text: b.message ?? 'The meeting was not added.' });
    setMessage({ tone: 'ok', text: `${form.title} added on ${dayTitle(form.date)} at ${form.time}.` });
    setForm({ ...form, title: '', location: '', notes: '', entityId: '' });
    setAdding(false);
    setAnchor(form.date);
    load();
  };
  const cancelMeeting = async (m: Meeting) => {
    setMessage(null);
    const r = await authFetch(`/api/v1/team/meetings/${m.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'If-Match': `"${m.version}"` }, body: JSON.stringify({ status: 'CANCELLED' }) });
    const b = await r.json().catch(() => ({}));
    setMessage(r.ok ? { tone: 'ok', text: `${m.title} is cancelled.` } : { tone: 'bad', text: b.message ?? 'The meeting was not cancelled.' });
    load();
  };

  const today = istToday();
  const thisMonth = anchor.slice(0, 7);
  const limit = view === 'month' ? 3 : 50;

  const renderItem = (it: Item) =>
    it.type === 'meeting' ? (
      <li key={it.key} className={`rounded-[6px] bg-pos-accent/10 px-1.5 py-0.5 text-pos-ink ${it.meeting.status === 'CANCELLED' ? 'line-through opacity-50' : ''}`} title={`${it.time} ${it.label}${it.sub ? `, ${it.sub}` : ''}`}>
        <span className="tabular-nums text-pos-ink/60">{it.time}</span> {it.label}
        {view === 'week' && it.sub && <span className="block text-pos-ink/55">{it.sub}</span>}
        {view === 'week' && it.meeting.canEdit && it.meeting.status === 'SCHEDULED' && (
          <button type="button" onClick={() => cancelMeeting(it.meeting)} className="mt-0.5 inline-flex items-center gap-0.5 text-[12px] text-[#dc2626] hover:underline"><X className="h-3 w-3" /> Cancel</button>
        )}
      </li>
    ) : (
      <li key={it.key} className={`truncate rounded-[6px] px-1.5 py-0.5 ${it.done ? 'text-pos-ink/60 line-through' : it.overdue ? 'bg-[#dc2626]/5 text-[#dc2626]' : it.tone === 'deposit' ? 'bg-[#d97706]/10 text-pos-ink' : 'bg-pos-tint text-pos-ink'}`} title={`${it.tone === 'deposit' ? 'Deposit' : 'Return'}: ${it.label}, ${it.sub}`}>
        {it.label}
        {view === 'week' && <span className="block truncate text-pos-ink/55">{it.sub}</span>}
      </li>
    );

  return (
    <div className="space-y-3">
      <div className="pos-card flex flex-wrap items-center gap-2 p-3">
        <button type="button" onClick={() => shift(-1)} aria-label={view === 'week' ? 'Previous week' : 'Previous month'} className="rounded-full border border-pos-line p-1.5 text-pos-ink hover:bg-pos-tint"><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" onClick={() => shift(1)} aria-label={view === 'week' ? 'Next week' : 'Next month'} className="rounded-full border border-pos-line p-1.5 text-pos-ink hover:bg-pos-tint"><ChevronRight className="h-4 w-4" /></button>
        <button type="button" onClick={() => setAnchor(today)} className="rounded-full border border-pos-line px-3 py-1 text-[12.5px] text-pos-ink hover:bg-pos-tint">Today</button>
        <h2 className="ml-1 text-[15px] font-semibold text-pos-ink">{view === 'month' ? monthTitle(anchor) : `${dayTitle(start)} to ${dayTitle(end)}`}</h2>
        <div className="ml-auto flex items-center gap-2">
          <div role="radiogroup" aria-label="Calendar view" className="flex rounded-full border border-pos-line p-0.5 text-[12.5px]">
            {(['month', 'week'] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 ${view === v ? 'bg-pos-accent text-white' : 'text-pos-ink/65'}`}>{v === 'month' ? 'Month' : 'Week'}</button>
            ))}
          </div>
          <button type="button" onClick={() => setAdding((a) => !a)} className="inline-flex items-center gap-1.5 rounded-full bg-pos-accent px-3.5 py-1.5 text-[12.5px] font-medium text-white"><Plus className="h-4 w-4" /> Add a meeting</button>
        </div>
      </div>

      {message && <p role="status" className={`rounded-[10px] px-3 py-2 text-[13px] ${message.tone === 'ok' ? 'bg-[#22a356]/10 text-[#15803d]' : 'bg-[#dc2626]/5 text-[#dc2626]'}`}>{message.text}</p>}

      {adding && (
        <form onSubmit={addMeeting} className="pos-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-[12px] text-pos-ink/60 sm:col-span-2">Title<input required minLength={2} maxLength={160} placeholder="e.g. Year-end review with client" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={input} /></label>
          <label className="text-[12px] text-pos-ink/60">Date<input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} /></label>
          <label className="text-[12px] text-pos-ink/60">Time (IST)<input type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={input} /></label>
          <label className="text-[12px] text-pos-ink/60">Length
            <select value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className={input}>
              {[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`}</option>)}
            </select>
          </label>
          <label className="text-[12px] text-pos-ink/60">Client (optional)
            <select value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })} className={input}>
              <option value="">Firm meeting</option>
              {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="text-[12px] text-pos-ink/60 sm:col-span-2">Where (optional)<input maxLength={200} placeholder="Office, phone or a video link" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={input} /></label>
          <label className="text-[12px] text-pos-ink/60 sm:col-span-2 lg:col-span-3">Notes (optional)<input maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={input} /></label>
          <div className="flex items-end gap-2">
            <button type="submit" className="rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white">Add</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-full border border-pos-line px-4 py-2 text-[13px] text-pos-ink">Close</button>
          </div>
        </form>
      )}

      <div className="pos-card overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-7 border-b border-pos-line text-[12px] text-pos-ink/55">
          {WEEKDAYS.map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}
        </div>
        <div className="grid min-w-[700px] grid-cols-7">
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            const faded = view === 'month' && d.slice(0, 7) !== thisMonth;
            return (
              <div key={d} className={`border-b border-r border-pos-line p-1.5 ${view === 'week' ? 'min-h-[320px]' : 'min-h-[104px]'} ${faded ? 'bg-pos-muted/60' : ''}`} aria-label={`${dayTitle(d)}: ${items.length} item${items.length === 1 ? '' : 's'}`}>
                <p className={`mb-1 text-[12px] tabular-nums ${d === today ? 'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-pos-accent px-1 font-medium text-white' : faded ? 'text-pos-ink/60' : 'text-pos-ink/65'}`}>{view === 'week' ? dayTitle(d) : Number(d.slice(8))}</p>
                <ul className="space-y-0.5 text-[12.5px] leading-snug">
                  {items.slice(0, limit).map(renderItem)}
                  {items.length > limit && (
                    <li>
                      <button type="button" onClick={() => { setAnchor(d); setView('week'); }} className="px-1.5 text-[12.5px] text-pos-accent hover:underline">{items.length - limit} more</button>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-pos-ink/55">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-pos-tint align-middle ring-1 ring-pos-line" />Return or statement due</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#d97706]/20 align-middle" />Tax deposit due</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-pos-accent/20 align-middle" />Meeting</span>
        <span className="text-[#dc2626]">Overdue in red</span>
      </p>
    </div>
  );
}
