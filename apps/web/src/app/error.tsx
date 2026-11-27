'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/** Global error boundary so unexpected UI errors never expose stack traces or raw internals. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep technical details in browser console only during development.
    if (process.env.NODE_ENV !== 'production') {
      console.error('Unhandled page error:', error);
    }
  }, [error]);

  return (
    <main className="min-h-[75vh] bg-white px-4 py-16 flex items-center justify-center">
      <div className="w-full max-w-[460px] rounded-3xl border border-[#e7e8ec] bg-[#f7f8fa] p-8 text-center">
        <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-[#e7e8ec] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#55565c]">
          <span className="h-2 w-2 rounded-full bg-[#e23b3b]" />
          Unexpected interruption
        </div>
        <h1 className="text-[26px] leading-[1.15] font-medium tracking-[-0.02em] text-[#141416]">
          We could not load this screen
        </h1>
        <p className="mt-3 text-[14px] leading-[1.6] text-[#55565c]">
          Your ledger and filings were not affected. Try loading the screen again or return home.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-[#55565c]">Reference: {error.digest}</p>
        )}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-11 items-center rounded-full bg-[#141416] px-5 text-[13.5px] font-medium text-white transition hover:bg-[#232326]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-full border border-[#e7e8ec] bg-white px-5 text-[13.5px] font-medium text-[#141416] transition hover:bg-[#f4f5f7]"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
