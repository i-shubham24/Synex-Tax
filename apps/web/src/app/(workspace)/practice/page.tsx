'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, IndianRupee, Plus, RefreshCw } from 'lucide-react';
import { PRACTICE_SERVICES, type ClientLedger } from '@synextax/tax-engine';
import { useAuth } from '../../../context/AuthContext';

type Tab = 'tasks' | 'fees';
interface Task { id: string; entity_id: string; client: string; kind: string; reference: string | null; title: string; period_label: string; due_date: string; status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'NOT_APPLICABLE'; assignee: string | null; overdue: boolean }
interface FeeClient { entityId: string; name: string; outstanding: string; ageing: { upTo30: string; days31to90: string; over90: string }; oldestUnpaidDays: number; entries: number }
interface Invoice { id: string; invoice_no: string; invoice_date: string; kind: string; total: string; status: string }

const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const input = 'h-9 rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
const th = 'px-4 py-2 text-left text-[12px] font-medium whitespace-nowrap';
const td = 'px-4 py-2 text-[13px] text-pos-ink';
const num = `${td} text-right tabular-nums`;
const STATUS_LABEL: Record<Task['status'], string> = { OPEN: 'Open', IN_PROGRESS: 'In progress', DONE: 'Done', NOT_APPLICABLE: 'Not needed' };

