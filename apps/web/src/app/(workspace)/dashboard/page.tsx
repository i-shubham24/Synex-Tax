'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { StepMark } from '../../components/landing/primitives';
import {
  BadgeIndianRupee,
  ChevronsUpDown,
  CircleAlert,
  ClipboardCheck,
  Filter,
  Inbox,
  Play,
  Search,
  X,
} from 'lucide-react';

type Period = 'month' | 'quarter' | 'year';
type Status = 'Waiting' | 'Filed' | 'Blocked';

const SPLIT = [
  { k: 'IGST', v: 501600, c: '#52B0F8' },
  { k: 'CGST', v: 313500, c: '#5FE88A' },
  { k: 'SGST', v: 313500, c: '#5A50F2' },
  { k: 'RCM cash', v: 62700, c: '#F2B53A' },
  { k: 'TDS', v: 41800, c: '#2F8AE0' },
  { k: 'TCS', v: 20900, c: '#A8F2C0' },
];

const KPIS: Record<Period, Array<{ label: string; value: string; tone: string; icon: React.ComponentType<{ className?: string }> }>> = {
  month: [
    { label: 'Returns due', value: '14', tone: '#2F8AE0', icon: CircleAlert },
    { label: 'Filed this month', value: '182', tone: '#14A44D', icon: ClipboardCheck },
    { label: 'ITC reconciled', value: '₹1.48 Cr', tone: '#5A50F2', icon: BadgeIndianRupee },
    { label: 'IMS pending', value: '37', tone: '#D99A17', icon: Inbox },
  ],
  quarter: [
    { label: 'Returns due', value: '41', tone: '#2F8AE0', icon: CircleAlert },
    { label: 'Filed this quarter', value: '536', tone: '#14A44D', icon: ClipboardCheck },
    { label: 'ITC reconciled', value: '₹4.31 Cr', tone: '#5A50F2', icon: BadgeIndianRupee },
    { label: 'IMS pending', value: '62', tone: '#D99A17', icon: Inbox },
  ],
  year: [
    { label: 'Returns due', value: '96', tone: '#2F8AE0', icon: CircleAlert },
    { label: 'Filed this year', value: '1,412', tone: '#14A44D', icon: ClipboardCheck },
    { label: 'ITC reconciled', value: '₹11.9 Cr', tone: '#5A50F2', icon: BadgeIndianRupee },
    { label: 'IMS pending', value: '62', tone: '#D99A17', icon: Inbox },
  ],
};

const MONTHLY = [38, 46, 64, 52, 72, 61, 30, 47, 44, 66, 79, 88];
const MONTHS = ['APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR'];

const DUE = [
  { m: 'AS', name: 'Amritsar Silk Mills', form: 'GSTR-3B', when: '20 Nov', amt: '1,48,920' },
  { m: 'GC', name: 'Golden City Healthcare', form: 'Form 140 Q2', when: '30 Nov', amt: '75,000' },
  { m: 'MR', name: 'Majha Rice Sheller', form: 'GSTR-1', when: '11 Dec', amt: '27,000' },
  { m: 'GT', name: 'Golden Temple Roadways', form: 'IMS review', when: '14 Dec', amt: '11,400' },
  { m: 'HB', name: 'Hall Bazar Fabrics', form: 'Form 143 Q2', when: '30 Nov', amt: '8,250' },
];

type Row = {
  id: string;
  client: string;
  gstin: string;
  ret: string;
  docs: number;
  liability: number;
  status: Status;
  lines: Array<[string, number]>;
};

