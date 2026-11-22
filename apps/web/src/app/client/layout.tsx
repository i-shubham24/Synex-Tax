'use client';

import React from 'react';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

/** The client portal's own frame: the firm's name, who is signed in, and sign out. */
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();

  let body: React.ReactNode = children;
  if (isLoading) body = <p className="py-16 text-center text-[13.5px] text-pos-ink/55">Checking your session</p>;
  else if (!isAuthenticated)
    body = (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-[22px] font-semibold text-pos-ink">Sign in to see your documents</h1>
        <p className="mt-2 text-[13.5px] text-pos-ink/60">Use the email and password from your CA&apos;s invitation.</p>
        <Link href="/login" className="mt-5 inline-flex h-10 items-center rounded-full bg-pos-accent px-5 text-[13.5px] font-medium text-white">Sign in</Link>
      </div>
    );
  else if (user?.role !== 'CLIENT')
    body = (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-[22px] font-semibold text-pos-ink">This portal is for your clients</h1>
        <p className="mt-2 text-[13.5px] text-pos-ink/60">Your firm login opens the workspace instead.</p>
        <Link href="/dashboard" className="mt-5 inline-flex h-10 items-center rounded-full bg-pos-accent px-5 text-[13.5px] font-medium text-white">Go to the workspace</Link>
      </div>
    );

  return (
    <div className="pos-root min-h-screen bg-pos-muted text-pos-ink">
      <header className="pos-header border-b bg-pos-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{user?.role === 'CLIENT' ? user.firmName : 'Client portal'}</p>
            {user?.role === 'CLIENT' && <p className="truncate text-[12px] text-pos-ink/55">Signed in as {user.fullName}</p>}
          </div>
          {isAuthenticated && (
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.replace('/login');
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-pos-line px-3 py-1.5 text-[12.5px] text-pos-ink/70 hover:bg-pos-muted"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{body}</main>
    </div>
  );
}
