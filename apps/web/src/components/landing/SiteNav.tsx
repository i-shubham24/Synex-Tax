'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu, X, ReceiptText, Percent, KeyRound, Building2, Sparkles } from 'lucide-react';
import { PillButton, Wordmark } from './primitives';

interface ProductItem {
  name: string;
  href: string;
  tagline: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRODUCTS: ProductItem[] = [
  {
    name: 'SynTax GST',
    href: '/products/gst',
    tagline: 'Dirty Excel cleaner, 4-pass 2B recon, IMS console & hard-locked 3B set-off',
    icon: ReceiptText,
  },
  {
    name: 'SynTax TDS',
    href: '/products/tds',
    tagline: 'Dual-Act cutover router, ITNS 281N 20-section challans & isolated FVU farm',
    icon: Percent,
  },
  {
    name: 'SynTax Sign',
    href: '/products/sign',
    tagline: 'Zero-Java Go 1.27 USB DSC agent, FIPS 140-3 detection & batch PAdES signing',
    icon: KeyRound,
  },
  {
    name: 'SynTax Desk',
    href: '/products/desk',
    tagline: 'Unified 4-tier Client Master, 10-min migration wizard, MCA Rule 3(6) & DPDP consent',
    icon: Building2,
  },
];

const ROADMAP_PREVIEWS = [
  { name: 'SynTax Direct', desc: 'ITR-1 to 6, AIS/TIS & Capital Gains' },
  { name: 'SynTax Litigate', desc: 'ASMT-10/DRC-01 & AI Reply Drafter' },
];

type Theme = 'light' | 'dark';

/**
 * Fixed, fully transparent site header. Instead of a backdrop it reads the surface under
 * it (sections marked data-nav-theme="dark") and flips its ink between dark and white.
 */
export function SiteNav() {
  const headerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const base = pathname === '/' ? '' : '/';
  const [theme, setTheme] = useState<Theme>('light');
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  // The bar stays on screen and stays transparent; its text colour follows the section under it.
  // Once the page scrolls, a soft blur band sits behind it so content passing under the links blurs out.
  const [blurred, setBlurred] = useState(false);
  const dropdownRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const under = new Set<Element>();
    let themeIO: IntersectionObserver | null = null;
    const buildThemeIO = () => {
      themeIO?.disconnect();
      under.clear();
      const bottomInset = Math.max(0, window.innerHeight - 76);
      themeIO = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => (e.isIntersecting ? under.add(e.target) : under.delete(e.target)));
          setTheme(under.size > 0 ? 'dark' : 'light');
        },
        { rootMargin: `0px 0px -${bottomInset}px 0px`, threshold: 0 },
      );
      document.querySelectorAll('[data-nav-theme="dark"]').forEach((el) => themeIO!.observe(el));
    };
    buildThemeIO();

    // Only a threshold is tracked, so React re-renders twice per page at most, not on every frame.
    const onScroll = () => setBlurred(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', buildThemeIO);

    return () => {
      themeIO?.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', buildThemeIO);
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProductsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const dark = theme === 'dark' && !open;
  const isProductsActive = pathname.startsWith('/products');

  return (
    <header
      ref={headerRef}
      className="fixed inset-x-0 top-0 z-50 bg-transparent"
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 -z-10 h-[108px] transition-opacity duration-300 ${blurred && !open ? 'opacity-100' : 'opacity-0'}`}
        style={{
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          maskImage: 'linear-gradient(to bottom, #000 45%, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 45%, transparent)',
        }}
      />
      <div className="mx-auto flex h-[76px] max-w-[1480px] items-center justify-between px-6 sm:px-10">
        <Link href="/" aria-label="SynTax home" className="rounded-md">
          <Wordmark
            tone={dark ? 'paper' : 'ink'}
            className="font-display [&>span:last-child]:text-[22px] [&>span:last-child]:font-semibold [&>span:last-child]:tracking-[-0.035em] [&>span:last-child]:transition-colors [&>span:last-child]:duration-500"
          />
        </Link>

        {/* Desktop Navigation */}
        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-1 font-display text-[15.5px] font-medium tracking-[-0.015em]">
            {/* Products Interactive Dropdown */}
            <li className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setProductsOpen((o) => !o)}
                onMouseEnter={() => setProductsOpen(true)}
                aria-expanded={productsOpen}
                className={`relative flex items-center gap-1.5 rounded-full px-4 py-2 transition-colors duration-300 ${
                  dark
                    ? isProductsActive
                      ? 'text-white'
                      : 'text-white/70 hover:text-white'
                    : isProductsActive
                      ? 'text-ink'
                      : 'text-ink/70 hover:text-ink'
                }`}
              >
                <span>Products</span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${productsOpen ? 'rotate-180' : ''}`} />
                {isProductsActive && (
                  <span
                    aria-hidden
                    className={`absolute bottom-1 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full ${
                      dark ? 'bg-mint' : 'bg-ink'
                    }`}
                  />
                )}
              </button>

              {/* Dropdown Menu */}
              {productsOpen && (
                <div
                  onMouseLeave={() => setProductsOpen(false)}
                  className="absolute left-0 top-full mt-2 w-[460px] rounded-2xl border border-ink/10 bg-white p-3 shadow-[0_20px_50px_-15px_rgba(14,15,16,0.25)] ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 duration-150 z-50 text-ink"
                >
                  <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink/40">
                    Core Product Suites
                  </div>
                  <div className="grid gap-1">
                    {PRODUCTS.map((p) => {
                      const Icon = p.icon;
                      return (
                        <Link
                          key={p.name}
                          href={p.href}
                          onClick={() => setProductsOpen(false)}
                          className="flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-slate-50 group"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-subtle text-sky-deep group-hover:bg-sky group-hover:text-ink transition-colors">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-display text-[14.5px] font-semibold text-ink group-hover:text-sky-deep transition-colors">
                                {p.name}
                              </span>
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-[12px] text-ink/65 font-normal">
                              {p.tagline}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>

                  {/* Roadmap Section */}
                  <div className="mt-2 border-t border-ink/5 pt-2">
                    <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink/40">
                      <span>Phase 3 Roadmap</span>
                      <span className="flex items-center gap-1 text-mint font-medium normal-case tracking-normal text-[11px]">
                        <Sparkles className="h-3 w-3" /> Coming soon
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 px-1">
                      {ROADMAP_PREVIEWS.map((r) => (
                        <div key={r.name} className="rounded-lg p-2 bg-slate-50/60">
                          <p className="text-[12.5px] font-semibold text-ink/80">{r.name}</p>
                          <p className="text-[11px] text-ink/50 leading-snug mt-0.5">{r.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </li>

            <li>
              <Link
                href="/switch"
                className={`relative block rounded-full px-4 py-2 transition-colors duration-300 ${
                  dark ? 'text-white/70 hover:text-white' : 'text-ink/70 hover:text-ink'
                }`}
              >
                Why Switch
              </Link>
            </li>

            <li>
              <Link
                href="/pricing"
                className={`relative block rounded-full px-4 py-2 transition-colors duration-300 ${
                  dark ? 'text-white/70 hover:text-white' : 'text-ink/70 hover:text-ink'
                }`}
              >
                Pricing
              </Link>
            </li>

            <li>
              <a
                href={`${base}#pilot`}
                className={`relative block rounded-full px-4 py-2 transition-colors duration-300 ${
                  dark ? 'text-white/70 hover:text-white' : 'text-ink/70 hover:text-ink'
                }`}
              >
                Pilot
              </a>
            </li>

          </ul>
        </nav>

        {/* Action CTAs */}
        <div className="hidden items-center gap-4 lg:flex">
          <Link
            href="/login"
            className={`font-display text-[15.5px] font-medium tracking-[-0.015em] transition-colors duration-300 ${
              dark ? 'text-white/75 hover:text-white' : 'text-ink/70 hover:text-ink'
            }`}
          >
            Sign in
          </Link>
          <PillButton href="/contact" size="sm" tone={dark ? 'light' : 'dark'} className="hidden xl:inline-flex">
            Book a demo
          </PillButton>
          <PillButton href="/signup" size="sm" tone="mint">
            Start 14-day free trial
          </PillButton>
        </div>

        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-300 lg:hidden ${
            dark ? 'bg-white text-ink' : 'bg-ink text-white'
          }`}
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {/* Mobile menu sheet */}
      {open && (
        <div className="mx-3 rounded-[24px] bg-white p-5 shadow-[0_24px_60px_-24px_rgba(20,20,22,0.45)] lg:hidden max-h-[85vh] overflow-y-auto">
          <div className="text-[12px] font-semibold text-ink/40 uppercase tracking-wider mb-2">
            Product Suites
          </div>
          <ul className="space-y-1 font-display text-[16px] font-medium tracking-[-0.02em] border-b border-ink/10 pb-4 mb-4">
            {PRODUCTS.map((p) => (
              <li key={p.name}>
                <Link
                  href={p.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-xl px-3 py-2 text-ink hover:bg-slate-50"
                >
                  <span>{p.name}</span>
                  <span className="text-[11px] text-ink/45">Explore</span>
                </Link>
              </li>
            ))}
          </ul>

          <ul className="space-y-1 font-display text-[16px] font-medium tracking-[-0.02em]">
            <li>
              <Link href="/switch" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 text-ink/80 hover:bg-slate-50">
                Why Switch
              </Link>
            </li>
            <li>
              <Link href="/pricing" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 text-ink/80 hover:bg-slate-50">
                Pricing
              </Link>
            </li>
            <li>
              <a href={`${base}#pilot`} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 text-ink/80 hover:bg-slate-50">
                Pilot
              </a>
            </li>
            <li>
              <Link href="/login" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 text-ink/80 hover:bg-slate-50">
                Sign in
              </Link>
            </li>
          </ul>

          <div className="mt-5 space-y-2">
            <PillButton href="/signup" full tone="mint">
              Start 14-day free trial
            </PillButton>
            <PillButton href="/contact" full tone="light">
              Book a demo
            </PillButton>
          </div>
        </div>
      )}
    </header>
  );
}
