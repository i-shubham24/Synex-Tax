'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Sparkles, ArrowRight, ShieldCheck, Check, Layers } from 'lucide-react';
import { SteppedPixelEyebrow } from './SteppedPixelEyebrow';
import { SplitCtaButton } from './SplitCtaButton';

export function SwissSteppedPricing() {
  const [billingCycle, setBillingCycle] = useState<'annual' | 'semiannual'>('annual');
  const [selectedTier, setSelectedTier] = useState<number>(2);

  const pricing = {
    solo: billingCycle === 'annual' ? '8,999' : '4,999',
    growth: billingCycle === 'annual' ? '15,999' : '8,999',
    scale: billingCycle === 'annual' ? '29,999' : '16,499',
    period: billingCycle === 'annual' ? '/yr' : '/6-mo',
  };

  return (
    <section id="pricing" className="py-20 lg:py-28 bg-[#0E0F10] text-white border-b border-[#24272B] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
        
        {/* Top Header Row matching TaxMate Dribbble reference */}
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[#24272B] pb-8">
          <div className="space-y-3 max-w-xl">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-[#9BA1AA]">TaxMate / SynexTax</span>
              <span className="text-xs font-mono text-[#52AEFA]">/ 2025 - 2026 /</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tightest leading-[1.08]">
              Our Three Service Plans
            </h2>
            <p className="text-sm text-[#9BA1AA]">
              Plans designed to support every stage of your tax and compliance process.
            </p>
          </div>

          {/* Interactive Billing Toggle */}
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className={billingCycle === 'annual' ? 'text-white font-bold' : 'text-[#9BA1AA]'}>
              Annual (Best Value)
            </span>

            <button
              type="button"
              onClick={() => setBillingCycle(billingCycle === 'annual' ? 'semiannual' : 'annual')}
              className="w-12 h-6 rounded-full bg-[#17191C] border border-[#24272B] p-0.5 transition-colors relative"
              aria-label="Toggle annual or semi-annual billing"
            >
              <div
                className={`w-4 h-4 rounded-full bg-[#52E888] transition-transform duration-200 ${
                  billingCycle === 'semiannual' ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>

            <span className={billingCycle === 'semiannual' ? 'text-white font-bold' : 'text-[#9BA1AA]'}>
              Semi-Annual
            </span>
          </div>
        </div>

        {/* Stepped Descending Architecture Preview matching 1e9dc0d403349451242901a138478aa6.webp */}
        <div className="p-6 sm:p-8 rounded-[24px] bg-[#17191C] border border-[#24272B] space-y-6">
          <div className="flex items-center justify-between text-xs font-mono text-[#9BA1AA]">
            <span>Click any tier to preview calibrated scope</span>
            <span className="text-[#52AEFA]">/ 2025 - 2026 /</span>
          </div>

          {/* 3 Descending Stepped Sky Blue Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            
            {/* Step 3: Essentials (Lowest Step, Left) */}
            <button
              type="button"
              onClick={() => setSelectedTier(3)}
              className={`text-left p-5 sm:p-6 rounded-[20px] transition-all duration-200 border ${
                selectedTier === 3
                  ? 'bg-[#52AEFA] text-[#0E0F10] border-white shadow-xl scale-[1.02]'
                  : 'bg-[#52AEFA]/85 hover:bg-[#52AEFA] text-[#0E0F10] border-transparent'
              }`}
            >
              <div className="flex items-center justify-between font-mono mb-2">
                <span className="text-xl font-black">Tier 3</span>
                <span className="w-5 h-5 rounded-full bg-[#0E0F10] text-[#52AEFA] flex items-center justify-center text-xs">
                  ✓
                </span>
              </div>
              <div className="text-sm font-bold">Essentials</div>
              <p className="text-xs text-[#0E0F10]/80 mt-1 leading-snug">
                Basic AI tax insights, reminders, and filing guidance for independent practitioners.
              </p>
            </button>

            {/* Step 2: Smart Support (Middle Step, Offset Up) */}
            <button
              type="button"
              onClick={() => setSelectedTier(2)}
              className={`text-left p-5 sm:p-6 rounded-[20px] transition-all duration-200 border md:-translate-y-4 ${
                selectedTier === 2
                  ? 'bg-[#52AEFA] text-[#0E0F10] border-white shadow-2xl scale-[1.02]'
                  : 'bg-[#52AEFA]/85 hover:bg-[#52AEFA] text-[#0E0F10] border-transparent'
              }`}
            >
              <div className="flex items-center justify-between font-mono mb-2">
                <span className="text-xl font-black">Tier 2</span>
                <span className="w-5 h-5 rounded-full bg-[#0E0F10] text-[#52E888] flex items-center justify-center text-xs">
                  ★
                </span>
              </div>
              <div className="text-sm font-bold">Smart Support</div>
              <p className="text-xs text-[#0E0F10]/80 mt-1 leading-snug">
                Advanced, personalized and priority help with 4-pass fuzzy GSTR-2B reconciliation.
              </p>
            </button>

            {/* Step 1: Full Confidence (Highest Step, Offset Highest) */}
            <button
              type="button"
              onClick={() => setSelectedTier(1)}
              className={`text-left p-5 sm:p-6 rounded-[20px] transition-all duration-200 border md:-translate-y-8 ${
                selectedTier === 1
                  ? 'bg-[#52AEFA] text-[#0E0F10] border-white shadow-2xl scale-[1.02]'
                  : 'bg-[#52AEFA]/85 hover:bg-[#52AEFA] text-[#0E0F10] border-transparent'
              }`}
            >
              <div className="flex items-center justify-between font-mono mb-2">
                <span className="text-xl font-black">Tier 1</span>
                <span className="w-5 h-5 rounded-full bg-[#0E0F10] text-[#52AEFA] flex items-center justify-center text-xs">
                  ⚡
                </span>
              </div>
              <div className="text-sm font-bold">Full Confidence</div>
              <p className="text-xs text-[#0E0F10]/80 mt-1 leading-snug">
                Comprehensive, expert-level insights, Dual-Act TDS Form 140, and MCA Rule 3 compliance.
              </p>
            </button>

          </div>

          <div className="text-xs font-mono text-[#9BA1AA] pt-2 border-t border-[#24272B] text-center">
            Comprehensive AI guidance, expert-level insights, priority response, and compliance monitoring.
          </div>
        </div>

        {/* 3 Detailed Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          
          {/* Card 1: Solo Practitioner (Tier 3) */}
          <div
            className={`rounded-[22px] p-6 sm:p-8 bg-[#17191C] border transition-all duration-300 flex flex-col justify-between space-y-6 shadow-xl ${
              selectedTier === 3 ? 'border-[#52AEFA] ring-2 ring-[#52AEFA]/30' : 'border-[#24272B]'
            }`}
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-mono text-xs font-bold text-[#52AEFA] uppercase tracking-wider">
                  Tier 3: Essentials
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0E0F10] text-[#9BA1AA] border border-[#24272B]">
                  UPI AutoPay
                </span>
              </div>

              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl sm:text-4xl font-black font-sans text-white">₹{pricing.solo}</span>
                  <span className="text-xs font-mono text-[#9BA1AA]">{pricing.period}</span>
                </div>
                <div className="text-xs text-[#9BA1AA] mt-1">For independent CAs and small tax offices</div>
              </div>

              <div className="space-y-2.5 pt-4 border-t border-[#24272B] text-xs font-mono">
                <div className="flex items-center gap-2 text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52AEFA] shrink-0" />
                  <span>Up to 50 GSTINs</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52AEFA] shrink-0" />
                  <span>Up to 25 TANs</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52AEFA] shrink-0" />
                  <span>3 Concurrent Staff Seats</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52AEFA] shrink-0" />
                  <span>4-Pass Fuzzy GSTR-2B Recon</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52AEFA] shrink-0" />
                  <span>Zero-Java USB DSC Signer</span>
                </div>
              </div>
            </div>

            <SplitCtaButton href="/signup" variant="dark" accent="sky" className="w-full justify-between">
              Start Free Trial
            </SplitCtaButton>
          </div>

          {/* Card 2: Growth Firm (Tier 2, Highlighted) */}
          <div
            className={`rounded-[22px] p-6 sm:p-8 bg-gradient-to-b from-[#17191C] to-[#121417] border-2 transition-all duration-300 flex flex-col justify-between space-y-6 shadow-2xl relative ${
              selectedTier === 2 ? 'border-[#52E888] ring-4 ring-[#52E888]/20' : 'border-[#52E888]'
            }`}
          >
            {/* Top Highlight Badge */}
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#52E888] text-[#0E0F10] text-[10px] font-mono font-bold tracking-wider uppercase shadow-md flex items-center gap-1">
              <Sparkles className="w-3 h-3 fill-[#0E0F10]" />
              <span>Recommended for CA Firms</span>
            </div>

            <div className="space-y-4 pt-1">
              <div className="flex justify-between items-center">
                <span className="font-mono text-xs font-bold text-[#52E888] uppercase tracking-wider">
                  Tier 2: Smart Support
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#52E888]/15 text-[#52E888] border border-[#52E888]/30 font-bold">
                  Rush-Day Support
                </span>
              </div>

              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl sm:text-4xl font-black font-sans text-white">₹{pricing.growth}</span>
                  <span className="text-xs font-mono text-[#9BA1AA]">{pricing.period}</span>
                </div>
                <div className="text-xs text-[#9BA1AA] mt-1">For expanding partnership CA practices</div>
              </div>

              <div className="space-y-2.5 pt-4 border-t border-[#24272B] text-xs font-mono">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52E888] shrink-0" />
                  <span>Up to 200 GSTINs</span>
                </div>
                <div className="flex items-center gap-2 text-white font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52E888] shrink-0" />
                  <span>Up to 100 TANs</span>
                </div>
                <div className="flex items-center gap-2 text-[#52E888] font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52E888] shrink-0" />
                  <span>Unlimited Staff Seats</span>
                </div>
                <div className="flex items-center gap-2 text-white font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52E888] shrink-0" />
                  <span>Maker-Checker Filing Lock</span>
                </div>
                <div className="flex items-center gap-2 text-white font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52E888] shrink-0" />
                  <span>Dual-Act Form 138/140 & FVU v1.2</span>
                </div>
                <div className="flex items-center gap-2 text-white font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52E888] shrink-0" />
                  <span>9AM to 10PM Filing Day Hotline</span>
                </div>
              </div>
            </div>

            <SplitCtaButton href="/signup" variant="light" accent="mint" className="w-full justify-between">
              Start Free Trial
            </SplitCtaButton>
          </div>

          {/* Card 3: Scale Practice (Tier 1) */}
          <div
            className={`rounded-[22px] p-6 sm:p-8 bg-[#17191C] border transition-all duration-300 flex flex-col justify-between space-y-6 shadow-xl ${
              selectedTier === 1 ? 'border-[#52AEFA] ring-2 ring-[#52AEFA]/30' : 'border-[#24272B]'
            }`}
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-mono text-xs font-bold text-[#52AEFA] uppercase tracking-wider">
                  Tier 1: Full Confidence
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0E0F10] text-[#52AEFA] border border-[#24272B]">
                  Full Audit Pack
                </span>
              </div>

              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl sm:text-4xl font-black font-sans text-white">₹{pricing.scale}</span>
                  <span className="text-xs font-mono text-[#9BA1AA]">{pricing.period}</span>
                </div>
                <div className="text-xs text-[#9BA1AA] mt-1">For multi-branch CA firms and corporate teams</div>
              </div>

              <div className="space-y-2.5 pt-4 border-t border-[#24272B] text-xs font-mono">
                <div className="flex items-center gap-2 text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52AEFA] shrink-0" />
                  <span>Up to 600 GSTINs</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52AEFA] shrink-0" />
                  <span>Up to 300 TANs</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52AEFA] shrink-0" />
                  <span>e-Invoice & 14-Digit E-Way Bill</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52AEFA] shrink-0" />
                  <span>MCA Rule 3(1) Immutable Audit Export</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52AEFA] shrink-0" />
                  <span>White-Label Client Portal & WhatsApp</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#52AEFA] shrink-0" />
                  <span>Dedicated CA Account Manager</span>
                </div>
              </div>
            </div>

            <SplitCtaButton href="/signup" variant="dark" accent="sky" className="w-full justify-between">
              Start Free Trial
            </SplitCtaButton>
          </div>

        </div>

        {/* Bottom Callout Note */}
        <div className="p-4 rounded-xl bg-[#17191C] border border-[#24272B] text-center text-xs font-mono text-[#9BA1AA]">
          No per-PC node fees. No hidden revision charges. Free 10-minute automated data migration from SmartBiz & CompuTax.
        </div>

      </div>
    </section>
  );
}
