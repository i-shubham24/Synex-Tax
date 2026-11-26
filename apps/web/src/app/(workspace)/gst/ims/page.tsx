'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Download,
  Filter,
  Check,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { GstCommandBar } from '../../../../components/gst/GstCommandBar';
import { useWorkspace } from '../../../../workspace/WorkspaceContext';
import { useAuth } from '../../../../context/AuthContext';

interface ImsRecord {
  id: string;
  supplier_gstin: string;
  supplier_trade_name: string | null;
  doc_type: string;
  doc_num: string;
  doc_date: string;
  taxable_value: string;
  igst_amount: string;
  cgst_amount: string;
  sgst_amount: string;
  ims_action_status: 'A' | 'R' | 'P' | 'NONE';
  ims_pending_period_count: number;
}

export default function ImsConsolePage() {
  const { activeEntity, activeClient, activePeriod } = useWorkspace();
  const { authFetch } = useAuth();
  const [viewMode, setViewMode] = useState<'RECIPIENT' | 'SUPPLIER' | 'BYPASS'>('RECIPIENT');
  const [records, setRecords] = useState<ImsRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ImsRecord | null>(null);
  const [post14thAlert, setPost14thAlert] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [partialReversalOpen, setPartialReversalOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState('');

  const gstin = activeClient?.gstin ?? activeEntity?.gstins[0]?.gstin ?? '03AABCS1429B1Z2';
  const period = activePeriod;

  const fetchRecords = () => {
    setLoading(true);
    authFetch(`/api/v1/gst/${gstin}/ims/actions?period=${period}&view=${viewMode}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.queue) {
          setRecords(data.queue);
          if (data.queue.length > 0) setSelectedRecord(data.queue[0]);
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRecords();
  }, [gstin, period, viewMode]);

  const handleApplyAction = async (action: 'A' | 'R' | 'P' | 'NONE', itcReversalAmount?: string) => {
    const targets = selectedIds.length > 0 ? selectedIds : selectedRecord ? [selectedRecord.id] : [];
    if (targets.length === 0) return;

    try {
      const res = await authFetch(`/api/v1/gst/${gstin}/ims/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period,
          actions: targets.map((id) => ({
            record2bId: id,
            action,
            itcReversalAmount: itcReversalAmount || undefined,
          })),
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        alert(resData.message || 'Error processing action');
        return;
      }

      setPost14thAlert(true);
      setSelectedIds([]);
      fetchRecords();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRecompute2B = async () => {
    setRecomputing(true);
    try {
      const res = await authFetch(`/api/v1/gst/${gstin}/ims/recompute-2b`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      });
      if (res.ok) {
        setPost14thAlert(false);
        alert('GSTR-2B recomputed successfully. GSTR-3B auto-draft lock cleared.');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <GstCommandBar currentStep="RECONCILED" />

      {/* Sticky Amber Banner for Post-14th IMS Cutoff Guard */}
      {post14thAlert && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-[13px] text-amber-950 dark:text-amber-200 shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold text-[14px]">Recompute GSTR-2B Required Before Filing 3B</p>
              <p className="text-[12px] opacity-85">
                IMS actions were updated post-14th cutoff. GSTR-3B is hard-locked until GSTR-2B is recomputed.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <a
              href={`/api/v1/gst/${gstin}/ims/offline-json?period=${period}`}
              download
              className="flex items-center gap-1.5 rounded-xl border border-amber-600/30 bg-pos-surface px-3 py-2 text-[12px] font-semibold hover:bg-pos-muted transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Export IMS JSON
            </a>
            <button
              type="button"
              onClick={handleRecompute2B}
              disabled={recomputing}
              className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-[12px] font-semibold text-white shadow-xs hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${recomputing ? 'animate-spin' : ''}`} />
              <span>{recomputing ? 'Recomputing...' : 'Recompute GSTR-2B'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Screen B Layout: 72% Action Queue + 28% Floating Inspector */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 w-full min-w-0">
        <div className="xl:col-span-8 w-full min-w-0 space-y-4">
          {/* Top View Toggle & Bulk Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pos-line bg-pos-surface p-3 shadow-sm">
            <div className="flex items-center rounded-xl border border-pos-line bg-pos-muted/50 p-1 gap-1 text-[12.5px] font-medium">
              <button
                type="button"
                onClick={() => setViewMode('RECIPIENT')}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  viewMode === 'RECIPIENT' ? 'bg-pos-surface font-semibold text-pos-ink shadow-xs' : 'text-pos-ink/60 hover:text-pos-ink'
                }`}
              >
                Recipient View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('SUPPLIER')}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  viewMode === 'SUPPLIER' ? 'bg-pos-surface font-semibold text-pos-ink shadow-xs' : 'text-pos-ink/60 hover:text-pos-ink'
                }`}
              >
                Supplier View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('BYPASS')}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  viewMode === 'BYPASS' ? 'bg-pos-surface font-semibold text-pos-ink shadow-xs' : 'text-pos-ink/60 hover:text-pos-ink'
                }`}
              >
                IMS Bypass (RCM/ISD)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleApplyAction('A')}
                className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 shadow-xs"
              >
                <Check className="h-3.5 w-3.5" /> Accept (A)
              </button>
              <button
                type="button"
                onClick={() => handleApplyAction('R')}
                className="flex items-center gap-1 rounded-xl bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-red-700 shadow-xs"
              >
                <X className="h-3.5 w-3.5" /> Reject (R)
              </button>
              <button
                type="button"
                onClick={() => handleApplyAction('P')}
                className="flex items-center gap-1 rounded-xl bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-amber-700 shadow-xs"
              >
                <Clock className="h-3.5 w-3.5" /> Pending (P)
              </button>
              <button
                type="button"
                onClick={() => handleApplyAction('NONE')}
                className="rounded-xl border border-pos-line px-2.5 py-1.5 text-[12px] font-semibold text-pos-ink hover:bg-pos-muted"
              >
                Reset
              </button>
            </div>
          </div>

          {/* TanStack Table: Inward IMS Queue */}
          <div className="overflow-hidden rounded-2xl border border-pos-line bg-pos-surface shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[#141619] text-white text-[11.5px] uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-3 py-3 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === records.length && records.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(records.map((r) => r.id));
                          else setSelectedIds([]);
                        }}
                        className="rounded"
                      />
                    </th>
                    <th className="px-3 py-3">Doc Ref</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-3 py-3 text-right">Taxable (&#8377;)</th>
                    <th className="px-3 py-3 text-right">Tax (&#8377;)</th>
                    <th className="px-3 py-3 text-center">IMS Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pos-line font-sans">
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-pos-ink/50">
                        {loading ? 'Fetching IMS inward queue...' : 'No invoices in inward queue for ' + period}
                      </td>
                    </tr>
                  ) : (
                    records.map((rec) => {
                      const isSelected = selectedRecord?.id === rec.id;
                      const isChecked = selectedIds.includes(rec.id);
                      const totalTax = (Number(rec.igst_amount) + Number(rec.cgst_amount) + Number(rec.sgst_amount)).toFixed(2);

                      return (
                        <tr
                          key={rec.id}
                          onClick={() => setSelectedRecord(rec)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-pos-tint font-medium' : 'hover:bg-pos-muted/50'
                          }`}
                        >
                          <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedIds([...selectedIds, rec.id]);
                                else setSelectedIds(selectedIds.filter((id) => id !== rec.id));
                              }}
                              className="rounded"
                            />
                          </td>
                          <td className="px-3 py-3 font-mono text-[12px] font-semibold text-pos-ink">
                            <div>{rec.doc_num}</div>
                            <div className="text-[11px] font-normal text-pos-ink/50">{rec.doc_date}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-pos-ink line-clamp-1">{rec.supplier_trade_name || 'Vendor'}</div>
                            <div className="font-mono text-[11.5px] text-pos-ink/50">{rec.supplier_gstin}</div>
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-[12px] text-pos-ink tabular-nums">
                            &#8377;{Number(rec.taxable_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-[12px] text-emerald-600 font-semibold tabular-nums">
                            &#8377;{Number(totalTax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {rec.ims_action_status === 'A' ? (
                              <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                                Accepted (A)
                              </span>
                            ) : rec.ims_action_status === 'R' ? (
                              <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
                                Rejected (R)
                              </span>
                            ) : rec.ims_action_status === 'P' ? (
                              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                                Pending (P)
                              </span>
                            ) : (
                              <span className="rounded-full bg-pos-muted px-2.5 py-0.5 text-[11px] font-bold text-pos-ink/60">
                                None
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
          <div className="rounded-2xl border border-pos-line bg-pos-surface p-5 shadow-sm space-y-4 text-pos-ink">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <span className="text-[12px] font-bold uppercase tracking-wider text-pos-ink/60">IMS Inspector</span>
              <span className="font-mono text-[13px] font-bold text-pos-accent">{selectedRecord?.doc_num ?? 'N/A'}</span>
            </div>

            {selectedRecord ? (
              <div className="space-y-3.5 text-[12.5px]">
                {selectedRecord.doc_type === 'CRN' && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px]">
                    <span className="font-semibold text-amber-800 dark:text-amber-300 block">1-Period Credit Note Rule</span>
                    <span className="text-pos-ink/75">
                      Credit Notes cannot stay in Pending (P) status for more than 1 period. Pending count: {selectedRecord.ims_pending_period_count}/1.
                    </span>
                  </div>
                )}

                <div>
                  <span className="text-pos-ink/50 text-[11px] block">Supplier</span>
                  <p className="font-semibold text-pos-ink text-[13px]">{selectedRecord.supplier_trade_name || 'Vendor'}</p>
                  <p className="font-mono text-pos-ink/60 text-[12px]">{selectedRecord.supplier_gstin}</p>
                </div>

                <div className="rounded-xl bg-pos-muted/40 p-3 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-pos-ink/60">Doc Type:</span>
                    <span className="font-semibold text-pos-ink">{selectedRecord.doc_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-pos-ink/60">Taxable Value:</span>
                    <span className="font-mono text-pos-ink tabular-nums">&#8377;{Number(selectedRecord.taxable_value).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-pos-line pt-1 font-bold">
                    <span className="text-pos-ink">Total Tax:</span>
                    <span className="font-mono text-emerald-600 tabular-nums">
                      &#8377;{(Number(selectedRecord.igst_amount) + Number(selectedRecord.cgst_amount) + Number(selectedRecord.sgst_amount)).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Single Invoice Quick Actions */}
                <div className="pt-2 space-y-2">
                  <button
                    type="button"
                    onClick={() => setPartialReversalOpen(true)}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-pos-line py-2 text-[12px] font-semibold text-pos-ink hover:bg-pos-muted transition-colors"
                  >
                    Accept with Partial Reversal
                  </button>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleApplyAction('A')}
                      className="rounded-xl bg-emerald-600 py-2 text-[12px] font-semibold text-white hover:bg-emerald-700"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyAction('R')}
                      className="rounded-xl bg-red-600 py-2 text-[12px] font-semibold text-white hover:bg-red-700"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyAction('P')}
                      className="rounded-xl bg-amber-600 py-2 text-[12px] font-semibold text-white hover:bg-amber-700"
                    >
                      Pending
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-pos-ink/50 py-4 text-center">Select an invoice to inspect statutory IMS actions</p>
            )}
          </div>
        </div>
      </div>

      {/* Partial Reversal Modal */}
      {partialReversalOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-pos-line bg-pos-surface p-6 shadow-xl space-y-4 text-pos-ink">
            <h3 className="font-display font-semibold text-[15px]">Partial ITC Reversal Prompt</h3>
            <p className="text-[12px] text-pos-ink/60">
              Enter specific ITC amount to reverse under Table 4B(2). Leaving blank performs full acceptance.
            </p>
            <div>
              <label className="text-[12px] font-medium text-pos-ink/70">Reversal Amount (&#8377;)</label>
              <input
                type="text"
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                placeholder="0.00"
                className="mt-1 w-full rounded-xl border border-pos-line bg-pos-surface px-3 py-2 font-mono text-[13px] outline-none focus:border-pos-accent"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-pos-line">
              <button
                type="button"
                onClick={() => setPartialReversalOpen(false)}
                className="rounded-xl border border-pos-line px-3 py-1.5 text-[12px] font-semibold text-pos-ink hover:bg-pos-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleApplyAction('A', partialAmount);
                  setPartialReversalOpen(false);
                }}
                className="rounded-xl bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700"
              >
                Confirm &amp; Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
