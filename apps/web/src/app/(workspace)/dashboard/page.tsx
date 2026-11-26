'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlarmClock,
  ArrowUpRight,
  BadgeIndianRupee,
  CalendarClock,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  FileWarning,
  KeyRound,
  LayoutGrid,
  LineChart,
  ShieldAlert,
  Usb,
  UserCheck,
  X,
} from 'lucide-react';
import { StepMark } from '../../../components/landing/primitives';
import { CustomDropdown } from '../../../components/ui/CustomSelect';
import { useAuth } from '../../../context/AuthContext';
import { useWorkspace } from '../../../workspace/WorkspaceContext';
import { PracticeComplianceHeatmap } from '../../../components/practice/PracticeComplianceHeatmap';
import {
  OBLIGATIONS,
  STATE_LABEL,
  approvalQueue,
  filterEntities,
  kpis,
  radar,
  todayIst,
  urgentDeadlines,
  workload,
  type Filters,
  type RadarTile,
} from '../../../workspace/selectors';
import type { FilingCell, FilingState, Obligation, WorkspaceSnapshot } from '../../../workspace/types';

type Period = 'month' | 'quarter' | 'fy' | 'pending';
type View = 'analytics' | 'matrix' | 'heatmap';

const PERIODS: Array<[Period, string]> = [
  ['month', 'This Month'],
  ['quarter', 'Q3 TY 26-27'],
  ['fy', 'FY 2026-27'],
  ['pending', 'All Pending'],
];

const PERIOD_OBLIGATIONS: Record<Period, Obligation[] | null> = {
  month: ['GSTR1', 'IMS_2B', 'GSTR3B', 'TDS_CHALLAN'],
  quarter: ['TDS_RETURN'],
  fy: null,
  pending: null,
};

const DONUT = ['#52B0F8', '#5FE88A', '#5A50F2', '#F2B53A', '#141416'];

const STATE_STYLE: Record<FilingState, string> = {
  NA: 'bg-transparent text-pos-ink/60',
  DRAFT: 'bg-pos-muted text-pos-ink/70',
  VALIDATED: 'bg-[#5A50F2]/15 text-[#5A50F2] dark:text-[#a7a1ff]',
  RECONCILED: 'bg-pos-accent/15 text-pos-accent',
  CLIENT_APPROVED: 'bg-[#f2b53a]/20 text-[#9a6a06] dark:text-[#f2c66a]',
  PORTAL_SAVED: 'bg-pos-green/15 text-pos-green',
  FILED: 'bg-pos-green text-white dark:text-[#141416]',
};

const SEVERITY_STYLE = {
  critical: { ring: 'ring-pos-red/30', dot: 'bg-pos-red', text: 'text-pos-red' },
  warning: { ring: 'ring-[#f2b53a]/40', dot: 'bg-[#f2b53a]', text: 'text-[#b9800f] dark:text-[#f2c66a]' },
  clear: { ring: 'ring-pos-line', dot: 'bg-[#5fe88a]', text: 'text-pos-green' },
} as const;

const TILE_ICON: Record<RadarTile['id'], React.ComponentType<{ className?: string }>> = {
  cliff: CalendarClock,
  ims: AlarmClock,
  token: KeyRound,
  dsc: Usb,
  tds: FileWarning,
};

const OBLIGATION_HREF: Record<Obligation, string> = {
  GSTR1: '/gst',
  IMS_2B: '/gst/recon-2b',
  GSTR3B: '/gst',
  TDS_CHALLAN: '/tds',
  TDS_RETURN: '/tds',
};

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
};
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const inrShort = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : inr(n));
const timeShort = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });

/* Charts */

