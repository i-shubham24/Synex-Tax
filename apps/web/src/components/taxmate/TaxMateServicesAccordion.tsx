'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Smartphone,
  Calendar,
  Layers,
  FileText,
} from 'lucide-react';

interface ServiceItem {
  number: string;
  title: string;
  shortDesc: string;
  expandedDetails: {
    description: string;
    tags: string[];
    statutoryNote: string;
  };
}

const SERVICES: ServiceItem[] = [
  {
    number: '01',
    title: 'AI Guidance & Dual-Act Engine',
    shortDesc: 'Automated return preparation for Forms 24Q, 26Q, 27Q, 27EQ and 2025 Form 130/131.',
    expandedDetails: {
      description:
        'Continuous statutory guidance checking tax thresholds (194C, 194J, 194Q) and auto-applying Section 206AA penal rates for non-PAN deductees.',
      tags: ['Tax Consultant', 'Dual-Act TDS', 'Smart Tax', 'Innovation'],
      statutoryNote: 'Section 200(3) & Form 130 / 131 dual-compliance certified.',
    },
  },
  {
    number: '02',
    title: 'Clarity Meets Compliance',
    shortDesc: 'Zero-float monetary arithmetic, Section 170 CGST, and Section 516 IT Act 2025 rounding.',
    expandedDetails: {
      description:
        'We make sure your filings are 100% legally compliant while keeping calculations transparent. Paise are strictly truncated before rounding to nearest Rs 10.',
      tags: ['Tax Consultant', 'AI Math', 'Zero-Float', 'Section 516'],
      statutoryNote: 'Eliminates floating-point penny discrepancies across all return schedules.',
    },
  },
  {
    number: '03',
    title: 'Smart Challan Allocation (ITNS 281N)',
    shortDesc: 'Multi-section allocation supporting up to 20 tax sections in a single payment challan.',
    expandedDetails: {
      description:
        'Automatic reconciliation with NSDL CSI files matching BSR codes, deposit dates, and challan serial numbers without manual data re-entry.',
      tags: ['ITNS 281N', 'CSI Matcher', 'OLTAS Synced', 'Major Head 0020/0021'],
      statutoryNote: 'Enforces Major Head 0020 for Companies vs 0021 for Non-Companies.',
    },
  },
  {
    number: '04',
    title: 'GSTR-2B 4-Pass Recon & Pre-14th Guard',
    shortDesc: 'High-speed fuzzy invoice normalization and 48-hour deemed acceptance risk protection.',
    expandedDetails: {
      description:
        'Scans unactioned IMS records exceeding Rs 25,000 threshold or Section 17(5) blocked credit before GSTN auto-accepts them on the 14th cutoff.',
      tags: ['4-Pass Recon', 'IMS Guard', 'Sec 17(5)', 'Fuzzy FY Token'],
      statutoryNote: 'Stops erroneous ITC claims and Section 50 interest penalties.',
    },
  },
];

