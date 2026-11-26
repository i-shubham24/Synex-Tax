import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '../../../components/landing/SiteNav';
import { LandingFooter } from '../../../components/landing/LandingFooter';
import {
  Building2,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Users,
  FileSpreadsheet,
  Activity,
  Lock,
  Globe2,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'SynTax Desk | Unified 4-Tier Client Master & Practice Control Tower',
  description:
    'Core practice operating system for CA firms: Unified 4-tier Client Master, 10-min migration wizard, 5 statutory risk radars, MCA Rule 3(1) edit log, Rule 3(6) audit vault, and DPDP consent tracking.',
};

const STATUTORY_CHECKLIST = [
  {
    rule: 'Unified 4-Tier Client Master',
    detail: 'Organizes complex businesses logically: Firm -> Client Group -> Entity PAN -> multi-state GSTINs and branch TANs. Set up once, active everywhere.',
    badge: 'Tenancy Master',
  },
  {
    rule: '10-Minute Practice Migration Wizard',
    detail: 'Import your client registers from SmartBiz, CompuTax, Winman, or raw Excel files with automatic GSTIN checksum and PAN validation.',
    badge: 'Fast Onboarding',
  },
  {
    rule: '5 Statutory Risk Radars',
    detail: 'Monitors the 3-year GST time cliff bar, expiring GSTN portal tokens, FIPS 140-2 token transitions, unactioned IMS documents, and pending corrections.',
    badge: 'Risk Monitor',
  },
  {
    rule: 'Anti-Poaching Partner Export Guard',
    detail: 'Staff cannot dump your entire client base to Excel. Full export capabilities remain hard-locked to verified practice partner credentials.',
    badge: 'Practice Moat',
  },
  {
    rule: 'MCA Rule 3(1) Log & Rule 3(6) Vault',
    detail: 'Generates immutable cryptographic edit logs for corporate audit compliance and prints auditor-ready Rule 3(6) backup disclosure certificates.',
    badge: 'MCA Audit Ready',
  },
  {
    rule: 'DPDP Multilingual Consent Tracker',
    detail: 'Records digital client authorizations across English, Punjabi, and Hindi in compliance with Indian Digital Personal Data Protection mandates.',
    badge: 'DPDP Ready',
  },
];

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Single Client Master Source',
    desc: 'Enter an entity PAN once. GSTINs, TANs, and partner assignments propagate across all four product suites instantly.',
  },
  {
    step: '02',
    title: 'GST & TDS Suite Orchestration',
    desc: 'Filing matrix aggregates real-time statuses from SynTax GST and SynTax TDS into one unified partner dashboard.',
  },
  {
    step: '03',
    title: 'Maker-Checker Approval Queue',
    desc: 'Staff prepare returns; partners review and release filings through the centralized Control Tower.',
  },
  {
    step: '04',
    title: 'Immutable Audit Archival',
    desc: 'Every return file, digital signature nonce, and team modification seals permanently into the Rule 3(6) vault.',
  },
];

