'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smartphone,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  Bot,
  ShieldCheck,
} from 'lucide-react';
import { SteppedPixelEyebrow } from './SteppedPixelEyebrow';

interface AccordionItem {
  id: string;
  number: string;
  title: string;
  description: string;
  expandedDetails: {
    subtitle: string;
    pillTags: string[];
    bottomCaption: string;
    mockupTitle: string;
    mockupBadge: string;
  };
}

const ACCORDION_MODULES: AccordionItem[] = [
  {
    id: 'm-01',
    number: '01',
    title: 'AI Guidance',
    description: 'Get tax advice that actually makes sense, powered by tech that doesn\'t sleep.',
    expandedDetails: {
      subtitle: 'Continuous monitoring of GST circulars, Section 16(4) deadlines, and Table 4(D)(1) reclaim limits.',
      pillTags: ['Tax Consultant', 'AI', 'Smart Tax', 'Advisory 643', '24/7 Engine'],
      bottomCaption: 'Instant statutory cross-verification preventing notice issuance before government submission.',
      mockupTitle: 'Continuous Compliance Radar',
      mockupBadge: 'Zero Open Flags',
    },
  },
  {
    id: 'm-02',
    number: '02',
    title: 'Clarity Meets Compliance',
    description: 'We make sure you\'re 100% legal while keeping things 100% clear without any doubt.',
    expandedDetails: {
      subtitle: 'We make sure you\'re 100% legal while keeping things 100% clear without any doubt.',
      pillTags: ['Tax Consultant', 'AI', 'Smart Tax', 'Innovation', '+3'],
      bottomCaption: 'SynexTax is basically a cheat code for your finances, making the complex feel easy.',
      mockupTitle: 'SynexTax Mobile & Desktop Suite',
      mockupBadge: '100% Legal & Reconciled',
    },
  },
  {
    id: 'm-03',
    number: '03',
    title: 'Smart Help',
    description: 'Instant fuzzy 4-pass GSTR-2B reconciliation and automated 14th IMS deemed acceptance scans.',
    expandedDetails: {
      subtitle: 'Reconcile 10,000 invoices in under 3.5 seconds with exact document matching and financial year normalization.',
      pillTags: ['4-Pass Recon', 'IMS 14th Guard', 'Rule 88A', 'Zero Data Loss'],
      bottomCaption: 'Eliminate manual Excel cross-checking between purchase registers and GST portal downloads.',
      mockupTitle: 'IMS Smart Auto-Match Cockpit',
      mockupBadge: '98.4% Matched',
    },
  },
  {
    id: 'm-04',
    number: '04',
    title: 'Expert Consultation',
    description: 'Direct Punjab CA hotline support, Dual-Act TDS compliance, and Zero-Java USB DSC signing.',
    expandedDetails: {
      subtitle: 'Native FIPS 140-3 token bridge for sub-second signing of returns without browser Java crashes.',
      pillTags: ['Zero-Java DSC', 'Dual-Act TDS', 'Maker-Checker Lock', 'Amritsar On-Site'],
      bottomCaption: 'Built specifically for high-volume Chartered Accountant practices handling corporate compliance.',
      mockupTitle: 'USB Hardware Token Signer',
      mockupBadge: 'Token Detected: Active',
    },
  },
];

