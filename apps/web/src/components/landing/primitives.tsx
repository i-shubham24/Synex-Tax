'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import React, { useMemo } from 'react';
import { SynTaxMark } from '../brand/SynTaxLogo';

/* ------------------------------------------------------------------ Logo */
export function LogoMark({ size = 30, tone = 'ink' }: { size?: number; tone?: 'ink' | 'paper' }) {
  return <SynTaxMark size={size} />;
}

export function Wordmark({ tone = 'ink', className = '' }: { tone?: 'ink' | 'paper'; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={32} tone={tone} />
      <span className={`text-[22px] font-semibold tracking-[-0.03em] ${tone === 'ink' ? 'text-ink' : 'text-white'}`}>
        SynTax
      </span>
    </span>
  );
}

/* --------------------------------------------------------------- Eyebrow */
export function StepMark({ tone = 'mint' }: { tone?: 'mint' | 'sky' }) {
  const a = tone === 'mint' ? '#5fe88a' : '#52b0f8';
  const b = tone === 'mint' ? '#a8f2c0' : '#a9d6fb';
  return (
    <svg width="20" height="9" viewBox="0 0 20 9" aria-hidden className="shrink-0">
      <rect x="0" y="4" width="9" height="5" fill={a} />
      <rect x="9" y="0" width="11" height="5" fill={b} />
      <rect x="9" y="4" width="4" height="5" fill={a} />
    </svg>
  );
}

export function Eyebrow({
  children,
  tone = 'mint',
  dark = false,
}: {
  children: React.ReactNode;
  tone?: 'mint' | 'sky';
  dark?: boolean;
}) {
  return (
    <p className={`flex items-center gap-2.5 text-[11px] font-medium tracking-eyebrow ${dark ? 'text-white/80' : 'text-ink'}`}>
      <StepMark tone={tone} />
      {children}
    </p>
  );
}

/* ----------------------------------------------------------- Pixel field */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Scattered square "pixels" in the corner of a block, as on the TaxMate cards.
 * Deterministic (seeded) so server and client render the same markup.
 */
export function PixelField({
  seed = 1,
  count = 34,
  cell = 14,
  cols = 16,
  rows = 9,
  color = '#ffffff',
  maxOpacity = 0.28,
  anchor = 'right',
}: {
  seed?: number;
  count?: number;
  cell?: number;
  cols?: number;
  rows?: number;
  color?: string;
  maxOpacity?: number;
  anchor?: 'right' | 'left' | 'full';
}) {
  const items = useMemo(() => {
    const rand = mulberry32(seed);
    const used = new Set<string>();
    const out: Array<{ x: number; y: number; o: number }> = [];
    for (let i = 0; i < count * 3 && out.length < count; i++) {
      // Bias toward the anchored edge so the texture fades across the block.
      const bias = anchor === 'full' ? rand() : Math.pow(rand(), 0.55);
      const cx = anchor === 'left' ? Math.floor((1 - bias) * cols * 0.999) : Math.floor(bias * cols * 0.999);
      const cy = Math.floor(rand() * rows);
      const key = `${cx}:${cy}`;
      if (used.has(key)) continue;
      used.add(key);
      const o = (0.25 + rand() * 0.75) * maxOpacity * (anchor === 'full' ? 1 : 0.35 + bias * 0.65);
      rand(); // keep the sequence identical to the previous renderer
      out.push({ x: cx, y: cy, o: Number(o.toFixed(3)) });
    }
    return out;
  }, [seed, count, cols, rows, maxOpacity, anchor]);

  // One SVG per block instead of one positioned node per pixel: far cheaper to lay out and paint.
  const w = cols * cell;
  const h = rows * cell;
  return (
    <svg
      className="pixel-field"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ left: anchor === 'left' ? 0 : 'auto', right: anchor === 'left' ? 'auto' : 0, inset: 'auto', top: 0, width: w, height: h }}
      aria-hidden
    >
      {items.map((p, i) => (
        <rect key={i} x={p.x * cell} y={p.y * cell} width={cell - 2} height={cell - 2} fill={color} fillOpacity={p.o} />
      ))}
    </svg>
  );
}

/* ---------------------------------------------------------- Pill button */
type PillTone = 'dark' | 'light' | 'mint' | 'sky';

const PILL_BODY: Record<PillTone, string> = {
  dark: 'bg-ink text-white shadow-[0_12px_28px_-14px_rgba(20,20,22,0.8),inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-black',
  light: 'bg-white text-ink shadow-[0_0_0_1px_rgba(20,20,22,0.08),0_10px_24px_-14px_rgba(20,20,22,0.45)] hover:bg-[#fafafa]',
  mint: 'bg-mint text-ink shadow-[0_12px_28px_-14px_rgba(60,200,110,0.9)] hover:bg-mint-hover',
  sky: 'bg-sky text-white shadow-[0_12px_28px_-14px_rgba(82,176,248,0.9)] hover:bg-sky-hover',
};
const PILL_CHIP: Record<PillTone, string> = {
  dark: 'bg-mint text-ink',
  light: 'bg-ink text-white',
  mint: 'bg-ink text-mint',
  sky: 'bg-white text-sky-deep',
};

