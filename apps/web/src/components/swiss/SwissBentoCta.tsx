'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  CheckCircle2,
  Lock,
  FileCheck2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { SteppedPixelEyebrow } from './SteppedPixelEyebrow';

export function SwissBentoCta() {
  const [likes, setLikes] = useState<number>(842);
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [isBookmarked, setIsBookmarked] = useState<boolean>(false);
  const [shareToast, setShareToast] = useState<boolean>(false);
  const [isApproved, setIsApproved] = useState<boolean>(false);

  const handleLike = () => {
    if (isLiked) {
      setLikes((prev) => prev - 1);
      setIsLiked(false);
    } else {
      setLikes((prev) => prev + 1);
      setIsLiked(true);
    }
  };

  const handleShare = () => {
    setShareToast(true);
    navigator.clipboard?.writeText(window.location.origin);
    setTimeout(() => setShareToast(false), 3000);
  };

  return (
    <section id="community" className="py-20 lg:py-28 bg-white text-[#0E0F10] border-b border-[#E5E7EB] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Top Header Row matching TaxMate Social Proof reference */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E7EB] pb-6">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2 overflow-hidden">
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
            <span className="text-xs font-mono font-bold text-[#646A73]">@2026 SynexTax</span>
          </div>

          <SteppedPixelEyebrow label="Our Social Proof" theme="light" color="sky" />
        </div>

        {/* 3-Column Bento Grid matching media_1795092603887_63f4482f.webp */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Column 1: Big Stepped Sky Blue Card (4 cols) */}
          <div className="lg:col-span-4 flex flex-col justify-between rounded-[26px] bg-[#52AEFA] text-[#0E0F10] p-7 sm:p-8 shadow-sm relative overflow-hidden">
            {/* Geometric mosaic subtle background overlay */}
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(#0E0F10 1px, transparent 1px), radial-gradient(#0E0F10 1px, #52AEFA 1px)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 8px 8px',
              }}
            />

            <div className="relative space-y-4">
              <div className="space-y-1">
                <div className="text-6xl sm:text-7xl font-black font-sans tracking-tightest leading-none text-white">
                  700+
                </div>
                <div className="text-base sm:text-lg font-bold font-sans text-white/95">
                  CA Practices Supported
                </div>
              </div>

              {/* Tag Pills */}
              <div className="flex flex-wrap gap-1.5 pt-2 font-mono text-[11px] font-bold">
                <span className="px-2.5 py-1 rounded-full bg-white/30 text-[#0E0F10] backdrop-blur-xs">
                  Tax Consultant
                </span>
                <span className="px-2.5 py-1 rounded-full bg-white/30 text-[#0E0F10] backdrop-blur-xs">
                  AI Normalizer
                </span>
                <span className="px-2.5 py-1 rounded-full bg-white/30 text-[#0E0F10] backdrop-blur-xs">
                  Dual-Act TDS
                </span>
                <span className="px-2.5 py-1 rounded-full bg-white/30 text-[#0E0F10] backdrop-blur-xs">
                  Zero Java DSC
                </span>
                <span className="px-2 py-1 rounded-full bg-white/30 text-[#0E0F10] backdrop-blur-xs">
                  +4
                </span>
              </div>
            </div>

            {/* Split Button matching TaxMate: Dark Button + Sky Blue Box */}
            <div className="relative pt-8">
              <Link
                href="/signup"
                className="inline-flex items-stretch rounded-xl overflow-hidden bg-[#0E0F10] text-white hover:bg-[#17191C] transition-all shadow-md group"
              >
                <span className="px-5 py-3 text-xs font-mono font-bold flex items-center">
                  Get Started Now
                </span>
                <span className="w-10 bg-[#389BF0] flex items-center justify-center text-white group-hover:bg-[#2F8AE0] transition-colors">
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            </div>
          </div>

          {/* Column 2: Center Stack of 2 Stepped Cards (4 cols) */}
          <div className="lg:col-span-4 flex flex-col justify-between gap-6">
            
            {/* Top Card: Small photo card with practitioner quote */}
            <div className="rounded-[22px] bg-[#F7F8FA] border border-[#E5E7EB] p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#E5E7EB] shrink-0 bg-slate-200">
                  <img
                    src="/references/afd20a006da425b639f3965af144b120.webp"
                    alt="Tax Partner"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <div className="font-bold text-xs text-[#0E0F10]">Navneet Kaur</div>
                  <div className="text-[10px] font-mono text-[#646A73]">Lead Tax Associate, Ludhiana</div>
                </div>
              </div>

              <p className="text-xs text-[#0E0F10] leading-relaxed font-medium">
                "From Punjab spinning mills to tier-1 manufacturing enterprises, SynexTax reconciles 50,000-line GSTR-2B ledgers in 4 seconds without freezing. Our firm has had zero GST notice surprises this entire fiscal."
              </p>
            </div>

            {/* Bottom Card: Stepped Sky Blue community statement card */}
            <div className="rounded-[22px] bg-[#52AEFA] text-[#0E0F10] p-6 shadow-sm space-y-4 flex-1 flex flex-col justify-center">
              <p className="text-lg sm:text-xl font-bold font-sans text-white leading-snug">
                Community of 1,200+ tax practitioners who decided to stop crying over GST portal crashes and Java DSC dongles.
              </p>

              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#0E0F10]/80">
                <Sparkles className="w-4 h-4 text-white" />
                <span>Zero Java Runtime Required</span>
              </div>
            </div>

          </div>

          {/* Column 3: Realistic Dark Tablet Device Frame (4 cols) */}
          <div className="lg:col-span-4 bg-[#0E0F10] rounded-[26px] p-5 border border-[#24272B] shadow-2xl flex flex-col justify-between text-white font-sans space-y-4">
            
            {/* Tablet Top App Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-[#24272B] text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#52E888] animate-pulse" />
                <span className="font-bold text-white">Maker-Checker Portal</span>
              </div>
              <span className="text-[#52AEFA] font-bold text-[11px]">Amritsar Textile Ltd</span>
            </div>

            {/* Photo Screen inside Tablet */}
            <div className="relative rounded-2xl overflow-hidden aspect-4/3 bg-[#17191C] border border-[#24272B] group">
              <img
                src="/references/3ad1579b991266c96e95f2c7c59d3226.webp"
                alt="CA Partner Working"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-3.5">
                <div className="text-xs font-mono text-white">
                  <span className="font-bold text-[#52E888]">Live Session:</span> GSTR-3B Table 4A Verified
                </div>
              </div>
            </div>

            {/* Social Engagement Bar matching TaxMate tablet reference */}
            <div className="flex items-center justify-between px-2 pt-1 border-t border-[#24272B]">
              <div className="flex items-center gap-4 text-xs font-mono">
                <button
                  type="button"
                  onClick={handleLike}
                  className="flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors"
                >
                  <Heart
                    className={`w-4 h-4 transition-transform ${
                      isLiked ? 'fill-[#EF4444] text-[#EF4444] scale-110' : ''
                    }`}
                  />
                  <span>{likes}</span>
                </button>

                <div className="flex items-center gap-1.5 text-slate-300">
                  <MessageCircle className="w-4 h-4" />
                  <span>128</span>
                </div>

                <button
                  type="button"
                  onClick={handleShare}
                  className="flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors relative"
                >
                  <Share2 className="w-4 h-4" />
                  {shareToast && (
                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-[#52E888] text-[#0E0F10] text-[10px] font-bold whitespace-nowrap shadow-md">
                      Link Copied!
                    </span>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsBookmarked(!isBookmarked)}
                className="text-slate-300 hover:text-white transition-colors"
                aria-label="Bookmark Case Study"
              >
                <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-white text-white' : ''}`} />
              </button>
            </div>

            {/* 1-Tap Partner Approval Interactive Toggle */}
            <div className="space-y-2 pt-1">
              {isApproved ? (
                <div className="p-3 rounded-xl bg-[#52E888]/15 border border-[#52E888]/30 text-white text-xs font-mono flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#52E888] shrink-0" />
                  <span>Approved by CA Amrinder Verma. Queued for Class 3 USB DSC signature.</span>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-[#17191C] border border-[#24272B] text-[#9BA1AA] text-xs font-mono flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#52AEFA] shrink-0" />
                  <span>Maker-Checker lock active. Pending partner sign-off.</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsApproved(!isApproved)}
                className={`w-full py-3 rounded-xl font-mono text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 ${
                  isApproved
                    ? 'bg-[#17191C] border border-[#24272B] text-slate-300 hover:text-white'
                    : 'bg-[#52E888] hover:bg-[#3BD975] text-[#0E0F10] shadow-[#52E888]/20'
                }`}
              >
                <FileCheck2 className="w-4 h-4" />
                <span>{isApproved ? 'Reset Demonstration' : '1-Tap Partner Approve [F8]'}</span>
              </button>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
