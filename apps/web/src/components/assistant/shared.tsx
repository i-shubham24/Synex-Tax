'use client';

import React from 'react';

export const inputCls = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
export const areaCls = 'w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 py-2 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
export const btnCls = 'inline-flex h-9 items-center gap-2 rounded-[10px] bg-pos-accent px-4 text-[13px] font-semibold text-white disabled:opacity-50';
export const ghostCls = 'inline-flex h-9 items-center gap-2 rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] font-medium text-pos-ink/80 hover:bg-pos-muted disabled:opacity-50';

export const inr = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);

export interface CitationView {
  act: string;
  section: string;
  rows?: Array<{ act2025: string; act1961: string; topic: string; src: string }>;
  gst?: { act: string; section: string; topic: string };
}

/** Sections the answer cites, as found in the mapping table, and those removed as unverifiable. */
export function Citations({ citations, removed }: { citations: CitationView[]; removed: Array<{ section: string }> }) {
  if (!citations.length && !removed.length) return null;
  return (
    <div className="mt-2 space-y-1 text-[12px] text-pos-ink/65">
      {citations.length > 0 && (
        <div>
          <span className="font-medium text-pos-ink/80">Sections, from the mapping table: </span>
          {citations.map((c, i) => (
            <span key={`${c.act}-${c.section}-${i}`}>
              {i > 0 ? '; ' : ''}
              {c.gst ? (
                <>{c.gst.act} Act section <span className="font-mono">{c.gst.section}</span> ({c.gst.topic})</>
              ) : (
                (c.rows ?? []).slice(0, 2).map((r, j) => (
                  <span key={j}>{j > 0 ? ', ' : ''}2025 Act <span className="font-mono">{r.act2025}</span> / 1961 Act <span className="font-mono">{r.act1961}</span> ({r.topic})</span>
                ))
              )}
            </span>
          ))}
        </div>
      )}
      {removed.length > 0 && (
        <div className="text-[#b45309]">
          Removed as not verifiable: {removed.map((r) => <span key={r.section} className="font-mono">section {r.section} </span>)}
        </div>
      )}
    </div>
  );
}

export function DraftNote({ children }: { children?: React.ReactNode }) {
  return <p className="rounded-[10px] border border-pos-line bg-pos-muted px-3 py-2 text-[12px] text-pos-ink/70">{children ?? 'Drafts from a language model, for the CA to check. Not advice. Only sections found in the mapping table are shown; others are removed and listed.'}</p>;
}

/** Opens HTML in a new window for printing. */
export function openPrintable(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank', 'noopener');
  if (!w) window.location.assign(url);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function errorText(r: Response): Promise<string> {
  const b = await r.json().catch(() => ({}));
  return (b as { message?: string }).message ?? 'Something went wrong. Try again.';
}
