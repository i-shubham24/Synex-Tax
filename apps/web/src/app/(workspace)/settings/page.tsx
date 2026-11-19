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
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('firm');
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Form state
  const [firmName, setFirmName] = useState<string>(user?.firmName || 'Verma & Associates CA (Amritsar)');
  const [partnerName, setPartnerName] = useState<string>(user?.fullName || 'CA Amrinder Verma, FCA');
  const [email, setEmail] = useState<string>(user?.email || 'ca.verma@synextax.com');
  const [phone, setPhone] = useState<string>('+91 98140 12345');
  const [frn, setFrn] = useState<string>(user?.frnNumber || '014289N');
  const [city, setCity] = useState<string>('Amritsar, Punjab');
  const [pincode, setPincode] = useState<string>('143001');
  const [pan, setPan] = useState<string>('AABCP1332L');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 4000);
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 font-sans">
      
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-black tracking-tight text-[#0E0F10] dark:text-white">
          Settings & Practice Configuration
        </h2>
        <p className="text-xs text-[#646A73] dark:text-[#9BA1AA]">
          Manage firm registration, delegation RBAC, USB DSC token inventory, and MCA audit trails.
        </p>
      </div>

      {/* Screen D Single Framed Workspace Card */}
      <div className="bg-white dark:bg-[#17191C] rounded-2xl border border-[#E5E7EB] dark:border-[#24272B] shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        
        {/* Left Navigation Panel (~32% width: 4 cols) */}
        <div className="lg:col-span-4 p-6 bg-[#FAFAFB] dark:bg-[#141619] border-r border-[#E5E7EB] dark:border-[#24272B] space-y-6">
          
          {/* Centered Avatar / Firm Monogram with Edit Badge matching Settings reference */}
          <div className="text-center space-y-3">
            <div className="relative inline-block">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white dark:border-[#24272B] shadow-lg mx-auto bg-[#2F8AE0] flex items-center justify-center text-white font-mono font-black text-2xl">
                <img
                  src="/references/afd20a006da425b639f3965af144b120.webp"
                  alt="Managing Partner"
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                type="button"
                aria-label="Edit Profile Photo"
                className="w-7 h-7 rounded-full bg-[#13A83C] text-[#0E0F10] flex items-center justify-center absolute bottom-0 right-0 shadow-md hover:scale-105 transition-transform"
              >
                <Edit2 className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>

            <div>
              <h3 className="font-bold text-sm text-[#0E0F10] dark:text-white leading-tight">
                {user?.fullName || 'CA Amrinder Verma, FCA'}
              </h3>
              <div className="text-xs text-[#646A73] dark:text-[#9BA1AA] font-mono mt-0.5">
                {user?.firmName || 'Verma & Associates (Amritsar)'}
              </div>
              <div className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full bg-[#DCFCE7] text-[#15803D] text-[10px] font-mono font-bold">
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
                      ? 'bg-[#2F8AE0] text-white font-bold shadow-sm'
                      : 'bg-white dark:bg-[#17191C] border border-[#E5E7EB] dark:border-[#24272B] text-[#0E0F10] dark:text-slate-300 hover:bg-[#F1F5F9] dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 stroke-[2]" />
                    <span>{tab.label}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-[#646A73]'}`} />
                </button>
              );
            })}
          </div>

        </div>

        {/* Right Content Panel (~68% width: 8 cols) */}
        <div className="lg:col-span-8 p-6 sm:p-8 space-y-6">
          
          {/* Section Heading & Description */}
          <div className="pb-4 border-b border-[#E5E7EB] dark:border-[#24272B]">
            <h3 className="text-lg font-bold text-[#0E0F10] dark:text-white font-sans">
              Firm & Personal Information
            </h3>
            <p className="text-xs text-[#646A73] dark:text-[#9BA1AA] mt-0.5">
              Configure practice details printed on GSTR-3B audit covers, Form 130/131 certificates, and MCA Rule 3 logs.
            </p>
          </div>

          {/* 2-Column Form Input Grid */}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              <div>
                <label className="block text-xs font-mono font-semibold text-[#0E0F10] dark:text-white mb-1">
                  Managing Partner Full Name
                </label>
                <input
                  type="text"
                  required
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  className="w-full bg-white dark:bg-[#0E0F10] border border-[#E5E7EB] dark:border-[#24272B] rounded-lg px-3 py-2 text-xs font-sans text-[#0E0F10] dark:text-white focus:outline-none focus:border-[#2F8AE0]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-[#0E0F10] dark:text-white mb-1">
                  CA Firm Trade Name
                </label>
                <input
                  type="text"
                  required
                  value={firmName}
                  onChange={(e) => setFirmName(e.target.value)}
                  className="w-full bg-white dark:bg-[#0E0F10] border border-[#E5E7EB] dark:border-[#24272B] rounded-lg px-3 py-2 text-xs font-sans text-[#0E0F10] dark:text-white focus:outline-none focus:border-[#2F8AE0]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-[#0E0F10] dark:text-white mb-1">
                  ICAI Firm Reg Number (FRN)
                </label>
                <input
                  type="text"
                  value={frn}
                  onChange={(e) => setFrn(e.target.value)}
                  className="w-full bg-white dark:bg-[#0E0F10] border border-[#E5E7EB] dark:border-[#24272B] rounded-lg px-3 py-2 text-xs font-mono text-[#0E0F10] dark:text-white focus:outline-none focus:border-[#2F8AE0]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-[#0E0F10] dark:text-white mb-1">
                  Partner Permanent Account Number (PAN)
                </label>
                <input
                  type="text"
                  value={pan}
                  onChange={(e) => setPan(e.target.value)}
                  className="w-full bg-white dark:bg-[#0E0F10] border border-[#E5E7EB] dark:border-[#24272B] rounded-lg px-3 py-2 text-xs font-mono text-[#0E0F10] dark:text-white focus:outline-none focus:border-[#2F8AE0]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-[#0E0F10] dark:text-white mb-1">
                  Official Communication Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white dark:bg-[#0E0F10] border border-[#E5E7EB] dark:border-[#24272B] rounded-lg px-3 py-2 text-xs font-sans text-[#0E0F10] dark:text-white focus:outline-none focus:border-[#2F8AE0]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-[#0E0F10] dark:text-white mb-1">
                  Contact Mobile Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-white dark:bg-[#0E0F10] border border-[#E5E7EB] dark:border-[#24272B] rounded-lg px-3 py-2 text-xs font-sans text-[#0E0F10] dark:text-white focus:outline-none focus:border-[#2F8AE0]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-[#0E0F10] dark:text-white mb-1">
                  Practice City & State
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-white dark:bg-[#0E0F10] border border-[#E5E7EB] dark:border-[#24272B] rounded-lg px-3 py-2 text-xs font-sans text-[#0E0F10] dark:text-white focus:outline-none focus:border-[#2F8AE0]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-[#0E0F10] dark:text-white mb-1">
                  Postal Pincode
                </label>
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  className="w-full bg-white dark:bg-[#0E0F10] border border-[#E5E7EB] dark:border-[#24272B] rounded-lg px-3 py-2 text-xs font-mono text-[#0E0F10] dark:text-white focus:outline-none focus:border-[#2F8AE0]"
                />
              </div>

            </div>

            {isSaved && (
              <div className="p-3 rounded-lg bg-[#DCFCE7] text-[#15803D] font-mono text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Firm settings updated and logged to audit trail.</span>
              </div>
            )}

            {/* Centered / Left-Aligned Bold Emerald Green Save Changes Button */}
            <div className="pt-4 border-t border-[#E5E7EB] dark:border-[#24272B]">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-mono text-xs font-bold transition-all shadow-md shadow-[#16A34A]/20"
              >
                Save Changes
              </button>
            </div>
          </form>

        </div>

      </div>

    </div>
  );
}