/** The arrow chip: on hover the arrow exits top-right while a fresh one slides in from bottom-left. */
export function ArrowChip({ tone = 'dark', size = 'md' }: { tone?: PillTone; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-11 w-11' : size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  const icon = size === 'lg' ? 'h-[18px] w-[18px]' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <span
      aria-hidden
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full transition-transform duration-500 ease-out-expo ${box} ${PILL_CHIP[tone]}`}
    >
      <ArrowUpRight
        className={`${icon} transition-transform duration-500 ease-out-expo group-hover:-translate-y-[160%] group-hover:translate-x-[160%] motion-reduce:transition-none`}
        strokeWidth={2.2}
      />
      <ArrowUpRight
        className={`${icon} absolute -translate-x-[160%] translate-y-[160%] transition-transform duration-500 ease-out-expo group-hover:translate-x-0 group-hover:translate-y-0 motion-reduce:transition-none`}
        strokeWidth={2.2}
      />
    </span>
  );
}

export function PillButton({
  href,
  children,
  tone = 'dark',
  size = 'md',
  onClick,
  type = 'button',
  full = false,
  disabled,
  className = '',
}: {
  href?: string;
  children: React.ReactNode;
  tone?: PillTone;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  type?: 'button' | 'submit';
  full?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const pad =
    size === 'lg' ? 'h-14 gap-4 pl-7 pr-1.5 text-[16.5px]' : size === 'sm' ? 'h-10 gap-3 pl-4 pr-1.5 text-[13.5px]' : 'h-12 gap-3.5 pl-5 pr-1.5 text-[14.5px]';
  const cls = `group inline-flex items-center rounded-full font-display font-medium tracking-[-0.015em] transition-[background-color,transform,box-shadow] duration-300 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 ${
    full ? 'w-full justify-between' : ''
  } ${pad} ${PILL_BODY[tone]} ${className}`;
  const inner = (
    <>
      <span className="whitespace-nowrap">{children}</span>
      <ArrowChip tone={tone} size={size} />
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

/** Kept for existing call sites: now a pill with the arrow chip. */
export function SplitButton({
  href,
  children,
  tone = 'dark',
  accent = 'mint',
  onClick,
}: {
  href?: string;
  children: React.ReactNode;
  tone?: 'dark' | 'light';
  accent?: 'mint' | 'sky';
  onClick?: () => void;
}) {
  const t: PillTone = accent === 'sky' ? 'sky' : tone;
  return (
    <PillButton href={href} onClick={onClick} tone={t}>
      {children}
    </PillButton>
  );
}

/* -------------------------------------------------------------- Chips */
export function Chips({ items, dark = false, more }: { items: string[]; dark?: boolean; more?: number }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <li
          key={c}
          className={`rounded-full border px-2.5 py-[3px] text-[11px] ${
            dark ? 'border-white/35 text-white/85' : 'border-ink/70 text-ink'
          }`}
        >
          {c}
        </li>
      ))}
      {more ? (
        <li className={`rounded-full border px-2 py-[3px] text-[11px] ${dark ? 'border-white/35 text-white/85' : 'border-ink/70 text-ink'}`}>
          +{more}
        </li>
      ) : null}
    </ul>
  );
}

/** Stat with a small superscript accent, e.g. 125+ or 92,7%. */
export function Stat({
  value,
  sup,
  label,
  dark = false,
  supTone = 'mint',
  size = 'md',
}: {
  value: string;
  sup?: string;
  label: string;
  dark?: boolean;
  supTone?: 'mint' | 'sky';
  size?: 'md' | 'lg';
}) {
  return (
    <div>
      <p
        className={`flex items-start font-normal leading-none tracking-[-0.045em] ${dark ? 'text-white' : 'text-ink'} ${
          size === 'lg' ? 'text-[56px]' : 'text-[40px]'
        }`}
      >
        <span>{value}</span>
        {sup ? (
          <span
            className={`ml-1 mt-[0.02em] font-normal tracking-[-0.02em] ${sup.length > 1 ? 'text-[15px]' : 'text-[22px]'} ${
              supTone === 'mint' ? 'text-mint' : 'text-sky'
            }`}
          >
            {sup}
          </span>
        ) : null}
      </p>
      <p className={`mt-2 text-[11px] ${dark ? 'text-white/55' : 'text-ink-soft'}`}>{label}</p>
    </div>
  );
}
