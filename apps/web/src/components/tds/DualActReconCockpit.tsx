'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  FileCheck2,
  AlertTriangle,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingDown,
  RefreshCw,
  Sparkles,
  ExternalLink,
  ChevronDown,
  Building2,
  Layers,
  FileText,
} from 'lucide-react';
import type { DualActReconciliationReport } from '@synextax/tax-engine';

interface DualActReconCockpitProps {
  tan: string;
  entityName: string;
  taxYear: number;
  quarter: string;
  authToken: string | null;
}

export function DualActReconCockpit({
  tan,
  entityName,
  taxYear,
  quarter,
  authToken,
}: DualActReconCockpitProps) {
  const [report, setReport] = useState<DualActReconciliationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideRegime, setOverrideRegime] = useState<'IT_ACT_2025' | 'IT_ACT_1961'>('IT_ACT_2025');
  const [showFileModal, setShowFileModal] = useState(false);
  const [fileText, setFileText] = useState('');
  const [activeTab, setActiveTab] = useState<'deductees' | 'challans' | 'sections' | 'corrections'>('deductees');
  const [correctionFeedback, setCorrectionFeedback] = useState<string | null>(null);
  const [autoCorrecting, setAutoCorrecting] = useState(false);

  const quarterNumber = parseInt(quarter.replace('Q', ''), 10) || 3;

  const loadReconciliation = async (customText?: string) => {
    setLoading(true);
    setError(null);
    setCorrectionFeedback(null);
    try {
      const csrfRes = await fetch('/api/v1/auth/csrf');
      const { csrfToken } = await csrfRes.json();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch('/api/v1/tds/dual-act-recon/analyze', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          text: customText || undefined,
          tan: !customText ? tan : undefined,
          taxYear,
          quarter: quarterNumber,
          overrideRegime,
        }),
      });

      const json = await res.json();
      if (json.success && json.report) {
        setReport(json.report);
        if (customText) setShowFileModal(false);
      } else {
        setError(json.message || 'Unable to generate dual-act reconciliation report.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to communicate with reconciliation engine.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReconciliation();
  }, [tan, taxYear, quarter, overrideRegime]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setFileText(content);
        loadReconciliation(content);
      }
    };
    reader.readAsText(file);
  };

  const handleAutoCorrect = async () => {
    if (!report) return;
    setAutoCorrecting(true);
    setCorrectionFeedback(null);
    try {
      const csrfRes = await fetch('/api/v1/auth/csrf');
      const { csrfToken } = await csrfRes.json();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch('/api/v1/tds/dual-act-recon/auto-correct', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          text: fileText || undefined,
          title: `Auto Dual-Act Remap ${report.tan} ${quarter}`,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setCorrectionFeedback(json.message || 'Batch correction draft successfully generated.');
        setActiveTab('corrections');
      } else {
        alert(json.message || 'Failed to auto-generate corrections.');
      }
    } catch (err: any) {
      alert('Error during auto-correction: ' + err.message);
    } finally {
      setAutoCorrecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Banner */}
      <div className="bg-pos-surface border border-pos-line rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-pos-muted border border-pos-line text-pos-accent">
                Milestone 5
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
                Direct Tax Code Dual-Act Engine
              </span>
            </div>
            <h2 className="text-lg font-semibold text-pos-ink tracking-tight">
              TRACES Conso Auto-Ingestion & Dual-Act 2025 Reconciliation
            </h2>
            <p className="text-xs text-pos-ink/70">
              Cross-reconciles 1961 Act sections vs 2025 Act rules, detects Section 206AA non-PAN 20% exposure, calculates Section 201(1A) delay interest, and tracks surplus challan balances.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Regime Toggle */}
            <div className="flex items-center p-1 rounded-lg bg-pos-muted border border-pos-line text-xs font-semibold">
              <button
                onClick={() => setOverrideRegime('IT_ACT_2025')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  overrideRegime === 'IT_ACT_2025'
                    ? 'bg-pos-accent text-white font-semibold shadow-sm'
                    : 'text-pos-ink/60 hover:text-pos-ink'
                }`}
              >
                2025 Act Rules
              </button>
              <button
                onClick={() => setOverrideRegime('IT_ACT_1961')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  overrideRegime === 'IT_ACT_1961'
                    ? 'bg-pos-accent text-white font-semibold shadow-sm'
                    : 'text-pos-ink/60 hover:text-pos-ink'
                }`}
              >
                1961 Act Rules
              </button>
            </div>

            {/* Ingest TRACES Conso Button */}
            <button
              onClick={() => setShowFileModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-pos-muted hover:bg-pos-surface border border-pos-line text-xs font-semibold text-pos-ink flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <UploadCloud className="w-3.5 h-3.5 text-pos-accent" />
              <span>Ingest TRACES .conso</span>
            </button>

            {/* Reload Data Button */}
            <button
              onClick={() => loadReconciliation(fileText || undefined)}
              disabled={loading}
              className="p-2 rounded-lg bg-pos-muted hover:bg-pos-surface border border-pos-line text-pos-ink/70 hover:text-pos-ink shadow-sm transition-colors"
              title="Refresh Dual-Act Analysis"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {correctionFeedback && (
          <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-700">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold">{correctionFeedback}</span>
            </div>
            <span className="text-[12px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-600 text-white">
              C1 / C2 / C3 Ready
            </span>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-xs text-rose-700">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* KPI Cards Grid */}
      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Challan Deposits & Surplus */}
          <div className="bg-pos-surface border border-pos-line rounded-xl p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-pos-ink/60">
              <span>Challans Deposited</span>
              <FileSpreadsheet className="w-4 h-4 text-[#3A6FE8]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold font-mono text-pos-ink tabular-nums">
                ₹{Number(report.metrics.totalChallanDeposit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[12px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
                ₹{Number(report.metrics.totalUnconsumedSurplus).toLocaleString('en-IN', { minimumFractionDigits: 2 })} Surplus
              </span>
              <span className="text-[12px] text-pos-ink/60">across {report.metrics.totalChallans} challans</span>
            </div>
          </div>

          {/* Card 2: Short Deduction */}
          <div className="bg-pos-surface border border-pos-line rounded-xl p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-pos-ink/60">
              <span>Short Deduction Exposure</span>
              <ShieldAlert className="w-4 h-4 text-rose-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold font-mono text-rose-600 tabular-nums">
                ₹{Number(report.metrics.totalShortDeduction).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[12px] font-mono font-semibold px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-600">
                {report.metrics.criticalRiskCount} Critical Risks
              </span>
              <span className="text-[12px] text-pos-ink/60">Sec 206AA non-PAN 20%</span>
            </div>
          </div>

          {/* Card 3: Section 201(1A) Interest */}
          <div className="bg-pos-surface border border-pos-line rounded-xl p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-pos-ink/60">
              <span>Sec 201(1A) Delay Interest</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold font-mono text-amber-600 tabular-nums">
                ₹{Number(report.metrics.totalSection201Interest).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center gap-1.5 pt-1 text-[12px] text-pos-ink/60 font-mono">
              <span>Ded: ₹{report.metrics.totalLateDeductionInterest} (1%)</span>
              <span>•</span>
              <span>Dep: ₹{report.metrics.totalLateDepositInterest} (1.5%)</span>
            </div>
          </div>

          {/* Card 4: Net Demand Exposure & Auto-Correct Trigger */}
          <div className="bg-pos-surface border border-pos-line rounded-xl p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-pos-ink/60">
              <span>Net TRACES Demand Risk</span>
              <TrendingDown className="w-4 h-4 text-rose-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold font-mono text-rose-700 tabular-nums">
                ₹{Number(report.metrics.netTracesDemandRisk).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <button
              onClick={handleAutoCorrect}
              disabled={autoCorrecting}
              className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-pos-accent hover:bg-pos-accent/90 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{autoCorrecting ? 'Generating...' : '1-Click Auto-Correct'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Tabs Row */}
      <div className="flex items-center gap-2 border-b border-pos-line pb-2">
        <button
          onClick={() => setActiveTab('deductees')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            activeTab === 'deductees'
              ? 'bg-pos-muted text-pos-ink border border-pos-line shadow-sm'
              : 'text-pos-ink/60 hover:text-pos-ink'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>High-Risk Payees ({report?.highRiskDeductees.length ?? 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('challans')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            activeTab === 'challans'
              ? 'bg-pos-muted text-pos-ink border border-pos-line shadow-sm'
              : 'text-pos-ink/60 hover:text-pos-ink'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Challan Ledger & Surplus ({report?.challans.length ?? 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('sections')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            activeTab === 'sections'
              ? 'bg-pos-muted text-pos-ink border border-pos-line shadow-sm'
              : 'text-pos-ink/60 hover:text-pos-ink'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Dual-Act Section Comparison ({report?.sectionSummary.length ?? 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('corrections')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            activeTab === 'corrections'
              ? 'bg-pos-muted text-pos-ink border border-pos-line shadow-sm'
              : 'text-pos-ink/60 hover:text-pos-ink'
          }`}
        >
          <FileCheck2 className="w-3.5 h-3.5" />
          <span>Recommended Corrections (C1/C2/C3)</span>
        </button>
      </div>

      {/* Tab 1: High-Risk Payees Table */}
      {activeTab === 'deductees' && report && (
        <div className="bg-pos-surface border border-pos-line rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-pos-line flex items-center justify-between">
            <h3 className="text-xs font-semibold text-pos-ink">
              Payee Statutory Shortfall & Section 201(1A) Delay Audit
            </h3>
            <span className="text-[12px] text-pos-ink/60 font-mono">
              Rule 119A Statutory Month Counting Applied
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-pos-line bg-pos-muted text-pos-ink/60 font-medium">
                  <th className="py-2.5 px-3">Rec #</th>
                  <th className="py-2.5 px-3">Payee / PAN</th>
                  <th className="py-2.5 px-3">Section (1961 vs 2025)</th>
                  <th className="py-2.5 px-3 text-right">Payment Gross</th>
                  <th className="py-2.5 px-3 text-right">Tax Deducted</th>
                  <th className="py-2.5 px-3 text-center">Rate (Applied / Stat)</th>
                  <th className="py-2.5 px-3 text-right">Shortfall (INR)</th>
                  <th className="py-2.5 px-3 text-right">201(1A) Interest</th>
                  <th className="py-2.5 px-3">Remedy / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pos-line font-mono tabular-nums text-pos-ink">
                {report.highRiskDeductees.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-pos-ink/60 font-sans">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                        <span className="font-semibold text-xs text-pos-ink">100% Statutory Compliance</span>
                        <span className="text-[12px] text-pos-ink/60">Zero short deductions and zero PAN discrepancies detected in this statement.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  report.highRiskDeductees.map((d) => (
                    <tr key={d.recordNo} className="hover:bg-pos-muted/40 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-pos-ink/70">{d.recordNo}</td>
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-semibold text-pos-ink">{d.name}</div>
                        <div className="flex items-center gap-1 font-mono text-[12px] text-pos-accent">
                          <span>{d.pan}</span>
                          {d.panStatus === 'LITERAL_MISSING' && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-600 font-semibold text-[12px]">
                              NO PAN
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <div className="text-[12px] font-semibold text-pos-ink">
                          {d.section1961} → {d.section2025}
                        </div>
                        <div className="text-[12px] text-pos-ink/60 truncate max-w-[180px]">{d.nature}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right">₹{Number(d.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2.5 px-3 text-right font-semibold">₹{Number(d.deducted).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="text-pos-ink/60">{d.appliedRate}</span>
                        <span className="text-pos-ink/60 mx-1">/</span>
                        <span className="font-semibold text-rose-600">{d.statutoryRate}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-rose-600">
                        ₹{Number(d.shortDeductionAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right text-amber-600 font-semibold">
                        ₹{Number(d.totalInterest201).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-[12px] text-pos-ink/80 max-w-[200px]">
                        {d.suggestedAction}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Challan Ledger & Surplus Table */}
      {activeTab === 'challans' && report && (
        <div className="bg-pos-surface border border-pos-line rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-pos-line flex items-center justify-between">
            <h3 className="text-xs font-semibold text-pos-ink">
              Challan Utilization & Unconsumed Surplus Balance Ledger
            </h3>
            <span className="text-[12px] text-emerald-600 font-semibold font-mono">
              Total Surplus: ₹{report.metrics.totalUnconsumedSurplus}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-pos-line bg-pos-muted text-pos-ink/60 font-medium">
                  <th className="py-2.5 px-3">Challan #</th>
                  <th className="py-2.5 px-3">BSR Code</th>
                  <th className="py-2.5 px-3">Deposit Date</th>
                  <th className="py-2.5 px-3">Head</th>
                  <th className="py-2.5 px-3 text-right">Challan Total</th>
                  <th className="py-2.5 px-3 text-right">Tax Component</th>
                  <th className="py-2.5 px-3 text-right">Allocated to Payees</th>
                  <th className="py-2.5 px-3 text-right">Surplus Balance</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pos-line font-mono tabular-nums text-pos-ink">
                {report.challans.map((c) => (
                  <tr key={c.recordNo} className="hover:bg-pos-muted/40 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-pos-ink">{c.challanNo}</td>
                    <td className="py-2.5 px-3 text-pos-accent">{c.bsr}</td>
                    <td className="py-2.5 px-3">{c.date}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.5 rounded bg-pos-muted text-[12px] font-semibold">
                        {c.minorHead === '0020' ? '0020 (Company)' : '0021 (Non-Co)'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold">
                      ₹{Number(c.totalChallanAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      ₹{Number(c.totalTax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right text-pos-ink/70">
                      ₹{Number(c.totalAllocatedToDeductees).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-600">
                      ₹{Number(c.unconsumedSurplus).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-center font-sans">
                      {c.status === 'SURPLUS_AVAILABLE' && (
                        <span className="px-2 py-0.5 rounded-full text-[12px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          Surplus Available
                        </span>
                      )}
                      {c.status === 'FULLY_CONSUMED' && (
                        <span className="px-2 py-0.5 rounded-full text-[12px] font-semibold bg-pos-muted text-pos-ink/70 border border-pos-line">
                          Fully Consumed
                        </span>
                      )}
                      {c.status === 'OVER_ALLOCATED' && (
                        <span className="px-2 py-0.5 rounded-full text-[12px] font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                          Over Allocated
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Dual-Act Section Comparison Matrix */}
      {activeTab === 'sections' && report && (
        <div className="bg-pos-surface border border-pos-line rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-pos-line flex items-center justify-between">
            <h3 className="text-xs font-semibold text-pos-ink">
              Direct Tax Code Dual-Act Section Mapping & Transition Analysis
            </h3>
            <span className="text-[12px] text-pos-ink/60">
              Form 26Q (1961 Act) to Form 140 (2025 Act) Equivalents
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-pos-line bg-pos-muted text-pos-ink/60 font-medium">
                  <th className="py-2.5 px-3">1961 Section</th>
                  <th className="py-2.5 px-3">2025 Act Code</th>
                  <th className="py-2.5 px-3">Nature of Payment</th>
                  <th className="py-2.5 px-3 text-center">Payees</th>
                  <th className="py-2.5 px-3 text-right">Total Gross</th>
                  <th className="py-2.5 px-3 text-right">Tax Deducted</th>
                  <th className="py-2.5 px-3 text-right">Shortfall</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pos-line font-mono tabular-nums text-pos-ink">
                {report.sectionSummary.map((s, idx) => (
                  <tr key={idx} className="hover:bg-pos-muted/40 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-pos-accent">{s.section1961}</td>
                    <td className="py-2.5 px-3 font-semibold text-emerald-600">{s.section2025}</td>
                    <td className="py-2.5 px-3 font-sans text-pos-ink/80">{s.nature}</td>
                    <td className="py-2.5 px-3 text-center">{s.deducteeCount}</td>
                    <td className="py-2.5 px-3 text-right">₹{Number(s.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right font-semibold">₹{Number(s.totalDeducted).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-rose-600">
                      ₹{Number(s.shortfall).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Recommended Corrections (C1, C2, C3) */}
      {activeTab === 'corrections' && report && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* C1 Column */}
            <div className="bg-pos-surface border border-pos-line rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-pos-line pb-2">
                <span className="text-xs font-semibold text-pos-ink">C1: Deductor Details</span>
                <span className="text-[12px] font-mono px-2 py-0.5 rounded bg-pos-muted text-pos-ink/70">
                  {report.recommendedCorrections.c1Deductor.length} Actions
                </span>
              </div>
              {report.recommendedCorrections.c1Deductor.length === 0 ? (
                <p className="text-xs text-emerald-600 flex items-center gap-1.5 py-4">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Deductor profile & batch headers valid.</span>
                </p>
              ) : (
                <div className="space-y-2">
                  {report.recommendedCorrections.c1Deductor.map((c, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-pos-muted/60 border border-pos-line space-y-1 text-xs">
                      <div className="font-semibold text-rose-600 font-mono">{c.field}</div>
                      <div className="text-pos-ink/70">{c.issue}</div>
                      <div className="text-[12px] text-pos-accent font-semibold pt-1">{c.remedy}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* C2 Column */}
            <div className="bg-pos-surface border border-pos-line rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-pos-line pb-2">
                <span className="text-xs font-semibold text-pos-ink">C2: Challan Adjustments</span>
                <span className="text-[12px] font-mono px-2 py-0.5 rounded bg-pos-muted text-pos-ink/70">
                  {report.recommendedCorrections.c2Challans.length} Actions
                </span>
              </div>
              {report.recommendedCorrections.c2Challans.length === 0 ? (
                <p className="text-xs text-emerald-600 flex items-center gap-1.5 py-4">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>All challans cleanly consumed.</span>
                </p>
              ) : (
                <div className="space-y-2">
                  {report.recommendedCorrections.c2Challans.map((c, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-pos-muted/60 border border-pos-line space-y-1 text-xs">
                      <div className="font-semibold text-emerald-600 font-mono">Challan #{c.challanNo} (BSR {c.bsr})</div>
                      <div className="text-pos-ink/70">{c.issue}</div>
                      <div className="text-[12px] text-pos-accent font-semibold pt-1">{c.remedy}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* C3 Column */}
            <div className="bg-pos-surface border border-pos-line rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-pos-line pb-2">
                <span className="text-xs font-semibold text-pos-ink">C3: Deductee & PAN Updates</span>
                <span className="text-[12px] font-mono px-2 py-0.5 rounded bg-pos-muted text-pos-ink/70">
                  {report.recommendedCorrections.c3Deductees.length} Actions
                </span>
              </div>
              {report.recommendedCorrections.c3Deductees.length === 0 ? (
                <p className="text-xs text-emerald-600 flex items-center gap-1.5 py-4">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Zero deductee adjustments needed.</span>
                </p>
              ) : (
                <div className="space-y-2">
                  {report.recommendedCorrections.c3Deductees.map((c, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-pos-muted/60 border border-pos-line space-y-1 text-xs">
                      <div className="font-semibold text-rose-600 font-mono">Row #{c.recordNo} ({c.pan})</div>
                      <div className="text-pos-ink/70">{c.issue}</div>
                      <div className="text-[12px] text-pos-accent font-semibold pt-1">{c.remedy}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ingest Modal */}
      {showFileModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-pos-surface border border-pos-line rounded-xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <h3 className="font-semibold text-sm text-pos-ink">Ingest TRACES Consolidated (.conso) File</h3>
              <button
                onClick={() => setShowFileModal(false)}
                className="text-pos-ink/60 hover:text-pos-ink text-xs"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-pos-ink/70">
                Upload or paste the consolidated file downloaded from TRACES (or return file). The engine will automatically parse all challans and payees, map sections to the 2025 Act, and check Section 201(1A) delay interest.
              </p>

              <label className="border-2 border-dashed border-pos-line hover:border-pos-accent rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors bg-pos-muted/30">
                <UploadCloud className="w-6 h-6 text-pos-accent" />
                <span className="text-xs font-semibold text-pos-ink">Click to browse or drop .conso / .txt file</span>
                <span className="text-[12px] text-pos-ink/60">Protean FH/BH/CD/DD record format supported</span>
                <input
                  type="file"
                  accept=".txt,.conso"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              <div className="space-y-1">
                <label className="text-[12px] font-semibold text-pos-ink/60">Or paste raw statement text</label>
                <textarea
                  rows={4}
                  value={fileText}
                  onChange={(e) => setFileText(e.target.value)}
                  placeholder="Paste raw TRACES consolidated file lines here (FH, BH, CD, DD)..."
                  className="w-full text-xs font-mono p-3 rounded-lg bg-pos-muted border border-pos-line text-pos-ink focus:outline-none focus:border-pos-accent"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowFileModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-pos-line text-xs font-semibold text-pos-ink/70 hover:text-pos-ink"
                >
                  Close
                </button>
                <button
                  onClick={() => fileText && loadReconciliation(fileText)}
                  disabled={!fileText.trim() || loading}
                  className="px-4 py-1.5 rounded-lg bg-pos-accent hover:bg-pos-accent/90 text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  {loading ? 'Reconciling...' : 'Run Dual-Act Audit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
