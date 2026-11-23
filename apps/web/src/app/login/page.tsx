'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AuthFrame, DemoPill, Field, PrimaryButton, Segmented } from '../../components/auth/AuthFrame';

type Role = 'PARTNER' | 'STAFF';

function FiledCard() {
  return (
    <div className="w-[250px] rounded-[20px] bg-white/95 p-4 shadow-[0_24px_50px_-24px_rgba(40,30,120,0.45)] ring-1 ring-black/5">
      <p className="flex items-center gap-1.5 font-display text-[13px] font-semibold text-ink">
        <CheckCircle2 className="h-4 w-4 text-[#14b85a]" /> GSTR-3B filed
      </p>
      <p className="mt-1 font-display text-[12px] text-ink/55">Amritsar Silk Mills, Oct 2026</p>
      <div className="mt-3 flex items-center justify-between rounded-full bg-mist px-3 py-2 font-display text-[12px]">
        <span className="text-ink/60">Signed with partner DSC</span>
        <span className="font-medium tabular-nums text-ink">&#8377;1,48,920</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // Wakes the API while the form is being filled in, so signing in does not wait for a cold start.
  useEffect(() => {
    fetch('/api/v1/auth/csrf', { credentials: 'include' }).catch(() => {});
  }, []);
  const router = useRouter();
  const { login, loginDemo } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [role, setRole] = useState<Role>('PARTNER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totpError, setTotpError] = useState<string | undefined>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(totp)) {
      setTotpError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setTotpError(undefined);
    setBusy(true);
    try {
      const ok = await login(email, password, role, totp);
      if (ok) router.push('/dashboard');
      else setError('That email and password do not match an account. Check them and try again.');
    } catch {
      setError('We could not reach the sign-in service. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleDemo = async (r: Role) => {
    setError(null);
    try {
      await loginDemo(r);
      router.push('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The demo workspace could not be opened.');
    }
  };

  return (
    <AuthFrame
      title={<span className="whitespace-nowrap">Welcome back</span>}
      subtitle="Sign in to your practice. Your clients' returns are where you left them."
      switchLabel="Create account"
      switchHref="/signup"
      aside={<FiledCard />}
      below={
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 font-display text-[13px] text-ink/50">Try a demo</span>
            <DemoPill onClick={() => handleDemo('PARTNER')}>Partner</DemoPill>
            <DemoPill onClick={() => handleDemo('STAFF')}>Staff</DemoPill>
          </div>
          <p className="font-display text-[13px] text-ink/55">
            New to SynexTax?{' '}
            <Link href="/signup" className="font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
              Create an account
            </Link>
          </p>
        </div>
      }
    >
      {error && (
        <p role="alert" className="mb-3 rounded-[16px] bg-[#FFE9E9] px-4 py-2.5 font-display text-[13px] text-pos-red">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-[clamp(8px,1.3vh,12px)]">
        <Segmented
          label="Sign in as"
          value={role}
          onChange={setRole}
          options={[
            { value: 'PARTNER', label: 'Partner' },
            { value: 'STAFF', label: 'Staff' },
          ]}
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
          label="Password"
          icon={LockKeyhole}
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        <Field
          label="Authenticator code"
          icon={ShieldCheck}
          hint="6 digits"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={totp}
          error={totpError}
          onChange={(e) => {
            setTotp(e.target.value.replace(/\D/g, '').slice(0, 6));
            setTotpError(undefined);
          }}
          placeholder="Authenticator code"
          className="[&_input]:tabular-nums [&_input:not(:placeholder-shown)]:tracking-[0.35em]"
        />
        <div className="pt-1">
          <PrimaryButton type="submit" busy={busy}>
            {busy ? 'Signing in' : 'Sign in'}
          </PrimaryButton>
        </div>
      </form>
    </AuthFrame>
  );
}