const QUEUE: Row[] = [
  { id: 'R26-010', client: 'Amritsar Silk Mills', gstin: '03AAACA1294F1Z3', ret: 'GSTR-3B Oct', docs: 412, liability: 148920, status: 'Waiting', lines: [['IGST', 62110], ['CGST', 43405], ['SGST', 43405]] },
  { id: 'R26-009', client: 'Ranjit Avenue Traders', gstin: '03AAKFR4410M1ZQ', ret: 'GSTR-1 Oct', docs: 96, liability: 21000, status: 'Filed', lines: [['CGST', 10500], ['SGST', 10500]] },
  { id: 'R26-008', client: 'Majha Rice Sheller', gstin: '03ABZPM2231K1Z8', ret: 'GSTR-3B Oct', docs: 210, liability: 36000, status: 'Filed', lines: [['IGST', 12000], ['CGST', 12000], ['SGST', 12000]] },
  { id: 'R26-007', client: 'Golden Temple Roadways', gstin: '03CCCPM8891B1Z2', ret: 'GSTR-3B Oct', docs: 58, liability: 8000, status: 'Waiting', lines: [['RCM cash', 8000]] },
  { id: 'R26-006', client: 'Lawrence Road Pharma', gstin: '03AADCL7782H1ZK', ret: 'GSTR-1A Oct', docs: 12, liability: 12000, status: 'Waiting', lines: [['IGST', 12000]] },
  { id: 'R26-005', client: 'Batala Castings', gstin: '03AAECB5512P1Z1', ret: 'GSTR-3B Oct', docs: 133, liability: 8000, status: 'Blocked', lines: [['IGST', 8000]] },
  { id: 'R26-004', client: 'Hall Bazar Fabrics', gstin: '03AJWPS0098F1ZV', ret: 'IFF Oct', docs: 41, liability: 9000, status: 'Waiting', lines: [['CGST', 4500], ['SGST', 4500]] },
  { id: 'R26-003', client: 'Tarn Taran Agro', gstin: '03AAHFT3321L1Z5', ret: 'CMP-08 Q2', docs: 7, liability: 24000, status: 'Filed', lines: [['CGST', 12000], ['SGST', 12000]] },
];

const fmt = (n: number) => n.toLocaleString('en-IN');

const STATUS_STYLE: Record<Status, string> = {
  Waiting: 'bg-pos-accent/15 text-pos-accent',
  Filed: 'bg-pos-green/15 text-pos-green',
  Blocked: 'bg-pos-red/15 text-pos-red',
};

