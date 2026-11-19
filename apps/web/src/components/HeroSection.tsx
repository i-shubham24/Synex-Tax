'use client';

import Link from 'next/link';
import {
  Shield,
  ArrowRight,
  TrendingUp,
  Cpu,
  Layers,
  CheckCircle2,
  Lock,
  Sparkles,
  ChevronRight,
  BarChart3,
  FileCheck,
  Usb,
} from 'lucide-react';

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-12 pb-20 lg:pt-16 lg:pb-28 bg-slate-950 text-white">
      {/* Background radial gradient mesh (Dribbble 26909438 fintech aesthetic) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-500/15 via-cyan-500/5 to-transparent blur-3xl pointer-events-none -z-10"></div>
      <div className="absolute top-1/3 -right-48 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -z-10"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Top Text & CTA Block */}
        <div className="max-w-4xl mx-auto text-center space-y-6">
          
          {/* Glowing Status Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-emerald-500/30 text-xs font-mono shadow-lg shadow-emerald-500/10">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-emerald-400 font-bold">Dual-Act Statutory Engine Active:</span>
            <span className="text-slate-300">Income-tax Act 1961 vs 2025 ITNS 281N</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.1]">
            Cloud Tax Architecture Built for{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
              Indian Chartered Accountants
            </span>
          </h1>

          {/* Subtext */}
          <p className="text-base sm:text-lg text-slate-300 max-w-3xl mx-auto leading-relaxed">
            Replace legacy desktop software with a high-velocity compliance platform: sub-second 4-pass GSTR-2B
            reconciliation, 48-hour Pre-14th IMS decision guard, Dual-Act TDS multi-section challans, and native FIPS
            140-3 USB DSC hardware signing.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm transition-all shadow-xl shadow-emerald-500/25 hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Open CA Workstation</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/#smart-etds"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 font-bold text-sm transition-all"
            >
              <FileCheck className="w-4 h-4 text-cyan-400" />
              <span>Explore Smart eTDS & GST</span>
            </Link>
          </div>

          {/* Micro Reassurances */}
          <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>MCA Rule 3 Immutable Audit</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Section 170 & 516 Zero-Float Math</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>FIPS 140-3 Level 3 USB DSC Bridge</span>
            </div>
          </div>

        </div>

        {/* Centerpiece Fintech Mockup (Dribbble 26909438 signature 3D framed dashboard) */}
        <div className="relative max-w-5xl mx-auto rounded-2xl p-1.5 bg-gradient-to-b from-slate-700/60 via-slate-800/30 to-slate-900/80 shadow-2xl shadow-emerald-950/20">
          <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800/80">
            
            {/* Mockup Window Controls */}
            <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></span>
                <span className="text-[11px] font-mono text-slate-400 ml-2">synextax://workstation/gstr2b-recon/03AABCP1332L1Z4</span>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
                <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                  <Usb className="w-3 h-3" />
                  <span>ePass2003 Token Synced</span>
                </span>
                <span className="text-slate-500 hidden sm:inline">Amritsar CA Hub</span>
              </div>
            </div>

            {/* Mockup Body: High-Density Live Metrics & Recon Stream */}
            <div className="p-5 sm:p-6 space-y-5 bg-slate-950/95 font-mono text-xs">
              
              {/* Row 1: KPI Stat Bars */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wide">Recovered ITC (Nov)</span>
                  <div className="text-lg font-bold text-emerald-400 mt-1">₹14,892,400.00</div>
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
                    <TrendingUp className="w-3 h-3" /> +18.4% vs 2B Auto-Draft
                  </span>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wide">4-Pass Recon Match</span>
                  <div className="text-lg font-bold text-cyan-400 mt-1">99.98%</div>
                  <span className="text-[10px] text-slate-500">1,482 of 1,483 Invoices</span>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wide">Dual-Act TDS Forms</span>
                  <div className="text-lg font-bold text-amber-300 mt-1">ITNS 281N (2025)</div>
                  <span className="text-[10px] text-slate-500">20-Section Multi-Grid</span>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wide">48-Hr Pre-14th Guard</span>
                  <div className="text-lg font-bold text-emerald-400 mt-1">Zero Leakage</div>
                  <span className="text-[10px] text-slate-500">Sec 17(5) Auto-Blocked</span>
                </div>
              </div>

              {/* Row 2: Live Inward Supply Reconciliation Feed */}
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold">Live 4-Pass Recon Stream</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px]">
                      Pass 2: FY Normalization
                    </span>
                  </div>
                  <span className="text-slate-500">Latency: 28ms</span>
                </div>

                {/* Sample Stream Item 1 */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      EXACT
                    </span>
                    <div>
                      <div className="text-white font-bold">Amritsar Precision Steel Ltd (03AABCP1332L1Z4)</div>
                      <div className="text-[10px] text-slate-400">PR: INV/2025-26/089 | 2B: INV202526089 (Fuzzy FY Matched)</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold">₹150,000.00</div>
                    <div className="text-emerald-400 text-[10px]">Tax: ₹27,000.00 (CGST+SGST)</div>
                  </div>
                </div>

                {/* Sample Stream Item 2 */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-950/80 border border-amber-500/30 bg-amber-950/10">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      AMENDED DELTA
                    </span>
                    <div>
                      <div className="text-white font-bold">Apex Cloud Solutions Delhi (07BBBPG4512D1ZR)</div>
                      <div className="text-[10px] text-amber-300">Supplier amended taxable from ₹40,000 to ₹48,000 (Delta: +₹1,440.00)</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold">₹48,000.00</div>
                    <div className="text-emerald-400 text-[10px]">Tax: ₹8,640.00 (IGST)</div>
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
