'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Building2, Mail, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AuthFrame, DemoPill, Field, PrimaryButton } from '../../components/auth/AuthFrame';
import { PixelField } from '../../components/landing/primitives';

// ICAI firm registration numbers: six digits followed by a region letter.
const FRN_PATTERN = /^\d{6}[A-Z]$/;

function PilotCard() {
  return (
    <div className="pixel-host relative w-[270px] overflow-hidden rounded-[22px] bg-sky p-5 text-white shadow-[0_24px_50px_-24px_rgba(40,80,160,0.55)]">
      <PixelField seed={93} count={24} cell={12} cols={22} rows={10} maxOpacity={0.3} />
      <p className="relative font-display text-[38px] font-semibold leading-none tracking-[-0.05em]">15</p>
      <p className="relative mt-1 font-display text-[14px]">Founding firm seats in Amritsar</p>
      <p className="relative mt-3 font-display text-[12.5px] leading-[1.45] text-white/85">Six months free, then 40% off for life.</p>
    </div>
  );
}

export default function SignupPage() {
  // Wakes the API while the form is being filled in, so signing in does not wait for a cold start.
  useEffect(() => {
    fetch('/api/v1/auth/csrf', { credentials: 'include' }).catch(() => {});
  }, []);
  const router = useRouter();
  const { signup } = useAuth();

  const [fullName, setFullName] = useState('');
  const [firmName, setFirmName] = useState('');
  const [email, setEmail] = useState('');
  const [frn, setFrn] = useState('');
  const [frnError, setFrnError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (frn && !FRN_PATTERN.test(frn)) {
      setFrnError('FRN is six digits and a letter, for example 014289N.');
      return;
    }
    setBusy(true);
    await signup({ fullName, firmName, email, frnNumber: frn || undefined });
    router.push('/dashboard');
  };

  const handleDemo = async () => {
    setBusy(true);
    await signup({
      fullName: 'CA Amrinder Verma, FCA',
      firmName: 'Verma & Associates CA (Amritsar)',
      email: 'ca.verma@synextax.com',
      frnNumber: '014289N',
    });
    router.push('/dashboard');
  };

  return (
    <AuthFrame
      title={<span className="whitespace-nowrap">Start your trial</span>}
      subtitle="Fourteen days with every GST and TDS module. No card needed, data stays in India."
      switchLabel="Sign in"
      switchHref="/login"
      aside={<PilotCard />}
      below={
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 font-display text-[13px] text-ink/50">Look around first</span>
            <DemoPill onClick={handleDemo} disabled={busy}>
              Open the demo workspace
            </DemoPill>
          </div>
          <p className="font-display text-[13px] text-ink/55">
            By continuing you agree to the terms of service.{' '}
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
              Sign in
            </Link>
          </p>
        </div>
      }
    >
      <form onSubmit={handleSignup} className="space-y-[clamp(8px,1.3vh,12px)]">
        <Field
          label="Your name"
          icon={UserRound}
          required
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your name"
        />
        <Field
          label="Firm name"
          icon={Building2}
          required
          autoComplete="organization"
          value={firmName}
          onChange={(e) => setFirmName(e.target.value)}
          placeholder="Firm name"
        />
        <Field
          label="Work email"
          icon={Mail}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Work email"
        />
        <Field
          label="ICAI firm registration number (optional)"
          icon={BadgeCheck}
          hint="Optional"
          value={frn}
          error={frnError}
          maxLength={7}
          onChange={(e) => {
            setFrn(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''));
            setFrnError(undefined);
          }}
          placeholder="ICAI FRN, e.g. 019842N"
          className="[&_input]:tabular-nums"
        />

        <div className="pt-0.5">
          <PrimaryButton type="submit" busy={busy}>
            {busy ? 'Setting up your workspace' : 'Create account'}
          </PrimaryButton>
        </div>
      </form>
    </AuthFrame>
  );
}
