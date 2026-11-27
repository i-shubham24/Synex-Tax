import type { Metadata } from 'next';
import Link from 'next/link';
import { Bullets, LegalPage, type LegalSection } from '../../components/legal/LegalPage';
import { LEGAL } from '../../lib/legal';
import { JsonLd } from '../../components/seo/JsonLd';
import { buildPageMetadata, SEO_PAGES } from '../../seo/meta';
import { buildBreadcrumbSchema } from '../../seo/schema';

export const metadata: Metadata = buildPageMetadata(SEO_PAGES.terms);

const SECTIONS: LegalSection[] = [
  {
    id: 'agreement',
    title: 'The agreement',
    body: (
      <p>
        These terms are an agreement between {LEGAL.company} (&ldquo;we&rdquo;) and the firm or business that creates a{' '}
        {LEGAL.product} workspace (&ldquo;you&rdquo;). The person who signs up confirms they can accept them for that firm. Our{' '}
        <Link href="/privacy" className="text-sky-deep underline-offset-4 hover:underline">
          privacy notice
        </Link>{' '}
        forms part of these terms.
      </p>
    ),
  },
  {
    id: 'service',
    title: 'What the service does',
    body: (
      <>
        <p>
          {LEGAL.product} helps you prepare, reconcile, validate, approve and file GST and TDS returns, and keeps the records
          and audit trail behind them. It connects to government systems through authorised channels such as GST Suvidha
          Providers, NIC and Protean.
        </p>
        <p>
          {LEGAL.product} is software, not tax or legal advice. Your firm remains responsible for the returns it files, for
          checking figures before approval, and for the advice it gives its clients.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Accounts and access',
    body: (
      <Bullets
        items={[
          'Each user has their own login with multi-factor sign-in. Do not share logins.',
          'Partners decide who sees which clients and who can approve filings.',
          'You are responsible for activity under your workspace and must tell us promptly about any unauthorised access.',
        ]}
      />
    ),
  },
  {
    id: 'trial-and-plans',
    title: 'Trial, plans and payment',
    body: (
      <>
        <p>
          New workspaces get a 14 day trial on up to 3 clients, with no card required. Paid plans are billed yearly: Solo
          practitioner ₹8,999, Growth firm ₹15,999 and Scale practice ₹29,999, plus GST at 18%.
        </p>
        <p>
          Plans renew at the end of each term unless cancelled before renewal. Recurring payments follow RBI e-mandate rules,
          including advance notice before each debit. Fees already paid are not refundable for a term that has started, unless
          the law requires otherwise.
        </p>
      </>
    ),
  },
  {
    id: 'your-data',
    title: 'Your data',
    body: (
      <>
        <p>
          You own the data you put into {LEGAL.product}. For your clients&apos; personal data, your firm is the Data Fiduciary
          under the DPDP Act and we process it only to provide the service and as you instruct. You confirm you have the
          consents or legal basis needed to upload it.
        </p>
        <p>
          You can export your data at any time. Bulk exports of the client list are limited to partners and are logged.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <Bullets
        items={[
          'Use the service only for lawful compliance work for your own firm and its clients.',
          'Do not try to reach another firm’s data, probe or overload the service, or get around its security controls.',
          'Do not upload malware, or data you have no right to hold.',
          'Do not resell or white-label the service without a written agreement with us.',
        ]}
      />
    ),
  },
  {
    id: 'government-systems',
    title: 'Government portals and signing',
    body: (
      <>
        <p>
          Filing depends on systems we do not run, such as the GST portal, NIC and TRACES. Their outages, rule changes and
          rejections are outside our control; we show their status and retry where it is safe to.
        </p>
        <p>
          Digital signatures happen on your computer through the local signer. You keep custody of DSC tokens and their PINs.
        </p>
      </>
    ),
  },
  {
    id: 'availability',
    title: 'Availability and changes',
    body: (
      <p>
        We work to keep the service available, especially around filing deadlines, and announce planned maintenance in
        advance. We improve the service over time and will not remove a core feature of your plan during a paid term without
        notice and a fair alternative.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Responsibility and limits',
    body: (
      <>
        <p>
          We are responsible for providing the service with reasonable care and skill. We are not liable for indirect or
          consequential losses, or for penalties, interest or late fees that result from figures you approved or from
          government systems being unavailable.
        </p>
        <p>
          Our total liability for any claim is limited to the fees you paid us in the 12 months before the claim arose. Nothing
          in these terms limits liability that cannot be limited under Indian law.
        </p>
      </>
    ),
  },
  {
    id: 'ending',
    title: 'Ending the agreement',
    body: (
      <p>
        You can cancel at any time; access continues until the end of the paid term. We may suspend or end access for serious
        breach of these terms after notice where possible. After the agreement ends you have 30 days to export your data. We
        then delete it, except records the law requires us to keep or that are under a legal hold.
      </p>
    ),
  },
  {
    id: 'law',
    title: 'Law and disputes',
    body: (
      <p>
        These terms are governed by the laws of India. We will first try to settle any dispute by talking. Failing that, the
        courts at {LEGAL.courts} have jurisdiction.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: (
      <p>
        We will email account holders at least 30 days before a material change takes effect. Continuing to use the service
        after that date means you accept the updated terms.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <>
      <JsonLd data={buildBreadcrumbSchema([{ name: 'Terms of service', path: '/terms' }])} />
      <LegalPage
        eyebrow="Terms of service"
        title="Plain terms for using SynTax."
        summary={
          <p>
            What we provide, what your firm stays responsible for, how billing works and what happens to your data if you leave.
            Written to be read, not skimmed past.
          </p>
        }
        sections={SECTIONS}
      />
    </>
  );
}