function Donut({ data }: { data: WorkspaceSnapshot['composition'] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 38;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
      {data.map((d, i) => {
        const len = (d.value / total) * C;
        const el = <circle key={d.key} cx="50" cy="50" r={r} fill="none" stroke={DONUT[i % DONUT.length]} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 0.8)} ${C}`} strokeDashoffset={-offset} />;
        offset += len;
        return el;
      })}
    </svg>
  );
}

function splinePath(values: number[], w: number, h: number, padTop = 40, padBottom = 8) {
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - padBottom - (v / max) * (h - padTop - padBottom)] as const);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[Math.max(0, i - 1)];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C ${x1 + (x2 - x0) / 6} ${y1 + (y2 - y0) / 6}, ${x2 - (x3 - x1) / 6} ${y2 - (y3 - y1) / 6}, ${x2} ${y2}`;
  }
  return { d, pts };
}

function Velocity({ values }: { values: number[] }) {
  const W = 600;
  const H = 150;
  const { d, pts } = splinePath(values, W, H);
  const peak = values.indexOf(Math.max(...values));
  const [px, py] = pts[peak];
  const share = Math.round((values.slice(17, 21).reduce((a, b) => a + b, 0) / Math.max(1, values.reduce((a, b) => a + b, 0))) * 100);
  return (
    <div className="w-full min-w-0">
      <div className="relative h-[175px] w-full min-w-0 overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
          <defs>
            <linearGradient id="vel-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#52B0F8" stopOpacity="0.32" />
              <stop offset="1" stopColor="#52B0F8" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="currentColor" strokeOpacity="0.07" />
          ))}
          <path d={`${d} L ${W} ${H} L 0 ${H} Z`} fill="url(#vel-fill)" />
          <path d={d} fill="none" stroke="#2F8AE0" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <span
          className="absolute -mt-1 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-pos-accent px-2.5 py-0.5 text-[12px] sm:text-[12.5px] font-semibold text-white pointer-events-none"
          style={{
            left: `${Math.min(84, Math.max(16, (px / W) * 100))}%`,
            top: `${(py / H) * 100}%`,
          }}
        >
          {values[peak]} on the {ordinal(peak + 1)}
        </span>
      </div>
      <div className="mt-2 flex justify-between text-[12.5px] text-pos-ink/60">
        {[1, 5, 10, 11, 14, 18, 20, 25, 30].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <p className="mt-3 text-[12.5px] text-pos-ink/60">
        {share}% of this month&apos;s filings landed between the 18th and the 21st.
      </p>
    </div>
  );
}

