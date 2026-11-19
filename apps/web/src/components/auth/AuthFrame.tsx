'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { HeroPillars } from '../landing/hero/HeroPillars';
import { ArrowChip, Wordmark } from '../landing/primitives';

const noop = () => {};

/**
 * Auth pages: the hero composition full-bleed. Form card on the left, the live pillar
 * scene on the right. Exactly one screen tall on desktop; spacing scales with the
 * viewport height so short or zoomed windows never scroll or overlap the header.
 */
export function AuthFrame({
  title,
  subtitle,
  children,
  below,
  aside,
  switchLabel,
  switchHref,
}: {
  title: React.ReactNode;
  subtitle: string;
  children: React.ReactNode;
  below?: React.ReactNode;
  aside: React.ReactNode;
  switchLabel: string;
  switchHref: string;
}) {
  const trackRef = useRef<HTMLElement>(null);
  return (
    <main ref={trackRef} className="relative flex min-h-[100svh] flex-col overflow-hidden bg-hero-canvas lg:h-[100svh]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(55% 55% at 80% 35%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 70%), radial-gradient(40% 45% at 22% 55%, rgba(82,176,248,0.08) 0%, rgba(82,176,248,0) 70%)',
        }}
      />

      {/* Live pillars below the header line (desktop only; paused automatically when hidden) */}
      <div className="absolute bottom-0 right-0 top-[76px] hidden w-[52%] lg:block">
        <HeroPillars trackRef={trackRef} onReveal={noop} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[28%] bg-gradient-to-t from-hero-canvas via-hero-canvas/80 to-transparent" />
        <div className="absolute bottom-[7%] left-[4%] z-10">{aside}</div>
      </div>

      <header className="relative z-10 mx-auto flex h-[76px] w-full max-w-[1480px] shrink-0 items-center justify-between px-6 sm:px-10">
        <Link href="/" aria-label="SynexTax home" className="rounded-md">
          <Wordmark className="font-display [&>span:last-child]:text-[22px] [&>span:last-child]:font-semibold [&>span:last-child]:tracking-[-0.035em]" />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-6 font-display text-[15.5px] font-medium tracking-[-0.015em]">
          <Link href="/" className="hidden text-ink/65 transition-colors hover:text-ink sm:inline">
            Back to site
          </Link>
          <Link
            href={switchHref}
            className="rounded-full bg-white px-5 py-2.5 text-[15px] font-semibold tracking-[-0.02em] text-ink shadow-[0_0_0_1px_rgba(20,20,22,0.07),0_8px_20px_-10px_rgba(20,20,22,0.4)] transition-transform hover:-translate-y-px"
          >
            {switchLabel}
          </Link>
        </nav>
      </header>

      {/* min-h-0 + overflow-y-auto: if a window is ever shorter than the form, this area
          scrolls on its own instead of pushing the form under the header. */}
      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1480px] flex-1 overflow-y-auto px-6 sm:px-10">
        <div className="my-auto w-full max-w-[440px] py-[clamp(12px,2.4vh,28px)]">
          <h1 className="font-display text-[clamp(30px,min(3.4vw,5.6vh),48px)] font-semibold leading-[1.04] tracking-hero text-ink">
            {title}
          </h1>
          <p className="mt-[clamp(6px,1vh,10px)] max-w-[25rem] font-display text-[15px] leading-[1.45] tracking-[-0.015em] text-ink/60">
            {subtitle}
          </p>
          <div className="mt-[clamp(14px,2.6vh,24px)] rounded-[28px] bg-white p-[clamp(16px,2.6vh,24px)] shadow-[0_0_0_1px_rgba(20,20,22,0.05),0_30px_60px_-36px_rgba(30,40,90,0.35)]">
            {children}
          </div>
          {below && <div className="mt-[clamp(10px,2vh,18px)] px-1">{below}</div>}
        </div>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------- form parts */

/** Filled pill input with a leading icon. The label is kept for screen readers; the
 *  placeholder carries it visually so each field costs one row, not two. */
export function Field({
  label,
  icon: Icon,
  hint,
  error,
  type = 'text',
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; icon?: LucideIcon; hint?: string; error?: string }) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="group relative">
        {Icon && (
          <Icon
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-ink/35 transition-colors group-focus-within:text-sky-deep"
            strokeWidth={1.9}
          />
        )}
        <input
          id={id}
          type={isPassword && show ? 'text' : type}
          placeholder={props.placeholder ?? label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className={`h-[clamp(42px,5.6vh,48px)] w-full rounded-full border border-transparent bg-[#f3f4f7] font-display text-[15px] tracking-[-0.01em] text-ink outline-none transition-[background-color,border-color,box-shadow] placeholder:text-ink/40 hover:bg-[#eef0f4] focus:border-sky focus:bg-white focus:shadow-[0_0_0_4px_rgba(82,176,248,0.16)] aria-[invalid=true]:border-pos-red aria-[invalid=true]:bg-white ${
            Icon ? 'pl-11' : 'pl-5'
          } ${isPassword || hint ? 'pr-12' : 'pr-5'}`}
          {...props}
        />
        {hint && !isPassword && (
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-display text-[12px] text-ink/40">
            {hint}
          </span>
        )}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink/45 hover:bg-ink/5 hover:text-ink"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-err`} className="mt-1.5 pl-4 font-display text-[12.5px] text-pos-red">
          {error}
        </p>
      )}
    </div>
  );
}

/** Two-option pill switch (e.g. Partner / Staff). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="relative flex rounded-full bg-[#f3f4f7] p-1 font-display text-[14px]">
      <span
        aria-hidden
        className="absolute bottom-1 top-1 rounded-full bg-white shadow-[0_2px_10px_-3px_rgba(20,20,22,0.3)] transition-[left] duration-300 ease-out-expo"
        style={{ width: `calc(${100 / options.length}% - 4px)`, left: `calc(${(options.findIndex((o) => o.value === value) * 100) / options.length}% + 2px)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`relative z-10 h-[clamp(32px,4.4vh,38px)] flex-1 rounded-full font-medium tracking-[-0.01em] transition-colors duration-300 ${
            value === o.value ? 'text-ink' : 'text-ink/50 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Full-width dark pill: label centred, arrow chip on the right (same hover as the site pills). */
export function PrimaryButton({ children, busy, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className="group relative flex h-[clamp(44px,6vh,52px)] w-full items-center justify-center rounded-full bg-ink px-14 font-display text-[16px] font-medium tracking-[-0.02em] text-white shadow-[0_12px_28px_-14px_rgba(20,20,22,0.8),inset_0_1px_0_rgba(255,255,255,0.12)] transition-[background-color,transform] duration-300 hover:bg-black active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
    >
      {children}
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
        <ArrowChip tone="dark" size="sm" />
      </span>
    </button>
  );
}

/** Small outlined pill used for demo sessions under the card. */
export function DemoPill({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="group inline-flex h-9 items-center gap-2 rounded-full bg-white/70 pl-3.5 pr-1 font-display text-[13.5px] font-medium tracking-[-0.01em] text-ink shadow-[0_0_0_1px_rgba(20,20,22,0.09)] transition-all hover:bg-white hover:shadow-[0_0_0_1px_rgba(20,20,22,0.15),0_8px_18px_-10px_rgba(20,20,22,0.35)] disabled:opacity-60"
    >
      {children}
      <ArrowChip tone="light" size="sm" />
    </button>
  );
}
