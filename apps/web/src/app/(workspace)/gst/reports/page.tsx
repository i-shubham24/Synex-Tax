'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Landmark,
  Layers,
  Printer,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { GstCommandBar } from '../../../../components/gst/GstCommandBar';
import { useWorkspace } from '../../../../workspace/WorkspaceContext';
import { useAuth } from '../../../../context/AuthContext';

type Tab = 'yearly3b' | 'ratewise1' | 'filed' | 'ledgers' | 'refund' | 'gstr9';

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'yearly3b', label: 'Yearly GSTR-3B Matrix', icon: FileText },
  { id: 'ratewise1', label: 'Rate-Wise GSTR-1', icon: Layers },
  { id: 'filed', label: 'Filed Cases Register', icon: ShieldCheck },
  { id: 'ledgers', label: 'Challan & Ledgers', icon: Landmark },
  { id: 'refund', label: 'Refund & Risk Check', icon: ShieldAlert },
  { id: 'gstr9', label: 'FY 2025-26 GSTR-9/9C', icon: FileSpreadsheet },
];

export default function GstReportsPage() {
  const { activeEntity, activeClient, activePeriod } = useWorkspace();
  const { authFetch } = useAuth();
  const gstin = activeClient?.gstin ?? activeEntity?.gstins[0]?.gstin ?? '03AABCS1429B1Z2';

  const defaultFy = Number(activePeriod.slice(5, 7)) >= 4 ? Number(activePeriod.slice(0, 4)) : Number(activePeriod.slice(0, 4)) - 1;
  const [fy, setFy] = useState<number>(defaultFy || 2025);
  const [tab, setTab] = useState<Tab>('yearly3b');
  const [suiteFilter, setSuiteFilter] = useState<'ALL' | 'GST' | 'TDS'>('ALL');
  const [rangeFrom, setRangeFrom] = useState(activePeriod);
  const [rangeTo, setRangeTo] = useState(activePeriod);

  const [yearlyData, setYearlyData] = useState<any | null>(null);
  const [rateWiseData, setRateWiseData] = useState<any | null>(null);
  const [filedCases, setFiledCases] = useState<any[]>([]);
  const [ledgersData, setLedgersData] = useState<any | null>(null);
  const [refundData, setRefundData] = useState<any | null>(null);
  const [gstr9Data, setGstr9Data] = useState<any | null>(null);
  const [ackCase, setAckCase] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadTab = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'yearly3b') {
        const r = await authFetch(`/api/v1/gst/${gstin}/reports/gstr3b-year?fy=${fy}`);
        const d = await r.json();
        if (!r.ok) setError(d.message || 'Could not load Yearly GSTR-3B summary.');
        else setYearlyData(d);
      } else if (tab === 'ratewise1') {
        const r = await authFetch(`/api/v1/gst/${gstin}/reports/gstr1-ratewise?from=${rangeFrom}&to=${rangeTo}`);
        const d = await r.json();
        if (!r.ok) setError(d.message || 'Could not load Rate-Wise GSTR-1 summary.');
        else setRateWiseData(d);
      } else if (tab === 'filed') {
        const r = await authFetch(`/api/v1/gst/reports/filed-cases?fy=${fy}&suite=${suiteFilter}`);
        const d = await r.json();
        if (!r.ok) setError(d.message || 'Could not load Filed Cases register.');
        else setFiledCases(d.cases || []);
      } else if (tab === 'ledgers') {
        const r = await authFetch(`/api/v1/gst/${gstin}/reports/ledgers?fy=${fy}`);
        const d = await r.json();
        if (!r.ok) setError(d.message || 'Could not load Challan and Ledger history.');
        else setLedgersData(d);
      } else if (tab === 'refund') {
        const r = await authFetch(`/api/v1/gst/${gstin}/reports/refund-risk?from=${rangeFrom}&to=${rangeTo}`);
        const d = await r.json();
        if (!r.ok) setError(d.message || 'Could not load Inverted-Duty Refund Risk report.');
        else setRefundData(d);
      } else if (tab === 'gstr9') {
        const r = await authFetch(`/api/v1/gst/${gstin}/reports/gstr9-workpaper?fy=${fy}`);
        const d = await r.json();
        if (!r.ok) setError(d.message || 'Could not load Annual GSTR-9/9C workpaper.');
        else setGstr9Data(d);
      }
    } catch {
      setError('Failed to connect to report service.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, fy, gstin, rangeFrom, rangeTo, suiteFilter, tab]);

  useEffect(() => {
    void loadTab();
  }, [loadTab]);

  const csvHref =
    tab === 'yearly3b'
      ? `/api/v1/gst/${gstin}/reports/gstr3b-year?fy=${fy}&format=csv`
      : tab === 'ratewise1'
        ? `/api/v1/gst/${gstin}/reports/gstr1-ratewise?from=${rangeFrom}&to=${rangeTo}&format=csv`
        : tab === 'filed'
          ? `/api/v1/gst/reports/filed-cases?fy=${fy}&suite=${suiteFilter}&format=csv`
          : tab === 'refund'
            ? `/api/v1/gst/${gstin}/reports/refund-risk?from=${rangeFrom}&to=${rangeTo}&format=csv`
            : tab === 'gstr9'
              ? `/api/v1/gst/${gstin}/reports/gstr9-workpaper?fy=${fy}&format=csv`
              : `/api/v1/gst/${gstin}/reports/ledgers?fy=${fy}&format=csv`;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <GstCommandBar currentStep="VALIDATED" />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pos-line bg-pos-surface p-4 shadow-sm">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-pos-ink">Smart-GST Reports &amp; Statutory Registers</h1>
          <p className="text-[12.5px] text-pos-ink/60">Yearly 3B reconciliation matrix, rate-wise GSTR-1 breakup, firm filed cases and cash/credit ledgers.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[12px] text-pos-ink/70 flex items-center gap-1.5">
            <span>FY Start:</span>
            <select
              value={fy}
              onChange={(e) => setFy(Number(e.target.value))}
              className="rounded-xl border border-pos-line bg-pos-surface px-2.5 py-1.5 text-[12px] font-semibold text-pos-ink"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  FY {y}-{String((y + 1) % 100).padStart(2, '0')}
                </option>
              ))}
            </select>
          </label>
          <a
            href={csvHref}
            download
            className="inline-flex items-center gap-1.5 rounded-xl border border-pos-line bg-pos-surface px-3 py-1.5 text-[12px] font-semibold text-pos-ink hover:bg-pos-muted"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel / CSV
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-pos-accent px-3 py-1.5 text-[12px] font-semibold text-white"
          >
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </button>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-pos-line pb-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors ${
              tab === t.id ? 'bg-pos-accent text-white' : 'bg-pos-surface border border-pos-line text-pos-ink/75 hover:bg-pos-muted'
            }`}
          >
            <t.icon className="h-4 w-4" />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-[13px] text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-pos-line bg-pos-surface p-8 text-center text-[13px] text-pos-ink/60">
          Loading report from PostgreSQL ledger...
        </div>
      ) : (
        <>
          {/* 1. Yearly GSTR-3B Summary */}
          {tab === 'yearly3b' && yearlyData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12.5px]">
                <div className="rounded-2xl border border-pos-line bg-pos-surface p-4">
                  <span className="text-pos-ink/60 block">GSTR-1 Output Tax</span>
                  <span className="text-[18px] font-bold font-mono tabular-nums">&#8377;{yearlyData.totals?.gstr1Tax}</span>
                </div>
                <div className="rounded-2xl border border-pos-line bg-pos-surface p-4">
                  <span className="text-pos-ink/60 block">GSTR-3B Declared</span>
                  <span className="text-[18px] font-bold font-mono tabular-nums">&#8377;{yearlyData.totals?.gstr3bTax}</span>
                </div>
                <div className="rounded-2xl border border-pos-line bg-pos-surface p-4">
                  <span className="text-pos-ink/60 block">2B vs 3B ITC Claimed</span>
                  <span className="text-[18px] font-bold font-mono tabular-nums">&#8377;{yearlyData.totals?.itc3b}</span>
                  <span className="text-[11px] text-pos-ink/50 block">2B Available: &#8377;{yearlyData.totals?.itc2b}</span>
                </div>
                <div className="rounded-2xl border border-pos-line bg-pos-surface p-4">
                  <span className="text-pos-ink/60 block">Total Cash Paid</span>
                  <span className="text-[18px] font-bold font-mono text-emerald-600 tabular-nums">&#8377;{yearlyData.totals?.cashPaid}</span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-pos-line bg-pos-surface shadow-sm">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="bg-[#141619] text-white text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-3">Period</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right">GSTR-1 Tax</th>
                      <th className="px-3 py-3 text-right">GSTR-3B Tax</th>
                      <th className="px-3 py-3 text-right">Out Diff</th>
                      <th className="px-3 py-3 text-right">2B ITC</th>
                      <th className="px-3 py-3 text-right">3B ITC</th>
                      <th className="px-3 py-3 text-right">Cash Paid</th>
                      <th className="px-3 py-3">ARN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pos-line">
                    {(yearlyData.months || []).map((m: any) => (
                      <tr key={m.period} className="hover:bg-pos-muted/40">
                        <td className="px-3 py-2.5 font-mono font-semibold">{m.period}</td>
                        <td className="px-3 py-2.5">{m.state}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">&#8377;{m.gstr1Tax}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">&#8377;{m.gstr3bTax}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">&#8377;{m.outputDifference}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">&#8377;{m.itc2b}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">&#8377;{m.itc3b}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">&#8377;{m.cashPaid}</td>
                        <td className="px-3 py-2.5 font-mono text-[11.5px]">{m.arn ?? 'Pending'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. Rate-Wise GSTR-1 Summary */}
          {tab === 'ratewise1' && rateWiseData && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-pos-line bg-pos-surface p-3 text-[12.5px]">
                <label className="flex items-center gap-1.5">
                  <span>From:</span>
                  <input type="month" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="rounded-lg border border-pos-line px-2 py-1 font-mono" />
                </label>
                <label className="flex items-center gap-1.5">
                  <span>To:</span>
                  <input type="month" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="rounded-lg border border-pos-line px-2 py-1 font-mono" />
                </label>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-pos-line bg-pos-surface shadow-sm">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="bg-[#141619] text-white text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-3">Rate Slab</th>
                      <th className="px-3 py-3 text-right">Docs</th>
                      <th className="px-3 py-3 text-right">Taxable Value</th>
                      <th className="px-3 py-3 text-right">IGST</th>
                      <th className="px-3 py-3 text-right">CGST</th>
                      <th className="px-3 py-3 text-right">SGST</th>
                      <th className="px-3 py-3 text-right">Cess</th>
                      <th className="px-3 py-3 text-right">Total Tax</th>
                      <th className="px-3 py-3">Sections (B2B/B2CL/B2CS/CDNR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pos-line">
                    {(rateWiseData.slabs || []).map((s: any) => (
                      <tr key={s.rateSlab} className="hover:bg-pos-muted/40">
                        <td className="px-3 py-2.5 font-semibold">{s.rateSlab === 'EXEMPT_NIL_NONGST' ? 'Exempt / Nil / Non-GST' : s.rateSlab}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{s.docCount}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">&#8377;{s.taxableValue}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">&#8377;{s.igst}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">&#8377;{s.cgst}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">&#8377;{s.sgst}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">&#8377;{s.cess}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">&#8377;{s.totalTax}</td>
                        <td className="px-3 py-2.5 font-mono text-[11.5px] text-pos-ink/70">
                          {s.sections?.B2B ?? 0} / {s.sections?.B2CL ?? 0} / {s.sections?.B2CS ?? 0} / {s.sections?.CDNR ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. Firm-Wide Filed Cases Register */}
          {tab === 'filed' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {(['ALL', 'GST', 'TDS'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSuiteFilter(s)}
                    className={`rounded-xl px-3 py-1.5 text-[12px] font-semibold ${
                      suiteFilter === s ? 'bg-pos-accent text-white' : 'border border-pos-line bg-pos-surface text-pos-ink/75'
                    }`}
                  >
                    {s === 'ALL' ? 'All Returns' : `${s} Only`}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto rounded-2xl border border-pos-line bg-pos-surface shadow-sm">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="bg-[#141619] text-white text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-3">Suite</th>
                      <th className="px-3 py-3">Form</th>
                      <th className="px-3 py-3">Client</th>
                      <th className="px-3 py-3">GSTIN / TAN</th>
                      <th className="px-3 py-3">Period</th>
                      <th className="px-3 py-3">Filing Date</th>
                      <th className="px-3 py-3">ARN / 15-Digit Token</th>
                      <th className="px-3 py-3">Signer</th>
                      <th className="px-3 py-3">Acknowledgment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pos-line">
                    {filedCases.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-pos-ink/50">No filing records found for the selected filter.</td>
                      </tr>
                    ) : (
                      filedCases.map((c) => (
                        <tr key={c.id} className="hover:bg-pos-muted/40">
                          <td className="px-3 py-2.5 font-semibold">{c.suite}</td>
                          <td className="px-3 py-2.5 font-mono font-semibold">{c.formType}</td>
                          <td className="px-3 py-2.5">{c.clientName}</td>
                          <td className="px-3 py-2.5 font-mono">{c.registrationNo}</td>
                          <td className="px-3 py-2.5 font-mono">{c.period}</td>
                          <td className="px-3 py-2.5 font-mono">{c.filingDate ?? c.workflowStatus}</td>
                          <td className="px-3 py-2.5 font-mono">{c.referenceNo ?? 'Draft'}</td>
                          <td className="px-3 py-2.5">{c.signerName ?? 'Unassigned'}</td>
                          <td className="px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => setAckCase(c)}
                              className="rounded-lg border border-pos-line px-2.5 py-1 text-[11.5px] font-semibold hover:bg-pos-muted"
                            >
                              View Ack
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. Challan, Cash & Credit Ledger History */}
          {tab === 'ledgers' && ledgersData && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-[12.5px]">
                <div className="rounded-2xl border border-pos-line bg-pos-surface p-4">
                  <span className="text-pos-ink/60 block">Electronic Cash Ledger</span>
                  <span className="text-[18px] font-bold font-mono tabular-nums">&#8377;{ledgersData.cashLedger?.closingBalance}</span>
                  <span className="text-[11px] text-pos-ink/50 block">Deposited: &#8377;{ledgersData.cashLedger?.depositedTotal}</span>
                </div>
                <div className="rounded-2xl border border-pos-line bg-pos-surface p-4">
                  <span className="text-pos-ink/60 block">Electronic Credit Ledger</span>
                  <span className="text-[18px] font-bold font-mono tabular-nums">&#8377;{ledgersData.creditLedger?.closingBalance}</span>
                  <span className="text-[11px] text-pos-ink/50 block">2B Accrued: &#8377;{ledgersData.creditLedger?.accruedFrom2b}</span>
                </div>
                <div className="rounded-2xl border border-pos-line bg-pos-surface p-4">
                  <span className="text-pos-ink/60 block">Electronic Credit Reclaim</span>
                  <span className="text-[18px] font-bold font-mono tabular-nums">
                    &#8377;{ledgersData.latestReclaimBalance
                      ? (
                          Number(ledgersData.latestReclaimBalance.closing_balance_igst) +
                          Number(ledgersData.latestReclaimBalance.closing_balance_cgst) +
                          Number(ledgersData.latestReclaimBalance.closing_balance_sgst)
                        ).toFixed(2)
                      : '0.00'}
                  </span>
                </div>
                <div className="rounded-2xl border border-pos-line bg-pos-surface p-4">
                  <span className="text-pos-ink/60 block">RCM ITC Eligible Balance</span>
                  <span className="text-[18px] font-bold font-mono tabular-nums">
                    &#8377;{ledgersData.latestRcmBalance
                      ? (
                          Number(ledgersData.latestRcmBalance.closing_rcm_eligible_igst) +
                          Number(ledgersData.latestRcmBalance.closing_rcm_eligible_cgst) +
                          Number(ledgersData.latestRcmBalance.closing_rcm_eligible_sgst)
                        ).toFixed(2)
                      : '0.00'}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-pos-line bg-pos-surface shadow-sm">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="bg-[#141619] text-white text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-3">Period</th>
                      <th className="px-3 py-3">CPIN</th>
                      <th className="px-3 py-3">Challan Date</th>
                      <th className="px-3 py-3">Reason</th>
                      <th className="px-3 py-3 text-right">IGST Cash</th>
                      <th className="px-3 py-3 text-right">CGST Cash</th>
                      <th className="px-3 py-3 text-right">SGST Cash</th>
                      <th className="px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pos-line">
                    {(ledgersData.pmt06Challans || []).length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-pos-ink/50">No PMT-06 challan deposits recorded for {ledgersData.fy}.</td>
                      </tr>
                    ) : (
                      ledgersData.pmt06Challans.map((ch: any) => (
                        <tr key={ch.id} className="hover:bg-pos-muted/40">
                          <td className="px-3 py-2.5 font-mono">{ch.return_period}</td>
                          <td className="px-3 py-2.5 font-mono font-semibold">{ch.cpin}</td>
                          <td className="px-3 py-2.5 font-mono">{ch.challan_date}</td>
                          <td className="px-3 py-2.5">{ch.reason}</td>
                          <td className="px-3 py-2.5 text-right font-mono">&#8377;{ch.igst_cash}</td>
                          <td className="px-3 py-2.5 text-right font-mono">&#8377;{ch.cgst_cash}</td>
                          <td className="px-3 py-2.5 text-right font-mono">&#8377;{ch.sgst_cash}</td>
                          <td className="px-3 py-2.5 font-semibold">{ch.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. Inverted-Duty & Provisional Refund Risk Check */}
          {tab === 'refund' && refundData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12.5px]">
                <div className="rounded-2xl border border-pos-line bg-pos-surface p-4">
                  <span className="text-pos-ink/60 block">Eligible 90% Provisional Refund</span>
                  <span className="text-[18px] font-bold font-mono text-emerald-600 tabular-nums">&#8377;{Number(refundData.breakdown?.provisional90PercentRefund ?? 0).toLocaleString('en-IN')}</span>
                  <span className="text-[11px] text-pos-ink/50 block">{refundData.provisionalSanctionEligible ? 'System risk check clean' : 'Blocked rows or flags'}</span>
                </div>
                <div className="rounded-2xl border border-pos-line bg-pos-surface p-4">
                  <span className="text-pos-ink/60 block">Input Goods ITC</span>
                  <span className="text-[18px] font-bold font-mono tabular-nums">&#8377;{Number(refundData.breakdown?.inputGoodsEligibleItc ?? 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="rounded-2xl border border-pos-line bg-pos-surface p-4">
                  <span className="text-pos-ink/60 block">Post-Nov 1 Input Services ITC</span>
                  <span className="text-[18px] font-bold font-mono text-pos-accent tabular-nums">&#8377;{Number(refundData.breakdown?.postNov1ServicesEligibleItc ?? 0).toLocaleString('en-IN')}</span>
                  <span className="text-[11px] text-amber-600 block">Excluded pre-Nov 1 services: &#8377;{Number(refundData.breakdown?.preNov1ServicesExcludedItc ?? 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="rounded-2xl border border-pos-line bg-pos-surface p-4">
                  <span className="text-pos-ink/60 block">Unmatched / Blocked 2B Invoices</span>
                  <span className="text-[18px] font-bold font-mono text-red-600 tabular-nums">{refundData.blockedRows?.length ?? 0}</span>
                  <span className="text-[11px] text-pos-ink/50 block">LUT: {refundData.lutStatus?.status ?? 'MISSING'}{refundData.lutStatus?.lutArn ? ` (${refundData.lutStatus.lutArn})` : ''}</span>
                </div>
              </div>

              {Array.isArray(refundData.riskFlags) && refundData.riskFlags.length > 0 && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-1.5">
                  <h4 className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" /> System Risk Checks (Nov 1, 2026 Rules)
                  </h4>
                  <ul className="list-disc pl-5 text-[12px] text-pos-ink/80 space-y-1">
                    {refundData.riskFlags.map((flag: { code: string; severity: string; message: string }, idx: number) => (
                      <li key={`${flag.code}-${idx}`}>
                        <span className="font-mono font-semibold">[{flag.severity}]</span> {flag.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="overflow-x-auto rounded-2xl border border-pos-line bg-pos-surface shadow-sm">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="bg-[#141619] text-white text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-3">Vendor GSTIN</th>
                      <th className="px-3 py-3">Invoice No.</th>
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3">Input Type</th>
                      <th className="px-3 py-3 text-right">Blocked ITC</th>
                      <th className="px-3 py-3">Exclusion Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pos-line">
                    {(refundData.blockedRows || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-emerald-600 font-medium">
                          All eligible purchase invoices matched GSTR-2B for {refundData.periodFrom} to {refundData.periodTo}.
                        </td>
                      </tr>
                    ) : (
                      refundData.blockedRows.map((row: any, idx: number) => (
                        <tr key={`${row.invoiceNum}-${idx}`} className="hover:bg-pos-muted/40">
                          <td className="px-3 py-2.5 font-mono">{row.vendorGstin}</td>
                          <td className="px-3 py-2.5 font-mono font-semibold">{row.invoiceNum}</td>
                          <td className="px-3 py-2.5 font-mono">{row.invoiceDate}</td>
                          <td className="px-3 py-2.5 font-semibold">{row.inputType}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-red-600">&#8377;{Number(row.taxAmount ?? 0).toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2.5 text-pos-ink/75">{row.reason}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. FY 2025-26 GSTR-9 / 9C Annual Workpaper */}
          {tab === 'gstr9' && gstr9Data && (() => {
            const months: any[] = gstr9Data.monthlyVariances || [];
            const sumField = (k: string) => months.reduce((acc, m) => acc + Number(m[k] ?? 0), 0);
            const g1Total = sumField('gstr1Tax');
            const g3bTotal = sumField('gstr3bTax');
            const g2bItc = sumField('gstr2bItc');
            const g3bItc = sumField('gstr3bItc');
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12.5px]">
                  <div className="rounded-2xl border border-pos-line bg-pos-surface p-4">
                    <span className="text-pos-ink/60 block">Table 4 Outward Tax (GSTR-1 vs 3B)</span>
                    <span className="text-[18px] font-bold font-mono tabular-nums">&#8377;{g1Total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-[11px] text-pos-ink/50 block">3B Outward: &#8377;{g3bTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="rounded-2xl border border-pos-line bg-pos-surface p-4">
                    <span className="text-pos-ink/60 block">Table 6 / 8 GSTR-2B Available ITC</span>
                    <span className="text-[18px] font-bold font-mono tabular-nums">&#8377;{g2bItc.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-[11px] text-pos-ink/50 block">3B Claimed: &#8377;{g3bItc.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="rounded-2xl border border-pos-line bg-pos-surface p-4">
                    <span className="text-pos-ink/60 block">Outward Variance (1 minus 3B)</span>
                    <span className="text-[18px] font-bold font-mono tabular-nums">&#8377;{(g1Total - g3bTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="rounded-2xl border border-pos-line bg-pos-surface p-4">
                    <span className="text-pos-ink/60 block">ITC Variance (3B minus 2B)</span>
                    <span className="text-[18px] font-bold font-mono tabular-nums">&#8377;{(g3bItc - g2bItc).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-[11px] text-pos-ink/50 block">FY {gstr9Data.financialYear ?? `${fy}-${String((fy + 1) % 100).padStart(2, '0')}`} Annual Prep</span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-pos-line bg-pos-surface shadow-sm">
                  <table className="w-full text-left text-[12.5px]">
                    <thead className="bg-[#141619] text-white text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-3">Period</th>
                        <th className="px-3 py-3 text-right">GSTR-1 Tax</th>
                        <th className="px-3 py-3 text-right">GSTR-3B Outward</th>
                        <th className="px-3 py-3 text-right">Out Diff</th>
                        <th className="px-3 py-3 text-right">GSTR-2B ITC</th>
                        <th className="px-3 py-3 text-right">GSTR-3B ITC</th>
                        <th className="px-3 py-3 text-right">ITC Diff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-pos-line">
                      {months.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-pos-ink/50">No monthly return rows found for FY {fy}.</td>
                        </tr>
                      ) : (
                        months.map((m: any) => (
                          <tr key={m.period} className="hover:bg-pos-muted/40">
                            <td className="px-3 py-2.5 font-mono font-semibold">{m.period}</td>
                            <td className="px-3 py-2.5 text-right font-mono">&#8377;{Number(m.gstr1Tax ?? 0).toLocaleString('en-IN')}</td>
                            <td className="px-3 py-2.5 text-right font-mono">&#8377;{Number(m.gstr3bTax ?? 0).toLocaleString('en-IN')}</td>
                            <td className="px-3 py-2.5 text-right font-mono">&#8377;{Number(m.outwardVariance ?? 0).toLocaleString('en-IN')}</td>
                            <td className="px-3 py-2.5 text-right font-mono">&#8377;{Number(m.gstr2bItc ?? 0).toLocaleString('en-IN')}</td>
                            <td className="px-3 py-2.5 text-right font-mono">&#8377;{Number(m.gstr3bItc ?? 0).toLocaleString('en-IN')}</td>
                            <td className="px-3 py-2.5 text-right font-mono">&#8377;{Number(m.itcVariance ?? 0).toLocaleString('en-IN')}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {ackCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-pos-line bg-pos-surface p-6 shadow-xl space-y-3 text-pos-ink">
            <div className="flex items-center justify-between border-b border-pos-line pb-2">
              <h3 className="text-[15px] font-semibold">Filing Acknowledgment Receipt</h3>
              <button type="button" onClick={() => setAckCase(null)} aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <dl className="space-y-1.5 text-[12.5px]">
              <div className="flex justify-between"><dt className="text-pos-ink/60">Client:</dt><dd className="font-semibold">{ackCase.clientName}</dd></div>
              <div className="flex justify-between"><dt className="text-pos-ink/60">Registration:</dt><dd className="font-mono">{ackCase.registrationNo}</dd></div>
              <div className="flex justify-between"><dt className="text-pos-ink/60">Form &amp; Period:</dt><dd className="font-mono">{ackCase.formType} ({ackCase.period})</dd></div>
              <div className="flex justify-between"><dt className="text-pos-ink/60">ARN / Token:</dt><dd className="font-mono font-bold text-pos-accent">{ackCase.referenceNo ?? 'Pending generation'}</dd></div>
              <div className="flex justify-between"><dt className="text-pos-ink/60">Signatory:</dt><dd>{ackCase.signerName ?? 'Partner signoff'}</dd></div>
              <div className="flex justify-between"><dt className="text-pos-ink/60">Figures:</dt><dd>{ackCase.ackSummary}</dd></div>
            </dl>
            <div className="flex justify-end gap-2 pt-2 border-t border-pos-line">
              <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-xl bg-pos-accent px-3 py-1.5 text-[12px] font-semibold text-white">
                <Printer className="h-3.5 w-3.5" /> Print Acknowledgment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
