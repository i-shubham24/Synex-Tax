import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '../../components/landing/SiteNav';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { PillButton } from '../../components/landing/primitives';
import { PriceClose, RulesPanel, SuiteHero, TrySection } from '../../components/products/ProductSections';
import { PlanPicker } from '../../components/pricing/PlanPicker';
import { PlanStair } from '../../components/pricing/PlanStair';
import { Faq } from '../../components/pricing/Faq';

export const metadata: Metadata = {
  title: 'Pricing | SynTax for CA practices',
  description:
    'One yearly price for the whole firm, with no per-PC fees. All four suites from ₹8,999 a year, or GST + Sign at ₹5,999 and TDS + Sign at ₹4,999. 14-day trial.',
};

/** What actually differs between the all-in-one plans. Everything else is in every plan. */
const TIERS = [
  { name: 'Solo', price: '8,999', who: 'A CA working alone or with one or two staff', gstins: '50', tans: '25', people: '3', support: 'Working hours', extra: '' },
  { name: 'Growth', price: '15,999', who: 'A firm with a team handling a few hundred clients', gstins: '200', tans: '100', people: 'No limit', support: 'Until 10 PM in filing weeks', extra: '', pick: true },
  { name: 'Scale', price: '29,999', who: 'Multi-partner firms and firms with branches', gstins: '600', tans: '300', people: 'No limit', support: 'Priority, with a named account manager', extra: 'We move your Tally and Busy data for you' },
];

const PACKS = [
  { name: 'GST + Sign', price: '5,999', covers: '50 GSTINs, 3 people', note: 'GST returns, 2B matching, IMS and signing, with Desk Lite.' },
  { name: 'TDS + Sign', price: '4,999', covers: '25 TANs, 3 people', note: 'TDS and TCS statements for both Acts, FVU, certificates and signing, with Desk Lite.' },
];

const EVERY_PLAN = [
  { rule: 'GST and TDS together', what: 'All-in-one plans include GST, TDS, signing and Desk. Packs cover one of GST or TDS, and you can add the other later.' },
  { rule: 'Signing with your DSC', what: 'Unlimited signatures with the USB tokens in your office, on every plan.' },
  { rule: 'No per-PC fees', what: 'Sign in from the office, from home or on the road. Install the signing app on as many office PCs as hold tokens.' },
  { rule: 'Updates included', what: 'Changes to forms, schemas and rules arrive in SynTax itself. There are no service packs to download and unzip.' },
  { rule: 'Your data stays yours', what: 'A partner can export the firm’s data at any time, and the audit trail is kept for eight years.' },
  { rule: 'One login for the firm', what: 'Partners, managers and staff each get their own sign-in, with the screens and clients you give them.' },
];

const FAQS = [
  {
    q: 'Can I start with GST and add TDS later?',
    a: 'Yes. Start with GST + Sign, and switch to an all-in-one plan from inside SynTax when you are ready. Your clients, their GSTINs and your team are already there, so you only add the TANs.',
  },
  {
    q: 'What do I get in the 14-day trial?',
    a: 'All four suites, with two sample clients already set up so you can try a 2B match or a TDS statement straight away. Add your own clients whenever you like. No card is needed to start.',
  },
  {
    q: 'Are prices before or after GST?',
    a: 'Before. 18% GST is added to every plan, and you get a GST tax invoice for it.',
  },
  {
    q: 'What happens if we cross our GSTIN or TAN limit?',
    a: 'Move to the next plan from inside SynTax when you need more room. Your clients, returns and history stay exactly where they are.',
  },
  {
    q: 'We use SmartBiz today. How hard is the move?',
    a: 'Bring your client list as an Excel sheet and your TDS files as they are; SynTax creates each deductor from them. GST registers come in exactly as Tally or Busy exports them. Many firms switch GST and TDS first and keep their old software for the rest of the year’s ITRs.',
  },
  {
    q: 'Do you charge per computer or per login?',
    a: 'Per firm, not per computer. Solo and the packs include three people; Growth and Scale have no limit on people.',
  },
];

