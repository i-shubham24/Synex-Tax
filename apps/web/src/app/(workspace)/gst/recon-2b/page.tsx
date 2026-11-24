'use client';

import { useState, useEffect } from 'react';
import {
  GitCompare,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ShieldAlert,
  Info,
  Check,
  RotateCcw,
  Send,
  Copy,
  X,
} from 'lucide-react';

interface ReconItem {
  id: string;
  status:
    | 'EXACT_MATCH'
    | 'FUZZY_MATCH'
    | 'VALUE_MISMATCH'
    | 'PURCHASE_NOT_IN_2B'
    | 'VENDOR_NOT_IN_PR';
  confidenceScore: number;
  supplierGstin: string;
  supplierName: string;
  prInvoiceNum?: string;
  portalDocNum?: string;
  invoiceDate: string;
  taxableValue: string;
  totalTax: string;
  cgst: string;
  sgst: string;
  igst: string;
  itcEligibility: 'ELIGIBLE' | 'INELIGIBLE_17_5' | 'INELIGIBLE_OTHER';
  imsAction: 'A' | 'R' | 'P' | 'NONE';
  isAmendedPostAcceptance?: boolean;
  originalTaxableValue?: string;
  originalTotalTax?: string;
  notes?: string;
}

const INITIAL_RECON_ITEMS: ReconItem[] = [
  {
    id: 'rec-1',
    status: 'FUZZY_MATCH',
    confidenceScore: 0.96,
    supplierGstin: '03AABCP1332L1Z4',
    supplierName: 'Amritsar Precision Steel Ltd',
    prInvoiceNum: 'INV/2025-26/089',
    portalDocNum: 'INV202526089',
    invoiceDate: '2025-11-04',
    taxableValue: '150000.00',
    totalTax: '27000.00',
    cgst: '13500.00',
    sgst: '13500.00',
    igst: '0.00',
    itcEligibility: 'ELIGIBLE',
    imsAction: 'A',
    notes: 'Pass 2 Fuzzy Match: Normalized FY token 2025-26 and stripped delimiters.',
  },
  {
    id: 'rec-2',
    status: 'EXACT_MATCH',
    confidenceScore: 1.0,
    supplierGstin: '07BBBPG4512D1ZR',
    supplierName: 'Apex Cloud Solutions Delhi',
    prInvoiceNum: 'ACS/25-26/0441',
    portalDocNum: 'ACS/25-26/0441',
    invoiceDate: '2025-11-05',
    taxableValue: '48000.00',
    totalTax: '8640.00',
    cgst: '0.00',
    sgst: '0.00',
    igst: '8640.00',
    itcEligibility: 'ELIGIBLE',
    imsAction: 'NONE',
    isAmendedPostAcceptance: true,
    originalTaxableValue: '40000.00',
    originalTotalTax: '7200.00',
    notes: 'Amended Post-Acceptance: Supplier increased taxable value by Rs 8,000 (Tax delta +Rs 1,440.00).',
  },
  {
    id: 'rec-3',
    status: 'EXACT_MATCH',
    confidenceScore: 1.0,
    supplierGstin: '03CCCPM8891B1Z2',
    supplierName: 'Golden Temple Roadways Transport',
    prInvoiceNum: 'GTR-9021',
    portalDocNum: 'GTR-9021',
    invoiceDate: '2025-11-08',
    taxableValue: '95000.00',
    totalTax: '11400.00',
    cgst: '5700.00',
    sgst: '5700.00',
    igst: '0.00',
    itcEligibility: 'INELIGIBLE_17_5',
    imsAction: 'NONE',
    notes: 'Section 17(5) Blocked Credit: Passenger transport vehicle. Must reject or reverse.',
  },
  {
    id: 'rec-4',
    status: 'PURCHASE_NOT_IN_2B',
    confidenceScore: 0.0,
    supplierGstin: '03AAECN9912A1ZX',
    supplierName: 'Ludhiana Machinery Spares',
    prInvoiceNum: 'LMS-202526-004',
    invoiceDate: '2025-11-10',
    taxableValue: '210000.00',
    totalTax: '37800.00',
    cgst: '18900.00',
    sgst: '18900.00',
    igst: '0.00',
    itcEligibility: 'ELIGIBLE',
    imsAction: 'NONE',
    notes: 'Vendor has not filed GSTR-1 by 11th. Credit at risk for November return.',
  },
  {
    id: 'rec-5',
    status: 'VENDOR_NOT_IN_PR',
    confidenceScore: 0.0,
    supplierGstin: '03XXYYZ9999P1Z1',
    supplierName: 'Unrecorded Vendor Hub',
    portalDocNum: 'UVH/991',
    invoiceDate: '2025-11-09',
    taxableValue: '62000.00',
    totalTax: '11160.00',
    cgst: '5580.00',
    sgst: '5580.00',
    igst: '0.00',
    itcEligibility: 'ELIGIBLE',
    imsAction: 'P',
    notes: 'Invoice in GSTR-2B but unrecorded in Tally. Placed on Pending pending verification.',
  },
];

