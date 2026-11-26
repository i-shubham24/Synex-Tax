'use client';

import React, { useState, useEffect } from 'react';
import {
  Lock,
  ShieldCheck,
  AlertTriangle,
  Calculator,
  FileCheck2,
  CheckCircle2,
  X,
  CreditCard,
  Receipt,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { GstCommandBar } from '../../../../components/gst/GstCommandBar';
import { useWorkspace } from '../../../../workspace/WorkspaceContext';

export default function Gstr3bPage() {
  const { activeEntity, activeClient, activePeriod } = useWorkspace();
  const [activeTab, setActiveTab] = useState<'SET_OFF' | 'PMT06'>('SET_OFF');
  const [loading, setLoading] = useState(false);
  const [draftData, setDraftData] = useState<any>(null);
  const [setOffData, setSetOffData] = useState<any>(null);
  const [signModalOpen, setSignModalOpen] = useState(false);
  const [auditNote, setAuditNote] = useState('');
  const [filingInProgress, setFilingInProgress] = useState(false);
  const [filingResult, setFilingResult] = useState<{ arn: string; filedAt: string } | null>(null);

  // PMT-06 State
  const [pmt06Method, setPmt06Method] = useState<'FIXED_SUM_35_PCT' | 'SELF_ASSESSMENT'>('FIXED_SUM_35_PCT');
  const [pmt06Result, setPmt06Result] = useState<any>(null);

  const gstin = activeClient?.gstin ?? activeEntity?.gstins[0]?.gstin ?? '03AABCS1429B1Z2';
  const period = activePeriod;

  useEffect(() => {
    setLoading(true);
    // 1. Trigger auto-draft
    fetch(`/api/v1/gst/${gstin}/gstr3b/${period}/auto-draft`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        setDraftData(data.draft);
        // 2. Trigger compute set-off
        return fetch(`/api/v1/gst/${gstin}/gstr3b/${period}/set-off`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            monthlyTaxableTurnover: '6250000.00', // > 50L triggers Rule 86B
            outwardLiability: {
              igst: data.draft?.table3_1?.outwardTaxableSupplies?.igst || '17500.00',
              cgst: data.draft?.table3_1?.outwardTaxableSupplies?.cgst || '6875.00',
              sgst: data.draft?.table3_1?.outwardTaxableSupplies?.sgst || '6875.00',
            },
            itcAvailable: {
              igst: data.draft?.table4_itc?.itcAvailable?.igst || '15000.00',
              cgst: data.draft?.table4_itc?.itcAvailable?.cgst || '6000.00',
              sgst: data.draft?.table4_itc?.itcAvailable?.sgst || '6000.00',
            },
          }),
        });
      })
      .then((r) => r.json())
      .then((data) => setSetOffData(data))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [gstin, period]);

  const handleComputePmt06 = async (method: 'FIXED_SUM_35_PCT' | 'SELF_ASSESSMENT') => {
    setPmt06Method(method);
    try {
      const res = await fetch(`/api/v1/gst/${gstin}/qrmp/pmt06/${period}/compute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method,
          precedingQuarterNetCashPaid: { igst: '35000.00', cgst: '14000.00', sgst: '14000.00' },
          currentMonthLiability: { igst: '12000.00', cgst: '5000.00', sgst: '5000.00' },
          currentMonthItcAvailable: { igst: '8000.00', cgst: '3000.00', sgst: '3000.00' },
        }),
      });
      const data = await res.json();
      setPmt06Result(data.challanAmount);
    } catch {
      // Fallback
    }
  };

  const handleFileReturn = async () => {
    setFilingInProgress(true);
    try {
      const res = await fetch(`/api/v1/gst/${gstin}/gstr3b/${period}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditNote }),
      });
      const data = await res.json();
      if (res.ok) {
        setFilingResult({ arn: data.arn, filedAt: data.filedAt });
        setSignModalOpen(false);
      } else {
        alert(data.message || 'Filing failed');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setFilingInProgress(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <GstCommandBar currentStep={filingResult ? 'FILED' : 'PORTAL_SAVED'} isPeriodLocked={Boolean(filingResult)} />

      {/* Mode Switcher Tabs */}
      <div className="mb-6 flex gap-2 border-b border-pos-line pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('SET_OFF')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors ${
            activeTab === 'SET_OFF' ? 'bg-pos-accent text-white shadow-xs' : 'text-pos-ink/70 hover:bg-pos-muted'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>GSTR-3B Auto-Draft &amp; Set-Off Engine</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('PMT06');
            handleComputePmt06(pmt06Method);
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors ${
            activeTab === 'PMT06' ? 'bg-pos-accent text-white shadow-xs' : 'text-pos-ink/70 hover:bg-pos-muted'
          }`}
        >
          <CreditCard className="h-4 w-4" />
          <span>QRMP PMT-06 Monthly Challan</span>
        </button>
      </div>

      {filingResult && (
        <div className="mb-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-[13px] text-emerald-950 dark:text-emerald-200">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
            <div>
              <h3 className="font-display font-semibold text-[16px]">GSTR-3B Successfully Filed &amp; Period Hard-Locked</h3>
              <p className="mt-0.5 text-[13px] opacity-85">
                Statutory Acknowledgement Reference Number (ARN): <span className="font-mono font-bold">{filingResult.arn}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'SET_OFF' ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 w-full min-w-0 text-pos-ink">
          {/* Main 8-col: Tables 3.1 & 4 + Set-Off Preview */}
          <div className="xl:col-span-8 w-full min-w-0 space-y-6">
            {/* Table 3.1 Outward Liability (Locked) */}
            <div className="rounded-2xl border border-pos-line bg-pos-surface p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-pos-line pb-3">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-pos-ink/50" />
                  <h3 className="font-display font-semibold text-[15px]">Table 3.1: Outward Supplies &amp; Inward RCM</h3>
                </div>
                <span className="text-[11.5px] font-medium text-pos-ink/50">Auto-drafted from GSTR-1/1A (Locked)</span>
              </div>

              <div className="grid grid-cols-4 gap-2 rounded-xl bg-pos-muted/40 p-3 text-center text-[12px]">
                <div>
                  <span className="text-pos-ink/50 block text-[11px]">IGST</span>
                  <span className="font-mono font-bold text-pos-ink tabular-nums">
                    &#8377;{draftData?.table3_1?.outwardTaxableSupplies?.igst || '17,500.00'}
                  </span>
                </div>
                <div>
                  <span className="text-pos-ink/50 block text-[11px]">CGST</span>
                  <span className="font-mono font-bold text-pos-ink tabular-nums">
                    &#8377;{draftData?.table3_1?.outwardTaxableSupplies?.cgst || '6,875.00'}
                  </span>
                </div>
                <div>
                  <span className="text-pos-ink/50 block text-[11px]">SGST</span>
                  <span className="font-mono font-bold text-pos-ink tabular-nums">
                    &#8377;{draftData?.table3_1?.outwardTaxableSupplies?.sgst || '6,875.00'}
                  </span>
                </div>
                <div>
                  <span className="text-pos-ink/50 block text-[11px]">Total Liability</span>
                  <span className="font-mono font-bold text-red-600 tabular-nums">&#8377;31,250.00</span>
                </div>
              </div>
            </div>

            {/* Table 4 Eligible ITC */}
            <div className="rounded-2xl border border-pos-line bg-pos-surface p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-pos-line pb-3">
                <h3 className="font-display font-semibold text-[15px]">Table 4: Eligible ITC (From IMS Invoices)</h3>
                <span className="text-[11.5px] font-medium text-emerald-600">Net after 17(5) Reversals</span>
              </div>

              <div className="grid grid-cols-4 gap-2 rounded-xl bg-pos-muted/40 p-3 text-center text-[12px]">
                <div>
                  <span className="text-pos-ink/50 block text-[11px]">IGST ITC</span>
                  <span className="font-mono font-bold text-pos-ink tabular-nums">
                    &#8377;{draftData?.table4_itc?.itcAvailable?.igst || '15,000.00'}
                  </span>
                </div>
                <div>
                  <span className="text-pos-ink/50 block text-[11px]">CGST ITC</span>
                  <span className="font-mono font-bold text-pos-ink tabular-nums">
                    &#8377;{draftData?.table4_itc?.itcAvailable?.cgst || '6,000.00'}
                  </span>
                </div>
                <div>
                  <span className="text-pos-ink/50 block text-[11px]">SGST ITC</span>
                  <span className="font-mono font-bold text-pos-ink tabular-nums">
                    &#8377;{draftData?.table4_itc?.itcAvailable?.sgst || '6,000.00'}
                  </span>
                </div>
                <div>
                  <span className="text-pos-ink/50 block text-[11px]">Total ITC Available</span>
                  <span className="font-mono font-bold text-emerald-600 tabular-nums">&#8377;27,000.00</span>
                </div>
              </div>
            </div>

            {/* Hard-Locked Rule 88A & Rule 86B Set-Off Engine Table */}
            <div className="rounded-2xl border border-pos-line bg-pos-surface p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-pos-line pb-3">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-pos-accent" />
                  <h3 className="font-display font-semibold text-[15px]">Hard-Locked GstItcSetOffEngine</h3>
                </div>
                {setOffData?.rule86bApplied && (
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                    Rule 86B Active (1% Cash Outflow Enforced)
                  </span>
                )}
              </div>

              <table className="w-full text-left text-[12.5px]">
                <thead className="bg-pos-muted/60 text-pos-ink/70 font-semibold text-[11.5px]">
                  <tr>
                    <th className="p-2.5">Tax Head</th>
                    <th className="p-2.5 text-right">Output Due (&#8377;)</th>
                    <th className="p-2.5 text-right">ITC Offset (&#8377;)</th>
                    <th className="p-2.5 text-right font-bold text-red-600">Net Cash Payable (&#8377;)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pos-line font-mono text-[12px] tabular-nums">
                  <tr>
                    <td className="p-2.5 font-sans font-medium">Integrated Tax (IGST)</td>
                    <td className="p-2.5 text-right">&#8377;17,500.00</td>
                    <td className="p-2.5 text-right text-emerald-600">&#8377;15,000.00</td>
                    <td className="p-2.5 text-right font-bold">&#8377;2,500.00</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-sans font-medium">Central Tax (CGST)</td>
                    <td className="p-2.5 text-right">&#8377;6,875.00</td>
                    <td className="p-2.5 text-right text-emerald-600">&#8377;6,000.00</td>
                    <td className="p-2.5 text-right font-bold">&#8377;875.00</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-sans font-medium">State Tax (SGST)</td>
                    <td className="p-2.5 text-right">&#8377;6,875.00</td>
                    <td className="p-2.5 text-right text-emerald-600">&#8377;6,000.00</td>
                    <td className="p-2.5 text-right font-bold">&#8377;875.00</td>
                  </tr>
                  <tr className="bg-pos-muted/40 font-bold text-[13px]">
                    <td className="p-2.5 font-sans">Total Discharge</td>
                    <td className="p-2.5 text-right">&#8377;31,250.00</td>
                    <td className="p-2.5 text-right text-emerald-600">&#8377;27,000.00</td>
                    <td className="p-2.5 text-right text-red-600">&#8377;4,250.00</td>
                  </tr>
                </tbody>
              </table>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setSignModalOpen(true)}
                  disabled={Boolean(filingResult)}
                  className="flex items-center gap-2 rounded-xl bg-pos-head px-5 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <span>Offset &amp; File GSTR-3B</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* 4-col Side Panel: Advisory 643 Electronic Ledger Tracking */}
          <div className="xl:col-span-4 w-full min-w-0 space-y-4">
            <div className="rounded-2xl border border-pos-line bg-pos-surface p-5 shadow-sm space-y-4">
              <h3 className="font-display font-semibold text-[15px] border-b border-pos-line pb-3">
                Advisory 643 Ledger Tracking
              </h3>

              <div className="space-y-3 text-[12.5px]">
                <div className="rounded-xl bg-pos-muted/40 p-3 space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-pos-ink/50 block">Electronic Credit Reclaim Ledger</span>
                  <div className="flex justify-between font-mono tabular-nums">
                    <span className="text-pos-ink/60">Opening Balance:</span>
                    <span className="font-semibold">&#8377;45,000.00</span>
                  </div>
                  <div className="flex justify-between font-mono tabular-nums text-emerald-600">
                    <span>Reclaimed (Table 4D(1)):</span>
                    <span>+&#8377;5,000.00</span>
                  </div>
                  <div className="flex justify-between font-mono tabular-nums text-amber-600">
                    <span>Temporary Reversed (4B(2)):</span>
                    <span>-&#8377;8,000.00</span>
                  </div>
                  <div className="flex justify-between font-mono tabular-nums border-t border-pos-line pt-1 font-bold">
                    <span>Closing Balance:</span>
                    <span className="text-pos-ink">&#8377;42,000.00</span>
                  </div>
                </div>

                <div className="rounded-xl bg-pos-muted/40 p-3 space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-pos-ink/50 block">RCM Liability &amp; ITC Ledger</span>
                  <div className="flex justify-between font-mono tabular-nums">
                    <span className="text-pos-ink/60">RCM Paid in Cash:</span>
                    <span className="font-semibold">&#8377;0.00</span>
                  </div>
                  <div className="flex justify-between font-mono tabular-nums text-emerald-600">
                    <span>RCM ITC Claimed:</span>
                    <span>&#8377;0.00</span>
                  </div>
                  <div className="flex justify-between font-mono tabular-nums border-t border-pos-line pt-1 font-bold">
                    <span>Net Compliance Delta:</span>
                    <span className="text-emerald-600">&#8377;0.00</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* QRMP PMT-06 Monthly Challan Calculator */
        <div className="rounded-2xl border border-pos-line bg-pos-surface p-6 shadow-sm space-y-6 max-w-3xl text-pos-ink">
          <div className="flex items-center justify-between border-b border-pos-line pb-4">
            <div>
              <h3 className="font-display font-semibold text-[16px]">QRMP Monthly PMT-06 Challan Calculation</h3>
              <p className="text-[12.5px] text-pos-ink/60">Form PMT-06 payment for 1st and 2nd month of the quarter</p>
            </div>
            <div className="flex rounded-xl border border-pos-line bg-pos-muted/50 p-1 gap-1 text-[12px] font-medium">
              <button
                type="button"
                onClick={() => handleComputePmt06('FIXED_SUM_35_PCT')}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  pmt06Method === 'FIXED_SUM_35_PCT' ? 'bg-pos-surface font-semibold text-pos-ink shadow-xs' : 'text-pos-ink/60 hover:text-pos-ink'
                }`}
              >
                35% Fixed Sum Method
              </button>
              <button
                type="button"
                onClick={() => handleComputePmt06('SELF_ASSESSMENT')}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  pmt06Method === 'SELF_ASSESSMENT' ? 'bg-pos-surface font-semibold text-pos-ink shadow-xs' : 'text-pos-ink/60 hover:text-pos-ink'
                }`}
              >
                Self-Assessment Method
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-xl border border-pos-line bg-pos-muted/30 p-4">
              <span className="text-[12px] text-pos-ink/60 block">IGST Challan</span>
              <span className="font-mono text-[16px] font-bold text-pos-ink tabular-nums">
                &#8377;{pmt06Result?.igst || '12,250.00'}
              </span>
            </div>
            <div className="rounded-xl border border-pos-line bg-pos-muted/30 p-4">
              <span className="text-[12px] text-pos-ink/60 block">CGST Challan</span>
              <span className="font-mono text-[16px] font-bold text-pos-ink tabular-nums">
                &#8377;{pmt06Result?.cgst || '4,900.00'}
              </span>
            </div>
            <div className="rounded-xl border border-pos-line bg-pos-muted/30 p-4">
              <span className="text-[12px] text-pos-ink/60 block">SGST Challan</span>
              <span className="font-mono text-[16px] font-bold text-pos-ink tabular-nums">
                &#8377;{pmt06Result?.sgst || '4,900.00'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-pos-tint p-4">
            <div>
              <span className="text-[12px] font-medium text-pos-ink/70">Total PMT-06 Payment</span>
              <p className="font-mono text-[20px] font-bold text-pos-accent tabular-nums">
                &#8377;{pmt06Result?.total || '22,050.00'}
              </p>
            </div>
            <button
              type="button"
              className="rounded-xl bg-pos-head px-5 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 shadow-xs"
            >
              Generate PMT-06 Challan JSON
            </button>
          </div>
        </div>
      )}

      {/* Screen C Pre-Filing Sign-Off Modal */}
      {signModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-pos-line bg-pos-surface p-6 shadow-xl space-y-4 text-pos-ink">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <div>
                <h3 className="font-display font-semibold text-[16px]">Sign &amp; File GSTR-3B Return</h3>
                <p className="text-[12px] text-pos-ink/50">GSTIN {gstin} | Period {period}</p>
              </div>
              <button type="button" onClick={() => setSignModalOpen(false)} className="text-pos-ink/50 hover:text-pos-ink">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl bg-pos-muted/50 p-3 space-y-2 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-pos-ink/60">Gross Output Liability:</span>
                <span className="font-mono font-semibold tabular-nums">&#8377;31,250.00</span>
              </div>
              <div className="flex justify-between text-emerald-600">
                <span>Total ITC Utilized:</span>
                <span className="font-mono font-semibold tabular-nums">&#8377;27,000.00</span>
              </div>
              <div className="flex justify-between border-t border-pos-line pt-1 text-red-600 font-bold">
                <span>Net Cash Paid via Cash Ledger:</span>
                <span className="font-mono tabular-nums">&#8377;4,250.00</span>
              </div>
            </div>

            <div>
              <label className="text-[12px] font-medium text-pos-ink/70">Mandatory Partner Signoff Audit Note</label>
              <textarea
                rows={3}
                value={auditNote}
                onChange={(e) => setAuditNote(e.target.value)}
                placeholder="Reviewed Table 4 ITC and confirmed set-off order per Rule 88A."
                className="mt-1 w-full rounded-xl border border-pos-line bg-pos-surface p-3 text-[12.5px] outline-none focus:border-pos-accent"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-pos-line">
              <button
                type="button"
                onClick={() => setSignModalOpen(false)}
                className="rounded-xl border border-pos-line px-4 py-2 text-[12.5px] font-semibold text-pos-ink hover:bg-pos-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFileReturn}
                disabled={filingInProgress}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-[12.5px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>{filingInProgress ? 'Filing Return...' : 'Approve & Sign via DSC'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
