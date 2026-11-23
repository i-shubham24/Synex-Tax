'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  FileSignature,
  FileText,
  KeyRound,
  Lock,
  Mail,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserCheck,
} from 'lucide-react';

interface DraftReturn {
  id: string;
  title: string;
  period: string;
  dueDate: string;
  netPayable: string;
  summaryMetrics: Array<{ label: string; value: string }>;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'SIGNED';
  approvedBy?: string;
  approvedAt?: string;
  signatureHash?: string;
}

interface VendorChaser {
  id: string;
  vendorName: string;
  gstin: string;
  invoiceNumber: string;
  invoiceDate: string;
  taxableAmount: string;
  blockedItc: string;
  approved: boolean;
  status: 'PENDING' | 'QUEUED' | 'SENT';
}

const INITIAL_RETURNS: DraftReturn[] = [
  {
    id: 'ret-gstr3b-oct',
    title: 'GSTR-3B Monthly Return',
    period: 'October 2026',
    dueDate: '20 Nov 2026',
    netPayable: '₹24,450',
    summaryMetrics: [
      { label: 'Outward Taxable Supplies', value: '₹14,28,500' },
      { label: 'Gross Output Tax', value: '₹1,42,850' },
      { label: 'Eligible ITC Claimed', value: '₹1,18,400' },
      { label: 'Net Cash Tax Payable', value: '₹24,450' },
    ],
    status: 'PENDING_REVIEW',
  },
  {
    id: 'ret-tds-q3',
    title: 'TDS Statement Form 140',
    period: 'Q3 FY 2026-27',
    dueDate: '31 Jan 2027',
    netPayable: '₹0 (Paid)',
    summaryMetrics: [
      { label: 'Total Deductees', value: '48 Payees' },
      { label: 'Total Payments', value: '₹31,20,000' },
      { label: 'TDS Deposited via Challans', value: '₹3,12,000' },
      { label: 'Unconsumed Challan Balance', value: '₹0.00' },
    ],
    status: 'PENDING_REVIEW',
  },
  {
    id: 'ret-taxaudit-ay27',
    title: 'Tax Audit Form 3CD',
    period: 'AY 2027-28',
    dueDate: '30 Sept 2027',
    netPayable: 'N/A (Report)',
    summaryMetrics: [
      { label: 'Turnover Clause 8', value: '₹4,85,00,000' },
      { label: 'Inadmissible 40(a) Clause 21', value: '₹1,20,000' },
      { label: 'Depreciation Allowable Clause 18', value: '₹3,45,000' },
      { label: 'Prior Period Debits Clause 27', value: 'Nil' },
    ],
    status: 'PENDING_REVIEW',
  },
];

const INITIAL_CHASERS: VendorChaser[] = [
  {
    id: 'chase-1',
    vendorName: 'Apex Industrial Tools LLP',
    gstin: '27AABCA1234F1Z8',
    invoiceNumber: 'INV-2026-881',
    invoiceDate: '14 Oct 2026',
    taxableAmount: '₹2,36,000',
    blockedItc: '₹42,480',
    approved: true,
    status: 'PENDING',
  },
  {
    id: 'chase-2',
    vendorName: 'Zenith Cloud Infrastructure',
    gstin: '07AAACZ9876M1Z2',
    invoiceNumber: 'ZCI-OCT-4091',
    invoiceDate: '22 Oct 2026',
    taxableAmount: '₹1,02,000',
    blockedItc: '₹18,360',
    approved: true,
    status: 'PENDING',
  },
];