export default function DeskProductPage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen bg-white pt-24">
        {/* Product Hero */}
        <section className="mx-auto max-w-[1480px] px-4 sm:px-8 py-12 lg:py-16">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-ink">
                <Building2 className="h-4 w-4" />
                <span>SynTax Desk Suite</span>
              </div>

              <h1 className="mt-4 font-display text-[clamp(36px,4.5vw,62px)] font-semibold leading-[1.05] tracking-tight text-ink">
                The Operating System For Your CA Practice.
              </h1>

              <p className="mt-5 text-[16px] text-ink/75 leading-relaxed max-w-xl">
                One shared 4-tier Client Master powers your whole firm. 10-minute migration wizard from legacy desktop software, practice control tower with 5 statutory risk radars, anti-poaching partner guards, and MCA Rule 3(6) audit vaults.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/signup"
                  className="flex h-12 items-center gap-2 rounded-xl bg-ink px-6 text-[14.5px] font-semibold text-white hover:bg-ink/90 transition-all shadow-md"
                >
                  <span>Start 14-day free trial</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/contact"
                  className="flex h-12 items-center gap-2 rounded-xl border border-ink/15 bg-white px-6 text-[14.5px] font-semibold text-ink hover:bg-slate-50 transition-all"
                >
                  <span>Book a live practice demo</span>
                </Link>
              </div>

              <div className="mt-8 flex items-center gap-6 text-[12.5px] text-ink/60">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-mint" /> MCA Rule 3(1) &amp; 3(6) Verified
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-mint" /> Anti-Poaching Client Data Lock
                </span>
              </div>
            </div>

            {/* Interactive Live UI Preview Card */}
            <div className="rounded-2xl border border-ink/10 bg-slate-900 p-6 text-white shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-sky" />
                  <div>
                    <p className="font-display text-[14px] font-semibold">Practice Control Tower &amp; 4-Tier Master</p>
                    <p className="text-[11px] text-white/50">Firm: Verma &amp; Associates CA | 52 Groups | 184 Entities</p>
                  </div>
                </div>
                <span className="rounded-full bg-sky/20 px-2.5 py-0.5 text-[11px] font-medium text-sky">
                  Master Synced
                </span>
              </div>

              {/* Sample Hierarchy */}
              <div className="mt-4 space-y-2.5">
                <div className="rounded-xl bg-white/[0.05] p-3 border border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-white">Client Group: Amritsar Silk Mills</span>
                    <span className="text-[11px] text-white/50">Assignee: Harpreet Kaur</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/60">
                    <div className="rounded bg-white/[0.03] p-1.5">
                      <span className="text-white/40 block">GST Registrations</span>
                      <span className="font-mono text-white">03AABCA1294F1Z5 (PB), 07AABCA1294F1ZR (DL)</span>
                    </div>
                    <div className="rounded bg-white/[0.03] p-1.5">
                      <span className="text-white/40 block">TDS TAN Registrations</span>
                      <span className="font-mono text-white">PTLA01428N (Factory TAN)</span>
                    </div>
                  </div>
                </div>

                {/* Statutory Risk Radar */}
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Activity className="h-4 w-4 text-amber-400 shrink-0" />
                    <div>
                      <p className="text-[12px] font-medium text-white">3-Year GST Time Cliff Approaching</p>
                      <p className="text-[10.5px] text-white/60">Majha Agro Q2 FY23-24 GSTR-1 nears statutory time bar in 18 days</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-amber-400">Action Required</span>
                </div>

                {/* Audit Trail Row */}
                <div className="rounded-xl bg-white/[0.03] p-2.5 border border-white/5 flex items-center justify-between text-[11px] text-white/70">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-mint" />
                    <span>MCA Rule 3(1) Edit Log: SHA-256 Hash Verified</span>
                  </div>
                  <span className="font-mono text-white/50">Block #1842</span>
                </div>
              </div>

              {/* Status Footer */}
              <div className="mt-5 rounded-xl bg-white/[0.03] p-3 border border-white/10 flex items-center justify-between text-[11.5px]">
                <div className="flex items-center gap-2 text-white/70">
                  <Lock className="h-3.5 w-3.5 text-mint" />
                  <span>Partner Export Guard: Active (Staff export disabled)</span>
                </div>
                <span className="font-semibold text-mint">100% Secure</span>
              </div>
            </div>
          </div>
        </section>

        {/* Cross-Suite Integration Flow */}
        <section className="bg-slate-50 border-y border-ink/10 py-16">
          <div className="mx-auto max-w-[1480px] px-4 sm:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="text-[12px] font-semibold text-sky-deep uppercase tracking-wider">
                Cross-Suite Integration Moat
              </span>
              <h2 className="mt-2 font-display text-[32px] font-semibold tracking-tight text-ink">
                How SynTax Desk Orchestrates All Suites
              </h2>
              <p className="mt-3 text-[15px] text-ink/70">
                Desk is the foundational backbone of the platform. One shared database model connects all compliance modules into a cohesive practice OS.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-4">
              {WORKFLOW_STEPS.map((ws) => (
                <div key={ws.step} className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
                  <span className="font-mono text-[13px] font-bold text-sky-deep">{ws.step}</span>
                  <h3 className="mt-3 font-display text-[17px] font-semibold text-ink">{ws.title}</h3>
                  <p className="mt-2 text-[13px] text-ink/70 leading-relaxed">{ws.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Detailed Statutory Checklist */}
        <section className="mx-auto max-w-[1480px] px-4 sm:px-8 py-16">
          <div className="text-center max-w-xl mx-auto mb-12">
            <span className="text-[12px] font-semibold text-mint uppercase tracking-wider">
              Governance &amp; Practice Protections
            </span>
            <h2 className="mt-2 font-display text-[32px] font-semibold tracking-tight text-ink">
              Institutional CA Firm Standards
            </h2>
            <p className="mt-2 text-[14px] text-ink/60">
              Protect your firm reputation and client records with immutable audit logs and maker-checker segregation of duties.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {STATUTORY_CHECKLIST.map((sc) => (
              <div key={sc.rule} className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm hover:border-ink/20 transition-all">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-ink/70">
                    {sc.badge}
                  </span>
                  <ShieldCheck className="h-4 w-4 text-mint" />
                </div>
                <h3 className="mt-4 font-display text-[17px] font-semibold text-ink">{sc.rule}</h3>
                <p className="mt-2 text-[13px] text-ink/70 leading-relaxed">{sc.detail}</p>
              </div>
            ))}
          </div>

          {/* Bottom CTA Banner */}
          <div className="mt-16 rounded-2xl bg-night text-white p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
            <div>
              <span className="text-[12px] font-semibold text-mint uppercase tracking-wider">Included in All Plans</span>
              <h3 className="mt-1 font-display text-[26px] font-semibold tracking-tight">
                Modernize Your CA Practice Operations Today
              </h3>
              <p className="mt-1 text-[14px] text-white/70 max-w-lg">
                SynTax Desk is included in all practice subscriptions to give your team unified control.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <Link
                href="/signup"
                className="flex h-11 items-center gap-2 rounded-xl bg-mint px-6 text-[14px] font-semibold text-ink hover:bg-mint/90 transition-all shadow-md"
              >
                <span>Start 14-day free trial</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}
