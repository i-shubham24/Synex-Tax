'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronsLeft,
  ChevronsRight,
  Database,
  FileSpreadsheet,
  LayoutDashboard,
  Moon,
  Percent,
  ReceiptText,
  ScrollText,
  Search,
  Settings,
  Sun,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../workspace/WorkspaceContext';
import { ClientPill } from './shell/ClientPill';
import { CommandPalette, openCommandPalette } from './shell/CommandPalette';
import { DscAgentPill } from './shell/DscAgentPill';
import { NotificationCenter } from './shell/NotificationCenter';
import { PlanMeter } from './shell/PlanMeter';
import { ProfileMenu } from './shell/ProfileMenu';
import { SupportWidget } from './shell/SupportWidget';
import { iconButtonClass } from './shell/usePopover';

type AppRole = 'PARTNER' | 'MANAGER' | 'STAFF' | 'CLIENT_ADMIN' | 'READONLY';

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  roles?: AppRole[]; // omitted = every firm role
}

// Role-aware: audit logs (PII reveals, signing trail) stay with partners and managers.
const NAV_ITEMS: NavItem[] = [
  { id: 'control', label: 'Control Tower', href: '/dashboard', icon: LayoutDashboard },
  { id: 'clients', label: 'Client Master', href: '/clients', icon: Users },
  { id: 'gst', label: 'GST and IMS', href: '/gst', icon: ReceiptText },
  { id: 'recon', label: '2B reconciliation', href: '/gst/recon-2b', icon: FileSpreadsheet },
  { id: 'tds', label: 'Dual-Act TDS', href: '/tds', icon: Percent },
  { id: 'audit', label: 'Audit and reports', href: '/audit', icon: ScrollText, roles: ['PARTNER', 'MANAGER'] },
];

const PORTALS = [
  { name: 'GSTN', ok: true, ms: 420 },
  { name: 'NIC IRP', ok: true, ms: 310 },
  { name: 'TRACES', ok: false, ms: 2_850 },
  { name: 'ITD', ok: true, ms: 640 },
];

/** Ink tile with the site's pixel S (sky and mint pixels). */
function AppMark() {
  const px: Array<[number, number]> = [
    [1, 0], [2, 0], [3, 0], [0, 1], [1, 2], [2, 2], [3, 3], [0, 4], [1, 4], [2, 4],
  ];
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#141416] shadow-[0_8px_18px_-8px_rgba(20,20,22,0.7),inset_0_0_0_1px_rgba(255,255,255,0.08)]">
      <svg width="16" height="20" viewBox="0 0 20 25" aria-hidden>
        {px.map(([x, y], i) => (
          <rect key={i} x={x * 5} y={y * 5} width={4.4} height={4.4} rx={0.9} fill={i === 3 ? '#52b0f8' : i === 6 ? '#5fe88a' : '#fff'} />
        ))}
      </svg>
    </span>
  );
}

