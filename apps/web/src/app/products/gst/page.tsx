import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '../../../components/landing/SiteNav';
import { LandingFooter } from '../../../components/landing/LandingFooter';
import {
  ReceiptText,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  FileSpreadsheet,
  Lock,
  Layers,
  Sparkles,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'SynTax GST | 4-Pass 2B Recon, IMS Console & Hard-Locked 3B Set-Off',
  description:
    'Cloud GST compliance for CA practices: Dirty Excel sanitizer, four-pass fuzzy GSTR-2B reconciliation, native IMS console before 14th recompute lock, and Rule 88A/86B set-off engine.',
};

const STATUTORY_CHECKLIST = [
  {
    rule: 'IMS Console (2026 Mandate)',
    detail: 'Accept, reject, or mark pending every supplier invoice before the 14th cutoff. GSTR-3B remains locked until 2B is recomputed if IMS actions change.',
    badge: 'Statutory Lock',
  },
  {
    rule: 'Rule 88A / Advisory 643 Hard Set-Off',
    detail: 'IGST credit is fully exhausted first across IGST, CGST, and SGST liabilities. Never allows cross-utilization between CGST and SGST.',
    badge: 'Hard Locked',
  },
  {
    rule: 'Rule 86B 1% Cash Guard',
    detail: 'Automatically detects when taxable turnover exceeds Rs 50 Lakhs in a month and enforces minimum 1% output tax payment through cash ledger.',
    badge: 'Automated Check',
  },
  {
    rule: '4-Pass Fuzzy GSTR-2B Matching',
    detail: 'Matches exact document numbers, normalizes slashes and year tokens, applies date and rupee tolerances, and presents discrepancy packs for vendor WhatsApp follow-up.',
    badge: 'Recon Engine',
  },
  {
    rule: 'GSTR-1, 1A & QRMP PMT-06',
    detail: 'Supports single-shot GSTR-1A amendments, IFF quarterly uploads, auto HSN summaries, and 35% fixed-sum or self-assessment PMT-06 challans.',
    badge: 'Complete Returns',
  },
  {
    rule: 'Section 393 Cross-Compliance Tagging',
    detail: 'High-value purchase register bills automatically tag potential TDS obligations and surface a 1-click review badge for SynTax TDS.',
    badge: 'Cross-Suite Moat',
  },
];

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Client Master (SynTax Desk)',
    desc: 'Entity PAN, multi-state GSTINs, and staff assignments flow into SynTax GST instantly with zero re-entry.',
  },
  {
    step: '02',
    title: 'Dirty Excel Ingestion & 2B Recon',
    desc: 'Sanitizes Tally and Busy exports, runs 4-pass fuzzy matching, and locks confirmed ITC into the working ledger.',
  },
  {
    step: '03',
    title: 'IMS Console Action Freeze',
    desc: 'Accept or reject high-value vendor claims before the 14th cutoff to prevent default auto-acceptance.',
  },
  {
    step: '04',
    title: 'Cross-Suite Hand-off (SynTax TDS & Sign)',
    desc: 'Flags Section 393 contractor bills for SynTax TDS review, then dispatches GSTR-3B to SynTax Sign for partner DSC signing.',
  },
];

