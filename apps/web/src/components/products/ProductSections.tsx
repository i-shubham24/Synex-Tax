'use client';

import Link from 'next/link';
import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { PillButton, PixelField, StepMark } from '../landing/primitives';

/**
 * Shared sections for the four product pages (GST, TDS, Sign, Desk), in the homepage's language:
 * hairline column frame, stepped mint blocks, dark and light bands alternating.
 */

/* ------------------------------------------------------------------ Hero */
export function ProductHero({
  suite,
  title,
  titleId,
  body,
  price,
  footer,
  visual,
}: {
  suite: string;
  title: ReactNode;
  titleId: string;
  body: ReactNode;
  /** The link under the main button: what it costs, pointing to pricing. */
  price: string;
  footer?: ReactNode;
  visual: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-hero-canvas pt-[76px]" aria-labelledby={titleId}>
      <div className="mx-auto max-w-[1380px] px-4 sm:px-10">
        <div className="grid grid-cols-1 border-hairline lg:grid-cols-12 lg:border-x">
          <div className="min-w-0 py-10 sm:py-14 lg:col-span-5 lg:py-20 lg:pr-12">
            <p className="flex items-center gap-2.5 text-[13px] text-ink-soft">
              <StepMark /> {suite}
            </p>
            <h1 id={titleId} className="mt-7 font-display text-[clamp(44px,5vw,76px)] font-semibold leading-[0.98] tracking-[-0.055em] text-ink">
              {title}
            </h1>
            <div className="mt-7 max-w-[26rem] text-[16px] leading-[1.55] text-ink/75">{body}</div>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <PillButton href="/signup" size="lg">
                Start 14-day free trial
              </PillButton>
              <Link href="/pricing" className="text-[14px] text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                {price}
              </Link>
            </div>
            {footer ? <div className="mt-10 min-h-[20px] text-[13px] text-ink-soft">{footer}</div> : null}
          </div>
          <div className="relative min-w-0 pb-10 lg:col-span-7 lg:border-l lg:border-hairline lg:pb-0">{visual}</div>
        </div>
      </div>
    </section>
  );
}

/**
 * Product page hero: copy and one large illustration made of the brand's stepped blocks.
 * "stacked" puts the illustration full width under the copy (timelines, calendars);
 * "split" puts it beside the copy. Working demos live in TrySection below, not here.
 */
