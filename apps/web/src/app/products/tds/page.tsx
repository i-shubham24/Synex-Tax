import type { Metadata } from 'next';
import { SiteNav } from '../../../components/landing/SiteNav';
import { LandingFooter } from '../../../components/landing/LandingFooter';
import { PriceClose, RulesPanel, StairSteps, TrySection } from '../../../components/products/ProductSections';
import { HealthCard, TdsHero } from '../../../components/products/tds/TdsHero';
import { CutoverDemo } from '../../../components/products/tds/CutoverDemo';
import { JsonLd } from '../../../components/seo/JsonLd';
import { buildPageMetadata, SEO_PAGES } from '../../../seo/meta';
import { buildBreadcrumbSchema, buildSuiteSchema } from '../../../seo/schema';

export const metadata: Metadata = buildPageMetadata(SEO_PAGES.tds);

const QUARTER = [
  {
    when: 'Every month, by the 7th',
    title: 'Deposit the tax',
    body: 'Pay through ITNS 281N, or 281 for 1961-Act months. Upload the bank’s CSI file and each challan is matched by BSR code, serial number and date.',
  },
  {
    when: 'Through the quarter',
    title: 'Keep the rows',
    body: 'Paste or import each month’s payments. Codes, rates, thresholds and PANs are checked as rows come in, and short or late deduction shows the interest it will cost.',
  },
  {
    when: 'By the 31st after the quarter',
    title: 'File the statement',
    body: 'SynTax writes the text file in Protean’s format and opens Protean’s own FVU on your computer to check it. Errors come back against the rows that caused them.',
  },
  {
    when: 'After TRACES processes it',
    title: 'Correct and certify',
    body: 'Import the .conso file to see what TRACES found and write the correction statement. Download Form 130 and 131 certificates from TRACES and sign them in one batch with your DSC.',
  },
];

/** Old numbers to new, as the engine maps them. */
const FORMS: Array<{ what: string; old: string; next: string }> = [
  { what: 'Salary to employees', old: '24Q', next: 'Form 138' },
  { what: 'Payments to residents', old: '26Q', next: 'Form 140' },
  { what: 'Payments to non-residents', old: '27Q', next: 'Form 144' },
  { what: 'Tax collected at source', old: '27EQ', next: 'Form 143' },
  { what: 'Challan', old: 'ITNS 281', next: 'ITNS 281N' },
  { what: 'Validation utility', old: 'FVU 9.5', next: 'FVU 1.2' },
  { what: 'Certificates', old: 'Form 16 and 16A', next: 'Form 130 and 131' },
  { what: 'Employee’s claims', old: 'Form 12BB', next: 'Form 124' },
  { what: 'Lower deduction', old: 'Section 197', next: 'Section 395(1)' },
];

const CHECKS = [
  { rule: 'Interest, month by month', what: '1% a month from when tax should have been deducted until it was, and 1.5% a month from deduction until it was paid. Part of a month counts as a month.' },
  { rule: 'Challans', what: 'Each row is tied to a challan paid after its month began and by the 7th of the next (30 April for March). A challan is never used past its amount.' },
  { rule: 'Rates and thresholds', what: 'Each row is checked against the rate for its code, with the year’s earlier payments to the same payee counted towards the threshold.' },
  { rule: 'Lower-deduction certificates', what: 'A row that claims one must fall within its dates, rate and remaining amount. Past the limit, the normal rate applies again.' },
  { rule: 'PANs', what: 'Missing or invalid PANs are flagged for the higher rate. PANs are masked on screen; a partner or manager can reveal one with a reason, and that is logged.' },
  { rule: 'Corrections', what: 'The TRACES .conso file is compared with your books, and the correction statement follows Protean’s format field by field.' },
];

export default function TdsProductPage() {
  return (
    <>
      <JsonLd
        data={[
          buildSuiteSchema({
            path: '/products/tds',
            name: 'SynTax TDS',
            description: SEO_PAGES.tds.description,
            lowPrice: '4999',
            highPrice: '29999',
            features: CHECKS.map((r) => `${r.rule}: ${r.what}`),
            howToTitle: 'One TDS quarter in SynTax',
            howToSteps: QUARTER.map((s) => ({ name: s.title, text: s.body })),
          }),
          buildBreadcrumbSchema([
            { name: 'Products', path: '/products/tds' },
            { name: 'SynTax TDS', path: '/products/tds' },
          ]),
        ]}
      />
      <SiteNav />
      <main className="bg-white">
        <TdsHero />

        <TrySection
          titleId="try-title"
          title="One payment, either side of 1 April."
          body={
            <p>
              Choose a kind of payment. The same payment made nine days apart lands in a different Act, form, section code,
              challan and FVU, which is where most errors in the first year of the new Act will come from.
            </p>
          }
          aside={
            <div>
              <HealthCard />
              <p className="mt-3 max-w-[16rem] text-[12px] leading-[1.5] text-ink-soft">
                What the quarter&rsquo;s health check shows before you file: short deduction, interest and challan balances.
              </p>
            </div>
          }
          demo={<CutoverDemo />}
        />

        <StairSteps
          titleId="quarter-title"
          title="One TDS quarter, in the order you work it."
          aside="Statements are due 31 July, 31 October, 31 January and 31 May. Tax deducted in March can be paid until 30 April."
          steps={QUARTER}
        />

        {/* Old form numbers to new: a lookup, so a plain three-column table */}
        <section className="mx-auto max-w-[1380px] px-4 py-12 sm:px-10 sm:py-20" aria-labelledby="forms-title">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 id="forms-title" className="max-w-[22rem] text-[clamp(28px,2.8vw,40px)] font-normal leading-[1.14] tracking-[-0.035em] text-ink">
                Every old form has a new number.
              </h2>
              <p className="mt-5 max-w-[22rem] text-[14px] leading-[1.6] text-ink-soft">
                Statements and corrections for FY 2025-26 and earlier stay on the 1961 forms and FVU 9.5, so you will work with
                both sets for years. SynTax keeps both, per deductor, in one place.
              </p>
            </div>
            <div className="overflow-x-auto lg:col-span-8">
              <table className="w-full min-w-[480px] border-collapse text-left">
                <thead>
                  <tr className="text-[12.5px] text-ink-soft">
                    <th className="pb-3 pr-6 font-normal">What it covers</th>
                    <th className="pb-3 pr-6 font-normal">Up to 31 March 2026</th>
                    <th className="pb-3 font-normal">From 1 April 2026</th>
                  </tr>
                </thead>
                <tbody>
                  {FORMS.map((f) => (
                    <tr key={f.what} className="border-t border-hairline last:border-b">
                      <th scope="row" className="py-4 pr-6 text-[15px] font-medium tracking-[-0.01em] text-ink">
                        {f.what}
                      </th>
                      <td className="py-4 pr-6 text-[14px] text-ink-soft">{f.old}</td>
                      <td className="py-4 text-[14px] text-ink">{f.next}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <RulesPanel
          titleId="checks-title"
          title="What every row is checked against."
          rules={CHECKS}
          footnote="Also in SynTax TDS: a salary register with monthly TDS and Form 124 claims, 15CA and 15CB workings for remittances abroad, and an advance tax forecast."
        />

        <PriceClose
          titleId="tds-close"
          title="TDS and DSC signing for ₹4,999 a year."
          body="Up to 25 TANs and three people on the team. Add GST later from inside the app; your deductors and their TANs are already there."
        />
      </main>
      <LandingFooter />
    </>
  );
}
