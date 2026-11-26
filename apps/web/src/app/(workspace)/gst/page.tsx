'use client';

import Link from 'next/link';

import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Search,
  Filter,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Play,
  FileCheck2,
  X,
  Copy,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Send,
  Building,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

interface InvoiceRow {
  id: string;
  docNum: string;
  docDate: string;
  counterparty: string;
  gstin: string;
  pos: string;
  taxableValue: number;
  rate: string;
  cgst: number;
  sgst: number;
  igst: number;
  status: 'FILED' | 'PENDING' | 'MISMATCH' | 'RECONCILED';
  statusLabel: string;
}

const SAMPLE_INVOICES: InvoiceRow[] = [
  {
    id: 'row-1',
    docNum: 'INV/26-27/084',
    docDate: '2025-11-04',
    counterparty: 'Jalandhar Forgings Ltd',
    gstin: '03BBBBB9999B1Z1',
    pos: 'Punjab (03)',
    taxableValue: 150000.0,
    rate: '18%',
    cgst: 13500.0,
    sgst: 13500.0,
    igst: 0.0,
    status: 'FILED',
    statusLabel: 'Filed',
  },
  {
    id: 'row-2',
    docNum: 'INV/26-27/085',
    docDate: '2025-11-06',
    counterparty: 'Apex Cloud Solutions Delhi',
    gstin: '07BBBPG4512D1ZR',
    pos: 'Delhi (07)',
    taxableValue: 250000.0,
    rate: '18%',
    cgst: 0.0,
    sgst: 0.0,
    igst: 45000.0,
    status: 'RECONCILED',
    statusLabel: 'Matched',
  },
  {
    id: 'row-3',
    docNum: 'INV/26-27/086',
    docDate: '2025-11-08',
    counterparty: 'Golden Temple Roadways Transport',
    gstin: '03CCCPM8891B1Z2',
    pos: 'Punjab (03)',
    taxableValue: 95000.0,
    rate: '12%',
    cgst: 5700.0,
    sgst: 5700.0,
    igst: 0.0,
    status: 'PENDING',
    statusLabel: 'IMS Pending',
  },
  {
    id: 'row-4',
    docNum: 'CRN/26-27/012',
    docDate: '2025-11-10',
    counterparty: 'Amritsar Textile Mill Supplier',
    gstin: '03AAACA1294F1Z3',
    pos: 'Punjab (03)',
    taxableValue: -20000.0,
    rate: '18%',
    cgst: -1800.0,
    sgst: -1800.0,
    igst: 0.0,
    status: 'MISMATCH',
    statusLabel: 'Mismatch',
  },
  {
    id: 'row-5',
    docNum: 'INV/26-27/087',
    docDate: '2025-11-11',
    counterparty: 'Ludhiana Machinery Spares',
    gstin: '03AAECN9912A1ZX',
    pos: 'Punjab (03)',
    taxableValue: 85000.0,
    rate: '18%',
    cgst: 7650.0,
    sgst: 7650.0,
    igst: 0.0,
    status: 'RECONCILED',
    statusLabel: 'Matched',
  },
];

