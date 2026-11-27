'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldCheck,
  Clock,
  KeyRound,
  FileCheck2,
  Lock,
  ChevronRight,
  FileSpreadsheet,
  ReceiptText,
  RotateCw,
} from 'lucide-react';
import { useWorkspace } from '../../workspace/WorkspaceContext';

const WORKFLOW_STEPS = [
  'DRAFT',
  'VALIDATED',
  'RECONCILED',
  'CLIENT_APPROVED',
  'PORTAL_SAVED',
  'FILED',
  'CLOSED',
] as const;

interface GstCommandBarProps {
  currentStep?: (typeof WORKFLOW_STEPS)[number];
  isPeriodLocked?: boolean;
}

export function GstCommandBar({ currentStep = 'VALIDATED', isPeriodLocked = false }: GstCommandBarProps) {
  const pathname = usePathname();
  const { activeEntity, activeClient, activePeriod, setActivePeriod } = useWorkspace();

  const gstin = activeClient?.gstin ?? activeEntity?.gstins[0]?.gstin ?? '03AABCS1429B1Z2';
  const period = activePeriod;

  const navLinks = [
    { label: 'Overview', href: '/gst' },
    { label: 'GSTR-1 & 1A', href: '/gst/gstr1' },
    { label: '4-Pass 2B Recon', href: '/gst/recon-2b' },
    { label: 'IMS Console', href: '/gst/ims' },
    { label: 'GSTR-3B & PMT-06', href: '/gst/gstr3b' },
    { label: 'Reports & Ledgers', href: '/gst/reports' },
    { label: 'Import Sanitizer', href: '/gst/import' },
  ];

  return (
    <div className="mb-6 rounded-2xl border border-pos-line bg-pos-surface shadow-sm overflow-hidden text-pos-ink">
      {/* Top Status & Guard Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pos-line bg-pos-muted/40 px-4 py-3 text-[12.5px]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="text-pos-ink/60">Active GSTIN:</span>
            <span className="font-mono font-semibold text-pos-accent tabular-nums">{gstin}</span>
          </div>
          <span className="text-pos-line">|</span>
          <div className="flex items-center gap-1.5 font-medium">
            <label htmlFor="gst-period-picker" className="text-pos-ink/60">
              Period:
            </label>
            <input
              id="gst-period-picker"
              type="month"
              value={period}
              onChange={(e) => {
                if (e.target.value) setActivePeriod(e.target.value);
              }}
              aria-label="Active GST return period"
              className="rounded-md border border-pos-line bg-pos-surface px-2 py-0.5 font-mono text-[12px] font-semibold text-pos-ink tabular-nums outline-none focus:border-pos-accent"
            />
          </div>
          <span className="text-pos-line">|</span>
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <KeyRound className="h-3.5 w-3.5" />
            <span className="text-[12px] font-medium">GSTN API Token: Active (5h 42m)</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isPeriodLocked ? (
            <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-[11.5px] font-medium text-red-600">
              <Lock className="h-3 w-3" /> Period Locked (Filed)
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11.5px] font-medium text-emerald-600">
              <ShieldCheck className="h-3 w-3" /> Prior GSTR-3B Verified
            </span>
          )}
        </div>
      </div>

      {/* Workflow Stepper Strip */}
      <div className="overflow-x-auto border-b border-pos-line bg-pos-surface px-4 py-2.5">
        <div className="flex min-w-[620px] items-center justify-between gap-1 text-[11px] font-medium">
          {WORKFLOW_STEPS.map((step, idx) => {
            const stepIdx = WORKFLOW_STEPS.indexOf(currentStep);
            const isCompleted = idx < stepIdx;
            const isCurrent = idx === stepIdx;

            return (
              <React.Fragment key={step}>
                <div
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${
                    isCurrent
                      ? 'bg-pos-accent text-white font-semibold'
                      : isCompleted
                      ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                      : 'text-pos-ink/40'
                  }`}
                >
                  <span className={`h-4 w-4 rounded-full flex items-center justify-center text-[10px] ${
                    isCurrent ? 'bg-white text-pos-accent font-bold' : isCompleted ? 'bg-emerald-500/20 text-emerald-600' : 'bg-pos-muted text-pos-ink/50'
                  }`}>
                    {idx + 1}
                  </span>
                  <span>{step}</span>
                </div>
                {idx < WORKFLOW_STEPS.length - 1 && (
                  <ChevronRight className="h-3.5 w-3.5 text-pos-ink/30 shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Suite Subnavigation Tabs */}
      <div className="flex overflow-x-auto px-4 py-2 gap-1.5 bg-pos-surface">
        {navLinks.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-pos-tint text-pos-accent font-semibold shadow-xs'
                  : 'text-pos-ink/70 hover:bg-pos-muted hover:text-pos-ink'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
