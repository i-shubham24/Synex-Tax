'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Plus,
  ShieldCheck,
  AlertTriangle,
  Lock,
  ArrowRight,
  Download,
  Edit3,
  X,
  CheckCircle2,
} from 'lucide-react';
import { GstCommandBar } from '../../../../components/gst/GstCommandBar';
import { useWorkspace } from '../../../../workspace/WorkspaceContext';
import { useAuth } from '../../../../context/AuthContext';

interface InvoiceItem {
  id: string;
  invoice_num: string;
  invoice_date: string;
  doc_type: string;
  customer_gstin: string | null;
  customer_legal_name: string | null;
  pos_state_code: string;
  taxable_value: string;
  igst_amount: string;
  cgst_amount: string;
  sgst_amount: string;
  total_invoice_value: string;
  table_section: string;
  is_amendment: boolean;
  revision_no: number;
}

export default function Gstr1Page() {
  const { activeEntity, activeClient, activePeriod } = useWorkspace();
  const { authFetch } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('B2B 4A');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);
  const [gstr1aOpen, setGstr1aOpen] = useState(false);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [amendedValue, setAmendedValue] = useState('');
  const [amendmentSuccess, setAmendmentSuccess] = useState<string | null>(null);

  const gstin = activeClient?.gstin ?? activeEntity?.gstins[0]?.gstin ?? '03AABCS1429B1Z2';
  const period = activePeriod;

  useEffect(() => {
    setLoading(true);
    authFetch(`/api/v1/gst/${gstin}/sales?period=${period}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.invoices) {
          setInvoices(data.invoices);
          if (data.invoices.length > 0) setSelectedInvoice(data.invoices[0]);
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [gstin, period]);

  const tabs = [
    'All',
    'B2B 4A',
    'B2CL 5A',
    'B2CS 7',
    'Exports 6A',
    'CDNR 9B',
    'Amendments 9A/9C',
    'HSN Table 12',
    'Doc Table 13',
  ];

  const filteredInvoices = invoices.filter((inv) => {
    if (activeTab === 'All') return true;
    if (activeTab === 'B2B 4A') return inv.table_section === '4A' || inv.table_section === '4B';
    if (activeTab === 'CDNR 9B') return inv.doc_type === 'CRN' || inv.doc_type === 'DBN';
    if (activeTab === 'Amendments 9A/9C') return inv.is_amendment;
    return true;
  });

  const handleApplyGstr1a = async () => {
    if (!selectedInvoice) return;
    try {
      const res = await authFetch(`/api/v1/gst/${gstin}/gstr1a/${period}/amend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amendments: [
            {
              originalInvoiceId: selectedInvoice.id,
              invoiceNum: selectedInvoice.invoice_num,
              invoiceDate: selectedInvoice.invoice_date,
              docType: selectedInvoice.doc_type,
              taxableValue: amendedValue || selectedInvoice.taxable_value,
              igstAmount: selectedInvoice.igst_amount,
              cgstAmount: selectedInvoice.cgst_amount,
              sgstAmount: selectedInvoice.sgst_amount,
              totalInvoiceValue: selectedInvoice.total_invoice_value,
              customerGstin: selectedInvoice.customer_gstin,
              posStateCode: selectedInvoice.pos_state_code,
              amendmentReason: amendmentReason || 'Auditor revision prior to GSTR-3B',
            },
          ],
        }),
      });
      const resData = await res.json();
      if (res.ok) {
        setAmendmentSuccess('GSTR-1A amendment recorded. Revision incremented to R' + (selectedInvoice.revision_no + 1));
        setGstr1aOpen(false);
      } else {
        alert(resData.message || 'Error creating GSTR-1A amendment');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <GstCommandBar currentStep="VALIDATED" />

      {/* Screen B Layout: 72% Table + 28% Floating Inspector */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 w-full min-w-0">
        <div className="xl:col-span-8 w-full min-w-0 space-y-4">
          {/* Section Tabs */}
          <div className="flex overflow-x-auto rounded-xl border border-pos-line bg-pos-surface p-1.5 gap-1">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-colors ${
                  activeTab === tab
                    ? 'bg-pos-accent text-white shadow-xs'
                    : 'text-pos-ink/70 hover:bg-pos-muted hover:text-pos-ink'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Alert Banner for single-shot GSTR-1A */}
          <div className="flex items-center justify-between rounded-xl border border-sky-500/30 bg-sky-500/10 p-3.5 text-[12.5px] text-pos-ink">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-sky-600 shrink-0" />
              <span>
                <strong>Single-Shot GSTR-1A Active:</strong> Unlocked between GSTR-1 filing and GSTR-3B offset.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (selectedInvoice) {
                  setAmendedValue(selectedInvoice.taxable_value);
                  setGstr1aOpen(true);
                }
              }}
              className="rounded-lg bg-sky-600 px-3 py-1 text-[11.5px] font-semibold text-white hover:bg-sky-700 transition-colors"
            >
              Amend via GSTR-1A
            </button>
          </div>

          {amendmentSuccess && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/15 p-3 text-[12.5px] text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{amendmentSuccess}</span>
            </div>
          )}

          {/* 72% Outward Invoices TanStack Table */}
          <div className="overflow-hidden rounded-2xl border border-pos-line bg-pos-surface shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[#141619] text-white text-[11.5px] uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3">Doc Ref</th>
                    <th className="px-4 py-3">Buyer &amp; GSTIN</th>
                    <th className="px-3 py-3">POS</th>
                    <th className="px-4 py-3 text-right">Taxable (&#8377;)</th>
                    <th className="px-4 py-3 text-right">Tax (&#8377;)</th>
                    <th className="px-3 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pos-line font-sans">
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-pos-ink/50">
                        {loading ? 'Fetching sales invoices...' : 'No invoices found for this section in period ' + period}
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => {
                      const isSelected = selectedInvoice?.id === inv.id;
                      const taxTotal = (
                        Number(inv.igst_amount || 0) +
                        Number(inv.cgst_amount || 0) +
                        Number(inv.sgst_amount || 0)
                      ).toFixed(2);

                      return (
                        <tr
                          key={inv.id}
                          onClick={() => setSelectedInvoice(inv)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-pos-tint font-medium' : 'hover:bg-pos-muted/50'
                          }`}
                        >
                          <td className="px-4 py-3 font-mono text-[12px] tabular-nums font-semibold text-pos-ink">
                            <div>{inv.invoice_num}</div>
                            <div className="text-[11px] font-normal text-pos-ink/50">{inv.invoice_date}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-pos-ink line-clamp-1">
                              {inv.customer_legal_name || 'B2C Counterparty'}
                            </div>
                            <div className="font-mono text-[11.5px] text-pos-ink/50 tabular-nums">
                              {inv.customer_gstin || 'Unregistered'}
                            </div>
                          </td>
                          <td className="px-3 py-3 font-mono text-[12px] text-pos-ink/70">
                            State ({inv.pos_state_code})
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-[12.5px] tabular-nums text-pos-ink">
                            &#8377;{Number(inv.taxable_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-[12.5px] tabular-nums text-emerald-600 font-semibold">
                            &#8377;{Number(taxTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {inv.is_amendment ? (
                              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-bold text-amber-700">
                                R{inv.revision_no} GSTR-1A
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">
                                Validated
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
              <span className="text-[12px] font-bold uppercase tracking-wider text-pos-ink/60">Selected Invoice</span>
              <span className="font-mono text-[13px] font-bold text-pos-accent">
                {selectedInvoice?.invoice_num ?? 'N/A'}
              </span>
            </div>

            {selectedInvoice ? (
              <div className="space-y-3.5 text-[12.5px]">
                <div>
                  <span className="text-pos-ink/50 block text-[11px]">Customer &amp; Recipient</span>
                  <p className="font-semibold text-pos-ink text-[13px]">{selectedInvoice.customer_legal_name || 'B2C'}</p>
                  <p className="font-mono text-pos-ink/60 text-[12px]">{selectedInvoice.customer_gstin || 'None'}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl bg-pos-muted/40 p-3">
                  <div>
                    <span className="text-[11px] text-pos-ink/50">Doc Type</span>
                    <p className="font-semibold text-pos-ink">{selectedInvoice.doc_type}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-pos-ink/50">POS State</span>
                    <p className="font-semibold text-pos-ink">State {selectedInvoice.pos_state_code}</p>
                  </div>
                </div>

                <div className="space-y-1.5 border-t border-pos-line pt-3">
                  <div className="flex justify-between">
                    <span className="text-pos-ink/60">Taxable Amount:</span>
                    <span className="font-mono font-medium text-pos-ink tabular-nums">
                      &#8377;{Number(selectedInvoice.taxable_value).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-pos-ink/60">Central Tax (CGST):</span>
                    <span className="font-mono text-pos-ink tabular-nums">
                      &#8377;{Number(selectedInvoice.cgst_amount).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-pos-ink/60">State Tax (SGST):</span>
                    <span className="font-mono text-pos-ink tabular-nums">
                      &#8377;{Number(selectedInvoice.sgst_amount).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-pos-ink/60">Integrated Tax (IGST):</span>
                    <span className="font-mono text-pos-ink tabular-nums">
                      &#8377;{Number(selectedInvoice.igst_amount).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-pos-line pt-2 font-bold text-[13px]">
                    <span className="text-pos-ink">Total Value:</span>
                    <span className="font-mono text-emerald-600 tabular-nums">
                      &#8377;{Number(selectedInvoice.total_invoice_value).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAmendedValue(selectedInvoice.taxable_value);
                      setGstr1aOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-pos-head py-2.5 text-[12.5px] font-semibold text-white hover:opacity-90 transition-opacity"
                  >
                    <Edit3 className="h-4 w-4" />
                    <span>Single-Shot GSTR-1A Amendment</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-pos-ink/50 py-4 text-center">Select an invoice to inspect statutory tax heads</p>
            )}
          </div>
        </div>
      </div>

      {/* GSTR-1A Amendment Modal Drawer */}
      {gstr1aOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-pos-line bg-pos-surface p-6 shadow-xl space-y-4 text-pos-ink">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <div>
                <h3 className="font-display font-semibold text-[16px]">GSTR-1A Invoice Amendment</h3>
                <p className="text-[12px] text-pos-ink/50">Revision R{selectedInvoice.revision_no + 1} for period {period}</p>
              </div>
              <button type="button" onClick={() => setGstr1aOpen(false)} className="text-pos-ink/50 hover:text-pos-ink">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-[13px]">
              <div>
                <label className="text-[12px] font-medium text-pos-ink/70">Invoice Reference</label>
                <input
                  readOnly
                  value={selectedInvoice.invoice_num}
                  className="mt-1 w-full rounded-xl border border-pos-line bg-pos-muted px-3 py-2 font-mono text-[13px]"
                />
              </div>

              <div>
                <label className="text-[12px] font-medium text-pos-ink/70">Revised Taxable Value (&#8377;)</label>
                <input
                  type="text"
                  value={amendedValue}
                  onChange={(e) => setAmendedValue(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-pos-line bg-pos-surface px-3 py-2 font-mono text-[13px] outline-none focus:border-pos-accent"
                />
              </div>

              <div>
                <label className="text-[12px] font-medium text-pos-ink/70">Statutory Amendment Rationale</label>
                <textarea
                  rows={3}
                  value={amendmentReason}
                  onChange={(e) => setAmendmentReason(e.target.value)}
                  placeholder="State reason for pre-3B value alteration..."
                  className="mt-1 w-full rounded-xl border border-pos-line bg-pos-surface p-3 text-[12.5px] outline-none focus:border-pos-accent"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-pos-line">
              <button
                type="button"
                onClick={() => setGstr1aOpen(false)}
                className="rounded-xl border border-pos-line px-4 py-2 text-[12.5px] font-semibold text-pos-ink hover:bg-pos-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyGstr1a}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-emerald-700"
              >
                Save GSTR-1A Amendment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
