'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  KeyRound,
  ChevronDown,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { SynTaxMark } from '../brand/SynTaxLogo';
import { useWorkspace } from '../../workspace/WorkspaceContext';
import { ClientPill } from './shell/ClientPill';
import { PortalHealthPill } from './shell/PortalHealthPill';
import { CommandPalette, openCommandPalette } from './shell/CommandPalette';
import { KeyboardShortcuts } from './shell/KeyboardShortcuts';
import { NotificationCenter } from './shell/NotificationCenter';
import { ProfileMenu } from './shell/ProfileMenu';
import { SupportWidget } from './shell/SupportWidget';
import { iconButtonClass } from './shell/usePopover';

type AppRole = 'PARTNER' | 'MANAGER' | 'STAFF' | 'CLIENT_ADMIN' | 'READONLY';

export type SuiteKey = 'TOWER' | 'GST' | 'TDS' | 'SIGN' | 'DESK';

interface SuiteDef {
  key: SuiteKey;
  code: string; // for entitlement checks
  name: string;
  shortName: string;
  tagline: string;
  defaultHref: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color: string;
}

const SUITES: SuiteDef[] = [
  {
    key: 'TOWER',
    code: 'DESK',
    name: 'Control Tower',
    shortName: 'Tower',
    tagline: 'Firm-wide cross-suite cockpit',
    defaultHref: '/dashboard',
    icon: LayoutDashboard,
    color: 'text-sky-deep',
  },
  {
    key: 'GST',
    code: 'GST',
    name: 'SynTax GST',
    shortName: 'GST',
    tagline: '4-pass 2B recon, IMS & 3B set-off',
    defaultHref: '/gst',
    icon: ReceiptText,
    color: 'text-emerald-600',
  },
  {
    key: 'TDS',
    code: 'TDS',
    name: 'SynTax TDS',
    shortName: 'TDS',
    tagline: 'Dual-Act router & 281N challans',
    defaultHref: '/tds',
    icon: Percent,
    color: 'text-amber-600',
  },
  {
    key: 'SIGN',
    code: 'SIGN',
    name: 'SynTax Sign',
    shortName: 'Sign',
    tagline: 'Zero-Java Go DSC agent & PAdES',
    defaultHref: '/dsc',
    icon: KeyRound,
    color: 'text-indigo-600',
  },
  {
    key: 'DESK',
    code: 'DESK',
    name: 'SynTax Desk',
    shortName: 'Desk',
    tagline: '4-tier Master, Migration & MCA Vault',
    defaultHref: '/clients',
    icon: Users,
    color: 'text-blue-600',
  },
];

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  roles?: AppRole[];
  module?: string;
  suite: SuiteKey;
}

const ALL_NAV_ITEMS: NavItem[] = [
  // Control Tower
  { id: 'control', label: 'Control Tower', href: '/dashboard', icon: LayoutDashboard, suite: 'TOWER' },
  { id: 'practice', label: 'Practice Heatmap', href: '/practice', icon: CalendarCheck, module: 'PRACTICE', suite: 'TOWER' },
  { id: 'messages', label: 'Messages', href: '/messages', icon: MessageSquare, suite: 'TOWER' },
  { id: 'assistant', label: 'AI Assistant', href: '/assistant', icon: MessageSquareText, suite: 'TOWER' },

  // SynTax GST
  { id: 'gst-overview', label: 'GST Overview', href: '/gst', icon: ReceiptText, module: 'GST', suite: 'GST' },
  { id: 'recon', label: '2B Reconciliation', href: '/gst/recon-2b', icon: FileSpreadsheet, module: 'GST', suite: 'GST' },
  { id: 'gst-returns', label: 'GST Returns (GSTR-1/3B)', href: '/gst/returns', icon: FileStack, module: 'GST', suite: 'GST' },
  { id: 'billing', label: 'Practice Billing', href: '/billing', icon: ReceiptIndianRupee, module: 'GST', suite: 'GST' },

  // SynTax TDS
  { id: 'tds-overview', label: 'Dual-Act TDS', href: '/tds', icon: Percent, module: 'TDS', suite: 'TDS' },
  { id: 'tds-health', label: 'TDS Health & 281N', href: '/tds/health', icon: ClipboardCheck, module: 'TDS', suite: 'TDS' },

  // SynTax Sign
  { id: 'dsc-hub', label: 'SynTax Sign Hub', href: '/dsc', icon: KeyRound, suite: 'SIGN' },

  // SynTax Desk
  { id: 'clients', label: 'Client Master (4-Tier)', href: '/clients', icon: Users, suite: 'DESK' },
  { id: 'client-import', label: '10-Min Migration', href: '/clients/import', icon: ArrowRight, suite: 'DESK' },
  { id: 'documents', label: 'Client Documents', href: '/documents', icon: FolderCheck, module: 'DOCUMENTS', suite: 'DESK' },
  { id: 'bank', label: 'Bank to Books', href: '/bank', icon: Landmark, module: 'PRACTICE', suite: 'DESK' },
  { id: 'audit', label: 'MCA Audit Vault', href: '/audit', icon: ScrollText, roles: ['PARTNER', 'MANAGER'], module: 'AUDIT', suite: 'DESK' },
  { id: 'settings', label: 'Practice Settings', href: '/settings', icon: Settings, suite: 'DESK' },

  // Income tax (built: ITR-1 to ITR-6, imports, saved returns)
  { id: 'itr', label: 'Income Tax', href: '/itr', icon: Calculator, suite: 'TOWER' },
  { id: 'itr-register', label: 'Assessee Register', href: '/itr/register', icon: Users, suite: 'TOWER' },
  { id: 'tax-audit', label: 'Tax Audit (Roadmap)', href: '/tax-audit', icon: ClipboardCheck, roles: ['PARTNER', 'MANAGER'], suite: 'TOWER' },
];

