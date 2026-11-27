import type { Metadata } from 'next';
import { buildPrivateMetadata } from '../../../seo/meta';

export const metadata: Metadata = buildPrivateMetadata(
  'Team Invitation | SynTax',
  'Accept your SynTax CA team invitation and configure two-step authenticator protection for your firm login.',
  '/invite',
);

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
