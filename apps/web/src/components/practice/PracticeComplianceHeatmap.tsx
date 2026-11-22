'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileCheck,
  Flame,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const inr = (v: string | number) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface DeadlineClient {
  entityId: string;
  entityName: string;
  reference: string;
  status: string;
  amount: string;
  cashPayable?: string;
  note?: string;
}

interface StatutoryDeadline {
  date: string;
  day: number;
  obligation: string;
  title: string;
  statutoryGround: string;
  totalDue: number;
  completed: number;
  pending: number;
  status: 'COMPLETED' | 'UPCOMING' | 'CRITICAL_ACTION_REQUIRED' | 'OVERDUE' | 'NOT_APPLICABLE';
  clients: DeadlineClient[];
}

interface HeatmapDay {
  day: number;
  date: string;
  hasDeadline: boolean;
  isToday: boolean;
  isPast: boolean;
  urgency: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'NONE';
}

interface RiskEntity {
  entityId: string;
  name: string;
  riskLevel: 'HIGH' | 'MEDIUM' | 'CLEAR';
  riskScore: number;
  reasons: string[];
  pendingObligations: string[];
  contactPhone?: string | null;
  contactEmail?: string | null;
}

interface RadarData {
  period: string;
  today: string;
  summary: {
    totalClients: number;
    totalGstins: number;
    totalTans: number;
    highRiskCount: number;
    mediumRiskCount: number;
    clearCount: number;
    complianceScore: number;
  };
  deadlines: StatutoryDeadline[];
  heatmap: HeatmapDay[];
  riskEntities: RiskEntity[];
}

interface DispatchedNotice {
  entityId: string;
  clientName: string;
  obligation: string;
  statutoryGround: string;
  dueDate: string;
  noticeText: string;
  whatsappUrl: string | null;
  phone: string | null;
}

