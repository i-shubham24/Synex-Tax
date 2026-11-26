'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Plus,
  ArrowRight,
  Sparkles,
  Link2,
} from 'lucide-react';
import { TdsCommandBar } from '../../../../components/tds/TdsCommandBar';
import { useWorkspace } from '../../../../workspace/WorkspaceContext';
import { useAuth } from '../../../../context/AuthContext';

interface DeducteeItem {
  id: string;
  deductee_pan: string;
  deductee_name: string;
  section_code: string;
  amount_paid: string;
  tds_rate: string;
  tds_deducted: string;
  pan_status: 'OPERATIVE' | 'INOPERATIVE' | 'INVALID' | 'UNAVAILABLE';
  payment_credit_date: string;
}

export default function DeducteesPage() {
  const { activeEntity, activeClient } = useWorkspace();
  const { authFetch } = useAuth();
  const [deductees, setDeductees] = useState<DeducteeItem[]>([]);
  const [selectedDeductee, setSelectedDeductee] = useState<DeducteeItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifyingPans, setVerifyingPans] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);

  const tan = activeClient?.tan ?? activeEntity?.tans[0]?.tan ?? 'PTLA02914C';

  useEffect(() => {
    setLoading(true);
    authFetch(`/api/v1/tds/${tan}/deductees`)
      .then((r) => r.json())
      .then((data) => {
        if (data.deductees) {
          setDeductees(data.deductees);
          if (data.deductees.length > 0) setSelectedDeductee(data.deductees[0]);
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [tan]);

  const handleBulkVerifyPan = async () => {
    setVerifyingPans(true);
    try {
      const pans = deductees.map((d) => d.deductee_pan);
      const res = await authFetch(`/api/v1/tds/${tan}/pan/verify-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pans }),
      });
      const data = await res.json();
      if (res.ok) {
        setVerifyNotice(
          `Verified ${data.totalChecked} PANs via ITD API: ${data.operativeCount} Operative, ${data.inoperativeCount} Inoperative (Flagged for 20% higher rate).`,
        );
        // Refresh deductees list
        const refreshRes = await authFetch(`/api/v1/tds/${tan}/deductees`);
        const refreshData = await refreshRes.json();
        if (refreshData.deductees) setDeductees(refreshData.deductees);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setVerifyingPans(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl text-pos-ink">
      <TdsCommandBar />

      {/* Incoming Cross-Compliance Handoff Banner from SynTax GST */}
      <div className="mb-6 flex items-center justify-between rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-[13px]">
        <div className="flex items-center gap-3">
          <Link2 className="h-5 w-5 text-sky-600 shrink-0" />
          <div>
            <p className="font-semibold text-[14px]">Incoming from SynTax GST: 1 Bill Flagged for Section 393 Review</p>
            <p className="text-pos-ink/70 text-[12px]">
              Amritsar Precision Steel Ltd high-value purchase bill &gt;&#8377;50L tagged for TDS Section 393(1) withholding verification.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleBulkVerifyPan}
          disabled={verifyingPans}
          className="rounded-xl bg-pos-head px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {verifyingPans ? 'Verifying ITD API...' : 'Bulk Verify Operative PANs'}
        </button>
      </div>

      {verifyNotice && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-500/15 p-3 text-[12.5px] text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{verifyNotice}</span>
        </div>
      )}

      {/* Screen B Layout: 72% Table + 28% Inspector */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 w-full min-w-0">
        <div className="xl:col-span-8 w-full min-w-0 space-y-4">
          <div className="overflow-hidden rounded-2xl border border-pos-line bg-pos-surface shadow-sm w-full min-w-0">
            <div className="overflow-x-auto w-full min-w-0 [scrollbar-width:thin] [scrollbar-color:rgba(120,120,120,0.2)_transparent]">
              <table className="w-full min-w-[620px] text-left text-[13px]">
                <thead className="bg-[#141619] text-white text-[11.5px] uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Deductee PAN &amp; Name</th>
                    <th className="px-3 py-3">Section</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3 text-right">Paid (&#8377;)</th>
                    <th className="px-3 py-3 text-right">TDS (&#8377;)</th>
                    <th className="px-3 py-3 text-center">PAN Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pos-line font-sans text-[12.5px]">
                  {deductees.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-pos-ink/50">
                        {loading ? 'Fetching deductees...' : 'No deductee entries found for TAN ' + tan}
                      </td>
                    </tr>
                  ) : (
                    deductees.map((d) => {
                      const isSelected = selectedDeductee?.id === d.id;
                      const isInoperative = d.pan_status === 'INOPERATIVE';

                      return (
                        <tr
                          key={d.id}
                          onClick={() => setSelectedDeductee(d)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-pos-tint font-semibold' : 'hover:bg-pos-muted/40'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="font-mono text-[12px] font-bold text-pos-ink">{d.deductee_pan}</div>
                            <div className="text-[11.5px] text-pos-ink/60 line-clamp-1">{d.deductee_name}</div>
                          </td>
                          <td className="px-3 py-3 font-mono font-medium text-pos-ink">Sec {d.section_code}</td>
                          <td className="px-3 py-3 font-mono text-pos-ink/60 text-[11.5px]">{d.payment_credit_date}</td>
                          <td className="px-3 py-3 text-right font-mono text-pos-ink tabular-nums">
                            &#8377;{Number(d.amount_paid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-bold text-emerald-600 tabular-nums">
                            &#8377;{Number(d.tds_deducted).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {isInoperative ? (
                              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10.5px] font-bold text-red-600">
                                20% Higher Risk
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">
                                Operative
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 28% Floating Right Inspector Card */}
        <div className="xl:col-span-4 w-full min-w-0 space-y-4">
          <div className="rounded-2xl border border-pos-line bg-pos-surface p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <span className="text-[12px] font-bold uppercase tracking-wider text-pos-ink/60">Deductee Guard</span>
              <span className="font-mono text-[13px] font-bold text-pos-accent">
                {selectedDeductee?.deductee_pan ?? 'N/A'}
              </span>
            </div>

            {selectedDeductee ? (
              <div className="space-y-3.5 text-[12.5px]">
                <div>
                  <span className="text-pos-ink/50 text-[11px] block">Name on Record</span>
                  <p className="font-semibold text-pos-ink text-[13px]">{selectedDeductee.deductee_name}</p>
                </div>

                <div className="rounded-xl bg-pos-muted/40 p-3 space-y-1 font-mono text-[12px] tabular-nums">
                  <div className="flex justify-between font-sans">
                    <span className="text-pos-ink/60">Section Code:</span>
                    <span className="font-semibold text-pos-ink">Sec {selectedDeductee.section_code}</span>
                  </div>
                  <div className="flex justify-between font-sans">
                    <span className="text-pos-ink/60">Deduction Rate:</span>
                    <span className="font-semibold text-pos-ink">{Number(selectedDeductee.tds_rate) * 100}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-pos-ink/60 font-sans">Amount Credited:</span>
                    <span className="text-pos-ink font-semibold">&#8377;{Number(selectedDeductee.amount_paid).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-pos-line pt-1 text-emerald-600 font-bold">
                    <span className="font-sans">TDS Withheld:</span>
                    <span>&#8377;{Number(selectedDeductee.tds_deducted).toFixed(2)}</span>
                  </div>
                </div>

                {selectedDeductee.pan_status === 'INOPERATIVE' && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-900 dark:text-red-200">
                    <span className="font-semibold block">Section 206AA / 393 Inoperative Guard:</span>
                    <span>Aadhaar link expired or missing. 20% flat withholding required to avoid short-deduction defaults.</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-pos-ink/50 py-4 text-center">Select a deductee to view statutory compliance profile</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
