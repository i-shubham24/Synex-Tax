import type { Metadata } from 'next';
import { SiteNav } from '../../../components/landing/SiteNav';
import { LandingFooter } from '../../../components/landing/LandingFooter';
import { PriceClose, RulesPanel, StairSteps, TrySection } from '../../../components/products/ProductSections';
import { DeskHero, TrailCard } from '../../../components/products/desk/DeskHero';
import { ClientDemo } from '../../../components/products/desk/ClientDemo';
import { JsonLd } from '../../../components/seo/JsonLd';
import { buildPageMetadata, SEO_PAGES } from '../../../seo/meta';
import { buildBreadcrumbSchema, buildSuiteSchema } from '../../../seo/schema';

export const metadata: Metadata = buildPageMetadata(SEO_PAGES.desk);

/** A new client, in the order the firm sets them up. */
const ONBOARD = [
  {
    when: 'Day one',
    title: 'Add the client once',
    body: 'Enter the PAN, then the GSTINs and TANs under it, or import the whole list from Excel. SmartBiz TDS files can come in as they are, and the client is created from them.',
  },
  {
    when: 'Same day',
    title: 'Give the work out',
    body: 'Choose who prepares and who approves. Staff only ever see the clients and the screens a partner gives them.',
  },
  {
    when: 'Every month',
    title: 'Ask for papers',
    body: 'Send a checklist from a template as a link. The client uploads photos or PDFs without a login and each lands on its checklist item. Automated scheduled WhatsApp Cloud API delivery runs once firm WABA templates are enabled; click-to-send WhatsApp links work today.',
    badge: 'Early Access' as const,
  },
  {
    when: 'When the work is done',
    title: 'Bill for it',
    body: 'Raise fee invoices, record receipts and inspect unpaid fee ageing across the firm ledger.',
    badge: 'Early Access' as const,
  },
];

type Can = 'yes' | 'no' | string;
const ACCESS: Array<{ action: string; partner: Can; manager: Can; staff: Can; client: Can }> = [
  { action: 'Prepare returns and statements', partner: 'yes', manager: 'yes', staff: 'Own clients', client: 'no' },
  { action: 'Approve, sign and file', partner: 'yes', manager: 'yes', staff: 'no', client: 'no' },
  { action: 'See a full PAN or bank number, with a logged reason', partner: 'yes', manager: 'yes', staff: 'Own clients', client: 'no' },
  { action: 'Decide who sees which clients and screens', partner: 'yes', manager: 'no', staff: 'no', client: 'no' },
  { action: 'Export the audit trail or all client data', partner: 'yes', manager: 'no', staff: 'no', client: 'no' },
  { action: 'Upload papers and see their own filings', partner: 'yes', manager: 'yes', staff: 'Own clients', client: 'Own only' },
];

function Cell({ v }: { v: Can }) {
  if (v === 'yes') {
    return (
      <span className="inline-flex items-center">
        <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-mint" aria-hidden="true" />
        <span className="sr-only">Allowed</span>
      </span>
    );
  }
  if (v === 'no') {
    return (
      <span className="text-ink-faint">
        <span aria-hidden="true">&ndash;</span>
        <span className="sr-only">Not allowed</span>
      </span>
    );
  }
  return <span className="text-[12.5px] text-ink">{v}</span>;
}

const RECORDS = [
  { rule: 'Every change, kept', what: 'Who changed what, when and from where, with the old and new values. Nobody can switch it off, partners included.' },
  { rule: 'Tamper-evident', what: 'Each entry carries a fingerprint of the one before. A partner can check the whole chain at any time and download it for an auditor.' },
  { rule: 'PAN and bank numbers', what: 'Masked on every screen. Revealing one needs a reason, and the reveal itself is logged.' },
  { rule: 'Client logins', what: 'A client sees their own papers and filings, never another client and never the firm’s screens.' },
  { rule: 'Consent', what: 'Each client’s consent to their data being processed is recorded, in English, Punjabi or Hindi.' },
  { rule: 'Kept for eight years', what: 'Records stay for the eight years the GST and company law ask for, and are not deleted early.' },
];

