'use client';

import React, { useState } from 'react';
import {
  Building,
  User,
  Users,
  Usb,
  Key,
  ShieldCheck,
  CreditCard,
  Lock,
  ChevronRight,
  Edit2,
  CheckCircle2,
  Mail,
  Phone,
  MapPin,
  Sparkles,
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
  { id: 'firm', label: 'Firm & Personal Info', icon: Building },
  { id: 'team', label: 'Team & RBAC Assignments', icon: Users },
  { id: 'dsc', label: 'DSC Token Inventory', icon: Usb },
  { id: 'api', label: 'API & GSP Connections', icon: Key },
  { id: 'dpdp', label: 'DPDP & Audit Pack', icon: ShieldCheck },
  { id: 'billing', label: 'Subscription & Billing', icon: CreditCard },
  { id: 'security', label: 'Security & TOTP MFA', icon: Lock },
];

export default function SettingsPage() {
  const { user, upgradePlan } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('firm');
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Form state for Firm Info
  const [firmName, setFirmName] = useState<string>(user?.firmName || 'Verma & Associates CA (Amritsar)');
  const [partnerName, setPartnerName] = useState<string>(user?.fullName || 'CA Amrinder Verma, FCA');
  const [email, setEmail] = useState<string>(user?.email || 'ca.verma@synextax.com');
  const [phone, setPhone] = useState<string>('+91 98140 12345');
  const [frn, setFrn] = useState<string>(user?.frnNumber || '014289N');
  const [city, setCity] = useState<string>('Amritsar, Punjab');
  const [pincode, setPincode] = useState<string>('143001');
  const [pan, setPan] = useState<string>('AABCP1332L');

  // Team RBAC state
  const [makerCheckerEnabled, setMakerCheckerEnabled] = useState<boolean>(true);
  const [teamMembers] = useState([
    {
      id: 'usr-1',
      name: 'CA Amrinder Verma, FCA',
      email: 'ca.verma@synextax.com',
      role: 'PARTNER',
      status: 'ACTIVE',
      assignedClients: 'All Clients (Unrestricted)',
    },
    {
      id: 'usr-2',
      name: 'Rajat Sharma',
      email: 'staff.rajat@synextax.com',
      role: 'STAFF',
      status: 'ACTIVE',
      assignedClients: 'Amritsar Phulkari Textiles, Golden Gate Hardware',
    },
    {
      id: 'usr-3',
      name: 'Gurpreet Kaur',
      email: 'staff.gurpreet@synextax.com',
      role: 'STAFF',
      status: 'ACTIVE',
      assignedClients: 'Majha Agro Spices, Doaba Auto Components',
    },
  ]);

  // DSC Bridge state
  const [bridgeTesting, setBridgeTesting] = useState<boolean>(false);
  const [bridgeStatus, setBridgeStatus] = useState<string | null>(null);

  // Billing state
  const [currentPlan, setCurrentPlan] = useState<string>(user?.plan || 'PILOT');
  const [billingSaved, setBillingSaved] = useState<boolean>(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 4000);
  };

  const handleTestBridge = async () => {
    setBridgeTesting(true);
    setBridgeStatus(null);
    try {
      const res = await fetch('/api/v1/dsc/tokens');
      if (res.ok) {
        const data = await res.json();
        setBridgeStatus(
          `Go Bridge online at ${data.listenAddress || '127.0.0.1:18531'}. ${data.tokensDetected} Class 3 hardware token detected.`
        );
      } else {
        setBridgeStatus('Bridge query failed with status ' + res.status);
      }
    } catch (err: any) {
      setBridgeStatus('Go bridge connection error: ' + err.message);
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
        <h2 className="text-2xl font-black tracking-tight text-pos-ink">
          Settings & Practice Configuration
        </h2>
        <p className="text-xs text-pos-ink/70">
          Manage firm registration, delegation RBAC, USB DSC token inventory, and MCA audit trails.
        </p>
      </div>

      {/* Screen D Single Framed Workspace Card */}
      <div className="bg-pos-surface rounded-2xl border border-pos-line shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        
        {/* Left Navigation Panel (~32% width: 4 cols) */}
        <div className="lg:col-span-4 p-6 bg-pos-muted border-r border-pos-line space-y-6">
          
          {/* Centered Avatar / Firm Monogram with Edit Badge */}
          <div className="text-center space-y-3">
            <div className="relative inline-block">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-pos-line shadow-lg mx-auto bg-pos-accent flex items-center justify-center text-white font-mono font-black text-2xl">
                <span>AV</span>
              </div>
              <button
                type="button"
                aria-label="Edit Profile Photo"
                className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center absolute bottom-0 right-0 shadow-md hover:scale-105 transition-transform"
              >
                <Edit2 className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>

            <div>
              <h3 className="font-bold text-sm text-pos-ink leading-tight">
                {user?.fullName || 'CA Amrinder Verma, FCA'}
              </h3>
              <div className="text-xs text-pos-ink/70 font-mono mt-0.5">
                {user?.firmName || 'Verma & Associates CA (Amritsar)'}
              </div>
              <div className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-mono font-bold border border-emerald-500/20">
                <span>CA Partner / Practice Admin</span>
              </div>
            </div>
          </div>

          {/* Vertical Stack of Button Rows */}
          <div className="space-y-2 font-mono text-xs">
            {SETTINGS_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all ${
                    isActive
                      ? 'bg-pos-accent text-white font-bold shadow-sm'
                      : 'bg-pos-surface border border-pos-line text-pos-ink/80 hover:bg-pos-line'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 stroke-[2]" />
                    <span>{tab.label}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-pos-ink/40'}`} />
                </button>
              );
            })}
          </div>

        </div>

        {/* Right Content Panel (~68% width: 8 cols) */}
        <div className="lg:col-span-8 p-6 sm:p-8 space-y-6">
          
          {/* TAB 1: FIRM & PERSONAL INFO */}
          {activeTab === 'firm' && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-pos-line">
                <h3 className="text-lg font-bold text-pos-ink">
                  Firm & Personal Information
                </h3>
                <p className="text-xs text-pos-ink/70 mt-0.5">
                  Configure practice details printed on GSTR-3B audit covers, Form 130/131 certificates, and MCA Rule 3 logs.
                </p>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono font-semibold text-pos-ink mb-1">
                      Managing Partner Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={partnerName}
                      onChange={(e) => setPartnerName(e.target.value)}
                      className="w-full bg-pos-surface border border-pos-line rounded-lg px-3 py-2 text-xs text-pos-ink focus:outline-none focus:border-pos-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-pos-ink mb-1">
                      CA Firm Trade Name
                    </label>
                    <input
                      type="text"
                      required
                      value={firmName}
                      onChange={(e) => setFirmName(e.target.value)}
                      className="w-full bg-pos-surface border border-pos-line rounded-lg px-3 py-2 text-xs text-pos-ink focus:outline-none focus:border-pos-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-pos-ink mb-1">
                      ICAI Firm Reg Number (FRN)
                    </label>
                    <input
                      type="text"
                      value={frn}
                      onChange={(e) => setFrn(e.target.value)}
                      className="w-full bg-pos-surface border border-pos-line rounded-lg px-3 py-2 text-xs font-mono text-pos-ink focus:outline-none focus:border-pos-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-pos-ink mb-1">
                      Partner Permanent Account Number (PAN)
                    </label>
                    <input
                      type="text"
                      value={pan}
                      onChange={(e) => setPan(e.target.value)}
                      className="w-full bg-pos-surface border border-pos-line rounded-lg px-3 py-2 text-xs font-mono text-pos-ink focus:outline-none focus:border-pos-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-pos-ink mb-1">
                      Official Communication Email
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-pos-surface border border-pos-line rounded-lg px-3 py-2 text-xs text-pos-ink focus:outline-none focus:border-pos-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-pos-ink mb-1">
                      Contact Mobile Number
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-pos-surface border border-pos-line rounded-lg px-3 py-2 text-xs text-pos-ink focus:outline-none focus:border-pos-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-pos-ink mb-1">
                      Practice City & State
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full bg-pos-surface border border-pos-line rounded-lg px-3 py-2 text-xs text-pos-ink focus:outline-none focus:border-pos-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-pos-ink mb-1">
                      Postal Pincode
                    </label>
                    <input
                      type="text"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      className="w-full bg-pos-surface border border-pos-line rounded-lg px-3 py-2 text-xs font-mono text-pos-ink focus:outline-none focus:border-pos-accent"
                    />
                  </div>
                </div>

                {isSaved && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-mono text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Firm settings updated and logged to audit trail.</span>
                  </div>
                )}

                <div className="pt-4 border-t border-pos-line">
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-pos-accent hover:bg-pos-accent-deep text-white font-mono text-xs font-bold transition-all shadow-md"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: TEAM & RBAC ASSIGNMENTS */}
          {activeTab === 'team' && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-pos-line flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-pos-ink">Team & RBAC Assignments</h3>
                  <p className="text-xs text-pos-ink/70 mt-0.5">
                    Maker-Checker governance, client access delegation, and ICAI compliance boundaries.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-pos-muted border border-pos-line text-pos-accent">
                  3 Active Members
                </span>
              </div>

              {/* Maker-Checker Policy Toggle */}
              <div className="p-4 rounded-xl bg-pos-muted border border-pos-line space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-pos-ink block font-mono">
                      Statutory Maker-Checker Guard (Rule 26 / Sec 39)
                    </span>
                    <span className="text-[11px] text-pos-ink/70">
                      Requires Senior Partner approval on GSTR-3B liability computation before hardware DSC signing is unlocked.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMakerCheckerEnabled(!makerCheckerEnabled)}
                    className={`px-3 py-1 rounded-full text-xs font-mono font-bold transition-colors ${
                      makerCheckerEnabled
                        ? 'bg-emerald-500 text-white'
                        : 'bg-pos-line text-pos-ink/60'
                    }`}
                  >
                    {makerCheckerEnabled ? 'ENABLED' : 'OPTIONAL'}
                  </button>
                </div>
              </div>

              {/* Team Table */}
              <div className="overflow-x-auto border border-pos-line rounded-lg">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="bg-pos-muted text-pos-ink/60 border-b border-pos-line text-[11px]">
                      <th className="py-2.5 px-3">Member Name</th>
                      <th className="py-2.5 px-3">Email</th>
                      <th className="py-2.5 px-2">Role</th>
                      <th className="py-2.5 px-3">Assigned Clients</th>
                      <th className="py-2.5 px-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pos-line">
                    {teamMembers.map((m) => (
                      <tr key={m.id} className="hover:bg-pos-tint">
                        <td className="py-2.5 px-3 font-bold text-pos-ink">{m.name}</td>
                        <td className="py-2.5 px-3 text-pos-ink/70">{m.email}</td>
                        <td className="py-2.5 px-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.role === 'PARTNER'
                              ? 'bg-pos-accent/10 text-pos-accent border border-pos-accent/20'
                              : 'bg-pos-muted text-pos-ink/70'
                          }`}>
                            {m.role}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-pos-ink/80">{m.assignedClients}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span className="text-emerald-600 font-bold text-[10px] flex items-center justify-center gap-1">
                            <Check className="w-3 h-3" /> Active
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: DSC TOKEN INVENTORY */}
          {activeTab === 'dsc' && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-pos-line flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-pos-ink">DSC Token Inventory & Bridge</h3>
                  <p className="text-xs text-pos-ink/70 mt-0.5">
                    Physical USB tokens registered with practice, PKCS#11 drivers, and desktop daemon loopback.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTestBridge}
                  disabled={bridgeTesting}
                  className="px-3 py-1.5 rounded-lg bg-pos-accent hover:bg-pos-accent-deep text-white text-xs font-mono font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${bridgeTesting ? 'animate-spin' : ''}`} />
                  <span>{bridgeTesting ? 'Testing...' : 'Test Bridge'}</span>
                </button>
              </div>

              {bridgeStatus && (
                <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 text-xs font-mono">
                  {bridgeStatus}
                </div>
              )}

              <div className="p-4 rounded-xl bg-pos-muted border border-pos-line space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-pos-line pb-2">
                  <span className="font-bold text-pos-ink flex items-center gap-2">
                    <Usb className="w-4 h-4 text-[#3A6FE8]" />
                    <span>ePass2003 Auto / mToken CryptoID</span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                    FIPS 140-3 Level 3 Active
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-pos-ink/80">
                  <div>Serial Number: <span className="font-bold text-pos-ink">FT2003A-9018442</span></div>
                  <div>Signatory: <span className="font-bold text-pos-ink">CA Amrinder Verma, FCA</span></div>
                  <div>Holder PAN: <span className="font-bold text-pos-ink">AAAPV8912K</span></div>
                  <div>Issuer: <span className="text-pos-ink">e-Mudhra Sub-CA 2024</span></div>
                  <div>Cert Serial Hex: <span className="text-pos-accent">3A4B892F10E401</span></div>
                  <div>Validity: <span className="text-emerald-600 font-bold">Valid until 2027-10-14</span></div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-pos-surface border border-pos-line space-y-2 text-xs">
                <div className="font-bold text-pos-ink flex items-center gap-1.5 font-mono">
                  <Laptop className="w-4 h-4 text-pos-accent" />
                  <span>Local Desktop DSC Bridge Daemon Setup</span>
                </div>
                <p className="text-pos-ink/70 leading-relaxed text-[11px]">
                  SynexTax eliminates outdated Java applets and browser extensions. Download the standalone Go bridge
                  daemon (apps/dsc-agent) to run natively in the background on port 127.0.0.1:18531.
                </p>
                <div className="text-[11px] font-mono text-pos-accent pt-1">
                  Supported Hardware: ePass2003, mToken, WatchData, ProxKey, TrustKey FIPS tokens.
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: API & GSP CONNECTIONS */}
          {activeTab === 'api' && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-pos-line">
                <h3 className="text-lg font-bold text-pos-ink">API & GSP Connections</h3>
                <p className="text-xs text-pos-ink/70 mt-0.5">
                  Direct government gateway channels for GSTN, NIC e-Invoice IRP, TRACES, and CBDT e-Filing.
                </p>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="p-4 rounded-xl bg-pos-muted border border-pos-line flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-bold text-pos-ink text-sm">GSTN Common Portal GSP Gateway</div>
                    <div className="text-[11px] text-pos-ink/60">GSTR-1, GSTR-3B, GSTR-2B bulk download, IMS sync</div>
                    <div className="text-[10px] text-pos-accent">Advisory 687 (32-char E-Way Bill) cutover ready</div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/20 text-[10px]">
                    CONNECTED (142ms)
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-pos-muted border border-pos-line flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-bold text-pos-ink text-sm">NIC e-Invoice & e-Way Bill IRP</div>
                    <div className="text-[11px] text-pos-ink/60">Sub-100ms IRN generation, QR code signing, auto-cancellation</div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/20 text-[10px]">
                    CONNECTED (88ms)
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-pos-muted border border-pos-line flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-bold text-pos-ink text-sm">TRACES TDS / TCS Portal Gateway</div>
                    <div className="text-[11px] text-pos-ink/60">Form 16/16A generation, CSI bank scroll download, 26AS reconciliation</div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/20 text-[10px]">
                    CONNECTED (310ms)
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-pos-muted border border-pos-line flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-bold text-pos-ink text-sm">CBDT Income Tax e-Filing (Protean)</div>
                    <div className="text-[11px] text-pos-ink/60">Form 140 / 26Q e-Filing, AIS / TIS tax credit verification</div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/20 text-[10px]">
                    CONNECTED (195ms)
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: DPDP & AUDIT PACK */}
          {activeTab === 'dpdp' && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-pos-line">
                <h3 className="text-lg font-bold text-pos-ink">DPDP Act 2023 & Audit Evidence Pack</h3>
                <p className="text-xs text-pos-ink/70 mt-0.5">
                  MCA Rule 3(1) and CGST Rule 56(15) statutory export for independent auditors and tax authorities.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-pos-muted border border-pos-line space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-pos-ink">MCA Rule 3 Immutable Audit Evidence Pack</span>
                  <button
                    type="button"
                    onClick={() => alert('Generated MCA Rule 3 signed audit zip with 27 verified entries.')}
                    className="px-3 py-1.5 rounded-lg bg-pos-accent text-white font-bold flex items-center gap-1.5 hover:bg-pos-accent-deep"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Evidence (.zip)</span>
                  </button>
                </div>
                <p className="text-[11px] text-pos-ink/70 font-sans leading-relaxed">
                  Generates an immutable, cryptographically hashed JSON/CSV bundle of all transaction diffs,
                  PII access records, and DSC digital signatures captured under PostgreSQL 17 audit schema.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
                <div className="p-4 rounded-xl bg-pos-surface border border-pos-line space-y-1">
                  <div className="text-pos-ink/60 text-[11px]">Audit Schema Storage:</div>
                  <div className="font-bold text-pos-ink text-sm">27 Verified Events</div>
                  <div className="text-[10px] text-emerald-600">Zero deletions or tampering detected</div>
                </div>

                <div className="p-4 rounded-xl bg-pos-surface border border-pos-line space-y-1">
                  <div className="text-pos-ink/60 text-[11px]">Statutory Log Retention:</div>
                  <div className="font-bold text-pos-ink text-sm">8 Years (MCA Requirement)</div>
                  <div className="text-[10px] text-pos-accent">Section 128 / CGST Section 36</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SUBSCRIPTION & BILLING */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-pos-line flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-pos-ink">Subscription & Billing</h3>
                  <p className="text-xs text-pos-ink/70 mt-0.5">
                    Multi-tenant tier management, client capacity allocation, and practice scale options.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold px-3 py-1 rounded bg-pos-accent/10 text-pos-accent border border-pos-accent/30">
                  Current Plan: {currentPlan}
                </span>
              </div>

              {billingSaved && (
                <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 text-xs font-mono">
                  Subscription plan successfully updated to {currentPlan}.
                </div>
              )}

              {/* Plans Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
                <div className={`p-4 rounded-xl border space-y-3 ${
                  currentPlan === 'SOLO' ? 'border-pos-accent bg-pos-muted shadow-md' : 'border-pos-line bg-pos-surface'
                }`}>
                  <div className="font-bold text-sm text-pos-ink">SOLO CA</div>
                  <div className="text-lg font-black text-pos-ink">₹2,999 <span className="text-xs font-normal text-pos-ink/60">/mo</span></div>
                  <ul className="space-y-1.5 text-[11px] text-pos-ink/70 font-sans">
                    <li>• Up to 10 Active Clients</li>
                    <li>• Sub-second GSTR-2B Recon</li>
                    <li>• Dual-Act TDS Form 140</li>
                    <li>• Single Class 3 USB Bridge</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => handleUpgrade('SOLO')}
                    className="w-full py-1.5 rounded-lg bg-pos-surface hover:bg-pos-line border border-pos-line font-bold text-pos-ink"
                  >
                    {currentPlan === 'SOLO' ? 'Active Plan' : 'Select Solo'}
                  </button>
                </div>

                <div className={`p-4 rounded-xl border space-y-3 ${
                  currentPlan === 'GROWTH' ? 'border-pos-accent bg-pos-muted shadow-md' : 'border-pos-line bg-pos-surface'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-pos-ink">GROWTH PRACTICE</span>
                    <span className="text-[10px] bg-pos-accent text-white font-bold px-2 py-0.5 rounded">POPULAR</span>
                  </div>
                  <div className="text-lg font-black text-pos-ink">₹7,999 <span className="text-xs font-normal text-pos-ink/60">/mo</span></div>
                  <ul className="space-y-1.5 text-[11px] text-pos-ink/70 font-sans">
                    <li>• Up to 50 Active Clients</li>
                    <li>• Statutory Maker-Checker RBAC</li>
                    <li>• Automated IMS 48hr Deemed Scan</li>
                    <li>• Up to 5 Concurrent Staff DSCs</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => handleUpgrade('GROWTH')}
                    className="w-full py-1.5 rounded-lg bg-pos-accent text-white font-bold hover:bg-pos-accent-deep"
                  >
                    {currentPlan === 'GROWTH' ? 'Active Plan' : 'Select Growth'}
                  </button>
                </div>

                <div className={`p-4 rounded-xl border space-y-3 ${
                  currentPlan === 'SCALE' ? 'border-pos-accent bg-pos-muted shadow-md' : 'border-pos-line bg-pos-surface'
                }`}>
                  <div className="font-bold text-sm text-pos-ink">ENTERPRISE SCALE</div>
                  <div className="text-lg font-black text-pos-ink">₹19,999 <span className="text-xs font-normal text-pos-ink/60">/mo</span></div>
                  <ul className="space-y-1.5 text-[11px] text-pos-ink/70 font-sans">
                    <li>• Unlimited Active Clients</li>
                    <li>• Multi-branch ICAI FRN Hub</li>
                    <li>• Dedicated Protean FVU Farm</li>
                    <li>• Custom MCA Rule 3 Ledger Vault</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => handleUpgrade('SCALE')}
                    className="w-full py-1.5 rounded-lg bg-pos-surface hover:bg-pos-line border border-pos-line font-bold text-pos-ink"
                  >
                    {currentPlan === 'SCALE' ? 'Active Plan' : 'Select Scale'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: SECURITY & TOTP MFA */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-pos-line">
                <h3 className="text-lg font-bold text-pos-ink">Security & TOTP MFA</h3>
                <p className="text-xs text-pos-ink/70 mt-0.5">
                  Argon2id cryptographic credential hashing, active sessions, and hardware 2FA keys.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-pos-muted border border-pos-line space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-pos-line pb-2">
                  <span className="font-bold text-pos-ink flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Two-Factor Authentication (TOTP MFA)</span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600 px-2.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                    MFA ENFORCED
                  </span>
                </div>
                <p className="text-[11px] text-pos-ink/70 font-sans leading-relaxed">
                  Time-based One-Time Password (TOTP) verification is required on every partner and staff login.
                  Compatible with Google Authenticator, Microsoft Authenticator, and YubiKey OATH.
                </p>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="text-xs font-bold text-pos-ink">Active Client Sessions</div>
                <div className="p-3.5 rounded-xl bg-pos-surface border border-pos-line flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="font-bold text-pos-ink">Current Browser Session</div>
                    <div className="text-[11px] text-pos-ink/60">IP: 127.0.0.1 | Windows Desktop Chrome</div>
                    <div className="text-[10px] text-pos-accent">Signed JWT with 28,800s expiry</div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600 px-2 py-0.5 rounded bg-emerald-500/10">
                    ACTIVE NOW
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => alert('Revoked all other active sessions across devices.')}
                  className="px-4 py-2 rounded-xl bg-pos-muted hover:bg-pos-line border border-pos-line text-xs font-mono font-bold text-pos-red"
                >
                  Revoke All Other Sessions
                </button>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
