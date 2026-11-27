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
    body: 'Pay through ITNS 281N across the 20 new 2025-Act payment sections, or 281 for 1961-Act months. Upload the bank’s CSI file to match by BSR code, serial number and date.',
  },
  {
    when: 'Through the quarter',
    title: 'Keep the rows',
    body: 'Paste or import each month’s payments. Codes, rates, thresholds, Aadhaar-PAN operative status (20% higher rate check) and short deduction interest are checked automatically.',
  },
  {
    when: 'By the 31st after the quarter',
    title: 'Validate & sign',
    body: 'DSC signing runs natively on your PC with zero Java; Protean FVU validation runs automatically in an isolated validation engine with row-level error jump (desktop FVU launch optional).',
  },
  {
    when: 'After TRACES processes it',
    title: 'Correct and certify',
    body: 'Import the .conso file to build correction statements. Use TRACES’ official utility or signed .zip download: SynTax verifies every PDF signature and PAN match, then dispatches expiring payee links with open-tracking.',
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

const CHECKS: Array<{ rule: string; what: string; badge?: 'Early Access' | 'Coming Q1 2027' }> = [
  { rule: 'Interest, month by month', what: '1% a month from when tax should have been deducted until it was, and 1.5% a month from deduction until it was paid. Part of a month counts as a month.' },
  { rule: 'ITNS 281N challan matching', what: 'Supports the 20 new Income-tax Act, 2025 payment sections alongside 1961 Act ITNS 281 challans, matched by BSR, serial and date without over-allocating balance.' },
  { rule: 'Rates and thresholds', what: 'Each row is checked against the rate for its code, with the year’s earlier payments to the same payee counted towards the threshold.' },
  { rule: 'Lower-deduction certificates', what: 'Validates Section 395 / 395(1) / 395(2) certificates for TY 2026-27+ and Section 197 for FY 2025-26 and earlier against dates, rate and remaining limit.' },
  { rule: 'Inoperative Aadhaar-PAN & 20% check', what: 'Verifies PAN operative status against Aadhaar linkage and flags missing, invalid or inoperative PANs for the mandatory 20% higher deduction rate.' },
  { rule: 'Corrections & FVU engine', what: 'The TRACES .conso file is compared with your books, and the statement compiler matches Protean’s FVU v1.2 (2025 Act) and v9.5 (1961 Act) schemas field by field.' },
  { rule: 'Form 15CA / 15CB workings & Advance tax', what: 'Remittance 15CA/15CB classification worksheets and quarterly Section 234B/234C advance tax forecasting with e-Filing portal sync.', badge: 'Early Access' },
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
          aside="TDS statements (Forms 138, 140, 144) and TY 2026-27 Form 143 TCS are due 31 July, 31 October, 31 January and 31 May (legacy 1961-Act Form 27EQ TCS stays due on the 15th after Q1 to Q3, and 15 May for Q4). March deductions deposit by 30 April."
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
          footnote={
            <span>
              Also in SynTax TDS: a salary register with monthly TDS and Form 124 claims. Note on TCS: legacy Form 27EQ falls due on the 15th (15 July, 15 Oct, 15 Jan, 15 May), while TY 2026-27 Form 143 aligns to the 31st (15 May for Q4 under Rule schedule verification).{' '}
              <span className="inline-block rounded-full border border-ink/15 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink/70">
                Early Access
              </span>{' '}
              15CA/15CB portal JSON push and automated advance tax challan sync.
            </span>
          }
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
