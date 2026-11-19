'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  CheckCheck,
  CircleAlert,
  ClipboardCheck,
  FileSpreadsheet,
  Gauge,
  LayoutDashboard,
  LogOut,
  Moon,
  Percent,
  ReceiptText,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'control', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { id: 'clients', label: 'Clients', href: '/dashboard/clients', icon: Users },
  { id: 'gst', label: 'GST and IMS', href: '/dashboard/invoices', icon: ReceiptText },
  { id: 'recon', label: '2B reconciliation', href: '/dashboard/recon', icon: FileSpreadsheet },
  { id: 'tds', label: 'Dual-Act TDS', href: '/dashboard/tds', icon: Percent },
  { id: 'audit', label: 'Reports and audit', href: '/dashboard/audit', icon: ScrollText },
];

const PORTALS = [
  { name: 'GSTN', ok: true },
  { name: 'IRP', ok: true },
  { name: 'TRACES', ok: false },
];

type Note = {
  id: string;
  title: string;
  body: string;
  when: string;
  href: string;
  tone: 'accent' | 'warn' | 'ok';
  icon: React.ComponentType<{ className?: string }>;
};

const NOTES: Note[] = [
  { id: 'n1', title: 'IMS cut-off on 14 Dec', body: '37 supplier documents still need an action across 9 GSTINs.', when: '2h ago', href: '/dashboard/invoices', tone: 'accent', icon: CircleAlert },
  { id: 'n2', title: 'TRACES is running slow', body: 'Form 140 downloads are taking longer than usual today.', when: '3h ago', href: '/dashboard/tds', tone: 'warn', icon: Gauge },
  { id: 'n3', title: 'GSTR-3B approved and signed', body: 'Amritsar Silk Mills, Oct 2026, signed with partner DSC.', when: 'Yesterday', href: '/dashboard', tone: 'ok', icon: ClipboardCheck },
  { id: 'n4', title: 'FVU 1.2 validation passed', body: 'Golden City Healthcare, Form 140, Q2 TY 2026-27.', when: 'Yesterday', href: '/dashboard/tds', tone: 'ok', icon: ShieldCheck },
];

const NOTE_TONE: Record<Note['tone'], string> = {
  accent: 'bg-pos-accent/15 text-pos-accent',
  warn: 'bg-[#f2b53a]/15 text-[#b9800f]',
  ok: 'bg-pos-green/15 text-pos-green',
};

/** Ink tile with the site's pixel S (sky and mint pixels). */
function AppMark() {
  const px: Array<[number, number]> = [
    [1, 0], [2, 0], [3, 0], [0, 1], [1, 2], [2, 2], [3, 3], [0, 4], [1, 4], [2, 4],
  ];
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-[#141416] shadow-[0_8px_18px_-8px_rgba(20,20,22,0.7),inset_0_0_0_1px_rgba(255,255,255,0.08)]">
      <svg width="18" height="22" viewBox="0 0 20 25" aria-hidden>
        {px.map(([x, y], i) => (
          <rect key={i} x={x * 5} y={y * 5} width={4.4} height={4.4} rx={0.9} fill={i === 3 ? '#52b0f8' : i === 6 ? '#5fe88a' : '#fff'} />
        ))}
      </svg>
    </span>
  );
}

