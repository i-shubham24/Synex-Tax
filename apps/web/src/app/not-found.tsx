import Link from 'next/link';

/** Branded 404 page returned for unknown routes such as /admin or stale links. */
export default function NotFound() {
  return (
    <main className="min-h-[75vh] bg-white px-4 py-16 flex items-center justify-center">
      <div className="w-full max-w-[460px] rounded-3xl border border-[#e7e8ec] bg-[#f7f8fa] p-8 text-center">
        <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-[#e7e8ec] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#55565c]">
          <span className="h-2 w-2 rounded-full bg-[#141416]" />
          404 · Route not found
        </div>
        <h1 className="text-[28px] leading-[1.15] font-medium tracking-[-0.02em] text-[#141416]">
          This page does not exist
        </h1>
        <p className="mt-3 text-[14px] leading-[1.6] text-[#55565c]">
          The link may be outdated, or that path is not part of SynTax. Head back to the site or sign in to your firm workspace.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-full bg-[#141416] px-5 text-[13.5px] font-medium text-white transition hover:bg-[#232326]"
          >
            Back to home
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-full border border-[#e7e8ec] bg-white px-5 text-[13.5px] font-medium text-[#141416] transition hover:bg-[#f4f5f7]"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