function AppMark({ expanded = true }: { expanded?: boolean }) {
  return (
    <span className="flex shrink-0 items-center justify-center">
      <SynTaxMark size={expanded ? 32 : 26} priority />
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
  const router = useRouter();
  const { user, authFetch } = useAuth();
  const { snapshot } = useWorkspace();
  const [modules, setModules] = useState<string[] | null>(null);

  useEffect(() => {
    if (!user) return;
    authFetch('/api/v1/team/me')
      .then(async (r) => (r.ok ? setModules((await r.json()).modules) : null))
      .catch(() => null);
  }, [user, authFetch]);

  const [dark, setDark] = useState(() => readPref('synextax_dashboard_theme', false));
  const [expanded, setExpanded] = useState(() => readPref('synextax_rail_expanded', true));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [suiteMenuOpen, setSuiteMenuOpen] = useState(false);
  const [showAllModules, setShowAllModules] = useState(false);
  const [hoveredTip, setHoveredTip] = useState<{ label: string; top: number } | null>(null);
  const suiteDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileOpen(false);
    setHoveredTip(null);
    setSuiteMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (suiteDropdownRef.current && !suiteDropdownRef.current.contains(e.target as Node)) {
        setSuiteMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // Determine active suite based on current path
  const currentSuiteKey = useMemo<SuiteKey>(() => {
    if (pathname.startsWith('/gst') || pathname.startsWith('/billing')) return 'GST';
    if (pathname.startsWith('/tds')) return 'TDS';
    if (pathname.startsWith('/dsc')) return 'SIGN';
    if (pathname.startsWith('/clients') || pathname.startsWith('/audit') || pathname.startsWith('/documents') || pathname.startsWith('/bank') || pathname.startsWith('/settings')) return 'DESK';
    return 'TOWER';
  }, [pathname]);

  const activeSuiteDef = useMemo(() => {
    return SUITES.find((s) => s.key === currentSuiteKey) || SUITES[0];
  }, [currentSuiteKey]);

  // Suite entitlement verification
  const firmEnabledSuites = snapshot?.firm?.enabledSuites || ['GST', 'TDS', 'SIGN', 'DESK', 'DIRECT'];
  const isCurrentSuiteLocked = useMemo(() => {
    if (activeSuiteDef.key === 'TOWER') return false;
    return !firmEnabledSuites.includes(activeSuiteDef.code);
  }, [activeSuiteDef, firmEnabledSuites]);

  const role = (user?.role ?? 'STAFF') as AppRole;

  // Filter items by role, module permission, and active suite (unless showAllModules is true)
  const visibleItems = useMemo(() => {
    return ALL_NAV_ITEMS.filter((item) => {
      const roleAllowed = !item.roles || item.roles.includes(role);
      const moduleAllowed = !item.module || !modules || modules.includes(item.module);
      if (!roleAllowed || !moduleAllowed) return false;
      if (showAllModules) return true;
      // Show items for active suite or general tower items
      return item.suite === currentSuiteKey;
    });
  }, [role, modules, showAllModules, currentSuiteKey]);

  const isActive = (href: string) => {
    if (href === '/dashboard' || href === '/gst' || href === '/tds' || href === '/clients' || href === '/itr') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

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
        className={`group relative flex h-11 items-center gap-3 rounded-[12px] transition-colors shrink-0 ${
          expanded ? 'w-full px-3' : 'w-full px-3 md:w-11 md:justify-center'
        } ${
          active ? 'bg-pos-tint text-pos-accent font-semibold' : 'text-pos-ink/70 hover:bg-pos-tint/70 hover:text-pos-accent'
        }`}
      >
        <Icon className="h-[20px] w-[20px] shrink-0" strokeWidth={1.6} />
        <span className={`truncate text-[13px] ${expanded ? 'block' : 'block md:hidden'}`}>{item.label}</span>
        {active && <span className="absolute -left-[12px] h-6 w-[4px] rounded-r-full bg-pos-accent" />}
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

      {/* Rail Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-pos-line bg-pos-surface px-3 overflow-x-hidden transition-transform duration-300 ease-out-expo md:transition-[width] ${railW} ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        aria-label="Workspace"
      >
        {/* Brand Bar */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-pos-line/60">
          <button
            type="button"
            onClick={toggleRail}
            className="flex items-center gap-2.5 rounded-[12px] focus:outline-none focus-visible:ring-2 focus-visible:ring-pos-accent text-left"
            aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
            title={expanded ? 'Click to collapse navigation' : 'Click to expand navigation'}
          >
            <AppMark expanded={expanded} />
            <span className={`font-display text-[18px] font-semibold tracking-[-0.03em] text-pos-ink ${expanded ? 'block' : 'block md:hidden'}`}>
              SynTax
            </span>
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

        {/* SynTax Suite Switcher Bar */}
        <div className="pt-3 pb-2 shrink-0 relative" ref={suiteDropdownRef}>
          <div className="flex items-center justify-between px-1 mb-1.5">
            <span className={`text-[10px] font-semibold uppercase tracking-wider text-pos-ink/40 ${expanded ? 'block' : 'hidden md:hidden'}`}>
              Product Suite
            </span>
            {expanded && (
              <button
                type="button"
                onClick={() => setShowAllModules((v) => !v)}
                className="text-[10px] font-medium text-sky hover:underline"
              >
                {showAllModules ? 'Scoped View' : 'All Modules'}
              </button>
            )}
          </div>

          {/* Active Suite Trigger Button */}
          <button
            type="button"
            onClick={() => setSuiteMenuOpen((o) => !o)}
            aria-expanded={suiteMenuOpen}
            title={!expanded ? `Switch Suite: ${activeSuiteDef.name}` : undefined}
            className={`w-full flex items-center justify-between rounded-xl border border-pos-line bg-pos-surface p-2 transition-all hover:border-pos-accent/50 ${
              expanded ? 'px-2.5' : 'md:justify-center md:px-0 md:h-11 md:w-11 mx-auto'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-pos-tint ${activeSuiteDef.color}`}>
                <activeSuiteDef.icon className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <div className={`text-left min-w-0 ${expanded ? 'block' : 'hidden md:hidden'}`}>
                <p className="text-[12.5px] font-semibold text-pos-ink leading-tight truncate">
                  {activeSuiteDef.name}
                </p>
                <p className="text-[10px] text-pos-ink/50 truncate">
                  {activeSuiteDef.shortName} Suite
                </p>
              </div>
            </div>
            {expanded && <ChevronDown className={`h-3.5 w-3.5 text-pos-ink/50 transition-transform ${suiteMenuOpen ? 'rotate-180' : ''}`} />}
          </button>

          {/* Suite Switcher Popover Menu */}
          {suiteMenuOpen && (
            <div
              className={`absolute top-full mt-1.5 z-50 rounded-2xl border border-pos-line bg-pos-surface p-2 shadow-xl ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 duration-150 ${
                expanded ? 'left-0 right-0 w-[240px]' : 'left-0 w-[240px]'
              }`}
            >
              <div className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-pos-ink/40">
                Switch SynTax Suite
              </div>
              <div className="space-y-1 mt-1">
                {SUITES.map((s) => {
                  const Icon = s.icon;
                  const isCurrent = s.key === currentSuiteKey;
                  const isLocked = s.key !== 'TOWER' && !firmEnabledSuites.includes(s.code);
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => {
                        setSuiteMenuOpen(false);
                        router.push(s.defaultHref);
                      }}
                      className={`w-full flex items-start gap-2.5 rounded-xl p-2 text-left transition-colors ${
                        isCurrent
                          ? 'bg-pos-tint text-pos-accent font-medium'
                          : 'hover:bg-pos-muted/60 text-pos-ink'
                      }`}
                    >
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-pos-tint ${s.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-[12px] font-semibold leading-tight">{s.name}</p>
                          {isLocked && (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.2 text-[9.5px] font-medium text-amber-600">
                              Preview
                            </span>
                          )}
                          {isCurrent && <Check className="h-3 w-3 text-pos-accent" />}
                        </div>
                        <p className="text-[10px] text-pos-ink/50 line-clamp-1 mt-0.5 leading-snug">{s.tagline}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Roadmap preview footer */}
              <div className="mt-2 border-t border-pos-line pt-2 px-2 text-[10.5px] text-pos-ink/50 flex items-center justify-between">
                <span>Direct &amp; Litigate</span>
                <span className="font-semibold text-pos-accent">Phase 3</span>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Nav Items */}
        <nav
          className={`flex flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto py-1 border-t border-pos-line/50 ${
            expanded ? 'w-full px-0' : 'w-full px-0 md:items-center'
          } [scrollbar-width:thin] [scrollbar-color:rgba(120,120,120,0.2)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-pos-ink/15 hover:[&::-webkit-scrollbar-thumb]:bg-pos-ink/30`}
          onScroll={() => setHoveredTip(null)}
        >
          {visibleItems.map(navLink)}
        </nav>

        {/* Rail Footer */}
        <div className={`mb-3 mt-1 flex flex-col gap-1 shrink-0 ${expanded ? 'w-full' : 'w-full md:items-center'}`}>
          {navLink({ id: 'settings', label: 'Settings', href: '/settings', icon: Settings, suite: 'DESK' })}
          {expanded && (
            <button
              type="button"
              onClick={toggleRail}
              aria-label="Collapse navigation"
              className="hidden h-9 w-full items-center gap-3 rounded-[12px] px-3 text-pos-ink/55 hover:bg-pos-muted hover:text-pos-ink md:flex text-[12px]"
            >
              <ChevronsLeft className="h-4 w-4 shrink-0" />
              <span>Collapse rail</span>
            </button>
          )}
        </div>
      </aside>

      {/* Floating Hover Tooltip */}
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
      <div className={`flex min-h-screen flex-col min-w-0 max-w-full overflow-x-hidden transition-[margin] duration-300 ease-out-expo ${mainMl}`}>
        {/* Top Header Bar */}
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
            {/* Pinned Active Client / GSTIN / TAN Context Pill */}
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
            <PortalHealthPill />
            <button type="button" onClick={toggleTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} className={iconButtonClass}>
              {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <NotificationCenter />
            <ProfileMenu dark={dark} onToggleTheme={toggleTheme} />
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 w-full min-w-0 max-w-full overflow-x-hidden px-3 py-4 sm:px-5 sm:py-5 lg:px-6 pb-20">
          {/* Smart Suite Entitlement Gating Banner */}
          {isCurrentSuiteLocked && (
            <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 shadow-sm text-pos-ink">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-[16px] font-semibold text-pos-ink">
                      {activeSuiteDef.name} Preview Mode (Standalone Pack Active)
                    </h3>
                    <p className="mt-0.5 text-[13px] text-pos-ink/75 max-w-2xl">
                      Your firm currently subscribes to a standalone pack. Activate {activeSuiteDef.name} to unlock full statutory compliance engines across your practice.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/settings')}
                  className="shrink-0 flex items-center gap-2 rounded-xl bg-pos-ink px-4 py-2.5 text-[13px] font-semibold text-pos-surface shadow-md hover:opacity-90 transition-all"
                >
                  <span>Activate {activeSuiteDef.name} (Uses Your Existing Client Master)</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {children}
        </main>
      </div>

      <CommandPalette />
      <KeyboardShortcuts />
      <SupportWidget />
    </div>
  );
}
