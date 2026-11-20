import type { ReactNode } from 'react';
import { SiteNav } from '../landing/SiteNav';
import { LandingFooter } from '../landing/LandingFooter';
import { PillButton } from '../landing/primitives';

/** Frame for marketing pages: transparent nav, light header band, content, footer. */
export function MarketingPage({
  eyebrow,
  title,
  summary,
  cta = true,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: ReactNode;
  cta?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <SiteNav />
      <main className="site-base">
        <header className="px-3 pt-24 sm:px-6 lg:px-10">
          <div className="round-light mx-auto max-w-[1480px] rounded-[30px] px-6 py-10 sm:rounded-[38px] sm:px-10 sm:py-14">
            <p className="font-display text-[12.5px] font-semibold uppercase tracking-[0.12em] text-sky-deep">{eyebrow}</p>
            <h1 className="mt-3 max-w-[44rem] font-display text-[clamp(34px,4.4vw,60px)] font-medium leading-[1.04] tracking-[-0.045em] text-ink">{title}</h1>
            <div className="mt-5 max-w-[46rem] text-[16px] leading-[1.65] text-ink/70">{summary}</div>
            {cta && (
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <PillButton href="/signup">Start a free trial</PillButton>
                <PillButton href="/contact" tone="light">Book a demo</PillButton>
              </div>
            )}
          </div>
        </header>
        <div className="mx-auto max-w-[1480px] px-6 py-12 sm:px-10 lg:px-14 lg:py-16">{children}</div>
      </main>
      <LandingFooter />
    </>
  );
}

export type Availability = 'live' | 'pilot' | 'coming';

const TAG: Record<Availability, [string, string]> = {
  live: ['Live', 'bg-mint/25 text-[#147a3a]'],
  pilot: ['In pilot', 'bg-sky-subtle text-sky-deep'],
  coming: ['Coming', 'bg-ink/[0.06] text-ink/55'],
};

export function StatusTag({ status }: { status: Availability }) {
  const [label, cls] = TAG[status];
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${cls}`}>{label}</span>;
}

export interface FeatureItem {
  title: string;
  body: string;
  status: Availability;
}

/** Lettered feature groups, each line tagged with what is live today. */
export function FeatureGroups({ groups }: { groups: Array<{ id: string; title: string; items: FeatureItem[] }> }) {
  return (
    <div className="space-y-12">
      <ul aria-label="What each tag means" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13.5px] text-ink/55">
        <li className="inline-flex items-center gap-2"><StatusTag status="live" /> working in the product today</li>
        <li className="inline-flex items-center gap-2"><StatusTag status="pilot" /> with pilot firms now</li>
        <li className="inline-flex items-center gap-2"><StatusTag status="coming" /> on the roadmap</li>
      </ul>
      {groups.map((g, i) => (
        <section key={g.id} id={g.id} aria-labelledby={`${g.id}-title`} className="grid gap-6 border-t border-ink/10 pt-8 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <h2 id={`${g.id}-title`} className="flex items-baseline gap-3 font-display text-[clamp(21px,1.9vw,27px)] font-medium tracking-[-0.03em] text-ink">
            <span className="text-[15px] text-ink/30">{String.fromCharCode(65 + i)}</span>
            {g.title}
          </h2>
          <ul className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
            {g.items.map((it) => (
              <li key={it.title}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-[16.5px] font-medium tracking-[-0.015em] text-ink">{it.title}</h3>
                  <StatusTag status={it.status} />
                </div>
                <p className="mt-1.5 text-[14.5px] leading-[1.6] text-ink/65">{it.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
