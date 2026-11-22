'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { AuthFrame, Field, PrimaryButton } from '../../components/auth/AuthFrame';
import { postPublic } from '../../components/auth/publicApi';

function NoteCard() {
  return (
    <div className="w-[260px] rounded-[20px] bg-white/95 p-4 shadow-[0_24px_50px_-24px_rgba(40,30,120,0.45)] ring-1 ring-black/5">
      <p className="flex items-center gap-1.5 font-display text-[13px] font-semibold text-ink">
        <ShieldCheck className="h-4 w-4 text-[#14b85a]" /> Your authenticator still counts
      </p>
      <p className="mt-1 font-display text-[12px] leading-[1.45] text-ink/60">A reset needs the emailed code and a code from your authenticator app. Every signed-in device is signed out afterwards.</p>
    </div>
  );
}

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<'request' | 'confirm' | 'done'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [totp, setTotp] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await postPublic<{ emailConfigured?: boolean }>('/api/v1/account/password-reset/request', { email });
    setBusy(false);
    if (r.status === 429) return setError('Too many requests from this network. Wait 15 minutes and try again.');
    if (!r.ok) return setError(r.data.message ?? 'Enter the email you sign in with.');
    setInfo(r.data.message ?? 'If this email has an account, a code is on its way.');
    setStep('confirm');
  };

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError('The two passwords do not match.');
    if (password.length < 8) return setError('Use at least 8 characters for the new password.');
    setBusy(true);
    const r = await postPublic('/api/v1/account/password-reset/confirm', { email, code, newPassword: password, totpCode: totp });
    setBusy(false);
    if (r.status === 429) return setError('Too many attempts from this network. Wait 15 minutes and try again.');
    if (!r.ok) return setError(r.data.message ?? 'That did not work. Ask for a new code and try again.');
    setInfo(r.data.message ?? 'Your password is changed.');
    setStep('done');
  };

  return (
    <AuthFrame
      title="Reset your password"
      subtitle="We email you a 6-digit code. You also need your authenticator app; a reset never skips it."
      switchLabel="Sign in"
      switchHref="/login"
      aside={<NoteCard />}
      below={
        <p className="font-display text-[13px] text-ink/55">
          Remembered it?{' '}
          <Link href="/login" className="font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
            Sign in
          </Link>
        </p>
      }
    >
      {error && (
        <p role="alert" className="mb-3 rounded-[16px] bg-[#FFE9E9] px-4 py-2.5 font-display text-[13px] text-pos-red">
          {error}
        </p>
      )}
      {info && step !== 'request' && (
        <p role="status" className="mb-3 rounded-[16px] bg-[#EAF7EF] px-4 py-2.5 font-display text-[13px] text-[#15803d]">
          {info}
        </p>
      )}

      {step === 'request' && (
        <form onSubmit={request} className="space-y-[clamp(8px,1.3vh,12px)]">
          <Field label="Work email" icon={Mail} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Work email" />
          <PrimaryButton type="submit" busy={busy}>{busy ? 'Sending the code' : 'Email me a code'}</PrimaryButton>
        </form>
      )}

      {step === 'confirm' && (
        <form onSubmit={finish} className="space-y-[clamp(8px,1.3vh,12px)]">
          <Field label="Code from the email" icon={KeyRound} hint="6 digits" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={code} onChange={(e) => setCode(digits(e.target.value))} placeholder="Code from the email" className="[&_input]:tabular-nums" />
          <Field label="New password" icon={LockKeyhole} type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password, at least 8 characters" />
          <Field label="New password again" icon={LockKeyhole} type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="New password again" />
          <Field label="Authenticator code" icon={ShieldCheck} hint="6 digits" inputMode="numeric" required maxLength={6} value={totp} onChange={(e) => setTotp(digits(e.target.value))} placeholder="Authenticator code" className="[&_input]:tabular-nums" />
          <PrimaryButton type="submit" busy={busy}>{busy ? 'Changing the password' : 'Set the new password'}</PrimaryButton>
          <button type="button" onClick={() => { setStep('request'); setInfo(null); setCode(''); }} className="w-full pt-1 text-center font-display text-[13px] text-ink/55 underline decoration-ink/20 underline-offset-4 hover:text-ink">
            No code? Ask for a new one
          </button>
        </form>
      )}

      {step === 'done' && (
        <Link href="/login" className="flex h-[48px] w-full items-center justify-center rounded-full bg-ink font-display text-[16px] font-medium text-white">
          Sign in
        </Link>
      )}
    </AuthFrame>
  );
}
