import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteNav } from '../landing/SiteNav';
import { LandingFooter } from '../landing/LandingFooter';
import { LEGAL } from '../../lib/legal';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Shared frame for the privacy notice and terms: light header band, sticky contents, readable column. */
export function LegalPage({
  eyebrow,
  title,
  summary,
  sections,
}: {
  eyebrow: string;
  title: string;
  summary: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <>
      <SiteNav />
      <main className="site-base">
        <header className="px-3 pt-24 sm:px-6 lg:px-10">
          <div className="round-light mx-auto max-w-[1480px] rounded-[30px] px-6 py-10 sm:rounded-[38px] sm:px-10 sm:py-14">
            <p className="font-display text-[12.5px] font-semibold uppercase tracking-[0.12em] text-sky-deep">{eyebrow}</p>
            <h1 className="mt-3 max-w-[40rem] font-display text-[clamp(34px,4.4vw,60px)] font-medium leading-[1.04] tracking-[-0.045em] text-ink">{title}</h1>
            <div className="mt-5 max-w-[46rem] text-[16px] leading-[1.65] text-ink/70">{summary}</div>
            <p className="mt-6 text-[13px] text-ink/45">Last updated {LEGAL.updated}</p>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1480px] gap-10 px-6 py-12 sm:px-10 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)] lg:px-14 lg:py-16">
          <nav aria-label="On this page" className="hidden lg:block">
            <ol className="sticky top-24 space-y-1.5 border-l border-ink/10 pl-4 text-[13.5px]">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="block py-0.5 text-ink/55 transition-colors hover:text-sky-deep">
                    <span className="mr-2 tabular-nums text-ink/30">{String(i + 1).padStart(2, '0')}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="max-w-[46rem]">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24 border-t border-ink/10 py-8 first:border-t-0 first:pt-0">
                <h2 className="flex items-baseline gap-3 font-display text-[clamp(21px,1.8vw,26px)] font-medium tracking-[-0.03em] text-ink">
                  <span className="text-[14px] tabular-nums text-ink/30">{String(i + 1).padStart(2, '0')}</span>
                  {s.title}
                </h2>
                <div className="legal-body mt-4 space-y-4 text-[15.5px] leading-[1.7] text-ink/75">{s.body}</div>
              </section>
            ))}
            <p className="mt-6 rounded-[20px] bg-mist px-5 py-4 text-[14px] leading-[1.6] text-ink/65">
              Questions about this page? Write to{' '}
              <a className="text-sky-deep underline-offset-4 hover:underline" href={`mailto:${LEGAL.emails.privacy}`}>
                {LEGAL.emails.privacy}
              </a>{' '}
              or use the <Link href="/contact" className="text-sky-deep underline-offset-4 hover:underline">contact page</Link>.
            </p>
          </article>
        </div>
      </main>
      <LandingFooter />
    </>
  );
}

/** Bulleted list with the site's mint markers. */
export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="mt-[0.62em] h-1.5 w-1.5 shrink-0 rounded-[2px] bg-mint" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
