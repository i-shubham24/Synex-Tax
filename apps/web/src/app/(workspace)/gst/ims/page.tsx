'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  Printer,
  RotateCcw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { GstCommandBar } from '../../../../components/gst/GstCommandBar';
import { useWorkspace } from '../../../../workspace/WorkspaceContext';
import { useAuth } from '../../../../context/AuthContext';

interface ImsRecord {
  id: string;
  supplier_gstin: string;
  supplier_trade_name: string | null;
  doc_type: string;
  credit_category?: 'B2B' | 'IMPG' | 'ISD' | 'OUTWARD';
  doc_num: string;
  normalized_invoice_key?: string | null;
  doc_date: string;
  taxable_value: string;
  igst_amount: string;
  cgst_amount: string;
  sgst_amount: string;
  ims_action_status: 'A' | 'R' | 'P' | 'NONE';
  ims_previous_status?: 'A' | 'R' | 'P' | 'NONE';
  ims_reset_detected?: boolean;
  ims_pending_period_count: number;
  is_downward_amendment?: boolean;
  original_doc_num?: string | null;
  original_filing_locked?: boolean;
  original_tax_amount?: string | null;
  sec34_warning?: string | null;
}

interface SupplierAlert {
  recordId: string;
  docNum: string;
  customerGstin: string;
  taxImpact: string;
  warning: string;
}

interface ReversalEntry {
  id: string;
  entry_type: 'REVERSAL_4B2' | 'RECLAIM_4D1';
  rule_code: string;
  return_period: string;
  entry_date: string;
  doc_num: string | null;
  igst_amount: string;
  cgst_amount: string;
  sgst_amount: string;
  parent_reversal_id: string | null;
  rationale: string;
}

