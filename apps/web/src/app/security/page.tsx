import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureGroups, MarketingPage } from '../../components/marketing/MarketingPage';
import { JsonLd } from '../../components/seo/JsonLd';
import { buildPageMetadata, SEO_PAGES } from '../../seo/meta';
import { buildBreadcrumbSchema } from '../../seo/schema';

export const metadata: Metadata = buildPageMetadata(SEO_PAGES.security);

export default function SecurityPage() {
  return (
    <>
      <JsonLd data={buildBreadcrumbSchema([{ name: 'Security', path: '/security' }])} />
      <MarketingPage
      eyebrow="Security"
      title="Your clients’ data, walled off and logged."
      summary={
        <p>
          A CA firm holds PANs, bank details and filing rights for hundreds of businesses. This page lists the controls that
          protect them, each marked with whether it works today. Privacy terms are in the{' '}
          <Link href="/privacy" className="underline decoration-ink/30 underline-offset-4 hover:decoration-ink">privacy notice</Link>.
        </p>
      }
    >
      <FeatureGroups
        groups={[
          {
            id: 'isolation',
            title: 'Each firm walled off',
            items: [
              { title: 'Separation in the database', body: 'Every query is limited to your firm by the database itself, not only by application code. Our test suite tries forged, expired and replayed access on every change.', status: 'live' },
              { title: 'Staff see their own clients', body: 'Partners see the whole firm. Managers and staff see only the clients or groups assigned to them.', status: 'live' },
              { title: 'Signed request context', body: 'Each request carries a signed, short-lived identity. A tampered or missing signature means the request sees nothing.', status: 'live' },
            ],
          },
          {
            id: 'access',
            title: 'Sign-in and sessions',
            items: [
              { title: 'Two-factor sign-in', body: 'An authenticator app code on every sign-in, with single-use recovery codes.', status: 'live' },
              { title: 'Strong password storage', body: 'Passwords are hashed with Argon2id. Repeated wrong passwords lock the account for 15 minutes.', status: 'live' },
              { title: 'Sessions that can be ended', body: 'Session tokens rotate on use and are kept out of reach of page scripts. Signing out ends the session on our side too.', status: 'live' },
            ],
          },
          {
            id: 'control',
            title: 'Who can do what',
            items: [
              { title: 'Maker and checker', body: 'Staff prepare. Only a partner, or a manager the partner has authorised, can mark a return filed, and never one they prepared.', status: 'live' },
              { title: 'Filed periods locked', body: 'Once a return is saved on the portal or filed, its invoices and deductee rows cannot be added to, edited or deleted.', status: 'live' },
              { title: 'Partner-only client import', body: 'Adding clients in bulk is limited to partners, and every row is checked before it is saved.', status: 'live' },
            ],
          },
          {
            id: 'evidence',
            title: 'Evidence you can show',
            items: [
              { title: 'Append-only change log', body: 'Every change to clients, registrations, invoices, challans and returns is recorded with who made it and when. The application cannot edit or delete the log.', status: 'live' },
              { title: 'Masked identifiers', body: 'Client PANs are masked on screen. Seeing the full value needs a reason, and every reveal is logged before it is shown.', status: 'live' },
              { title: 'Signing trail', body: 'Every signing attempt is recorded against the return it was for. If it cannot be recorded, the signing is refused.', status: 'live' },
            ],
          },
          {
            id: 'never',
            title: 'What we never hold',
            items: [
              { title: 'Portal passwords', body: 'We do not ask for or store GST, income tax or TRACES passwords. Portal access uses the official API consent you can revoke.', status: 'live' },
              { title: 'Aadhaar numbers', body: 'Full 12-digit Aadhaar numbers are never stored.', status: 'live' },
              { title: 'DSC PINs and keys', body: 'Signing happens on your own computer through the small SynTax signing app. The token’s driver asks for the PIN, and the private key never leaves the token.', status: 'live' },
            ],
          },
          {
            id: 'hosting',
            title: 'Where it runs',
            items: [
              { title: 'Hosting in India', body: 'Production in AWS Mumbai with an encrypted standby copy in AWS Hyderabad. Client data is not moved outside India.', status: 'coming' },
              { title: 'No outside analytics or AI on client data', body: 'No advertising or tracking scripts. Client personal data is never sent to analytics or AI services outside India.', status: 'live' },
            ],
          },
        ]}
      />
      <p className="mt-20 border-t border-ink/15 pt-6 text-[15px] leading-[1.6] text-ink">
        Found a security issue? Write to us through the{' '}
        <Link href="/contact" className="underline decoration-ink/30 underline-offset-4 hover:decoration-ink">contact page</Link> and choose
        Privacy. Reports are answered before anything else.
      </p>
      </MarketingPage>
    </>
  );
}