const defaultPeriod = () => {
  const d = new Date();
  d.setUTCDate(1);
  return d.toISOString().slice(0, 7);
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function PracticeComplianceHeatmap() {
  const { authFetch } = useAuth();
  const [period, setPeriod] = useState(defaultPeriod());
  const [loading, setLoading] = useState(false);
  const [radar, setRadar] = useState<RadarData | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(14);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<{ count: number; notices: DispatchedNotice[] } | null>(null);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const loadRadar = useCallback(async (targetPeriod: string) => {
    setLoading(true);
    setBanner(null);
    try {
      const res = await authFetch(`/api/v1/practice/radar?period=${targetPeriod}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success) {
        setRadar(body.data);
      } else {
        setBanner({ tone: 'bad', text: body.message || 'Unable to load practice compliance radar.' });
      }
    } catch {
      setBanner({ tone: 'bad', text: 'Network connection failed while fetching compliance radar.' });
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadRadar(period);
  }, [loadRadar, period]);

  const changeMonth = (delta: number) => {
    const [yStr, mStr] = period.split('-');
    const cur = new Date(Number(yStr), Number(mStr) - 1 + delta, 1);
    const nextPeriod = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
    setPeriod(nextPeriod);
    setSelectedDay(null);
  };

  const handleDispatchReminders = async (obligation?: string, entityIds?: string[]) => {
    setDispatching(true);
    setBanner(null);
    try {
      const res = await authFetch('/api/v1/practice/radar/dispatch-reminders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          period,
          obligation: obligation || 'ALL',
          channel: 'WHATSAPP',
          entityIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setDispatchResult({ count: data.count, notices: data.notices });
        setBanner({
          tone: 'ok',
          text: `Generated ${data.count} statutory compliance notice(s) with instant WhatsApp click-to-chat links.`,
        });
      } else {
        setBanner({ tone: 'bad', text: data.message || 'Reminder dispatch failed.' });
      }
    } catch {
      setBanner({ tone: 'bad', text: 'Network error during reminder dispatch.' });
    } finally {
      setDispatching(false);
    }
  };

  // Compute calendar grid padding
  const calendarPadding = () => {
    if (!radar) return 0;
    const [yStr, mStr] = period.split('-');
    const firstDay = new Date(Number(yStr), Number(mStr) - 1, 1).getDay();
    // In Sunday = 0 format, convert to Monday = 0
    return (firstDay + 6) % 7;
  };

  const selectedDeadline = radar?.deadlines.find((d) => d.day === selectedDay);

  return (
    <section className="space-y-5">
      {/* Top Header & Period Selector */}
      <div className="pos-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-full border border-pos-line bg-pos-surface p-1">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="rounded-full p-1.5 text-pos-ink/70 hover:bg-pos-tint"
              title="Previous Month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 font-mono text-[13px] font-semibold text-pos-ink">
              {new Date(`${period}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
            </span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="rounded-full p-1.5 text-pos-ink/70 hover:bg-pos-tint"
              title="Next Month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => loadRadar(period)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-pos-line px-3 py-1.5 text-[12px] text-pos-ink/70 hover:bg-pos-tint disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleDispatchReminders('ALL')}
            disabled={dispatching || loading || !radar || radar.summary.highRiskCount === 0}
            className="inline-flex items-center gap-2 rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white shadow-sm hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
            {dispatching ? 'Preparing Notices...' : 'Dispatch Chasers to At-Risk Clients'}
          </button>
        </div>
      </div>

      {/* Banner */}
      {banner && (
        <div
          role="status"
          className={`flex items-start gap-2.5 rounded-[12px] border p-3.5 text-[13px] ${
            banner.tone === 'ok'
              ? 'border-[#22a356]/20 bg-[#22a356]/10 text-[#15803d]'
              : 'border-[#dc2626]/20 bg-[#dc2626]/5 text-[#dc2626]'
          }`}
        >
          {banner.tone === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <div>{banner.text}</div>
        </div>
      )}

      {/* Practice Compliance KPI Cards */}
      {radar && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="pos-card p-3.5 border-l-4 border-l-pos-accent">
            <div className="text-[11px] font-medium tracking-wide text-pos-ink/50 uppercase">Practice Health</div>
            <div className="mt-1 font-mono text-[22px] font-semibold text-pos-ink">
              {radar.summary.complianceScore}%
            </div>
            <div className="mt-0.5 text-[11px] text-[#15803d] font-medium">Statutory On-Track</div>
          </div>
          <div className="pos-card p-3.5">
            <div className="text-[11px] font-medium tracking-wide text-pos-ink/50 uppercase">Active Entities</div>
            <div className="mt-1 font-mono text-[22px] font-semibold text-pos-ink">{radar.summary.totalClients}</div>
            <div className="mt-0.5 text-[11px] text-pos-ink/50">{radar.summary.totalGstins} GSTINs, {radar.summary.totalTans} TANs</div>
          </div>
          <div className="pos-card p-3.5 border-l-4 border-l-[#dc2626]">
            <div className="text-[11px] font-medium tracking-wide text-pos-ink/50 uppercase">Critical / High Risk</div>
            <div className="mt-1 font-mono text-[22px] font-semibold text-[#dc2626]">{radar.summary.highRiskCount}</div>
            <div className="mt-0.5 text-[11px] text-[#dc2626]/80 font-medium">Cutoff action needed</div>
          </div>
          <div className="pos-card p-3.5 border-l-4 border-l-[#f59e0b]">
            <div className="text-[11px] font-medium tracking-wide text-pos-ink/50 uppercase">Moderate Watch</div>
            <div className="mt-1 font-mono text-[22px] font-semibold text-[#b45309]">{radar.summary.mediumRiskCount}</div>
            <div className="mt-0.5 text-[11px] text-pos-ink/50">PMT-06 cash deposit</div>
          </div>
          <div className="pos-card p-3.5">
            <div className="text-[11px] font-medium tracking-wide text-pos-ink/50 uppercase">Clear / Filed</div>
            <div className="mt-1 font-mono text-[22px] font-semibold text-[#15803d]">{radar.summary.clearCount}</div>
            <div className="mt-0.5 text-[11px] text-pos-ink/50">Zero pending risks</div>
          </div>
          <div className="pos-card p-3.5">
            <div className="text-[11px] font-medium tracking-wide text-pos-ink/50 uppercase">IMS 14th Freeze</div>
            <div className="mt-1 font-mono text-[22px] font-semibold text-[#dc2626]">
              {radar.deadlines.find((d) => d.day === 14)?.pending || 0}
            </div>
            <div className="mt-0.5 text-[11px] text-pos-ink/50">Unactioned clients</div>
          </div>
        </div>
      )}

      {/* Main Heatmap & Detail Grid */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Calendar Heatmap (2 cols on desktop) */}
        <div className="pos-card p-4 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-pos-line pb-3">
            <div>
              <h2 className="text-[15px] font-semibold text-pos-ink">Statutory Compliance Calendar Heatmap</h2>
              <p className="text-[12px] text-pos-ink/55">
                Click any milestone day to view affected clients and dispatch targeted chasers.
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5 text-[#dc2626]">
                <span className="h-2 w-2 rounded-full bg-[#dc2626]" /> 14th IMS Cutoff
              </span>
              <span className="flex items-center gap-1.5 text-pos-accent">
                <span className="h-2 w-2 rounded-full bg-pos-accent" /> 20th 3B Return
              </span>
              <span className="flex items-center gap-1.5 text-pos-ink/60">
                <span className="h-2 w-2 rounded-full bg-pos-line" /> Normal
              </span>
            </div>
          </div>

          {/* Weekday Labels */}
          <div className="mt-3 grid grid-cols-7 gap-1 text-center font-mono text-[11px] font-semibold text-pos-ink/40">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Day Cells */}
          <div className="mt-1 grid grid-cols-7 gap-1.5">
            {/* Blank padding cells before 1st of month */}
            {Array.from({ length: calendarPadding() }).map((_, i) => (
              <div key={`pad-${i}`} className="h-20 rounded-[8px] bg-pos-tint/10" />
            ))}

            {/* Heatmap Day Cells */}
            {radar?.heatmap.map((d) => {
              const deadline = radar.deadlines.find((dl) => dl.day === d.day);
              const isSelected = selectedDay === d.day;
              const isCritical = d.urgency === 'CRITICAL';
              const isHigh = d.urgency === 'HIGH';

              return (
                <button
                  key={d.day}
                  type="button"
                  onClick={() => setSelectedDay(d.day)}
                  className={`relative flex h-20 flex-col justify-between rounded-[8px] border p-1.5 text-left transition-all ${
                    isSelected
                      ? 'border-pos-accent bg-pos-accent/10 shadow-sm ring-2 ring-pos-accent/40'
                      : isCritical
                      ? 'border-[#dc2626]/40 bg-[#dc2626]/5 hover:border-[#dc2626]'
                      : isHigh
                      ? 'border-[#f59e0b]/40 bg-[#f59e0b]/5 hover:border-[#f59e0b]'
                      : d.hasDeadline
                      ? 'border-pos-accent/30 bg-pos-surface hover:border-pos-accent'
                      : 'border-pos-line/60 bg-pos-surface/40 hover:bg-pos-tint/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-mono text-[12px] font-semibold ${isSelected ? 'text-pos-accent' : 'text-pos-ink'}`}>
                      {d.day}
                    </span>
                    {d.isToday && (
                      <span className="rounded bg-pos-accent px-1 text-[9px] font-semibold text-white uppercase">
                        Today
                      </span>
                    )}
                  </div>

                  {deadline && (
                    <div className="mt-0.5 space-y-0.5">
                      <div
                        className={`truncate rounded px-1 py-0.5 text-[10px] font-semibold leading-tight ${
                          deadline.status === 'COMPLETED'
                            ? 'bg-[#22a356]/15 text-[#15803d]'
                            : deadline.status === 'CRITICAL_ACTION_REQUIRED'
                            ? 'bg-[#dc2626]/20 text-[#dc2626]'
                            : deadline.status === 'OVERDUE'
                            ? 'bg-[#dc2626]/15 text-[#dc2626]'
                            : 'bg-pos-accent/15 text-pos-accent'
                        }`}
                      >
                        {deadline.obligation === 'IMS_ACTION'
                          ? '14th IMS Cutoff'
                          : deadline.obligation === 'GSTR3B'
                          ? '20th GSTR-3B'
                          : deadline.obligation === 'GSTR1'
                          ? '11th GSTR-1'
                          : '7th TDS Deposit'}
                      </div>
                      <div className="font-mono text-[9.5px] text-pos-ink/60">
                        {deadline.completed}/{deadline.totalDue} Done
                      </div>
                    </div>
                  )}

                  {!deadline && <div className="h-4" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Day / Milestone Deep Dive Panel */}
        <div className="pos-card flex flex-col justify-between p-4">
          <div>
            <div className="border-b border-pos-line pb-3">
              <span className="font-mono text-[11px] font-medium tracking-wide text-pos-ink/50 uppercase">
                Milestone Inspector
              </span>
              <h3 className="mt-0.5 text-[16px] font-semibold text-pos-ink">
                {selectedDeadline ? selectedDeadline.title : `Day ${selectedDay || '–'} Details`}
              </h3>
              {selectedDeadline && (
                <p className="mt-1 text-[12px] text-pos-ink/65">
                  <strong>Ground:</strong> {selectedDeadline.statutoryGround}
                </p>
              )}
            </div>

            {selectedDeadline ? (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between rounded-[8px] bg-pos-tint/40 p-2.5 text-[12px]">
                  <span className="text-pos-ink/70">Filing Status:</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      selectedDeadline.status === 'COMPLETED'
                        ? 'bg-[#22a356]/15 text-[#15803d]'
                        : selectedDeadline.status === 'CRITICAL_ACTION_REQUIRED'
                        ? 'bg-[#dc2626]/20 text-[#dc2626]'
                        : 'bg-pos-accent/15 text-pos-accent'
                    }`}
                  >
                    {selectedDeadline.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-semibold tracking-wide text-pos-ink/50 uppercase">
                    Affected Clients ({selectedDeadline.clients.length})
                  </div>
                  <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                    {selectedDeadline.clients.map((c) => (
                      <div key={c.entityId} className="rounded-[8px] border border-pos-line p-2 text-[12px]">
                        <div className="flex items-center justify-between font-medium text-pos-ink">
                          <span>{c.entityName}</span>
                          <span className="font-mono text-[11px] text-pos-ink/60">{c.reference}</span>
                        </div>
                        {c.note && (
                          <div className="mt-1 text-[11px] text-[#b45309]">{c.note}</div>
                        )}
                        <div className="mt-1 flex items-center justify-between text-[11px]">
                          <span
                            className={`font-semibold ${
                              ['FILED', 'VALIDATED', 'COMPLETED'].includes(c.status)
                                ? 'text-[#15803d]'
                                : 'text-[#dc2626]'
                            }`}
                          >
                            {c.status}
                          </span>
                          {c.amount && Number(c.amount) > 0 && (
                            <span className="font-mono text-pos-ink/70">Value: {inr(c.amount)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-[13px] text-pos-ink/50">
                No statutory deadline falls on this calendar day. Select the 7th, 11th, 14th, or 20th to inspect obligations.
              </div>
            )}
          </div>

          {selectedDeadline && selectedDeadline.pending > 0 && (
            <div className="mt-4 border-t border-pos-line pt-3">
              <button
                type="button"
                onClick={() => handleDispatchReminders(selectedDeadline.obligation)}
                disabled={dispatching}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white shadow-sm hover:opacity-95 disabled:opacity-40"
              >
                <MessageSquare className="h-4 w-4" />
                Dispatch {selectedDeadline.title.split(' ')[0]} Reminders ({selectedDeadline.pending})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* High-Risk Clients Action Table */}
      {radar && radar.riskEntities.length > 0 && (
        <div className="pos-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between border-b border-pos-line px-4 py-3">
            <div>
              <h2 className="text-[14px] font-semibold text-pos-ink">
                Practice Statutory Risk Radar & Automated Health Ranking
              </h2>
              <p className="text-[12px] text-pos-ink/55">
                Clients ranked by imminent statutory cutoff severity under Sections 38, 39, and 200.
              </p>
            </div>
            <span className="text-[12px] text-pos-ink/60 font-mono">
              {radar.riskEntities.filter((r) => r.riskLevel === 'HIGH').length} Critical Action(s)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-pos-tint/40">
                <tr>
                  <th className="px-3 py-2 text-left text-[12px] font-semibold text-pos-ink/60">Client Legal Name</th>
                  <th className="px-3 py-2 text-left text-[12px] font-semibold text-pos-ink/60">Risk Profile</th>
                  <th className="px-3 py-2 text-left text-[12px] font-semibold text-pos-ink/60">Pending Ground</th>
                  <th className="px-3 py-2 text-left text-[12px] font-semibold text-pos-ink/60">Pending Returns</th>
                  <th className="px-3 py-2 text-right text-[12px] font-semibold text-pos-ink/60">1-Click Action</th>
                </tr>
              </thead>
              <tbody>
                {radar.riskEntities.map((ent) => (
                  <tr key={ent.entityId} className="border-b border-pos-line hover:bg-pos-tint/20">
                    <td className="px-3 py-2.5 text-[13px] font-medium text-pos-ink">
                      {ent.name}
                    </td>
                    <td className="px-3 py-2.5 text-[12px]">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          ent.riskLevel === 'HIGH'
                            ? 'bg-[#dc2626]/10 text-[#dc2626] border border-[#dc2626]/20'
                            : ent.riskLevel === 'MEDIUM'
                            ? 'bg-[#f59e0b]/10 text-[#b45309] border border-[#f59e0b]/20'
                            : 'bg-[#22a356]/10 text-[#15803d] border border-[#22a356]/20'
                        }`}
                      >
                        {ent.riskLevel === 'HIGH' && <Flame className="h-3 w-3" />}
                        {ent.riskLevel} (Score {ent.riskScore})
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-pos-ink/75 max-w-md">
                      <ul className="list-inside list-disc space-y-0.5">
                        {ent.reasons.map((r, idx) => (
                          <li key={idx} className="truncate" title={r}>
                            {r}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-3 py-2.5 text-[12px]">
                      <div className="flex flex-wrap gap-1">
                        {ent.pendingObligations.map((o) => (
                          <span key={o} className="rounded bg-pos-ink/5 px-1.5 py-0.5 font-mono text-[11px] text-pos-ink/70">
                            {o}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {ent.contactPhone ? (
                        <a
                          href={`https://wa.me/${ent.contactPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                            `STATUTORY REMINDER from SynexTax for ${ent.name}: Pending compliance action required for ${period}. Ground: ${ent.reasons[0] || 'Statutory filing due.'}`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-pos-line bg-pos-surface px-2.5 py-1 text-[11.5px] font-medium text-pos-ink hover:bg-pos-tint"
                        >
                          <MessageSquare className="h-3 w-3 text-[#15803d]" /> WhatsApp Notice
                        </a>
                      ) : (
                        <span className="text-[11px] text-pos-ink/40">No Phone</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dispatched WhatsApp Click-to-Chat Modal / Drawer */}
      {dispatchResult && (
        <div className="pos-card space-y-3 p-4 border-2 border-pos-accent">
          <div className="flex items-center justify-between border-b border-pos-line pb-2.5">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-pos-ink">
              <Zap className="h-4 w-4 text-pos-accent" />
              Generated WhatsApp Click-to-Chat Compliance Links ({dispatchResult.count})
            </h3>
            <button
              type="button"
              onClick={() => setDispatchResult(null)}
              className="text-[12px] text-pos-ink/60 hover:text-pos-ink"
            >
              Dismiss
            </button>
          </div>
          <p className="text-[13px] text-pos-ink/70">
            Click any link below to open WhatsApp Web and send the verified statutory notice directly to the client signatory:
          </p>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {dispatchResult.notices.map((n) => (
              <div key={n.entityId} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-pos-line p-2.5 text-[12px]">
                <div>
                  <strong className="text-pos-ink">{n.clientName}</strong> ({n.obligation})
                  <div className="text-[11px] text-pos-ink/60 truncate max-w-xl">{n.noticeText}</div>
                </div>
                {n.whatsappUrl ? (
                  <a
                    href={n.whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#22a356] px-3 py-1 text-[12px] font-medium text-white hover:bg-[#15803d]"
                  >
                    Open WhatsApp <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-[11px] text-pos-ink/40">Missing Phone</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