export default function ReconPage() {
  const [items, setItems] = useState<ReconItem[]>(INITIAL_RECON_ITEMS);
  const [filter, setFilter] = useState<string>('ALL');
  const [acknowledgedDeltas, setAcknowledgedDeltas] = useState<Record<string, boolean>>({});
  const [notification, setNotification] = useState<string | null>(null);
  const [activeGstin, setActiveGstin] = useState<string>('03AAFCP4821K1Z5');
  const [activePeriod, setActivePeriod] = useState<string>('Nov 2025 (112025)');
  const [chaserModal, setChaserModal] = useState<{
    open: boolean;
    item?: ReconItem;
    noticeText?: string;
    whatsappUrl?: string;
    copied?: boolean;
    sending?: boolean;
    sentFeedback?: string;
  }>({ open: false });

  const triggerVendorChaser = async (item: ReconItem) => {
    try {
      const csrfRes = await fetch('/api/v1/auth/csrf');
      const { csrfToken } = await csrfRes.json().catch(() => ({ csrfToken: '' }));
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrfToken) headers['x-csrf-token'] = csrfToken;

      const res = await fetch('/api/v1/recon/chaser', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          supplierGstin: item.supplierGstin,
          supplierName: item.supplierName,
          invoiceNum: item.prInvoiceNum || 'PR-INV',
          invoiceDate: item.invoiceDate,
          taxableValue: item.taxableValue,
          totalTax: item.totalTax,
          period: activePeriod,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setChaserModal({
          open: true,
          item,
          noticeText: json.data.noticeText,
          whatsappUrl: json.data.whatsappUrl,
          copied: false,
          sending: false,
          sentFeedback: json.data.message,
        });
      }
    } catch (err: any) {
      alert('Failed to generate vendor chaser notice: ' + err.message);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function loadRecon() {
      try {
        const res = await fetch('/api/v1/recon/active', {
          credentials: 'include',
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.data) {
          if (json.data.gstin) setActiveGstin(json.data.gstin);
          if (json.data.period) setActivePeriod(json.data.period);

          const newItems: ReconItem[] = [];

          if (json.data.pairs && Array.isArray(json.data.pairs)) {
            for (const p of json.data.pairs) {
              const pr = p.purchaseInvoice;
              const g2b = p.gstr2bRecord;
              newItems.push({
                id: pr.id || g2b.id,
                status: p.matchType === 'EXACT' ? 'EXACT_MATCH' : 'FUZZY_MATCH',
                confidenceScore: p.confidenceScore || (p.matchType === 'EXACT' ? 1.0 : 0.96),
                supplierGstin: g2b.supplierGstin || pr.vendorGstin,
                supplierName: g2b.supplierName || pr.vendorName || 'Supplier',
                prInvoiceNum: pr.invoiceNum,
                portalDocNum: g2b.docNum,
                invoiceDate: pr.invoiceDate || g2b.docDate,
                taxableValue: pr.taxableValue || g2b.taxableValue,
                totalTax: pr.totalTax || g2b.totalTax,
                cgst: pr.cgstAmount || g2b.cgstAmount || '0.00',
                sgst: pr.sgstAmount || g2b.sgstAmount || '0.00',
                igst: pr.igstAmount || g2b.igstAmount || '0.00',
                itcEligibility: pr.itcEligibility || 'ELIGIBLE',
                imsAction: (g2b.imsActionStatus as any) || 'NONE',
                notes: p.matchType === 'EXACT' ? 'Exact Match: Verified identical in Books and GSTR-2B.' : 'Pass 2 Fuzzy Match: Normalized FY tokens and delimiters.',
              });
            }
          }

          if (json.data.unmatchedPurchase && Array.isArray(json.data.unmatchedPurchase)) {
            for (const pr of json.data.unmatchedPurchase) {
              newItems.push({
                id: pr.id,
                status: 'PURCHASE_NOT_IN_2B',
                confidenceScore: 0.0,
                supplierGstin: pr.vendorGstin,
                supplierName: pr.vendorName || 'Vendor',
                prInvoiceNum: pr.invoiceNum,
                invoiceDate: pr.invoiceDate,
                taxableValue: pr.taxableValue,
                totalTax: pr.totalTax,
                cgst: pr.cgstAmount || '0.00',
                sgst: pr.sgstAmount || '0.00',
                igst: pr.igstAmount || '0.00',
                itcEligibility: pr.itcEligibility || 'ELIGIBLE',
                imsAction: 'NONE',
                notes: 'Purchase invoice in books, missing from GSTR-2B. Credit at risk for filing period.',
              });
            }
          }

          if (json.data.unmatchedPortal2b && Array.isArray(json.data.unmatchedPortal2b)) {
            for (const g2b of json.data.unmatchedPortal2b) {
              newItems.push({
                id: g2b.id,
                status: 'VENDOR_NOT_IN_PR',
                confidenceScore: 0.0,
                supplierGstin: g2b.supplierGstin,
                supplierName: g2b.supplierName || 'Portal Supplier',
                portalDocNum: g2b.docNum,
                invoiceDate: g2b.docDate,
                taxableValue: g2b.taxableValue,
                totalTax: g2b.totalTax,
                cgst: g2b.cgstAmount || '0.00',
                sgst: g2b.sgstAmount || '0.00',
                igst: g2b.igstAmount || '0.00',
                itcEligibility: g2b.itcAvailable ? 'ELIGIBLE' : 'INELIGIBLE_17_5',
                imsAction: (g2b.imsActionStatus as any) || 'NONE',
                notes: 'Invoice in GSTR-2B but unrecorded in books. Unclaimed credit.',
              });
            }
          }

          if (newItems.length > 0) {
            setItems(newItems);
          }
        }
      } catch {
        // preserve initialized list
      }
    }
    loadRecon();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleImsAction = async (id: string, action: 'A' | 'R' | 'P' | 'NONE') => {
    const target = items.find((it) => it.id === id);
    if (!target) return;

    if (target.isAmendedPostAcceptance && action === 'A' && !acknowledgedDeltas[id]) {
      setNotification(
        'Action Blocked: Please verify and check the net ITC delta acknowledgement before accepting this amended invoice.'
      );
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, imsAction: action } : it))
    );

    const actionText =
      action === 'A' ? 'Accepted' : action === 'R' ? 'Rejected' : action === 'P' ? 'Pending' : 'Reset';
    setNotification(`Invoice ${target.prInvoiceNum || target.portalDocNum}: IMS status updated to ${actionText}.`);
    setTimeout(() => setNotification(null), 3000);

    try {
      await fetch('/api/v1/recon/ims-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          invoiceId: target.portalDocNum || id,
          action,
          gstin: activeGstin,
          acknowledgedDelta: !!acknowledgedDeltas[id],
        }),
      });
    } catch {
      // optimistic update maintained
    }
  };

  const toggleDeltaAck = (id: string) => {
    setAcknowledgedDeltas((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredItems = items.filter((it) => {
    if (filter === 'ALL') return true;
    if (filter === 'MATCHED') return it.status === 'EXACT_MATCH' || it.status === 'FUZZY_MATCH';
    if (filter === 'DISCREPANCY')
      return it.status === 'PURCHASE_NOT_IN_2B' || it.status === 'VENDOR_NOT_IN_PR' || it.status === 'VALUE_MISMATCH';
    if (filter === 'AMENDED') return !!it.isAmendedPostAcceptance;
    if (filter === 'BLOCKED_17_5') return it.itcEligibility === 'INELIGIBLE_17_5';
    return true;
  });

  // Calculate totals
  const totalTax2b = items
    .filter((it) => it.portalDocNum)
    .reduce((sum, it) => sum + parseFloat(it.totalTax), 0);

  const totalAcceptedItc = items
    .filter((it) => it.imsAction === 'A' && it.itcEligibility === 'ELIGIBLE')
    .reduce((sum, it) => sum + parseFloat(it.totalTax), 0);

  const unactionedRiskCount = items.filter(
    (it) => it.imsAction === 'NONE' && (parseFloat(it.taxableValue) >= 25000 || it.itcEligibility === 'INELIGIBLE_17_5')
  ).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Breadcrumb & Metadata Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-pos-line pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-pos-accent">
            <GitCompare className="w-4 h-4" />
            <span>GSTR-2B against the purchase register</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold text-pos-ink tracking-tight mt-1">
            Reconciliation & Invoice Management System
          </h1>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="bg-pos-muted border border-pos-line px-3 py-1.5 rounded-md">
            <span className="text-pos-ink/60">GSTIN: </span>
            <span className="text-pos-ink font-semibold">{activeGstin}</span>
          </div>
          <div className="bg-pos-muted border border-pos-line px-3 py-1.5 rounded-md">
            <span className="text-pos-ink/60">Period: </span>
            <span className="text-pos-accent font-semibold">{activePeriod}</span>
          </div>
        </div>
      </div>

      {/* 48-Hour Pre-14th Deemed Acceptance Guard Banner */}
      {unactionedRiskCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/80 border border-amber-300/80 dark:border-amber-500/50 rounded-xl p-4 flex items-start gap-3.5 shadow-lg shadow-amber-500/5">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-300">
              <span>Statutory Alert: 48-Hour Pre-14th Deemed Acceptance Guard</span>
              <span className="bg-amber-500/15 dark:bg-amber-500/25 text-amber-900 dark:text-amber-300 text-[12px] px-2 py-0.5 rounded font-mono border border-amber-500/30 dark:border-amber-500/50 font-bold">
                {unactionedRiskCount} At-Risk Record(s)
              </span>
            </div>
            <p className="text-amber-950 dark:text-amber-100 leading-relaxed">
              Under Section 38 & IMS Rules, any invoice left with status{' '}
              <span className="font-mono font-bold text-amber-950 dark:text-amber-200">NONE</span> on the 14th cutoff is automatically deemed
              accepted. We flagged {unactionedRiskCount} unactioned invoice(s) exceeding the ₹25,000 threshold or falling
              under Section 17(5) blocked credit (e.g. Golden Temple Roadways). Take action now to avoid erroneous ITC
              claims and Section 50 interest penalties.
            </p>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className="bg-pos-tint border border-pos-accent/50 text-pos-green text-xs px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-lg animate-in fade-in duration-200">
          <Info className="w-4 h-4 text-pos-accent shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* KPI Overview Cards (POS Style) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-pos-muted border border-pos-line p-3 rounded-lg">
          <span className="text-[12px] font-mono text-pos-ink/60 font-semibold">Pass 1: Exact</span>
          <p className="text-xl font-semibold text-pos-accent mt-1">2</p>
          <span className="text-[12px] text-pos-ink/60">100% Tax & Doc Match</span>
        </div>

        <div className="bg-pos-muted border border-pos-line p-3 rounded-lg">
          <span className="text-[12px] font-mono text-pos-ink/60 font-semibold">Pass 2: Fuzzy</span>
          <p className="text-xl font-semibold text-[#3A6FE8] mt-1">1</p>
          <span className="text-[12px] text-pos-ink/60">Normalized FY Tokens</span>
        </div>

        <div className="bg-pos-muted border border-pos-line p-3 rounded-lg">
          <span className="text-[12px] font-mono text-pos-ink/60 font-semibold">Pass 3: Mismatch</span>
          <p className="text-xl font-semibold text-[#C2410C] mt-1">0</p>
          <span className="text-[12px] text-pos-ink/60">Sec 170 ±₹1 Tolerance</span>
        </div>

        <div className="bg-pos-muted border border-pos-line p-3 rounded-lg">
          <span className="text-[12px] font-mono text-pos-ink/60 font-semibold">Missing in 2B</span>
          <p className="text-xl font-semibold text-pos-red mt-1">1</p>
          <span className="text-[12px] text-pos-ink/60">Supplier Not Uploaded</span>
        </div>

        <div className="bg-pos-muted border border-pos-line p-3 rounded-lg">
          <span className="text-[12px] font-mono text-pos-ink/60 font-semibold">Unrecorded in PR</span>
          <p className="text-xl font-semibold text-[#3A6FE8] mt-1">1</p>
          <span className="text-[12px] text-pos-ink/60">Missing from Books</span>
        </div>

        <div className="bg-pos-muted border border-pos-line p-3 rounded-lg">
          <span className="text-[12px] font-mono text-pos-ink/60 font-semibold">Claimable ITC</span>
          <p className="text-xl font-semibold text-pos-ink mt-1">
            ₹{totalAcceptedItc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[12px] text-pos-accent">Accepted & Eligible</span>
        </div>
      </div>

      {/* Rapid Filter Tabs & Keyboard Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-pos-muted p-2.5 rounded-lg border border-pos-line">
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold">
          {[
            { id: 'ALL', label: 'All Invoices', count: items.length },
            { id: 'MATCHED', label: 'Matched', count: 3 },
            { id: 'DISCREPANCY', label: 'Discrepancies', count: 2 },
            { id: 'AMENDED', label: 'Amended Post-Acceptance', count: 1 },
            { id: 'BLOCKED_17_5', label: 'Section 17(5) Blocked', count: 1 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-pos-muted text-pos-ink border border-pos-line'
                  : 'text-pos-ink/60 hover:text-pos-accent hover:bg-pos-tint'
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[12px] font-mono px-1.5 py-0.2 rounded bg-pos-surface text-pos-ink/60">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[12px] text-pos-ink/60">
          <span className="text-pos-ink/60">Hotkeys:</span>
          <span className="px-1.5 py-0.5 rounded bg-pos-muted text-pos-green font-semibold border border-pos-line">A</span> Accept
          <span className="px-1.5 py-0.5 rounded bg-pos-muted text-pos-red font-semibold border border-pos-line">R</span> Reject
          <span className="px-1.5 py-0.5 rounded bg-pos-muted text-[#C2410C] font-semibold border border-pos-line">P</span> Pending
        </div>
      </div>

      {/* Main Recon & IMS Data Grid */}
      <div className="bg-pos-muted border border-pos-line rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-pos-muted border-b border-pos-line text-pos-ink/60 text-[12px]">
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Supplier GSTIN & Entity</th>
                <th className="py-3 px-3">PR vs 2B Doc Num</th>
                <th className="py-3 px-3 text-right">Taxable (₹)</th>
                <th className="py-3 px-3 text-right">Tax Breakdown (₹)</th>
                <th className="py-3 px-3">ITC Status</th>
                <th className="py-3 px-3 text-center">IMS Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pos-line">
              {filteredItems.map((item) => {
                const isAccepted = item.imsAction === 'A';
                const isRejected = item.imsAction === 'R';
                const isPending = item.imsAction === 'P';

                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-pos-tint transition-colors ${
                      item.isAmendedPostAcceptance ? 'bg-amber-50/70 dark:bg-amber-950/50 border-l-4 border-amber-500' : ''
                    }`}
                  >
                    {/* Status Badge */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      {item.status === 'EXACT_MATCH' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-mono font-semibold bg-pos-tint text-pos-accent border border-pos-accent/30">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Exact Match</span>
                        </span>
                      )}
                      {item.status === 'FUZZY_MATCH' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-mono font-semibold bg-[#3A6FE8]/10 text-[#3A6FE8] border border-[#3A6FE8]/30">
                          <GitCompare className="w-3 h-3" />
                          <span>Fuzzy (96%)</span>
                        </span>
                      )}
                      {item.status === 'PURCHASE_NOT_IN_2B' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-mono font-semibold bg-rose-500/10 text-pos-red border border-pos-red/30">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Missing in 2B</span>
                        </span>
                      )}
                      {item.status === 'VENDOR_NOT_IN_PR' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-mono font-semibold bg-indigo-500/10 text-[#3A6FE8] border border-[#3A6FE8]/30">
                          <Info className="w-3 h-3" />
                          <span>Unrecorded PR</span>
                        </span>
                      )}
                    </td>

                    {/* Supplier GSTIN & Name */}
                    <td className="py-3.5 px-3">
                      <div className="font-semibold text-pos-ink">{item.supplierGstin}</div>
                      <div className="text-[12px] text-pos-ink/75 truncate max-w-[200px]">{item.supplierName}</div>
                    </td>

                    {/* Invoice References */}
                    <td className="py-3.5 px-3 font-mono">
                      <div className="flex items-center gap-1.5 text-xs text-pos-ink">
                        <span className="text-pos-ink/70 text-[12px]">PR:</span>
                        <span>{item.prInvoiceNum || '(None)'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[12px] text-pos-ink/70">
                        <span className="text-pos-ink/70 text-[12px]">2B:</span>
                        <span>{item.portalDocNum || '(Not Filed)'}</span>
                      </div>
                      {item.notes && <div className="text-[12px] text-pos-ink/70 mt-0.5 italic">{item.notes}</div>}
                    </td>

                    {/* Taxable Amount */}
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                      <div className="font-semibold text-pos-ink">
                        ₹{parseFloat(item.taxableValue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>

                      {/* Amended Post-Acceptance Side-by-Side Delta Badge */}
                      {item.isAmendedPostAcceptance && item.originalTaxableValue && (
                        <div className="mt-1 p-2 rounded bg-amber-100/90 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700/60 text-[12px] text-left">
                          <div className="flex items-center justify-between text-amber-900 dark:text-amber-300 font-semibold">
                            <span>Amended by Supplier</span>
                            <span className="text-pos-accent dark:text-sky-400 font-mono font-bold">
                              +₹
                              {(
                                parseFloat(item.taxableValue) - parseFloat(item.originalTaxableValue)
                              ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="text-amber-800 dark:text-amber-200/90 mt-0.5 font-mono">
                            Original: ₹
                            {parseFloat(item.originalTaxableValue).toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                            })}
                          </div>
                          <label className="mt-1.5 flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!acknowledgedDeltas[item.id]}
                              onChange={() => toggleDeltaAck(item.id)}
                              className="rounded bg-pos-muted border-pos-line text-pos-green focus:ring-0 w-3 h-3"
                            />
                            <span className="text-[11px] text-amber-900 dark:text-amber-300 font-medium">Verify & acknowledge delta</span>
                          </label>
                        </div>
                      )}
                    </td>

                    {/* Tax Breakdown */}
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                      <div className="font-semibold text-pos-accent">
                        ₹{parseFloat(item.totalTax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[12px] text-pos-ink/60">
                        {item.igst !== '0.00'
                          ? `IGST: ₹${parseFloat(item.igst).toLocaleString('en-IN')}`
                          : `CGST: ₹${parseFloat(item.cgst).toLocaleString('en-IN')} | SGST: ₹${parseFloat(item.sgst).toLocaleString('en-IN')}`}
                      </div>
                    </td>

                    {/* ITC Eligibility */}
                    <td className="py-3.5 px-3">
                      {item.itcEligibility === 'ELIGIBLE' ? (
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-pos-accent">
                          <Check className="w-3 h-3" />
                          <span>Eligible</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-pos-red">
                          <ShieldAlert className="w-3 h-3" />
                          <span>Sec 17(5) Blocked</span>
                        </span>
                      )}
                    </td>

                    {/* IMS Action Buttons or Vendor Chaser */}
                    <td className="py-3.5 px-3 text-center">
                      {item.status === 'PURCHASE_NOT_IN_2B' ? (
                        <button
                          type="button"
                          onClick={() => triggerVendorChaser(item)}
                          title="Generate Section 16(2)(aa) chaser notice for WhatsApp/Email"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold text-pos-accent bg-pos-accent/10 hover:bg-pos-accent hover:text-white border border-pos-accent/30 transition-colors"
                        >
                          <Send className="w-3 h-3" />
                          <span>Chaser</span>
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-1 bg-pos-surface p-1 rounded-lg border border-pos-line">
                          <button
                            onClick={() => handleImsAction(item.id, 'A')}
                            title="Accept in IMS (Hotkey A)"
                            className={`px-2 py-1 rounded text-[12px] font-mono font-semibold transition-colors ${
                              isAccepted
                                ? 'bg-pos-accent text-white shadow-sm'
                                : 'text-pos-ink/60 hover:text-pos-accent hover:bg-pos-muted'
                            }`}
                          >
                            A
                          </button>
                          <button
                            onClick={() => handleImsAction(item.id, 'R')}
                            title="Reject in IMS (Hotkey R)"
                            className={`px-2 py-1 rounded text-[12px] font-mono font-semibold transition-colors ${
                              isRejected
                                ? 'bg-rose-500 text-pos-ink shadow-sm'
                                : 'text-pos-ink/60 hover:text-pos-red hover:bg-pos-muted'
                            }`}
                          >
                            R
                          </button>
                          <button
                            onClick={() => handleImsAction(item.id, 'P')}
                            title="Pending in IMS (Hotkey P)"
                            className={`px-2 py-1 rounded text-[12px] font-mono font-semibold transition-colors ${
                              isPending
                                ? 'bg-amber-500 text-white shadow-sm'
                                : 'text-pos-ink/60 hover:text-[#C2410C] hover:bg-pos-muted'
                            }`}
                          >
                            P
                          </button>
                          {item.imsAction !== 'NONE' && (
                            <button
                              onClick={() => handleImsAction(item.id, 'NONE')}
                              title="Reset to Unactioned"
                              className="p-1 rounded text-pos-ink/60 hover:text-pos-ink transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Section 170 Statutory Rounding & Claimable ITC Footer */}
        <div className="bg-pos-surface border-t border-pos-line p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-pos-ink/60">Total Inward Tax (2B):</span>
            <span className="text-pos-ink font-semibold">
              ₹{totalTax2b.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-pos-ink/60">|</span>
            <span className="text-pos-ink/60">Section 170 CGST Rounding:</span>
            <span className="text-pos-accent font-semibold">
              ₹{Math.round(totalAcceptedItc).toLocaleString('en-IN')}.00
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button className="px-4 py-2 rounded-lg bg-pos-muted hover:bg-pos-muted text-pos-ink font-semibold transition-colors">
              Export GSTR-2B Recon (Excel)
            </button>
            <button className="px-4 py-2 rounded-lg bg-pos-accent hover:bg-pos-accent-deep text-white font-semibold transition-colors shadow-[0_6px_14px_-6px_rgba(47,138,224,0.8)]">
              Push Actions to GSTN IMS Portal
            </button>
          </div>
        </div>
      </div>

      {/* Vendor Chaser Notice Modal */}
      {chaserModal.open && chaserModal.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-pos-surface border border-pos-line rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-pos-ink">
            <div className="flex items-center justify-between border-b border-pos-line px-5 py-4 bg-pos-muted/50">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-pos-accent" />
                <h3 className="font-semibold text-sm">Vendor Compliance Chaser Notice</h3>
              </div>
              <button
                type="button"
                onClick={() => setChaserModal({ open: false })}
                className="text-pos-ink/60 hover:text-pos-ink p-1 rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div>
                <span className="text-pos-ink/60">Target Supplier: </span>
                <span className="font-semibold">{chaserModal.item.supplierName}</span>
                <span className="font-mono text-pos-accent ml-2">({chaserModal.item.supplierGstin})</span>
              </div>
              <div>
                <span className="text-pos-ink/60">Statutory Ground: </span>
                <span className="font-semibold text-pos-red">Section 16(2)(aa) CGST Act & Rule 36(4)</span>
              </div>
              <div>
                <label className="block text-pos-ink/70 font-medium mb-1.5">Prepared Notice Text</label>
                <textarea
                  readOnly
                  rows={5}
                  value={chaserModal.noticeText}
                  className="w-full bg-pos-muted border border-pos-line rounded-lg p-3 font-mono text-[12px] text-pos-ink focus:outline-none"
                />
              </div>
              {chaserModal.sentFeedback && (
                <p className="text-[12px] text-pos-green font-medium">
                  {chaserModal.sentFeedback}
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-pos-line px-5 py-3.5 bg-pos-muted/30">
              <button
                type="button"
                onClick={() => {
                  if (chaserModal.noticeText) {
                    navigator.clipboard.writeText(chaserModal.noticeText);
                    setChaserModal((m) => ({ ...m, copied: true }));
                    setTimeout(() => setChaserModal((m) => ({ ...m, copied: false })), 2000);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pos-muted border border-pos-line text-pos-ink font-semibold hover:bg-pos-line transition-colors"
              >
                {chaserModal.copied ? <Check className="w-3.5 h-3.5 text-pos-green" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{chaserModal.copied ? 'Copied' : 'Copy Notice'}</span>
              </button>
              {chaserModal.whatsappUrl && (
                <a
                  href={chaserModal.whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-pos-accent hover:bg-pos-accent-deep text-white font-semibold shadow-md transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send via WhatsApp</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
