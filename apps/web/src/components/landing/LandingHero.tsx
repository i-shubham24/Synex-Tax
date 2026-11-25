'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { HeroPillars } from './hero/HeroPillars';
import { PillButton } from './primitives';

// Where the Legite hero shows press logos we show the statutory forms the
// product files, each set like a wordmark. No borrowed brands, no fake press.
function FormMarks({ revealed }: { revealed: boolean }) {
  const base = `transition-all duration-[1100ms] ease-out-expo ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`;
  return (
    <div className="space-y-4" aria-label="Returns and statements SynTax prepares">
      <p className={`text-[12px] text-ink-faint ${base}`} style={{ transitionDelay: '500ms' }}>
        Ready for the 2026-27 returns and statements
      </p>
      <div className={`flex flex-wrap items-center gap-x-7 gap-y-3 text-ink ${base}`} style={{ transitionDelay: '620ms' }}>
        <span className="flex items-center gap-1.5 font-display text-[19px] font-semibold tracking-[-0.04em]">
          <span className="grid h-[18px] w-[26px] grid-cols-2 gap-[2px]" aria-hidden>
            <i className="bg-ink" />
            <i className="bg-ink" />
            <i className="col-span-2 bg-ink" />
          </span>
          GSTR-1
        </span>
        <span className="font-[Georgia,serif] text-[21px] italic tracking-[-0.02em]">GSTR&#8209;3B</span>
        <span className="font-display text-[19px] font-semibold tracking-[0.18em]">IMS</span>
        <span className="font-display text-[19px] font-semibold tracking-[-0.05em]">2B&nbsp;Recon</span>
      </div>
      <div className={`flex flex-wrap items-center gap-x-7 gap-y-3 text-ink/45 ${base}`} style={{ transitionDelay: '760ms' }}>
        <span className="flex gap-[3px] font-mono text-[15px] font-semibold" aria-label="Form 138">
          {['1', '3', '8'].map((d) => (
            <span key={d} className="flex h-6 w-5 items-center justify-center bg-ink/45 text-white">
              {d}
            </span>
          ))}
        </span>
        <span className="font-[Georgia,serif] text-[22px] font-semibold tracking-[-0.03em]">Form 140</span>
        <span className="font-display text-[17px] font-semibold italic">FVU 1.2</span>
        <span className="font-[Georgia,serif] text-[15px] leading-[0.95]">
          Form
          <br />
          144
        </span>
        <span className="font-display text-[17px] font-semibold tracking-[0.06em]">DSC</span>
      </div>
    </div>
  );
}

export function LandingHero() {
  const trackRef = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);
  const onReveal = useCallback(() => setRevealed(true), []);

  const ink = revealed ? 'text-ink' : 'text-[#cfcfd6]';

  return (
    <section id="top" ref={trackRef} className="relative bg-hero-canvas" aria-labelledby="hero-title">
      <div className="relative flex min-h-[680px] flex-col overflow-hidden pt-[76px] lg:h-[100svh] lg:max-h-[1000px]">
        {/* Ambient light: soft cool wash plus the cast shadow left of the cluster */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 55% at 78% 30%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 70%), radial-gradient(38% 40% at 55% 62%, rgba(150,148,170,0.16) 0%, rgba(150,148,170,0) 70%)',
          }}
        />

        {/* 3D pillars: right side on desktop, block under the copy on mobile */}
        <HeroPillars
          trackRef={trackRef}
          onReveal={onReveal}
          className="relative order-2 h-[400px] w-full lg:absolute lg:inset-y-0 lg:right-0 lg:order-none lg:h-auto lg:w-[60%]"
        />

        {/* Bottom fog so the pillars dissolve into the frame */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[26%] bg-gradient-to-t from-hero-canvas via-hero-canvas/80 to-transparent"
        />

        {/* Copy (the nav lives in the fixed SiteNav) */}
        <div className="relative z-10 order-1 flex flex-1 flex-col px-4 sm:px-10 lg:w-[54%] lg:justify-center lg:pl-[max(2.5rem,calc((100vw-1480px)/2+2.5rem))] lg:pr-0 lg:pt-0 lg:pb-8">
          <p
            className={`mb-6 inline-flex max-w-full flex-wrap sm:flex-nowrap items-center gap-2 rounded-2xl sm:rounded-full border border-ink/10 bg-white/70 py-1.5 pl-2 pr-3.5 text-[12px] sm:text-[12.5px] font-medium text-ink/75 backdrop-blur transition-opacity duration-700 ${revealed ? 'opacity-100' : 'opacity-0'}`}
          >
            <span className="shrink-0 rounded-full bg-mint px-2 py-0.5 text-[11px] font-semibold text-ink">2025 Act</span>
            <span className="leading-snug">
              <span className="sm:hidden">Built for both Income-tax Acts</span>
              <span className="hidden sm:inline">Built for both Income-tax Acts, routed by date</span>
            </span>
          </p>
          <h1
            id="hero-title"
            className={`font-display text-[clamp(42px,6.5vw,104px)] font-semibold leading-[1.02] tracking-hero transition-colors duration-[1200ms] ease-out-expo ${ink}`}
          >
            <span className="block whitespace-nowrap">GST &amp; TDS</span>
            <span className="block whitespace-nowrap">Made Easy</span>
          </h1>
          <p
            className={`mt-6 max-w-[25rem] font-display text-[clamp(15px,1.35vw,19px)] leading-[1.45] tracking-[-0.015em] transition-colors duration-[1200ms] ease-out-expo ${
              revealed ? 'text-ink/80' : 'text-[#d6d6dc]'
            }`}
            style={{ transitionDelay: '120ms' }}
          >
            File returns, act on IMS and sign TDS statements for every client from one fast, secure workspace.
          </p>
          <div
            className={`mt-9 transition-colors duration-[900ms] ease-out-expo ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
            style={{ transitionDelay: '260ms' }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5 w-full sm:w-auto">
              <PillButton href="/signup" size="lg" className="w-full sm:w-auto justify-between sm:justify-start">
                Book a free demo
              </PillButton>
              <Link href="/switch" className="text-center sm:text-left font-display text-[15px] sm:text-[16px] font-medium tracking-[-0.015em] text-ink/70 transition-colors hover:text-ink">
                Switching from desktop software?
              </Link>
            </div>
          </div>
          <div className="mt-14 hidden lg:block">
            <FormMarks revealed={revealed} />
          </div>
        </div>

        <div className="relative z-10 order-3 px-4 pb-10 sm:px-10 lg:hidden">
          <FormMarks revealed={revealed} />
        </div>
      </div>
    </section>
  );
}