function readPref(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1' || v === 'dark';
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { snapshot, source, sourceNote } = useWorkspace();
  // The shell renders only on the client (behind AuthGate), so preferences are read before first paint.
  const [dark, setDark] = useState(() => readPref('synextax_dashboard_theme', false));
  const [expanded, setExpanded] = useState(() => readPref('synextax_rail_expanded', false));

  const toggleTheme = () => {
    setDark((d) => {
      writePref('synextax_dashboard_theme', d ? 'light' : 'dark');
      return !d;
    });
  };
  const toggleRail = () => {
    setExpanded((x) => {
      writePref('synextax_rail_expanded', x ? '0' : '1');
      return !x;
    });
  };

  const role = (user?.role ?? 'STAFF') as AppRole;
  const items = NAV_ITEMS.filter((i) => !i.roles || i.roles.includes(role));
  const isActive = (href: string) => (href === '/dashboard' || href === '/gst' ? pathname === href : pathname.startsWith(href));
  const railW = expanded ? 'w-[220px]' : 'w-[72px]';
  const mainMl = expanded ? 'ml-[220px]' : 'ml-[72px]';
  const slowest = PORTALS.filter((p) => !p.ok);

  const navLink = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <Link
        key={item.id}
        href={item.href}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        className={`group relative flex h-12 items-center gap-3 rounded-[14px] transition-colors ${expanded ? 'w-full px-3' : 'w-12 justify-center'} ${
          active ? 'bg-pos-tint text-pos-accent' : 'text-pos-ink/70 hover:bg-pos-tint/70 hover:text-pos-accent'
        }`}
      >
        <Icon className="h-[24px] w-[24px] shrink-0" strokeWidth={1.5} />
        {expanded && <span className="truncate text-[13.5px] font-medium">{item.label}</span>}
        {active && <span className="absolute -left-[12px] h-7 w-[4px] rounded-r-full bg-pos-accent" />}
        {!expanded && (
          <span className="pointer-events-none absolute left-[60px] z-50 whitespace-nowrap rounded-full bg-[#141416] px-3 py-1 text-[12px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {item.label}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className={`pos-root min-h-screen ${dark ? 'dark' : ''}`}>
      {/* Rail: 72px icons, 220px with labels */}
      <aside className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-pos-line bg-pos-surface px-3 transition-[width] duration-300 ease-out-expo ${railW}`} aria-label="Workspace">
        <Link href="/dashboard" className={`flex h-16 items-center gap-2.5 ${expanded ? '' : 'justify-center'}`} aria-label="SynexTax Control Tower">
          <AppMark />
          {expanded && <span className="font-display text-[17px] font-semibold tracking-[-0.03em] text-pos-ink">SynexTax</span>}
        </Link>
        <nav className={`mt-3 flex flex-1 flex-col gap-1.5 ${expanded ? '' : 'items-center'}`}>{items.map(navLink)}</nav>
        <div className={`mb-4 flex flex-col gap-1.5 ${expanded ? '' : 'items-center'}`}>
          {navLink({ id: 'settings', label: 'Settings', href: '/settings', icon: Settings })}
          <button
            type="button"
            onClick={toggleRail}
            aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
            className={`flex h-10 items-center gap-3 rounded-[12px] text-pos-ink/55 hover:bg-pos-muted hover:text-pos-ink ${expanded ? 'w-full px-3' : 'w-12 justify-center'}`}
          >
            {expanded ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
            {expanded && <span className="text-[12.5px]">Collapse</span>}
          </button>
        </div>
      </aside>

      <div className={`flex min-h-screen flex-col transition-[margin] duration-300 ease-out-expo ${mainMl}`}>
        <header className="pos-header sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b px-5 lg:px-6">
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden min-w-0 max-w-[200px] shrink xl:block">
              <p className="truncate text-[14px] font-semibold tracking-[-0.02em] text-pos-ink">{snapshot.firm.name}</p>
            </div>
            <ClientPill />
          </div>

          <div className="hidden min-w-[240px] max-w-[340px] flex-1 px-3 md:block">
            <button
              type="button"
              onClick={openCommandPalette}
              className="flex h-10 w-full items-center gap-2.5 rounded-full border border-pos-line bg-pos-surface pl-4 pr-2 text-left text-[13px] text-pos-ink/45 transition-colors hover:border-pos-accent/60"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">Search or type a command</span>
              <kbd className="shrink-0 rounded-full border border-pos-line px-2 py-0.5 text-[11px] text-pos-ink/50">Ctrl K</kbd>
            </button>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {source === 'sample' && (
              <span
                title={sourceNote ?? 'Screens are running on the sample firm until the live API is connected.'}
                className="hidden items-center gap-1.5 rounded-full border border-dashed border-pos-line px-3 py-1.5 text-[11.5px] font-medium text-pos-ink/60 lg:flex"
              >
                <Database className="h-3.5 w-3.5" /> Sample data
              </span>
            )}
            <div
              className="hidden items-center gap-3 rounded-full border border-pos-line bg-pos-surface/70 px-3.5 py-1.5 text-[12px] text-pos-ink/80 xl:flex"
              aria-label={`Government portal status${slowest.length ? `: ${slowest.map((p) => p.name).join(', ')} slow` : ''}`}
            >
              {PORTALS.map((p) => (
                <span key={p.name} className="flex items-center gap-1.5" title={`${p.name}: ${p.ok ? 'normal' : 'slower than usual'}, ${p.ms} ms`}>
                  <span className={`h-2 w-2 rounded-full ${p.ok ? 'bg-[#5fe88a]' : 'bg-[#f2b53a]'}`} />
                  <span className="hidden 2xl:inline">{p.name}</span>
                </span>
              ))}
            </div>
            <DscAgentPill />
            <PlanMeter />
            <button type="button" onClick={toggleTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} className={iconButtonClass}>
              {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <NotificationCenter />
            <ProfileMenu dark={dark} onToggleTheme={toggleTheme} />
          </div>
        </header>

        <main className="flex-1 px-5 py-6 lg:px-8">{children}</main>
      </div>

      <CommandPalette />
      <SupportWidget />
    </div>
  );
}