export function TaxMateServicesAccordion() {
  const [activeIdx, setActiveIdx] = useState<number>(1); // Default to item 2 (matching TaxMate screenshot)

  return (
    <section id="services" className="py-20 lg:py-28 bg-[#0A0D14] text-white border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Section Header */}
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-slate-800 pb-8">
          <div className="space-y-3 max-w-xl">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
              <span className="w-2.5 h-2.5 bg-cyan-400 inline-block"></span>
              <span>Our Services</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
              Redefining tax consulting with AI intelligence
            </h2>
          </div>

          <p className="text-xs sm:text-sm text-slate-400 max-w-md leading-relaxed">
            Get tax advice that actually makes sense, powered by high-velocity financial technology that never sleeps
            and never makes floating-point calculation errors.
          </p>
        </div>

        {/* Content Split: Left Accordion (7 cols), Right Phone Mockup with geometric tiles (5 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          
          {/* Left Column: Interactive Numbered Services List */}
          <div className="lg:col-span-7 space-y-3 font-sans">
            {SERVICES.map((srv, idx) => {
              const isOpen = activeIdx === idx;

              return (
                <div
                  key={srv.number}
                  onClick={() => setActiveIdx(idx)}
                  className={`rounded-2xl transition-all cursor-pointer border ${
                    isOpen
                      ? 'bg-slate-900/90 border-slate-700/80 p-5 shadow-2xl'
                      : 'bg-slate-950/40 border-slate-800/60 p-4 hover:border-slate-700 hover:bg-slate-900/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono font-bold text-slate-500">[{srv.number}]</span>
                      <h3
                        className={`text-base sm:text-lg font-bold tracking-tight transition-colors ${
                          isOpen ? 'text-white' : 'text-slate-300'
                        }`}
                      >
                        {srv.title}
                      </h3>
                    </div>

                    <span className="text-xs text-slate-500 font-mono">
                      {isOpen ? 'Expanded' : 'Details'}
                    </span>
                  </div>

                  {isOpen && (
                    <div className="mt-4 pt-4 border-t border-slate-800 space-y-4 text-xs text-slate-300">
                      <p className="leading-relaxed">{srv.expandedDetails.description}</p>

                      {/* Pill Tags (Signature TaxMate element) */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {srv.expandedDetails.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-200 text-[10px] font-mono font-medium"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-mono pt-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{srv.expandedDetails.statutoryNote}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right Column: Smartphone Mockup with Geometric Color Cards (TaxMate signature visual) */}
          <div className="lg:col-span-5 relative flex items-center justify-center">
            
            {/* Geometric Colored Backdrop Cards (Sky Blue & Emerald) */}
            <div className="absolute -top-6 -left-6 w-56 h-56 bg-sky-500/20 rounded-3xl blur-2xl pointer-events-none"></div>
            <div className="absolute -bottom-6 -right-6 w-56 h-56 bg-emerald-500/20 rounded-3xl blur-2xl pointer-events-none"></div>
            
            <div className="relative w-full max-w-sm rounded-[36px] p-2 bg-gradient-to-b from-slate-700 to-slate-900 shadow-2xl border border-slate-800">
              
              {/* Phone Mockup Screen */}
              <div className="bg-slate-950 rounded-[30px] p-5 overflow-hidden border border-slate-800 text-white font-mono text-xs space-y-4">
                
                {/* Phone Speaker Notch & Status Bar */}
                <div className="flex items-center justify-between text-[10px] text-slate-400 pb-2 border-b border-slate-800/80">
                  <span className="font-bold text-white">11:52</span>
                  <div className="w-16 h-3 bg-slate-900 rounded-full mx-auto"></div>
                  <span>5G 100%</span>
                </div>

                {/* App Screen Content */}
                <div className="space-y-3 font-sans">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-emerald-400">SynexTax Workstation</span>
                      <h4 className="text-sm font-bold text-white">Quarterly TDS Status</h4>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-slate-950 font-bold flex items-center justify-center text-xs">
                      AV
                    </div>
                  </div>

                  {/* Geometric Tile inside Phone */}
                  <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-600 via-sky-500 to-teal-400 text-white space-y-2 shadow-lg">
                    <span className="text-[10px] font-mono uppercase text-sky-100 font-bold">Form 26Q Active</span>
                    <div className="text-lg font-black font-mono">₹75,000.00</div>
                    <div className="text-[10px] text-sky-100">Sections 194C + 194J Multi-Allocated</div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono space-y-1">
                    <div className="flex justify-between text-slate-400">
                      <span>CSI Challan:</span>
                      <span className="text-emerald-400 font-bold">MATCHED (BSR 0510304)</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>FVU 8.4 Check:</span>
                      <span className="text-cyan-400 font-bold">PASSED (0 ERRORS)</span>
                    </div>
                  </div>

                  <button className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors shadow-md">
                    Execute FIPS 140-3 DSC Signing
                  </button>
                </div>

              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
