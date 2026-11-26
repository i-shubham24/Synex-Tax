'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldCheck,
  Clock,
  Sparkles,
  AlertCircle,
  FileCheck,
  CheckCircle2,
} from 'lucide-react';
import { useWorkspace } from '../../workspace/WorkspaceContext';

interface TdsCommandBarProps {
  onNilQuarterMarked?: () => void;
}

export function TdsCommandBar({ onNilQuarterMarked }: TdsCommandBarProps) {
  const pathname = usePathname();
  const { activeEntity, activeClient } = useWorkspace();
  const [markingNil, setMarkingNil] = useState(false);
  const [nilRecorded, setNilRecorded] = useState(false);

  const tan = activeClient?.tan ?? activeEntity?.tans[0]?.tan ?? 'PTLA02914C';
  const period = 'Q1 (Apr-Jun 2026)';
  const is2025Act = true; // Tax Year 2026-27 on

  const navLinks = [
    { label: 'Overview', href: '/tds' },
    { label: 'Challan Vault (ITNS 281N)', href: '/tds/challans' },
    { label: 'Deductees & PAN Guard', href: '/tds/deductees' },
    { label: 'Form 141 (Schedules A-E)', href: '/tds/form141' },
    { label: 'FVU Cloud Hub', href: '/tds/fvu' },
    { label: 'TRACES Conso Studio', href: '/tds/traces' },
  ];

  const handleMarkNilQuarter = async () => {
    setMarkingNil(true);
    try {
      const res = await fetch(`/api/v1/tds/${tan}/returns/2026-Q1/nil-quarter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxYear: 2026, quarter: 'Q1', formCode: '140' }),
      });
      if (res.ok) {
        setNilRecorded(true);
        onNilQuarterMarked?.();
      }
    } catch {
      // Fallback
    } finally {
      setMarkingNil(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-pos-line bg-pos-surface shadow-sm overflow-hidden text-pos-ink">
      {/* Top Status & Dual-Act Regime Guard */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pos-line bg-pos-muted/40 px-4 py-3 text-[12.5px]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="text-pos-ink/60">Active TAN:</span>
            <span className="font-mono font-semibold text-pos-accent tabular-nums">{tan}</span>
          </div>
          <span className="text-pos-line">|</span>
          <div className="flex items-center gap-1.5 font-medium">
            <span className="text-pos-ink/60">Period:</span>
            <span className="font-semibold">{period}</span>
          </div>
          <span className="text-pos-line">|</span>
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
              {is2025Act ? 'IT Act 2025 | TY 2026-27 | FVU v1.2' : 'Legacy IT Act 1961 | FVU v9.5'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[11.5px] text-pos-ink/60">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            <span>Sec 427 Late Fee:</span>
            <span className="font-mono font-bold text-emerald-600 tabular-nums">&#8377;0.00</span>
          </div>
          <span className="text-pos-line">|</span>
          <div className="text-[11.5px] text-pos-ink/60">
            <span>Correction Window:</span>
            <span className="font-mono font-semibold ml-1 text-pos-ink">724d left</span>
          </div>
          <span className="text-pos-line">|</span>
          {nilRecorded ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Nil Quarter Recorded
            </span>
          ) : (
            <button
              type="button"
              onClick={handleMarkNilQuarter}
              disabled={markingNil}
              className="flex items-center gap-1.5 rounded-full border border-pos-line bg-pos-surface px-3 py-1 text-[11.5px] font-semibold text-pos-ink hover:bg-pos-muted transition-colors disabled:opacity-50"
            >
              <FileCheck className="h-3.5 w-3.5 text-pos-accent" />
              <span>{markingNil ? 'Recording...' : '1-Click Nil Quarter'}</span>
            </button>
          )}
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
