'use client';

import React, { useState } from 'react';
import { TeamPanel } from '../../../components/settings/TeamPanel';
import { ConnectionsPanel } from '../../../components/settings/ConnectionsPanel';
import { BackupsPanel } from '../../../components/settings/BackupsPanel';
import { EvidencePanel } from '../../../components/settings/EvidencePanel';
import { FirmPanel } from '../../../components/settings/FirmPanel';
import { SecurityPanel } from '../../../components/settings/SecurityPanel';
import {
  Building,
  User,
  Users,
  Usb,
  Key,
  HardDrive,
  ShieldCheck,
  CreditCard,
  Lock,
  ChevronRight,
  Edit2,
  CheckCircle2,
  Mail,
  Phone,
  MapPin,
  Shield,
  Activity,
  Download,
  Trash2,
  Plus,
  RefreshCw,
  Clock,
  Laptop,
  Check,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

interface SettingsTab {
  id: string;
  label: string;
  icon: any;
}

const SETTINGS_TABS: SettingsTab[] = [
  { id: 'firm', label: 'Firm', icon: Building },
  { id: 'team', label: 'Team and access', icon: Users },
  { id: 'dsc', label: 'DSC Token Inventory', icon: Usb },
  { id: 'api', label: 'Connections', icon: Key },
  { id: 'backups', label: 'Backups', icon: HardDrive },
  { id: 'dpdp', label: 'Audit evidence', icon: ShieldCheck },
  { id: 'billing', label: 'Subscription & Billing', icon: CreditCard },
  { id: 'security', label: 'Security & TOTP MFA', icon: Lock },
];

export default function SettingsPage() {
  const { user, upgradePlan } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('firm');

  // DSC Bridge state
  const [bridgeTesting, setBridgeTesting] = useState<boolean>(false);
  const [bridgeStatus, setBridgeStatus] = useState<string | null>(null);

  // Billing state
  const [currentPlan, setCurrentPlan] = useState<string>(user?.plan || 'PILOT');
  const [billingSaved, setBillingSaved] = useState<boolean>(false);

  const handleTestBridge = async () => {
    setBridgeTesting(true);
    setBridgeStatus(null);
    try {
      // Asks the agent on this computer directly; the server cannot see local tokens.
      const res = await fetch(`${process.env.NEXT_PUBLIC_DSC_AGENT_URL || 'http://127.0.0.1:15850'}/health`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const n = Number(data.tokensDetected ?? 0);
        setBridgeStatus(`The desktop agent is running (version ${data.version ?? 'unknown'}). ${n === 0 ? 'No signing certificate found; plug in the DSC token.' : `${n} signing certificate${n === 1 ? '' : 's'} found.`}`);
      } else {
        setBridgeStatus('The desktop agent answered with status ' + res.status + '.');
      }
    } catch {
      setBridgeStatus('The desktop agent is not running on this computer.');
    } finally {
      setBridgeTesting(false);
    }
  };

  const handleUpgrade = (plan: 'SOLO' | 'GROWTH' | 'SCALE') => {
    if (upgradePlan) upgradePlan(plan);
    setCurrentPlan(plan);
    setBillingSaved(true);
    setTimeout(() => setBillingSaved(false), 4000);
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 font-sans">
      
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-pos-ink">
          Settings
        </h2>
        <p className="text-xs text-pos-ink/70">
          Your firm, your team, DSC tokens, connections and the audit evidence.
        </p>
      </div>

      {/* Screen D Single Framed Workspace Card */}
      <div className="bg-pos-surface rounded-2xl border border-pos-line shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        
        {/* Left Navigation Panel (~32% width: 4 cols) */}
        <div className="lg:col-span-4 p-6 bg-pos-muted border-r border-pos-line space-y-6">
          
          {/* Centered Avatar / Firm Monogram with Edit Badge */}
          <div className="text-center space-y-3">
            <div className="relative inline-block">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-pos-line shadow-lg mx-auto bg-pos-accent flex items-center justify-center text-white font-semibold text-2xl">
                <span>AV</span>
              </div>
              <button
                type="button"
                aria-label="Edit Profile Photo"
                className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center absolute bottom-0 right-0 shadow-md transition-transform"
              >
                <Edit2 className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>

            <div>
              <h3 className="font-semibold text-sm text-pos-ink leading-tight">
                {user?.fullName || 'CA Amrinder Verma, FCA'}
              </h3>
              <div className="text-xs text-pos-ink/70 mt-0.5">
                {user?.firmName || 'Verma & Associates CA (Amritsar)'}
              </div>
              <div className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[12px] font-semibold border border-emerald-500/20">
                <span>CA Partner / Practice Admin</span>
              </div>
            </div>
          </div>

          {/* Vertical Stack of Button Rows */}
          <div className="space-y-2 text-xs">
            {SETTINGS_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-colors ${
                    isActive
                      ? 'bg-pos-accent text-white font-semibold shadow-sm'
                      : 'bg-pos-surface border border-pos-line text-pos-ink/80 hover:bg-pos-line'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 stroke-[2]" />
                    <span>{tab.label}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-pos-ink/60'}`} />
                </button>
              );
            })}
          </div>

        </div>

        {/* Right Content Panel (~68% width: 8 cols) */}
        <div className="lg:col-span-8 p-6 sm:p-8 space-y-6">
          
          {/* TAB 1: FIRM & PERSONAL INFO */}
          {activeTab === 'firm' && <FirmPanel />}

          {/* TAB 2: TEAM & RBAC ASSIGNMENTS */}
          {activeTab === 'team' && <TeamPanel />}

          {/* TAB 3: DSC TOKEN INVENTORY */}
          {activeTab === 'dsc' && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-pos-line flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-pos-ink">DSC Token Inventory & Bridge</h3>
                  <p className="text-xs text-pos-ink/70 mt-0.5">
                    The desktop agent on each computer, and the DSC tokens it can see.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTestBridge}
                  disabled={bridgeTesting}
                  className="px-3 py-1.5 rounded-lg bg-pos-accent hover:bg-pos-accent-deep text-white text-xs font-mono font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${bridgeTesting ? 'animate-spin' : ''}`} />
                  <span>{bridgeTesting ? 'Testing...' : 'Test Bridge'}</span>
                </button>
              </div>

              {bridgeStatus && (
                <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 text-xs">
                  {bridgeStatus}
                </div>
              )}

              <div className="p-4 rounded-xl bg-pos-muted border border-pos-line space-y-1.5 text-xs">
                <div className="font-semibold text-pos-ink flex items-center gap-2">
                  <Usb className="w-4 h-4 text-[#3A6FE8]" />
                  <span>Tokens are read on each computer</span>
                </div>
                <p className="text-[12px] text-pos-ink/70 leading-relaxed">
                  The desktop agent lists the DSC certificates Windows sees on the computer it runs on; the server never holds them. Sign returns under Audit, DSC signing.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-pos-surface border border-pos-line space-y-2 text-xs">
                <div className="font-semibold text-pos-ink flex items-center gap-1.5">
                  <Laptop className="w-4 h-4 text-pos-accent" />
                  <span>Local Desktop DSC Bridge Daemon Setup</span>
                </div>
                <p className="text-pos-ink/70 leading-relaxed text-[12px]">
                  No Java applet or browser extension. The SynTax agent (apps/dsc-agent) runs on the computer at 127.0.0.1:15850 and
                  signs through the token driver installed with the DSC; the token's own window asks for the PIN.
                </p>
                <div className="text-[12px] text-pos-accent pt-1">
                  Works with tokens whose driver registers the certificate with Windows: ePass2003, mToken, WatchData ProxKey, TrustKey and others.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'api' && <ConnectionsPanel />}
          {activeTab === 'backups' && <BackupsPanel />}

          {/* TAB 5: DPDP & AUDIT PACK */}
          {activeTab === 'dpdp' && <EvidencePanel />}

          {/* TAB 6: SUBSCRIPTION & BILLING */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-pos-line flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-pos-ink">Subscription & Billing</h3>
                  <p className="text-xs text-pos-ink/70 mt-0.5">
                    Multi-tenant tier management, client capacity allocation, and practice scale options.
                  </p>
                </div>
                <span className="text-xs font-mono font-semibold px-3 py-1 rounded bg-pos-accent/10 text-pos-accent border border-pos-accent/30">
                  Current Plan: {currentPlan}
                </span>
              </div>

              {billingSaved && (
                <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 text-xs">
                  Subscription plan successfully updated to {currentPlan}.
                </div>
              )}

              {/* Plans Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className={`p-4 rounded-xl border space-y-3 ${
                  currentPlan === 'SOLO' ? 'border-pos-accent bg-pos-muted shadow-md' : 'border-pos-line bg-pos-surface'
                }`}>
                  <div className="font-semibold text-sm text-pos-ink">SOLO CA</div>
                  <div className="text-lg font-semibold text-pos-ink">₹2,999 <span className="text-xs font-normal text-pos-ink/60">/mo</span></div>
                  <ul className="space-y-1.5 text-[12px] text-pos-ink/70 font-sans">
                    <li>• Up to 10 Active Clients</li>
                    <li>• Sub-second GSTR-2B Recon</li>
                    <li>• Dual-Act TDS Form 140</li>
                    <li>• Single Class 3 USB Bridge</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => handleUpgrade('SOLO')}
                    className="w-full py-1.5 rounded-lg bg-pos-surface hover:bg-pos-line border border-pos-line font-semibold text-pos-ink"
                  >
                    {currentPlan === 'SOLO' ? 'Active Plan' : 'Select Solo'}
                  </button>
                </div>

                <div className={`p-4 rounded-xl border space-y-3 ${
                  currentPlan === 'GROWTH' ? 'border-pos-accent bg-pos-muted shadow-md' : 'border-pos-line bg-pos-surface'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-pos-ink">GROWTH PRACTICE</span>
                    <span className="text-[12px] bg-pos-accent text-white font-semibold px-2 py-0.5 rounded">POPULAR</span>
                  </div>
                  <div className="text-lg font-semibold text-pos-ink">₹7,999 <span className="text-xs font-normal text-pos-ink/60">/mo</span></div>
                  <ul className="space-y-1.5 text-[12px] text-pos-ink/70 font-sans">
                    <li>• Up to 50 Active Clients</li>
                    <li>• Statutory Maker-Checker RBAC</li>
                    <li>• Automated IMS 48hr Deemed Scan</li>
                    <li>• Up to 5 Concurrent Staff DSCs</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => handleUpgrade('GROWTH')}
                    className="w-full py-1.5 rounded-lg bg-pos-accent text-white font-semibold hover:bg-pos-accent-deep"
                  >
                    {currentPlan === 'GROWTH' ? 'Active Plan' : 'Select Growth'}
                  </button>
                </div>

                <div className={`p-4 rounded-xl border space-y-3 ${
                  currentPlan === 'SCALE' ? 'border-pos-accent bg-pos-muted shadow-md' : 'border-pos-line bg-pos-surface'
                }`}>
                  <div className="font-semibold text-sm text-pos-ink">ENTERPRISE SCALE</div>
                  <div className="text-lg font-semibold text-pos-ink">₹19,999 <span className="text-xs font-normal text-pos-ink/60">/mo</span></div>
                  <ul className="space-y-1.5 text-[12px] text-pos-ink/70 font-sans">
                    <li>• Unlimited Active Clients</li>
                    <li>• Multi-branch ICAI FRN Hub</li>
                    <li>• Dedicated Protean FVU Farm</li>
                    <li>• Custom MCA Rule 3 Ledger Vault</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => handleUpgrade('SCALE')}
                    className="w-full py-1.5 rounded-lg bg-pos-surface hover:bg-pos-line border border-pos-line font-semibold text-pos-ink"
                  >
                    {currentPlan === 'SCALE' ? 'Active Plan' : 'Select Scale'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: SECURITY & TOTP MFA */}
          {activeTab === 'security' && <SecurityPanel />}

        </div>

      </div>

    </div>
  );
}