export default function ImsConsolePage() {
  const { activeEntity, activeClient, activePeriod } = useWorkspace();
  const { authFetch } = useAuth();
  const [viewMode, setViewMode] = useState<'RECIPIENT' | 'SUPPLIER' | 'BYPASS'>('RECIPIENT');
  const [records, setRecords] = useState<ImsRecord[]>([]);
  const [supplierAlerts, setSupplierAlerts] = useState<SupplierAlert[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ImsRecord | null>(null);
  const [post14thAlert, setPost14thAlert] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [partialReversalOpen, setPartialReversalOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState('');
  const [workingPaperOpen, setWorkingPaperOpen] = useState(false);
  const [workingPaper, setWorkingPaper] = useState<any | null>(null);
  const [reversals, setReversals] = useState<ReversalEntry[]>([]);
  const [revModalOpen, setRevModalOpen] = useState(false);
  const [revForm, setRevForm] = useState({
    entryType: 'REVERSAL_4B2' as 'REVERSAL_4B2' | 'RECLAIM_4D1',
    ruleCode: 'RULE_37A',
    igstAmount: '0.00',
    cgstAmount: '0.00',
    sgstAmount: '0.00',
    parentReversalId: '',
    rationale: '',
  });
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const gstin = activeClient?.gstin ?? activeEntity?.gstins[0]?.gstin ?? '03AABCS1429B1Z2';
  const period = activePeriod;

  const fetchRecords = () => {
    setLoading(true);
    authFetch(`/api/v1/gst/${gstin}/ims/actions?period=${period}&view=${viewMode}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.queue) {
          setRecords(data.queue);
          setSelectedRecord(data.queue[0] ?? null);
        } else {
          setRecords([]);
          setSelectedRecord(null);
        }
        setSupplierAlerts(Array.isArray(data.supplierAlerts) ? data.supplierAlerts : []);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  };

  const fetchReversals = () => {
    authFetch(`/api/v1/gst/${gstin}/itc-reversals?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.entries) setReversals(data.entries);
      })
      .catch(() => null);
  };

  useEffect(() => {
    fetchRecords();
    fetchReversals();
  }, [gstin, period, viewMode]);

  const handleApplyAction = async (action: 'A' | 'R' | 'P' | 'NONE', itcReversalAmount?: string) => {
    const targets = selectedIds.length > 0 ? selectedIds : selectedRecord ? [selectedRecord.id] : [];
    if (targets.length === 0) return;

    setStatusBanner(null);
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
        setStatusBanner(resData.message || 'Error processing IMS action.');
        return;
      }

      if (resData.recomputeGstr2bRequired) setPost14thAlert(true);
      setSelectedIds([]);
      fetchRecords();
      fetchReversals();
    } catch (err: any) {
      setStatusBanner(err.message || 'Failed to update IMS actions.');
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
        setStatusBanner('GSTR-2B recomputed cleanly. GSTR-3B auto-draft lock cleared.');
      }
    } finally {
      setRecomputing(false);
    }
  };

  const openWorkingPaper = async () => {
    const res = await authFetch(`/api/v1/gst/${gstin}/ims/${period}/working-paper?format=json`);
    if (res.ok) {
      const data = await res.json();
      setWorkingPaper(data.workingPaper);
      setWorkingPaperOpen(true);
    }
  };

  const submitReversalEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusBanner(null);
    const res = await authFetch(`/api/v1/gst/${gstin}/itc-reversals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...revForm,
        period,
        docNum: selectedRecord?.doc_num,
        supplierGstin: selectedRecord?.supplier_gstin,
        parentReversalId: revForm.entryType === 'RECLAIM_4D1' ? revForm.parentReversalId : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatusBanner(data.message || 'Failed to save Rule 37A register entry.');
      return;
    }
    setRevModalOpen(false);
    setRevForm({
      entryType: 'REVERSAL_4B2',
      ruleCode: 'RULE_37A',
      igstAmount: '0.00',
      cgstAmount: '0.00',
      sgstAmount: '0.00',
      parentReversalId: '',
      rationale: '',
    });
    fetchReversals();
  };

  const pendingBlockedByDownward = Boolean(
    selectedRecord?.is_downward_amendment && selectedRecord?.original_filing_locked,
  );
  const resetCount = records.filter((r) => r.ims_reset_detected).length;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <GstCommandBar currentStep="RECONCILED" />

      {statusBanner && (
        <div role="status" className="rounded-2xl border border-pos-line bg-pos-surface px-4 py-3 text-[13px] font-medium text-pos-ink shadow-sm">
          {statusBanner}
        </div>
      )}

      {resetCount > 0 && viewMode === 'RECIPIENT' && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-[13px] text-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Supplier Modified: Re-Action Required ({resetCount} document{resetCount === 1 ? '' : 's'})</p>
            <p className="text-[12px] opacity-85">
              Suppliers modified values before filing and GSTN reset your earlier Accepted/Rejected/Pending status to None. Review the amber-badged rows below before recomputing 2B.
            </p>
          </div>
        </div>
      )}

      {viewMode === 'SUPPLIER' && supplierAlerts.length > 0 && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-[13px] text-red-950 dark:text-red-200 space-y-1.5">
          <p className="font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-600" />
            Buyer Rejected Credit Note (Sec 34(2)): Output tax liability will increase in next period GSTR-3B unless resolved.
          </p>
          <p className="text-[12px] opacity-85">
            {supplierAlerts.length} Credit Note(s) rejected by buyers in {period}. Resolve or amend via GSTR-1A prior to filing GSTR-3B.
          </p>
        </div>
      )}

      {post14thAlert && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-[13px] text-amber-950 dark:text-amber-200 shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold text-[14px]">Recompute GSTR-2B Required Before Filing 3B</p>
              <p className="text-[12px] opacity-85">
                IMS actions were updated after the 14th cutoff. GSTR-3B stays locked until GSTR-2B is recomputed.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
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

      {/* Main Layout */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 w-full min-w-0">
        <div className="xl:col-span-8 w-full min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pos-line bg-pos-surface p-3 shadow-sm">
            <div className="flex flex-wrap items-center rounded-xl border border-pos-line bg-pos-muted/50 p-1 gap-1 text-[12.5px] font-medium">
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
                IMPG &amp; ISD Bucket
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openWorkingPaper}
                className="flex items-center gap-1.5 rounded-xl border border-pos-line bg-pos-surface px-3 py-1.5 text-[12px] font-semibold text-pos-ink hover:bg-pos-muted"
              >
                <FileText className="h-3.5 w-3.5" /> Monthly IMS Working Paper
              </button>
              <a
                href={`/api/v1/gst/${gstin}/ims/${period}/working-paper?format=csv`}
                download
                className="flex items-center gap-1.5 rounded-xl border border-pos-line bg-pos-surface px-3 py-1.5 text-[12px] font-semibold text-pos-ink hover:bg-pos-muted"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" /> Working Paper CSV
              </a>
            </div>
          </div>

          {viewMode === 'RECIPIENT' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleApplyAction('A')}
                className="rounded-xl bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700"
              >
                Accept (A)
              </button>
              <button
                type="button"
                onClick={() => handleApplyAction('R')}
                className="rounded-xl bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-red-700"
              >
                Reject (R)
              </button>
              <button
                type="button"
                onClick={() => handleApplyAction('P')}
                className="rounded-xl bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-amber-700"
              >
                Pending (P)
              </button>
              <button
                type="button"
                onClick={() => handleApplyAction('NONE')}
                className="rounded-xl border border-pos-line px-2.5 py-1.5 text-[12px] font-semibold text-pos-ink hover:bg-pos-muted"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setRevModalOpen(true)}
                className="ml-auto flex items-center gap-1.5 rounded-xl border border-pos-line bg-pos-surface px-3 py-1.5 text-[12px] font-semibold text-pos-ink hover:bg-pos-muted"
              >
                <Landmark className="h-3.5 w-3.5" /> Log Rule 37A Reversal / Reclaim
              </button>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-pos-line bg-pos-surface shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[#141619] text-white text-[11.5px] uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-3 py-3 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === records.length && records.length > 0}
                        onChange={(e) => setSelectedIds(e.target.checked ? records.map((r) => r.id) : [])}
                        className="rounded"
                        aria-label="Select all IMS documents"
                      />
                    </th>
                    <th className="px-3 py-3">Doc Ref</th>
                    <th className="px-4 py-3">Counterparty</th>
                    <th className="px-3 py-3 text-right">Taxable (&#8377;)</th>
                    <th className="px-3 py-3 text-right">Tax (&#8377;)</th>
                    <th className="px-3 py-3 text-center">Status &amp; Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pos-line font-sans">
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-pos-ink/50">
                        {loading ? 'Fetching IMS queue...' : `No documents in ${viewMode.toLowerCase()} queue for ${period}`}
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
                          className={`cursor-pointer transition-colors ${isSelected ? 'bg-pos-tint font-medium' : 'hover:bg-pos-muted/50'}`}
                        >
                          <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) =>
                                setSelectedIds(e.target.checked ? [...selectedIds, rec.id] : selectedIds.filter((id) => id !== rec.id))
                              }
                              className="rounded"
                              aria-label={`Select document ${rec.doc_num}`}
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
                          <td className="px-3 py-3 text-center space-y-1">
                            <div>
                              {rec.ims_action_status === 'A' ? (
                                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">Accepted (A)</span>
                              ) : rec.ims_action_status === 'R' ? (
                                <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-[11px] font-bold text-red-700">Rejected (R)</span>
                              ) : rec.ims_action_status === 'P' ? (
                                <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">Pending (P)</span>
                              ) : (
                                <span className="rounded-full bg-pos-muted px-2.5 py-0.5 text-[11px] font-bold text-pos-ink/60">None</span>
                              )}
                            </div>
                            {rec.ims_reset_detected && (
                              <div className="inline-block rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                                Supplier Modified: Re-Action Required
                              </div>
                            )}
                            {rec.is_downward_amendment && rec.original_filing_locked && (
                              <div className="inline-block rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                                Downward Amendment (No Pending)
                              </div>
                            )}
                            {rec.sec34_warning && (
                              <div className="inline-block rounded-full bg-red-600/15 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                                Sec 34(2) Risk
                              </div>
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

          {/* Rule 37A Reversal & Reclaim Audit Register */}
          <div className="rounded-2xl border border-pos-line bg-pos-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-pos-line">
              <div>
                <h2 className="text-[14px] font-semibold text-pos-ink">Table 4(B)(2) Reversal &amp; Table 4(D)(1) Reclaim Register</h2>
                <p className="text-[12px] text-pos-ink/60">Dated Rule 37A audit log linking every 4(D)(1) reclaim to its original 4(B)(2) reversal.</p>
              </div>
              <button
                type="button"
                onClick={() => setRevModalOpen(true)}
                className="rounded-xl bg-pos-accent px-3 py-1.5 text-[12px] font-semibold text-white"
              >
                New Register Entry
              </button>
            </div>
            {reversals.length === 0 ? (
              <p className="py-4 text-[12.5px] text-pos-ink/50">No Table 4(B)(2) reversals or 4(D)(1) reclaims logged for {period}.</p>
            ) : (
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="text-pos-ink/60 border-b border-pos-line">
                    <tr>
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Table</th>
                      <th className="py-2 pr-3">Rule</th>
                      <th className="py-2 pr-3">Doc Ref</th>
                      <th className="py-2 pr-3 text-right">IGST</th>
                      <th className="py-2 pr-3 text-right">CGST+SGST</th>
                      <th className="py-2">Rationale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pos-line">
                    {reversals.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 pr-3 font-mono">{r.entry_date}</td>
                        <td className="py-2 pr-3 font-semibold">{r.entry_type === 'REVERSAL_4B2' ? '4(B)(2) Reversal' : '4(D)(1) Reclaim'}</td>
                        <td className="py-2 pr-3">{r.rule_code}</td>
                        <td className="py-2 pr-3 font-mono">{r.doc_num ?? 'Period level'}</td>
                        <td className="py-2 pr-3 text-right font-mono tabular-nums">&#8377;{r.igst_amount}</td>
                        <td className="py-2 pr-3 text-right font-mono tabular-nums">
                          &#8377;{(Number(r.cgst_amount) + Number(r.sgst_amount)).toFixed(2)}
                        </td>
                        <td className="py-2 text-pos-ink/75">{r.rationale}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Inspector Card */}
        <div className="xl:col-span-4 w-full min-w-0 space-y-4">
          <div className="rounded-2xl border border-pos-line bg-pos-surface p-5 shadow-sm space-y-4 text-pos-ink">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <span className="text-[12px] font-bold uppercase tracking-wider text-pos-ink/60">IMS Inspector</span>
              <span className="font-mono text-[13px] font-bold text-pos-accent">{selectedRecord?.doc_num ?? 'N/A'}</span>
            </div>

            {selectedRecord ? (
              <div className="space-y-3.5 text-[12.5px]">
                {selectedRecord.sec34_warning && (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-800 dark:text-red-200">
                    {selectedRecord.sec34_warning}
                  </div>
                )}

                {selectedRecord.doc_type === 'CRN' && viewMode === 'RECIPIENT' && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px]">
                    <span className="font-semibold text-amber-800 dark:text-amber-300 block">1-Period Credit Note Rule</span>
                    <span className="text-pos-ink/75">
                      Credit Notes cannot stay Pending (P) for more than 1 period. Pending count: {selectedRecord.ims_pending_period_count}/1.
                    </span>
                  </div>
                )}

                {pendingBlockedByDownward && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[12px]">
                    <span className="font-semibold text-red-700 block">Downward Amendment Pending Locked</span>
                    <span className="text-pos-ink/80">
                      Original document ({selectedRecord.original_doc_num ?? 'original'}) was Accepted (A) and its GSTR-3B is filed. Choose Accept (A) or Reject (R).
                    </span>
                  </div>
                )}

                <div>
                  <span className="text-pos-ink/50 text-[11px] block">Counterparty</span>
                  <p className="font-semibold text-pos-ink text-[13px]">{selectedRecord.supplier_trade_name || 'Vendor'}</p>
                  <p className="font-mono text-pos-ink/60 text-[12px]">{selectedRecord.supplier_gstin}</p>
                  {selectedRecord.normalized_invoice_key && (
                    <p className="mt-1 font-mono text-[11px] text-pos-ink/50">
                      Match key: {selectedRecord.normalized_invoice_key}
                    </p>
                  )}
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

                {viewMode === 'RECIPIENT' && (
                  <div className="pt-2 space-y-2">
                    <button
                      type="button"
                      onClick={() => setPartialReversalOpen(true)}
                      className="w-full rounded-xl border border-pos-line py-2 text-[12px] font-semibold text-pos-ink hover:bg-pos-muted transition-colors"
                    >
                      Accept with Partial Reversal (Table 4B(2))
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
                        disabled={pendingBlockedByDownward}
                        title={
                          pendingBlockedByDownward
                            ? 'Pending is blocked on downward amendments when the original document was Accepted (A) and GSTR-3B is filed.'
                            : 'Keep document in Pending (P) status'
                        }
                        onClick={() => handleApplyAction('P')}
                        className="rounded-xl bg-amber-600 py-2 text-[12px] font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Pending
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-pos-ink/50 py-4 text-center">Select a document to inspect statutory IMS actions</p>
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
              Enter specific ITC amount to reverse under Table 4(B)(2). Leaving blank performs full acceptance.
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

      {/* Rule 37A Reversal / Reclaim Modal */}
      {revModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <form onSubmit={submitReversalEntry} className="w-full max-w-md rounded-2xl border border-pos-line bg-pos-surface p-6 shadow-xl space-y-3 text-pos-ink">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-[15px]">Log Table 4(B)(2) Reversal or 4(D)(1) Reclaim</h3>
              <button type="button" onClick={() => setRevModalOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <label className="space-y-1">
                <span>Entry Type</span>
                <select
                  value={revForm.entryType}
                  onChange={(e) => setRevForm({ ...revForm, entryType: e.target.value as 'REVERSAL_4B2' | 'RECLAIM_4D1' })}
                  className="w-full rounded-xl border border-pos-line bg-pos-surface px-3 py-2"
                >
                  <option value="REVERSAL_4B2">Table 4(B)(2) Reversal</option>
                  <option value="RECLAIM_4D1">Table 4(D)(1) Reclaim</option>
                </select>
              </label>
              <label className="space-y-1">
                <span>Rule</span>
                <select
                  value={revForm.ruleCode}
                  onChange={(e) => setRevForm({ ...revForm, ruleCode: e.target.value })}
                  className="w-full rounded-xl border border-pos-line bg-pos-surface px-3 py-2"
                >
                  <option value="RULE_37A">Rule 37A (Supplier non-filing)</option>
                  <option value="RULE_37">Rule 37 (180-day non-payment)</option>
                  <option value="RULE_42">Rule 42 (Common inputs)</option>
                  <option value="RULE_43">Rule 43 (Capital goods)</option>
                  <option value="IMS_PARTIAL">IMS Partial Reversal</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
            </div>
            {revForm.entryType === 'RECLAIM_4D1' && (
              <label className="block space-y-1 text-[12px]">
                <span>Linked Table 4(B)(2) Reversal Entry</span>
                <select
                  required
                  value={revForm.parentReversalId}
                  onChange={(e) => setRevForm({ ...revForm, parentReversalId: e.target.value })}
                  className="w-full rounded-xl border border-pos-line bg-pos-surface px-3 py-2"
                >
                  <option value="">Select exact reversal entry...</option>
                  {reversals
                    .filter((r) => r.entry_type === 'REVERSAL_4B2')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.entry_date} | {r.rule_code} | IGST &#8377;{r.igst_amount} CGST &#8377;{r.cgst_amount} SGST &#8377;{r.sgst_amount}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <div className="grid grid-cols-3 gap-2 text-[12px]">
              <label className="space-y-1">
                <span>IGST (&#8377;)</span>
                <input value={revForm.igstAmount} onChange={(e) => setRevForm({ ...revForm, igstAmount: e.target.value })} className="w-full rounded-xl border border-pos-line bg-pos-surface px-2.5 py-1.5 font-mono" />
              </label>
              <label className="space-y-1">
                <span>CGST (&#8377;)</span>
                <input value={revForm.cgstAmount} onChange={(e) => setRevForm({ ...revForm, cgstAmount: e.target.value })} className="w-full rounded-xl border border-pos-line bg-pos-surface px-2.5 py-1.5 font-mono" />
              </label>
              <label className="space-y-1">
                <span>SGST (&#8377;)</span>
                <input value={revForm.sgstAmount} onChange={(e) => setRevForm({ ...revForm, sgstAmount: e.target.value })} className="w-full rounded-xl border border-pos-line bg-pos-surface px-2.5 py-1.5 font-mono" />
              </label>
            </div>
            <label className="block space-y-1 text-[12px]">
              <span>Audit Rationale</span>
              <input
                required
                value={revForm.rationale}
                onChange={(e) => setRevForm({ ...revForm, rationale: e.target.value })}
                placeholder="e.g. Supplier GSTR-3B not filed by 30 Nov (Rule 37A)"
                className="w-full rounded-xl border border-pos-line bg-pos-surface px-3 py-2"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2 border-t border-pos-line">
              <button type="button" onClick={() => setRevModalOpen(false)} className="rounded-xl border border-pos-line px-3 py-1.5 text-[12px]">Cancel</button>
              <button type="submit" className="rounded-xl bg-pos-accent px-4 py-1.5 text-[12px] font-semibold text-white">Save Entry</button>
            </div>
          </form>
        </div>
      )}

      {/* Printable Monthly IMS Working Paper Modal */}
      {workingPaperOpen && workingPaper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-pos-line bg-pos-surface p-6 shadow-xl space-y-4 text-pos-ink max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <div>
                <h3 className="text-[16px] font-semibold">Monthly IMS Working Paper: {workingPaper.period}</h3>
                <p className="text-[12px] text-pos-ink/60">{workingPaper.legalName} ({workingPaper.gstin})</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1 rounded-xl border border-pos-line px-3 py-1.5 text-[12px] font-semibold"
                >
                  <Printer className="h-3.5 w-3.5" /> Print / PDF
                </button>
                <button type="button" onClick={() => setWorkingPaperOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12px]">
              <div className="rounded-xl border border-pos-line p-3">
                <span className="text-pos-ink/60 block">Accepted / Deemed ITC</span>
                <span className="text-[16px] font-bold font-mono">&#8377;{workingPaper.summary.acceptedTax}</span>
                <span className="text-[11px] text-pos-ink/50 block">{workingPaper.summary.acceptedAndDeemedCount} docs</span>
              </div>
              <div className="rounded-xl border border-pos-line p-3">
                <span className="text-pos-ink/60 block">Pending (Carried Over)</span>
                <span className="text-[16px] font-bold font-mono text-amber-600">&#8377;{workingPaper.summary.pendingTax}</span>
                <span className="text-[11px] text-pos-ink/50 block">{workingPaper.summary.pendingCount} docs</span>
              </div>
              <div className="rounded-xl border border-pos-line p-3">
                <span className="text-pos-ink/60 block">Rejected</span>
                <span className="text-[16px] font-bold font-mono text-red-600">&#8377;{workingPaper.summary.rejectedTax}</span>
                <span className="text-[11px] text-pos-ink/50 block">{workingPaper.summary.rejectedCount} docs</span>
              </div>
              <div className="rounded-xl border border-pos-line p-3">
                <span className="text-pos-ink/60 block">IMPG Imports + ISD</span>
                <span className="text-[16px] font-bold font-mono">&#8377;{(Number(workingPaper.summary.impgTax) + Number(workingPaper.summary.isdTax)).toFixed(2)}</span>
              </div>
              <div className="rounded-xl border border-pos-line p-3">
                <span className="text-pos-ink/60 block">4(B)(2) Reversals</span>
                <span className="text-[16px] font-bold font-mono">&#8377;{workingPaper.summary.table4b2Reversals}</span>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <span className="text-emerald-800 dark:text-emerald-300 block font-medium">Net GSTR-3B ITC Flow</span>
                <span className="text-[16px] font-bold font-mono text-emerald-700 dark:text-emerald-300">&#8377;{workingPaper.summary.net3bItcFlow}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              <span>Generated at {workingPaper.generatedAt} for partner sign-off and audit retention.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
