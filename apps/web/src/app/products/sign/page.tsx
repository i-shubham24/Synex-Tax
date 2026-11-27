import type { Metadata } from 'next';
import { SiteNav } from '../../../components/landing/SiteNav';
import { LandingFooter } from '../../../components/landing/LandingFooter';
import { PriceClose, RulesPanel, StairSteps, TrySection } from '../../../components/products/ProductSections';
import { SignHero, TokensCard } from '../../../components/products/sign/SignHero';
import { SignDemo } from '../../../components/products/sign/SignDemo';
import { JsonLd } from '../../../components/seo/JsonLd';
import { buildPageMetadata, SEO_PAGES } from '../../../seo/meta';
import { buildBreadcrumbSchema, buildSuiteSchema } from '../../../seo/schema';

export const metadata: Metadata = buildPageMetadata(SEO_PAGES.sign);

/** Certificates season, from TRACES to the payee. SynTax never makes the PDFs. */
const CERTIFICATES = [
  {
    when: 'When TRACES has them ready',
    title: 'Request and download',
    body: 'Request Form 130 and 131 certificates on TRACES for the quarter and download the official .zip file, as you do today.',
  },
  {
    when: 'On your PC',
    title: 'Convert with TRACES utility',
    body: 'Use TRACES’ official PDF converter or signed .zip download to generate each DSC-signed PDF into SynTax’s certificates folder.',
  },
  {
    when: 'Before anything is sent',
    title: 'Verify signature & PAN',
    body: 'SynTax verifies every PDF digital signature and PAN match, holding back any unsigned or mismatched file before dispatch.',
  },
  {
    when: 'Same day',
    title: 'Trackable payee delivery',
    body: 'Dispatch per payee by email or WhatsApp link with expiring download URLs and open-tracking.',
  },
];

/** The other jobs the same workspace and local agent do. */
const ALSO: Array<{ title: string; body: string; badge?: 'Early Access' | 'Coming Q1 2027' }> = [
  {
    title: 'Zero-Java DSC + isolated FVU',
    body: 'DSC signing runs natively on your PC with zero Java; Protean FVU validation runs automatically in an isolated validation engine with row-level error jump (local desktop FVU runner mode is also supported).',
  },
  {
    title: 'Tally, Busy, Marg, Zoho & Vyapar backups',
    body: 'Schedules dated backups for Tally, Busy and Marg plus Zoho Books and Vyapar exports with SHA-256 checksums once paired via the local desktop agent.',
    badge: 'Early Access',
  },
  {
    title: 'Listens to nobody else',
    body: 'The local signer only answers on 127.0.0.1 and only to signed SynTax challenges. It cannot be pointed at your other files.',
  },
];

const SAFEGUARDS = [
  { rule: 'The PIN', what: 'Typed into the token driver’s window. The SynTax app never receives it, stores it or sends it anywhere.' },
  { rule: 'The private key', what: 'Never leaves the token. The app asks Windows to sign, and the token does the signing.' },
  { rule: 'What gets signed', what: 'Only the fingerprint of a return SynTax named in a request it signed itself, valid for two minutes and usable once.' },
  { rule: 'The certificate', what: 'Its chain is checked up to the CCA India root before the signature is accepted.' },
  { rule: 'The record', what: 'Every signature, cancel and wrong PIN goes into the tamper-evident audit trail, with who approved the return.' },
  { rule: 'Token Radar & FIPS 140-3', what: 'Each token shows days left before expiry and flags FIPS 140-2 Level 2/3 hardware tokens due for FIPS 140-3 Level 3 renewal.' },
];

export default function SignProductPage() {
  return (
    <>
      <JsonLd
        data={[
          buildSuiteSchema({
            path: '/products/sign',
            name: 'SynTax Sign',
            description: SEO_PAGES.sign.description,
            lowPrice: '4999',
            highPrice: '29999',
            features: SAFEGUARDS.map((r) => `${r.rule}: ${r.what}`),
            howToTitle: 'Sign and verify certificates in SynTax',
            howToSteps: CERTIFICATES.map((s) => ({ name: s.title, text: s.body })),
          }),
          buildBreadcrumbSchema([
            { name: 'Products', path: '/products/sign' },
            { name: 'SynTax Sign', path: '/products/sign' },
          ]),
        ]}
      />
      <SiteNav />
      <main className="bg-white">
        <SignHero />

        <TrySection
          titleId="try-title"
          title="Sign one return, start to finish."
          body={
            <p>
              Press the button to walk through a real signature. The PIN window that appears belongs to the token&rsquo;s driver,
              which is why SynTax never sees what you type. Try Cancel too.
            </p>
          }
          aside={
            <div>
              <TokensCard />
              <p className="mt-3 max-w-[16rem] text-[12px] leading-[1.5] text-ink-soft">
                Every token kept in the office, with the days it has left, so a renewal never lands on a filing date.
              </p>
            </div>
          }
          demo={<SignDemo />}
        />

        <StairSteps
          titleId="certs-title"
          title="TDS certificates, from TRACES to the payee."
          aside="SynTax never creates certificates. It works with the PDFs TRACES produced and you signed, and checks them before they go out."
          steps={CERTIFICATES}
        />

        <section className="mx-auto max-w-[1380px] px-4 py-12 sm:px-10 sm:py-20" aria-labelledby="also-title">
          <div className="grid gap-12 lg:grid-cols-12">
            <h2 id="also-title" className="max-w-[22rem] text-[clamp(28px,2.8vw,40px)] font-normal leading-[1.14] tracking-[-0.035em] text-ink lg:col-span-4">
              The same app does three more jobs.
            </h2>
            <div className="grid gap-10 sm:grid-cols-3 lg:col-span-8">
              {ALSO.map((a) => (
                <div key={a.title} className="border-t border-ink pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[17px] font-medium tracking-[-0.02em] text-ink">{a.title}</h3>
                    {a.badge ? (
                      <span className="rounded-full border border-ink/15 bg-mist px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink/70">
                        {a.badge}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2.5 text-[14px] leading-[1.6] text-ink-soft">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <RulesPanel
          titleId="safe-title"
          title="Where the PIN, the key and the record live."
          rules={SAFEGUARDS}
          footnote="Signing works on Windows, where Indian token drivers register their certificates. Install the app on each office PC that holds tokens; there is no per-PC fee."
        />

        <PriceClose
          titleId="sign-close"
          title="Signing comes with every plan."
          body="GST + Sign from ₹5,999 a year, TDS + Sign from ₹4,999, or all four suites from ₹8,999. Unlimited signatures in each."
        />
      </main>
      <LandingFooter />
    </>
  );
}