export function SuiteHero({
  suite,
  title,
  titleId,
  body,
  price,
  footer,
  visual,
  layout = 'split',
  priceHref = '/pricing',
}: {
  suite: string;
  title: ReactNode;
  titleId: string;
  body: ReactNode;
  /** The text link beside the main button; usually the price, pointing to pricing. */
  price: string;
  priceHref?: string;
  footer?: ReactNode;
  visual: ReactNode;
  layout?: 'split' | 'stacked';
}) {
  const ctas = (
    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
      <PillButton href="/signup" size="lg">
        Start 14-day free trial
      </PillButton>
      <Link href={priceHref} className="text-[14px] text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
        {price}
      </Link>
    </div>
  );
  const eyebrow = (
    <p className="flex items-center gap-2.5 text-[13px] text-ink-soft">
      <StepMark /> {suite}
    </p>
  );
  const h1Class = 'mt-7 font-display font-semibold leading-[0.96] tracking-[-0.058em] text-ink';

  if (layout === 'stacked') {
    return (
      <section className="relative overflow-hidden bg-hero-canvas pt-[76px]" aria-labelledby={titleId}>
        <div className="mx-auto max-w-[1380px] px-4 sm:px-10">
          <div className="border-hairline lg:border-x">
            <div className="grid grid-cols-1 gap-8 pb-12 pt-10 sm:pt-14 lg:grid-cols-12 lg:gap-0 lg:px-10 lg:pb-16 lg:pt-20">
              <div className="min-w-0 lg:col-span-7 lg:pr-10">
                {eyebrow}
                <h1 id={titleId} className={`${h1Class} text-[clamp(46px,6.2vw,96px)]`}>
                  {title}
                </h1>
              </div>
              <div className="min-w-0 lg:col-span-5 lg:flex lg:flex-col lg:justify-end">
                <div className="max-w-[27rem] text-[16px] leading-[1.55] text-ink/75">{body}</div>
                {ctas}
              </div>
            </div>
            <div className="relative">{visual}</div>
            {footer ? <div className="border-t border-hairline px-0 py-4 text-[13px] text-ink-soft lg:px-10">{footer}</div> : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden bg-hero-canvas pt-[76px]" aria-labelledby={titleId}>
      <div className="mx-auto max-w-[1380px] px-4 sm:px-10">
        <div className="grid grid-cols-1 border-hairline lg:grid-cols-12 lg:border-x">
          <div className="min-w-0 py-10 sm:py-14 lg:col-span-6 lg:py-24 lg:pl-10 lg:pr-12">
            {eyebrow}
            <h1 id={titleId} className={`${h1Class} text-[clamp(46px,5.4vw,84px)]`}>
              {title}
            </h1>
            <div className="mt-7 max-w-[27rem] text-[16px] leading-[1.55] text-ink/75">{body}</div>
            {ctas}
            {footer ? <div className="mt-10 text-[13px] text-ink-soft">{footer}</div> : null}
          </div>
          <div className="relative min-w-0 pb-12 lg:col-span-6 lg:flex lg:items-center lg:border-l lg:border-hairline lg:px-10 lg:pb-0">{visual}</div>
        </div>
      </div>
    </section>
  );
}

/** The working demo for a product, with a short explanation and one supporting card. */
export function TrySection({
  titleId,
  title,
  body,
  aside,
  demo,
}: {
  titleId: string;
  title: string;
  body: ReactNode;
  aside?: ReactNode;
  demo: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-[1380px] px-6 py-20 sm:px-10 sm:py-28" aria-labelledby={titleId}>
      <div className="grid gap-12 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-4">
          <h2 id={titleId} className="max-w-[22rem] text-[clamp(28px,2.8vw,40px)] font-normal leading-[1.14] tracking-[-0.035em] text-ink">
            {title}
          </h2>
          <div className="mt-5 max-w-[22rem] text-[14px] leading-[1.6] text-ink-soft">{body}</div>
          {aside ? <div className="mt-10">{aside}</div> : null}
        </div>
        <div className="min-w-0 lg:col-span-8">
          <div className="flex justify-center rounded-[20px] bg-mist px-4 py-10 sm:px-10 sm:py-14">{demo}</div>
        </div>
      </div>
    </section>
  );
}

/** The stepped block panel a hero's product cards sit on. */
export function StepPanel({ tone = 'sky', tall = false, children }: { tone?: 'sky' | 'mint' | 'night'; tall?: boolean; children: ReactNode }) {
  const base = tone === 'sky' ? 'bg-sky' : tone === 'mint' ? 'bg-mint' : 'bg-night';
  const step = tone === 'mint' ? 'bg-sky' : 'bg-mint';
  const pale = tone === 'mint' ? 'bg-sky-pale' : 'bg-mint-pale';
  return (
    <div className={`relative h-full overflow-hidden rounded-[14px] lg:ml-10 lg:mt-10 lg:rounded-b-none lg:rounded-t-[14px] ${tall ? 'lg:min-h-[690px]' : 'lg:min-h-[560px]'}`}>
      <div aria-hidden className={`pixel-host absolute inset-0 ${base}`}>
        <PixelField seed={7} count={60} cell={16} cols={22} rows={14} color="#ffffff" maxOpacity={tone === 'night' ? 0.12 : 0.35} />
      </div>
      <div aria-hidden className={`absolute bottom-0 left-0 h-[30%] w-[26%] rounded-tr-[8px] ${step}`} />
      <div aria-hidden className={`absolute bottom-[30%] left-0 h-[16%] w-[13%] rounded-r-[8px] ${pale}`} />
      <div aria-hidden className={`absolute right-0 top-0 h-[22%] w-[18%] rounded-bl-[8px] ${step}`} />
      <div aria-hidden className={`absolute right-[18%] top-0 h-[11%] w-[10%] rounded-b-[8px] ${pale}`} />
      <div className="relative flex h-full flex-col gap-4 p-4 sm:p-8 lg:block lg:p-0">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- Stairs */
export type Step = { when: string; title: string; body: string };

function useRise(p: MotionValue<number>, from: number, reduce: boolean | null) {
  return useTransform(p, [0, 1], reduce ? [0, 0] : [from, 0]);
}

/** A real sequence (a month, a quarter) as mint steps that climb to the last one. */
export function StairSteps({ titleId, title, aside, steps }: { titleId: string; title: string; aside: ReactNode; steps: Step[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const rises = [useRise(scrollYProgress, 30, reduce), useRise(scrollYProgress, 70, reduce), useRise(scrollYProgress, 110, reduce), useRise(scrollYProgress, 150, reduce)];

  return (
    <section data-nav-theme="dark" className="bg-night pb-20 pt-16 text-white sm:pt-24" aria-labelledby={titleId}>
      <div className="mx-auto max-w-[1380px] px-6 sm:px-10">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-end">
          <h2 id={titleId} className="max-w-[34rem] text-[clamp(30px,3.2vw,44px)] font-normal leading-[1.14] tracking-[-0.035em]">
            {title}
          </h2>
          <div className="text-[13px] leading-[1.6] text-white/60">{aside}</div>
        </div>

        <div ref={ref} className="mt-12 grid gap-3 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4 lg:items-end">
          {steps.slice(0, 4).map((s, i) => (
            <motion.article key={s.when} style={{ y: rises[i] }} className="pixel-host relative flex flex-col overflow-hidden rounded-[10px] bg-mint p-5 text-ink">
              <div className="hidden lg:block" style={{ height: i * 56 }} aria-hidden />
              <PixelField seed={40 + i} count={26} cell={13} cols={16} rows={8} color="#c9f9d8" maxOpacity={0.7} />
              <p className="relative text-[12px] font-medium text-ink/70">{s.when}</p>
              <h3 className="relative mt-8 text-[22px] font-medium leading-tight tracking-[-0.03em]">{s.title}</h3>
              <p className="relative mt-2 text-[12.5px] leading-[1.55] text-ink/80">{s.body}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Rules */
export function RulesPanel({ titleId, title, rules, footnote }: { titleId: string; title: string; rules: Array<{ rule: string; what: string }>; footnote?: ReactNode }) {
  return (
    <section className="px-3 sm:px-6 lg:px-10" aria-labelledby={titleId}>
      <div className="mx-auto max-w-[1480px] rounded-[30px] bg-mist px-6 py-16 sm:rounded-[38px] sm:px-10 sm:py-20">
        <div className="mx-auto max-w-[1300px]">
          <h2 id={titleId} className="max-w-[30rem] text-[clamp(28px,2.8vw,40px)] font-normal leading-[1.14] tracking-[-0.035em] text-ink">
            {title}
          </h2>
          <dl className="mt-12 grid gap-x-12 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {rules.map((r) => (
              <div key={r.rule} className="border-t border-ink/15 pt-4">
                <dt className="text-[15px] font-medium tracking-[-0.01em] text-ink">{r.rule}</dt>
                <dd className="mt-2 text-[14px] leading-[1.55] text-ink-soft">{r.what}</dd>
              </div>
            ))}
          </dl>
          {footnote ? <p className="mt-14 max-w-[44rem] text-[13px] leading-[1.6] text-ink-soft">{footnote}</p> : null}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Close */
export function PriceClose({ titleId, title, body, compare = true }: { titleId: string; title: string; body: string; compare?: boolean }) {
  return (
    <section className="px-3 py-10 sm:px-6 sm:py-14 lg:px-10" aria-labelledby={titleId}>
      <div data-nav-theme="dark" className="relative mx-auto max-w-[1480px] overflow-hidden rounded-[30px] bg-night text-white sm:rounded-[38px]">
        <div aria-hidden className="absolute right-[10%] top-0 hidden h-[58%] w-[13%] rounded-b-[6px] bg-mint md:block" />
        <div aria-hidden className="absolute right-0 top-[38%] hidden h-[34%] w-[10%] rounded-l-[6px] bg-mint md:block" />
        <div aria-hidden className="absolute bottom-0 right-[23%] hidden h-[22%] w-[9%] rounded-t-[6px] bg-mint md:block" />
        <div className="relative px-7 py-14 sm:px-12 sm:py-16 md:max-w-[62%]">
          <h2 id={titleId} className="text-[clamp(30px,3.6vw,52px)] font-medium leading-[1.05] tracking-[-0.045em]">
            {title}
          </h2>
          <p className="mt-5 max-w-[30rem] text-[15px] leading-[1.6] text-white/70">{body}</p>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <PillButton href="/signup" tone="light" size="lg">
              Start 14-day free trial
            </PillButton>
            {compare ? (
              <Link href="/pricing" className="text-[14px] text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
                Compare plans
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
