'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Menu,
  TrendingUp,
  Percent,
  CheckCircle2,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';

export function TaxMateHero() {
  return (
    <section className="relative bg-white text-slate-900 overflow-hidden border-b border-slate-100">
      {/* Top Header Navigation matching TaxMate Reference */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
          
          {/* Logo & Micro Navigation Links */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-black text-sm">
                S
              </div>
              <span className="font-extrabold text-lg tracking-tight text-slate-950 font-sans">
                TaxMate <span className="text-[10px] text-emerald-500 font-mono font-bold uppercase">by Synex</span>
              </span>
            </Link>

            <nav className="hidden xl:flex items-center gap-5 text-xs font-semibold text-slate-500">
              <Link href="#about" className="hover:text-slate-950 transition-colors">About us</Link>
              <Link href="#intelligence" className="hover:text-slate-950 transition-colors">Intelligence</Link>
              <Link href="#social-proof" className="hover:text-slate-950 transition-colors">Social Proof</Link>
              <Link href="#services" className="hover:text-slate-950 transition-colors">Services</Link>
              <Link href="#contact" className="hover:text-slate-950 transition-colors flex items-center gap-0.5">
                <span>Contact us</span>
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </nav>
          </div>

          {/* Center Micro Testimonial Pill (Signature TaxMate element) */}
          <div className="hidden md:flex items-center gap-2.5 bg-slate-50 border border-slate-200/80 rounded-full px-3 py-1 text-[11px] max-w-sm">
            <div className="w-6 h-6 rounded-full bg-emerald-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
              AJ
            </div>
            <p className="text-slate-600 truncate">
              <strong className="text-slate-900 font-semibold">&ldquo;TaxMate simplified tax prep and maximized deductions!&rdquo;</strong> Alexandria J.
            </p>
          </div>

          {/* Right Avatar Cluster + Menu / Action */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex -space-x-1.5 overflow-hidden">
                <div className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-slate-800 text-white text-[9px] flex items-center justify-center font-bold">CA</div>
                <div className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-emerald-500 text-white text-[9px] flex items-center justify-center font-bold">AV</div>
                <div className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-cyan-500 text-white text-[9px] flex items-center justify-center font-bold">RS</div>
              </div>
              <span className="text-[11px] font-mono font-bold text-slate-500">@2026Taxmate</span>
            </div>

            <Link
              href="/login"
              className="px-3.5 py-1.5 rounded-lg bg-slate-950 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
            >
              Sign In
            </Link>
          </div>

        </div>
      </div>

      {/* Main Asymmetric Hero Grid matching TaxMate shot */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16 lg:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Column: Portrait & Stats (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            
            {/* Geometric photo container */}
            <div className="relative rounded-3xl bg-gradient-to-br from-blue-500 via-sky-400 to-emerald-400 p-1 shadow-xl">
              <div className="relative bg-slate-900 rounded-[22px] overflow-hidden aspect-[4/5] flex items-end">
                {/* Visual placeholder portrait */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-400/30 via-slate-900 to-slate-950"></div>
                <div className="relative p-6 space-y-2 z-10 text-white">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/30 backdrop-blur-md">
                    <Sparkles className="w-3 h-3" />
                    <span>Verified Tax Intelligence</span>
                  </div>
                  <h3 className="text-xl font-black leading-tight">Empowering Indian CAs with Zero-Error Math</h3>
                  <p className="text-xs text-slate-300">Dual-Act TDS Forms 24Q, 26Q, 27Q & ITNS 281N</p>
                </div>
              </div>
            </div>

            {/* Bottom Stats Row */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="text-2xl font-black text-slate-950 tracking-tight font-sans">18K+</div>
                <div className="text-[11px] text-slate-500 font-medium">Total active users</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="text-2xl font-black text-slate-950 tracking-tight font-sans">125+</div>
                <div className="text-[11px] text-slate-500 font-medium">Company Partner</div>
              </div>
            </div>

          </div>

          {/* Center Column: Interactive Tax Analytics Card (3 cols) */}
          <div className="lg:col-span-3">
            <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-5 shadow-xl space-y-4 font-sans">
              
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">Analytics</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold">
                  Weekly
                </span>
              </div>

              {/* Bar Chart Mockup (Taxmate style blue & mint bars) */}
              <div className="bg-white rounded-2xl p-4 border border-slate-100 space-y-2">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">TDS / ITC Tax Savings</span>
                <div className="h-28 flex items-end justify-between gap-2 pt-2 px-1">
                  <div className="w-full bg-sky-200 rounded-t-lg h-[45%]"></div>
                  <div className="w-full bg-emerald-400 rounded-t-lg h-[75%]"></div>
                  <div className="w-full bg-sky-400 rounded-t-lg h-[60%]"></div>
                  <div className="w-full bg-emerald-500 rounded-t-lg h-[95%]"></div>
                  <div className="w-full bg-blue-500 rounded-t-lg h-[80%]"></div>
                </div>
              </div>

              {/* Tax Summary Widget */}
              <div className="bg-white rounded-2xl p-4 border border-slate-100 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Tax Summary</span>
                <div className="text-2xl font-black text-slate-950 font-mono tracking-tight">₹14,892.00</div>
                <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold font-mono">
                  <TrendingUp className="w-3 h-3" />
                  <span>+18.4% vs 2B Auto-Draft</span>
                </div>
              </div>

              {/* Sparkline metric breakdown */}
              <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono pt-1">
                <div className="p-2 rounded-xl bg-white border border-slate-100">
                  <div className="text-slate-400">Income</div>
                  <div className="font-bold text-slate-900 mt-0.5">25%</div>
                </div>
                <div className="p-2 rounded-xl bg-white border border-slate-100">
                  <div className="text-slate-400">Assets</div>
                  <div className="font-bold text-slate-900 mt-0.5">30%</div>
                </div>
                <div className="p-2 rounded-xl bg-white border border-slate-100">
                  <div className="text-slate-400">Deduct</div>
                  <div className="font-bold text-emerald-600 mt-0.5">57%</div>
                </div>
              </div>

            </div>
          </div>

          {/* Right Column: Hero Typography & CTA (5 cols) */}
          <div className="lg:col-span-5 space-y-6 lg:pl-4">
            
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-600 uppercase tracking-wider">
                <span className="w-2.5 h-2.5 bg-emerald-500 inline-block"></span>
                <span>AI Tax Intelligence Solution</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-950 tracking-tight leading-[1.05]">
                Smarter <br />
                AI Taxes <br />
                Start Here
              </h1>
            </div>

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal">
              Meet your AI tax companion, designed to provide unwavering support, exceptional precision, and a profound
              sense of tranquility in your daily tax compliance workflow. Built specifically for Indian CAs handling
              Dual-Act TDS and high-volume GSTR-2B reconciliations.
            </p>

            {/* TaxMate Style Pill CTA Pair */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                href="/login"
                className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-slate-950 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-xl group"
              >
                <span>Get Started Now</span>
                <div className="w-6 h-6 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center font-bold group-hover:translate-x-0.5 transition-transform">
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </Link>

              <Link
                href="#services"
                className="text-xs font-bold text-slate-700 hover:text-slate-950 underline underline-offset-4 transition-colors"
              >
                Explore Smart eTDS & GST
              </Link>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
