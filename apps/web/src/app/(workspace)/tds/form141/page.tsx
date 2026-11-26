'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText,
  Building2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  Send,
  Download,
  Users,
  Home,
  Briefcase,
  Coins,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { useWorkspace } from '../../../../workspace/WorkspaceContext';
import { TdsCommandBar } from '../../../../components/tds/TdsCommandBar';

interface ScheduleItem {
  id: string;
  deductee_pan: string;
  deductee_name: string;
  section_code: string;
  amount_paid: string;
  tds_rate: string;
  tds_deducted: string;
  total_tds_deposited: string;
  payment_credit_date: string;
}

interface ScheduleData {
  count: number;
  totalAmountPaid: string;
  totalTdsDeposited: string;
  items: ScheduleItem[];
}

interface Form141Payload {
  success: boolean;
  tan: string;
  period: string;
  formCode: string;
  regime: string;
  schedules: {
    scheduleA_Salary: ScheduleData;
    scheduleB_NonSalary: ScheduleData;
    scheduleC_Property_Section393_2: ScheduleData;
    scheduleD_VirtualDigitalAssets: ScheduleData;
    scheduleE_TcsCollections: ScheduleData;
  };
}

export default function Form141Page() {
  const { authFetch } = useAuth();
  const { activeClient } = useWorkspace();
  const [activeTan, setActiveTan] = useState<string>('PTLA12345B');
  const [activePeriod, setActivePeriod] = useState<string>('2026-Q1');
  const [activeSchedule, setActiveSchedule] = useState<'A' | 'B' | 'C' | 'D' | 'E'>('B');
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<Form141Payload | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showSignModal, setShowSignModal] = useState<boolean>(false);
  const [signSuccess, setSignSuccess] = useState<string | null>(null);

  const fetchForm141 = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/v1/tds/${activeTan}/form141/${activePeriod}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // Show empty state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForm141();
  }, [activeTan, activePeriod]);

  const schedulesMap = {
    A: {
      name: 'Schedule A: Salary (Section 394 / Legacy 192)',
      desc: 'Monthly tax deductions from employment compensation with rebate computations.',
      data: data?.schedules?.scheduleA_Salary,
      icon: Briefcase,
    },
    B: {
      name: 'Schedule B: Non-Salary Commercial (Section 393(1))',
      desc: 'Contractors (140B), Professional Fees (140C), Brokerage, and Commercial Rent.',
      data: data?.schedules?.scheduleB_NonSalary,
      icon: Users,
    },
    C: {
      name: 'Schedule C: Immovable Property & NRI (Section 393(2))',
      desc: 'Mandatory 1 percent deduction on real estate transfers and non-resident property payments.',
      data: data?.schedules?.scheduleC_Property_Section393_2,
      icon: Home,
    },
    D: {
      name: 'Schedule D: Virtual Digital Assets (Section 393(4))',
      desc: '1 percent TDS on transfer of cryptocurrencies, NFTs, and digital asset exchanges.',
      data: data?.schedules?.scheduleD_VirtualDigitalAssets,
      icon: Coins,
    },
    E: {
      name: 'Schedule E: TCS Tax Collected at Source (Section 395)',
      desc: 'E-commerce operator collections, scrap sales, overseas remittances, and luxury goods.',
      data: data?.schedules?.scheduleE_TcsCollections,
      icon: Building2,
    },
  };

  const currentSchedule = schedulesMap[activeSchedule];
  const items = currentSchedule.data?.items || [];
  const filteredItems = items.filter(
    (item) =>
      item.deductee_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.deductee_pan.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.section_code.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const totalPaidAllSchedules = Object.values(data?.schedules || {}).reduce(
    (acc, curr) => acc + Number(curr.totalAmountPaid || 0),
    0,
  );
  const totalTdsAllSchedules = Object.values(data?.schedules || {}).reduce(
    (acc, curr) => acc + Number(curr.totalTdsDeposited || 0),
    0,
  );

  const handleSaveAndSign = async () => {
    setIsSubmitting(true);
    try {
      const res = await authFetch(`/api/v1/tds/${activeTan}/form141/${activePeriod}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ taxYear: 2026, quarter: 'Q1' }),
      });
      if (res.ok) {
        setSignSuccess('Form 141 statement verified and drafted with IT Act 2025 compliance.');
        setShowSignModal(false);
      }
    } catch {
      // Error handling
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto font-sans">
      <TdsCommandBar />

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-pos-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 font-semibold">
              <FileText className="h-4 w-4" />
            </span>
            <h1 className="font-display text-[22px] font-semibold text-pos-ink">
              Form 141: Single-PAN Consolidated Return
            </h1>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">
              IT Act 2025
            </span>
          </div>
          <p className="mt-1 text-[13px] text-pos-ink/70">
            Unified statutory return under Income-tax Act 2025: Schedules A through E replace legacy Forms 24Q, 26Q, 27Q, and 27EQ.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchForm141}
            className="flex items-center gap-1.5 rounded-xl border border-pos-line bg-pos-surface px-3 py-1.5 text-[12px] font-medium text-pos-ink hover:bg-pos-muted transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowSignModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-pos-ink px-4 py-1.5 text-[12px] font-semibold text-pos-surface hover:bg-pos-accent transition-colors shadow-sm"
          >
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Sign &amp; File Form 141
          </button>
        </div>
      </div>

      {signSuccess && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-[13px] text-emerald-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{signSuccess}</span>
          </div>
          <button type="button" onClick={() => setSignSuccess(null)} className="text-xs hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Screen B 72/28 Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (72% ~ 8.5 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Schedule Navigation Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {(['A', 'B', 'C', 'D', 'E'] as const).map((sched) => {
              const info = schedulesMap[sched];
              const Icon = info.icon;
              const count = info.data?.count || 0;
              const isActive = activeSchedule === sched;
              return (
                <button
                  key={sched}
                  type="button"
                  onClick={() => setActiveSchedule(sched)}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-[12.5px] font-semibold transition-all whitespace-nowrap border ${
                    isActive
                      ? 'border-pos-accent bg-pos-accent text-white shadow-sm'
                      : 'border-pos-line bg-pos-surface text-pos-ink/75 hover:border-pos-line-strong hover:bg-pos-muted'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>Sched {sched}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-pos-muted text-pos-ink/60'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Schedule Banner */}
          <div className="rounded-2xl border border-pos-line bg-pos-surface p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-[15px] font-semibold text-pos-ink">
                  {currentSchedule.name}
                </h3>
                <p className="text-[12px] text-pos-ink/60 mt-0.5">{currentSchedule.desc}</p>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div>
                  <span className="text-[10.5px] text-pos-ink/50 uppercase tracking-wider block">Taxable Paid</span>
                  <span className="font-mono text-[14px] font-bold text-pos-ink">
                    ₹{Number(currentSchedule.data?.totalAmountPaid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-[10.5px] text-pos-ink/50 uppercase tracking-wider block">TDS Deposited</span>
                  <span className="font-mono text-[14px] font-bold text-emerald-600">
                    ₹{Number(currentSchedule.data?.totalTdsDeposited || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="rounded-2xl border border-pos-line bg-pos-surface shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-pos-line px-4 py-3 bg-pos-muted/30">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-pos-ink/40" />
                <input
                  type="text"
                  placeholder="Filter PAN, name, section..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-pos-line bg-pos-surface pl-8 pr-3 py-1.5 text-[12px] text-pos-ink outline-none focus:border-pos-accent"
                />
              </div>
              <span className="text-[12px] text-pos-ink/60">
                Showing {filteredItems.length} of {items.length} records
              </span>
            </div>

            <div className="overflow-x-auto w-full min-w-0 [scrollbar-width:thin] [scrollbar-color:rgba(120,120,120,0.2)_transparent]">
              <table className="w-full min-w-[650px] text-left text-[12px]">
                <thead>
                  <tr className="border-b border-pos-line bg-pos-ink text-pos-surface uppercase tracking-wider text-[11px] font-medium">
                    <th className="py-2.5 px-3">Deductee PAN</th>
                    <th className="py-2.5 px-3">Legal Name</th>
                    <th className="py-2.5 px-3">Section</th>
                    <th className="py-2.5 px-3 text-right">Amount Paid</th>
                    <th className="py-2.5 px-3 text-right">Rate</th>
                    <th className="py-2.5 px-3 text-right">TDS Deposited</th>
                    <th className="py-2.5 px-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pos-line">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-pos-ink/50">
                        Loading Form 141 schedule records...
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-pos-ink/50">
                        No deductee records found in this schedule for period {activePeriod}.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((row) => (
                      <tr key={row.id} className="hover:bg-pos-muted/50 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-medium text-pos-ink">{row.deductee_pan}</td>
                        <td className="py-2.5 px-3 font-medium text-pos-ink truncate max-w-[200px]">
                          {row.deductee_name}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="rounded bg-sky/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-sky-deep">
                            {row.section_code}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-pos-ink">
                          ₹{Number(row.amount_paid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-pos-ink/75">
                          {row.tds_rate}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-600">
                          ₹{Number(row.total_tds_deposited).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-pos-ink/60">{row.payment_credit_date}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column (28% ~ 3.5-4 cols: Statutory Inspector) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Statutory Verification Box */}
          <div className="rounded-2xl border border-pos-line bg-pos-surface p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-pos-line pb-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h3 className="font-display text-[15px] font-semibold text-pos-ink">
                Statutory Summary (All Schedules)
              </h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-pos-ink/70">Total Base Payments</span>
                <span className="font-mono font-bold text-pos-ink">
                  ₹{totalPaidAllSchedules.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-pos-ink/70">Total TDS Deposited</span>
                <span className="font-mono font-bold text-emerald-600">
                  ₹{totalTdsAllSchedules.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-[12.5px] border-t border-pos-line pt-2">
                <span className="text-pos-ink/70">Statutory Due Date</span>
                <span className="font-mono font-semibold text-amber-600">31 July 2026</span>
              </div>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-pos-ink/70">Correction Horizon</span>
                <span className="font-mono text-pos-ink/60">31 March 2032 (6 Years)</span>
              </div>
            </div>

            {/* NRI Real Estate Section 393(2) Radar */}
            <div className="rounded-xl border border-sky/30 bg-sky/10 p-3 text-[12px] space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-sky-deep">
                <Home className="h-4 w-4" />
                <span>Section 393(2) Real Estate Safeguard</span>
              </div>
              <p className="text-pos-ink/75 leading-relaxed">
                Property transactions involving non-resident sellers require 20 percent base deduction with TAN linking. Schedule C auto-routes remittances.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowSignModal(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-pos-accent py-2.5 text-[13px] font-semibold text-white hover:bg-pos-accent/90 transition-colors shadow-sm"
            >
              <Send className="h-4 w-4" />
              Prepare Form 141 Filing Sign-Off
            </button>
          </div>
        </div>
      </div>

      {/* Screen C Pre-Filing Sign-Off Modal */}
      {showSignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-pos-line bg-pos-surface p-6 shadow-2xl space-y-4 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <h3 className="font-display text-[16px] font-semibold text-pos-ink">
                  Form 141 Statutory Verification
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSignModal(false)}
                className="text-pos-ink/50 hover:text-pos-ink text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-[13px] text-pos-ink/80 leading-relaxed">
              Confirm that all 5 schedules (A through E) have been verified against ITNS 281N challans and 100 percent of PANs are operative. Once signed, the statement will be queued for isolated FVU v1.2 compilation.
            </p>

            <div className="rounded-xl bg-pos-muted/60 p-3 space-y-2 text-[12px]">
              <div className="flex justify-between">
                <span className="text-pos-ink/60">Active TAN:</span>
                <span className="font-mono font-bold text-pos-ink">{activeTan}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-pos-ink/60">Tax Year &amp; Quarter:</span>
                <span className="font-semibold text-pos-ink">{activePeriod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-pos-ink/60">Total Deposited Tax:</span>
                <span className="font-mono font-bold text-emerald-600">
                  ₹{totalTdsAllSchedules.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSignModal(false)}
                className="rounded-xl border border-pos-line px-4 py-2 text-[12.5px] font-medium text-pos-ink hover:bg-pos-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAndSign}
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-[12.5px] font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isSubmitting ? 'Signing...' : 'Sign & Submit Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
