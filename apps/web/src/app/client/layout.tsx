import { connection } from 'next/server';
import { ClientLayout } from './ClientLayoutClient';

/**
 * Signed-in pages render per request, so each carries the nonce of the strict script policy set in
 * src/proxy.ts. Public pages (home, login, sign-up, features) stay prebuilt for speed.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await connection();
  return <ClientLayout>{children}</ClientLayout>;
}
