'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  Percent,
  CheckCircle2,
  ShieldAlert,
  Calculator,
  DownloadCloud,
  FileCheck2,
  Building,
  KeyRound,
  Layers,
  ArrowRight,
  ShieldCheck,
  Check,
  Zap,
} from 'lucide-react';

interface ModuleItem {
  id: string;
  badge: string;
  title: string;
  actReference: string;
  description: string;
  features: string[];
  statutoryRule: string;
}

const STATUTORY_MODULES: ModuleItem[] = [
  {
    id: 'tds-returns',
    badge: 'Dual-Act TDS/TCS',
    title: 'Quarterly Return Filing Engine (Forms 24Q, 26Q, 27Q, 27EQ)',
    actReference: 'Sections 200(3), 206C(3) & Form 130 / 131',
    description:
      'Comprehensive return preparation suite for Salaries, Domestic Non-Salary vendors, Non-Resident remittances, and TCS collection. Ready for dual compliance under the 1961 Act and the new Income-tax Act, 2025.',
    features: [
      'Form 24Q (Salary): Computes Annexure I & II with old vs new tax regime comparisons.',
      'Form 26Q (Non-Salary): Sections 194C, 194J, 194Q, 194H, 194I, 194A with threshold tracking.',
      'Form 27Q (Non-Resident): Section 195 remittances with DTAA relief rates & 15CA/CB cross-checks.',
      'Form 27EQ (TCS): Section 206C(1), 206C(1F) motor vehicles, and 206C(1H) sale of goods.',
      'Form 130 & 131: First-in-industry support for the 2025 Act return schedules.',
    ],
    statutoryRule: 'Section 200(3): Mandatory quarterly submission within 31 days of quarter close.',
  },
  {
    id: 'itns-challan',
    badge: 'ITNS 281 vs 281N',
    title: 'Dual-Act Challan Allocation & CSI Verification',
    actReference: 'Rule 125 & ITNS 281N Specification',
    description:
      'Manage single-section challans for the 1961 Act and multi-section challans (allocating up to 20 sections) for the 2025 Act. Direct integration with OLTAS and NSDL CSI challan files.',
    features: [
      'ITNS 281 (1961 Act): Strict validation ensuring exactly 1 section code per challan.',
      'ITNS 281N (2025 Act): Multi-section grid allocating up to 20 tax sections in a single payment.',
      'NSDL CSI Importer: Compares book records against bank-verified BSR code, date, and challan serial number.',
      'Major Head 0020 vs 0021: Prevents fatal challan invalidation by matching deductee constitution with challan head.',
      'Challan Consumption Tracking: Real-time balance ledger preventing over-utilization or short deduction.',
    ],
    statutoryRule: 'Rule 125: Electronic payment via authorized banks or Protean TIN-FC portal.',
  },
  {
    id: 'math-rounding',
    badge: 'Zero-Float Math',
    title: 'Statutory Rounding & Interest Calculation Engine',
    actReference: 'Section 516 IT Act 2025 & Rule 269',
    description:
      'Eliminates floating-point calculation errors by computing tax with Decimal.js and executing statutory truncations precisely as written in Indian legislation.',
    features: [
      'Section 516 (2025 Act) / Section 288B: Step 1 drops paise completely; Step 2 rounds to nearest ₹10.',
      'Rule 269 Interest Base: Truncates tax base down to nearest multiple of ₹100 before computing interest.',
      'Section 201(1A) Interest: 1% per month for late deduction, 1.5% per month for delayed deposit.',
      'Section 234E Late Fee: Auto-calculates ₹200/day fee capped strictly at total TDS deducted.',
      'Section 170 CGST Rounding: Keeps invoice line taxes exact to 2 decimals, rounding only at payable total.',
    ],
    statutoryRule: 'Section 516: Strict prohibition against rounding paise up before truncating.',
  },
  {
    id: 'pan-guard',
    badge: 'Section 206AA',
    title: 'PAN Constitution & Higher Deduction Radar',
    actReference: 'Sections 206AA, 206AB & CBDT Circular 3/2023',
    description:
      'Validates deductee PAN numbers, classifies entity constitutions via the 4th character, detects Protean non-PAN literals, and auto-applies 20% higher deduction rates.',
    features: [
      'PAN Constitution Detection: Automatically classifies Company (C), Individual (P), Firm/LLP (F), Trust (T).',
      'Protean Literals: Handles PANNOTAVBL, PANAPPLIED, PANINVALID without FVU rejection.',
      'Section 206AA Guard: Applies 20% penal rate when deductee fails to provide a valid operative PAN.',
      'Section 206AB Non-Filer Check: Flags specified persons who missed return filings for higher TDS.',
      'Inoperative PAN Warning: Flags PAN-Aadhaar unlinked deductees under CBDT Rule 114AAA.',
    ],
    statutoryRule: 'Section 206AA: Mandatory deduction at higher of 20%, rates in force, or specified rate.',
  },
  {
    id: 'form16-pades',
    badge: 'Class 3 DSC',
    title: 'Form 16 / 16A Digital Signing & Bulk Dispatch',
    actReference: 'Rule 31 & IT Act Section 65B Evidence',
    description:
      'Merges TRACES Part A and company Part B into digitally signed, password-protected PDF certificates using local USB cryptographic hardware tokens.',
    features: [
      'FIPS 140-2 / 140-3 Bridge: Direct PKCS#11 signing with ePass2003, ProxKey, and mToken USB keys.',
      'PAdES PDF Signatures: Cryptographically verified visual signature banner with timestamping.',
      'Automated Bulk Merging: Combines TRACES text files and salary structures without manual intervention.',
      'Password Protection: Encrypts output PDFs with deductee PAN and date of birth.',
      'WhatsApp & Email Dispatch: Single-click automated delivery with statutory delivery receipts.',
    ],
    statutoryRule: 'Rule 31: Issuance of Form 16 within 15 days from due date of quarterly return.',
  },
  {
    id: 'fvu-validation',
    badge: 'NSDL FVU 8.4',
    title: 'Pre-Validation & NSDL FVU Integration',
    actReference: 'Protean e-Gov NSDL FVU Specifications',
    description:
      'Runs an exhaustive in-browser pre-flight check mimicking Protean FVU 8.4 rules before generating uploadable files, preventing costly rejections at TIN-FC centers.',
    features: [
      'Zero-Error Guarantee: Validates record formats, salary annexures, and challan sums before generation.',
      'Line-Level Error Highlighting: Pinpoints exact deductee serial numbers causing discrepancies.',
      'Correction File (C3/C4/C5/C9): Seamlessly generates correction returns for challan/deductee additions.',
      'TallyPrime Integration: Direct voucher import via local Port 9000 TDL XML poller.',
      'Excel & CSV Smart Parser: Auto-maps arbitrary client ledger columns to statutory TDS fields.',
    ],
    statutoryRule: 'NSDL FVU 8.4: Mandatory validation file specification for all quarterly TDS filings.',
  },
];

