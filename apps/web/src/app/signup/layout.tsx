import type { Metadata } from 'next';
import { buildPrivateMetadata } from '../../seo/meta';

export const metadata: Metadata = buildPrivateMetadata(
  'Start Trial | SynTax',
  'Create your SynTax chartered accountant firm workspace and begin your 14-day multi-suite compliance trial.',
  '/signup',
);

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
