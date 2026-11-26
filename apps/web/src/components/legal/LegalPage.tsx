import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteNav } from '../landing/SiteNav';
import { LandingFooter } from '../landing/LandingFooter';
import { LEGAL } from '../../lib/legal';
import { PageHeader } from '../marketing/MarketingPage';

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
      <main className="bg-white">
        <PageHeader eyebrow={eyebrow} title={title} summary={summary} meta={<>Last updated {LEGAL.updated}</>} />

        <div className="mx-auto grid max-w-[1480px] gap-10 px-6 py-12 sm:px-10 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)] lg:px-14 lg:py-16">
          <nav aria-label="On this page" className="hidden lg:block">
            <ol className="sticky top-24 space-y-1.5 border-l border-ink/10 pl-4 text-[13.5px]">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="block py-0.5 text-ink/55 transition-colors hover:text-ink">
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
            <p className="mt-10 border-t border-ink/15 pt-6 text-[14.5px] leading-[1.6] text-ink">
              Questions about this page? Write to{' '}
              <a className="underline decoration-ink/30 underline-offset-4 hover:decoration-ink" href={`mailto:${LEGAL.emails.privacy}`}>
                {LEGAL.emails.privacy}
              </a>{' '}
              or use the <Link href="/contact" className="underline decoration-ink/30 underline-offset-4 hover:decoration-ink">contact page</Link>.
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