export function SmartEtdsModules() {
  const [activeTab, setActiveTab] = useState<string>('tds-returns');

  const activeModule = STATUTORY_MODULES.find((m) => m.id === activeTab) || STATUTORY_MODULES[0];

  return (
    <section id="smart-etds" className="py-16 sm:py-24 bg-slate-950 text-white border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Section Header */}
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-semibold">
            <Percent className="w-3.5 h-3.5" />
            <span>Complete Statutory Breakdown</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            Smart eTDS & Inward Supply Architecture
          </h2>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            Modeled after the rigorous compliance requirements of top Indian CA firms: comprehensive quarterly TDS/TCS
            forms, Dual-Act ITNS 281N challan management, 4-pass GSTR-2B reconciliation, and NSDL FVU pre-validation.
          </p>
        </div>

        {/* Tab Navigation Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-800 text-xs font-mono font-semibold">
          {STATUTORY_MODULES.map((mod) => (
            <button
              key={mod.id}
              onClick={() => setActiveTab(mod.id)}
              className={`px-4 py-2.5 rounded-lg transition-all whitespace-nowrap flex items-center gap-2 ${
                activeTab === mod.id
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <span>{mod.badge}</span>
            </button>
          ))}
        </div>

        {/* Active Module Showcase Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 lg:p-10 shadow-2xl">
          
          {/* Left Column: Deep Statutory Details (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                <ShieldCheck className="w-4 h-4" />
                <span>Statutory Authority: {activeModule.actReference}</span>
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight">{activeModule.title}</h3>
              <p className="text-slate-300 text-sm leading-relaxed">{activeModule.description}</p>
            </div>

            {/* Feature Checklist */}
            <div className="space-y-3 pt-2">
              <span className="text-xs font-mono uppercase text-slate-400 font-semibold tracking-wider block">
                Field Capabilities & Statutory Controls:
              </span>
              <ul className="space-y-2.5">
                {activeModule.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-xs sm:text-sm text-slate-300">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3" />
                    </div>
                    <span className="leading-snug">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Statutory Rule Banner */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-400 flex items-center gap-3">
              <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{activeModule.statutoryRule}</span>
            </div>

          </div>

          {/* Right Column: Interactive Code & Compliance Preview (5 cols) */}
          <div className="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 font-mono text-xs shadow-inner flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 text-slate-400">
                <span>Statutory Compliance Matrix</span>
                <span className="text-emerald-400 text-[10px] font-bold">LIVE PRODUCTION GRADE</span>
              </div>

              {/* Code snippet showing real invariant logic */}
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800/80 text-[11px] text-slate-300 space-y-1.5 overflow-x-auto">
                <div className="text-slate-500">// Section 516 & Rule 269 Engine</div>
                <div><span className="text-cyan-400">const</span> rawTds = base.times(rate).div(100);</div>
                <div><span className="text-slate-500">// Step 1: Drop paise completely</span></div>
                <div><span className="text-cyan-400">const</span> truncated = rawTds.trunc();</div>
                <div><span className="text-slate-500">// Step 2: Nearest Rs 10</span></div>
                <div><span className="text-cyan-400">const</span> sec516Tds = roundItActSection516(truncated);</div>
                <div><span className="text-slate-500">// Rule 269: Truncate down to multiple of 100</span></div>
                <div><span className="text-cyan-400">const</span> interestBase = sec516Tds.div(100).trunc().mul(100);</div>
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-slate-400">
                  <span>FVU Schema Target:</span>
                  <span className="text-white font-bold">NSDL FVU 8.4</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Dual-Act Mode:</span>
                  <span className="text-emerald-400 font-bold">1961 + 2025 ITNS 281N</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Hardware DSC Bridge:</span>
                  <span className="text-cyan-400 font-bold">127.0.0.1:18531 (Loopback)</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <Link
                href="/login"
                className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold font-sans text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-500/20"
              >
                <span>Launch Workstation for this Module</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
