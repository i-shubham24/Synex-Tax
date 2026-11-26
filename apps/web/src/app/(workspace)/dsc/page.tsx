'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  KeyRound,
  Usb,
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  FileCheck2,
  Layers,
  ArrowUpRight,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { DscSigningPanel } from '../../../components/audit/DscSigningPanel';
import { useWorkspace } from '../../../workspace/WorkspaceContext';

interface CustodyItem {
  id: string;
  clientName: string;
  signatory: string;
  pan: string;
  tokenSerial: string;
  fipsProfile: 'FIPS_140_3_LEVEL_3' | 'FIPS_140_2';
  expiryDate: string;
  daysRemaining: number;
  custodyLocation: string;
  pendingFilings: number;
}

const CUSTODY_ITEMS: CustodyItem[] = [
  {
    id: 'c-1',
    clientName: 'Amritsar Silk Mills Pvt Ltd',
    signatory: 'CA Amrinder Verma (Partner)',
    pan: 'AABCA1294F',
    tokenSerial: '8F2A109B',
    fipsProfile: 'FIPS_140_3_LEVEL_3',
    expiryDate: '2027-11-20',
    daysRemaining: 358,
    custodyLocation: 'Locker A-1 (Office Safe)',
    pendingFilings: 2,
  },
  {
    id: 'c-2',
    clientName: 'Gurdas Fabrics & Weaving',
    signatory: 'Gurdas Singh (Director)',
    pan: 'BQRPS4410K',
    tokenSerial: '4410K998',
    fipsProfile: 'FIPS_140_2',
    expiryDate: '2026-12-11',
    daysRemaining: 15,
    custodyLocation: 'Drawer 3 (Audit Desk)',
    pendingFilings: 1,
  },
  {
    id: 'c-3',
    clientName: 'Majha Agro Rice Mills',
    signatory: 'Balwinder Kaur (Partner)',
    pan: 'AAHFM5512L',
    tokenSerial: '7721M304',
    fipsProfile: 'FIPS_140_3_LEVEL_3',
    expiryDate: '2026-12-03',
    daysRemaining: 7,
    custodyLocation: 'Locker B-2 (Partner Desk)',
    pendingFilings: 3,
  },
];

