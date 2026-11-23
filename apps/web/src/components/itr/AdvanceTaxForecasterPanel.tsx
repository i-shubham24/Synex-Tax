'use client';

import React, { useMemo, useState } from 'react';
import {
  computeAdvanceTaxForecast,
  type AdvanceTaxForecastInput,
  type TaxpayerCategory,
} from '@synextax/tax-engine';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Info,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';

const inr = (v: string | number) =>
  `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export function AdvanceTaxForecasterPanel() {
  const [category, setCategory] = useState<TaxpayerCategory>('INDIVIDUAL');
  const [hasBusiness, setHasBusiness] = useState(true);
  const [isPresumptive, setIsPresumptive] = useState(false);
  const [grossTax, setGrossTax] = useState<string>('240000');
  const [tdsCredits, setTdsCredits] = useState<string>('40000');
  const [tcsCredits, setTcsCredits] = useState<string>('0');
  const [matCredits, setMatCredits] = useState<string>('0');
  const [relief, setRelief] = useState<string>('0');

  const [q1Paid, setQ1Paid] = useState<string>('20000');
  const [q2Paid, setQ2Paid] = useState<string>('60000');
  const [q3Paid, setQ3Paid] = useState<string>('50000');
  const [q4Paid, setQ4Paid] = useState<string>('40000');
  const [lateMarchPaid, setLateMarchPaid] = useState<string>('0');
  const [filingDate, setFilingDate] = useState<string>('2027-07-31');

  /* Quick presets */
  function loadPreset(preset: 'freelancer' | 'company' | 'senior' | 'compliant') {
    if (preset === 'freelancer') {
      setCategory('INDIVIDUAL');
      setHasBusiness(true);
      setIsPresumptive(true);
      setGrossTax('125000');
      setTdsCredits('25000');
      setTcsCredits('0');
      setQ1Paid('0');
      setQ2Paid('0');
      setQ3Paid('0');
      setQ4Paid('80000');
      setLateMarchPaid('0');
    } else if (preset === 'company') {
      setCategory('COMPANY');
      setHasBusiness(true);
      setIsPresumptive(false);
      setGrossTax('650000');
      setTdsCredits('100000');
      setTcsCredits('0');
      setQ1Paid('60000');
      setQ2Paid('150000');
      setQ3Paid('180000');
      setQ4Paid('120000');
      setLateMarchPaid('0');
    } else if (preset === 'senior') {
      setCategory('SENIOR_CITIZEN');
      setHasBusiness(false);
      setIsPresumptive(false);
      setGrossTax('180000');
      setTdsCredits('30000');
      setTcsCredits('0');
      setQ1Paid('0');
      setQ2Paid('0');
      setQ3Paid('0');
      setQ4Paid('0');
      setLateMarchPaid('0');
    } else {
      setCategory('INDIVIDUAL');
      setHasBusiness(true);
      setIsPresumptive(false);
      setGrossTax('300000');
      setTdsCredits('50000');
      setTcsCredits('0');
      setQ1Paid('40000');
      setQ2Paid('75000');
      setQ3Paid('75000');
      setQ4Paid('60000');
      setLateMarchPaid('0');
    }
  }

  const forecastInput: AdvanceTaxForecastInput = useMemo(
    () => ({
      financialYear: '2026-27',
      taxpayerCategory: category,
      hasBusinessIncome: hasBusiness,
      isPresumptive,
      estimatedGrossTax: Number(grossTax) || 0,
      tdsCredits: Number(tdsCredits) || 0,
      tcsCredits: Number(tcsCredits) || 0,
      matAmtCredits: Number(matCredits) || 0,
      foreignTaxRelief: Number(relief) || 0,
      advanceTaxPaid: {
        upToJune15: Number(q1Paid) || 0,
        upToSept15: Number(q2Paid) || 0,
        upToDec15: Number(q3Paid) || 0,
        upToMarch15: Number(q4Paid) || 0,
        afterMarch15UpToMarch31: Number(lateMarchPaid) || 0,
      },
      filingDate,
    }),
    [
      category,
      hasBusiness,
      isPresumptive,
      grossTax,
      tdsCredits,
      tcsCredits,
      matCredits,
      relief,
      q1Paid,
      q2Paid,
      q3Paid,
      q4Paid,
      lateMarchPaid,
      filingDate,
    ]
  );

  const result = useMemo(() => computeAdvanceTaxForecast(forecastInput), [forecastInput]);

  function exportReport() {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `advance-tax-forecast-FY2026-27.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="pos-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-pos-accent/10 px-2.5 py-0.5 text-[12px] font-semibold text-pos-accent">
              Statutory Engine
            </span>
            <span className="text-[13px] text-pos-ink/60">
              FY 2026-27 / AY 2027-28 (Dual-Act Ready)
            </span>
          </div>
          <h2 className="mt-1 text-[22px] font-bold text-pos-ink">
            Advance Tax & Section 234B / 234C Live Forecaster
          </h2>
          <p className="mt-1 text-[13.5px] text-pos-ink/65">
            Quarterly installment compliance, Section 234C deferment interest, 90% threshold audit, and Rule 119A rounding.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => loadPreset('compliant')}
            className="rounded-full border border-pos-line bg-pos-surface px-3 py-1.5 text-[12.5px] font-medium text-pos-ink/75 hover:bg-pos-tint"
          >
            Regular Assessee
          </button>
          <button
            type="button"
            onClick={() => loadPreset('freelancer')}
            className="rounded-full border border-pos-line bg-pos-surface px-3 py-1.5 text-[12.5px] font-medium text-pos-ink/75 hover:bg-pos-tint"
          >
            44ADA Presumptive
          </button>
          <button
            type="button"
            onClick={() => loadPreset('company')}
            className="rounded-full border border-pos-line bg-pos-surface px-3 py-1.5 text-[12.5px] font-medium text-pos-ink/75 hover:bg-pos-tint"
          >
            Corporate Assessee
          </button>
          <button
            type="button"
            onClick={() => loadPreset('senior')}
            className="rounded-full border border-pos-line bg-pos-surface px-3 py-1.5 text-[12.5px] font-medium text-pos-ink/75 hover:bg-pos-tint"
          >
            Senior Citizen (207(2))
          </button>
          <button
            type="button"
            onClick={exportReport}
            className="inline-flex items-center gap-1.5 rounded-full bg-pos-accent px-4 py-1.5 text-[12.5px] font-medium text-white shadow-sm hover:opacity-90"
          >
            <Download className="h-3.5 w-3.5" /> Export Plan
          </button>
        </div>
      </div>

      {/* Top Status Banner */}
      {result.isExemptSeniorCitizen ? (
        <div className="flex items-center gap-3 rounded-[14px] bg-[#22a356]/10 p-4 text-[#15803d]">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div className="text-[13.5px]">
            <span className="font-semibold">Exempt under Section 207(2):</span> Resident senior citizen with no business or professional income is not liable for advance tax installments.
          </div>
        </div>
      ) : !result.isLiableForAdvanceTax ? (
        <div className="flex items-center gap-3 rounded-[14px] bg-blue-500/10 p-4 text-blue-700">
          <Info className="h-5 w-5 shrink-0" />
          <div className="text-[13.5px]">
            <span className="font-semibold">Section 208 Threshold Not Met:</span> Net assessed tax after TDS/TCS is {inr(result.assessedTax)}, below the statutory ₹10,000 threshold. Advance tax is voluntary.
          </div>
        </div>
      ) : Number(result.totalInterest) > 0 ? (
        <div className="flex items-center gap-3 rounded-[14px] bg-amber-500/10 p-4 text-amber-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="text-[13.5px]">
            <span className="font-semibold">Penal Interest Triggered:</span> Total statutory interest of {inr(result.totalInterest)} (234C: {inr(result.totalInterest234C)}, 234B: {inr(result.totalInterest234B)}) due to installment shortfalls or paying under 90% by March 31.
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-[14px] bg-[#22a356]/10 p-4 text-[#15803d]">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div className="text-[13.5px]">
            <span className="font-semibold">Zero Penalties:</span> Installment timings and cumulative thresholds satisfy statutory safe harbour guidelines under Section 234C and Section 234B.
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div className="pos-card p-4">
          <p className="text-[12px] text-pos-ink/55">Assessed Tax (Sec 209)</p>
          <p className="mt-1 text-[20px] font-bold text-pos-ink tabular-nums">
            {inr(result.assessedTax)}
          </p>
          <p className="mt-0.5 text-[11px] text-pos-ink/50">Gross tax less TDS/credits</p>
        </div>
        <div className="pos-card p-4">
          <p className="text-[12px] text-pos-ink/55">Advance Tax Paid</p>
          <p className="mt-1 text-[20px] font-bold text-[#15803d] tabular-nums">
            {inr(result.advanceTaxPaidTotal)}
          </p>
          <p className="mt-0.5 text-[11px] text-pos-ink/50">Cumulative to 31 March</p>
        </div>
        <div className="pos-card p-4">
          <p className="text-[12px] text-pos-ink/55">90% Target (Sec 234B)</p>
          <p className="mt-1 text-[20px] font-bold text-pos-ink tabular-nums">
            {inr(result.statutory90PercentThreshold)}
          </p>
          <p className="mt-0.5 text-[11px] text-pos-ink/50">Minimum to avoid 234B</p>
        </div>
        <div className="pos-card p-4">
          <p className="text-[12px] text-pos-ink/55">234C Deferment Interest</p>
          <p className={`mt-1 text-[20px] font-bold tabular-nums ${Number(result.totalInterest234C) > 0 ? 'text-[#dc2626]' : 'text-pos-ink'}`}>
            {inr(result.totalInterest234C)}
          </p>
          <p className="mt-0.5 text-[11px] text-pos-ink/50">Installment shortfall penalty</p>
        </div>
        <div className="pos-card p-4">
          <p className="text-[12px] text-pos-ink/55">234B Default Interest</p>
          <p className={`mt-1 text-[20px] font-bold tabular-nums ${Number(result.totalInterest234B) > 0 ? 'text-[#dc2626]' : 'text-pos-ink'}`}>
            {inr(result.totalInterest234B)}
          </p>
          <p className="mt-0.5 text-[11px] text-pos-ink/50">1% per month from 1 April</p>
        </div>
        <div className="pos-card p-4 bg-pos-surface border-pos-accent/30">
          <p className="text-[12px] font-semibold text-pos-accent">Net Balance Payable</p>
          <p className={`mt-1 text-[20px] font-bold tabular-nums ${Number(result.netBalancePayable) > 0 ? 'text-pos-ink' : 'text-[#15803d]'}`}>
            {inr(result.netBalancePayable)}
          </p>
          <p className="mt-0.5 text-[11px] text-pos-ink/50">Unpaid tax + interest</p>
        </div>
      </div>

      {/* Main Grid: Parameters on Left, Installment Schedule & 234B Audit on Right */}
      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        {/* Left Column: Tax & Payment Configuration */}
        <div className="space-y-4">
          {/* Taxpayer Setup */}
          <div className="pos-card p-5 space-y-4">
            <h3 className="text-[14px] font-semibold text-pos-ink flex items-center gap-2">
              <Scale className="h-4 w-4 text-pos-accent" /> Taxpayer Profile & Scheme
            </h3>

            <div>
              <label className="text-[12px] font-medium text-pos-ink/70">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TaxpayerCategory)}
                className="mt-1 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 py-2 text-[13px] text-pos-ink outline-none focus:border-pos-accent"
              >
                <option value="INDIVIDUAL">Individual (Below 60)</option>
                <option value="SENIOR_CITIZEN">Senior Citizen (60 to 79)</option>
                <option value="SUPER_SENIOR">Super Senior Citizen (80+)</option>
                <option value="HUF">Hindu Undivided Family (HUF)</option>
                <option value="COMPANY">Domestic / Foreign Company</option>
                <option value="FIRM">Partnership Firm</option>
                <option value="LLP">Limited Liability Partnership (LLP)</option>
              </select>
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2.5 text-[13px] text-pos-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasBusiness}
                  onChange={(e) => setHasBusiness(e.target.checked)}
                  className="rounded border-pos-line text-pos-accent focus:ring-pos-accent"
                />
                <span>Has Income from Business or Profession</span>
              </label>

              <label className="flex items-center gap-2.5 text-[13px] text-pos-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPresumptive}
                  onChange={(e) => setIsPresumptive(e.target.checked)}
                  className="rounded border-pos-line text-pos-accent focus:ring-pos-accent"
                />
                <span>Presumptive Taxation (Section 44AD / 44ADA)</span>
              </label>
            </div>
          </div>

          {/* Tax Liability & Credits */}
          <div className="pos-card p-5 space-y-4">
            <h3 className="text-[14px] font-semibold text-pos-ink flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-pos-accent" /> Estimated Tax & Credits
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[12px] font-medium text-pos-ink/70">Estimated Gross Tax (₹)</label>
                <input
                  type="number"
                  value={grossTax}
                  onChange={(e) => setGrossTax(e.target.value)}
                  className="mt-1 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 py-2 text-right font-mono text-[13px] text-pos-ink outline-none focus:border-pos-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11.5px] font-medium text-pos-ink/70">TDS Credits (₹)</label>
                  <input
                    type="number"
                    value={tdsCredits}
                    onChange={(e) => setTdsCredits(e.target.value)}
                    className="mt-1 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 py-1.5 text-right font-mono text-[13px] text-pos-ink outline-none focus:border-pos-accent"
                  />
                </div>
                <div>
                  <label className="text-[11.5px] font-medium text-pos-ink/70">TCS Credits (₹)</label>
                  <input
                    type="number"
                    value={tcsCredits}
                    onChange={(e) => setTcsCredits(e.target.value)}
                    className="mt-1 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 py-1.5 text-right font-mono text-[13px] text-pos-ink outline-none focus:border-pos-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11.5px] font-medium text-pos-ink/70">MAT / AMT Credit (₹)</label>
                  <input
                    type="number"
                    value={matCredits}
                    onChange={(e) => setMatCredits(e.target.value)}
                    className="mt-1 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 py-1.5 text-right font-mono text-[13px] text-pos-ink outline-none focus:border-pos-accent"
                  />
                </div>
                <div>
                  <label className="text-[11.5px] font-medium text-pos-ink/70">Foreign Relief Sec 90/91 (₹)</label>
                  <input
                    type="number"
                    value={relief}
                    onChange={(e) => setRelief(e.target.value)}
                    className="mt-1 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 py-1.5 text-right font-mono text-[13px] text-pos-ink outline-none focus:border-pos-accent"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Actual Installment Payments */}
          <div className="pos-card p-5 space-y-4">
            <h3 className="text-[14px] font-semibold text-pos-ink flex items-center gap-2">
              <Calendar className="h-4 w-4 text-pos-accent" /> Actual Advance Tax Paid
            </h3>

            {!isPresumptive ? (
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-[12px] font-medium text-pos-ink/70">
                    <span>Q1: Up to 15 June 2026</span>
                    <span className="text-pos-ink/50">Target 15%</span>
                  </div>
                  <input
                    type="number"
                    value={q1Paid}
                    onChange={(e) => setQ1Paid(e.target.value)}
                    className="mt-1 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 py-1.5 text-right font-mono text-[13px] text-pos-ink outline-none focus:border-pos-accent"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[12px] font-medium text-pos-ink/70">
                    <span>Q2: 16 June to 15 Sept 2026</span>
                    <span className="text-pos-ink/50">Target 45%</span>
                  </div>
                  <input
                    type="number"
                    value={q2Paid}
                    onChange={(e) => setQ2Paid(e.target.value)}
                    className="mt-1 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 py-1.5 text-right font-mono text-[13px] text-pos-ink outline-none focus:border-pos-accent"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[12px] font-medium text-pos-ink/70">
                    <span>Q3: 16 Sept to 15 Dec 2026</span>
                    <span className="text-pos-ink/50">Target 75%</span>
                  </div>
                  <input
                    type="number"
                    value={q3Paid}
                    onChange={(e) => setQ3Paid(e.target.value)}
                    className="mt-1 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 py-1.5 text-right font-mono text-[13px] text-pos-ink outline-none focus:border-pos-accent"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[12px] font-medium text-pos-ink/70">
                    <span>Q4: 16 Dec 2026 to 15 March 2027</span>
                    <span className="text-pos-ink/50">Target 100%</span>
                  </div>
                  <input
                    type="number"
                    value={q4Paid}
                    onChange={(e) => setQ4Paid(e.target.value)}
                    className="mt-1 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 py-1.5 text-right font-mono text-[13px] text-pos-ink outline-none focus:border-pos-accent"
                  />
                </div>
              </div>
            ) : (
              <div>
                <div className="flex justify-between text-[12px] font-medium text-pos-ink/70">
                  <span>Single Installment: On or before 15 March 2027</span>
                  <span className="text-pos-ink/50">Target 100%</span>
                </div>
                <input
                  type="number"
                  value={q4Paid}
                  onChange={(e) => setQ4Paid(e.target.value)}
                  className="mt-1 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 py-2 text-right font-mono text-[13px] text-pos-ink outline-none focus:border-pos-accent"
                />
              </div>
            )}

            <div>
              <div className="flex justify-between text-[12px] font-medium text-pos-ink/70">
                <span>Late Advance Tax: 16 to 31 March 2027</span>
                <span className="text-pos-ink/50">Counts for 234B</span>
              </div>
              <input
                type="number"
                value={lateMarchPaid}
                onChange={(e) => setLateMarchPaid(e.target.value)}
                className="mt-1 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 py-1.5 text-right font-mono text-[13px] text-pos-ink outline-none focus:border-pos-accent"
              />
            </div>

            <div>
              <label className="text-[12px] font-medium text-pos-ink/70">Simulated Filing Date (for 234B months)</label>
              <input
                type="date"
                value={filingDate}
                onChange={(e) => setFilingDate(e.target.value)}
                className="mt-1 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 py-1.5 text-[13px] text-pos-ink outline-none focus:border-pos-accent"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Installment Table & 234B Audit & Recommendations */}
        <div className="space-y-6">
          {/* Section 234C Installment Schedule Table */}
          <div className="pos-card overflow-hidden">
            <div className="border-b border-pos-line px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-semibold text-pos-ink">
                  Section 234C Quarterly Installment Breakdown
                </h3>
                <p className="text-[12.5px] text-pos-ink/60">
                  Shortfall against cumulative statutory thresholds and safe harbour cushions.
                </p>
              </div>
              <span className="rounded-full bg-pos-muted px-3 py-1 font-mono text-[12px] text-pos-ink/80">
                Rule 119A: Round down to ₹100
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[#141416] text-white">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Due Date</th>
                    <th className="px-4 py-3 font-semibold text-right">Statutory %</th>
                    <th className="px-4 py-3 font-semibold text-right">Cumulative Target</th>
                    <th className="px-4 py-3 font-semibold text-right">Actual Paid</th>
                    <th className="px-4 py-3 font-semibold text-right">Shortfall</th>
                    <th className="px-4 py-3 font-semibold text-center">Months</th>
                    <th className="px-4 py-3 font-semibold text-right">Interest 234C</th>
                    <th className="px-4 py-3 font-semibold">Status & Advice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pos-line">
                  {result.installments.map((inst) => (
                    <tr key={inst.installmentNumber} className="hover:bg-pos-tint/40">
                      <td className="px-4 py-3 font-medium text-pos-ink">
                        {inst.dueDate}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {inst.statutoryPercent}%
                        {inst.safeHarbourPercent < inst.statutoryPercent && (
                          <span className="block text-[11px] text-pos-ink/50">
                            Safe: {inst.safeHarbourPercent}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-pos-ink">
                        {inr(inst.cumulativeRequiredAmount)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-pos-ink">
                        {inr(inst.cumulativePaidAmount)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-medium ${inst.isShortfall ? 'text-[#dc2626]' : 'text-[#15803d]'}`}>
                        {inst.isShortfall ? inr(inst.shortfallAmount) : 'Nil'}
                      </td>
                      <td className="px-4 py-3 text-center font-mono">
                        {inst.interestMonths} mo
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${Number(inst.interest234C) > 0 ? 'text-[#dc2626]' : 'text-pos-ink'}`}>
                        {inr(inst.interest234C)}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-pos-ink/75 max-w-xs">
                        {inst.advice}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-pos-line bg-pos-muted/40 px-5 py-3 flex justify-between items-center text-[13px]">
              <span className="font-semibold text-pos-ink">Total Section 234C Interest</span>
              <span className={`font-mono text-[15px] font-bold ${Number(result.totalInterest234C) > 0 ? 'text-[#dc2626]' : 'text-[#15803d]'}`}>
                {inr(result.totalInterest234C)}
              </span>
            </div>
          </div>

          {/* Section 234B Default Audit Card */}
          <div className="pos-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-semibold text-pos-ink flex items-center gap-2">
                  <Clock className="h-4 w-4 text-pos-accent" /> Section 234B Default Audit
                </h3>
                <p className="text-[12.5px] text-pos-ink/60">
                  Mandatory 1% monthly interest from 1 April if advance tax paid before 31 March is below 90% of assessed tax.
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${result.is234BApplicable ? 'bg-[#dc2626]/10 text-[#dc2626]' : 'bg-[#22a356]/10 text-[#15803d]'}`}>
                {result.is234BApplicable ? '234B Default Active' : '90% Target Met'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 rounded-[12px] bg-pos-muted/40 p-4 sm:grid-cols-4 text-[13px]">
              <div>
                <span className="text-pos-ink/55 text-[11.5px] block">Assessed Tax (A)</span>
                <span className="font-mono font-semibold text-pos-ink">{inr(result.assessedTax)}</span>
              </div>
              <div>
                <span className="text-pos-ink/55 text-[11.5px] block">90% Floor (0.90 x A)</span>
                <span className="font-mono font-semibold text-pos-ink">{inr(result.statutory90PercentThreshold)}</span>
              </div>
              <div>
                <span className="text-pos-ink/55 text-[11.5px] block">Paid by 31 March (B)</span>
                <span className="font-mono font-semibold text-[#15803d]">{inr(result.advanceTaxPaidByMarch31)}</span>
              </div>
              <div>
                <span className="text-pos-ink/55 text-[11.5px] block">234B Shortfall (A - B)</span>
                <span className={`font-mono font-semibold ${result.is234BApplicable ? 'text-[#dc2626]' : 'text-pos-ink'}`}>
                  {result.is234BApplicable ? inr(result.shortfall234B) : 'Nil'}
                </span>
              </div>
            </div>

            {result.is234BApplicable ? (
              <div className="rounded-[12px] border border-[#dc2626]/20 bg-[#dc2626]/5 p-4 text-[13px] text-[#dc2626] space-y-1">
                <p className="font-semibold">Calculation Breakdown:</p>
                <p>
                  Base shortfall = {inr(result.shortfall234B)} (rounded down under Rule 119A).
                </p>
                <p>
                  Duration = {result.months234B} month(s) from 1 April 2027 to filing date ({filingDate}).
                </p>
                <p>
                  Formula: {inr(result.shortfall234B)} x 1% x {result.months234B} = {inr(result.totalInterest234B)}.
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-[#15803d]">
                Advance tax paid before 31 March ({inr(result.advanceTaxPaidByMarch31)}) exceeds or equals 90% of assessed tax ({inr(result.statutory90PercentThreshold)}). Section 234B interest is zero.
              </p>
            )}
          </div>

          {/* Actionable Recommendations & Dual-Act Legal Reference */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="pos-card p-4 space-y-2">
              <h4 className="text-[13px] font-semibold text-pos-ink flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-pos-accent" /> Action Plan & Recommendations
              </h4>
              <ul className="space-y-1.5 text-[12.5px] text-pos-ink/70">
                {result.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-pos-accent font-bold">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pos-card p-4 space-y-2">
              <h4 className="text-[13px] font-semibold text-pos-ink flex items-center gap-1.5">
                <Scale className="h-4 w-4 text-pos-accent" /> Dual-Act Statutory Citations
              </h4>
              <dl className="space-y-1.5 text-[11.5px] text-pos-ink/65">
                <div>
                  <dt className="font-semibold text-pos-ink/80">Advance Tax Obligation:</dt>
                  <dd>{result.statutoryCitations.advanceTaxLiability}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-pos-ink/80">Installment Schedule:</dt>
                  <dd>{result.statutoryCitations.installmentSchedule}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-pos-ink/80">Deferment Penalty (234C):</dt>
                  <dd>{result.statutoryCitations.defermentInterest234C}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-pos-ink/80">Default Interest (234B):</dt>
                  <dd>{result.statutoryCitations.defaultInterest234B}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
