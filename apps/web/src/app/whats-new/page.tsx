import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingPage } from '../../components/marketing/MarketingPage';

export const metadata: Metadata = {
  title: "What's new | SynexTax",
  description: 'Changes to SynexTax, newest first.',
};

const RELEASES: Array<{ date: string; title: string; items: Array<[string, string, string?]> }> = [
  {
    date: '20 November 2026',
    title: 'Switching, TDS history and client documents',
    items: [
      ['Import your client list', 'Paste from Excel or upload a CSV. Every GSTIN, PAN, TAN, mobile and email is checked, and you fix problems on the row before anything is saved.', '/switch'],
      ['Form 140 statements as history', 'Bring in statement files from your current software. They are checked against Protean’s Form 140 file format and kept as closed history, with a payee master for each TAN.', '/features/tds'],
      ['TDS health', 'Unused and over-used challans, interest for late payment, late filing fees building up, PAN problems and correction windows closing, for one TAN or the whole firm.', '/features/tds'],
      ['Official Form 140 section codes', 'Deductee sections use the codes from Protean’s Form 140 file format, version 1.2.'],
      ['Client documents', 'Checklists for each client and period, a view of what is overdue or due this week, and a reminder ready to send on WhatsApp or email.'],
      ['Salary TDS calculator', 'Tax for the year under both regimes and the monthly deduction for the rest of the year, free on the tools page.', '/tools'],
      ['Security fixes', 'Sessions now survive a page reload and end on sign-out; the demo workspace is off in production; every PAN reveal and signing attempt must be logged before it happens.', '/security'],
    ],
  },
];

export default function WhatsNewPage() {
  return (
    <MarketingPage
      eyebrow="What's new"
      title="Changes, Newest First"
      cta={false}
      summary={<p>What changed in SynexTax and when. Updates reach every firm automatically; there is nothing to download or install.</p>}
    >
      <ol className="space-y-12">
        {RELEASES.map((r) => (
          <li key={r.date} className="grid gap-6 border-t border-ink/10 pt-8 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
            <div>
              <time className="font-display text-[14px] text-ink/45">{r.date}</time>
              <h2 className="mt-1 font-display text-[clamp(21px,1.9vw,27px)] font-medium tracking-[-0.03em] text-ink">{r.title}</h2>
            </div>
            <ul className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
              {r.items.map(([title, body, href]) => (
                <li key={title}>
                  <h3 className="font-display text-[16.5px] font-medium tracking-[-0.015em] text-ink">
                    {href ? <Link href={href} className="hover:text-sky-deep">{title}</Link> : title}
                  </h3>
                  <p className="mt-1.5 text-[14.5px] leading-[1.6] text-ink/65">{body}</p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </MarketingPage>
  );
}