function Donut() {
  const total = SPLIT.reduce((s, x) => s + x.v, 0);
  const r = 38;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
      {SPLIT.map((s, i) => {
        const len = (s.v / total) * C;
        const el = (
          <motion.circle
            key={s.k}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={s.c}
            strokeWidth="17"
            strokeDasharray={`${Math.max(0, len - 0.8)} ${C}`}
            strokeDashoffset={-offset}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.06 }}
          />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}

function OffsetModal({ row, onClose, onApprove }: { row: Row; onClose: () => void; onApprove: () => void }) {
  const [cash, setCash] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const itc = Math.round(row.liability * 0.71);
  const cashNeed = row.liability - itc;
  const diff = cashNeed - (Number(cash.replace(/,/g, '')) || 0);
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="offset-title"
        initial={{ y: 24, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 24, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] rounded-[16px] bg-pos-surface p-7 text-pos-ink shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-pos-line pb-3">
          <h2 id="offset-title" className="text-[17px] font-semibold">
            Offset liability
          </h2>
          <p className="text-[15px] font-semibold tabular-nums">
            {row.ret}: &#8377;{fmt(row.liability)}
          </p>
        </div>
        <dl className="mt-4 space-y-1.5 text-[13px]">
          <div className="flex justify-between text-[15px] font-medium">
            <dt>Through ITC</dt>
            <dd className="tabular-nums">&#8377;{fmt(itc)}</dd>
          </div>
          {row.lines.map(([k, v]) => (
            <div key={k} className="flex justify-between text-pos-ink/75">
              <dt>{k}</dt>
              <dd className="tabular-nums">&#8377;{fmt(v)}</dd>
            </div>
          ))}
          <div className="flex justify-between pt-2 text-[15px] font-medium">
            <dt>Cash ledger needed</dt>
            <dd className="tabular-nums">&#8377;{fmt(cashNeed)}</dd>
          </div>
          <div className={`flex justify-between ${diff > 0 ? 'text-pos-red' : 'text-pos-green'}`}>
            <dt>Difference after challan</dt>
            <dd className="tabular-nums">&#8377;{fmt(Math.max(0, diff))}</dd>
          </div>
        </dl>
        <label htmlFor="cash-paid" className="mt-5 block text-[13px]">
          Cash already in ledger
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            id="cash-paid"
            inputMode="numeric"
            value={cash}
            onChange={(e) => setCash(e.target.value.replace(/[^0-9,]/g, ''))}
            placeholder="0"
            className="h-11 flex-1 rounded-[8px] border border-pos-line px-3 text-[15px] tabular-nums outline-none focus:border-pos-accent"
          />
          <button
            type="button"
            onClick={() => setCash(fmt(cashNeed))}
            className="h-11 rounded-[8px] bg-pos-tint px-3 text-[12px] font-medium text-pos-accent"
          >
            Fill required
          </button>
        </div>
        <label htmlFor="note" className="mt-4 block text-[13px]">
          Partner note
        </label>
        <textarea
          id="note"
          rows={2}
          placeholder="Add a note for the audit trail"
          className="mt-1.5 w-full resize-none rounded-[8px] border border-pos-line p-3 text-[13px] outline-none focus:border-pos-accent"
        />
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-full bg-pos-head px-5 text-[13px] font-medium text-white">
            Discard
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={diff > 0}
            className="h-10 rounded-full bg-[#5FE88A] px-5 text-[13px] font-semibold text-[#141416] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Approve and sign
          </button>
          <span className="flex-1" />
          <button type="button" className="h-10 rounded-full bg-pos-accent px-4 text-[13px] font-medium text-white dark:text-[#141416]">
            Send to client
          </button>
          <button type="button" className="h-10 rounded-full bg-[#5A50F2] px-4 text-[13px] font-medium text-white">
            Liability report
          </button>
        </div>
        {diff > 0 && <p className="mt-3 text-[12px] text-pos-red">Pay the difference by challan before the partner can sign.</p>}
      </motion.div>
    </motion.div>
  );
}

export default function ControlTowerPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [tab, setTab] = useState<'All' | Status>('All');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(QUEUE);
  const [selected, setSelected] = useState<Row | null>(QUEUE[0]);
  const [modal, setModal] = useState(false);
  const [sortDesc, setSortDesc] = useState(true);

  const visible = useMemo(() => {
    const list = rows.filter(
      (r) => (tab === 'All' || r.status === tab) && (r.client + r.gstin + r.ret).toLowerCase().includes(q.toLowerCase()),
    );
    return list.sort((a, b) => (sortDesc ? b.liability - a.liability : a.liability - b.liability));
  }, [rows, tab, q, sortDesc]);

  const counts = useMemo(
    () => ({
      All: rows.length,
      Waiting: rows.filter((r) => r.status === 'Waiting').length,
      Filed: rows.filter((r) => r.status === 'Filed').length,
      Blocked: rows.filter((r) => r.status === 'Blocked').length,
    }),
    [rows],
  );

  const total = SPLIT.reduce((s, x) => s + x.v, 0);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      {/* Title + period segments */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="flex items-center gap-2.5 text-[24px] font-semibold tracking-[-0.01em] text-pos-ink"><StepMark tone="sky" />Dashboard</h2>
        <div className="flex gap-2" role="tablist" aria-label="Period">
          {(
            [
              ['month', 'This Month'],
              ['quarter', 'This Quarter'],
              ['year', 'FY 2026-27'],
            ] as Array<[Period, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={period === id}
              onClick={() => setPeriod(id)}
              className={`h-9 min-w-[118px] rounded-full px-4 text-[13px] font-medium transition-colors ${
                period === id ? 'bg-pos-ink text-pos-surface shadow-[0_8px_18px_-10px_rgba(20,20,22,0.7)]' : 'bg-pos-surface text-pos-ink/65 ring-1 ring-inset ring-pos-line hover:text-pos-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_370px]">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
          {/* Donut */}
          <section className="pos-card p-6" aria-labelledby="split-title">
            <h3 id="split-title" className="text-[17px] font-medium">
              Tax liability split
            </h3>
            <div className="mt-4 flex items-center gap-6">
              <div className="relative h-[170px] w-[170px] shrink-0">
                <Donut />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[15px] font-medium">Net tax</span>
                  <span className="text-[19px] font-semibold tabular-nums">&#8377;{fmt(total)}</span>
                </div>
              </div>
              <ul className="space-y-2.5 text-[14px]">
                {SPLIT.map((s) => (
                  <li key={s.k} className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ background: s.c }} />
                    <span>{s.k}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* KPI 2x2 */}
          <div className="grid grid-cols-2 gap-4">
            {KPIS[period].map((k) => {
              const Icon = k.icon;
              return (
                <motion.section
                  key={k.label + period}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="pos-card flex flex-col p-5"
                >
                  <div className="flex items-start justify-between">
                    <h3 className="text-[14.5px] font-medium">{k.label}</h3>
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-[8px]"
                      style={{ background: `${k.tone}1a`, color: k.tone }}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                  </div>
                  <p className="mt-auto pt-5 text-center text-[28px] font-semibold tabular-nums" style={{ color: k.tone }}>
                    {k.value}
                  </p>
                </motion.section>
              );
            })}
          </div>

          {/* Area chart */}
          <section className="pos-card p-6 lg:col-span-2" aria-labelledby="velocity-title">
            <h3 id="velocity-title" className="text-[17px] font-medium">
              Filing velocity
            </h3>
            <div className="relative mt-4 h-[210px]">
              <div className="absolute inset-y-0 left-0 flex w-10 flex-col justify-between pb-6 text-[13px] font-medium">
                {['200', '150', '100', '50'].map((v) => (
                  <span key={v}>{v}</span>
                ))}
              </div>
              <div className="absolute inset-y-0 left-12 right-0 pb-6">
                <svg viewBox="0 0 600 160" preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden>
                  <defs>
                    <linearGradient id="pos-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#2F8AE0" stopOpacity="0.32" />
                      <stop offset="1" stopColor="#2F8AE0" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  {[20, 60, 100, 140].map((y) => (
                    <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="currentColor" strokeOpacity="0.08" />
                  ))}
                  <motion.path
                    d="M0 60 C 40 70, 70 100, 120 85 S 180 50, 240 110 S 300 100, 330 104 S 370 20, 400 26 S 460 110, 500 92 S 560 40, 600 70 L 600 160 L 0 160 Z"
                    fill="url(#pos-area)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                  />
                  <motion.path
                    d="M0 60 C 40 70, 70 100, 120 85 S 180 50, 240 110 S 300 100, 330 104 S 370 20, 400 26 S 460 110, 500 92 S 560 40, 600 70"
                    fill="none"
                    stroke="#2F8AE0"
                    strokeWidth="2.5"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <circle cx="400" cy="26" r="5" fill="#2F8AE0" stroke="#5FE88A" strokeWidth="2.5" />
                </svg>
                <span className="absolute left-[66.6%] top-[-6px] -translate-x-1/2 rounded-full bg-pos-accent px-2 py-0.5 text-[12px] font-medium text-white dark:text-[#141416]">
                  182
                </span>
              </div>
              <div className="absolute bottom-0 left-12 right-0 flex justify-between text-[12.5px] font-medium">
                {['1st', '5th', '7th', '10th', '11th', '13th', '14th', '18th', '20th', '25th', '31st'].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <section className="pos-card p-6" aria-labelledby="filed-title">
            <h3 id="filed-title" className="border-b border-pos-accent/60 pb-3 text-[17px] font-medium">
              Returns filed
            </h3>
            <div className="mt-4 flex h-[150px] items-end gap-2">
              {MONTHLY.map((h, i) => (
                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <div className="relative flex h-full w-[10px] items-end overflow-hidden rounded-full bg-pos-muted">
                    <motion.div
                      className="w-full rounded-full bg-gradient-to-b from-[#52B0F8] to-[#5FE88A]"
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      transition={{ duration: 0.8, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                  <span className="text-[8.5px] text-pos-grey">{MONTHS[i]}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="pos-card p-6" aria-labelledby="due-title">
            <h3 id="due-title" className="border-b border-pos-accent/60 pb-3 text-[17px] font-medium">
              Due this week
            </h3>
            <div className="mt-3 flex justify-between text-[13px] font-medium text-pos-accent">
              <span>Client</span>
              <span>Liability</span>
            </div>
            <ul className="mt-2 divide-y divide-pos-line">
              {DUE.map((d) => (
                <li key={d.name} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-pos-tint text-[12px] font-semibold text-pos-accent">
                    {d.m}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px]">{d.name}</p>
                    <p className="text-[12px] font-medium text-pos-accent">
                      {d.form}, {d.when}
                    </p>
                  </div>
                  <span className="text-[13px] font-medium tabular-nums text-pos-accent">&#8377;{d.amt}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* Filing queue with detail drawer */}
      <section aria-labelledby="queue-title" className="pt-2">
        <h3 id="queue-title" className="flex items-center gap-2.5 text-[22px] font-semibold text-pos-ink"><StepMark tone="mint" />
          Filing queue
        </h3>
        <div className="mt-4 grid gap-6 xl:grid-cols-[1fr_330px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {(['All', 'Waiting', 'Filed', 'Blocked'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  aria-pressed={tab === t}
                  className={`h-9 min-w-[110px] rounded-full px-4 text-[12.5px] font-medium transition-colors ${
                    tab === t ? 'bg-pos-ink text-pos-surface' : 'bg-pos-surface text-pos-ink/65 ring-1 ring-inset ring-pos-line hover:text-pos-ink'
                  }`}
                >
                  {t === 'All' ? 'All returns' : t} ({counts[t]})
                </button>
              ))}
              <div className="relative ml-auto">
                <label htmlFor="queue-search" className="sr-only">
                  Search the queue
                </label>
                <input
                  id="queue-search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search client or GSTIN"
                  className="h-10 w-[230px] rounded-full border border-pos-line bg-pos-surface pl-4 pr-9 text-[13px] text-pos-ink outline-none focus:border-pos-accent"
                />
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pos-ink/60" />
              </div>
              <button
                type="button"
                className="flex h-10 items-center gap-3 rounded-full border border-pos-line bg-pos-surface px-4 text-[13px] text-pos-ink hover:bg-pos-tint"
              >
                Filter <Filter className="h-4 w-4" />
              </button>
            </div>

            <div className="pos-scroll mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-0 text-[13.5px]">
                <thead>
                  <tr className="text-white">
                    {['S. No', 'Client', 'Return', 'Documents'].map((h, i) => (
                      <th key={h} className={`bg-pos-head px-4 py-3 text-left font-medium ${i === 0 ? 'rounded-l-[6px]' : ''}`}>
                        {h}
                      </th>
                    ))}
                    <th className="bg-pos-head px-4 py-3 text-left font-medium">
                      <button type="button" onClick={() => setSortDesc((s) => !s)} className="inline-flex items-center gap-1.5">
                        Liability <ChevronsUpDown className="h-3.5 w-3.5" />
                      </button>
                    </th>
                    <th className="rounded-r-[6px] bg-pos-head px-4 py-3 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr aria-hidden>
                    <td colSpan={6} className="h-3" />
                  </tr>
                  {visible.map((r, i) => {
                    const isSel = selected?.id === r.id;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelected(r)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelected(r);
                          }
                        }}
                        tabIndex={0}
                        aria-selected={isSel}
                        className={`cursor-pointer outline-none transition-colors focus-visible:bg-pos-tint ${
                          isSel ? 'bg-pos-tint' : i % 2 ? 'bg-pos-surface hover:bg-pos-tint' : 'bg-pos-muted hover:bg-pos-tint'
                        }`}
                      >
                        <td className="px-4 py-3">{i + 1}</td>
                        <td className="px-4 py-3">
                          <p>{r.client}</p>
                          <p className="ident font-mono text-[11px] text-pos-ink/50">{r.gstin}</p>
                        </td>
                        <td className="px-4 py-3">{r.ret}</td>
                        <td className="px-4 py-3 tabular-nums">{r.docs}</td>
                        <td className="px-4 py-3 tabular-nums">&#8377;{fmt(r.liability)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block min-w-[96px] rounded-full px-3 py-1 text-[12.5px] font-medium ${STATUS_STYLE[r.status]}`}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-pos-ink/60">
                        No returns match. Clear the search or pick another tab.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail drawer */}
          <AnimatePresence mode="wait">
            {selected && (
              <motion.aside
                key={selected.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.25 }}
                className="pos-card h-fit overflow-hidden p-4"
                aria-label={`${selected.client} return detail`}
              >
                <div className="flex items-center justify-between rounded-[10px] bg-[#141416] px-3.5 py-2.5 text-[13px] font-medium text-white">
                  <span>RETURN: {selected.id}</span>
                  <span className="flex items-center gap-2">
                    <Play className="h-3.5 w-3.5 fill-[#5FE88A] text-[#5FE88A]" />
                    <button type="button" aria-label="Close detail" onClick={() => setSelected(null)}>
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3 text-[12px]">
                  <span className="rounded-full bg-pos-tint px-2.5 py-1.5 text-pos-accent">Client</span>
                  <span className="truncate">{selected.client}</span>
                </div>
                <table className="mt-3 w-full text-[12.5px]">
                  <thead>
                    <tr className="bg-pos-head text-white">
                      <th className="px-3 py-2 text-left font-medium">Head</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lines.map(([k, v]) => (
                      <tr key={k} className="border-b border-pos-line">
                        <td className="px-3 py-2.5">{k}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">&#8377;{fmt(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4 flex items-center justify-between rounded-[10px] bg-pos-head px-3 py-2.5 text-[13px] font-medium text-white">
                  <span>Total liability</span>
                  <span className="tabular-nums">&#8377;{fmt(selected.liability)}</span>
                </div>
                {selected.status === 'Blocked' && (
                  <p className="mt-3 rounded-[4px] bg-pos-red/10 px-3 py-2 text-[12px] text-pos-red">
                    IMS actions changed after the 14th. Recompute GSTR-2B before filing.
                  </p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.map((x) => (x.id === selected.id ? { ...x, status: 'Waiting' } : x)))}
                    className="h-10 rounded-full bg-pos-head text-[13px] font-medium text-white"
                  >
                    Send back
                  </button>
                  <button
                    type="button"
                    disabled={selected.status !== 'Waiting'}
                    onClick={() => setModal(true)}
                    className="h-10 rounded-full bg-[#5FE88A] text-[13px] font-semibold text-[#141416] disabled:opacity-40"
                  >
                    {selected.status === 'Filed' ? 'Filed' : 'Approve'}
                  </button>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </section>

      <AnimatePresence>
        {modal && selected && (
          <OffsetModal
            row={selected}
            onClose={() => setModal(false)}
            onApprove={() => {
              setRows((rs) => rs.map((x) => (x.id === selected.id ? { ...x, status: 'Filed' } : x)));
              setSelected({ ...selected, status: 'Filed' });
              setModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