export default function PracticePage() {
  const { authFetch, user } = useAuth();
  const lead = ['PARTNER', 'MANAGER'].includes(user?.role ?? '');
  const [tab, setTab] = useState<Tab>('tasks');
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  // Tasks
  const [from, setFrom] = useState(plusDays(today(), -30));
  const [to, setTo] = useState(plusDays(today(), 45));
  const [onlyPending, setOnlyPending] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const loadTasks = useCallback(async () => {
    const r = await authFetch(`/api/v1/practice/tasks?from=${from}&to=${to}${onlyPending ? '&status=PENDING' : ''}`);
    if (r.ok) setTasks((await r.json()).tasks);
  }, [authFetch, from, to, onlyPending]);
  useEffect(() => { if (tab === 'tasks') loadTasks(); }, [tab, loadTasks]);

  const generate = async () => {
    const r = await authFetch('/api/v1/practice/tasks/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from, to }) });
    const b = await r.json().catch(() => ({}));
    setMessage(r.ok ? { tone: 'ok', text: b.added ? `${b.added} task(s) added from the due-date calendar.` : 'Every task in this window is already on the list.' } : { tone: 'bad', text: b.message ?? 'Could not generate tasks.' });
    loadTasks();
  };
  const setStatus = async (id: string, status: Task['status']) => {
    const r = await authFetch(`/api/v1/practice/tasks/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
    if (r.ok) loadTasks();
  };

  // Fees
  const [clients, setClients] = useState<FeeClient[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [ledger, setLedger] = useState<{ ledger: ClientLedger; invoices: Invoice[] } | null>(null);
  const [inv, setInv] = useState({ date: today(), sac: PRACTICE_SERVICES[2].sac, description: '', amount: '' });
  const [rec, setRec] = useState({ date: today(), amount: '', mode: 'UPI', reference: '' });
  const loadClients = useCallback(async () => {
    const r = await authFetch('/api/v1/practice/fees/clients');
    if (r.ok) setClients((await r.json()).clients);
    else if (r.status === 403) setMessage({ tone: 'bad', text: 'Fees are visible to partners and to team members a partner has given access to.' });
  }, [authFetch]);
  const loadLedger = useCallback(async (id: string) => {
    if (!id) return setLedger(null);
    const r = await authFetch(`/api/v1/practice/fees/ledger?entityId=${id}`);
    if (r.ok) setLedger(await r.json());
  }, [authFetch]);
  useEffect(() => { if (tab === 'fees') loadClients(); }, [tab, loadClients]);
  useEffect(() => { loadLedger(selected); }, [selected, loadLedger]);

  const post = async (path: string, body: unknown, ok: string) => {
    setMessage(null);
    const r = await authFetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return setMessage({ tone: 'bad', text: b.message ?? 'Not saved.' });
    setMessage({ tone: 'ok', text: typeof ok === 'string' && b.invoiceNo ? `${ok} ${b.invoiceNo} for ${inr(b.total)}.` : ok });
    loadClients();
    loadLedger(selected);
  };
  const totalDue = clients.reduce((s, c) => s + Math.max(0, Number(c.outstanding)), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-pos-ink">Practice</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-pos-ink/60">Every return and deposit due for your clients, who is on it, and what each client owes the firm.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {([['tasks', 'Tasks and due dates', CalendarCheck], ['fees', 'Fees and receipts', IndianRupee]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setMessage(null); }}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] ${tab === id ? 'bg-pos-accent text-white' : 'border border-pos-line text-pos-ink/70 hover:bg-pos-tint'}`}><Icon className="h-4 w-4" /> {label}</button>
        ))}
      </div>
      {message && <p role="status" className={`rounded-[10px] px-3 py-2 text-[13px] ${message.tone === 'ok' ? 'bg-[#22a356]/10 text-[#15803d]' : 'bg-[#dc2626]/5 text-[#dc2626]'}`}>{message.text}</p>}

      {tab === 'tasks' && (
        <>
          <div className="pos-card flex flex-wrap items-end gap-3 p-4 text-[13px] text-pos-ink/60">
            <label className="flex flex-col gap-1">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} /></label>
            <label className="flex flex-col gap-1">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} /></label>
            <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Only open tasks</label>
            {lead && <button type="button" onClick={generate} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white"><RefreshCw className="h-4 w-4" /> Add tasks from due dates</button>}
          </div>
          <section className="pos-card overflow-x-auto">
            {tasks.length ? (
              <table className="w-full">
                <thead className="text-pos-ink/55"><tr><th className={th}>Due</th><th className={th}>Client</th><th className={th}>Task</th><th className={th}>GSTIN or TAN</th><th className={th}>Assigned</th><th className={th}>Status</th></tr></thead>
                <tbody>{tasks.map((t) => (
                  <tr key={t.id} className="border-t border-pos-line">
                    <td className={`${td} whitespace-nowrap ${t.overdue ? 'font-medium text-[#dc2626]' : ''}`}>{nice(t.due_date)}{t.overdue ? ' (overdue)' : ''}</td>
                    <td className={td}>{t.client}</td><td className={td}>{t.title}</td><td className={`${td} font-mono text-[12px]`}>{t.reference ?? ''}</td><td className={td}>{t.assignee ?? ''}</td>
                    <td className={td}>
                      <select aria-label={`Status of ${t.title} for ${t.client}`} value={t.status} onChange={(e) => setStatus(t.id, e.target.value as Task['status'])} className={`${input} h-8`}>
                        {(Object.keys(STATUS_LABEL) as Task['status'][]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="px-4 py-4 text-[13px] text-pos-ink/55">No tasks in this window.{lead ? ' Add them from the due-date calendar.' : ''}</p>}
          </section>
        </>
      )}

      {tab === 'fees' && (
        <>
          <section className="pos-card overflow-x-auto">
            <div className="flex items-center justify-between border-b border-pos-line px-4 py-3"><h2 className="text-[14px] font-semibold text-pos-ink">Clients</h2><span className="text-[13px] text-pos-ink/60">Owed to the firm: <span className="font-semibold text-pos-ink">{inr(totalDue)}</span></span></div>
            <table className="w-full">
              <thead className="text-pos-ink/55"><tr><th className={th}>Client</th><th className={`${th} text-right`}>Outstanding</th><th className={`${th} text-right`}>Up to 30 days</th><th className={`${th} text-right`}>31 to 90</th><th className={`${th} text-right`}>Over 90</th><th className={th} /></tr></thead>
              <tbody>{clients.map((c) => (
                <tr key={c.entityId} className={`border-t border-pos-line ${selected === c.entityId ? 'bg-pos-tint' : ''}`}>
                  <td className={td}>{c.name}</td><td className={num}>{inr(c.outstanding)}</td><td className={num}>{inr(c.ageing.upTo30)}</td><td className={num}>{inr(c.ageing.days31to90)}</td><td className={`${num} ${Number(c.ageing.over90) > 0 ? 'text-[#dc2626]' : ''}`}>{inr(c.ageing.over90)}</td>
                  <td className={td}><button type="button" onClick={() => setSelected(c.entityId)} className="text-[12px] text-pos-accent">Open ledger</button></td>
                </tr>
              ))}</tbody>
            </table>
          </section>

          {selected && ledger && (
            <div className="grid gap-4 lg:grid-cols-2">
              {lead && (
                <form className="pos-card space-y-2 p-4" onSubmit={(e) => { e.preventDefault(); post('/api/v1/practice/fees/invoices', { entityId: selected, date: inv.date, lines: [{ sac: inv.sac, description: inv.description, amount: Number(inv.amount) }] }, 'Issued invoice'); setInv({ ...inv, description: '', amount: '' }); }}>
                  <h3 className="text-[14px] font-semibold text-pos-ink">Issue a fee invoice</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-[12px] text-pos-ink/60">Date<input type="date" required value={inv.date} onChange={(e) => setInv({ ...inv, date: e.target.value })} className={`${input} w-full`} /></label>
                    <label className="text-[12px] text-pos-ink/60">Service (SAC)<select value={inv.sac} onChange={(e) => setInv({ ...inv, sac: e.target.value })} className={`${input} w-full`}>{PRACTICE_SERVICES.map((s) => <option key={s.sac} value={s.sac}>{s.sac} {s.label}</option>)}</select></label>
                    <label className="text-[12px] text-pos-ink/60 sm:col-span-2">Description<input required maxLength={120} placeholder="e.g. GST returns, October to December" value={inv.description} onChange={(e) => setInv({ ...inv, description: e.target.value })} className={`${input} w-full`} /></label>
                    <label className="text-[12px] text-pos-ink/60">Fee before GST (₹)<input required inputMode="decimal" value={inv.amount} onChange={(e) => setInv({ ...inv, amount: e.target.value })} className={`${input} w-full`} /></label>
                  </div>
                  <p className="text-[12px] text-pos-ink/55">GST at 18% is added when the firm has a GSTIN: CGST and SGST for a client in the same state, IGST otherwise. Numbers run in one series per financial year.</p>
                  <button type="submit" className="inline-flex items-center gap-1.5 rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white"><Plus className="h-4 w-4" /> Issue invoice</button>
                </form>
              )}
              <form className="pos-card space-y-2 p-4" onSubmit={(e) => { e.preventDefault(); post('/api/v1/practice/fees/receipts', { entityId: selected, date: rec.date, amount: Number(rec.amount), mode: rec.mode, reference: rec.reference }, 'Receipt recorded.'); setRec({ ...rec, amount: '', reference: '' }); }}>
                <h3 className="text-[14px] font-semibold text-pos-ink">Record a payment received</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-[12px] text-pos-ink/60">Date<input type="date" required value={rec.date} onChange={(e) => setRec({ ...rec, date: e.target.value })} className={`${input} w-full`} /></label>
                  <label className="text-[12px] text-pos-ink/60">Amount (₹)<input required inputMode="decimal" value={rec.amount} onChange={(e) => setRec({ ...rec, amount: e.target.value })} className={`${input} w-full`} /></label>
                  <label className="text-[12px] text-pos-ink/60">Mode<select value={rec.mode} onChange={(e) => setRec({ ...rec, mode: e.target.value })} className={`${input} w-full`}>{['UPI', 'BANK', 'CHEQUE', 'CASH', 'OTHER'].map((m) => <option key={m} value={m}>{m === 'BANK' ? 'Bank transfer' : m.charAt(0) + m.slice(1).toLowerCase()}</option>)}</select></label>
                  <label className="text-[12px] text-pos-ink/60">UTR or cheque no.<input maxLength={40} value={rec.reference} onChange={(e) => setRec({ ...rec, reference: e.target.value })} className={`${input} w-full`} /></label>
                </div>
                <button type="submit" className="rounded-full border border-pos-line px-4 py-2 text-[13px] text-pos-ink">Record payment</button>
              </form>
              <section className="pos-card overflow-x-auto lg:col-span-2">
                <h3 className="border-b border-pos-line px-4 py-3 text-[14px] font-semibold text-pos-ink">Ledger <span className="font-normal text-pos-ink/55">balance {inr(ledger.ledger.outstanding)}</span></h3>
                {ledger.ledger.entries.length ? (
                  <table className="w-full"><thead className="text-pos-ink/55"><tr><th className={th}>Date</th><th className={th}>Entry</th><th className={`${th} text-right`}>Billed</th><th className={`${th} text-right`}>Received</th><th className={`${th} text-right`}>Balance</th></tr></thead>
                    <tbody>{ledger.ledger.entries.map((e, i) => (
                      <tr key={i} className="border-t border-pos-line"><td className={td}>{nice(e.date)}</td><td className={td}>{e.kind === 'INVOICE' ? `Invoice ${e.reference}` : `Payment, ${e.reference}`}</td><td className={num}>{e.debit !== '0.00' ? inr(e.debit) : ''}</td><td className={num}>{e.credit !== '0.00' ? inr(e.credit) : ''}</td><td className={num}>{inr(e.balance)}</td></tr>
                    ))}</tbody></table>
                ) : <p className="px-4 py-4 text-[13px] text-pos-ink/55">No invoices or payments yet.</p>}
                {ledger.invoices.some((i) => i.status === 'CANCELLED') && <p className="border-t border-pos-line px-4 py-2 text-[12px] text-pos-ink/55">Cancelled: {ledger.invoices.filter((i) => i.status === 'CANCELLED').map((i) => i.invoice_no).join(', ')}</p>}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
