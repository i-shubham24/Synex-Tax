'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronsLeft,
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
  FolderCheck,
  FileStack,
  CalendarCheck,
  Landmark,
  Calculator,
  MessageSquare,
  MessageSquareText,
  ClipboardCheck,
  ReceiptIndianRupee,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { SynTaxMark } from '../brand/SynTaxLogo';
import { useWorkspace } from '../../workspace/WorkspaceContext';
import { ClientPill } from './shell/ClientPill';
import { CommandPalette, openCommandPalette } from './shell/CommandPalette';
import { KeyboardShortcuts } from './shell/KeyboardShortcuts';
import { NotificationCenter } from './shell/NotificationCenter';
import { ProfileMenu } from './shell/ProfileMenu';
import { SupportWidget } from './shell/SupportWidget';
import { iconButtonClass } from './shell/usePopover';

type AppRole = 'PARTNER' | 'MANAGER' | 'STAFF' | 'CLIENT_ADMIN' | 'READONLY';

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  roles?: AppRole[]; /* omitted = every firm role */
  module?: string; /* screen permission needed */
}

/* Role-aware navigation: audit logs stay with partners and managers */
const NAV_ITEMS: NavItem[] = [
  { id: 'control', label: 'Control Tower', href: '/dashboard', icon: LayoutDashboard },
  { id: 'clients', label: 'Client Master', href: '/clients', icon: Users },
  { id: 'gst', label: 'GST and IMS', href: '/gst', icon: ReceiptText, module: 'GST' },
  { id: 'recon', label: '2B reconciliation', href: '/gst/recon-2b', icon: FileSpreadsheet, module: 'GST' },
  { id: 'gst-returns', label: 'GST returns', href: '/gst/returns', icon: FileStack, module: 'GST' },
  { id: 'billing', label: 'Billing', href: '/billing', icon: ReceiptIndianRupee, module: 'GST' },
  { id: 'tds', label: 'Dual-Act TDS', href: '/tds', icon: Percent, module: 'TDS' },
  { id: 'itr', label: 'Income tax', href: '/itr', icon: Calculator },
  { id: 'tax-audit', label: 'Tax audit', href: '/tax-audit', icon: ClipboardCheck, roles: ['PARTNER', 'MANAGER'] },
  { id: 'practice', label: 'Practice', href: '/practice', icon: CalendarCheck, module: 'PRACTICE' },
  { id: 'documents', label: 'Client documents', href: '/documents', icon: FolderCheck, module: 'DOCUMENTS' },
  { id: 'bank', label: 'Bank to books', href: '/bank', icon: Landmark, module: 'PRACTICE' },
  { id: 'messages', label: 'Messages', href: '/messages', icon: MessageSquare },
  { id: 'assistant', label: 'Assistant', href: '/assistant', icon: MessageSquareText },
  { id: 'audit', label: 'Audit and reports', href: '/audit', icon: ScrollText, roles: ['PARTNER', 'MANAGER'], module: 'AUDIT' },
];

