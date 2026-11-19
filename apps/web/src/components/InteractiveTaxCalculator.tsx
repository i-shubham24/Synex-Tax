'use client';

import { useState } from 'react';
import { Calculator, CheckCircle2, ShieldCheck, ArrowRight, Zap, RefreshCw } from 'lucide-react';

export function InteractiveTaxCalculator() {
  const [amount, setAmount] = useState<string>('29994.70');
  const [rate, setRate] = useState<string>('10.00');
  const [delayMonths, setDelayMonths] = useState<number>(2);
  const [isCompany, setIsCompany] = useState<boolean>(false);
  const [hasNoPan, setHasNoPan] = useState<boolean>(false);

  // Monetary calculations
  const effectiveRate = hasNoPan ? 20.0 : parseFloat(rate) || 0;
  const rawBase = parseFloat(amount) || 0;
  const rawTax = (rawBase * effectiveRate) / 100;

  // Section 516 IT Act 2025: Step 1 drop paise, Step 2 round to nearest Rs 10
  const truncatedPaise = Math.floor(rawTax);
  const units = truncatedPaise % 10;
  const statutoryTdsSection516 = units >= 5 ? truncatedPaise + (10 - units) : truncatedPaise - units;

  // Rule 269 Interest Base: Truncate down to multiple of Rs 100
  const interestBaseRule269 = Math.floor(statutoryTdsSection516 / 100) * 100;
  const statutoryInterest = delayMonths > 0 ? interestBaseRule269 * 0.015 * delayMonths : 0;
  const totalPayable = statutoryTdsSection516 + statutoryInterest;

  return (
    <section id="calculator" className="py-16 bg-slate-950 text-white border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        <div className="max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold">
            <Calculator className="w-3.5 h-3.5" />
            <span>Interactive Simulator</span>
          </div>
          <h2 className="text-3xl font-black tracking-tight text-white">
            Live Statutory Tax & Interest Engine
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Test the exact mathematical algorithms mandated by Section 516 of the Income-tax Act, 2025 and Rule 269
            of the Income-tax Rules. Notice how paise are never rounded up before truncating.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          
          {/* Left: Input Controls (6 cols) */}
          <div className="lg:col-span-6 space-y-4 font-mono text-xs">
            <div className="space-y-1.5">
              <label className="text-slate-400 font-semibold block">Gross Payment / Voucher Amount (₹)</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-white font-bold text-sm focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500">Try entering 29994.70 to verify statutory rounding.</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-slate-400 font-semibold block">TDS Rate (%)</label>
                <input
                  type="text"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  disabled={hasNoPan}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-white font-bold focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400 font-semibold block">Deposit Delay (Months)</label>
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={delayMonths}
                  onChange={(e) => setDelayMonths(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-white font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="pt-2 flex flex-wrap gap-4 font-sans text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isCompany}
                  onChange={(e) => setIsCompany(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <span className="text-slate-300">Company Deductee (Major Head 0020)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasNoPan}
                  onChange={(e) => setHasNoPan(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <span className="text-amber-400 font-semibold">No PAN / Invalid PAN (Sec 206AA: 20%)</span>
              </label>
            </div>
          </div>

          {/* Right: Live Calculation Output Breakdown (6 cols) */}
          <div className="lg:col-span-6 bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3 font-mono text-xs">
            <div className="text-slate-400 text-[11px] uppercase border-b border-slate-800 pb-2 flex items-center justify-between">
              <span>Statutory Breakdown</span>
              <span className="text-emerald-400 font-bold">ZERO-FLOAT DECIMAL.JS</span>
            </div>

            <div className="flex justify-between text-slate-400">
              <span>Unrounded Raw Tax:</span>
              <span>₹{rawTax.toFixed(2)}</span>
            </div>

            <div className="flex justify-between text-slate-300">
              <span>Step 1: Truncate Paise:</span>
              <span className="text-white font-bold">₹{truncatedPaise}.00</span>
            </div>

            <div className="flex justify-between text-emerald-400 font-bold border-t border-slate-800/80 pt-2">
              <span>Section 516 Statutory TDS:</span>
              <span>₹{statutoryTdsSection516.toFixed(2)}</span>
            </div>

            <div className="flex justify-between text-slate-400">
              <span>Rule 269 Interest Base (Multiple of 100):</span>
              <span>₹{interestBaseRule269.toFixed(2)}</span>
            </div>

            <div className="flex justify-between text-amber-400">
              <span>Sec 201(1A) Monthly Interest (1.5%/mo):</span>
              <span>₹{statutoryInterest.toFixed(2)}</span>
            </div>

            <div className="flex justify-between text-white font-extrabold text-base border-t border-slate-800 pt-3">
              <span>Total Statutory Payable:</span>
              <span className="text-emerald-400">₹{totalPayable.toFixed(2)}</span>
            </div>

            <div className="text-[10px] text-slate-500 pt-1">
              Challan Head: {isCompany ? '0020 (Company)' : '0021 (Non-Company)'} | Minor Head: 200 (TDS Regular)
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
