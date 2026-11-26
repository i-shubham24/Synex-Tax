'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CreditCard,
  Plus,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  FileCheck,
} from 'lucide-react';
import { TdsCommandBar } from '../../../../components/tds/TdsCommandBar';
import { useWorkspace } from '../../../../workspace/WorkspaceContext';
import { useAuth } from '../../../../context/AuthContext';

interface ChallanItem {
  id: string;
  challan_no: string;
  bsr_code: string;
  deposit_date: string;
  statutory_regime: string;
  total_challan_amount: string;
  csi_matched: boolean;
  allocations: Array<{
    id: string;
    sectionCode: string;
    totalSectionAmount: string;
  }>;
}

export default function ChallansPage() {
  const { activeEntity, activeClient } = useWorkspace();
  const { authFetch } = useAuth();
  const [challans, setChallans] = useState<ChallanItem[]>([]);
  const [selectedChallan, setSelectedChallan] = useState<ChallanItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [csiMatchModalOpen, setCsiMatchModalOpen] = useState(false);
  const [csiSuccess, setCsiSuccess] = useState<string | null>(null);

  const tan = activeClient?.tan ?? activeEntity?.tans[0]?.tan ?? 'PTLA02914C';

  useEffect(() => {
    setLoading(true);
    authFetch(`/api/v1/tds/${tan}/challans?quarter=Q1&taxYear=2026`)
      .then((r) => r.json())
      .then((data) => {
        if (data.challans) {
          setChallans(data.challans);
          if (data.challans.length > 0) setSelectedChallan(data.challans[0]);
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [tan]);

  const handleCsiMatch = async () => {
    try {
      const res = await authFetch(`/api/v1/tds/${tan}/csi/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csiRecords: [
            {
              bsrCode: selectedChallan?.bsr_code || '0291482',
              depositDate: selectedChallan?.deposit_date || '2026-05-04',
              challanNo: selectedChallan?.challan_no || '00412',
              challanAmount: selectedChallan?.total_challan_amount || '14250.00',
            },
          ],
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCsiSuccess(`Matched ${data.matchedCount} challan(s) against NSDL CSI file.`);
        setCsiMatchModalOpen(false);
        // Refresh
        setChallans((prev) =>
          prev.map((c) => (c.id === selectedChallan?.id ? { ...c, csi_matched: true } : c)),
        );
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-7xl text-pos-ink">
      <TdsCommandBar />

      {/* Tax Year 2026-27 Safeguard Banner */}
      <div className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-[13px]">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <p className="font-semibold text-pos-ink text-[14px]">
              Tax Year 2026-27 ITNS 281N Multi-Section Allocation Engine Active
            </p>
            <p className="text-pos-ink/70 text-[12px]">
              Deposits on or after 1-Apr-2026 allow up to 20 statutory section allocations per single challan.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCsiMatchModalOpen(true)}
          className="flex items-center gap-1.5 rounded-xl bg-pos-head px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 shadow-xs"
        >
          <Upload className="h-4 w-4" /> Match NSDL CSI File
        </button>
      </div>

      {csiSuccess && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-500/15 p-3 text-[12.5px] text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{csiSuccess}</span>
        </div>
      )}

      {/* Screen B Layout: 72% Challan Table + 28% Floating Sub-Grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 w-full min-w-0">
        <div className="xl:col-span-8 w-full min-w-0 space-y-4">
          <div className="overflow-hidden rounded-2xl border border-pos-line bg-pos-surface shadow-sm w-full min-w-0">
            <div className="overflow-x-auto w-full min-w-0 [scrollbar-width:thin] [scrollbar-color:rgba(120,120,120,0.2)_transparent]">
              <table className="w-full min-w-[550px] text-left text-[13px]">
                <thead className="bg-[#141619] text-white text-[11.5px] uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Challan Ref</th>
                    <th className="px-3 py-3">BSR Code</th>
                    <th className="px-3 py-3">Deposit Date</th>
                    <th className="px-4 py-3 text-right">Amount (&#8377;)</th>
                    <th className="px-3 py-3 text-center">CSI Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pos-line font-mono text-[12px] tabular-nums">
                  {challans.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-pos-ink/50 font-sans">
                        {loading ? 'Fetching TAN challans...' : 'No challans found for TAN ' + tan}
                      </td>
                    </tr>
                  ) : (
                    challans.map((c) => {
                      const isSelected = selectedChallan?.id === c.id;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedChallan(c)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-pos-tint font-semibold' : 'hover:bg-pos-muted/40'
                          }`}
                        >
                          <td className="px-4 py-3 font-semibold text-pos-ink">
                            CH-{c.challan_no}
                          </td>
                          <td className="px-3 py-3 text-pos-ink/70">{c.bsr_code}</td>
                          <td className="px-3 py-3 text-pos-ink/70">{c.deposit_date}</td>
                          <td className="px-4 py-3 text-right text-emerald-600 font-bold">
                            &#8377;{Number(c.total_challan_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-3 text-center font-sans">
                            {c.csi_matched ? (
                              <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                                CSI Matched
                              </span>
                            ) : (
                              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                                Unmatched
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
              <span className="text-[12px] font-bold uppercase tracking-wider text-pos-ink/60">
                ITNS 281N Allocation Sub-Grid
              </span>
              <span className="font-mono text-[13px] font-bold text-pos-accent">
                {selectedChallan ? `CH-${selectedChallan.challan_no}` : 'N/A'}
              </span>
            </div>

            {selectedChallan ? (
              <div className="space-y-3.5 text-[12.5px]">
                <div className="rounded-xl bg-pos-muted/40 p-3 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-pos-ink/60">Regime:</span>
                    <span className="font-semibold text-pos-ink">{selectedChallan.statutory_regime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-pos-ink/60">Total Deposited:</span>
                    <span className="font-mono font-bold text-emerald-600 tabular-nums">
                      &#8377;{Number(selectedChallan.total_challan_amount).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[11.5px] font-semibold text-pos-ink/60 block mb-2">
                    Section Allocations (Up to 20):
                  </span>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {selectedChallan.allocations && selectedChallan.allocations.length > 0 ? (
                      selectedChallan.allocations.map((a, idx) => (
                        <div key={idx} className="flex justify-between rounded-lg border border-pos-line bg-pos-surface p-2 font-mono text-[12px] tabular-nums">
                          <span className="font-sans font-semibold text-pos-ink">Sec {a.sectionCode}</span>
                          <span className="text-pos-ink font-medium">&#8377;{Number(a.totalSectionAmount).toFixed(2)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[12px] text-pos-ink/50 py-2">No section allocations loaded</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-pos-ink/50 py-4 text-center">Select a challan to inspect section allocations</p>
            )}
          </div>
        </div>
      </div>

      {/* CSI Match Modal */}
      {csiMatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-pos-line bg-pos-surface p-6 shadow-xl space-y-4">
            <h3 className="font-display font-semibold text-[16px]">Match NSDL Challan Status (.csi)</h3>
            <p className="text-[12px] text-pos-ink/60">
              Matches OLTAS / TIN-NSDL challan identification records against bank deposits.
            </p>
            <div className="rounded-xl border-2 border-dashed border-pos-line p-4 text-center">
              <Upload className="mx-auto h-6 w-6 text-pos-accent" />
              <p className="mt-1 text-[11px] text-pos-ink/70">TAN_01042026_30062026.csi ready</p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-pos-line">
              <button
                type="button"
                onClick={() => setCsiMatchModalOpen(false)}
                className="rounded-xl border border-pos-line px-3 py-1.5 text-[12px] font-semibold text-pos-ink hover:bg-pos-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCsiMatch}
                className="rounded-xl bg-pos-head px-4 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 shadow-xs"
              >
                Execute Match
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
