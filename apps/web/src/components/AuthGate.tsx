'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, KeyRound, Lock } from 'lucide-react';

const DEMO = [
  { role: 'PARTNER' as const, name: 'CA Amrinder Verma, FCA', meta: 'Verma & Associates, FRN 014289N', tone: 'bg-pos-accent text-white' },
  { role: 'STAFF' as const, name: 'Rajat Sharma', meta: 'Senior tax associate, maker only', tone: 'bg-pos-head text-white' },
];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, loginDemo } = useAuth();

  if (isLoading) {
    return (
      <div className="pos-root flex min-h-screen items-center justify-center bg-pos-tint">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-pos-accent border-t-transparent" />
          <span className="text-[13px] text-pos-ink/60">Checking your firm session</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="pos-root flex min-h-screen items-center justify-center bg-pos-tint p-4 text-pos-ink">
        <div className="pos-card w-full max-w-[440px] p-7">
          <span className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-pos-accent text-white shadow-[0_8px_18px_-8px_rgba(47,138,224,0.9)]">
            <Lock className="h-5 w-5" />
          </span>
          <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.01em]">Sign in to your practice</h1>
          <p className="mt-2 text-[13.5px] leading-[1.55] text-pos-ink/65">
            Client data, reconciliations and filings are visible only to signed-in members of your firm.
          </p>

          <p className="mt-6 text-[13px] font-medium text-pos-accent">Try a demo session</p>
          <div className="mt-2 space-y-2.5">
            {DEMO.map((d) => (
              <button
                key={d.role}
                type="button"
                onClick={() => loginDemo(d.role).catch((e: Error) => alert(e.message))}
                className="group flex w-full items-center justify-between rounded-[10px] border border-[#ececee] bg-white p-3.5 text-left transition-colors hover:border-pos-accent/50 hover:bg-pos-tint"
              >
                <span>
                  <span className="flex items-center gap-2">
                    <span className="text-[14px] font-medium">{d.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${d.tone}`}>{d.role}</span>
                  </span>
                  <span className="mt-0.5 block text-[12px] text-pos-ink/55">{d.meta}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-pos-ink/40 transition-transform group-hover:translate-x-0.5 group-hover:text-pos-accent" />
              </button>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-[#ececee] pt-4 text-[13px]">
            <Link href="/login" className="flex items-center gap-1.5 font-medium text-pos-accent hover:underline">
              <KeyRound className="h-4 w-4" /> Sign in with email
            </Link>
            <Link href="/" className="text-pos-ink/55 hover:text-pos-ink">
              Back to site
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
