'use client';

import React, { useState } from 'react';
import { FileCheck, AlertTriangle, ShieldCheck, Download, Calculator, TrendingUp } from 'lucide-react';
import { computeGstr9AnnualReconciliation, type Gstr9EngineResult } from '@synextax/tax-engine';

export function Gstr9AnnualPanel() {
  const [fy, setFy] = useState('2025-26');
  const [auditedTurnover, setAuditedTurnover] = useState('28500000');
  const [unbilledEnd, setUnbilledEnd] = useState('450000');
  const [unbilledBeg, setUnbilledBeg] = useState('300000');
  const [booksItc, setBooksItc] = useState('2850000');

  /* Sample live practice data */
  const reconResult: Gstr9EngineResult = computeGstr9AnnualReconciliation({
    financialYear: fy,
    gstin: '03AABCA1234F1Z5',
    legalName: 'Amritsar Silk Mills Pvt Ltd',
    outward: {
      b2b: { taxableValue: '21500000.00', igst: '2150000.00', cgst: '860000.00', sgst: '860000.00' },
      b2cSmall: { taxableValue: '5200000.00', igst: '0.00', cgst: '468000.00', sgst: '468000.00' },
      exportsWithoutTax: { taxableValue: '1800000.00' },
      exemptNilNonGst: { exempt: '150000.00', nilRated: '0.00', nonGst: '0.00' },
      creditNotesTaxable: { taxableValue: '350000.00', igst: '35000.00', cgst: '14000.00', sgst: '14000.00' },
    },
    itc: {
      gstr3bTotalItcAvailed: { taxableValue: '18500000.00', igst: '1850000.00', cgst: '500000.00', sgst: '500000.00' },
      itcAsPer2b: { taxableValue: '19200000.00', igst: '1920000.00', cgst: '520000.00', sgst: '520000.00' },
      reversedSection17_5: { taxableValue: '120000.00', igst: '12000.00', cgst: '4800.00', sgst: '4800.00' },
      itcNextYearAvailed: { taxableValue: '250000.00', igst: '25000.00', cgst: '10000.00', sgst: '10000.00' },
    },
    books: {
      auditedGrossTurnover: auditedTurnover || '0',
      unbilledRevenueAtYearEnd: unbilledEnd || '0',
      unbilledRevenueAtBeginning: unbilledBeg || '0',
      auditedBooksTotalItc: booksItc || '0',
      auditedBooksEligibleItc: booksItc || '0',
    },
  });

  const { gstr9, gstr9c, auditFlags } = reconResult;

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(reconResult, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GSTR9_GSTR9C_${reconResult.gstin}_FY_${fy}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[16px] border border-pos-line bg-pos-surface p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-pos-accent/15 text-pos-accent">
              <Calculator className="h-4 w-4" />
            </span>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-pos-ink">GSTR-9 & GSTR-9C Annual Reconciliation Cockpit</h2>
          </div>
          <p className="mt-1 text-[13px] text-pos-ink/70">
            Auto-derived annual return tables (Tables 4 to 8) and audited turnover bridge for statutory reconciliation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={fy}
            onChange={(e) => setFy(e.target.value)}
            className="h-10 rounded-full border border-pos-line bg-pos-surface px-4 text-[13px] font-medium text-pos-ink outline-none"
          >
            <option value="2025-26">FY 2025-26</option>
            <option value="2024-25">FY 2024-25</option>
          </select>
          <button
            type="button"
            onClick={downloadJson}
            className="flex h-10 items-center gap-2 rounded-full bg-pos-accent px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Download className="h-4 w-4" /> Export Annual Schedule
          </button>
        </div>
      </div>

      {auditFlags.length > 0 && (
        <div className="space-y-2">
          {auditFlags.map((flag, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 rounded-[12px] border p-3.5 text-[13px] ${
                flag.severity === 'CRITICAL'
                  ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
              }`}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <span className="font-semibold">{flag.statutorySection}: </span>
                {flag.message}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grid: GSTR-9 Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[14px] border border-pos-line bg-pos-surface p-4">
          <p className="text-[12px] font-medium text-pos-ink/60">Table 4: Net Taxable Outward</p>
          <p className="mt-1 font-mono text-[18px] font-bold text-pos-ink">
            INR {Number(gstr9.table4.subTotalTaxableOutward.taxableValue).toLocaleString('en-IN')}
          </p>
          <div className="mt-2 text-[11px] text-pos-ink/65">
            IGST: INR {Number(gstr9.table4.subTotalTaxableOutward.igst).toLocaleString('en-IN')} | CGST+SGST: INR {Number(gstr9.table4.subTotalTaxableOutward.cgst).toLocaleString('en-IN')}
          </div>
        </div>

        <div className="rounded-[14px] border border-pos-line bg-pos-surface p-4">
          <p className="text-[12px] font-medium text-pos-ink/60">Table 5: Non-Taxable / Exempt</p>
          <p className="mt-1 font-mono text-[18px] font-bold text-pos-ink">
            INR {Number(gstr9.table5.subTotalNonTaxable).toLocaleString('en-IN')}
          </p>
          <div className="mt-2 text-[11px] text-pos-ink/65">
            Zero-rated: INR {Number(gstr9.table5.zeroRatedWithoutTax).toLocaleString('en-IN')} | Exempt: INR {Number(gstr9.table5.exempt).toLocaleString('en-IN')}
          </div>
        </div>

        <div className="rounded-[14px] border border-pos-line bg-pos-surface p-4">
          <p className="text-[12px] font-medium text-pos-ink/60">Table 8D: 2B vs 3B ITC Reconciliation</p>
          <p className="mt-1 font-mono text-[18px] font-bold text-[#15803d] dark:text-[#5fe88a]">
            INR {Number(gstr9.table8.difference8D.igst).toLocaleString('en-IN')} Surplus
          </p>
          <div className="mt-2 text-[11px] text-pos-ink/65">
            GSTR-2B 8A: INR {Number(gstr9.table8.itcAsPer2bTable8A.igst).toLocaleString('en-IN')} | Availed 8B: INR {Number(gstr9.table8.itcDeclaredTable8B.igst).toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* GSTR-9C Audited Reconciliation Bridge */}
      {gstr9c && (
        <div className="rounded-[16px] border border-pos-line bg-pos-surface p-5">
          <div className="flex items-center gap-2 border-b border-pos-line pb-3">
            <TrendingUp className="h-4 w-4 text-pos-accent" />
            <h3 className="text-[15px] font-semibold text-pos-ink">GSTR-9C Table 5: Audited Turnover Bridge</h3>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <div>
              <label className="text-[12px] font-medium text-pos-ink/75">Audited Gross Turnover</label>
              <input
                type="text"
                value={auditedTurnover}
                onChange={(e) => setAuditedTurnover(e.target.value)}
                className="mt-1 h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 font-mono text-[13px] text-pos-ink"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-pos-ink/75">Unbilled Revenue at Year End (+)</label>
              <input
                type="text"
                value={unbilledEnd}
                onChange={(e) => setUnbilledEnd(e.target.value)}
                className="mt-1 h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 font-mono text-[13px] text-pos-ink"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-pos-ink/75">Unbilled Revenue at Start (-)</label>
              <input
                type="text"
                value={unbilledBeg}
                onChange={(e) => setUnbilledBeg(e.target.value)}
                className="mt-1 h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 font-mono text-[13px] text-pos-ink"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-pos-ink/75">Audited Books Eligible ITC</label>
              <input
                type="text"
                value={booksItc}
                onChange={(e) => setBooksItc(e.target.value)}
                className="mt-1 h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 font-mono text-[13px] text-pos-ink"
              />
            </div>
          </div>

          <div className="mt-4 rounded-[12px] bg-pos-muted/50 p-4">
            <div className="grid gap-3 sm:grid-cols-3 text-[13px]">
              <div>
                <span className="text-pos-ink/60">Reconciled Turnover: </span>
                <span className="font-mono font-semibold text-pos-ink">INR {Number(gstr9c.grossTurnover.reconciledTurnover).toLocaleString('en-IN')}</span>
              </div>
              <div>
                <span className="text-pos-ink/60">GSTR-9 Annual Turnover: </span>
                <span className="font-mono font-semibold text-pos-ink">INR {Number(gstr9c.grossTurnover.gstr9Turnover).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-pos-ink/60">Variance: </span>
                <span className={`font-mono font-bold ${gstr9c.grossTurnover.isBalanced ? 'text-[#15803d]' : 'text-red-600'}`}>
                  INR {Number(gstr9c.grossTurnover.unreconciledDifference).toLocaleString('en-IN')}
                </span>
                {gstr9c.grossTurnover.isBalanced && (
                  <ShieldCheck className="h-4 w-4 text-[#15803d]" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