export function SwissAccordionModules() {
  const [activeModuleId, setActiveModuleId] = useState<string>('m-02');

  return (
    <section id="services" className="py-20 lg:py-28 bg-[#0E0F10] text-white border-b border-[#24272B] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Section Header Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end pb-8 border-b border-[#24272B]">
          
          <div className="lg:col-span-7 space-y-3">
            <SteppedPixelEyebrow
              text="OUR SERVICES"
              variant="light"
              accentColor="sky"
            />

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.08]">
              Redefining tax consulting <br />
              with AI intelligence
            </h2>
          </div>

          <div className="lg:col-span-5 text-sm text-[#9BA1AA] leading-relaxed">
            We do not just "do taxes." We use smart, AI-driven guidance to elevate your financial confidence and protect your practice from penalties.
          </div>

        </div>

        {/* Accordion Rows */}
        <div className="divide-y divide-[#24272B]">
          {ACCORDION_MODULES.map((mod) => {
            const isExpanded = activeModuleId === mod.id;

            return (
              <div key={mod.id} className="py-6 transition-colors">
                
                {/* Header Row */}
                <div
                  onClick={() => setActiveModuleId(isExpanded ? '' : mod.id)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xs text-[#9BA1AA]">
                      [{mod.number}]
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black font-sans text-white group-hover:text-[#52AEFA] transition-colors">
                      {mod.title}
                    </h3>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6">
                    <p className="text-xs text-[#9BA1AA] max-w-sm hidden md:block">
                      {mod.description}
                    </p>

                    <button
                      className="text-xs font-mono font-bold text-[#52AEFA] hover:underline"
                    >
                      {isExpanded ? '[Close]' : '[Details]'}
                    </button>
                  </div>
                </div>

                {/* Expanded Card Body */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden pt-6"
                    >
                      <div className="bg-[#17191C] rounded-[24px] border border-[#24272B] p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                        
                        {/* Left Details (7 cols) */}
                        <div className="lg:col-span-7 space-y-6">
                          <p className="text-base sm:text-lg font-sans font-medium text-white leading-relaxed">
                            {mod.expandedDetails.subtitle}
                          </p>

                          {/* Pill Tags */}
                          <div className="flex flex-wrap gap-2">
                            {mod.expandedDetails.pillTags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="px-3 py-1 rounded-full bg-[#24272B] border border-white/10 text-xs font-mono text-white/90"
                              >
                                ( {tag} )
                              </span>
                            ))}
                          </div>

                          <div className="p-4 rounded-xl bg-[#0E0F10] border border-[#24272B] text-xs font-mono text-[#9BA1AA]">
                            {mod.expandedDetails.bottomCaption}
                          </div>
                        </div>

                        {/* Right Mockup Showcase with Sky Blue Frame (5 cols) */}
                        <div className="lg:col-span-5 relative">
                          <div className="rounded-[22px] bg-[#52AEFA] p-5 shadow-2xl relative overflow-hidden text-[#0E0F10]">
                            
                            {/* Subtle geometric pattern */}
                            <div
                              className="absolute inset-0 opacity-15 pointer-events-none"
                              style={{
                                backgroundImage: `linear-gradient(to right, #0E0F10 1px, transparent 1px), linear-gradient(to bottom, #0E0F10 1px, transparent 1px)`,
                                backgroundSize: '12px 12px',
                              }}
                            />

                            {/* Floating smartphone screen preview */}
                            <div className="bg-[#0E0F10] rounded-[18px] p-4 text-white shadow-xl space-y-4 border border-black/40">
                              <div className="flex items-center justify-between text-xs font-mono text-[#9BA1AA] border-b border-[#24272B] pb-2">
                                <span>11:52</span>
                                <span className="text-[#52E888] font-bold">5G • 100%</span>
                              </div>

                              <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                                <div className="p-2 rounded-xl bg-[#17191C] border border-[#24272B] flex flex-col items-center gap-1">
                                  <div className="w-6 h-6 rounded-lg bg-[#52AEFA] text-white flex items-center justify-center font-bold">
                                    ST
                                  </div>
                                  <span>SynexTax</span>
                                </div>
                                <div className="p-2 rounded-xl bg-[#17191C] border border-[#24272B] flex flex-col items-center gap-1">
                                  <Calendar className="w-5 h-5 text-[#52E888]" />
                                  <span>Deadlines</span>
                                </div>
                                <div className="p-2 rounded-xl bg-[#17191C] border border-[#24272B] flex flex-col items-center gap-1">
                                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                                  <span>IMS</span>
                                </div>
                                <div className="p-2 rounded-xl bg-[#17191C] border border-[#24272B] flex flex-col items-center gap-1">
                                  <Bot className="w-5 h-5 text-[#52AEFA]" />
                                  <span>AI Help</span>
                                </div>
                              </div>

                              <div className="p-2.5 rounded-lg bg-[#17191C] text-[11px] font-mono text-center text-[#52E888] border border-[#52E888]/30">
                                {mod.expandedDetails.mockupBadge}
                              </div>
                            </div>

                            <div className="mt-3 text-[11px] font-mono font-bold text-[#0E0F10] text-center">
                              {mod.expandedDetails.mockupTitle}
                            </div>

                          </div>
                        </div>

                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
