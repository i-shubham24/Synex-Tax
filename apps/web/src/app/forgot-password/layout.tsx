import type { Metadata } from 'next';
import { buildPrivateMetadata } from '../../seo/meta';

export const metadata: Metadata = buildPrivateMetadata(
  'Reset Password | SynTax',
  'Reset access to your SynTax firm account safely via verified email and MFA confirmation.',
  '/forgot-password',
);

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
