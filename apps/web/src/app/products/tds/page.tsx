import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '../../../components/landing/SiteNav';
import { LandingFooter } from '../../../components/landing/LandingFooter';
import {
  Percent,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Calendar,
  FileCheck2,
  Server,
  Layers,
  Search,
  Sparkles,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'SynTax TDS | Dual-Act Router, ITNS 281N & Isolated FVU Farm',
  description:
    'Cloud TDS filing for Indian CA practices: Seamless cutover between IT Act 1961 and IT Act 2025, ITNS 281N 20-section challans, bulk PAN operative checks, and isolated Docker FVU validation.',
};

const STATUTORY_CHECKLIST = [
  {
    rule: 'Dual-Act Period Cutover Router',
    detail: 'Dates on or before March 31, 2026 route automatically to IT Act 1961 logic. Dates on or after April 1, 2026 route to IT Act 2025 sections and forms.',
    badge: 'Statutory Router',
  },
  {
    rule: 'ITNS 281 vs ITNS 281N (20 Sections)',
    detail: 'Enforces legacy 1-section limit on ITNS 281 and allows up to 20 sections on ITNS 281N with hard programmatic refusal of the 21st entry.',
    badge: 'Challan Guard',
  },
  {
    rule: 'Forms 138 to 144 + Legacy 24Q/26Q',
    detail: 'Prepares new 2025 Act quarterly statements (Forms 138, 140, 143, 144) alongside legacy 24Q, 26Q, 27Q, and 27EQ returns from one deductor register.',
    badge: 'Full Statements',
  },
  {
    rule: 'Isolated Docker FVU Farm (v1.2 & v9.5)',
    detail: 'Runs Protean FVU utilities in non-root, read-only containers with zero network egress, parsing .err files directly into clickable UI line jumps.',
    badge: 'Secure FVU',
  },
  {
    rule: 'CSI Matching & Bulk PAN Operative Check',
    detail: 'Verifies deductor CSI files against deposited amounts and tests payee PAN operative status to prevent higher deduction notice surprises.',
    badge: 'Verification Engine',
  },
  {
    rule: 'TRACES KYC Cheat Sheet & Conso C1-C9',
    detail: 'Extracts exact PRN tokens, BSR codes, and deposit dates needed for TRACES portal authentication and parses .conso files for clean correction drafts.',
    badge: 'TRACES Studio',
  },
];

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Client Master (SynTax Desk)',
    desc: 'TANs, deductor entity PAN, and branch details link directly into SynTax TDS without redundant setup.',
  },
  {
    step: '02',
    title: 'GST Cross-Compliance Handoff',
    desc: 'High-value vendor bills flagged in SynTax GST u/s 393 appear directly in TDS registers for rapid verification.',
  },
  {
    step: '03',
    title: 'CSI Match & FVU Validation',
    desc: 'Ingests tax payment CSI files, generates caret .txt files, and validates via our isolated Docker FVU farm in seconds.',
  },
  {
    step: '04',
    title: 'Batch Signing (SynTax Sign)',
    desc: 'Form 27A control charts and quarterly TDS statements dispatch to SynTax Sign for single-PIN batch PAdES signing.',
  },
];

