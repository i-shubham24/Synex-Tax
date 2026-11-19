'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Sparkles,
  Menu,
  X,
  ArrowRight,
} from 'lucide-react';
import { SplitCtaButton } from './swiss/SplitCtaButton';

export function HeaderNav() {
  const { user, isAuthenticated, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  return (
    <header className="sticky top-0 z-40 bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#E5E7EB] text-[#0E0F10]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Brand Mark & Compact Nav */}
        <div className="flex items-center gap-7">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[6px] bg-[#0E0F10] flex items-center justify-center text-white font-black text-sm shadow-sm">
              <span className="text-[#52E888] font-mono">S</span>
            </div>
            <div className="flex flex-col">
              <span className="font-sans font-bold text-base tracking-tight leading-none text-[#0E0F10]">
                SynexTax
              </span>
              <span className="text-[10px] text-[#646A73] font-mono font-medium tracking-wide uppercase">
                by Synex Labs
              </span>
            </div>
          </Link>

          {/* Navigation Links for Large Screens */}
          <nav className="hidden lg:flex items-center gap-1 text-xs font-semibold text-[#646A73]">
            <Link
              href="/#services"
              className="px-3 py-1.5 rounded-md hover:text-[#0E0F10] hover:bg-[#F7F8FA] transition-colors"
            >
              GST Suite
            </Link>
            <Link
              href="/#services"
              className="px-3 py-1.5 rounded-md hover:text-[#0E0F10] hover:bg-[#F7F8FA] transition-colors"
            >
              Dual-Act TDS
            </Link>
            <Link
              href="/#intelligence"
              className="px-3 py-1.5 rounded-md hover:text-[#0E0F10] hover:bg-[#F7F8FA] transition-colors"
            >
              Intelligence
            </Link>
            <Link
              href="/#pricing"
              className="px-3 py-1.5 rounded-md hover:text-[#0E0F10] hover:bg-[#F7F8FA] transition-colors"
            >
              Pricing
            </Link>
          </nav>
        </div>

        {/* Center Live Compliance Ticker Badge */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-[#F7F8FA] border border-[#E5E7EB] text-[11px] font-mono font-semibold text-[#0E0F10]">
          <span className="w-2 h-2 rounded-full bg-[#52E888] animate-pulse" />
          <span>Income-tax Act, 2025 & FVU v1.2 Ready</span>
        </div>

        {/* Right Session / Trial CTA */}
        <div className="flex items-center gap-3">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-2.5">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-bold text-[#0E0F10] leading-tight">{user.fullName}</span>
                <span className="text-[10px] font-mono text-[#646A73]">{user.role} | FRN: {user.frnNumber}</span>
              </div>

              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0E0F10] hover:bg-[#17191C] text-white text-xs font-semibold transition-all shadow-sm"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-[#52E888]" />
                <span>Workstation</span>
              </Link>

              <button
                type="button"
                onClick={logout}
                title="Sign out of firm session"
                className="p-1.5 rounded-full bg-[#F7F8FA] hover:bg-slate-100 border border-[#E5E7EB] text-[#646A73] hover:text-rose-600 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-3">
              <Link
                href="/login"
                className="text-xs font-semibold text-[#0E0F10] hover:text-[#52AEFA] px-2 py-1 transition-colors"
              >
                Sign In
              </Link>

              <SplitCtaButton href="/signup" variant="dark" accent="mint">
                Start Free Trial
              </SplitCtaButton>
            </div>
          )}

          {/* Mobile Hamburger Button for HeaderNav */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle mobile navigation menu"
            className="lg:hidden p-2 rounded-lg bg-[#F7F8FA] border border-[#E5E7EB] text-[#0E0F10] hover:bg-slate-100 transition-colors cursor-pointer"
          >
            {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

      </div>

      {/* Mobile Dropdown Menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-t border-[#E5E7EB] bg-white px-4 py-5 space-y-4 shadow-xl">
          <nav className="space-y-2 text-sm font-semibold font-sans">
            <Link
              href="/#about"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg hover:bg-[#F7F8FA] text-[#0E0F10]"
            >
              About SynexTax
            </Link>
            <Link
              href="/#services"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg hover:bg-[#F7F8FA] text-[#0E0F10]"
            >
              GST Suite & TDS
            </Link>
            <Link
              href="/#intelligence"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg hover:bg-[#F7F8FA] text-[#0E0F10]"
            >
              Interactive Intelligence
            </Link>
            <Link
              href="/#pricing"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg hover:bg-[#F7F8FA] text-[#0E0F10]"
            >
              Service Plans
            </Link>
            <Link
              href="/#contact"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg hover:bg-[#F7F8FA] text-[#0E0F10]"
            >
              Contact CA Hotline
            </Link>
          </nav>

          <div className="pt-3 border-t border-[#E5E7EB] flex flex-col gap-2">
            <Link
              href="/login"
              onClick={() => setIsMobileMenuOpen(false)}
              className="w-full py-2.5 rounded-lg border border-[#E5E7EB] text-center font-mono text-xs font-bold text-[#0E0F10] hover:bg-[#F7F8FA]"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              onClick={() => setIsMobileMenuOpen(false)}
              className="w-full py-2.5 rounded-lg bg-[#52E888] hover:bg-[#3BD975] text-center font-mono text-xs font-bold text-[#0E0F10]"
            >
              Start Free 14-Day Trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
