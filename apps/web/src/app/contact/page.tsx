import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarCheck, LifeBuoy, Mail, ShieldCheck } from 'lucide-react';
import { SiteNav } from '../../components/landing/SiteNav';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { ContactForm } from '../../components/legal/ContactForm';
import { LEGAL } from '../../lib/legal';

export const metadata: Metadata = {
  title: 'Contact | SynexTax',
  description: 'Book a demo, ask about pricing or moving your clients, or reach support and the grievance officer.',
};

const ROUTES = [
  {
    icon: CalendarCheck,
    title: 'Book a demo',
    body: 'A 30 minute walkthrough on your own client list. Start a free trial at the same time.',
    href: '/signup',
    cta: 'Start the trial',
  },
  {
    icon: Mail,
    title: 'Sales and pricing',
    body: 'Plans, firm size, and moving clients over from your current software.',
    href: `mailto:${LEGAL.emails.hello}`,
    cta: LEGAL.emails.hello,
  },
  {
    icon: LifeBuoy,
    title: 'Support',
    body: 'Already a customer? Use the help button inside the workspace; it attaches the screen and client for you.',
    href: `mailto:${LEGAL.emails.support}`,
    cta: LEGAL.emails.support,
  },
  {
    icon: ShieldCheck,
    title: 'Privacy and grievances',
    body: 'Data requests and complaints go to our Grievance Officer.',
    href: '/privacy#grievance',
    cta: 'Grievance details',
  },
];

export default function ContactPage() {
  return (
    <>
      <SiteNav />
      <main className="site-base">
        <header className="px-3 pt-24 sm:px-6 lg:px-10">
          <div className="round-light mx-auto max-w-[1480px] rounded-[30px] px-6 py-10 sm:rounded-[38px] sm:px-10 sm:py-14">
            <p className="font-display text-[12.5px] font-semibold text-sky-deep">Contact</p>
            <h1 className="mt-3 max-w-[40rem] font-display text-[clamp(34px,4.4vw,60px)] font-medium leading-[1.04] tracking-[-0.045em] text-ink">
              Talk To The People Building It
            </h1>
            <p className="mt-5 max-w-[40rem] text-[16px] leading-[1.65] text-ink/70">
              We are in {LEGAL.city} and reply in English, Punjabi or Hindi, usually within one working day.
            </p>
          </div>
        </header>

        <section className="mx-auto grid max-w-[1480px] gap-4 px-3 pt-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-10" aria-label="Ways to reach us">
          {ROUTES.map(({ icon: Icon, title, body, href, cta }) => (
            <Link
              key={title}
              href={href}
              className="group flex flex-col rounded-[24px] border border-ink/[0.07] bg-white p-6 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-sky/50"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-subtle text-sky-deep">
                <Icon className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <h2 className="mt-5 font-display text-[19px] font-medium tracking-[-0.025em] text-ink">{title}</h2>
              <p className="mt-2 flex-1 text-[14.5px] leading-[1.6] text-ink/65">{body}</p>
              <span className="mt-5 truncate text-[14px] font-medium text-sky-deep group-hover:underline group-hover:underline-offset-4">{cta}</span>
            </Link>
          ))}
        </section>

        <section className="mx-auto grid max-w-[1480px] gap-8 px-6 py-14 sm:px-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:px-14 lg:py-20" aria-labelledby="write-title">
          <div>
            <h2 id="write-title" className="font-display text-[clamp(26px,2.4vw,36px)] font-medium leading-[1.12] tracking-[-0.035em] text-ink">
              Send Us A Note
            </h2>
            <p className="mt-4 max-w-[26rem] text-[15.5px] leading-[1.65] text-ink/65">
              Tell us roughly how many GSTINs and TANs you file for. If you are moving from another product, say which one and
              we will bring a migration plan to the demo.
            </p>
            <p className="mt-6 text-[13.5px] leading-[1.6] text-ink/45">
              Please do not send client PANs, Aadhaar numbers or portal passwords by email.
            </p>
          </div>
          <div className="rounded-[28px] border border-ink/[0.07] bg-mist/60 p-5 sm:p-8">
            <ContactForm />
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}
