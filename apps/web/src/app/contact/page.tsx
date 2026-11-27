import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingPage } from '../../components/marketing/MarketingPage';
import { ContactForm } from '../../components/legal/ContactForm';
import { LEGAL } from '../../lib/legal';
import { JsonLd } from '../../components/seo/JsonLd';
import { buildPageMetadata, SEO_PAGES } from '../../seo/meta';
import { buildBreadcrumbSchema } from '../../seo/schema';

export const metadata: Metadata = buildPageMetadata(SEO_PAGES.contact);

const ROUTES: Array<{ title: string; body: string; href: string; cta: string }> = [
  {
    title: 'Book a demo',
    body: 'A 30-minute walkthrough on your own client list, in your office or online. Use the form on this page.',
    href: '#write',
    cta: 'Write to us below',
  },
  {
    title: 'Pricing and moving over',
    body: 'Plans, firm size, and bringing clients across from your current software.',
    href: `mailto:${LEGAL.emails.hello}`,
    cta: LEGAL.emails.hello,
  },
  {
    title: 'Support',
    body: 'Already using SynTax? The help button inside the workspace attaches the screen and client for you.',
    href: `mailto:${LEGAL.emails.support}`,
    cta: LEGAL.emails.support,
  },
  {
    title: 'Privacy and grievances',
    body: 'Data requests and complaints go to our Grievance Officer.',
    href: '/privacy#grievance',
    cta: 'Grievance Officer details',
  },
];

export default function ContactPage() {
  return (
    <>
      <JsonLd data={buildBreadcrumbSchema([{ name: 'Contact', path: '/contact' }])} />
      <MarketingPage
        eyebrow="Contact"
        title="Talk to the people building it."
      summary={
        <p>
          We are in {LEGAL.city} and reply in English, Punjabi or Hindi, usually within one working day.
        </p>
      }
    >
      <div className="grid gap-14 lg:grid-cols-12">
        <section className="lg:col-span-5" aria-label="Ways to reach us">
          <ul className="border-b border-hairline">
            {ROUTES.map((r) => (
              <li key={r.title} className="border-t border-hairline py-6">
                <h2 className="text-[17px] font-medium tracking-[-0.02em] text-ink">{r.title}</h2>
                <p className="mt-1.5 max-w-[28rem] text-[14px] leading-[1.6] text-ink-soft">{r.body}</p>
                <Link href={r.href} className="mt-3 inline-block text-[14px] text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                  {r.cta}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section id="write" className="scroll-mt-24 lg:col-span-7" aria-labelledby="write-title">
          <div className="rounded-[20px] bg-mist p-6 sm:p-9">
            <h2 id="write-title" className="text-[clamp(26px,2.4vw,34px)] font-normal leading-[1.15] tracking-[-0.03em] text-ink">
              Send us a note.
            </h2>
            <p className="mt-3 max-w-[32rem] text-[14.5px] leading-[1.6] text-ink-soft">
              Tell us roughly how many GSTINs and TANs you file for. If you are moving from another product, say which one and we
              will bring a plan for the move to the demo.
            </p>
            <div className="mt-7">
              <ContactForm />
            </div>
            <p className="mt-6 text-[12.5px] leading-[1.6] text-ink-soft">
              Please don’t send client PANs, Aadhaar numbers or portal passwords by email or in this form.
            </p>
          </div>
        </section>
      </div>
      </MarketingPage>
    </>
  );
}
