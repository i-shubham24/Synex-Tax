import type { Metadata } from 'next';
import Link from 'next/link';
import { Bullets, LegalPage, type LegalSection } from '../../components/legal/LegalPage';
import { LEGAL } from '../../lib/legal';
import { JsonLd } from '../../components/seo/JsonLd';
import { buildPageMetadata, SEO_PAGES } from '../../seo/meta';
import { buildBreadcrumbSchema } from '../../seo/schema';

export const metadata: Metadata = buildPageMetadata(SEO_PAGES.privacy);

const mail = (address: string) => (
  <a className="text-sky-deep underline-offset-4 hover:underline" href={`mailto:${address}`}>
    {address}
  </a>
);

const SECTIONS: LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are and our role',
    body: (
      <>
        <p>
          {LEGAL.product} is built and operated by {LEGAL.company}, {LEGAL.city}. It is software that CA practices, tax
          advocates and businesses use to prepare and file GST and TDS returns.
        </p>
        <p>
          Under the Digital Personal Data Protection Act, 2023 (DPDP Act) we play two roles. For your own account (your name,
          email, mobile and firm details) we are the <strong>Data Fiduciary</strong>. For the client records your firm
          uploads (client PANs, GSTINs, invoices, deductee details) your firm is the Data Fiduciary and we act as its{' '}
          <strong>Data Processor</strong>, handling that data only on your firm&apos;s instructions.
        </p>
      </>
    ),
  },
  {
    id: 'what-we-collect',
    title: 'What we collect',
    body: (
      <Bullets
        items={[
          <>
            <strong>Account data:</strong> name, work email, mobile number, firm name, ICAI firm registration number and your role
            in the firm.
          </>,
          <>
            <strong>Client data your firm uploads:</strong> legal and trade names, PAN, GSTIN, TAN, contact persons, invoices,
            challans, deductee records and filing acknowledgements.
          </>,
          <>
            <strong>Security and usage data:</strong> sign-in events, IP address, browser type, and an audit log of changes and
            of every time a masked value such as a PAN or bank number is revealed.
          </>,
          <>
            <strong>Billing data:</strong> plan, invoices and payment status. Card and UPI details are handled by the payment
            provider; we do not store them.
          </>,
        ]}
      />
    ),
  },
  {
    id: 'never-collect',
    title: 'What we never collect',
    body: (
      <Bullets
        items={[
          'Passwords for the GST portal, the income tax portal or TRACES. Portal access runs through official API consent, which you can revoke on the portal at any time.',
          'Full 12 digit Aadhaar numbers.',
          'DSC token PINs or private keys. Signing happens on your own computer through the local signer, and the key never leaves the token.',
        ]}
      />
    ),
  },
  {
    id: 'why-we-use-it',
    title: 'Why we use it',
    body: (
      <>
        <Bullets
          items={[
            'To run the service: prepare, reconcile, validate and file returns your team asks us to.',
            'To keep accounts secure: multi-factor sign-in, fraud checks and the audit trail.',
            'To send service messages: filing reminders, approval requests and statutory notices, in English, Punjabi or Hindi.',
            'To bill for the plan you choose and meet our own tax obligations.',
            'To comply with law, court orders and directions from authorities such as CERT-In.',
          ]}
        />
        <p>
          We rely on your consent, or on the legitimate uses the DPDP Act allows, such as complying with law. We do not sell
          personal data, use it for advertising, or train AI models on your clients&apos; records.
        </p>
      </>
    ),
  },
  {
    id: 'where-it-lives',
    title: 'Where your data lives',
    body: (
      <p>
        Data is stored and processed in India: {LEGAL.dataRegion}. We do not send personal data to analytics or AI services
        outside India.
      </p>
    ),
  },
  {
    id: 'who-we-share-with',
    title: 'Who we share it with',
    body: (
      <>
        <p>Only the parties needed to do what you ask:</p>
        <Bullets
          items={[
            'GST Suvidha Providers and the GST Network, to save and file GST returns.',
            'The NIC e-invoice and e-way bill systems, when you generate an IRN or e-way bill.',
            'Protean and the Income Tax Department, for TDS statements and TRACES services.',
            'Our hosting, messaging and payment providers, bound by contract to protect the data.',
            'Authorities, when the law requires it.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'security',
    title: 'How we protect it',
    body: (
      <Bullets
        items={[
          'Encryption in transit and at rest.',
          'Each firm’s data is walled off from every other firm at the database level.',
          'Staff see only the clients assigned to them. Partners approve filings that staff prepare.',
          'PAN and bank numbers are masked by default; every reveal needs a reason and is logged.',
          'Exporting the full client list is limited to partners and every export is logged.',
          'An append-only audit trail of changes that the application cannot edit or delete.',
        ]}
      />
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    body: (
      <>
        <p>
          Tax law decides most of this. GST records are kept until 72 months after the due date of the annual return for the
          year (CGST Act, section 36). Company books are kept for eight financial years (Companies Act, section 128). Income
          tax records are kept for the period income-tax law requires.
        </p>
        <p>
          Records under a notice, appeal or litigation hold are kept until the matter closes. After that, data is deleted or
          anonymised. When a firm leaves, it can export its data first.
        </p>
      </>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights',
    body: (
      <>
        <p>Under the DPDP Act you can:</p>
        <Bullets
          items={[
            'Get a summary of the personal data we process about you.',
            'Have inaccurate data corrected or completed.',
            'Ask us to erase data we no longer need, except where the law requires us to keep it.',
            'Withdraw consent at any time. This stops future processing that depends on it.',
            'Nominate someone to exercise these rights if you are unable to.',
            'Raise a grievance with us, and then with the Data Protection Board of India.',
          ]}
        />
        <p>
          If you are a client of a firm that uses {LEGAL.product}, please contact that firm first; we will help it respond.
        </p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and browser storage',
    body: (
      <p>
        We use only what the service needs: a session to keep you signed in, and browser storage for preferences such as
        light or dark mode. There are no advertising or third party tracking cookies.
      </p>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: <p>{LEGAL.product} is for professionals and businesses. We do not knowingly create accounts for anyone under 18.</p>,
  },
  {
    id: 'breaches',
    title: 'If something goes wrong',
    body: (
      <p>
        If a breach affects personal data, we will inform the affected firms and people and the Data Protection Board as the
        DPDP Act requires, and report cyber incidents to CERT-In within the time its directions set.
      </p>
    ),
  },
  {
    id: 'grievance',
    title: 'Grievance Officer',
    body: (
      <p>
        {LEGAL.grievanceOfficer}, {LEGAL.city}. Email {mail(LEGAL.emails.grievance)}. We acknowledge every grievance and aim
        to resolve it within 30 days. For anything else about privacy, write to {mail(LEGAL.emails.privacy)} or visit the{' '}
        <Link href="/contact" className="text-sky-deep underline-offset-4 hover:underline">
          contact page
        </Link>
        .
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this notice',
    body: <p>When we change this notice we update the date above, and we tell account holders by email before a material change applies.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <>
      <JsonLd data={buildBreadcrumbSchema([{ name: 'Privacy notice', path: '/privacy' }])} />
      <LegalPage
        eyebrow="Privacy notice"
        title="Your clients’ data stays in India, and in your control."
        summary={
          <p>
            What we collect, why, where it is stored and the rights you have under the Digital Personal Data Protection Act,
            2023. We never ask for portal passwords, Aadhaar numbers or DSC PINs.
          </p>
        }
        sections={SECTIONS}
      />
    </>
  );
}