export default function MasterInvoicesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<InvoiceRow[]>(SAMPLE_INVOICES);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRowId, setSelectedRowId] = useState<string>('row-1');
  const [showSignModal, setShowSignModal] = useState<boolean>(false);
  const dialogCloseRef = React.useRef<HTMLButtonElement>(null);
  // The dialog takes focus when it opens and closes on Escape.
  useEffect(() => {
    if (!showSignModal) return;
    dialogCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShowSignModal(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSignModal]);
  const [auditNote, setAuditNote] = useState<string>('Pre-filing GSTR-3B reconciliation verified by Senior Partner.');
  const [cashOffsetInput, setCashOffsetInput] = useState<string>('24150.00');
  const [filingFeedback, setFilingFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSales() {
      try {
        const res = await fetch('/api/v1/gst/sales', { credentials: 'include' });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.data && json.data.invoices && json.data.invoices.length > 0) {
          const mapped: InvoiceRow[] = json.data.invoices.map((inv: any) => ({
            id: inv.id,
            docNum: inv.invoiceNum,
            docDate: inv.invoiceDate,
            counterparty: inv.customerName,
            gstin: inv.customerGstin || '03AAFCP4821K1Z5',
            pos: `State (${inv.pos})`,
            taxableValue: parseFloat(inv.taxableValue),
            rate: inv.igstAmount !== '0.00' ? '5%' : '5%',
            cgst: parseFloat(inv.cgstAmount),
            sgst: parseFloat(inv.sgstAmount),
            igst: parseFloat(inv.igstAmount),
            status: inv.status || 'FILED',
            statusLabel: inv.status === 'FILED' ? 'Filed' : 'Validated',
          }));
          setRows(mapped);
          if (mapped.length > 0) setSelectedRowId(mapped[0].id);
        }
      } catch {
        // preserve initial sample
      }
    }
    loadSales();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRow = rows.find((r) => r.id === selectedRowId) || rows[0];

  const filteredRows = rows.filter((row) => {
    if (filterStatus === 'PENDING' && row.status !== 'PENDING') return false;
    if (filterStatus === 'RECONCILED' && row.status !== 'RECONCILED') return false;
    if (filterStatus === 'FILED' && row.status !== 'FILED') return false;
    if (filterStatus === 'MISMATCH' && row.status !== 'MISMATCH') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        row.docNum.toLowerCase().includes(q) ||
        row.counterparty.toLowerCase().includes(q) ||
        row.gstin.toLowerCase().includes(q)
      );
    }
    return true;
  });


  return (
    <div className="w-full min-w-0 max-w-full space-y-4 font-sans">
      
      {/* 1. Filter Toolbar Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-[#17191C] p-3 sm:p-4 rounded-2xl border border-[#E5E7EB] dark:border-[#24272B] shadow-sm">
        
        {/* Left Segmented Status Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          {[
            { id: 'ALL', label: 'All Returns' },
            { id: 'PENDING', label: 'Draft / Pending' },
            { id: 'RECONCILED', label: 'Reconciled' },
            { id: 'FILED', label: 'Filed' },
            { id: 'MISMATCH', label: 'Mismatched' },
          ].map((tab) => {
            const isActive = filterStatus === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#2F8AE0] text-white shadow-sm'
                    : 'text-[#646A73] dark:text-[#9BA1AA] hover:bg-[#FAFAFB] dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Right Search Box & Filter Button */}
        <div className="flex items-center gap-2.5 flex-1 max-w-sm justify-end">
          <div className="relative w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search GSTIN, vendor, invoice no..."
              className="w-full bg-[#FAFAFB] dark:bg-[#0E0F10] border border-[#E5E7EB] dark:border-[#24272B] rounded-full pl-3.5 pr-8 py-1.5 text-xs font-sans text-[#0E0F10] dark:text-white focus:outline-none focus:border-[#2F8AE0]"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E5E7EB] dark:border-[#24272B] bg-white dark:bg-[#17191C] hover:bg-[#FAFAFB] text-xs font-mono text-[#0E0F10] dark:text-white shrink-0"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filter</span>
          </button>
        </div>

      </div>

      {filingFeedback && (
        <div className="p-3.5 rounded-xl bg-[#DCFCE7] text-[#15803D] border border-[#16A34A]/30 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{filingFeedback}</span>
        </div>
      )}

      {/* 2. Main Split Area: 72% Left Master Table + 28% Right Floating Inspector Card */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start w-full min-w-0">
        
        {/* Left Master Table (8 cols on XL, full width below XL) */}
        <div className="xl:col-span-8 w-full min-w-0 bg-white dark:bg-[#17191C] rounded-2xl border border-[#E5E7EB] dark:border-[#24272B] overflow-hidden shadow-sm flex flex-col">
          
          <div className="w-full min-w-0 overflow-x-auto flex-1 [scrollbar-width:thin] [scrollbar-color:rgba(120,120,120,0.2)_transparent]">
            <table className="w-full min-w-[700px] text-left text-xs border-collapse font-sans">
              
              {/* Solid Obsidian Header Bar (#141619) with Crisp White Bold Text */}
              <thead>
                <tr className="bg-[#141619] text-white text-[12px] tracking-wider">
                  <th className="py-3 px-4 rounded-tl-xl">
                    <div className="flex items-center gap-1 cursor-pointer">
                      <span>Doc Ref</span>
                      <span className="text-slate-400 text-[12px]">↕</span>
                    </div>
                  </th>
                  <th className="py-3 px-4">
                    <div className="flex items-center gap-1 cursor-pointer">
                      <span>Customer & GSTIN</span>
                      <span className="text-slate-400 text-[12px]">↕</span>
                    </div>
                  </th>
                  <th className="py-3 px-3">POS</th>
                  <th className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1 cursor-pointer">
                      <span>Taxable (₹)</span>
                      <span className="text-slate-400 text-[12px]">↕</span>
                    </div>
                  </th>
                  <th className="py-3 px-3 text-center">Rate</th>
                  <th className="py-3 px-4 text-right">Tax (₹)</th>
                  <th className="py-3 px-4 text-center rounded-tr-xl">Status</th>
                </tr>
              </thead>

              {/* Rows with Zebra Tinting and Ultra-Soft Sky Blue Selected Highlight */}
              <tbody className="divide-y divide-[#E5E7EB] dark:divide-[#24272B]">
                {filteredRows.map((row, idx) => {
                  const isSelected = row.id === selectedRowId;
                  const zebraBg = idx % 2 === 0 ? 'bg-white dark:bg-[#17191C]' : 'bg-[#F9FAFB] dark:bg-[#121417]';
                  const rowBg = isSelected ? 'bg-[#ECF4FD] dark:bg-[#2F8AE0]/15' : zebraBg;

                  let statusPill = 'bg-[#DCFCE7] text-[#15803D] dark:bg-[#15803D]/20 dark:text-[#5fe88a]';
                  if (row.status === 'PENDING') statusPill = 'bg-[#FEF3C7] text-[#B45309] dark:bg-[#B45309]/20 dark:text-[#f2b53a]';
                  if (row.status === 'MISMATCH') statusPill = 'bg-[#FEE2E2] text-[#B91C1C] dark:bg-[#B91C1C]/20 dark:text-[#f87171]';
                  if (row.status === 'RECONCILED') statusPill = 'bg-[#ECF4FD] text-[#2F8AE0] dark:bg-[#2F8AE0]/20 dark:text-[#52B0F8]';

                  const totalTax = row.cgst + row.sgst + row.igst;

                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedRowId(row.id)}
                      className={`cursor-pointer transition-colors h-12 ${rowBg} hover:bg-[#ECF4FD]/70`}
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-[#0E0F10] dark:text-white">
                        <div>{row.docNum}</div>
                        <div className="text-[12px] text-[#646A73] dark:text-[#9BA1AA] font-normal">{row.docDate}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#0E0F10] dark:text-white text-xs">{row.counterparty}</div>
                        <div className=" text-[12px] text-[#646A73] dark:text-[#9BA1AA]">{row.gstin}</div>
                      </td>

                      <td className="py-3 px-3 font-mono text-[12px] text-[#646A73] dark:text-[#9BA1AA]">
                        {row.pos}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-semibold text-[#0E0F10] dark:text-white tabular-nums">
                        ₹ {row.taxableValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3 px-3 text-center font-mono text-[12px]">
                        <span className="px-1.5 py-0.5 rounded bg-[#F1F5F9] dark:bg-slate-800 text-[#0E0F10] dark:text-white">
                          {row.rate}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-semibold text-[#16A34A] tabular-nums">
                        ₹ {totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[12px] font-mono font-semibold ${statusPill}`}>
                          {row.statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom Pagination Bar */}
          <div className="p-3.5 bg-white dark:bg-[#17191C] border-t border-[#E5E7EB] dark:border-[#24272B] flex items-center justify-between text-xs text-[#646A73] dark:text-[#9BA1AA]">
            <span>Showing 1 to {filteredRows.length} of {SAMPLE_INVOICES.length} invoices</span>

            <div className="flex items-center gap-1.5">
              <button className="px-2 py-1 rounded border border-[#E5E7EB] dark:border-[#24272B] hover:bg-slate-100 dark:hover:bg-slate-800">
                « Previous
              </button>
              <button className="w-6 h-6 rounded bg-[#141619] text-white font-semibold flex items-center justify-center">
                1
              </button>
              <button className="w-6 h-6 rounded border border-[#E5E7EB] dark:border-[#24272B] hover:bg-slate-100 flex items-center justify-center">
                2
              </button>
              <button className="px-2 py-1 rounded border border-[#E5E7EB] dark:border-[#24272B] hover:bg-slate-100 dark:hover:bg-slate-800">
                Next »
              </button>
            </div>
          </div>

        </div>

        {/* Right Elevated Floating Inspector Card (4 cols on XL, full width below XL) */}
        <div className="xl:col-span-4 w-full min-w-0 bg-white dark:bg-[#17191C] rounded-2xl border border-[#E5E7EB] dark:border-[#24272B] shadow-sm overflow-hidden space-y-4">
          
          {/* Solid Sky Cobalt Header Bar with Doc Ref & Expand Arrow */}
          <div className="bg-[#2F8AE0] text-white p-4 flex items-center justify-between">
            <div>
              <span className="text-[12px] font-semibold text-white/80 block">Selected invoice</span>
              <span className="text-sm font-semibold text-white">{selectedRow.docNum}</span>
            </div>
            <button
              onClick={() => setShowSignModal(true)}
              aria-label="Expand Document Verification"
              className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            
            {/* Metadata Pill Row */}
            <div className="p-3 rounded-xl bg-[#FAFAFB] dark:bg-[#0E0F10] border border-[#E5E7EB] dark:border-[#24272B] space-y-1">
              <div className="text-[12px] text-[#646A73] dark:text-[#9BA1AA]">
                Customer / Vendor Context
              </div>
              <div className="font-semibold text-xs text-[#0E0F10] dark:text-white truncate">{selectedRow.counterparty}</div>
              <div className="text-[12px] text-[#2F8AE0] font-semibold">{selectedRow.gstin}</div>
            </div>

            {/* Mini Solid Obsidian Breakdown Table */}
            <div className="rounded-xl overflow-hidden border border-[#24272B] text-xs">
              <div className="bg-[#141619] text-white p-2.5 grid grid-cols-12 font-semibold text-[12px] gap-2">
                <span className="col-span-6">Tax Head</span>
                <span className="col-span-2 text-center">Rate</span>
                <span className="col-span-4 text-right">Amount (₹)</span>
              </div>
              <div className="p-3 bg-white dark:bg-[#17191C] space-y-2 text-slate-700 dark:text-slate-300">
                <div className="grid grid-cols-12 items-center gap-2">
                  <span className="col-span-6 truncate text-xs">Central Tax (CGST):</span>
                  <span className="col-span-2 text-center text-xs">9%</span>
                  <span className="col-span-4 text-right font-semibold tabular-nums text-xs">₹ {selectedRow.cgst.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-12 items-center gap-2">
                  <span className="col-span-6 truncate text-xs">State Tax (SGST):</span>
                  <span className="col-span-2 text-center text-xs">9%</span>
                  <span className="col-span-4 text-right font-semibold tabular-nums text-xs">₹ {selectedRow.sgst.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-12 items-center gap-2">
                  <span className="col-span-6 truncate text-xs">Integrated Tax (IGST):</span>
                  <span className="col-span-2 text-center text-xs">18%</span>
                  <span className="col-span-4 text-right font-semibold tabular-nums text-xs">₹ {selectedRow.igst.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Full-Width Solid Obsidian Total Bar */}
            <div className="bg-[#141619] text-white p-3.5 rounded-xl flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Net Tax Value:</span>
              <span className="text-base font-semibold text-[#13A83C] tabular-nums">
                ₹ {(selectedRow.cgst + selectedRow.sgst + selectedRow.igst).toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>

            {/* Two Equal-Width Bottom Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => alert('Voucher held for clarification.')}
                className="py-2.5 rounded-xl bg-[#141619] hover:bg-[#0E0F10] text-white font-mono text-xs font-semibold transition-colors text-center"
              >
                Mark Pending
              </button>

              <button
                type="button"
                onClick={() => setShowSignModal(true)}
                className="py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-mono text-xs font-semibold transition-colors text-center shadow-md shadow-[#16A34A]/20"
              >
                Approve & File
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* 3. Screen C: Pre-Filing Reconciliation & Sign-Off Modal */}
      {showSignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="file-gst-title">
          <div className="w-full max-w-[520px] space-y-4 rounded-2xl border border-[#E5E7EB] bg-white p-6 text-[#0E0F10] dark:border-[#24272B] dark:bg-[#17191C] dark:text-white">
            <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] pb-3 dark:border-[#24272B]">
              <h3 id="file-gst-title" className="text-lg font-semibold">Offset and file a GST return</h3>
              <button ref={dialogCloseRef} type="button" aria-label="Close" onClick={() => setShowSignModal(false)} className="text-[#646A73] transition-colors hover:text-[#0E0F10] dark:hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-[#3F444B] dark:text-[#C4C9D0]">
              Offsetting liability and filing GSTR-1 or GSTR-3B happen on the GST portal: SynTax is not connected to a GST Suvidha Provider yet, so it cannot read the ledgers or file for you.
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-[#3F444B] dark:text-[#C4C9D0]">
              <li>Prepare the return and its tables under GST returns, and download the JSON for the portal.</li>
              <li>Record the partner&apos;s sign-off with the DSC under Audit, DSC signing.</li>
              <li>Offset and file on the GST portal with the client&apos;s DSC or EVC, then mark the return filed.</li>
            </ol>
            <div className="flex flex-wrap justify-end gap-2 border-t border-[#E5E7EB] pt-3 dark:border-[#24272B]">
              <Link href="/audit" className="rounded-xl border border-[#E5E7EB] px-4 py-2 text-xs font-semibold transition-colors hover:bg-[#F5F6F8] dark:border-[#24272B] dark:hover:bg-[#202327]">
                DSC sign-off
              </Link>
              <Link href="/gst/returns" className="rounded-xl bg-[#141619] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0E0F10]">
                Open GST returns
              </Link>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