/* Brand tile with the SynTax dynamic logo mark */
function AppMark() {
  return (
    <span className="flex shrink-0 items-center justify-center">
      <SynTaxMark size={32} priority />
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
  const { user, authFetch } = useAuth();
  const [modules, setModules] = useState<string[] | null>(null);

  useEffect(() => {
    if (!user) return;
    authFetch('/api/v1/team/me')
      .then(async (r) => (r.ok ? setModules((await r.json()).modules) : null))
      .catch(() => null);
  }, [user, authFetch]);

  const { snapshot } = useWorkspace();
  const [dark, setDark] = useState(() => readPref('synextax_dashboard_theme', false));
  const [expanded, setExpanded] = useState(() => readPref('synextax_rail_expanded', false));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hoveredTip, setHoveredTip] = useState<{ label: string; top: number } | null>(null);

  useEffect(() => {
    setMobileOpen(false);
    setHoveredTip(null);
  }, [pathname]);

  const toggleTheme = () => {
    setDark((d) => {
      writePref('synextax_dashboard_theme', d ? 'light' : 'dark');
      return !d;
    });
  };

  const toggleRail = () => {
    setHoveredTip(null);
    setExpanded((x) => {
      writePref('synextax_rail_expanded', x ? '0' : '1');
      return !x;
    });
  };

  const role = (user?.role ?? 'STAFF') as AppRole;
  const items = NAV_ITEMS.filter((i) => (!i.roles || i.roles.includes(role)) && (!i.module || !modules || modules.includes(i.module)));
  const isActive = (href: string) => (href === '/dashboard' || href === '/gst' ? pathname === href : pathname.startsWith(href));
  const railW = expanded ? 'w-[270px] md:w-[220px]' : 'w-[270px] md:w-[72px]';
  const mainMl = expanded ? 'ml-0 md:ml-[220px]' : 'ml-0 md:ml-[72px]';

  const handleMouseEnter = (label: string, e: React.MouseEvent<HTMLElement>) => {
    if (!expanded) {
      const rect = e.currentTarget.getBoundingClientRect();
      setHoveredTip({
        label,
        top: rect.top + rect.height / 2,
      });
    }
  };

  const handleMouseLeave = () => {
    setHoveredTip(null);
  };

  const navLink = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <Link
        key={item.id}
        href={item.href}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        title={!expanded ? item.label : undefined}
        onClick={() => {
          setMobileOpen(false);
          setHoveredTip(null);
        }}
        onMouseEnter={(e) => handleMouseEnter(item.label, e)}
        onMouseLeave={handleMouseLeave}
        className={`group relative flex h-12 items-center gap-3 rounded-[14px] transition-colors shrink-0 ${
          expanded ? 'w-full px-3' : 'w-full px-3 md:w-12 md:justify-center'
        } ${
          active ? 'bg-pos-tint text-pos-accent' : 'text-pos-ink/70 hover:bg-pos-tint/70 hover:text-pos-accent'
        }`}
      >
        <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={1.5} />
        <span className={`truncate text-[13.5px] font-medium ${expanded ? 'block' : 'block md:hidden'}`}>{item.label}</span>
        {active && <span className="absolute -left-[12px] h-7 w-[4px] rounded-r-full bg-pos-accent" />}
      </Link>
    );
  };

  return (
    <div className={`pos-root min-h-screen ${dark ? 'dark' : ''}`}>
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          role="presentation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity md:hidden"
        />
      )}

      {/* Rail: 72px icons / 220px on desktop, slide-out 270px drawer on mobile */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-pos-line bg-pos-surface px-3 overflow-x-hidden transition-transform duration-300 ease-out-expo md:transition-[width] ${railW} ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        aria-label="Workspace"
      >
        <div className="flex h-16 shrink-0 items-center justify-between">
          <button
            type="button"
            onClick={toggleRail}
            className="flex items-center gap-3 rounded-[12px] focus:outline-none focus-visible:ring-2 focus-visible:ring-pos-accent text-left"
            aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
            title={expanded ? 'Click to collapse navigation' : 'Click to expand navigation'}
          >
            <AppMark />
            <span className={`font-display text-[19px] font-semibold tracking-[-0.03em] text-pos-ink ${expanded ? 'block' : 'block md:hidden'}`}>SynTax</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-pos-ink/60 hover:bg-pos-muted md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable features list: strictly vertical scroll without horizontal overflow */}
        <nav
          className={`mt-2 flex flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto py-1 ${
            expanded ? 'w-full px-0' : 'w-full px-0 md:items-center'
          } [scrollbar-width:thin] [scrollbar-color:rgba(120,120,120,0.2)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-pos-ink/15 hover:[&::-webkit-scrollbar-thumb]:bg-pos-ink/30`}
          onScroll={() => setHoveredTip(null)}
        >
          {items.map(navLink)}
        </nav>

        <div className={`mb-3 mt-1 flex flex-col gap-1 shrink-0 ${expanded ? 'w-full' : 'w-full md:items-center'}`}>
          {navLink({ id: 'settings', label: 'Settings', href: '/settings', icon: Settings })}
          {expanded && (
            <button
              type="button"
              onClick={toggleRail}
              aria-label="Collapse navigation"
              className="hidden h-10 w-full items-center gap-3 rounded-[12px] px-3 text-pos-ink/55 hover:bg-pos-muted hover:text-pos-ink md:flex"
            >
              <ChevronsLeft className="h-4 w-4 shrink-0" />
              <span className="text-[12.5px]">Collapse</span>
            </button>
          )}
        </div>
      </aside>

      {/* Floating suggestion tooltip when hovering collapsed rail icons */}
      {hoveredTip && !expanded && (
        <div
          role="tooltip"
          aria-hidden="true"
          className="pointer-events-none fixed z-[9999] -translate-y-1/2 whitespace-nowrap rounded-[8px] bg-[#141416] px-3 py-1.5 text-[12px] font-medium tracking-tight text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] ring-1 ring-white/10 transition-opacity duration-150 animate-in fade-in"
          style={{ left: '76px', top: `${hoveredTip.top}px` }}
        >
          {hoveredTip.label}
          <span className="absolute -left-1 top-1/2 -translate-y-1/2 border-y-4 border-r-4 border-y-transparent border-r-[#141416]" />
        </div>
      )}

      {/* Main Content Area */}
      <div className={`flex min-h-screen flex-col min-w-0 transition-[margin] duration-300 ease-out-expo ${mainMl}`}>
        <header className="pos-header sticky top-0 z-40 flex h-16 items-center justify-between gap-2 sm:gap-3 border-b px-3 sm:px-5 lg:px-6">
          <div className="flex shrink-0 items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-pos-line text-pos-ink/75 hover:bg-pos-tint md:hidden shrink-0"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden min-w-0 max-w-[200px] shrink xl:block">
              <p className="truncate text-[14px] font-semibold tracking-[-0.02em] text-pos-ink">{snapshot.firm.name}</p>
            </div>
            <ClientPill />
          </div>

          <div className="hidden min-w-[240px] max-w-[340px] flex-1 px-3 md:block">
            <button
              type="button"
              onClick={openCommandPalette}
              className="flex h-10 w-full items-center gap-2.5 rounded-full border border-pos-line bg-pos-surface pl-4 pr-2 text-left text-[13px] text-pos-ink/60 transition-colors hover:border-pos-accent/60"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">Search or type a command</span>
              <kbd className="shrink-0 rounded-full border border-pos-line px-2 py-0.5 text-[12px] text-pos-ink/60">Ctrl K</kbd>
            </button>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button type="button" onClick={toggleTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} className={iconButtonClass}>
              {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <NotificationCenter />
            <ProfileMenu dark={dark} onToggleTheme={toggleTheme} />
          </div>
        </header>

        <main className="flex-1 w-full min-w-0 max-w-full px-3 py-4 sm:px-6 sm:py-6 lg:px-8">{children}</main>
      </div>

      <CommandPalette />
      <KeyboardShortcuts />
      <SupportWidget />
    </div>
  );
}
