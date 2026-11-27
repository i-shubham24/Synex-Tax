import type { Metadata } from 'next';
import { connection } from 'next/server';
import { WorkspaceLayout } from './WorkspaceLayoutClient';
import { buildPrivateMetadata } from '../../seo/meta';

export const metadata: Metadata = buildPrivateMetadata(
  'Workspace | SynTax',
  'Private firm compliance workspace for GST, dual-Act TDS, FVU validation and local USB DSC signing.',
  '/dashboard',
);

/**
 * Signed-in pages render per request, so each carries the nonce of the strict script policy set in
 * src/proxy.ts. Public pages (home, login, sign-up, features) stay prebuilt for speed.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await connection();
  return <WorkspaceLayout>{children}</WorkspaceLayout>;
}
