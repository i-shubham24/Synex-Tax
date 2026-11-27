'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';

/** Questions people ask before paying, answered plainly. One open at a time. */
export function Faq({ items }: { items: Array<{ q: string; a: string }> }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ul className="border-b border-hairline">
      {items.map((f, i) => {
        const isOpen = open === i;
        return (
          <li key={f.q} className="border-t border-hairline">
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-start justify-between gap-4 py-3.5 sm:py-4 text-left text-[15px] sm:text-[16px] font-medium tracking-[-0.015em] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
              >
                {f.q}
                <Plus className={`mt-1 h-4 w-4 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`} aria-hidden />
              </button>
            </h3>
            <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <p className="overflow-hidden pr-10 text-[14.5px] leading-[1.65] text-ink-soft">
                <span className="block pb-5">{f.a}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
