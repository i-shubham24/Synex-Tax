'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Users,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

export function TaxMateSocialProof() {
  return (
    <section id="social-proof" className="py-20 lg:py-28 bg-[#F4F6F8] text-slate-900 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Section Header with tag & avatars */}
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-sky-600 uppercase tracking-wider">
            <span className="w-2.5 h-2.5 bg-sky-500 inline-block"></span>
            <span>Our Social Proof</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex -space-x-2 overflow-hidden">
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-slate-950 text-white text-[10px] flex items-center justify-center font-bold">AV</div>
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-emerald-500 text-white text-[10px] flex items-center justify-center font-bold">RS</div>
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-sky-500 text-white text-[10px] flex items-center justify-center font-bold">AJ</div>
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold">SK</div>
            </div>
            <span className="text-xs font-mono font-bold text-slate-700">@2026Taxmate</span>
          </div>
        </div>

        {/* 2-Column Split: Giant Sky-Blue Card (7 cols), Framed Social Tablet (5 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* Left Column: Giant Signature Sky-Blue Card matching TaxMate Reference */}
          <div className="lg:col-span-7 bg-gradient-to-br from-blue-500 via-sky-500 to-blue-600 rounded-3xl p-6 sm:p-8 lg:p-10 text-white shadow-2xl flex flex-col justify-between space-y-8">
            
            <div className="space-y-6">
              
              {/* Massive Counter */}
              <div>
                <span className="text-xs font-mono font-bold text-sky-100 uppercase tracking-wider block">
                  Active Community
                </span>
                <div className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight font-sans mt-1">
                  700+
                </div>
                <div className="text-lg sm:text-xl font-bold text-sky-100 mt-1">
                  Users Supported Across Pan-India
                </div>
              </div>

              {/* Sub-quote with avatar */}
              <div className="flex items-start gap-3 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
                <div className="w-8 h-8 rounded-full bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center shrink-0">
                  CA
                </div>
                <p className="text-xs text-sky-50 leading-relaxed font-medium">
                  &ldquo;From independent practitioners in Punjab to corporate tax teams in Delhi and Mumbai, we have got
                  your back. Our platform growth comes from being 100% statutory compliant on every single filing.&rdquo;
                </p>
              </div>

              {/* Pill Tags */}
              <div className="flex flex-wrap gap-2 text-xs font-mono">
                {['Tax Consultant', 'Dual-Act TDS', 'Smart Tax', 'FIPS 140-3 DSC', 'Innovation'].map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold border border-white/20 transition-colors"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Action Button */}
              <div>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-slate-950 hover:bg-slate-900 text-white font-bold text-xs transition-all shadow-xl hover:scale-105"
                >
                  <span>Get Started Now</span>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                </Link>
              </div>

            </div>

            {/* Darker Blue Bottom Container (TaxMate signature) */}
            <div className="rounded-2xl p-4 bg-blue-900/40 border border-white/15 text-xs text-sky-100 font-medium">
              Community of accountants and tax professionals who decided to stop crying over manual return administration.
            </div>

          </div>

          {/* Right Column: Framed Dark Tablet Post Card (5 cols matching TaxMate reference) */}
          <div className="lg:col-span-5 bg-slate-950 rounded-3xl p-6 border border-slate-800 shadow-2xl flex flex-col justify-between text-white font-sans space-y-4">
            
            {/* Tablet Header / Branding */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-emerald-500 flex items-center justify-center text-slate-950 font-bold text-[10px]">
                  T
                </div>
                <span className="font-bold text-white">TaxMate Community Live</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 font-bold">Amritsar CA Network</span>
            </div>

            {/* Photo / Lifestyle Card Preview */}
            <div className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 aspect-[4/3] relative flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-gradient-to-tr from-emerald-950/40 via-slate-900 to-sky-950/40"></div>
              
              <div className="relative text-center space-y-2 z-10 max-w-xs">
                <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 text-white font-bold text-sm mx-auto flex items-center justify-center shadow-lg">
                  CA
                </div>
                <div className="font-black text-sm text-white">Punjab CA Practitioner Meet</div>
                <p className="text-[11px] text-slate-400">
                  &ldquo;Replaced our desktop tax software in under 15 minutes. No server maintenance, zero float issues.&rdquo;
                </p>
              </div>
            </div>

            {/* Instagram-style interaction bar matching TaxMate reference */}
            <div className="pt-2 flex items-center justify-between text-slate-400">
              <div className="flex items-center gap-4">
                <button title="Like" className="hover:text-rose-400 transition-colors">
                  <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
                </button>
                <button title="Comments" className="hover:text-white transition-colors">
                  <MessageCircle className="w-5 h-5" />
                </button>
                <button title="Share" className="hover:text-white transition-colors">
                  <Send className="w-5 h-5" />
                </button>
              </div>

              <button title="Bookmark" className="hover:text-white transition-colors">
                <Bookmark className="w-5 h-5" />
              </button>
            </div>

            <div className="text-[11px] font-mono text-slate-500">
              Liked by <strong className="text-slate-300">alexandria.j</strong> and <strong className="text-slate-300">482 others</strong>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
