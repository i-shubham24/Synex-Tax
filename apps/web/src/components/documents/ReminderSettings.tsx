'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BellOff, BellRing, PhoneCall } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

type Channel = 'EMAIL' | 'WHATSAPP';
interface Settings { clientDays: number[]; firmNoteDay: number | null; channels: Channel[]; paused: boolean }
interface Step { kind: 'CLIENT' | 'FIRM'; stepDay: number; outcome: string; runOn: string; channels: string[]; detail: string | null }
interface Row { id: string; clientName: string; periodLabel: string; dueDate: string; outstanding: number; sentOn: string | null; paused: boolean; version: string | null; next: { kind: 'CLIENT' | 'FIRM'; day: number; on: string } | null; steps: Step[] }

const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const OUTCOME: Record<string, string> = { SENT: 'sent', PENDING: 'sending', NO_CONTACT: 'no contact on file', NOT_SET_UP: 'not sent, sending not set up', FAILED: 'failed, will retry', NOTED: 'call the client' };

/** Settings for reminders that send themselves, and where each open checklist stands. */
export function ReminderSettings() {
  const { authFetch } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [daysText, setDaysText] = useState('');
  const [version, setVersion] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [sending, setSending] = useState({ email: false, whatsapp: false });
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([authFetch('/api/v1/practice/automation'), authFetch('/api/v1/practice/automation/checklists')]);
    if (s.ok) {
      const b = await s.json();
      setSettings(b.settings);
      setDaysText(b.settings.clientDays.join(', '));
      setVersion(b.version);
      setCanEdit(b.canEdit);
      setSending(b.sending);
    }
    if (c.ok) setRows((await c.json()).checklists);
  }, [authFetch]);
  useEffect(() => { load().catch(() => {}); }, [load]);

  async function save(next: Settings) {
    setMessage(null);
    const r = await authFetch('/api/v1/practice/automation', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(version ? { 'If-Match': `"${version}"` } : {}) }, body: JSON.stringify(next) });
    if (!r.ok) setMessage((await r.json().catch(() => ({}))).message ?? 'The settings were not saved.');
    else setMessage('Saved.');
    await load();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    const days = daysText.split(/[\s,]+/).filter(Boolean).map(Number);
    if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 60) || days.length > 4) return setMessage('Reminder days are whole numbers from 1 to 60, up to four of them.');
    save({ ...settings, clientDays: [...new Set(days)].sort((a, b) => a - b) });
  }

  async function pauseOne(row: Row) {
    const r = await authFetch(`/api/v1/practice/automation/checklists/${row.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(row.version ? { 'If-Match': `"${row.version}"` } : {}) }, body: JSON.stringify({ paused: !row.paused }) });
    if (!r.ok) setMessage((await r.json().catch(() => ({}))).message ?? 'Not changed.');
    await load();
  }

  async function startToday(row: Row) {
    const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    const r = await authFetch(`/api/v1/practice/automation/checklists/${row.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sentOn: today }) });
    if (!r.ok) setMessage((await r.json().catch(() => ({}))).message ?? 'Not changed.');
    await load();
  }

  const toggleChannel = (ch: Channel) => settings && setSettings({ ...settings, channels: settings.channels.includes(ch) ? settings.channels.filter((c) => c !== ch) : [...settings.channels, ch] });
  const notes = rows.filter((r) => r.steps.some((s) => s.kind === 'FIRM'));

  if (!settings) return null;
  return (
    <section className="pos-card space-y-4 p-4" aria-labelledby="auto-reminders">
      <div>
        <h2 id="auto-reminders" className="text-[16px] font-semibold text-pos-ink">Automatic reminders</h2>
        <p className="max-w-2xl text-[12.5px] text-pos-ink/55">
          Counted from the day a checklist first goes to the client (your first reminder or upload link). Reminders stop once nothing is outstanding.
        </p>
      </div>

      {!sending.email && !sending.whatsapp && (
        <p className="rounded-[10px] bg-[#f2b53a]/15 px-3 py-2 text-[12.5px] text-[#8a5a00]">Email and WhatsApp sending are not set up for this workspace, so automatic reminders are logged but not sent. Notes to the firm still appear below.</p>
      )}

      <form onSubmit={submit} className="flex flex-wrap items-end gap-4" aria-label="Reminder settings">
        <label className="flex flex-col gap-1 text-[12px] text-pos-ink/55">Remind the client on days
          <input disabled={!canEdit} value={daysText} onChange={(e) => setDaysText(e.target.value)} placeholder="1, 5" className="h-10 w-32 rounded-full border border-pos-line bg-pos-surface px-3 font-mono text-[13px] text-pos-ink" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-pos-ink/55">Note to the firm on day
          <input disabled={!canEdit} type="number" min={1} max={90} value={settings.firmNoteDay ?? ''} onChange={(e) => setSettings({ ...settings, firmNoteDay: e.target.value ? Number(e.target.value) : null })} placeholder="Off" className="h-10 w-24 rounded-full border border-pos-line bg-pos-surface px-3 font-mono text-[13px] text-pos-ink" />
        </label>
        <fieldset className="flex items-center gap-3 text-[13px] text-pos-ink" disabled={!canEdit}>
          <legend className="sr-only">Channels</legend>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={settings.channels.includes('EMAIL')} onChange={() => toggleChannel('EMAIL')} /> Email{!sending.email && <span className="text-pos-ink/60">(not set up)</span>}</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={settings.channels.includes('WHATSAPP')} onChange={() => toggleChannel('WHATSAPP')} /> WhatsApp{!sending.whatsapp && <span className="text-pos-ink/60">(not set up)</span>}</label>
        </fieldset>
        {canEdit && <button type="submit" className="h-10 rounded-full bg-pos-accent px-4 text-[13px] font-medium text-white">Save</button>}
        {canEdit && (
          <button type="button" onClick={() => save({ ...settings, paused: !settings.paused })} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-pos-line px-4 text-[13px] text-pos-ink">
            {settings.paused ? <><BellRing className="h-4 w-4" /> Resume for the firm</> : <><BellOff className="h-4 w-4" /> Pause for the firm</>}
          </button>
        )}
        {!canEdit && <p className="text-[12px] text-pos-ink/60">A partner or manager changes these settings.</p>}
      </form>
      {settings.paused && <p className="text-[13px] font-medium text-[#b45309]">Paused for the whole firm. Nothing is sent until a partner or manager resumes.</p>}
      {message && <p role="status" className="text-[12.5px] text-pos-ink/70">{message}</p>}

      {notes.length > 0 && (
        <div className="rounded-[14px] border border-pos-line p-3">
          <h3 className="flex items-center gap-1.5 text-[13.5px] font-medium text-pos-ink"><PhoneCall className="h-4 w-4" /> Clients to call</h3>
          <ul className="mt-2 space-y-1 text-[12.5px] text-pos-ink">
            {notes.map((r) => <li key={r.id}>{r.clientName}, {r.periodLabel}: <span className="font-mono">{r.outstanding}</span> still outstanding</li>)}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead className="text-pos-ink/55">
            <tr><th className="py-1.5 pr-3 font-medium">Client and period</th><th className="pr-3 font-medium">Sent</th><th className="pr-3 font-medium">So far</th><th className="pr-3 font-medium">Next</th><th className="font-medium" /></tr>
          </thead>
          <tbody className="divide-y divide-pos-line">
            {rows.map((r) => (
              <tr key={r.id} className="align-top text-pos-ink">
                <td className="py-2 pr-3">{r.clientName}, {r.periodLabel}<div className="text-pos-ink/60"><span className="font-mono">{r.outstanding}</span> outstanding, due {nice(r.dueDate)}</div></td>
                <td className="pr-3">{r.sentOn ? nice(r.sentOn) : <button type="button" onClick={() => startToday(r)} className="text-pos-accent">Not sent yet. Start today</button>}</td>
                <td className="pr-3">
                  {r.steps.length ? r.steps.map((s) => <div key={`${s.kind}${s.stepDay}`}>Day <span className="font-mono">{s.stepDay}</span> {s.kind === 'FIRM' ? 'note' : 'reminder'}, {OUTCOME[s.outcome] ?? s.outcome}</div>) : <span className="text-pos-ink/60">Nothing yet</span>}
                </td>
                <td className="pr-3">{r.paused ? 'Paused' : r.next ? `${r.next.kind === 'FIRM' ? 'Note to the firm' : 'Reminder'} on ${nice(r.next.on)}` : <span className="text-pos-ink/60">None</span>}</td>
                <td className="text-right"><button type="button" onClick={() => pauseOne(r)} className="text-pos-ink/60 hover:text-pos-ink">{r.paused ? 'Resume' : 'Pause'}</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="py-3 text-pos-ink/55">No open checklists with documents outstanding.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
