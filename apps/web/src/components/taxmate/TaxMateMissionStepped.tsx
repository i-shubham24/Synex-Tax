'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, Heart, Sparkles, Target, Users } from 'lucide-react';

export function TaxMateMissionStepped() {
  return (
    <section id="about" className="py-20 lg:py-28 bg-[#0A0D14] text-white overflow-hidden border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Heading, Stats & Mission Intro (5 cols) */}
          <div className="lg:col-span-5 space-y-8">
            
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
                <span className="w-2.5 h-2.5 bg-emerald-400 inline-block"></span>
                <span>About Us</span>
              </div>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.1]">
                AI companion, offering support and precision in your life.
              </h2>
            </div>

            {/* Stats Counter Row matching TaxMate pitch deck */}
            <div className="flex items-center gap-8 py-2 border-y border-slate-800/80">
              <div>
                <div className="text-3xl font-black text-emerald-400 font-sans tracking-tight">325+</div>
                <div className="text-xs text-slate-400 font-medium mt-0.5">Trusted CA Clients</div>
              </div>
              <div className="h-10 w-px bg-slate-800"></div>
              <div>
                <div className="text-3xl font-black text-white font-sans tracking-tight">125+</div>
                <div className="text-xs text-slate-400 font-medium mt-0.5">Company Partner</div>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              We are a passionate group of finance enthusiasts and tax technology architects who grew weary of
              witnessing Chartered Accountants and businesses struggle with intimidating tax forms, desktop crashes,
              and complex statutory amendments.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                href="/login"
                className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-emerald-400/20 group"
              >
                <span>Get Started Now</span>
                <div className="w-5 h-5 rounded-full bg-slate-950 text-emerald-400 flex items-center justify-center font-bold group-hover:translate-x-0.5 transition-transform">
                  <ArrowRight className="w-3 h-3" />
                </div>
              </Link>

              <Link
                href="/login"
                className="text-xs font-bold text-slate-300 hover:text-white underline underline-offset-4 transition-colors"
              >
                Start Your Free Trial
              </Link>
            </div>

          </div>

          {/* Right Column: Signature Stepped Neon-Green Diagonal Cards (7 cols) */}
          <div className="lg:col-span-7 relative">
            
            {/* Ambient emerald blur backdrop */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="space-y-4 sm:space-y-0 sm:relative sm:h-[460px]">
              
              {/* Step 1: Bottom Left Card ("The Mission") */}
              <div className="sm:absolute sm:bottom-0 sm:left-0 sm:w-[320px] rounded-2xl p-6 bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 shadow-2xl transition-transform hover:-translate-y-1 duration-200">
                <div className="w-8 h-8 rounded-lg bg-slate-950/20 flex items-center justify-center text-slate-950 mb-3">
                  <Target className="w-5 h-5" />
                </div>
                <h4 className="text-base font-black tracking-tight font-sans">The Mission</h4>
                <p className="text-xs text-slate-900/90 font-medium leading-relaxed mt-2">
                  TaxMate was born to bridge the gap between messy tax rules and simple, confident decisions for every
                  compliance team.
                </p>
              </div>

              {/* Step 2: Center Stepped Card ("Human-Centric") */}
              <div className="sm:absolute sm:top-24 sm:left-48 sm:w-[320px] rounded-2xl p-6 bg-gradient-to-br from-emerald-300 via-teal-400 to-cyan-400 text-slate-950 shadow-2xl z-10 transition-transform hover:-translate-y-1 duration-200">
                <div className="w-8 h-8 rounded-lg bg-slate-950/20 flex items-center justify-center text-slate-950 mb-3">
                  <Users className="w-5 h-5" />
                </div>
                <h4 className="text-base font-black tracking-tight font-sans">Human-Centric</h4>
                <p className="text-xs text-slate-900/90 font-medium leading-relaxed mt-2">
                  Tax consulting should focus on people and strategic guidance, eliminating manual data entry through
                  intelligent automation.
                </p>
              </div>

              {/* Step 3: Top Right Stepped Card ("Full Confidence") */}
              <div className="sm:absolute sm:top-0 sm:right-0 sm:w-[320px] rounded-2xl p-6 bg-gradient-to-br from-teal-400 to-emerald-400 text-slate-950 shadow-2xl z-20 transition-transform hover:-translate-y-1 duration-200">
                <div className="w-8 h-8 rounded-lg bg-slate-950/20 flex items-center justify-center text-slate-950 mb-3">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h4 className="text-base font-black tracking-tight font-sans">Full Confidence</h4>
                <p className="text-xs text-slate-900/90 font-medium leading-relaxed mt-2">
                  Comprehensive AI guidance, expert-level statutory insights, Section 516 zero-float math, and real-time
                  audit radar.
                </p>
              </div>

            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
