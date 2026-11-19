'use client';

import { useEffect, useRef, useState } from 'react';

/** Popover anchored to a wrapper element; closes on outside pointer-down and Escape. */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export const panelClass =
  'absolute top-[calc(100%+10px)] z-50 overflow-hidden rounded-[18px] bg-pos-surface shadow-[0_0_0_1px_rgb(var(--pos-line)),0_24px_60px_-20px_rgba(10,20,40,0.35)]';

export const iconButtonClass =
  'relative flex h-10 w-10 items-center justify-center rounded-full border border-pos-line bg-pos-surface/70 text-pos-ink transition-colors hover:bg-pos-tint aria-expanded:bg-pos-tint';
