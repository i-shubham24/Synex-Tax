'use client';

import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

/** A file picker that also takes a dropped file. */
export function FileDrop({ label, hint, busy, onFile }: { label: string; hint: string; busy: boolean; onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      className={`flex flex-wrap items-center gap-3 rounded-[12px] border border-dashed px-4 py-3 ${over ? 'border-pos-accent bg-pos-tint' : 'border-pos-line'}`}
    >
      <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="inline-flex items-center gap-2 rounded-full bg-pos-accent px-4 py-2 text-[13px] text-white disabled:opacity-50">
        <Upload className="h-4 w-4" /> {busy ? 'Reading' : label}
      </button>
      <span className="text-[12px] text-pos-ink/60">{hint}</span>
      <input ref={ref} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </div>
  );
}