export default function PricingPage() {
  return (
    <>
      <SiteNav />
      <main className="bg-white">
        <SuiteHero
          suite="Pricing"
          titleId="pricing-title"
          title={<>One price a year, for the whole&nbsp;firm.</>}
          body={<p>No per-PC fees and no service packs. Plans differ only in how many GSTINs, TANs and people they cover.</p>}
          price="See every plan"
          priceHref="#plans"
          visual={<PlanStair />}
          footer={<p>Prices are before 18% GST. Every plan starts with a 14-day trial, no card needed.</p>}
        />

        <TrySection
          titleId="fit-title"
          title="Tell us your numbers."
          body={
            <p>
              Count every GSTIN and TAN you file for and everyone who signs in. We show the smallest plan that covers you, and what
              it costs with GST.
            </p>
          }
          demo={<PlanPicker />}
        />

        {/* Plans: what differs, side by side */}
        <section id="plans" className="mx-auto max-w-[1380px] scroll-mt-24 px-6 py-20 sm:px-10 sm:py-28" aria-labelledby="plans-title">
          <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
            <h2 id="plans-title" className="max-w-[30rem] text-[clamp(28px,2.8vw,40px)] font-normal leading-[1.14] tracking-[-0.035em] text-ink lg:col-span-7">
              All four suites, three sizes of firm.
            </h2>
            <p className="max-w-[26rem] text-[14px] leading-[1.6] text-ink-soft lg:col-span-5">
              Every all-in-one plan has GST, TDS, signing and Desk. Prices are for a year, before 18% GST.
            </p>
          </div>

          <div className="mt-12 grid gap-3 md:grid-cols-3">
            {TIERS.map((t) => (
              <article
                key={t.name}
                className={`flex flex-col rounded-[14px] p-6 sm:p-7 ${t.pick ? 'bg-night text-white' : 'bg-mist text-ink'}`}
                aria-label={`${t.name} plan`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[22px] font-medium tracking-[-0.03em]">{t.name}</h3>
                  {t.pick ? <span className="rounded-full bg-mint px-2.5 py-0.5 text-[11.5px] font-medium text-ink">Best for a team</span> : null}
                </div>
                <p className={`mt-1.5 text-[13.5px] ${t.pick ? 'text-white/65' : 'text-ink-soft'}`}>{t.who}</p>
                <p className="mt-8 text-[44px] font-medium leading-none tracking-[-0.05em] tabular-nums">
                  &#8377;{t.price}
                  <span className={`ml-1.5 text-[14px] font-normal tracking-normal ${t.pick ? 'text-white/60' : 'text-ink-soft'}`}>a year</span>
                </p>
                <dl className={`mt-8 space-y-2.5 border-t pt-5 text-[14px] ${t.pick ? 'border-white/15' : 'border-ink/10'}`}>
                  {[
                    ['GSTINs', t.gstins],
                    ['TANs', t.tans],
                    ['People', t.people],
                    ['Support', t.support],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt className={t.pick ? 'text-white/60' : 'text-ink-soft'}>{k}</dt>
                      <dd className="text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
                {t.extra ? <p className={`mt-4 text-[13px] ${t.pick ? 'text-white/70' : 'text-ink-soft'}`}>{t.extra}.</p> : null}
                <div className="mt-auto pt-8">
                  <PillButton href="/signup" tone={t.pick ? 'mint' : 'dark'} full>
                    Start with {t.name}
                  </PillButton>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-14">
            <h3 className="text-[17px] font-medium tracking-[-0.02em] text-ink">Only need one of GST or TDS?</h3>
            <ul className="mt-4 border-b border-hairline">
              {PACKS.map((p) => (
                <li key={p.name} className="grid gap-2 border-t border-hairline py-5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-baseline sm:gap-8">
                  <p className="text-[16px] font-medium tracking-[-0.015em] text-ink">{p.name}</p>
                  <p className="text-[14px] leading-[1.55] text-ink-soft">
                    {p.covers}. {p.note}
                  </p>
                  <p className="text-[20px] font-medium tracking-[-0.03em] tabular-nums text-ink sm:text-right">
                    &#8377;{p.price}
                    <span className="ml-1 text-[13px] font-normal tracking-normal text-ink-soft">a year</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <RulesPanel titleId="every-title" title="In every plan, whatever its size." rules={EVERY_PLAN} />

        <section className="mx-auto max-w-[1380px] px-6 py-20 sm:px-10 sm:py-28" aria-labelledby="faq-title">
          <div className="grid gap-12 lg:grid-cols-12">
            <h2 id="faq-title" className="max-w-[20rem] text-[clamp(28px,2.8vw,40px)] font-normal leading-[1.14] tracking-[-0.035em] text-ink lg:col-span-4">
              Before you decide.
            </h2>
            <div className="lg:col-span-8">
              <Faq items={FAQS} />
            </div>
          </div>
        </section>

        <PriceClose
          titleId="pricing-close"
          title="Try all four suites for 14 days."
          body="Two sample clients are ready when you sign in, so you can see a 2B match or a TDS statement in the first ten minutes. No card needed."
          compare={false}
        />
      </main>
      <LandingFooter />
    </>
  );
}