function Outflow({ data }: { data: WorkspaceSnapshot['outflow'] }) {
  const max = Math.max(...data.map((d) => d.itc + d.cash), 1);
  return (
    <div className="w-full min-w-0">
      <div className="flex h-[150px] items-end gap-0.5 sm:gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {data.map((m) => (
          <div key={m.month} className="flex h-full flex-1 min-w-[14px] sm:min-w-[18px] flex-col items-center justify-end gap-1.5">
            <div className="flex h-full w-full items-end justify-center gap-[2px] sm:gap-[3px]">
              {[{ v: m.itc, c: 'bg-pos-accent' }, { v: m.cash, c: 'bg-pos-ink/35' }].map((b, i) => (
                <div key={i} className="relative h-full w-[6px] sm:w-[8px] overflow-hidden rounded-full bg-pos-muted">
                  {/* ITC in the accent, cash in a neutral; the bar grows with a transform, not its height */}
                  <motion.div
                    className={`absolute inset-x-0 bottom-0 origin-bottom rounded-full ${b.c}`}
                    style={{ height: `${(b.v / max) * 100}%` }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              ))}
            </div>
            <span className="text-[10.5px] sm:text-[11px] text-pos-ink/60">{m.month}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-pos-ink/65">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-pos-accent" /> ITC utilised</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-pos-ink/35" /> Cash paid</span>
      </div>
    </div>
  );
}

/* Page */

export default function ControlTowerPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { snapshot, filters, setFilters, setActiveClient } = useWorkspace();
  const [view, setView] = useState<View>('analytics');
  const [period, setPeriod] = useState<Period>('month');
  const [openTile, setOpenTile] = useState<RadarTile['id'] | null>(null);
  const [radarOpen, setRadarOpen] = useState(true);
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const searchParams = useSearchParams();
  const searchView = searchParams ? searchParams.get('view') : null;

  useEffect(() => {
    if (searchView === 'matrix' || searchView === 'analytics' || searchView === 'heatmap') {
      setView(searchView);
    }
  }, [searchView]);

  useEffect(() => {
    const checkView = () => {
      const v = new URLSearchParams(window.location.search).get('view');
      if (v === 'matrix' || v === 'analytics' || v === 'heatmap') {
        setView(v);
      }
    };
    checkView();
    window.addEventListener('popstate', checkView);
    const handleSwitch = (e: Event) => {
      const detail = (e as CustomEvent<View>).detail;
      if (detail === 'matrix' || detail === 'analytics' || detail === 'heatmap') {
        setView(detail);
      }
    };
    window.addEventListener('syntax:switch-view', handleSwitch);
    window.addEventListener('synextax:switch-view', handleSwitch);
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.removeEventListener('popstate', checkView);
      window.removeEventListener('syntax:switch-view', handleSwitch);
      window.removeEventListener('synextax:switch-view', handleSwitch);
      window.clearInterval(id);
    };
  }, []);

  const today = todayIst();
  const canFilter = user?.role !== 'STAFF';
  const entities = useMemo(() => filterEntities(snapshot, filters), [snapshot, filters]);

  // The period pills re-scope the matrix and KPIs to the obligations that period covers.
  const scoped: WorkspaceSnapshot = useMemo(() => {
    const allowed = PERIOD_OBLIGATIONS[period];
    const filings = snapshot.filings.filter((c) => (!allowed || allowed.includes(c.obligation)) && (period !== 'pending' || c.state !== 'FILED'));
    return { ...snapshot, filings };
  }, [snapshot, period]);

  const k = useMemo(() => kpis(scoped, entities), [scoped, entities]);
  const tiles = useMemo(() => radar(snapshot, entities, today, now), [snapshot, entities, today, now]);
  const approvals = useMemo(() => approvalQueue(snapshot, entities), [snapshot, entities]);
  const loads = useMemo(() => workload(scoped, entities), [scoped, entities]);
  const deadlines = useMemo(() => urgentDeadlines(snapshot, entities, today).slice(0, 6), [snapshot, entities, today]);
  const total = snapshot.composition.reduce((s, d) => s + d.value, 0);
  const staffName = (id: string) => snapshot.staff.find((s) => s.id === id);
  const columns = OBLIGATIONS.filter((o) => !PERIOD_OBLIGATIONS[period] || PERIOD_OBLIGATIONS[period]!.includes(o.id));

  const openCell = (c: FilingCell) => {
    const e = snapshot.entities.find((x) => x.id === c.entityId);
    if (!e) return;
    const isTds = c.obligation === 'TDS_CHALLAN' || c.obligation === 'TDS_RETURN';
    setActiveClient({ entityId: e.id, gstin: isTds ? undefined : e.gstins[0]?.gstin, tan: isTds ? e.tans[0]?.tan : undefined });
    router.push(OBLIGATION_HREF[c.obligation]);
  };

  const setF = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });

  return (
    <div className="mx-auto max-w-[1560px] space-y-5 min-w-0 w-full">
      {/* Title, view toggle, period pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
        <div className="flex flex-wrap items-center gap-3 min-w-0 max-w-full">
          <h1 className="flex items-center gap-2.5 text-[22px] sm:text-[24px] font-semibold tracking-[-0.01em] text-pos-ink shrink-0">
            <StepMark tone="sky" /> Control Tower
          </h1>
          <div className="flex max-w-full min-w-0 flex-wrap sm:flex-nowrap items-center gap-0.5 rounded-[18px] sm:rounded-full bg-pos-muted p-1" role="tablist" aria-label="View">
            {([['analytics', 'Analytics', LineChart], ['matrix', 'Filing matrix', LayoutGrid], ['heatmap', 'Compliance Heatmap', CalendarClock]] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 sm:px-3.5 text-[12.5px] sm:text-[13px] font-medium transition-colors ${view === id ? 'bg-pos-surface text-pos-ink shadow-sm' : 'text-pos-ink/55 hover:text-pos-ink'}`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 py-0.5" role="tablist" aria-label="Period">
          {PERIODS.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={period === id}
              onClick={() => setPeriod(id)}
              className={`h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 sm:px-4 text-[12.5px] sm:text-[13px] font-medium transition-colors ${
                period === id ? 'bg-pos-accent text-white shadow-md' : 'bg-pos-surface text-pos-ink/65 ring-1 ring-inset ring-pos-line hover:text-pos-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter chips: partners and managers */}
      {canFilter && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 text-[13px] min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CustomDropdown
              id="f-staff"
              variant="pill"
              placeholder="All staff"
              value={filters.staffId ?? ''}
              onChange={(val) => setF({ staffId: val || null })}
              options={[
                { value: '', label: 'All staff' },
                ...snapshot.staff.filter((s) => s.role !== 'PARTNER').map((s) => ({
                  value: s.id,
                  label: s.name,
                  badge: s.role,
                })),
              ]}
            />
            <CustomDropdown
              id="f-group"
              variant="pill"
              placeholder="All client groups"
              value={filters.groupId ?? ''}
              onChange={(val) => setF({ groupId: val || null })}
              options={[
                { value: '', label: 'All client groups' },
                ...snapshot.groups.map((g) => ({
                  value: g.id,
                  label: g.name,
                })),
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 py-0.5">
            {(['ALL', 'REGULAR_MONTHLY', 'QRMP', 'COMPOSITION', 'TDS'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setF({ category: c })}
                aria-pressed={filters.category === c}
                className={`h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 font-medium transition-colors ${filters.category === c ? 'bg-pos-ink text-pos-surface' : 'text-pos-ink/60 ring-1 ring-inset ring-pos-line hover:text-pos-ink'}`}
              >
                {{ ALL: 'All categories', REGULAR_MONTHLY: 'Regular monthly', QRMP: 'QRMP', COMPOSITION: 'Composition', TDS: 'TDS' }[c]}
              </button>
            ))}
            {(filters.staffId || filters.groupId || filters.category !== 'ALL') && (
              <button onClick={() => setFilters({ staffId: null, groupId: null, category: 'ALL' })} className="flex h-9 shrink-0 whitespace-nowrap items-center gap-1 rounded-full px-3 text-pos-accent hover:bg-pos-tint">
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Statutory Risk Radar */}
      <section className="pos-card p-4" aria-labelledby="radar-title">
        <button onClick={() => setRadarOpen((o) => !o)} aria-expanded={radarOpen} className="flex w-full items-center justify-between">
          <h2 id="radar-title" className="flex items-center gap-2 text-[15px] font-semibold text-pos-ink">
            <ShieldAlert className="h-4 w-4 text-pos-accent" /> Statutory Risk Radar
          </h2>
          <ChevronDown className={`h-4 w-4 text-pos-ink/60 transition-transform ${radarOpen ? '' : '-rotate-90'}`} />
        </button>
        <AnimatePresence initial={false}>
          {radarOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="-m-2 overflow-hidden p-2">
              <div className="mt-3 grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
                {tiles.map((t) => {
                  const Icon = TILE_ICON[t.id];
                  const sev = SEVERITY_STYLE[t.severity];
                  return (
                    <button
                      key={t.id}
                      onClick={() => setOpenTile((o) => (o === t.id ? null : t.id))}
                      aria-expanded={openTile === t.id}
                      className={`rounded-[16px] bg-pos-surface p-3.5 text-left ring-1 transition-shadow hover:shadow-md ${openTile === t.id ? 'ring-2 ring-pos-accent' : sev.ring}`}
                    >
                      <span className="flex items-center justify-between">
                        <Icon className={`h-[18px] w-[18px] ${sev.text}`} />
                        <span className={`flex items-center gap-1.5 text-[18px] font-semibold tabular-nums ${sev.text}`}>
                          <i className={`h-2 w-2 rounded-full ${sev.dot}`} />
                          {t.items.length}
                        </span>
                      </span>
                      <span className="mt-2 block text-[13px] font-semibold text-pos-ink">{t.title}</span>
                      <span className="mt-0.5 block text-[12px] leading-[1.4] text-pos-ink/55">{t.summary}</span>
                    </button>
                  );
                })}
              </div>
              <AnimatePresence initial={false}>
                {openTile && (
                  <motion.ul key={openTile} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 divide-y divide-pos-line rounded-[16px] bg-pos-muted">
                    {tiles.find((t) => t.id === openTile)!.items.map((it) => (
                      <li key={it.key}>
                        <button
                          onClick={() => {
                            if (it.entityId) setActiveClient({ entityId: it.entityId, gstin: snapshot.entities.find((e) => e.id === it.entityId)?.gstins[0]?.gstin });
                            router.push(it.href);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-pos-tint"
                        >
                          <i className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_STYLE[it.severity].dot}`} />
                          <span className="min-w-0 flex-1">
                            <span className="ident block truncate font-mono text-[12.5px] font-medium text-pos-ink">{it.title}</span>
                            <span className="block text-[12.5px] text-pos-ink/60">{it.detail}</span>
                          </span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-pos-ink/60" />
                        </button>
                      </li>
                    ))}
                    {tiles.find((t) => t.id === openTile)!.items.length === 0 && <li className="px-4 py-4 text-[13px] text-pos-ink/55">Nothing flagged for the current filters.</li>}
                  </motion.ul>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {view === 'heatmap' ? (
        <PracticeComplianceHeatmap />
      ) : view === 'analytics' ? (
        <div className="grid min-w-0 gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(300px,350px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_380px]">
          {/* Card 1: composition donut */}
          <section className="pos-card min-w-0 overflow-hidden p-4 sm:p-5" aria-labelledby="comp-title">
            <h2 id="comp-title" className="text-[15px] font-semibold text-pos-ink">Tax and ITC composition</h2>
            <div className="mt-4 flex flex-col sm:flex-row md:flex-col lg:flex-row xl:flex-col 2xl:flex-row items-center gap-4 2xl:gap-5 min-w-0">
              <div className="relative h-[140px] w-[140px] 2xl:h-[150px] 2xl:w-[150px] shrink-0">
                <Donut data={snapshot.composition} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[12px] text-pos-ink/60">Net tax</span>
                  <span className="text-[16px] 2xl:text-[17px] font-semibold tabular-nums text-pos-ink">{inrShort(total)}</span>
                </div>
              </div>
              <ul className="w-full min-w-0 flex-1 space-y-2 text-[13px]">
                {snapshot.composition.map((d, i) => (
                  <li key={d.key} className="flex min-w-0 items-center gap-2">
                    <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DONUT[i % DONUT.length] }} />
                    <span className="truncate text-pos-ink/80">{d.key}</span>
                    <span className="ml-auto shrink-0 pl-2 tabular-nums text-pos-ink/60">{inrShort(d.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Card 2: KPIs, each jumps to the filtered work queue */}
          <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4">
            {[
              { label: 'Returns due', value: String(k.due), tone: '#2F8AE0', icon: CircleAlert, go: () => { setPeriod('pending'); setView('matrix'); } },
              { label: 'Returns filed', value: String(k.filed), tone: '#14A44D', icon: ClipboardCheck, go: () => setView('matrix') },
              { label: 'ITC reconciled', value: inrShort(k.itcReconciled), tone: '#5A50F2', icon: BadgeIndianRupee, go: () => router.push('/gst/recon-2b') },
              { label: 'Pending mismatches', value: inrShort(k.pendingMismatch), tone: '#D99A17', icon: FileWarning, go: () => router.push('/gst/recon-2b') },
            ].map((c) => (
              <button key={c.label} onClick={c.go} className="pos-card group flex min-w-0 overflow-hidden flex-col p-3 sm:p-4 text-left transition-transform hover:-translate-y-0.5">
                <span className="flex w-full min-w-0 items-start justify-between gap-1.5">
                  <span className="text-[12.5px] sm:text-[13.5px] leading-snug font-medium text-pos-ink/80">{c.label}</span>
                  <span className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `${c.tone}1f`, color: c.tone }}>
                    <c.icon className="h-4 w-4" />
                  </span>
                </span>
                <span className="mt-auto max-w-full truncate pt-3 sm:pt-4 text-[21px] sm:text-[24px] 2xl:text-[26px] font-semibold tabular-nums" style={{ color: c.tone }}>{c.value}</span>
                <span className="mt-1 flex items-center gap-1 text-[12.5px] text-pos-ink/60 group-hover:text-pos-accent">
                  Open queue <ArrowUpRight className="h-3 w-3 shrink-0" />
                </span>
              </button>
            ))}
          </div>

          {/* Card 3: ITC vs cash */}
          <section className="pos-card min-w-0 overflow-hidden p-4 sm:p-5 lg:col-span-2 xl:col-span-1" aria-labelledby="out-title">
            <h2 id="out-title" className="text-[15px] font-semibold text-pos-ink">Monthly outflow: ITC vs cash (Rs lakh)</h2>
            <div className="mt-4">
              <Outflow data={snapshot.outflow} />
            </div>
          </section>

          {/* Card 4: filing velocity */}
          <section className="pos-card min-w-0 overflow-hidden p-4 sm:p-5 lg:col-span-2 xl:col-span-2" aria-labelledby="vel-title">
            <h2 id="vel-title" className="text-[15px] font-semibold text-pos-ink">Filing velocity this month</h2>
            <div className="mt-4">
              <Velocity values={snapshot.velocity} />
            </div>
          </section>

          {/* Card 5: urgent deadlines */}
          <section className="pos-card min-w-0 overflow-hidden p-4 sm:p-5 lg:col-span-2 xl:col-span-1" aria-labelledby="due-title">
            <div className="flex items-center justify-between">
              <h2 id="due-title" className="text-[15px] font-semibold text-pos-ink">Urgent deadlines</h2>
              <button onClick={() => { setPeriod('pending'); setView('matrix'); }} className="text-[12.5px] font-medium text-pos-accent">View all</button>
            </div>
            <ul className="mt-3 divide-y divide-pos-line">
              {deadlines.map((d) => (
                <li key={`${d.entity.id}-${d.label}`}>
                  <button
                    onClick={() => setActiveClient({ entityId: d.entity.id, gstin: d.entity.gstins[0]?.gstin })}
                    className="flex w-full items-center gap-3 py-2.5 text-left"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pos-tint text-[12.5px] font-semibold text-pos-accent">
                      {d.entity.legalName.split(' ').slice(0, 2).map((w) => w[0]).join('')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-pos-ink">{d.entity.legalName}</span>
                      <span className="block truncate text-[12px] text-pos-ink/55">{d.label}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block text-[12.5px] font-semibold ${d.daysLeft < 0 ? 'text-pos-red' : d.daysLeft <= 2 ? 'text-[#b9800f] dark:text-[#f2c66a]' : 'text-pos-ink/70'}`}>
                        {d.daysLeft < 0 ? `${-d.daysLeft}d overdue` : d.daysLeft === 0 ? 'Due today' : `${d.daysLeft}d left`}
                      </span>
                      {d.amount ? <span className="block text-[12.5px] tabular-nums text-pos-ink/60">{inr(d.amount)}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
              {deadlines.length === 0 && <li className="py-6 text-center text-[13px] text-pos-ink/55">Nothing due for these filters.</li>}
            </ul>
          </section>
        </div>
      ) : (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          {/* Filing matrix */}
          <section className="pos-card min-w-0 overflow-hidden" aria-labelledby="matrix-title">
            <div className="flex items-center justify-between p-4 pb-3">
              <h2 id="matrix-title" className="text-[15px] font-semibold text-pos-ink">Filing matrix</h2>
              <button onClick={() => setApprovalsOpen(true)} className="flex h-9 items-center gap-2 rounded-full bg-pos-head px-4 text-[13px] font-medium text-white">
                <UserCheck className="h-4 w-4" /> Partner approvals
                <span className="rounded-full bg-[#5fe88a] px-1.5 text-[12px] font-semibold text-[#141416]">{approvals.length}</span>
              </button>
            </div>
            <div className="pos-scroll overflow-x-auto px-4 pb-4">
              <table className="w-full min-w-[820px] border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr>
                    <th className="px-3 py-2.5 text-left">Client</th>
                    {columns.map((o) => (
                      <th key={o.id} className="px-3 py-2.5 text-left">{o.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entities.map((e, i) => (
                    <tr key={e.id} className={i % 2 ? 'bg-pos-surface' : 'bg-pos-muted/60'}>
                      <td className="px-3 py-2.5">
                        <p className="max-w-[220px] truncate font-medium text-pos-ink">{e.legalName}</p>
                        <p className="text-[12.5px] text-pos-ink/60">
                          {staffName(e.assignedTo)?.name ?? ''}
                          {e.gstins.some((g) => g.filingCategory === 'QRMP') ? ', QRMP' : e.gstins.some((g) => g.filingCategory === 'COMPOSITION') ? ', Composition' : ''}
                        </p>
                      </td>
                      {columns.map((o) => {
                        const c = scoped.filings.find((x) => x.entityId === e.id && x.obligation === o.id);
                        if (!c || c.state === 'NA') return <td key={o.id} className="px-3 py-2.5 text-[12px] text-pos-ink/60">Not due</td>;
                        return (
                          <td key={o.id} className="px-2 py-2">
                            <button onClick={() => openCell(c)} title={`${o.label} ${c.periodLabel}: ${STATE_LABEL[c.state]}`} className="w-full rounded-[12px] px-2 py-1.5 text-left hover:bg-pos-tint">
                              <span className={`inline-block rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold ${STATE_STYLE[c.state]}`}>{STATE_LABEL[c.state]}</span>
                              <span className="mt-1 flex items-center gap-1.5 text-[12px] text-pos-ink/60">
                                <span className="rounded-full bg-pos-surface px-1.5 font-semibold text-pos-ink/60 ring-1 ring-pos-line">{staffName(c.assignee)?.initials}</span>
                                {timeShort(c.updatedAt)}
                              </span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {entities.length === 0 && <p className="py-8 text-center text-[13px] text-pos-ink/55">No clients match these filters.</p>}
            </div>
          </section>

          {/* Staff workload */}
          <section className="pos-card p-5" aria-labelledby="load-title">
            <h2 id="load-title" className="text-[15px] font-semibold text-pos-ink">Staff workload</h2>
            {!canFilter ? (
              <p className="mt-3 text-[13px] text-pos-ink/55">Workload is visible to partners and managers.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {loads.map((w) => (
                  <li key={w.staff.id}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13.5px] font-medium text-pos-ink">{w.staff.name}</span>
                      <span className="text-[12.5px] tabular-nums text-pos-ink/60">{w.filed}/{w.total} filed</span>
                    </div>
                    <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-pos-muted">
                      <div className="bg-pos-green" style={{ width: `${(w.filed / w.total) * 100}%` }} />
                      <div className="bg-[#f2b53a]" style={{ width: `${(w.awaitingPartner / w.total) * 100}%` }} />
                    </div>
                    <p className="mt-1 text-[12.5px] text-pos-ink/60">
                      GSTR-3B {w.threeBFiled}/{w.threeBTotal} filed, {w.pendingClientData} waiting on client data, {w.awaitingPartner} awaiting sign-off
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Partner approval queue drawer */}
      <AnimatePresence>
        {approvalsOpen && (
          <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onPointerDown={(e) => e.target === e.currentTarget && setApprovalsOpen(false)}>
            <motion.aside
              role="dialog"
              aria-label="Partner approval queue"
              initial={{ x: 40 }}
              animate={{ x: 0 }}
              exit={{ x: 40 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="h-full w-full max-w-[420px] overflow-y-auto bg-pos-surface p-5 text-pos-ink shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-[17px] font-semibold">Partner approval queue</h2>
                <button onClick={() => setApprovalsOpen(false)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-pos-muted">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-[12.5px] text-pos-ink/55">Returns reconciled or client-approved that need maker-checker sign-off.</p>
              <ul className="mt-4 space-y-2.5">
                {approvals.map((c) => {
                  const e = snapshot.entities.find((x) => x.id === c.entityId)!;
                  return (
                    <li key={`${c.entityId}-${c.obligation}`} className="rounded-[16px] p-3.5 ring-1 ring-pos-line">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-semibold">{e.legalName}</p>
                          <p className="text-[12px] text-pos-ink/55">
                            {OBLIGATIONS.find((o) => o.id === c.obligation)?.label} {c.periodLabel}, prepared by {staffName(c.assignee)?.name}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${STATE_STYLE[c.state]}`}>{STATE_LABEL[c.state]}</span>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className="text-[13px] font-semibold tabular-nums">{c.amount ? inr(c.amount) : ''}</span>
                        <button onClick={() => openCell(c)} className="flex h-8 items-center gap-1 rounded-full bg-pos-head px-3.5 text-[12.5px] font-medium text-white">
                          Review <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
                {approvals.length === 0 && <li className="py-8 text-center text-[13px] text-pos-ink/55">Nothing waiting for sign-off.</li>}
              </ul>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
