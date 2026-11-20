'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  Building2,
  Receipt,
  GitCompare,
  Percent,
  ShieldCheck,
  Settings,
  Usb,
  Sparkles,
  Crown,
  X,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavItem {
  label: string;
  href: string;
  icon: any;
  hotkey: string;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Control Tower',
    href: '/dashboard',
    icon: Users,
    hotkey: 'Alt+1',
  },
  {
    label: 'Client Master',
    href: '/clients',
    icon: Building2,
    hotkey: 'Alt+2',
  },
  {
    label: 'Sales Invoicing',
    href: '/gst',
    icon: Receipt,
    hotkey: 'Alt+3',
  },
  {
    label: 'GST & IMS Recon',
    href: '/gst/recon-2b',
    icon: GitCompare,
    hotkey: 'Alt+4',
    badge: '14th Guard',
  },
  {
    label: 'Dual-Act TDS Hub',
    href: '/tds',
    icon: Percent,
    hotkey: 'Alt+5',
    badge: '281N',
  },
  {
    label: 'Audit & Invariant Radar',
    href: '/audit',
    icon: ShieldCheck,
    hotkey: 'Alt+6',
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    hotkey: 'Alt+7',
  },
];

export function DashboardNav() {
  const pathname = usePathname();
  const { user, upgradePlan } = useAuth();
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);

  return (
    <>
      <div className="bg-[#0E0F10] border-b border-[#24272B] px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-4">
        
        {/* Module Navigation Tabs */}
        <nav className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none font-mono">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href);

            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-[#52E888] text-[#0E0F10] shadow-sm'
                    : 'text-[#9BA1AA] hover:text-white hover:bg-[#17191C]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                      isActive
                        ? 'bg-[#0E0F10] text-[#52E888]'
                        : 'bg-[#17191C] text-[#52E888] border border-[#24272B]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
                <span
                  className={`text-[9px] hidden xl:inline ${
                    isActive ? 'text-[#0E0F10]/70' : 'text-slate-600'
                  }`}
                >
                  [{item.hotkey}]
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Right Status Bars: Hardware DSC + Trial Status Pill */}
        <div className="flex items-center gap-3">
          
          {/* Trial / Plan Status Pill */}
          {user?.plan === 'TRIAL' ? (
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#52AEFA]/15 hover:bg-[#52AEFA]/25 border border-[#52AEFA]/40 text-[#52AEFA] text-xs font-mono font-semibold transition-all"
            >
              <Crown className="w-3.5 h-3.5 text-[#52AEFA]" />
              <span>14-Day Trial ({user.activeClientsCount}/{user.maxTrialClients} Clients)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#0E0F10] text-white border border-[#24272B]">
                Upgrade
              </span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#52E888]/15 border border-[#52E888]/30 text-[#52E888] text-xs font-mono font-bold">
              <Sparkles className="w-3 h-3" />
              <span>{user?.plan || 'GROWTH'} Firm Active</span>
            </div>
          )}

          {/* Hardware DSC Bridge Status Pill */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-[6px] bg-[#17191C] border border-[#24272B] text-[11px] font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#52E888] animate-pulse" />
              <Usb className="w-3.5 h-3.5 text-[#52E888]" />
              <span className="text-[#9BA1AA]">DSC Bridge:</span>
            </div>
            <span className="text-[#52E888] font-medium">ePass2003 (FIPS 140-3)</span>
          </div>

        </div>

      </div>

      {/* Plan Upgrade Drawer / Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0E0F10] border border-[#24272B] rounded-[22px] max-w-xl w-full p-6 text-white space-y-6 shadow-2xl relative">
            <button
              onClick={() => setShowUpgradeModal(false)}
              className="absolute top-4 right-4 text-[#9BA1AA] hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 text-xs font-mono text-[#52E888] uppercase tracking-wider font-bold">
                <Crown className="w-4 h-4 text-[#52E888]" />
                <span>Production Scale Activation</span>
              </div>
              <h3 className="text-xl font-bold font-sans">Upgrade to Unlock Live Government Submissions</h3>
              <p className="text-xs text-[#9BA1AA] leading-relaxed">
                You are currently testing SynexTax in 14-Day Free Guided Trial Mode with 2 pre-seeded Amritsar clients.
                Subscribe to activate live GSTN RETFILE submissions, unlimited clients, and staff maker-checker delegation.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div
                onClick={() => {
                  upgradePlan('GROWTH');
                  setShowUpgradeModal(false);
                }}
                className="p-4 rounded-xl bg-gradient-to-b from-[#17191C] to-[#121417] border-2 border-[#52E888] cursor-pointer hover:border-[#3BD975] transition-all space-y-2"
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-[#52E888]">Growth Firm</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#52E888] text-[#0E0F10] font-bold">
                    Popular
                  </span>
                </div>
                <div className="text-2xl font-black text-white">₹15,999<span className="text-xs text-[#9BA1AA]">/yr</span></div>
                <div className="text-[11px] text-slate-300">200 GSTINs, 100 TANs, Unlimited Seats, 9AM-10PM Hotline</div>
              </div>

              <div
                onClick={() => {
                  upgradePlan('SOLO');
                  setShowUpgradeModal(false);
                }}
                className="p-4 rounded-xl bg-[#17191C] border border-[#24272B] cursor-pointer hover:border-slate-600 transition-all space-y-2"
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white">Solo Practice</span>
                  <span className="text-[10px] text-[#9BA1AA]">UPI AutoPay</span>
                </div>
                <div className="text-2xl font-black text-white">₹8,999<span className="text-xs text-[#9BA1AA]">/yr</span></div>
                <div className="text-[11px] text-slate-400">50 GSTINs, 25 TANs, 3 Seats, 4-Pass Recon</div>
              </div>
            </div>

            <div className="text-center text-xs font-mono text-[#9BA1AA]">
              No per-PC node fees. Includes free data import from SmartBiz and CompuTax.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
