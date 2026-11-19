'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { Rocket, ShieldCheck, Users } from 'lucide-react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { Eyebrow, PixelField, SplitButton, Stat } from './primitives';

const STEPS = [
  {
    icon: Rocket,
    title: 'The mission',
    body: 'Replace service-pack desktop software with one secure workspace for GST and TDS.',
  },
  {
    icon: Users,
    title: 'Built for teams',
    body: 'Staff prepare, partners approve. Maker-checker locks guard every filing.',
  },
  {
    icon: ShieldCheck,
    title: 'Full confidence',
    body: 'Every edit is logged and tamper-proof, then kept for eight years.',
  },
];

function StairCard({ step, index }: { step: (typeof STEPS)[number]; index: number }) {
  const Icon = step.icon;
  return (
    <div className="pixel-host relative flex h-full flex-col overflow-hidden rounded-[10px] bg-mint p-4 text-ink sm:p-5">
      <PixelField seed={20 + index} count={30} cell={13} cols={16} rows={10} color="#c9f9d8" maxOpacity={0.7} />
      <Icon className="relative h-5 w-5" strokeWidth={2.2} />
      <p className="relative mt-auto pt-8 text-[clamp(17px,1.5vw,21px)] font-medium tracking-[-0.03em]">{step.title}</p>
      <p className="relative mt-1.5 max-w-[15rem] text-[11px] leading-[1.45] text-ink/80">{step.body}</p>
    </div>
  );
}

export function AboutStairs() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  // The staircase assembles as it scrolls in: each step slides up from below its resting place.
  const y0 = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [140, 0]);
  const y1 = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [90, 0]);
  const y2 = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [40, 0]);
  const ys = [y0, y1, y2];

  return (
    <section id="about" data-nav-theme="dark" className="relative bg-night pb-20 pt-16 text-white sm:pt-20" aria-labelledby="about-title">
      <div className="mx-auto max-w-[1380px] px-6 sm:px-10">
        <Eyebrow dark>Why SynexTax</Eyebrow>
        <div ref={ref} className="relative mt-7 grid gap-10 lg:grid-cols-[minmax(0,38fr)_minmax(0,62fr)]">
          <div>
            <h2 id="about-title" className="max-w-[26rem] text-[clamp(30px,3.2vw,44px)] font-normal leading-[1.14] tracking-[-0.035em]">
              A filing desk built for the busiest week of the month.
            </h2>
            <div className="mt-16 hidden space-y-12 lg:block">
              <Stat dark value="2" sup="Acts" label="1961 and 2025 TDS, one engine" />
              <Stat dark value="3" sup="langs" supTone="sky" label="English, Punjabi and Hindi" />
            </div>
          </div>

          {/* Staircase: each card overlaps the previous one, stepping up to the right */}
          <div className="relative min-h-[420px] lg:min-h-[470px]">
            {/* Absolutely positioned cards (desktop) */}
            <div className="hidden lg:block">
              {STEPS.map((s, i) => (
                <motion.div
                  key={s.title}
                  style={{ y: ys[i], left: `${i * 31}%`, top: `${(2 - i) * 125}px` }}
                  className="absolute h-[168px] w-[38%]"
                >
                  <StairCard step={s} index={i} />
                </motion.div>
              ))}
              <p className="absolute bottom-[38px] right-0 max-w-[19rem] text-[11px] leading-[1.6] text-white/60">
                A partner tool, made for steady help at every deadline: precise numbers, clear audit trails, and calm
                on the 20th.
              </p>
            </div>
            {/* Stacked cards (mobile / tablet) */}
            <div className="grid gap-3 sm:grid-cols-3 lg:hidden">
              {STEPS.map((s, i) => (
                <div key={s.title} className="h-[180px]">
                  <StairCard step={s} index={i} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-14 grid items-center gap-8 border-t border-white/10 pt-10 lg:grid-cols-[minmax(0,38fr)_minmax(0,31fr)_minmax(0,31fr)]">
          <div className="flex gap-12 lg:hidden">
            <Stat dark value="2" sup="Acts" label="1961 and 2025 TDS" />
            <Stat dark value="3" sup="langs" supTone="sky" label="English, Punjabi, Hindi" />
          </div>
          <p className="hidden text-[11px] text-white/40 lg:block">Designed with CA practices in Amritsar, Tarn Taran and Batala.</p>
          <p className="max-w-[21rem] text-[11.5px] leading-[1.6] text-white/60">
            We are finance and engineering people who watched skilled article clerks lose evenings to Java errors, zip
            patches and office-locked licences.
          </p>
          <div className="flex flex-wrap items-center gap-5">
            <SplitButton href="/signup" tone="light">
              Get started now
            </SplitButton>
            <Link href="#pilot" className="text-[12.5px] font-medium text-white/90 hover:underline">
              Start your free pilot
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
