'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Building2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { AuthFrame, Field, PrimaryButton, Segmented } from '../../../components/auth/AuthFrame';
import { postPublic } from '../../../components/auth/publicApi';

interface Invite { firmName: string; name: string; email: string; role: string; roleLabel: string; expiresAt: string }
interface Enrolment { challengeToken: string; secret: string; qrCodeDataUrl: string; recoveryCodes: string[]; firmName: string }

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function InviteCard({ invite }: { invite: Invite | null }) {
  return (
    <div className="w-[260px] rounded-[20px] bg-white/95 p-4 shadow-[0_24px_50px_-24px_rgba(40,30,120,0.45)] ring-1 ring-black/5">
      <p className="flex items-center gap-1.5 font-display text-[13px] font-semibold text-ink">
        <Building2 className="h-4 w-4 text-sky-deep" /> {invite?.firmName ?? 'Your CA firm'}
      </p>
      <p className="mt-1 font-display text-[12px] leading-[1.45] text-ink/60">Every SynTax login uses a password and an authenticator app. Nobody, not even the firm, can sign in as you.</p>
    </div>
  );
}

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';
  const router = useRouter();
  const { mfaEnroll } = useAuth();

  const [invite, setInvite] = useState<Invite | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [totp, setTotp] = useState('');
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const [savedCodes, setSavedCodes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let live = true;
    postPublic<Invite>('/api/v1/account/invites/lookup', { token }).then((r) => {
      if (!live) return;
      if (r.ok) setInvite(r.data);
      else setGone(r.data.message ?? 'This invitation link has expired, was already used or was withdrawn.');
    });
    return () => { live = false; };
  }, [token]);

  const accept = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'new' && password !== confirm) return setError('The two passwords do not match.');
    if (mode === 'existing' && totp.length !== 6) return setError('Enter the 6-digit code from your authenticator app.');
    setBusy(true);
    const r = await postPublic<Enrolment & { existingAccount?: boolean; message?: string }>('/api/v1/account/invites/accept', {
      token,
      password,
      existingAccount: mode === 'existing',
      ...(mode === 'existing' ? { totpCode: totp } : {}),
    });
    setBusy(false);
    if (!r.ok) return setError(r.data.message ?? 'The invitation could not be accepted.');
    setPassword('');
    setConfirm('');
    setTotp('');
    if (r.data.existingAccount) setJoined(r.data.message ?? `You have joined ${invite?.firmName}. Sign in to continue.`);
    else setEnrolment(r.data);
  };

  const enrol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrolment) return;
    setError(null);
    if (totp.length !== 6) return setError('Enter the 6-digit code your authenticator app shows now.');
    setBusy(true);
    const ok = await mfaEnroll(enrolment.challengeToken, totp);
    setBusy(false);
    if (ok) router.push('/dashboard');
    else setError('That code did not match. Check the time on your phone is set automatically, then try the next code. If ten minutes have passed, sign in from the login page.');
  };

  const title = enrolment ? 'Set up your authenticator' : joined ? 'You are in' : 'Join your firm';
  const subtitle = gone
    ? 'This link no longer works.'
    : enrolment
      ? 'Scan the code with Google Authenticator, Microsoft Authenticator or any TOTP app, then enter the 6 digits it shows.'
      : invite
        ? `${invite.firmName} invited ${invite.name} (${invite.email}) as ${invite.roleLabel.toLowerCase()}.`
        : 'Checking the invitation.';

  return (
    <AuthFrame title={title} subtitle={subtitle} switchLabel="Sign in" switchHref="/login" aside={<InviteCard invite={invite} />}>
      {error && (
        <p role="alert" className="mb-3 rounded-[16px] bg-[#FFE9E9] px-4 py-2.5 font-display text-[13px] text-pos-red">
          {error}
        </p>
      )}

      {gone && (
        <div className="space-y-3 font-display text-[14px] text-ink/70">
          <p>{gone}</p>
          <Link href="/login" className="font-semibold text-ink underline decoration-ink/25 underline-offset-4">Go to sign in</Link>
        </div>
      )}

      {joined && (
        <div className="space-y-4">
          <p className="font-display text-[14px] text-ink/70">{joined}</p>
          <Link href="/login" className="flex h-[48px] w-full items-center justify-center rounded-full bg-ink font-display text-[16px] font-medium text-white">Sign in</Link>
        </div>
      )}

      {invite && !enrolment && !joined && (
        <form onSubmit={accept} className="space-y-[clamp(8px,1.3vh,12px)]">
          <Segmented
            label="Your account"
            value={mode}
            onChange={(v) => { setMode(v); setError(null); }}
            options={[
              { value: 'new', label: 'New to SynTax' },
              { value: 'existing', label: 'I already have an account' },
            ]}
          />
          {mode === 'new' ? (
            <>
              <Field label="Choose a password" icon={LockKeyhole} type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Choose a password, at least 8 characters" />
              <Field label="Password again" icon={LockKeyhole} type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Password again" />
            </>
          ) : (
            <>
              <Field label="Your SynTax password" icon={LockKeyhole} type="password" required maxLength={128} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your SynTax password" />
              <Field label="Authenticator code" icon={ShieldCheck} hint="6 digits" inputMode="numeric" required maxLength={6} value={totp} onChange={(e) => setTotp(digits(e.target.value))} placeholder="Authenticator code" className="[&_input]:tabular-nums" />
            </>
          )}
          <p className="px-1 font-display text-[12.5px] text-ink/50">The link works once, until {when(invite.expiresAt)}.</p>
          <PrimaryButton type="submit" busy={busy}>{busy ? 'Accepting' : mode === 'new' ? 'Continue' : 'Join the firm'}</PrimaryButton>
        </form>
      )}

      {enrolment && (
        <form onSubmit={enrol} className="space-y-3">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrolment.qrCodeDataUrl} alt="QR code for your authenticator app" width={140} height={140} className="rounded-[12px] ring-1 ring-black/5" />
            <div className="min-w-0 font-display text-[12.5px] text-ink/60">
              <p>Cannot scan? Enter this key:</p>
              <p className="mt-1 break-all font-mono text-[12px] text-ink">{enrolment.secret}</p>
            </div>
          </div>
          <details className="rounded-[16px] bg-[#f3f4f7] px-4 py-2.5 font-display text-[13px] text-ink/70" open>
            <summary className="cursor-pointer font-medium text-ink">Recovery codes, shown once</summary>
            <p className="mt-1 text-[12px]">Each works once if you lose your phone. Keep them somewhere safe, away from this computer.</p>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[12.5px] text-ink">
              {enrolment.recoveryCodes.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <label className="mt-2 flex items-center gap-2 text-[12.5px]">
              <input type="checkbox" checked={savedCodes} onChange={(e) => setSavedCodes(e.target.checked)} /> I have saved these codes
            </label>
          </details>
          <Field label="Code from your authenticator" icon={ShieldCheck} hint="6 digits" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={totp} onChange={(e) => setTotp(digits(e.target.value))} placeholder="Code from your authenticator" className="[&_input]:tabular-nums" />
          <PrimaryButton type="submit" busy={busy} disabled={!savedCodes}>{busy ? 'Checking' : 'Finish and sign in'}</PrimaryButton>
        </form>
      )}
    </AuthFrame>
  );
}