export default function GstProductPage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen bg-white pt-24">
        {/* Product Hero */}
        <section className="mx-auto max-w-[1480px] px-4 sm:px-8 py-12 lg:py-16">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-sky-subtle px-3 py-1 text-[12px] font-semibold text-sky-deep">
                <ReceiptText className="h-4 w-4" />
                <span>SynTax GST Suite</span>
              </div>

              <h1 className="mt-4 font-display text-[clamp(36px,4.5vw,62px)] font-semibold leading-[1.05] tracking-tight text-ink">
                GSTR-2B, IMS &amp; 3B Set-Off. Built For The Way Credit Works Now.
              </h1>

              <p className="mt-5 text-[16px] text-ink/75 leading-relaxed max-w-xl">
                Replace manual Excel checking with a 4-pass fuzzy reconciliation engine, native 2026 IMS console before the 14th cutoff, and a mathematically locked Rule 88A set-off engine that keeps client cash outflow lowest.
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
                  <CheckCircle2 className="h-4 w-4 text-mint" /> 2026 IMS Advisory 643 Ready
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-mint" /> 1-Click Client Master Sync
                </span>
              </div>
            </div>

            {/* Interactive Live UI Preview Card */}
            <div className="rounded-2xl border border-ink/10 bg-slate-900 p-6 text-white shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-mint" />
                  <div>
                    <p className="font-display text-[14px] font-semibold">IMS Console &amp; Recon Cockpit</p>
                    <p className="text-[11px] text-white/50">GSTIN: 03AABCA1294F1Z5 | Period: Nov 2026</p>
                  </div>
                </div>
                <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
                  Cutoff in 4 days
                </span>
              </div>

              {/* Sample Inward Invoices */}
              <div className="mt-4 space-y-2.5">
                <div className="rounded-xl bg-white/[0.05] p-3 border border-white/5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-white">Jalandhar Forgings Ltd</span>
                      <span className="rounded bg-sky/20 px-1.5 py-0.5 text-[10px] font-mono text-sky">Matched (Pass 2)</span>
                    </div>
                    <p className="text-[11px] text-white/50 mt-0.5">INV-26-27/084 | Taxable: Rs 1,50,000 | Tax: Rs 27,000</p>
                  </div>
                  <span className="rounded-lg bg-mint/20 px-3 py-1 text-[11.5px] font-semibold text-mint">
                    Accepted
                  </span>
                </div>

                <div className="rounded-xl bg-white/[0.05] p-3 border border-white/5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-white">Apex Cloud Solutions Delhi</span>
                      <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-mono text-rose-300">Mismatch Rs 5,400</span>
                    </div>
                    <p className="text-[11px] text-white/50 mt-0.5">INV-4512 | GSTR-2B: Rs 45,000 | Books: Rs 39,600</p>
                  </div>
                  <span className="rounded-lg bg-amber-500/20 px-3 py-1 text-[11.5px] font-semibold text-amber-300">
                    Pending 14th
                  </span>
                </div>

                {/* Cross-suite Tagging Alert */}
                <div className="rounded-xl bg-sky/10 border border-sky/30 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="h-4 w-4 text-sky shrink-0" />
                    <div>
                      <p className="text-[12px] font-medium text-white">Section 393 TDS Trigger Detected</p>
                      <p className="text-[10.5px] text-white/60">Golden Temple Transport bill (Rs 95,000) flagged for SynTax TDS review</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-sky">Flagged</span>
                </div>
              </div>

              {/* Set-Off Status Footer */}
              <div className="mt-5 rounded-xl bg-white/[0.03] p-3 border border-white/10 flex items-center justify-between text-[11.5px]">
                <div className="flex items-center gap-2 text-white/70">
                  <Lock className="h-3.5 w-3.5 text-mint" />
                  <span>Rule 88A: IGST ITC fully exhausted first (Rs 42,000)</span>
                </div>
                <span className="font-semibold text-mint">Cash Outflow: Rs 0</span>
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
                How SynTax GST Powers Your Whole Practice
              </h2>
              <p className="mt-3 text-[15px] text-ink/70">
                Data entered or reconciled in GST flows automatically into TDS, Sign, and Desk through one shared PostgreSQL Client Master.
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
              Statutory Compliance Rules
            </span>
            <h2 className="mt-2 font-display text-[32px] font-semibold tracking-tight text-ink">
              Hard-Coded Legal Protections
            </h2>
            <p className="mt-2 text-[14px] text-ink/60">
              SynTax GST enforces statutory rules directly in the engine so human error cannot cause penalties.
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
                Get SynTax GST with 14 Days of Free Practice Access
              </h3>
              <p className="mt-1 text-[14px] text-white/70 max-w-lg">
                Available as an All-in-One practice suite or as a Standalone GST + Sign entry pack with 1-click in-app upgrade.
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