export default function DscSignHubPage() {
  const { activeClient } = useWorkspace();
  const [items, setItems] = useState<CustodyItem[]>(CUSTODY_ITEMS);
  const [filter, setFilter] = useState<'ALL' | 'URGENT' | 'OFFICE'>('ALL');
  const [agentOnline, setAgentOnline] = useState<boolean>(true);

  // Check Go DSC agent on mount
  React.useEffect(() => {
    let cancelled = false;
    async function checkAgent() {
      try {
        const res = await fetch('http://127.0.0.1:15850/health', { cache: 'no-store' });
        if (!cancelled) setAgentOnline(res.ok);
      } catch {
        if (!cancelled) setAgentOnline(false);
      }
    }
    checkAgent();
    return () => {
      cancelled = true;
    };
  }, []);

  const criticalTokens = items.filter((item) => item.daysRemaining <= 7);
  const warningTokens = items.filter((item) => item.daysRemaining > 7 && item.daysRemaining <= 15);
  const fipsTokens = items.filter((item) => item.fipsProfile === 'FIPS_140_3_LEVEL_3');

  const filteredItems = items.filter((item) => {
    if (filter === 'URGENT') return item.daysRemaining <= 15;
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-pos-line pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky/20 text-sky-deep font-semibold">
              <KeyRound className="h-4 w-4" />
            </span>
            <h1 className="font-display text-[22px] font-semibold text-pos-ink">
              SynTax Sign Hub
            </h1>
          </div>
          <p className="mt-1 text-[13px] text-pos-ink/70">
            Zero-Java Go 1.27 USB token agent, FIPS 140-3 detection, office custody radar &amp; TRACES batch PAdES signing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ${
              agentOnline
                ? 'bg-emerald-500/10 text-emerald-600'
                : 'bg-amber-500/10 text-amber-600'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                agentOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            {agentOnline ? 'Go Agent Online (127.0.0.1:15850)' : 'Go Agent Standby'}
          </span>
        </div>
      </div>

      {/* Expiry Radar Alert Strip (45/15/7 Days) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-pos-line bg-pos-surface p-4 shadow-sm flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11.5px] font-medium text-pos-ink/60 uppercase tracking-wider">
              7-Day Expiry Radar
            </span>
            <p className="font-display text-[18px] font-semibold text-pos-ink mt-0.5">
              {criticalTokens.length} Token{criticalTokens.length === 1 ? '' : 's'} Critical
            </p>
            <p className="text-[12px] text-pos-ink/70 mt-0.5">
              {criticalTokens[0]
                ? `${criticalTokens[0].clientName} expires in ${criticalTokens[0].daysRemaining}d`
                : 'No critical tokens this week'}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-pos-line bg-pos-surface p-4 shadow-sm flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11.5px] font-medium text-pos-ink/60 uppercase tracking-wider">
              15-Day Expiry Notice
            </span>
            <p className="font-display text-[18px] font-semibold text-pos-ink mt-0.5">
              {warningTokens.length} Token{warningTokens.length === 1 ? '' : 's'} Warning
            </p>
            <p className="text-[12px] text-pos-ink/70 mt-0.5">
              {warningTokens[0]
                ? `${warningTokens[0].clientName} renewal notice dispatched`
                : 'No immediate renewals required'}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-pos-line bg-pos-surface p-4 shadow-sm flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky/20 text-sky-deep">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11.5px] font-medium text-pos-ink/60 uppercase tracking-wider">
              FIPS Tier (Estimated)
            </span>
            <p className="font-display text-[18px] font-semibold text-pos-ink mt-0.5">
              {fipsTokens.length} Estimated 140-3
            </p>
            <p className="text-[12px] text-pos-ink/70 mt-0.5">
              Estimated from certificate issue date vs CCA 2026 rules
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: DscSigningPanel Left + Office Custody Table Right */}
      <div className="grid gap-6 xl:grid-cols-12 items-start w-full min-w-0">
        {/* Left Column: Live Loopback DSC Signing Panel (7 cols on XL, full width below XL) */}
        <div className="xl:col-span-7 w-full min-w-0 space-y-4">
          <div className="rounded-2xl border border-pos-line bg-pos-surface p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-pos-line pb-4 mb-4">
              <div>
                <h2 className="font-display text-[16px] font-semibold text-pos-ink">
                  USB Token Signing Console
                </h2>
                <p className="text-[12px] text-pos-ink/65">
                  Direct connection with local Go 1.27 loopback agent over origin-pinned HTTPS.
                </p>
              </div>
              <span className="rounded-lg bg-sky/15 px-2.5 py-1 text-[11px] font-mono text-sky-deep font-medium">
                SHA-256 Nonce
              </span>
            </div>

            {/* Embed existing DscSigningPanel */}
            <DscSigningPanel />
          </div>
        </div>

        {/* Right Column: Office Custody Table & Batch Queue (5 cols on XL, full width below XL) */}
        <div className="xl:col-span-5 w-full min-w-0 space-y-4">
          {/* Office Custody Tracker */}
          <div className="rounded-2xl border border-pos-line bg-pos-surface p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-pos-line pb-3 mb-3">
              <div>
                <h3 className="font-display text-[15px] font-semibold text-pos-ink">
                  Office DSC Custody Table
                </h3>
                <p className="text-[11.5px] text-pos-ink/60">
                  Tracking dongles held for client filings.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFilter(filter === 'URGENT' ? 'ALL' : 'URGENT')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  filter === 'URGENT'
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                    : 'bg-pos-muted text-pos-ink/70 hover:bg-pos-muted/80'
                }`}
              >
                {filter === 'URGENT' ? 'Showing Urgent' : 'Filter Urgent'}
              </button>
            </div>

            <div className="space-y-3">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-pos-line p-3 hover:bg-pos-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-[13px] text-pos-ink">{item.clientName}</p>
                      <p className="text-[11.5px] text-pos-ink/60 mt-0.5">{item.signatory}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                        item.daysRemaining <= 7
                          ? 'bg-rose-500/15 text-rose-600'
                          : item.daysRemaining <= 15
                            ? 'bg-amber-500/15 text-amber-600'
                            : 'bg-emerald-500/15 text-emerald-600'
                      }`}
                    >
                      {item.daysRemaining}d left
                    </span>
                  </div>

                  <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px] text-pos-ink/70 border-t border-pos-line/50 pt-2">
                    <div>
                      <span className="text-pos-ink/40 block">Hardware / FIPS:</span>
                      <span className="font-mono text-[10.5px] text-pos-ink">
                        {item.fipsProfile === 'FIPS_140_3_LEVEL_3' ? 'FIPS 140-3 L3' : 'FIPS 140-2'}
                      </span>
                    </div>
                    <div>
                      <span className="text-pos-ink/40 block">Location:</span>
                      <span className="text-pos-ink truncate block">{item.custodyLocation}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TRACES Form 130/131/133 Batch PAdES Status */}
          <div className="rounded-2xl border border-pos-line bg-pos-surface p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-pos-line pb-3 mb-3">
              <div>
                <h3 className="font-display text-[15px] font-semibold text-pos-ink">
                  TRACES Batch PAdES Queue
                </h3>
                <p className="text-[11.5px] text-pos-ink/60">
                  Splits .zip archives for single-PIN bulk signing.
                </p>
              </div>
              <span className="rounded bg-mint/20 px-2 py-0.5 text-[10.5px] font-medium text-mint-deep">
                Active Queue
              </span>
            </div>

            <div className="space-y-2 text-[12px] text-pos-ink/75">
              <div className="flex items-center justify-between rounded-lg bg-pos-muted/40 p-2.5">
                <span>Form 130 Salary TDS (Q2)</span>
                <span className="font-semibold text-pos-ink">48 PDFs</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-pos-muted/40 p-2.5">
                <span>Form 131 Contractor TDS (Q2)</span>
                <span className="font-semibold text-pos-ink">26 PDFs</span>
              </div>
            </div>

            <div className="mt-4 border-t border-pos-line pt-3 flex items-center justify-between text-[11.5px] text-pos-ink/60">
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-mint" />
                Audit Log: Rule 3(6) Vault Sealed
              </span>
              <Link href="/audit" className="text-sky hover:underline font-medium">
                View Log
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
