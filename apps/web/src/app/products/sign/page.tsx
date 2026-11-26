import type { Metadata } from 'next';
import { SiteNav } from '../../../components/landing/SiteNav';
import { LandingFooter } from '../../../components/landing/LandingFooter';
import { PriceClose, RulesPanel, StairSteps, TrySection } from '../../../components/products/ProductSections';
import { SignHero, TokensCard } from '../../../components/products/sign/SignHero';
import { SignDemo } from '../../../components/products/sign/SignDemo';

export const metadata: Metadata = {
  title: 'SynTax Sign | DSC signing with your USB token, without Java',
  description:
    'A small Windows app signs approved returns with the Class 3 DSC on your USB token. The token driver asks for the PIN, SynTax never sees it. Also checks and sends Form 130 and 131 certificates, runs Protean FVU and backs up Tally data.',
};

/** Certificates season, from TRACES to the payee. SynTax never makes the PDFs. */
const CERTIFICATES = [
  {
    when: 'When TRACES has them ready',
    title: 'Request and download',
    body: 'Request Form 130 and 131 certificates on TRACES for the quarter and download the zip, as you do today.',
  },
  {
    when: 'On your PC',
    title: 'Convert and sign',
    body: 'Run TRACES’ own PDF converter, which signs each certificate with your DSC. Save the PDFs into SynTax’s certificates folder.',
  },
  {
    when: 'Before anything is sent',
    title: 'Checked',
    body: 'The app reads every PDF in that folder, finds the PAN in its file name and holds back any certificate that carries no signature.',
  },
  {
    when: 'Same day',
    title: 'Sent to each payee',
    body: 'Each payee gets their own certificate by email or WhatsApp through a link that expires. You see who opened it and when.',
  },
];

/** The other jobs the same app does on the office PC. */
const ALSO = [
  {
    title: 'Runs Protean’s FVU',
    body: 'Saves the statement into a fresh folder, opens Protean’s own FVU window there, and reads back the .fvu file or the error report.',
  },
  {
    title: 'Backs up Tally, Busy and Marg',
    body: 'Copies the company data into dated zip files with a checksum for each file, and picks up the newest Zoho Books or Vyapar backup. Files the software has open are reported, not skipped.',
  },
  {
    title: 'Listens to nobody else',
    body: 'It only answers on this computer and only to the SynTax website. It cannot be pointed at your other files.',
  },
];

const SAFEGUARDS = [
  { rule: 'The PIN', what: 'Typed into the token driver’s window. The SynTax app never receives it, stores it or sends it anywhere.' },
  { rule: 'The private key', what: 'Never leaves the token. The app asks Windows to sign, and the token does the signing.' },
  { rule: 'What gets signed', what: 'Only the fingerprint of a return SynTax named in a request it signed itself, valid for two minutes and usable once.' },
  { rule: 'The certificate', what: 'Its chain is checked up to the CCA India root before the signature is accepted.' },
  { rule: 'The record', what: 'Every signature, cancel and wrong PIN goes into the tamper-evident audit trail, with who approved the return.' },
  { rule: 'Expiry', what: 'Each token in the office register shows the days it has left, so renewals happen before a filing date, not on it.' },
];

export default function SignProductPage() {
  return (
    <>
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

        <section className="mx-auto max-w-[1380px] px-6 py-20 sm:px-10 sm:py-28" aria-labelledby="also-title">
          <div className="grid gap-12 lg:grid-cols-12">
            <h2 id="also-title" className="max-w-[22rem] text-[clamp(28px,2.8vw,40px)] font-normal leading-[1.14] tracking-[-0.035em] text-ink lg:col-span-4">
              The same app does three more jobs.
            </h2>
            <div className="grid gap-10 sm:grid-cols-3 lg:col-span-8">
              {ALSO.map((a) => (
                <div key={a.title} className="border-t border-ink pt-4">
                  <h3 className="text-[17px] font-medium tracking-[-0.02em] text-ink">{a.title}</h3>
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
