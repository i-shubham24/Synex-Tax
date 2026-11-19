'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ArrowRight, ShieldCheck, Mail, Check } from 'lucide-react';

export function TaxMateFooter() {
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
    <footer className="bg-black text-white pt-16 pb-12 border-t border-slate-900 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Top Split: Headline & Newsletter Input (matching TaxMate reference) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start border-b border-slate-900 pb-12">
          
          {/* Left Column: Logo & Bold Headline (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center text-slate-950 font-black text-xs">
                S
              </div>
              <span className="font-extrabold text-base tracking-tight text-white">TaxMate</span>
              <span className="text-[10px] text-emerald-400 font-mono font-bold uppercase">by Synex Labs</span>
            </div>

            <h3 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.1]">
              Tax Made Clear & Efficient, Made Easy
            </h3>

            <p className="text-xs text-slate-400 max-w-md">
              It is about making sure your money and compliance is working as hard as you are every single day.
            </p>
          </div>

          {/* Right Column: Newsletter Form & Navigation Columns (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Newsletter Input Box */}
            <form onSubmit={handleNewsletter} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Write your email here"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-full px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-full bg-white text-slate-950 hover:bg-slate-200 text-xs font-bold transition-all shrink-0"
                >
                  {submitted ? 'Joined!' : 'Submit'}
                </button>
              </div>
              {submitted && (
                <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>Subscribed to CA compliance circulars.</span>
                </div>
              )}
            </form>

            {/* Quick Links Columns */}
            <div className="grid grid-cols-2 gap-6 text-xs pt-2">
              <div className="space-y-2">
                <span className="text-[11px] font-mono uppercase text-slate-500 font-bold tracking-wider">
                  Quick Navigation
                </span>
                <ul className="space-y-1.5 text-slate-400">
                  <li><Link href="#about" className="hover:text-white transition-colors">About us</Link></li>
                  <li><Link href="#intelligence" className="hover:text-white transition-colors">Intelligence</Link></li>
                  <li><Link href="#social-proof" className="hover:text-white transition-colors">Social Proof</Link></li>
                  <li><Link href="#services" className="hover:text-white transition-colors">Services</Link></li>
                  <li>
                    <Link href="#contact" className="hover:text-white transition-colors flex items-center gap-0.5">
                      <span>Contact us</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-mono uppercase text-slate-500 font-bold tracking-wider">
                  Resources
                </span>
                <ul className="space-y-1.5 text-slate-400">
                  <li><Link href="#smart-etds" className="hover:text-white transition-colors">Smart eTDS Suite</Link></li>
                  <li><Link href="/login" className="hover:text-white transition-colors">CA Workstation</Link></li>
                  <li><Link href="#calculator" className="hover:text-white transition-colors">Statutory Calculator</Link></li>
                  <li><Link href="#comparison" className="hover:text-white transition-colors">Desktop vs Cloud</Link></li>
                </ul>
              </div>
            </div>

          </div>

        </div>

        {/* Bottom Bar matching TaxMate Pitchdeck with Circular Neon Arrow Button */}
        <div className="flex flex-wrap items-center justify-between gap-6 pt-2">
          
          {/* Avatar Cluster + Green Circular Arrow Button (TaxMate signature) */}
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2 overflow-hidden">
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-black bg-slate-800 text-white text-[10px] flex items-center justify-center font-bold">CA</div>
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-black bg-emerald-500 text-white text-[10px] flex items-center justify-center font-bold">AV</div>
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-black bg-sky-500 text-white text-[10px] flex items-center justify-center font-bold">RS</div>
            </div>

            <Link
              href="/login"
              aria-label="Open Workstation"
              className="w-10 h-10 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 flex items-center justify-center shadow-lg shadow-emerald-400/20 transition-all hover:scale-105"
            >
              <ArrowUpRight className="w-5 h-5 font-bold" />
            </Link>
          </div>

          {/* Center Pill Tags */}
          <div className="hidden md:flex items-center gap-2 text-xs font-mono">
            {['Tax Consultant', 'Smart Tax', 'Strategic Planning', 'Connecting Clarity'].map((t) => (
              <span
                key={t}
                className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-[10px]"
              >
                {t}
              </span>
            ))}
          </div>

          {/* Copyright & Legal */}
          <div className="text-[11px] font-mono text-slate-500 flex items-center gap-4">
            <span>@2026 TaxMate by Synex Labs. All rights reserved.</span>
            <Link href="#terms" className="hover:text-slate-300 transition-colors">Terms</Link>
            <Link href="#privacy" className="hover:text-slate-300 transition-colors">Privacy</Link>
          </div>

        </div>

      </div>
    </footer>
  );
}