export default function TdsProductPage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen bg-white pt-24">
        {/* Product Hero */}
        <section className="mx-auto max-w-[1480px] px-4 sm:px-8 py-12 lg:py-16">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-mint/20 px-3 py-1 text-[12px] font-semibold text-[#147a3a]">
                <Percent className="h-4 w-4" />
                <span>SynTax TDS Suite</span>
              </div>

              <h1 className="mt-4 font-display text-[clamp(36px,4.5vw,62px)] font-semibold leading-[1.05] tracking-tight text-ink">
                Dual-Act TDS Filing. Built For The 2026 Transition.
              </h1>

              <p className="mt-5 text-[16px] text-ink/75 leading-relaxed max-w-xl">
                Operate seamlessly across both Income-tax Acts from one workspace. Automated period cutover router, ITNS 281N 20-section challans, bulk PAN validation, and isolated Docker FVU execution with clickable error line jumping.
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
                  <CheckCircle2 className="h-4 w-4 text-mint" /> IT Act 2025 Forms 138-144 Ready
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-mint" /> Zero Network FVU Sandbox
                </span>
              </div>
            </div>

            {/* Interactive Live UI Preview Card */}
            <div className="rounded-2xl border border-ink/10 bg-slate-900 p-6 text-white shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-sky" />
                  <div>
                    <p className="font-display text-[14px] font-semibold">Dual-Act TDS Cockpit &amp; Challan 281N</p>
                    <p className="text-[11px] text-white/50">TAN: AMR014289N | Active Act: IT Act 2025</p>
                  </div>
                </div>
                <span className="rounded-full bg-mint/20 px-2.5 py-0.5 text-[11px] font-medium text-mint">
                  FVU v1.2 Validated
                </span>
              </div>

              {/* Sample Deductions */}
              <div className="mt-4 space-y-2.5">
                <div className="rounded-xl bg-white/[0.05] p-3 border border-white/5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-white">ITNS 281N (Challan #04128)</span>
                      <span className="rounded bg-sky/20 px-1.5 py-0.5 text-[10px] font-mono text-sky">3 of 20 Sections</span>
                    </div>
                    <p className="text-[11px] text-white/50 mt-0.5">Sec 392 (Salaries), Sec 393(1) (Contractor), Sec 393(1) (Rent)</p>
                  </div>
                  <span className="font-mono text-[13px] font-semibold text-white">
                    Rs 67,700
                  </span>
                </div>

                <div className="rounded-xl bg-white/[0.05] p-3 border border-white/5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-white">Sukhwinder Singh (Contractor)</span>
                      <span className="rounded bg-mint/20 px-1.5 py-0.5 text-[10px] font-mono text-mint">PAN Operative</span>
                    </div>
                    <p className="text-[11px] text-white/50 mt-0.5">PAN: BQRPS4410K | Amount: Rs 1,50,000 | TDS (1%): Rs 1,500</p>
                  </div>
                  <span className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                    CSI Matched
                  </span>
                </div>

                {/* Clickable FVU Line Jump Demonstration */}
                <div className="rounded-xl bg-slate-800/80 border border-slate-700 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Server className="h-4 w-4 text-mint shrink-0" />
                    <div>
                      <p className="text-[12px] font-medium text-white">Isolated Docker FVU v1.2</p>
                      <p className="text-[10.5px] text-white/60">Caret file compiled | Token generated in 1.4s</p>
                    </div>
                  </div>
                  <span className="rounded bg-slate-700 px-2 py-0.5 text-[10.5px] font-mono text-white/90">Token #78149</span>
                </div>
              </div>

              {/* Cutover Status Footer */}
              <div className="mt-5 rounded-xl bg-white/[0.03] p-3 border border-white/10 flex items-center justify-between text-[11.5px]">
                <div className="flex items-center gap-2 text-white/70">
                  <Calendar className="h-3.5 w-3.5 text-sky" />
                  <span>Cutover: 2026-04-01 &rarr; Routed to Form 140 (Quarterly Statement)</span>
                </div>
                <span className="font-semibold text-sky">Zero .err Flags</span>
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
                How SynTax TDS Connects with Other Suites
              </h2>
              <p className="mt-3 text-[15px] text-ink/70">
                TDS compliance never lives in a silo. Verified client masters, vendor bill flags, and digital signature agents connect in one flow.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-4">
              {WORKFLOW_STEPS.map((ws) => (
                <div key={ws.step} className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
                  <span className="font-mono text-[13px] font-bold text-mint">{ws.step}</span>
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
              Dual-Act Compliance Rules
            </span>
            <h2 className="mt-2 font-display text-[32px] font-semibold tracking-tight text-ink">
              Comprehensive TDS Safeguards
            </h2>
            <p className="mt-2 text-[14px] text-ink/60">
              Built specifically to handle the complexities of the 2025 Act transition without disruption.
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
              <span className="text-[12px] font-semibold text-mint uppercase tracking-wider">Phase 1 MVP Ready</span>
              <h3 className="mt-1 font-display text-[26px] font-semibold tracking-tight">
                Try SynTax TDS Free for 14 Days
              </h3>
              <p className="mt-1 text-[14px] text-white/70 max-w-lg">
                Available in our All-in-One practice suites or as a Standalone TDS + Sign pack with 1-click upgrade.
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
