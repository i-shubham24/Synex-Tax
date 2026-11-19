'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, ShieldCheck, Mail } from 'lucide-react';

export function SwissFooter() {
  const [email, setEmail] = useState<string>('');
  const [submitted, setSubmitted] = useState<boolean>(false);

  const handleNewsletter = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 4000);
      setEmail('');
    }
  };

  return (
    <footer id="contact" className="bg-[#0E0F10] text-white pt-16 pb-12 border-t border-[#24272B] font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Top Split: Brand, Tagline & 3-Column Navigation + Newsletter */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start border-b border-[#24272B] pb-12">
          
          {/* Brand Mark & Tagline (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[6px] bg-white flex items-center justify-center text-[#0E0F10] font-black text-sm shadow-sm">
                <span className="text-[#0E0F10] font-mono">S</span>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base tracking-tight leading-none text-white">
                  SynexTax
                </span>
                <span className="text-[10px] text-[#52E888] font-mono font-medium tracking-wide uppercase">
                  by Synex Labs
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[#9BA1AA] max-w-sm leading-relaxed">
              Cloud tax intelligence designed specifically for Chartered Accountants and Tax Advocates handling
              high-volume GSTR-2B reconciliations, Dual-Act TDS, and zero-Java USB DSC signing.
            </p>

            <div className="flex items-center gap-2 text-xs font-mono text-[#52E888] pt-1">
              <ShieldCheck className="w-4 h-4" />
              <span>MCA Rule 3(1) and CGST Rule 56(15) Certified</span>
            </div>
          </div>

          {/* 3-Column Navigation (4 cols) */}
          <div className="lg:col-span-4 grid grid-cols-2 sm:grid-cols-3 gap-6 text-xs">
            <div className="space-y-2.5">
              <span className="text-[11px] font-mono uppercase text-[#9BA1AA] font-bold tracking-wider">
                Platform
              </span>
              <ul className="space-y-2 text-slate-300">
                <li><Link href="#gst-suite" className="hover:text-white transition-colors">GST Console</Link></li>
                <li><Link href="#dual-act-tds" className="hover:text-white transition-colors">Dual-Act TDS</Link></li>
                <li><Link href="#why-switch" className="hover:text-white transition-colors">Zero-Java DSC</Link></li>
                <li><Link href="/dashboard" className="hover:text-white transition-colors">CA Workstation</Link></li>
              </ul>
            </div>

            <div className="space-y-2.5">
              <span className="text-[11px] font-mono uppercase text-[#9BA1AA] font-bold tracking-wider">
                Compliance
              </span>
              <ul className="space-y-2 text-slate-300">
                <li><Link href="#security" className="hover:text-white transition-colors">Income-tax 2025</Link></li>
                <li><Link href="#security" className="hover:text-white transition-colors">MCA Rule 3 Logs</Link></li>
                <li><Link href="#security" className="hover:text-white transition-colors">DPDP Act 2023</Link></li>
                <li><Link href="#pricing" className="hover:text-white transition-colors">Practice Plans</Link></li>
              </ul>
            </div>

            <div className="space-y-2.5">
              <span className="text-[11px] font-mono uppercase text-[#9BA1AA] font-bold tracking-wider">
                Company
              </span>
              <ul className="space-y-2 text-slate-300">
                <li><Link href="/" className="hover:text-white transition-colors">About Synex</Link></li>
                <li><Link href="/" className="hover:text-white transition-colors">Amritsar Hub</Link></li>
                <li><Link href="#pricing" className="hover:text-white transition-colors">Free Trial</Link></li>
                <li><Link href="/login" className="hover:text-white transition-colors">CA Sign In</Link></li>
              </ul>
            </div>
          </div>

          {/* Right Newsletter & Book Demo Box (3 cols) */}
          <div className="lg:col-span-3 space-y-3">
            <span className="text-[11px] font-mono uppercase text-[#9BA1AA] font-bold tracking-wider block">
              Direct Technical Hotline
            </span>

            <form onSubmit={handleNewsletter} className="space-y-2">
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter firm email"
                  className="w-full bg-[#17191C] border border-[#24272B] rounded-lg px-3 py-2 text-xs text-white placeholder-[#9BA1AA] focus:outline-none focus:border-[#52E888] font-mono"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-white text-[#0E0F10] hover:bg-slate-100 text-xs font-bold font-mono transition-all shadow-sm"
              >
                {submitted ? 'Inquiry Dispatched' : 'Book Amritsar Demo'}
              </button>
              {submitted && (
                <div className="text-[11px] text-[#52E888] font-mono flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>Technical team will reach out within 2 hours.</span>
                </div>
              )}
            </form>
          </div>

        </div>

        {/* 4-Pill Topic Bar matching TaxMate footer reference */}
        <div className="flex flex-wrap items-center justify-between gap-4 py-3 border-b border-[#24272B] text-xs font-mono text-[#9BA1AA]">
          <span className="hover:text-white transition-colors cursor-pointer">Tax Consultant</span>
          <span className="hover:text-white transition-colors cursor-pointer">Smart Tax</span>
          <span className="hover:text-white transition-colors cursor-pointer">Strategic Planning</span>
          <span className="hover:text-white transition-colors cursor-pointer">Connecting Clarity</span>
          <span className="hover:text-white transition-colors cursor-pointer hidden sm:inline">Dual-Act TDS</span>
        </div>

        {/* Bottom Rounded Floating Dock Bar */}
        <div className="rounded-[22px] bg-white text-[#0E0F10] p-4 sm:p-5 border border-[#E5E7EB] shadow-xl flex flex-wrap items-center justify-between gap-4">
          
          {/* Overlapping Badges & Large Circular Mint Button */}
          <div className="flex items-center gap-4">
            <div className="flex -space-x-1.5 overflow-hidden">
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-[#0E0F10] text-[#52E888] text-[10px] flex items-center justify-center font-bold font-mono">
                CA
              </div>
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-[#52AEFA] text-[#0E0F10] text-[10px] flex items-center justify-center font-bold font-mono">
                AV
              </div>
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-[#52E888] text-[#0E0F10] text-[10px] flex items-center justify-center font-bold font-mono">
                RS
              </div>
            </div>

            <Link
              href="/signup"
              aria-label="Start Free Trial"
              className="w-10 h-10 rounded-full bg-[#52E888] hover:bg-[#3BD975] text-[#0E0F10] flex items-center justify-center shadow-md transition-all hover:scale-105"
            >
              <ArrowUpRight className="w-5 h-5 font-bold stroke-[2.5]" />
            </Link>

            <div className="hidden sm:block text-xs font-mono">
              <span className="font-bold text-[#0E0F10]">14-Day Free Guided Trial Active</span>
              <div className="text-[10px] text-[#646A73]">Includes 2 pre-seeded Amritsar practice clients</div>
            </div>
          </div>

          {/* Copyright & Legal Links */}
          <div className="flex items-center gap-5 text-xs font-mono text-[#646A73]">
            <span>© 2026 Synex Labs. All rights reserved.</span>
            <Link href="/" className="hover:text-[#0E0F10] transition-colors">Privacy</Link>
            <Link href="/" className="hover:text-[#0E0F10] transition-colors">Terms</Link>
          </div>

        </div>

      </div>
    </footer>
  );
}
