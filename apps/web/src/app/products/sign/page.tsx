import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '../../../components/landing/SiteNav';
import { LandingFooter } from '../../../components/landing/LandingFooter';
import {
  KeyRound,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Usb,
  Cpu,
  Clock,
  Layers,
  Lock,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'SynTax Sign | Zero-Java USB DSC Agent & Batch PAdES Signing',
  description:
    'Modern digital signature infrastructure for CA firms: Zero-Java Go 1.27 USB token agent, FIPS 140-3 hardware detection, 45/15/7-day expiry radar, and single-PIN batch PAdES signing.',
};

const STATUTORY_CHECKLIST = [
  {
    rule: 'Zero-Java Go 1.27 Local Agent',
    detail: 'Eliminates fragile JRE installations, browser Java applets, and outdated emSigner drivers. Runs as a lightweight native binary on Windows, macOS, and Linux.',
    badge: 'Native Binary',
  },
  {
    rule: 'FIPS Tier Estimation (Issue-Date Heuristic)',
    detail: 'Estimates legacy FIPS 140-2 vs FIPS 140-3 Level 3 readiness from certificate issue date and token provider until hardware attestation is queried.',
    badge: 'Estimated Check',
  },
  {
    rule: 'Office Custody & Expiry Radar',
    detail: 'Tracks client DSC dongles held in office custody with proactive 45-day, 15-day, and 7-day expiration countdowns before renewal barriers.',
    badge: 'Custody Radar',
  },
  {
    rule: 'Single-PIN Batch PAdES Signing',
    detail: 'Splits bulk TRACES .zip archives (Form 130, 131, 133) and applies digital signatures across hundreds of certificates with one master PIN verification.',
    badge: 'Batch Engine',
  },
  {
    rule: 'Origin-Pinned Nonce Cryptography',
    detail: 'Documents never leave your local machine unhashed. The browser sends only SHA-256 nonces over loopback HTTPS with strict origin verification.',
    badge: 'Zero Knowledge',
  },
  {
    rule: 'Unified Signing Audit Ledger',
    detail: 'Every PKCS#7 GSTR-3B and PAdES PDF signature writes an immutable tamper-evident record into the MCA Rule 3(1) audit trail in SynTax Desk.',
    badge: 'Audit Locked',
  },
];

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Client Master (SynTax Desk)',
    desc: 'Authorized signatories, PAN mappings, and token serials register once in the Desk master.',
  },
  {
    step: '02',
    title: 'GST & TDS Return Handoff',
    desc: 'Approved GSTR-3B filings or Form 130 TDS certificates queue up automatically for partner signing.',
  },
  {
    step: '03',
    title: 'Local USB Token Engagement',
    desc: 'The Go 1.27 agent detects ePass2003, Watchdata, or mToken hardware and prompts for your PIN once.',
  },
  {
    step: '04',
    title: 'Audit Vault Storage (SynTax Desk)',
    desc: 'Signed hashes and timestamped certificates archive automatically into the MCA Rule 3(6) vault.',
  },
];

export default function SignProductPage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen bg-white pt-24">
        {/* Product Hero */}
        <section className="mx-auto max-w-[1480px] px-4 sm:px-8 py-12 lg:py-16">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-sky-subtle px-3 py-1 text-[12px] font-semibold text-sky-deep">
                <KeyRound className="h-4 w-4" />
                <span>SynTax Sign Hub</span>
              </div>

              <h1 className="mt-4 font-display text-[clamp(36px,4.5vw,62px)] font-semibold leading-[1.05] tracking-tight text-ink">
                Zero-Java DSC Signing. No emSigner Crashes. Ever.
              </h1>

              <p className="mt-5 text-[16px] text-ink/75 leading-relaxed max-w-xl">
                Replace clunky desktop Java signer utilities with a blazing-fast Go 1.27 USB token agent. Detects FIPS 140-3 hardware, tracks dongle custody, and signs TRACES Form 130 to 133 archives in single-PIN batches.
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
                  <CheckCircle2 className="h-4 w-4 text-mint" /> FIPS 140-3 Token Detection
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-mint" /> Native Windows, Mac &amp; Linux
                </span>
              </div>
            </div>

            {/* Interactive Live UI Preview Card */}
            <div className="rounded-2xl border border-ink/10 bg-slate-900 p-6 text-white shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-mint" />
                  <div>
                    <p className="font-display text-[14px] font-semibold">Local Go DSC Agent (Loopback 15850)</p>
                    <p className="text-[11px] text-white/50">Driver: PKCS#11 | FIPS: 140-3 Level 3 Active</p>
                  </div>
                </div>
                <span className="rounded-full bg-mint/20 px-2.5 py-0.5 text-[11px] font-medium text-mint">
                  Connected
                </span>
              </div>

              {/* Sample Hardware Status */}
              <div className="mt-4 space-y-2.5">
                <div className="rounded-xl bg-white/[0.05] p-3 border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky/20 text-sky">
                      <Usb className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-[13px] font-medium text-white">ePass2003 Auto Token</span>
                      <p className="text-[11px] text-white/50">Holder: CA Amrinder Verma | Serial: 8F2A109B</p>
                    </div>
                  </div>
                  <span className="text-[11.5px] font-medium text-mint">
                    428 Days Remaining
                  </span>
                </div>

                {/* Batch Signing Queue */}
                <div className="rounded-xl bg-white/[0.05] p-3 border border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-medium text-white">TRACES Form 130 Batch Queue</span>
                    <span className="rounded bg-sky/20 px-2 py-0.5 text-[10.5px] font-mono text-sky">84 Certificates</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-[11px] text-white/60">
                    <span>Target: Amritsar Silk Mills Q2 TDS</span>
                    <span className="text-mint font-semibold">Ready for single-PIN sign</span>
                  </div>
                </div>

                {/* Expiry Radar Alert */}
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                    <div>
                      <p className="text-[12px] font-medium text-white">Custody Expiry Alert (15 Days)</p>
                      <p className="text-[10.5px] text-white/60">Gurdas Fabrics signatory token expires on 2026-12-11</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-amber-400">Notice Sent</span>
                </div>
              </div>

              {/* Security Ledger Status */}
              <div className="mt-5 rounded-xl bg-white/[0.03] p-3 border border-white/10 flex items-center justify-between text-[11.5px]">
                <div className="flex items-center gap-2 text-white/70">
                  <Lock className="h-3.5 w-3.5 text-mint" />
                  <span>SHA-256 Nonce Integrity: Verified</span>
                </div>
                <span className="font-semibold text-mint">PAdES Standard</span>
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
                How SynTax Sign Embeds Across Your Workflow
              </h2>
              <p className="mt-3 text-[15px] text-ink/70">
                You never need to open a separate signing application. One native agent powers both GST return filings and TDS certificate releases.
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
              Cryptographic Safeguards
            </span>
            <h2 className="mt-2 font-display text-[32px] font-semibold tracking-tight text-ink">
              Compliant Electronic Signatures
            </h2>
            <p className="mt-2 text-[14px] text-ink/60">
              Built to meet Indian Information Technology Act and CCA guidelines without third-party cloud key exposure.
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
                Experience Seamless DSC Signing Today
              </h3>
              <p className="mt-1 text-[14px] text-white/70 max-w-lg">
                SynTax Sign comes unlocked with both our All-in-One practice suites and standalone entry packs.
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
