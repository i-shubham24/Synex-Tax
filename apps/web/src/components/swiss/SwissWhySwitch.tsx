'use client';

import React from 'react';
import Link from 'next/link';
import {
  Rocket,
  Users,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { SteppedPixelEyebrow } from './SteppedPixelEyebrow';
import { SplitCtaButton } from './SplitCtaButton';

export function SwissWhySwitch() {
  return (
    <section id="about" className="py-20 lg:py-28 bg-[#0E0F10] text-white border-b border-[#24272B] overflow-hidden relative">
      
      {/* Corner Mono Period Tag */}
      <div className="absolute top-8 right-8 font-mono text-xs text-[#9BA1AA] hidden sm:block">
        / 2025 - 2026 /
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        
        {/* Main Grid: Left Column Copy & Stats, Right Column 3 Ascending Stepped Mint Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          
          {/* Left Column: Heading & Stats (5 cols) */}
          <div className="lg:col-span-5 space-y-8">
            
            <div className="space-y-4">
              <SteppedPixelEyebrow
                text="ABOUT SYNEXTAX"
                variant="light"
                accentColor="mint"
              />

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.08]">
                AI companion, <br />
                offering support and <br />
                precision in your life.
              </h2>

              <p className="text-sm sm:text-base text-[#9BA1AA] leading-relaxed max-w-md">
                We are a passionate team of Chartered Accountants, tax advocates, and systems engineers who grew weary of witnessing finance teams struggle with legacy desktop software and intimidating tax forms.
              </p>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 gap-6 pt-4 border-t border-[#24272B]">
              <div>
                <div className="text-3xl sm:text-4xl font-black text-white font-sans tracking-tight">
                  325<sup className="text-[#52E888] text-lg">+</sup>
                </div>
                <div className="text-xs font-mono text-[#9BA1AA] mt-1">Trusted CA Clients</div>
              </div>

              <div>
                <div className="text-3xl sm:text-4xl font-black text-white font-sans tracking-tight">
                  125<sup className="text-[#52AEFA] text-lg">+</sup>
                </div>
                <div className="text-xs font-mono text-[#9BA1AA] mt-1">Company Partners</div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <SplitCtaButton
                href="/signup"
                label="Get Started Now"
                variant="light"
                accentColor="mint"
              />

              <Link
                href="/signup"
                className="px-5 py-3 rounded-full border border-[#24272B] hover:border-white text-xs font-sans font-bold text-white transition-colors"
              >
                Start Your Free Trial
              </Link>
            </div>

          </div>

          {/* Right Column: 3 Ascending Diagonal Stepped Mint-Green Cards (#52E888) (7 cols) */}
          <div className="lg:col-span-7 relative">
            
            {/* Ambient emerald blur backdrop */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-[#52E888]/10 rounded-full blur-3xl pointer-events-none" />

            {/* Stepped Cards Container */}
            <div className="flex flex-col sm:relative sm:h-[460px] gap-4 sm:gap-0">
              
              {/* Step 1: Bottom-Left Card (The Mission) */}
              <div className="sm:absolute sm:bottom-0 sm:left-0 sm:w-[280px] bg-[#52E888] text-[#0E0F10] rounded-[22px] p-6 shadow-xl transition-transform hover:-translate-y-1 duration-200 relative overflow-hidden z-10 border border-white/20">
                {/* Mosaic Texture */}
                <div
                  className="absolute inset-0 opacity-15 pointer-events-none"
                  style={{
                    backgroundImage: `linear-gradient(to right, #0E0F10 1px, transparent 1px), linear-gradient(to bottom, #0E0F10 1px, transparent 1px)`,
                    backgroundSize: '10px 10px',
                  }}
                />
                
                <div className="w-8 h-8 rounded-full bg-[#0E0F10]/15 flex items-center justify-center text-[#0E0F10] mb-3">
                  <Rocket className="w-4 h-4" />
                </div>
                <h3 className="text-base font-black tracking-tight text-[#0E0F10]">The Mission</h3>
                <p className="text-xs text-[#0E0F10]/90 font-medium leading-relaxed mt-2">
                  SynexTax was born to bridge the gap between messy tax rules and simple, confident decisions.
                </p>
              </div>

              {/* Step 2: Center Stepped Card (Human-Centric) */}
              <div className="sm:absolute sm:top-28 sm:left-44 sm:w-[280px] bg-[#52E888] text-[#0E0F10] rounded-[22px] p-6 shadow-xl transition-transform hover:-translate-y-1 duration-200 relative overflow-hidden z-20 border border-white/20">
                {/* Mosaic Texture */}
                <div
                  className="absolute inset-0 opacity-15 pointer-events-none"
                  style={{
                    backgroundImage: `linear-gradient(to right, #0E0F10 1px, transparent 1px), linear-gradient(to bottom, #0E0F10 1px, transparent 1px)`,
                    backgroundSize: '10px 10px',
                  }}
                />

                <div className="w-8 h-8 rounded-full bg-[#0E0F10]/15 flex items-center justify-center text-[#0E0F10] mb-3">
                  <Users className="w-4 h-4" />
                </div>
                <h3 className="text-base font-black tracking-tight text-[#0E0F10]">Human-Centric</h3>
                <p className="text-xs text-[#0E0F10]/90 font-medium leading-relaxed mt-2">
                  Tax consulting should focus on people and empathy, not just intimidating forms and numbers.
                </p>
              </div>

              {/* Step 3: Top-Right Stepped Card (Full Confidence) */}
              <div className="sm:absolute sm:top-0 sm:right-0 sm:w-[280px] bg-[#52E888] text-[#0E0F10] rounded-[22px] p-6 shadow-xl transition-transform hover:-translate-y-1 duration-200 relative overflow-hidden z-30 border border-white/20">
                {/* Mosaic Texture */}
                <div
                  className="absolute inset-0 opacity-15 pointer-events-none"
                  style={{
                    backgroundImage: `linear-gradient(to right, #0E0F10 1px, transparent 1px), linear-gradient(to bottom, #0E0F10 1px, transparent 1px)`,
                    backgroundSize: '10px 10px',
                  }}
                />

                <div className="w-8 h-8 rounded-full bg-[#0E0F10]/15 flex items-center justify-center text-[#0E0F10] mb-3">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h3 className="text-base font-black tracking-tight text-[#0E0F10]">Full Confidence</h3>
                <p className="text-xs text-[#0E0F10]/90 font-medium leading-relaxed mt-2">
                  Comprehensive AI guidance, expert-level insights, and automated compliance monitoring.
                </p>
              </div>

            </div>

            {/* Bottom context caption */}
            <div className="text-xs text-[#9BA1AA] font-mono text-right mt-6">
              AI partner, crafted to offer steadfast assistance and deep tranquility in your daily routine.
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
