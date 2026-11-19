'use client';

import React from 'react';
import { RefreshCcw, Layers, Cpu, ShieldAlert, Check, X, Building, ArrowUpRight, CheckCircle } from 'lucide-react';

export function LandingFeatures() {
  const comparisonItems = [
    {
      feature: 'Deployment & Installation',
      legacy: 'Manual .exe installer, office-locked PC login, manual Service Pack zip updates',
      synextax: 'Zero-install cloud SaaS, instant secure access on any browser with TOTP MFA',
    },
    {
      feature: 'GSTR-2B & IMS Reconciliation',
      legacy: 'Slow exact text matching, fails on formatting like SALES/25-26/1 vs SALES25261',
      synextax: 'Sub-second fuzzy normalization, auto financial year token matching, deemed acceptance guards',
    },
    {
      feature: 'TDS/TCS Statutory Regime',
      legacy: 'Hardcoded legacy 1961 logic only; unable to handle ITNS 281N multi-section challans',
      synextax: 'Dual-Act engine: ITNS 281 single-section and ITNS 281N up to 20 sections with Protean literals',
    },
    {
      feature: 'Client Master Structure',
      legacy: 'Year-split databases; disconnected files for GST, TDS, and ITR across different software',
      synextax: 'Unified 4-Tier Master (Firm -> Group -> Entity PAN -> GSTINs/TANs) with Mod-36 checksums',
    },
    {
      feature: 'Security & Audit Evidence',
      legacy: 'Local Access/SQL databases with no change history; easily altered by local users',
      synextax: 'PostgreSQL 17 RLS isolation, immutable MCA Rule 3 audit triggers, and HMAC context signing',
    },
  ];

  return (
    <section className="py-20 bg-slate-900/50 text-slate-100 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <span className="text-emerald-400 font-semibold tracking-wide uppercase text-xs">Architected For CA Practices</span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Engineered to Solve Daily Statutory Bottlenecks
          </h2>
          <p className="text-slate-400 text-base">
            Every feature is designed directly from the regulatory guidelines and ground-level filing crunch windows faced by tax practitioners.
          </p>
        </div>

        {/* 4 Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          
          <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/40 transition-all space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <RefreshCcw className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Aggressive Recon Engine</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Normalizes invoice numbers by stripping non-alphanumerics, leading zeros, and financial year variations. Eliminates false mismatches between Tally books and GST portal uploads.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/40 transition-all space-y-4">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Dual-Act TDS & TCS</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Full statutory support for ITNS 281 single-section rules and ITNS 281N (up to 20 sections). Automated CSI challan verification and Protean non-PAN literal routing.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/40 transition-all space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Maker-Checker Guard</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Enforces strict segregation of duties under ICAI standards. Staff preparers can validate and reconcile drafts, but signing and portal submission is restricted to Partners.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/40 transition-all space-y-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">USB DSC Bridge</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Lightweight native desktop daemon over origin-pinned loopback HTTPS. Supports FIPS 140-2 and FIPS 140-3 Level 3 tokens with single-use server nonces and zero Java runtime.
            </p>
          </div>

        </div>

        {/* Head-to-Head Comparison Table */}
        <div className="mt-16 rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-white">Why CA Firms Are Upgrading</h3>
              <p className="text-xs text-slate-400 mt-1">Direct architectural comparison: Legacy Desktop Tax Tools vs SynexTax Cloud Platform</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              Benchmarked for Punjab CAs
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/60 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-4 px-6 w-1/4">Statutory Capability</th>
                  <th className="py-4 px-6 w-3/8 text-slate-400">Legacy Desktop Software (Winman / Gen GST)</th>
                  <th className="py-4 px-6 w-3/8 text-emerald-400 font-bold">SynexTax Compliance SaaS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs sm:text-sm">
                {comparisonItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-4 px-6 font-semibold text-white">{item.feature}</td>
                    <td className="py-4 px-6 text-slate-400 flex items-start gap-2">
                      <X className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <span>{item.legacy}</span>
                    </td>
                    <td className="py-4 px-6 text-slate-200 font-medium">
                      <div className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{item.synextax}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </section>
  );
}
