'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ChevronDown,
  Layers,
  Menu,
  X,
  ShieldCheck,
  LayoutDashboard,
  Lock,
  PhoneCall,
} from 'lucide-react';
import { SteppedPixelEyebrow } from './SteppedPixelEyebrow';
import { SplitCtaButton } from './SplitCtaButton';

export function SwissHero() {
  const [summaryPeriod, setSummaryPeriod] = useState<'Weekly' | 'Monthly' | 'Annual'>('Weekly');
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

  // Close drawer on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Prevent background scroll when menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isMenuOpen]);

  return (
    <section className="relative bg-white text-[#0E0F10] border-b border-[#E5E7EB] overflow-hidden">
      
      {/* 1px Architectural Grid Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16 lg:pb-24">
        
        {/* Top Header Row with Vertical Nav on Left + Status Bar on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-8 border-b border-[#E5E7EB] items-center">
          
          {/* Brand mark and subtitle */}
          <div className="lg:col-span-5 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-[#0E0F10] flex items-center justify-center text-[#52E888] font-bold text-sm shadow-sm group-hover:scale-105 transition-transform">
                ST
              </div>
              <div className="flex flex-col">
                <span className="font-sans font-black text-xl tracking-tight text-[#0E0F10] leading-none">
                  SynexTax
                </span>
                <span className="text-[10px] font-mono text-[#646A73] font-medium tracking-wide uppercase mt-0.5">
                  by Synex Labs
                </span>
              </div>
            </Link>

            <span className="text-xs font-mono text-[#646A73] hidden sm:inline-block">
              Cloud GST & Dual-Act TDS
            </span>
          </div>

          {/* Right Top Status, Auth Links, Avatars & Working Hamburger */}
          <div className="lg:col-span-7 flex items-center justify-between lg:justify-end gap-5">
            <div className="text-xs font-mono text-[#646A73] hidden sm:block">
              @2026SynexTax
            </div>

            {/* Desktop Quick Auth Buttons */}
            <div className="hidden md:flex items-center gap-3 text-xs font-mono">
              <Link
                href="/login"
                className="text-[#646A73] hover:text-[#0E0F10] font-semibold transition-colors px-2 py-1"
              >
                Sign In
              </Link>
              <Link
                href="/dashboard"
                className="px-3.5 py-1.5 rounded-full bg-[#0E0F10] text-white hover:bg-[#17191C] font-semibold transition-all shadow-xs flex items-center gap-1.5"
              >
                <LayoutDashboard className="w-3 h-3 text-[#52E888]" />
                <span>Workstation</span>
              </Link>
            </div>

            {/* Partner Avatar Stack */}
            <div className="flex items-center -space-x-2">
              <div className="w-7 h-7 rounded-full bg-[#52AEFA] border-2 border-white flex items-center justify-center text-white text-[10px] font-bold">
                AV
              </div>
              <div className="w-7 h-7 rounded-full bg-[#52E888] border-2 border-white flex items-center justify-center text-[#0E0F10] text-[10px] font-bold">
                SK
              </div>
              <div className="w-7 h-7 rounded-full bg-[#0E0F10] border-2 border-white flex items-center justify-center text-white text-[10px] font-bold">
                GG
              </div>
              <div className="w-7 h-7 rounded-full bg-slate-300 border-2 border-white flex items-center justify-center text-[#0E0F10] text-[10px] font-bold">
                +125
              </div>
            </div>

            {/* Working Interactive Hamburger Button */}
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              aria-label="Open navigation menu drawer"
              className="w-9 h-9 rounded-md bg-[#F7F8FA] border border-[#E5E7EB] flex items-center justify-center text-[#0E0F10] hover:bg-slate-100 hover:border-slate-300 transition-all shadow-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#52AEFA]"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Hero Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 pt-8 items-start">
          
          {/* Left Column: Vertical Navigation + Visual Bento Mockup (7 cols) */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-12 gap-6 relative">
            
            {/* Left Nav List (3 cols on desktop) */}
            <div className="sm:col-span-3 space-y-3 pt-4 border-r border-[#E5E7EB] pr-4 hidden sm:block">
              {[
                { label: 'About us', href: '#about' },
                { label: 'Intelligence', href: '#intelligence' },
                { label: 'Social Proof', href: '#social-proof' },
                { label: 'Services', href: '#services' },
                { label: 'Pricing Plans', href: '#pricing' },
                { label: 'Contact us ↗', href: '#contact' },
              ].map((nav, i) => (
                <a
                  key={i}
                  href={nav.href}
                  className="block text-xs font-sans text-[#646A73] hover:text-[#0E0F10] hover:translate-x-1 transition-all"
                >
                  {nav.label}
                </a>
              ))}
            </div>

            {/* Interlocking Portrait & Bento UI (9 cols on desktop) */}
            <div className="sm:col-span-9 space-y-5">
              
              {/* Floating Quote Chip top */}
              <div className="p-3 rounded-2xl bg-[#F7F8FA] border border-[#E5E7EB] flex items-center gap-3 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-[#52AEFA]/20 text-[#2F8AE0] flex items-center justify-center font-bold text-xs shrink-0">
                  FCA
                </div>
                <div className="text-[11px] leading-tight">
                  <span className="font-semibold text-[#0E0F10]">
                    "SynexTax transformed our CA practice.
                  </span>{' '}
                  <span className="text-[#646A73]">
                    Real-time GSTR-2B insights simplified prep and maximized deductions!"
                  </span>
                  <div className="font-mono text-[10px] text-[#2F8AE0] font-bold mt-0.5">
                    CA Amrinder Verma, Senior Partner
                  </div>
                </div>
              </div>

              {/* Interlocking Sky-Blue & White Bento Card */}
              <div className="relative rounded-[28px] bg-gradient-to-br from-[#EFF7FF] via-[#F7F8FA] to-white border border-[#E5E7EB] p-5 sm:p-6 shadow-md overflow-hidden">
                
                {/* Stepped mosaic background accent */}
                <div
                  className="absolute top-0 right-0 w-36 h-36 opacity-30 pointer-events-none"
                  style={{
                    backgroundImage: `linear-gradient(to right, #52AEFA 1px, transparent 1px), linear-gradient(to bottom, #52AEFA 1px, transparent 1px)`,
                    backgroundSize: '12px 12px',
                  }}
                />

                <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  
                  {/* Left Mini Chart Card */}
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-mono text-[#646A73]">Tax Summary</div>
                      <button
                        type="button"
                        onClick={() =>
                          setSummaryPeriod((prev) =>
                            prev === 'Weekly' ? 'Monthly' : prev === 'Monthly' ? 'Annual' : 'Weekly'
                          )
                        }
                        className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#F7F8FA] border border-[#E5E7EB] hover:bg-slate-100 transition-colors"
                      >
                        <span>{summaryPeriod}</span>
                        <ChevronDown className="w-3 h-3 text-[#646A73]" />
                      </button>
                    </div>

                    <div className="text-xl sm:text-2xl font-black font-mono text-[#0E0F10]">
                      {summaryPeriod === 'Weekly'
                        ? '₹1,39,760.00'
                        : summaryPeriod === 'Monthly'
                        ? '₹6,48,200.00'
                        : '₹72,40,000.00'}
                    </div>

                    {/* Spline preview */}
                    <div className="relative h-16 w-full">
                      <div className="absolute top-0 right-0 inline-flex items-center gap-0.5 text-[10px] font-mono font-bold text-[#16A34A] bg-[#DCFCE7] px-1.5 py-0.5 rounded-full">
                        <span>+10.12%</span>
                        <TrendingUp className="w-2.5 h-2.5 text-[#16A34A]" />
                      </div>
                      <svg className="w-full h-full" viewBox="0 0 160 50" preserveAspectRatio="none">
                        <path d="M 0 45 Q 40 42, 80 28 T 160 8" fill="none" stroke="#52E888" strokeWidth="2.5" />
                        <circle cx="160" cy="8" r="3.5" fill="#52E888" stroke="#FFFFFF" strokeWidth="1.5" />
                      </svg>
                    </div>

                    {/* Progress distribution */}
                    <div className="space-y-1 pt-1 border-t border-[#E5E7EB]">
                      <div className="flex justify-between text-[10px] font-mono text-[#646A73]">
                        <span>ITC 48%</span>
                        <span>TDS 20%</span>
                        <span>Cash 57%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#E5E7EB] flex overflow-hidden">
                        <div className="h-full bg-[#52E888] w-[48%]" />
                        <div className="h-full bg-[#52AEFA] w-[20%]" />
                        <div className="h-full bg-[#0E0F10] w-[32%]" />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Key Stats */}
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-2xl bg-white border border-[#E5E7EB] shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono text-[#646A73]">Total Filings</span>
                        <span className="text-[10px] font-mono font-bold text-[#16A34A] px-1.5 py-0.2 bg-[#DCFCE7] rounded">
                          Live
                        </span>
                      </div>
                      <div className="text-2xl font-black font-sans text-[#0E0F10] mt-0.5">
                        18K<sup className="text-[#52E888] text-base">+</sup>
                      </div>
                      <div className="text-[10px] text-[#646A73]">Total active GST and TDS filings</div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white border border-[#E5E7EB] shadow-xs">
                      <div className="text-[11px] font-mono text-[#646A73]">Punjab & Delhi CA Network</div>
                      <div className="text-2xl font-black font-sans text-[#0E0F10] mt-0.5">
                        125<sup className="text-[#52AEFA] text-base">+</sup>
                      </div>
                      <div className="text-[10px] text-[#646A73]">Chartered Accountant Partner Firms</div>
                    </div>
                  </div>

                </div>

              </div>

            </div>

          </div>

          {/* Right Column: Hero Typography & Double CTA (5 cols) */}
          <div className="lg:col-span-5 space-y-6 pt-2">
            
            {/* Stepped Pixel Eyebrow */}
            <SteppedPixelEyebrow
              text="AI TAX INTELLIGENCE SOLUTION"
              variant="dark"
              accentColor="mint"
            />

            {/* Display Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black font-sans tracking-tight text-[#0E0F10] leading-[1.05]">
              Smarter <br />
              <span className="text-[#0E0F10]">AI Taxes</span> <br />
              <span className="text-[#0E0F10]">Start Here</span>
            </h1>

            {/* Subtitle */}
            <p className="text-sm sm:text-base text-[#646A73] leading-relaxed max-w-lg">
              Meet your compliance companion, designed to provide unwavering support, exceptional precision, and a profound sense of tranquility in your CA practice.
            </p>

            {/* Double Split-Box CTA */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <SplitCtaButton
                href="/signup"
                label="Get Started Now"
                variant="dark"
                accentColor="mint"
              />

              <Link
                href="/signup"
                className="px-5 py-3 rounded-full border border-[#E5E7EB] bg-white hover:bg-[#F7F8FA] text-xs font-sans font-bold text-[#0E0F10] text-center transition-colors shadow-xs"
              >
                Start Your Free Trial
              </Link>
            </div>

            {/* Trust badge */}
            <div className="pt-4 border-t border-[#E5E7EB] flex items-center gap-4 text-xs font-mono text-[#646A73]">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#52E888]" />
                14-Day Free Guided Trial
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#52AEFA]" />
                Zero Card Required
              </span>
            </div>

          </div>

        </div>

      </div>

      {/* Slide-Over Navigation Drawer for Working Hamburger Menu */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop Overlay */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setIsMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Slide-In Side Drawer */}
          <div className="relative z-10 w-full max-w-sm sm:max-w-md bg-white text-[#0E0F10] h-full shadow-2xl flex flex-col justify-between p-6 sm:p-8 overflow-y-auto border-l border-[#E5E7EB] animate-in slide-in-from-right duration-200">
            
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-6 border-b border-[#E5E7EB]">
              <Link href="/" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#0E0F10] flex items-center justify-center text-[#52E888] font-bold text-sm shadow-sm">
                  ST
                </div>
                <div className="flex flex-col">
                  <span className="font-sans font-black text-lg tracking-tight text-[#0E0F10]">
                    SynexTax
                  </span>
                  <span className="text-[10px] text-[#646A73] font-mono font-medium uppercase">
                    by Synex Labs
                  </span>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                aria-label="Close navigation menu"
                className="w-8 h-8 rounded-full bg-[#F7F8FA] border border-[#E5E7EB] flex items-center justify-center text-[#0E0F10] hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Navigation Links */}
            <div className="py-6 space-y-1.5 flex-1 font-sans">
              <div className="text-[10px] font-mono text-[#646A73] uppercase font-bold tracking-wider px-3 mb-2">
                Navigation Modules
              </div>

              {[
                { label: 'About Us', href: '#about', desc: 'Why switch from legacy desktop tax tools' },
                { label: 'Core Services & Modules', href: '#services', desc: '4-Pass Recon, Dual-Act TDS, USB DSC' },
                { label: 'Value & CA Trust', href: '#social-proof', desc: 'Clarity meets compliance metrics' },
                { label: 'Interactive Intelligence', href: '#intelligence', desc: '6 live micro-cards and copilot' },
                { label: 'Practice Service Plans', href: '#pricing', desc: 'Transparent tiered pricing for CA firms' },
                { label: 'Social Proof & Community', href: '#community', desc: '700+ practices and live test drive' },
                { label: 'Direct CA Hotline', href: '#contact', desc: 'Amritsar on-ground technical support' },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="group block px-3.5 py-2.5 rounded-xl hover:bg-[#F7F8FA] transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[#0E0F10] group-hover:text-[#2F8AE0] transition-colors">
                      {item.label}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#2F8AE0] group-hover:translate-x-1 transition-all" />
                  </div>
                  <span className="text-xs text-[#646A73] block mt-0.5">{item.desc}</span>
                </a>
              ))}
            </div>

            {/* Live Telemetry Status Box */}
            <div className="p-3.5 rounded-2xl bg-[#F7F8FA] border border-[#E5E7EB] space-y-2 font-mono text-xs">
              <div className="text-[10px] uppercase font-bold text-[#646A73] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#52E888] animate-pulse" />
                <span>Govt Portal Status (Live)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="text-slate-700">GSTN: <span className="font-bold text-[#16A34A]">142ms Nominal</span></div>
                <div className="text-slate-700">e-Invoice: <span className="font-bold text-[#16A34A]">88ms Active</span></div>
                <div className="text-slate-700">TRACES TDS: <span className="font-bold text-[#16A34A]">310ms Normal</span></div>
                <div className="text-slate-700">MCA Rule 3: <span className="font-bold text-[#16A34A]">100% Locked</span></div>
              </div>
            </div>

            {/* Drawer Action Footer */}
            <div className="pt-6 border-t border-[#E5E7EB] space-y-3">
              <Link
                href="/dashboard"
                onClick={() => setIsMenuOpen(false)}
                className="w-full py-3 rounded-xl bg-[#0E0F10] text-white hover:bg-[#17191C] font-mono text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2"
              >
                <LayoutDashboard className="w-4 h-4 text-[#52E888]" />
                <span>Open CA Workstation</span>
              </Link>

              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/login"
                  onClick={() => setIsMenuOpen(false)}
                  className="py-2.5 rounded-xl border border-[#E5E7EB] hover:bg-[#F7F8FA] text-center font-mono text-xs font-bold text-[#0E0F10] transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setIsMenuOpen(false)}
                  className="py-2.5 rounded-xl bg-[#52E888] hover:bg-[#3BD975] text-[#0E0F10] text-center font-mono text-xs font-bold transition-all shadow-sm"
                >
                  Free 14-Day Trial
                </Link>
              </div>
            </div>

          </div>
        </div>
      )}

    </section>
  );
}
