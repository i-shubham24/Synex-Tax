import type { ReactNode } from 'react';
import Link from 'next/link';
import { SiteNav } from '../landing/SiteNav';
import { LandingFooter } from '../landing/LandingFooter';
import { PillButton, StepMark } from '../landing/primitives';

/** The framed page header: eyebrow and large headline on the left, summary on the right. */
export function PageHeader({
  eyebrow,
  title,
  summary,
  meta,
  cta = false,
}: {
  eyebrow: string;
  title: ReactNode;
  summary: ReactNode;
  /** A small line under the summary, e.g. "Last updated ...". */
  meta?: ReactNode;
  cta?: boolean;
}) {
  return (
    <header className="relative overflow-hidden bg-hero-canvas pt-[76px]">
      <div className="mx-auto max-w-[1380px] px-4 sm:px-10">
        <div className="relative grid grid-cols-1 gap-8 border-hairline pb-14 pt-10 sm:pt-14 lg:grid-cols-12 lg:gap-0 lg:border-x lg:pb-20 lg:pt-20">
          <div className="min-w-0 lg:col-span-7 lg:pr-12">
            <p className="flex items-center gap-2.5 text-[13px] text-ink-soft">
              <StepMark /> {eyebrow}
            </p>
            <h1 className="mt-7 max-w-[40rem] font-display text-[clamp(40px,5vw,72px)] font-semibold leading-[1] tracking-[-0.05em] text-ink">{title}</h1>
          </div>
          <div className="min-w-0 lg:col-span-5 lg:flex lg:flex-col lg:justify-end lg:border-l lg:border-hairline lg:pl-12">
            <div className="max-w-[30rem] text-[15.5px] leading-[1.6] text-ink/75">{summary}</div>
            {meta ? <p className="mt-5 text-[13px] text-ink-soft">{meta}</p> : null}
            {cta && (
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                <PillButton href="/signup">Start 14-day free trial</PillButton>
                <Link href="/contact" className="text-[14px] text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                  Book a demo
                </Link>
              </div>
            )}
          </div>
          {/* A short run of steps along the frame's foot, as on the homepage blocks */}
          <div aria-hidden className="pointer-events-none absolute bottom-0 right-0 hidden h-12 w-[22%] lg:block">
            <span className="absolute bottom-0 right-0 h-full w-[34%] rounded-tl-[6px] bg-mint" />
            <span className="absolute bottom-0 right-[34%] h-1/2 w-[26%] rounded-t-[6px] bg-mint-pale" />
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Frame for reference pages (security, free tools, what's new, contact): the framed header and a
 * content column. No call to action unless the page asks for one.
 */
export function MarketingPage({
  eyebrow,
  title,
  summary,
  cta = false,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  summary: ReactNode;
  cta?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <SiteNav />
      <main className="bg-white">
        <PageHeader eyebrow={eyebrow} title={title} summary={summary} cta={cta} />
        <div className="mx-auto max-w-[1380px] px-6 py-14 sm:px-10 lg:py-20">{children}</div>
      </main>
      <LandingFooter />
    </>
  );
}

export type Availability = 'live' | 'pilot' | 'coming';

const TAG: Record<Availability, [string, string]> = {
  live: ['Live', 'bg-mint'],
  pilot: ['In pilot', 'bg-sky'],
  coming: ['Coming', 'bg-ink/25'],
};

/** What is working today, as a small square and a word rather than a coloured pill. */
export function StatusTag({ status }: { status: Availability }) {
  const [label, dot] = TAG[status];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-ink-soft">
      <span className={`h-2 w-2 rounded-[2px] ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

export interface FeatureItem {
  title: string;
  body: string;
  status: Availability;
}

/** Feature groups, each line marked with whether it is live today. */
export function FeatureGroups({ groups }: { groups: Array<{ id: string; title: string; items: FeatureItem[] }> }) {
  return (
    <div className="space-y-16">
      <ul aria-label="What each mark means" className="flex flex-wrap items-center gap-x-7 gap-y-2 text-[13px] text-ink-soft">
        <li className="inline-flex items-center gap-2"><StatusTag status="live" /> working in the product today</li>
        <li className="inline-flex items-center gap-2"><StatusTag status="pilot" /> with pilot firms now</li>
        <li className="inline-flex items-center gap-2"><StatusTag status="coming" /> not built yet</li>
      </ul>
      {groups.map((g) => (
        <section key={g.id} id={g.id} aria-labelledby={`${g.id}-title`} className="grid scroll-mt-24 gap-8 lg:grid-cols-12">
          <h2 id={`${g.id}-title`} className="text-[clamp(24px,2.2vw,32px)] font-normal leading-[1.15] tracking-[-0.03em] text-ink lg:col-span-4">
            {g.title}
          </h2>
          <ul className="grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:col-span-8">
            {g.items.map((it) => (
              <li key={it.title} className="border-t border-ink/15 pt-4">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-[15.5px] font-medium tracking-[-0.01em] text-ink">{it.title}</h3>
                  <StatusTag status={it.status} />
                </div>
                <p className="mt-2 text-[14px] leading-[1.6] text-ink-soft">{it.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
