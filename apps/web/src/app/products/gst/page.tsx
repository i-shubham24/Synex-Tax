import type { Metadata } from 'next';
import { SiteNav } from '../../../components/landing/SiteNav';
import { LandingFooter } from '../../../components/landing/LandingFooter';
import { GstHero, SplitCard } from '../../../components/products/gst/GstHero';
import { MatchDemo } from '../../../components/products/gst/MatchDemo';
import { PriceClose, RulesPanel, StairSteps, TrySection } from '../../../components/products/ProductSections';

export const metadata: Metadata = {
  title: 'SynTax GST | Purchase register and GSTR-2B matching, IMS and GSTR-3B',
  description:
    'Upload the Tally or Busy purchase register as exported, match it with the GSTR-2B download, act on IMS before the 14th and draft GSTR-3B with Rule 88A set-off.',
};

/** Where every purchase invoice ends up after matching, and what it means for this month's 3B. */
const OUTCOMES: Array<{ found: string; means: string; tone: 'claim' | 'check' | 'hold' }> = [
  { found: 'Exact match', means: 'Claim it this month.', tone: 'claim' },
  { found: 'Same invoice, written differently', means: 'Claim it. Slashes, the year and leading zeros are evened out, and up to ₹1 of rounding is allowed.', tone: 'claim' },
  { found: '2B says credit not available', means: 'Matched, but kept out of the claim. The 2B reason is shown against it.', tone: 'check' },
  { found: 'Dated in another month', means: 'Probably the same document. Confirm before claiming.', tone: 'check' },
  { found: 'Value or tax heads differ', means: 'Held back. The difference is shown so you can take it up with the supplier.', tone: 'hold' },
  { found: 'Booked as a different document', means: 'An invoice in your books is a debit note in 2B, or the reverse. Fix the booking.', tone: 'hold' },
  { found: 'In your books, not in 2B', means: 'Held back until the supplier files.', tone: 'hold' },
  { found: 'In 2B, not in your books', means: 'Credit you may be missing. Book it, or reject it in IMS if it isn’t yours.', tone: 'check' },
];

const DOT = { claim: 'bg-mint', check: 'bg-sky', hold: 'bg-ink' } as const;

/** Rules the 3B draft follows. Only what the engine actually enforces. */
const RULES = [
  { rule: 'Rule 88A', what: 'IGST credit is used first, then CGST and SGST. CGST credit never pays SGST, or the other way round.' },
  { rule: 'Rule 86B', what: 'When taxable supplies cross ₹50 lakh in a month, at least 1% of the output tax is paid in cash, unless the client is exempt.' },
  { rule: 'Section 17(5)', what: 'Purchases that look like motor vehicles, food or catering are marked as blocked credit when the register comes in.' },
  { rule: 'Rules 42 and 43', what: 'Common credit is split between taxable and exempt supplies for inputs and capital goods, with the reversal worked out.' },
  { rule: 'Filed months', what: 'Once a month’s return is saved on the portal or filed, its purchase register can no longer be changed.' },
  { rule: 'TDS hand-off', what: 'Contractor, rent and professional bills above the TDS limits are flagged for the TDS desk.' },
];

const MONTH = [
  {
    when: '1st to 10th',
    title: 'Bring in the registers',
    body: 'Upload the purchase and sales registers exactly as Tally or Busy exports them. Title rows, page breaks, totals and round-off lines are skipped, repeated rows are counted once, and any row that can’t be used is listed with the reason.',
  },
  {
    when: 'By the 11th',
    title: 'GSTR-1',
    body: 'B2B, B2CL and B2CS lines are built from the sales register, credit notes netted off. Corrections after filing go through GSTR-1A.',
  },
  {
    when: 'By the 14th',
    title: 'Act on IMS',
    body: 'Accept, reject or keep pending each supplier document, largest first. If you change anything after 2B is generated, SynTax asks for 2B to be recomputed before 3B.',
  },
  {
    when: 'By the 20th',
    title: 'GSTR-3B',
    body: 'Drafted from your books and the matched 2B. Credit is set off in the Rule 88A order, the 1% cash rule is checked, and a partner approves before it goes out.',
  },
];

export default function GstProductPage() {
  return (
    <>
      <SiteNav />
      <main className="bg-white">
        <GstHero />

        <TrySection
          titleId="try-title"
          title="Pick an invoice and see how it is matched."
          body={
            <p>
              Five cases from a November 2B, the kind every register has. The highlighted fields are the ones that differ, and
              the strip at the bottom says what to do.
            </p>
          }
          aside={
            <div>
              <SplitCard />
              <p className="mt-3 max-w-[16rem] text-[12px] leading-[1.5] text-ink-soft">
                A sample client&rsquo;s November credit after matching: what to claim now, what is held back and what waits for next month.
              </p>
            </div>
          }
          demo={<MatchDemo />}
        />

        <StairSteps
          titleId="month-title"
          title="One GST month, in the order you work it."
          aside="Dates are for monthly filers. Quarterly (QRMP) clients get IFF by the 13th and a PMT-06 challan by the 25th of the first two months, worked out by the 35% fixed-sum or the self-assessment method."
          steps={MONTH}
        />

        {/* Outcomes: a reference list, so a quiet table rather than cards */}
        <section className="mx-auto max-w-[1380px] px-6 py-20 sm:px-10 sm:py-28" aria-labelledby="outcomes-title">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 id="outcomes-title" className="max-w-[22rem] text-[clamp(28px,2.8vw,40px)] font-normal leading-[1.14] tracking-[-0.035em] text-ink">
                Every invoice ends up in one of eight places.
              </h2>
              <p className="mt-5 max-w-[22rem] text-[14px] leading-[1.6] text-ink-soft">
                Each register line and each 2B document is counted once, so the totals for claim, check and hold add up to
                your books.
              </p>
              <ul className="mt-8 space-y-2 text-[13px] text-ink">
                <li className="flex items-center gap-2.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-mint" /> Goes into this month’s claim</li>
                <li className="flex items-center gap-2.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-sky" /> Needs a look before claiming</li>
                <li className="flex items-center gap-2.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-ink" /> Held back for now</li>
              </ul>
            </div>
            <div className="lg:col-span-8">
              <table className="w-full border-collapse text-left">
                <thead className="sr-only">
                  <tr>
                    <th>What the match found</th>
                    <th>What it means for GSTR-3B</th>
                  </tr>
                </thead>
                <tbody>
                  {OUTCOMES.map((o) => (
                    <tr key={o.found} className="border-t border-hairline align-top last:border-b">
                      <th scope="row" className="w-[42%] py-5 pr-6 text-[15px] font-medium tracking-[-0.01em] text-ink">
                        <span className="flex items-start gap-3">
                          <span className={`mt-[7px] h-2.5 w-2.5 shrink-0 rounded-[2px] ${DOT[o.tone]}`} aria-hidden />
                          {o.found}
                        </span>
                      </th>
                      <td className="py-5 text-[14px] leading-[1.55] text-ink-soft">{o.means}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <RulesPanel
          titleId="rules-title"
          title="The rules your 3B draft already follows."
          rules={RULES}
          footnote="Also in SynTax GST: GSTR-9 and 9C annual workings, ITC-04 for job work, and CMP-08 and GSTR-4 for composition clients."
        />

        <PriceClose
          titleId="gst-close"
          title="GST and DSC signing for ₹5,999 a year."
          body="Up to 50 GSTINs and three people on the team. Add TDS later from inside the app; your clients and their GSTINs are already there."
        />
      </main>
      <LandingFooter />
    </>
  );
}
