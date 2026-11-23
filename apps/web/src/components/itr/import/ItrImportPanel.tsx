'use client';

import React, { useState } from 'react';
import { FileUp } from 'lucide-react';
import { EarlierReturnCard } from './EarlierReturnCard';
import { AisCompareCard } from './AisCompareCard';
import type { PageValues } from './importShared';

/** Imports that save retyping: last year's return to carry forward, and the AIS to check the figures against. */
export function ItrImportPanel({ values, onApply }: { values: PageValues; onApply: (patch: PageValues) => void }) {
  const [tab, setTab] = useState<'earlier' | 'ais'>('earlier');
  return (
    <section className="pos-card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-pos-ink"><FileUp className="h-4 w-4 text-pos-accent" /> Import</h2>
        <div className="flex gap-2" role="tablist">
          {([['earlier', "Last year's return"], ['ais', 'AIS']] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`rounded-full px-3 py-1.5 text-[13px] ${tab === k ? 'bg-pos-accent text-white' : 'border border-pos-line text-pos-ink/75 hover:bg-pos-tint'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[13px] text-pos-ink/65">
        {tab === 'earlier'
          ? "Carries the client's details, losses brought forward and recurring schedules from last year's return into this year's."
          : 'Compares every line of the Annual Information Statement with the figures entered above and lists what is missing from the return.'}
      </p>
      <div hidden={tab !== 'earlier'}><EarlierReturnCard values={values} onApply={onApply} /></div>
      <div hidden={tab !== 'ais'}><AisCompareCard values={values} onApply={onApply} /></div>
    </section>
  );
}