export default function DeskProductPage() {
  return (
    <>
      <JsonLd
        data={[
          buildSuiteSchema({
            path: '/products/desk',
            name: 'SynTax Desk',
            description: SEO_PAGES.desk.description,
            lowPrice: '8999',
            highPrice: '29999',
            features: RECORDS.map((r) => `${r.rule}: ${r.what}`),
            howToTitle: 'Client onboarding in SynTax Desk',
            howToSteps: ONBOARD.map((s) => ({ name: s.title, text: s.body })),
          }),
          buildBreadcrumbSchema([
            { name: 'Products', path: '/products/desk' },
            { name: 'SynTax Desk', path: '/products/desk' },
          ]),
        ]}
      />
      <SiteNav />
      <main className="bg-white">
        <DeskHero />

        <TrySection
          titleId="try-title"
          title="Open a client and see their month."
          body={
            <p>
              Pick a client on the left. Their registrations, who prepares and who approves, what is due, the papers still
              awaited and any unpaid fee are on one screen.
            </p>
          }
          aside={
            <div>
              <TrailCard />
              <p className="mt-3 max-w-[16rem] text-[12px] leading-[1.5] text-ink-soft">
                Every change lands in the audit trail, and a partner can check that nothing in it has been altered.
              </p>
            </div>
          }
          demo={<ClientDemo />}
        />

        <StairSteps
          titleId="onboard-title"
          title="A new client, from the first call to the first bill."
          aside="Everything here is shared by GST, TDS and Sign. Add a GSTIN once and the GST screens have it; add a TAN once and so do the TDS ones."
          steps={ONBOARD}
        />

        {/* Roles: a matrix is the honest shape for "who can do what" */}
        <section className="mx-auto max-w-[1380px] px-4 py-12 sm:px-10 sm:py-20" aria-labelledby="access-title">
          <div className="grid gap-8 sm:gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 id="access-title" className="max-w-[22rem] text-[clamp(26px,2.8vw,40px)] font-normal leading-[1.14] tracking-[-0.035em] text-ink">
                Who in the firm can do what.
              </h2>
              <p className="mt-4 sm:mt-5 max-w-[22rem] text-[14px] leading-[1.6] text-ink-soft">
                The person who prepares a return is never the one who approves it. A partner can narrow any staff member to
                particular clients and screens.
              </p>
            </div>
            <div className="relative overflow-x-auto lg:col-span-8">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="text-[12.5px] text-ink-soft">
                    <th className="relative pb-3 pr-6 font-normal">
                      <span className="sr-only">Action</span>
                    </th>
                    {['Partner', 'Manager', 'Staff', 'Client'].map((r) => (
                      <th key={r} className="w-[13%] pb-3 font-normal">
                        {r}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ACCESS.map((a) => (
                    <tr key={a.action} className="border-t border-hairline last:border-b">
                      <th scope="row" className="py-4 pr-6 text-[15px] font-medium tracking-[-0.01em] text-ink">
                        {a.action}
                      </th>
                      <td className="py-4"><Cell v={a.partner} /></td>
                      <td className="py-4"><Cell v={a.manager} /></td>
                      <td className="py-4"><Cell v={a.staff} /></td>
                      <td className="py-4"><Cell v={a.client} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <RulesPanel
          titleId="records-title"
          title="Records that will stand up to an audit."
          rules={RECORDS}
          footnote={
            <span className="space-y-2 block">
              <span className="block">
                No-login client document checklists and practice compliance calendars run live inside every workspace today.
              </span>
              <span className="flex flex-wrap items-center gap-2 pt-1">
                <span className="rounded-full border border-ink/15 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink/70">
                  Early Access
                </span>
                <span>Automated WhatsApp Business reminders, client fee ledger ageing, bank statement matching, and AI tax assistant (when a model key is connected).</span>
              </span>
            </span>
          }
        />

        <PriceClose
          titleId="desk-close"
          title="Desk comes with every plan."
          body="The GST + Sign and TDS + Sign packs include Desk Lite. The all-in-one plans, from ₹8,999 a year, include all of Desk for GST and TDS together."
        />
      </main>
      <LandingFooter />
    </>
  );
}
