'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { PillButton, Wordmark } from './primitives';

const LINKS: Array<{ label: string; id: string; page?: string }> = [
  { label: 'Product', id: 'product' },
  { label: 'Modules', id: 'modules' },
  { label: 'Pricing', id: 'pricing' },
  { label: 'Free tools', id: 'tools', page: '/tools' },
];

type Theme = 'light' | 'dark';

/**
 * Fixed, fully transparent site header. Instead of a backdrop it reads the surface under
 * it (sections marked data-nav-theme="dark") and flips its ink between dark and white.
 */
export function SiteNav() {
  const headerRef = useRef<HTMLElement>(null);
  // Section links scroll on the home page and navigate back to it from any other page.
  const pathname = usePathname();
  const base = pathname === '/' ? '' : '/';
  const [theme, setTheme] = useState<Theme>('light');
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Theme: observe dark surfaces against a thin band where the bar sits (top 76px).
    // Fires only when a section edge crosses that band, not on every scroll frame.
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

    // Hide while scrolling down, reveal on any upward scroll or near the top.
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY;
        if (y < 120) setHidden(false);
        else if (delta > 6) setHidden(true);
        else if (delta < -6) setHidden(false);
        lastY = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', buildThemeIO);

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    LINKS.forEach((l) => {
      const el = document.getElementById(l.id);
      if (el) io.observe(el);
    });
    return () => {
      themeIO?.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', buildThemeIO);
      io.disconnect();
    };
  }, []);

  const dark = theme === 'dark' && !open;

  return (
    <header
      ref={headerRef}
      className={`fixed inset-x-0 top-0 z-50 transition-transform duration-500 ease-out-expo ${
        hidden && !open ? '-translate-y-full' : 'translate-y-0'
      }`}
      onFocusCapture={() => setHidden(false)}
    >
      <div className="mx-auto flex h-[76px] max-w-[1480px] items-center justify-between px-6 sm:px-10">
        <Link href="/" aria-label="SynexTax home" className="rounded-md">
          <Wordmark
            tone={dark ? 'paper' : 'ink'}
            className="font-display [&>span:last-child]:text-[22px] [&>span:last-child]:font-semibold [&>span:last-child]:tracking-[-0.035em] [&>span:last-child]:transition-colors [&>span:last-child]:duration-500"
          />
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1 font-display text-[16px] font-medium tracking-[-0.015em]">
            {LINKS.map((l) => {
              const current = l.page ? pathname === l.page : active === l.id;
              return (
                <li key={l.id}>
                  <a
                    href={l.page ?? `${base}#${l.id}`}
                    aria-current={current ? 'true' : undefined}
                    className={`relative block rounded-full px-4 py-2 transition-colors duration-500 ${
                      dark
                        ? current
                          ? 'text-white'
                          : 'text-white/60 hover:text-white'
                        : current
                          ? 'text-ink'
                          : 'text-ink/60 hover:text-ink'
                    }`}
                  >
                    {l.label}
                    <span
                      aria-hidden
                      className={`absolute bottom-1 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full transition-all duration-500 ${
                        current ? (dark ? 'bg-mint opacity-100' : 'bg-ink opacity-100') : 'opacity-0'
                      }`}
                    />
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="hidden items-center gap-5 md:flex">
          <Link
            href="/login"
            className={`font-display text-[16px] font-medium tracking-[-0.015em] transition-colors duration-500 ${
              dark ? 'text-white/75 hover:text-white' : 'text-ink/70 hover:text-ink'
            }`}
          >
            Sign in
          </Link>
          <PillButton href="/signup" size="sm" tone={dark ? 'light' : 'dark'}>
            Book a demo
          </PillButton>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-500 md:hidden ${
            dark ? 'bg-white text-ink' : 'bg-ink text-white'
          }`}
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {/* Mobile menu sheet (the only place the header carries a surface) */}
      {open && (
        <div className="mx-3 rounded-[24px] bg-white p-4 shadow-[0_24px_60px_-24px_rgba(20,20,22,0.45)] md:hidden">
          <ul className="space-y-1 font-display text-[18px] font-medium tracking-[-0.02em]">
            {LINKS.map((l) => (
              <li key={l.id}>
                <a href={l.page ?? `${base}#${l.id}`} onClick={() => setOpen(false)} className="block rounded-2xl px-3 py-2.5 text-ink/80 hover:bg-ink/[0.04]">
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <Link href="/login" className="block rounded-2xl px-3 py-2.5 text-ink/80 hover:bg-ink/[0.04]">
                Sign in
              </Link>
            </li>
          </ul>
          <div className="mt-3">
            <PillButton href="/signup" full>
              Book a demo
            </PillButton>
          </div>
        </div>
      )}
    </header>
  );
}
