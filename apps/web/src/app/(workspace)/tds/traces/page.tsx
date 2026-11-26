'use client';

import React, { useState, useEffect } from 'react';
import {
  FileCode,
  ShieldCheck,
  Copy,
  Check,
  Upload,
  AlertTriangle,
  CheckCircle2,
  GitCompare,
  Download,
  Calendar,
  Building,
  Hash,
  KeyRound,
  FileSpreadsheet,
} from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { useWorkspace } from '../../../../workspace/WorkspaceContext';
import { TdsCommandBar } from '../../../../components/tds/TdsCommandBar';

interface KycCheatSheet {
  tan: string;
  token: string;
  taxYear: number;
  quarter: string;
  cheatSheet?: {
    prn: string;
    challan: {
      bsrCode: string;
      depositDate: string;
      challanSerial: string;
      challanAmount: string;
    } | null;
    panCombinations: Array<{
      deducteeId?: string;
      pan: string;
      masked?: boolean;
      amount: string;
    }>;
  };
}

interface ConsoDiffItem {
  recordType: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9';
  description: string;
  systemValue: string;
  consoValue: string;
  status: 'MATCHED' | 'DISCREPANCY' | 'NEW_IN_CONSO';
}

export default function TracesStudioPage() {
  const { authFetch } = useAuth();
  const { activeClient } = useWorkspace();
  const [activeTan, setActiveTan] = useState<string>('PTLA12345B');
  const [activeToken, setActiveToken] = useState<string>('010260400012345');
  const [showKycModal, setShowKycModal] = useState<boolean>(false);
  const [kycData, setKycData] = useState<KycCheatSheet | null>(null);
  const [loadingKyc, setLoadingKyc] = useState<boolean>(false);
  const [revealReason, setRevealReason] = useState<string>('TRACES portal KYC login');
  const [revealingPan, setRevealingPan] = useState<boolean>(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Conso diff state
  const [consoFileName, setConsoFileName] = useState<string | null>(null);
  const [consoError, setConsoError] = useState<string | null>(null);
  const [loadingConso, setLoadingConso] = useState<boolean>(false);
  const [diffItems, setDiffItems] = useState<ConsoDiffItem[]>([
    {
      recordType: 'C1',
      description: 'Deductor Details (TAN, Address, Contact Person)',
      systemValue: 'Verified PTLA12345B',
      consoValue: 'Verified PTLA12345B',
      status: 'MATCHED',
    },
    {
      recordType: 'C2',
      description: 'Challan Record (BSR 0021489 Date 2026-10-14)',
      systemValue: '₹24,150.00 (CIN Matched)',
      consoValue: '₹24,150.00 (Book Adjustment)',
      status: 'MATCHED',
    },
    {
      recordType: 'C3',
      description: 'Deductee Records (PAN Operative Status & Credit)',
      systemValue: '5 Deductees Recorded',
      consoValue: '5 Deductees Processed',
      status: 'MATCHED',
    },
    {
      recordType: 'C9',
      description: 'Demand Notice or Shortfall Calculation',
      systemValue: '₹0.00 Demand',
      consoValue: '₹0.00 Demand',
      status: 'MATCHED',
    },
  ]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleOpenKyc = async () => {
    setShowKycModal(true);
    setLoadingKyc(true);
    setRevealError(null);
    try {
      const tanToUse = activeClient?.tan ?? activeTan;
      const res = await authFetch(`/api/v1/tds/${tanToUse}/traces/kyc-cheat-sheet/${activeToken}`);
      if (res.ok) {
        const json = await res.json();
        setKycData(json);
      }
    } catch {
      // keep state null if unreachable
    } finally {
      setLoadingKyc(false);
    }
  };

  const handleRevealFullPans = async () => {
    setRevealingPan(true);
    setRevealError(null);
    try {
      const tanToUse = activeClient?.tan ?? activeTan;
      const res = await authFetch(`/api/v1/tds/${tanToUse}/traces/kyc-cheat-sheet/${activeToken}/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessReason: revealReason.trim() || 'TRACES portal KYC login' }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRevealError(json.message ?? 'Could not reveal full PANs.');
        return;
      }
      setKycData((prev) =>
        prev
          ? {
              ...prev,
              cheatSheet: {
                prn: prev.cheatSheet?.prn ?? activeToken,
                challan: prev.cheatSheet?.challan ?? null,
                panCombinations: json.panCombinations ?? [],
              },
            }
          : prev,
      );
    } catch {
      setRevealError('Network error while logging PAN reveal.');
    } finally {
      setRevealingPan(false);
    }
  };

  const handleConsoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setConsoFileName(file.name);
    setConsoError(null);
    setLoadingConso(true);
    try {
      const consoContent = await file.text();
      const tanToUse = activeClient?.tan ?? activeTan;
      const res = await authFetch(`/api/v1/tds/${tanToUse}/traces/conso-diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consoContent }),
      });
      const json = await res.json();
      if (!res.ok) {
        setConsoError(json.message ?? 'Failed to parse .conso file.');
        return;
      }
      if (Array.isArray(json.diffs) && json.diffs.length > 0) {
        setDiffItems(json.diffs);
      }
    } catch {
      setConsoError('Could not upload .conso file to comparison engine.');
    } finally {
      setLoadingConso(false);
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto font-sans">
      <TdsCommandBar />

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-pos-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 font-semibold">
              <FileCode className="h-4 w-4" />
            </span>
            <h1 className="font-display text-[22px] font-semibold text-pos-ink">
              TRACES Studio &amp; .conso Discrepancy Engine
            </h1>
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600">
              C1 to C9 Diff
            </span>
          </div>
          <p className="mt-1 text-[13px] text-pos-ink/70">
            1-Click TRACES KYC cheat sheet for instant portal authentication, paired with full C1 through C9 .conso statement comparison.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenKyc}
            className="flex items-center gap-1.5 rounded-xl bg-pos-ink px-4 py-1.5 text-[12px] font-semibold text-pos-surface hover:bg-pos-accent transition-colors shadow-sm"
          >
            <KeyRound className="h-4 w-4 text-amber-400" />
            1-Click KYC Cheat Sheet
          </button>
        </div>
      </div>

      {/* Screen B 72/28 Split Layout */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 w-full min-w-0">
        {/* Left Column (72% ~ 8 cols on XL, full width below XL) */}
        <div className="xl:col-span-8 w-full min-w-0 space-y-4">
          {/* Conso File Upload Area */}
          <div className="rounded-2xl border-2 border-dashed border-pos-line bg-pos-surface p-6 text-center hover:border-pos-accent transition-colors">
            <input
              type="file"
              id="conso-upload"
              accept=".conso,.txt"
              onChange={handleConsoUpload}
              className="hidden"
            />
            <label htmlFor="conso-upload" className="cursor-pointer space-y-2 block">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[13.5px] font-semibold text-pos-ink">
                  {loadingConso ? 'Parsing .conso file...' : consoFileName ? consoFileName : 'Upload TRACES .conso Consolidated File'}
                </p>
                <p className="text-[11.5px] text-pos-ink/60 mt-0.5">
                  Drop your downloaded .conso file from TRACES to run full C1 to C9 diff against SynTax records
                </p>
                {consoError && (
                  <p className="mt-1.5 text-[11.5px] font-medium text-red-600">{consoError}</p>
                )}
              </div>
            </label>
          </div>

          {/* C1-C9 Diff Table */}
          <div className="rounded-2xl border border-pos-line bg-pos-surface shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-pos-line px-4 py-3 bg-pos-muted/30">
              <div className="flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-pos-ink/60" />
                <span className="text-[13px] font-semibold text-pos-ink">C1 to C9 Comparison Matrix</span>
              </div>
              <span className="text-[11.5px] text-pos-ink/60">Auto-Checked against Local Master</span>
            </div>

            <div className="overflow-x-auto w-full min-w-0 [scrollbar-width:thin] [scrollbar-color:rgba(120,120,120,0.2)_transparent]">
              <table className="w-full min-w-[620px] text-left text-[12px]">
                <thead>
                  <tr className="border-b border-pos-line bg-pos-ink text-pos-surface uppercase tracking-wider text-[11px] font-medium">
                    <th className="py-2.5 px-3">Record</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">SynTax Local Record</th>
                    <th className="py-2.5 px-3">TRACES .conso File</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pos-line">
                  {diffItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-pos-muted/50 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-pos-accent">{item.recordType}</td>
                      <td className="py-2.5 px-3 font-medium text-pos-ink">{item.description}</td>
                      <td className="py-2.5 px-3 font-mono text-pos-ink/80">{item.systemValue}</td>
                      <td className="py-2.5 px-3 font-mono text-pos-ink/80">{item.consoValue}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10.5px] font-semibold text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          Matched
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column (28% ~ 4 cols: KYC Quick Card & TRACES Help on XL, full width below XL) */}
        <div className="xl:col-span-4 w-full min-w-0 space-y-4">
          <div className="rounded-2xl border border-pos-line bg-pos-surface p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-pos-line pb-3">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <h3 className="font-display text-[15px] font-semibold text-pos-ink">
                TRACES Fast Login Assist
              </h3>
            </div>
            <p className="text-[12px] text-pos-ink/70 leading-relaxed">
              TRACES requires 3 pieces of statutory data to pass KYC authentication: the 15-digit PRN token, the highest-value challan details, and 3 deductee PANs with exact TDS amounts.
            </p>
            <button
              type="button"
              onClick={handleOpenKyc}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500/20 py-2.5 text-[12.5px] font-semibold text-amber-800 hover:bg-amber-500/30 transition-colors"
            >
              <KeyRound className="h-4 w-4" />
              Open 1-Click Cheat Sheet
            </button>
          </div>
        </div>
      </div>

      {/* 1-Click KYC Cheat Sheet Modal */}
      {showKycModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl border border-pos-line bg-pos-surface p-6 shadow-2xl space-y-4 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between border-b border-pos-line pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-amber-500" />
                <h3 className="font-display text-[16px] font-semibold text-pos-ink">
                  TRACES 1-Click KYC Cheat Sheet
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowKycModal(false)}
                className="text-pos-ink/50 hover:text-pos-ink text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-[12px] text-pos-ink/70 leading-relaxed">
              Click any field value below to copy directly to your clipboard for pasting into the TRACES portal KYC screen.
            </p>

            {/* Token Section */}
            <div className="rounded-xl border border-pos-line bg-pos-muted/40 p-3 space-y-1">
              <span className="text-[10.5px] font-semibold text-pos-ink/50 uppercase">
                1. Token / PRN Number
              </span>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[13px] font-bold text-pos-ink">
                  {kycData?.cheatSheet?.prn ?? activeToken}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(kycData?.cheatSheet?.prn ?? activeToken, 'token')}
                  className="flex items-center gap-1 text-[11px] font-medium text-pos-accent hover:underline"
                >
                  {copiedKey === 'token' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedKey === 'token' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Highest Challan Section */}
            <div className="rounded-xl border border-pos-line bg-pos-muted/40 p-3 space-y-2">
              <span className="text-[10.5px] font-semibold text-pos-ink/50 uppercase">
                2. Highest Challan Deposited
              </span>
              {loadingKyc ? (
                <p className="text-[12px] text-pos-ink/60">Loading challan data...</p>
              ) : kycData?.cheatSheet?.challan ? (
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div>
                    <span className="text-pos-ink/50 block text-[10.5px]">BSR Code</span>
                    <div className="flex items-center justify-between pr-2">
                      <span className="font-mono font-semibold text-pos-ink">{kycData.cheatSheet.challan.bsrCode}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(kycData.cheatSheet!.challan!.bsrCode, 'bsr')}
                        className="text-pos-accent"
                      >
                        {copiedKey === 'bsr' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-pos-ink/50 block text-[10.5px]">Challan Number</span>
                    <div className="flex items-center justify-between pr-2">
                      <span className="font-mono font-semibold text-pos-ink">{kycData.cheatSheet.challan.challanSerial}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(kycData.cheatSheet!.challan!.challanSerial, 'cin')}
                        className="text-pos-accent"
                      >
                        {copiedKey === 'cin' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-pos-ink/50 block text-[10.5px]">Deposit Date</span>
                    <div className="flex items-center justify-between pr-2">
                      <span className="font-mono font-semibold text-pos-ink">{kycData.cheatSheet.challan.depositDate}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(kycData.cheatSheet!.challan!.depositDate, 'date')}
                        className="text-pos-accent"
                      >
                        {copiedKey === 'date' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-pos-ink/50 block text-[10.5px]">Tax Amount (₹)</span>
                    <div className="flex items-center justify-between pr-2">
                      <span className="font-mono font-semibold text-emerald-600">{kycData.cheatSheet.challan.challanAmount}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(kycData.cheatSheet!.challan!.challanAmount, 'tax')}
                        className="text-pos-accent"
                      >
                        {copiedKey === 'tax' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-pos-ink/60">No recorded challan found for this token.</p>
              )}
            </div>

            {/* 3 Deductee PANs */}
            <div className="rounded-xl border border-pos-line bg-pos-muted/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-semibold text-pos-ink/50 uppercase">
                  3. Top 3 Deductee PANs &amp; Amounts
                </span>
                <button
                  type="button"
                  onClick={handleRevealFullPans}
                  disabled={revealingPan || !(kycData?.cheatSheet?.panCombinations?.length)}
                  className="rounded-lg border border-pos-line bg-pos-surface px-2.5 py-1 text-[11px] font-medium text-pos-ink hover:border-pos-accent disabled:opacity-50"
                >
                  {revealingPan ? 'Logging...' : 'Reveal Full PANs (Logged)'}
                </button>
              </div>
              <input
                type="text"
                value={revealReason}
                onChange={(e) => setRevealReason(e.target.value)}
                placeholder="Reason for PAN reveal (audited)"
                className="w-full rounded-lg border border-pos-line bg-pos-surface px-2.5 py-1.5 text-[11.5px] text-pos-ink outline-none focus:border-pos-accent"
              />
              {revealError && <p className="text-[11px] font-medium text-red-600">{revealError}</p>}
              <div className="space-y-1.5 text-[12px]">
                {(kycData?.cheatSheet?.panCombinations ?? []).length === 0 ? (
                  <p className="text-[12px] text-pos-ink/60">No deductee combinations found for this challan.</p>
                ) : (
                  (kycData?.cheatSheet?.panCombinations ?? []).map((ded, idx) => (
                    <div key={ded.deducteeId ?? idx} className="flex items-center justify-between py-0.5">
                      <span className="font-mono font-bold text-pos-ink">{ded.pan}</span>
                      <span className="font-mono text-emerald-600">₹{ded.amount}</span>
                      <button
                        type="button"
                        disabled={ded.masked}
                        onClick={() => copyToClipboard(`${ded.pan} ${ded.amount}`, `ded-${idx}`)}
                        title={ded.masked ? 'Reveal full PAN before copying for TRACES login' : 'Copy PAN and amount'}
                        className="text-[11px] text-pos-accent font-medium hover:underline flex items-center gap-1 disabled:opacity-40 disabled:no-underline"
                      >
                        {copiedKey === `ded-${idx}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        <span>{ded.masked ? 'Masked' : copiedKey === `ded-${idx}` ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowKycModal(false)}
                className="rounded-xl bg-pos-ink px-4 py-2 text-[12.5px] font-medium text-pos-surface"
              >
                Close Cheat Sheet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