export function ClientApprovalAndDsc({ clientName }: { clientName: string }) {
  const [returns, setReturns] = useState<DraftReturn[]>(INITIAL_RETURNS);
  const [chasers, setChasers] = useState<VendorChaser[]>(INITIAL_CHASERS);
  const [expandedReturn, setExpandedReturn] = useState<string | null>('ret-gstr3b-oct');
  const [signingReturnId, setSigningReturnId] = useState<string | null>(null);
  const [isDscConnected, setIsDscConnected] = useState<boolean>(true);
  const [dscPin, setDscPin] = useState<string>('');
  const [signBusy, setSignBusy] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  /* Approve a draft return */
  function handleApprove(id: string) {
    setReturns((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: 'APPROVED',
              approvedBy: clientName || 'Authorised Signatory',
              approvedAt: new Date().toISOString(),
            }
          : r
      )
    );
    setNotification('Draft return approved. It is now ready for cryptographic DSC or e-Sign signature.');
  }

  /* Execute Remote DSC Sign */
  async function handleSign(id: string) {
    if (!dscPin) {
      alert('Please enter your DSC token user PIN to authorize cryptographic signature.');
      return;
    }
    setSignBusy(true);
    setSigningReturnId(id);

    /* Simulate cryptographic signing via local/remote DSC agent bridge */
    await new Promise((resolve) => setTimeout(resolve, 1400));

    const mockHash = 'SHA256:' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    setReturns((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: 'SIGNED',
              signatureHash: mockHash,
            }
          : r
      )
    );
    setSignBusy(false);
    setSigningReturnId(null);
    setDscPin('');
    setNotification(`Return successfully digitally signed with Class 3 DSC. Signature Token: ${mockHash.slice(0, 18)}...`);
  }

  /* Toggle individual vendor chaser */
  function toggleChaser(id: string) {
    setChasers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, approved: !c.approved } : c))
    );
  }

  /* Dispatch vendor chasers */
  function dispatchChasers() {
    const approvedCount = chasers.filter((c) => c.approved).length;
    setChasers((prev) =>
      prev.map((c) => (c.approved ? { ...c, status: 'QUEUED' } : c))
    );
    setNotification(
      `Dispatched automated WhatsApp and email compliance notices to ${approvedCount} non-compliant vendor(s).`
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div className="flex items-center justify-between rounded-[12px] bg-[#22a356]/10 p-3.5 text-[13px] text-[#15803d]">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {notification}
          </span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-[12px] underline hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Return Review & Approval Cockpit */}
      <div className="pos-card overflow-hidden">
        <div className="border-b border-pos-line p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-pos-accent/10 px-2.5 py-0.5 text-[12px] font-semibold text-pos-accent">
                Client Action Center
              </span>
              <span className="text-[12.5px] text-pos-ink/55">Direct Authorised Review</span>
            </div>
            <h3 className="mt-1 text-[17px] font-semibold text-pos-ink">
              Draft Returns Pending Review & Signature
            </h3>
            <p className="mt-0.5 text-[13px] text-pos-ink/65">
              Review computed tax figures before your CA files with GSTN and Income-tax Department portals.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-pos-ink/60">
            <ShieldCheck className="h-4 w-4 text-pos-accent" /> Tamper-Proof Audit Trail
          </div>
        </div>

        <div className="divide-y divide-pos-line">
          {returns.map((ret) => {
            const isExpanded = expandedReturn === ret.id;
            return (
              <div key={ret.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pos-muted">
                      {ret.status === 'SIGNED' ? (
                        <BadgeCheck className="h-5 w-5 text-[#15803d]" />
                      ) : ret.status === 'APPROVED' ? (
                        <FileSignature className="h-5 w-5 text-pos-accent" />
                      ) : (
                        <FileText className="h-5 w-5 text-pos-ink/60" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-[15px] font-semibold text-pos-ink">{ret.title}</h4>
                        <span className="text-[12px] font-medium text-pos-ink/50">
                          ({ret.period})
                        </span>
                      </div>
                      <p className="text-[12.5px] text-pos-ink/60">
                        Statutory Due: <span className="font-medium text-pos-ink">{ret.dueDate}</span> | Net Tax: <span className="font-mono font-semibold text-pos-ink">{ret.netPayable}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {ret.status === 'PENDING_REVIEW' && (
                      <button
                        type="button"
                        onClick={() => handleApprove(ret.id)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#15803d] px-4 py-1.5 text-[13px] font-medium text-white shadow-sm hover:opacity-90"
                      >
                        <UserCheck className="h-3.5 w-3.5" /> Approve Draft
                      </button>
                    )}

                    {ret.status === 'APPROVED' && (
                      <span className="rounded-full bg-[#15803d]/10 px-3 py-1 text-[12px] font-medium text-[#15803d]">
                        Approved by {ret.approvedBy}
                      </span>
                    )}

                    {ret.status === 'SIGNED' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-[12px] font-semibold text-blue-700">
                        <BadgeCheck className="h-3.5 w-3.5" /> Digitally Signed
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedReturn(isExpanded ? null : ret.id)}
                      className="rounded-full border border-pos-line bg-pos-surface p-1.5 text-pos-ink/70 hover:bg-pos-tint"
                      aria-label="Toggle details"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-4 space-y-4 rounded-[12px] bg-pos-muted/40 p-4 text-[13px]">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {ret.summaryMetrics.map((m, idx) => (
                        <div key={idx} className="rounded-[8px] bg-pos-surface p-2.5 border border-pos-line/70">
                          <span className="text-[11.5px] text-pos-ink/55 block">{m.label}</span>
                          <span className="mt-0.5 font-mono text-[13.5px] font-semibold text-pos-ink block">
                            {m.value}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Remote DSC Signing Box when Approved */}
                    {ret.status === 'APPROVED' && (
                      <div className="mt-3 rounded-[12px] border border-pos-accent/30 bg-pos-surface p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <KeyRound className="h-4 w-4 text-pos-accent" />
                            <span className="font-semibold text-pos-ink">
                              Remote DSC / e-Sign Authorisation Desk
                            </span>
                          </div>
                          <span className="flex items-center gap-1.5 text-[12px] text-[#15803d] font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> DSC Token Detected (eMudhra Class 3)
                          </span>
                        </div>

                        <p className="text-[12.5px] text-pos-ink/65">
                          Attach legally binding cryptographic digital signature under Section 3 of Information Technology Act 2000.
                        </p>

                        <div className="flex flex-wrap items-center gap-3">
                          <input
                            type="password"
                            placeholder="Enter Token User PIN"
                            value={dscPin}
                            onChange={(e) => setDscPin(e.target.value)}
                            className="h-9 w-52 rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] font-mono text-pos-ink outline-none focus:border-pos-accent"
                          />
                          <button
                            type="button"
                            disabled={signBusy}
                            onClick={() => handleSign(ret.id)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                          >
                            <FileSignature className="h-3.5 w-3.5" />
                            {signBusy ? 'Applying Digital Signature...' : 'Authorize & Sign Return'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Cryptographic Verification Seal when Signed */}
                    {ret.status === 'SIGNED' && (
                      <div className="rounded-[10px] border border-pos-line bg-pos-surface p-3 flex flex-wrap items-center justify-between gap-2 text-[12px]">
                        <div>
                          <span className="font-semibold text-pos-ink">Cryptographic Verification Hash: </span>
                          <span className="font-mono text-pos-ink/70">{ret.signatureHash}</span>
                        </div>
                        <span className="text-pos-ink/50">DSC Serial: #88F4-A901-B2C4</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Vendor ITC Chaser Approval Section */}
      <div className="pos-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-semibold text-pos-ink flex items-center gap-2">
              <Mail className="h-4 w-4 text-pos-accent" /> Vendor ITC Chaser Approvals
            </h3>
            <p className="mt-0.5 text-[13px] text-pos-ink/65">
              These vendors have not uploaded their B2B invoices to GSTR-1, temporarily blocking your ITC claim. Authorize automated reminder notices.
            </p>
          </div>
          <button
            type="button"
            onClick={dispatchChasers}
            className="inline-flex items-center gap-1.5 rounded-full bg-pos-accent px-4 py-1.5 text-[13px] font-medium text-white shadow-sm hover:opacity-90"
          >
            <Send className="h-3.5 w-3.5" /> Send Approved Chasers
          </button>
        </div>

        <div className="overflow-x-auto rounded-[12px] border border-pos-line">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-[#141416] text-white">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Authorize</th>
                <th className="px-4 py-2.5 font-semibold">Vendor Name</th>
                <th className="px-4 py-2.5 font-semibold">GSTIN</th>
                <th className="px-4 py-2.5 font-semibold">Invoice No & Date</th>
                <th className="px-4 py-2.5 font-semibold text-right">Taxable</th>
                <th className="px-4 py-2.5 font-semibold text-right">Blocked ITC</th>
                <th className="px-4 py-2.5 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pos-line bg-pos-surface">
              {chasers.map((chase) => (
                <tr key={chase.id} className="hover:bg-pos-tint/30">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={chase.approved}
                      onChange={() => toggleChaser(chase.id)}
                      className="rounded border-pos-line text-pos-accent focus:ring-pos-accent"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-pos-ink">{chase.vendorName}</td>
                  <td className="px-4 py-3 font-mono text-pos-ink/70">{chase.gstin}</td>
                  <td className="px-4 py-3">
                    {chase.invoiceNumber} <span className="text-[11.5px] text-pos-ink/50">({chase.invoiceDate})</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{chase.taxableAmount}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-[#dc2626]">
                    {chase.blockedItc}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${chase.status === 'QUEUED' ? 'bg-[#15803d]/15 text-[#15803d]' : 'bg-amber-500/15 text-amber-800'}`}>
                      {chase.status === 'QUEUED' ? 'Queued for Dispatch' : 'Awaiting Consent'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