/** Popover anchored under a header button; closes on outside click and Escape. */
function usePopover() {
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

const panel =
  'absolute right-0 top-[calc(100%+10px)] z-50 overflow-hidden rounded-[18px] bg-pos-surface shadow-[0_0_0_1px_rgb(var(--pos-line)),0_24px_60px_-20px_rgba(10,20,40,0.35)]';

const iconButton =
  'relative flex h-10 w-10 items-center justify-center rounded-full border border-pos-line bg-pos-surface/70 text-pos-ink transition-colors hover:bg-pos-tint aria-expanded:bg-pos-tint';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  // The shell only renders on the client (behind AuthGate), so the saved theme can be read
  // before the first paint: no light flash and no light-to-dark transition on load.
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('synextax_dashboard_theme') === 'dark';
    } catch {
      return false;
    }
  });
  const [query, setQuery] = useState('');
  const [unread, setUnread] = useState<Set<string>>(() => new Set(['n1', 'n2']));
  const notes = usePopover();
  const profile = usePopover();

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    try {
      localStorage.setItem('synextax_dashboard_theme', next ? 'dark' : 'light');
    } catch {
      /* storage unavailable */
    }
  };

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href.split('?')[0]);

  const firm = user?.firmName || 'Verma & Associates';
  const name = user?.fullName || 'Practice member';
  const initials =
    name
      .replace(/^CA\s+/i, '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || 'SX';
  const roleLabel = user?.role === 'STAFF' ? 'Staff, prepares returns' : user?.role === 'PARTNER' ? 'Partner, approves and signs' : 'Member';

  return (
    <div className={`pos-root min-h-screen ${dark ? 'dark' : ''}`}>
      {/* Icon rail */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-[84px] flex-col items-center border-r border-pos-line bg-pos-surface" aria-label="Workspace">
        <Link href="/dashboard" className="flex h-[74px] items-center" aria-label="SynexTax dashboard">
          <AppMark />
        </Link>
        <nav className="mt-4 flex flex-1 flex-col items-center gap-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex h-14 w-14 items-center justify-center rounded-[16px] transition-colors ${
                  active ? 'bg-pos-tint text-pos-accent' : 'text-pos-ink/70 hover:bg-pos-tint/70 hover:text-pos-accent'
                }`}
              >
                <Icon className="h-[28px] w-[28px]" strokeWidth={1.4} />
                {active && <span className="absolute -left-[14px] h-8 w-[4px] rounded-r-full bg-pos-accent" />}
                <span className="pointer-events-none absolute left-[68px] z-50 whitespace-nowrap rounded-full bg-[#141416] px-3 py-1 text-[12px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="mb-5 flex flex-col items-center gap-2">
          <Link
            href="/dashboard/settings"
            aria-label="Settings"
            className={`group relative flex h-14 w-14 items-center justify-center rounded-[16px] transition-colors ${
              isActive('/dashboard/settings') ? 'bg-pos-tint text-pos-accent' : 'text-pos-ink/70 hover:text-pos-accent'
            }`}
          >
            <Settings className="h-[28px] w-[28px]" strokeWidth={1.4} />
            <span className="pointer-events-none absolute left-[68px] z-50 whitespace-nowrap rounded-full bg-[#141416] px-3 py-1 text-[12px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              Settings
            </span>
          </Link>
        </div>
      </aside>

      <div className="ml-[84px] flex min-h-screen flex-col">
        <header className="pos-header sticky top-0 z-40 flex h-[74px] items-center gap-6 border-b px-6 lg:px-8">
          <h1 className="min-w-0 truncate text-[clamp(18px,1.8vw,26px)] font-semibold tracking-[-0.02em] text-pos-ink">{firm}</h1>

          <form role="search" onSubmit={(e) => e.preventDefault()} className="mx-auto hidden w-full max-w-[420px] md:block">
            <label htmlFor="global-search" className="sr-only">
              Search clients, GSTIN, PAN or invoice
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-pos-ink/40" strokeWidth={2} />
              <input
                id="global-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search client, GSTIN, PAN or invoice"
                className="h-11 w-full rounded-full border border-pos-line bg-pos-surface pl-11 pr-5 text-[14px] text-pos-ink outline-none transition-shadow placeholder:text-pos-ink/40 focus:border-pos-accent focus:shadow-[0_0_0_4px_rgb(var(--pos-accent)/0.15)]"
              />
            </div>
          </form>

          <div className="ml-auto flex items-center gap-2.5">
            <div className="hidden items-center gap-3 rounded-full border border-pos-line bg-pos-surface/70 px-3.5 py-1.5 text-[12px] text-pos-ink/80 xl:flex" aria-label="Government portal status">
              {PORTALS.map((p) => (
                <span key={p.name} className="flex items-center gap-1.5" title={p.ok ? `${p.name} responding normally` : `${p.name} slower than usual`}>
                  <span className={`h-2 w-2 rounded-full ${p.ok ? 'bg-[#5fe88a]' : 'bg-[#f2b53a]'}`} />
                  {p.name}
                </span>
              ))}
            </div>

            <button type="button" onClick={toggleTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} className={iconButton}>
              {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>

            {/* Notifications */}
            <div ref={notes.ref} className="relative">
              <button
                type="button"
                aria-label={`Notifications${unread.size ? `, ${unread.size} unread` : ''}`}
                aria-haspopup="dialog"
                aria-expanded={notes.open}
                onClick={() => {
                  notes.setOpen((o) => !o);
                  profile.setOpen(false);
                }}
                className={iconButton}
              >
                <Bell className="h-[18px] w-[18px]" />
                {unread.size > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pos-red px-1 text-[10px] font-semibold text-white ring-2 ring-[#eef4fd] dark:ring-[#1d2430]">
                    {unread.size}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {notes.open && (
                  <motion.div
                    role="dialog"
                    aria-label="Notifications"
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className={`${panel} w-[360px] origin-top-right`}
                  >
                    <div className="flex items-center justify-between border-b border-pos-line px-4 py-3">
                      <p className="text-[15px] font-semibold text-pos-ink">Notifications</p>
                      <button
                        type="button"
                        onClick={() => setUnread(new Set())}
                        disabled={unread.size === 0}
                        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-medium text-pos-accent hover:bg-pos-tint disabled:opacity-40"
                      >
                        <CheckCheck className="h-3.5 w-3.5" /> Mark all as read
                      </button>
                    </div>
                    <ul className="max-h-[360px] overflow-y-auto py-1">
                      {NOTES.map((n) => {
                        const Icon = n.icon;
                        const isUnread = unread.has(n.id);
                        return (
                          <li key={n.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setUnread((s) => {
                                  const next = new Set(s);
                                  next.delete(n.id);
                                  return next;
                                });
                                notes.setOpen(false);
                                router.push(n.href);
                              }}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-pos-muted"
                            >
                              <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${NOTE_TONE[n.tone]}`}>
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                  <span className={`text-[13.5px] ${isUnread ? 'font-semibold text-pos-ink' : 'font-medium text-pos-ink/80'}`}>{n.title}</span>
                                  {isUnread && <span className="h-2 w-2 rounded-full bg-pos-accent" aria-label="Unread" />}
                                </span>
                                <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-pos-ink/60">{n.body}</span>
                                <span className="mt-1 block text-[11.5px] text-pos-ink/40">{n.when}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile */}
            <div ref={profile.ref} className="relative">
              <button
                type="button"
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={profile.open}
                onClick={() => {
                  profile.setOpen((o) => !o);
                  notes.setOpen(false);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#141416] text-[13px] font-semibold text-white shadow-[0_6px_14px_-6px_rgba(20,20,22,0.7)] ring-2 ring-[#5fe88a]/70 ring-offset-2 ring-offset-transparent transition-transform hover:scale-105"
              >
                {initials}
              </button>
              <AnimatePresence>
                {profile.open && (
                  <motion.div
                    role="menu"
                    aria-label="Account"
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className={`${panel} w-[280px] origin-top-right`}
                  >
                    <div className="flex items-center gap-3 border-b border-pos-line p-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#141416] text-[14px] font-semibold text-white">
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[14.5px] font-semibold text-pos-ink">{name}</p>
                        <p className="truncate text-[12.5px] text-pos-ink/55">{roleLabel}</p>
                        <p className="truncate text-[12px] text-pos-ink/45">{user?.email}</p>
                      </div>
                    </div>
                    <div className="p-1.5 text-[13.5px]">
                      <Link
                        role="menuitem"
                        href="/dashboard/settings"
                        onClick={() => profile.setOpen(false)}
                        className="flex items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-pos-ink hover:bg-pos-muted"
                      >
                        <Settings className="h-4 w-4 text-pos-ink/60" /> Settings
                      </Link>
                      <button
                        role="menuitem"
                        type="button"
                        onClick={toggleTheme}
                        className="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left text-pos-ink hover:bg-pos-muted"
                      >
                        {dark ? <Sun className="h-4 w-4 text-pos-ink/60" /> : <Moon className="h-4 w-4 text-pos-ink/60" />}
                        {dark ? 'Light mode' : 'Dark mode'}
                      </button>
                      <div className="my-1 h-px bg-pos-line" />
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          profile.setOpen(false);
                          logout();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left text-pos-red hover:bg-pos-red/10"
                      >
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="flex-1 px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
