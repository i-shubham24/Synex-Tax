import type { Metadata } from 'next';
import { buildPrivateMetadata } from '../../seo/meta';

export const metadata: Metadata = buildPrivateMetadata(
  'Sign In | SynTax',
  'Sign in to your SynTax chartered accountant practice workspace with multi-factor authentication.',
  '/login',
);

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
