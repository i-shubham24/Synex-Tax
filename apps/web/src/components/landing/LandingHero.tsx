'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { nextDue, type NextDue } from '../../lib/deadlines';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { PillButton } from './primitives';

const HeroPillars = dynamic(() => import('./hero/HeroPillars').then((m) => m.HeroPillars), {
  ssr: false,
});

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
  const router = useRouter();
  const { loginDemo } = useAuth();
  const [opening, setOpening] = useState(false);
  const [due, setDue] = useState<NextDue | null>(null);
  // Worked out in the browser so it reads the visitor's today, not the build's.
  useEffect(() => setDue(nextDue(new Date())), []);
  // Signs in to the sample firm (two sample clients, partner role) and opens its workspace.
  const openSample = useCallback(async () => {
    setOpening(true);
    try {
      await loginDemo('PARTNER');
      router.push('/dashboard');
    } catch {
      router.push('/login');
    } finally {
      setOpening(false);
    }
  }, [loginDemo, router]);
  const trackRef = useRef<HTMLElement>(null);
  // Render primary hero copy and CTAs at full contrast immediately for zero LCP/FCP delay.
  const revealed = true;
  const onReveal = useCallback(() => {}, []);

  const ink = 'text-ink';

  return (
    <section id="top" ref={trackRef} className="relative bg-hero-canvas" aria-labelledby="hero-title">
      <div className="relative flex flex-col overflow-hidden pt-[64px] lg:h-[100svh] lg:min-h-[680px] lg:max-h-[1000px] lg:pt-[76px]">
        {/* Ambient light: soft cool wash plus the cast shadow left of the cluster */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 55% at 78% 30%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 70%), radial-gradient(38% 40% at 55% 62%, rgba(150,148,170,0.16) 0%, rgba(150,148,170,0) 70%)',
          }}
        />

        {/* 3D pillars: right side on desktop, lifted snugly beneath copy on mobile */}
        <HeroPillars
          trackRef={trackRef}
          onReveal={onReveal}
          className="relative order-2 -mt-6 h-[290px] w-full sm:-mt-4 sm:h-[340px] lg:absolute lg:inset-y-0 lg:right-0 lg:mt-0 lg:order-none lg:h-auto lg:w-[60%]"
        />

        {/* Bottom fog so the pillars dissolve into the frame */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[26%] bg-gradient-to-t from-hero-canvas via-hero-canvas/80 to-transparent"
        />

        {/* Copy (the nav lives in the fixed SiteNav) */}
        <div className="relative z-10 order-1 flex flex-col px-4 sm:px-10 lg:w-[54%] lg:flex-1 lg:justify-center lg:pl-[max(2.5rem,calc((100vw-1480px)/2+2.5rem))] lg:pr-0 lg:pt-0 lg:pb-8">
          <p
            className={`mb-3 sm:mb-5 inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border border-ink/10 bg-white/80 py-1 pl-1.5 pr-3 text-[11px] sm:text-[12px] font-medium text-ink/75 backdrop-blur transition-opacity duration-700 ${revealed ? 'opacity-100' : 'opacity-0'}`}
          >
            <span className="shrink-0 rounded-full bg-mint px-2 py-0.5 text-[10px] sm:text-[10.5px] font-semibold text-ink">Next due</span>
            <span className="truncate leading-none" aria-live="polite">
              {due ? (
                <>
                  <span className="sm:hidden">
                    {due.what.replace(/ for .*$/, '')} &middot; {due.due.replace(/^[A-Za-z]+ /, '')}
                  </span>
                  <span className="hidden sm:inline">
                    {due.what}, {due.due}
                  </span>
                  <span className="text-ink/50">
                    {due.days === 0 ? ', today' : due.days === 1 ? ', tomorrow' : `, ${due.days}d`}
                  </span>
                </>
              ) : (
                '\u00a0'
              )}
            </span>
          </p>
          <h1
            id="hero-title"
            className={`font-display text-[clamp(40px,6.5vw,104px)] font-semibold leading-[1.02] tracking-hero transition-colors duration-[1200ms] ease-out-expo ${ink}`}
          >
            <span className="block whitespace-nowrap">GST &amp; TDS</span>
            <span className="block whitespace-nowrap">Made Easy</span>
          </h1>
          <p
            className={`mt-3.5 sm:mt-5 max-w-[25rem] font-display text-[clamp(15px,1.35vw,19px)] leading-[1.45] tracking-[-0.015em] transition-colors duration-[1200ms] ease-out-expo ${
              revealed ? 'text-ink/80' : 'text-[#d6d6dc]'
            }`}
            style={{ transitionDelay: '120ms' }}
          >
            File returns, act on IMS and sign TDS statements for every client from one fast, secure workspace.
          </p>
          <div
            className={`mt-5 sm:mt-8 transition-colors duration-[900ms] ease-out-expo ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
            style={{ transitionDelay: '260ms' }}
          >
            <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-fit sm:flex-nowrap sm:items-center sm:gap-4">
              <PillButton
                onClick={openSample}
                disabled={opening}
                compactMobile
                size="lg"
                className="w-full justify-between sm:w-auto sm:justify-start sm:shrink-0"
              >
                <span className="sm:hidden">{opening ? 'Opening…' : 'Sample firm'}</span>
                <span className="hidden sm:inline">{opening ? 'Opening the sample firm…' : 'Explore a sample firm'}</span>
              </PillButton>
              <PillButton
                href="/switch"
                tone="light"
                compactMobile
                size="lg"
                className="w-full justify-between sm:w-auto sm:justify-start sm:shrink-0"
              >
                <span className="sm:hidden">From desktop?</span>
                <span className="hidden sm:inline">Switching from desktop?</span>
              </PillButton>
            </div>
            <p className="mt-2.5 sm:mt-3.5 text-[12px] sm:text-[13.5px] text-ink/55">
              The sample firm opens with two clients set up. No sign-up needed.
            </p>
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
