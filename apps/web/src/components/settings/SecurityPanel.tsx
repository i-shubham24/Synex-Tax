'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Laptop, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface Session { id: string; device: string; ipMasked: string | null; lastUsedAt: string; expiresAt: string; current: boolean }

const input = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

/** Your password, the authenticator requirement and the devices signed in to your account. */
export function SecurityPanel() {
  const { authFetch, logout } = useAuth();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [currentKnown, setCurrentKnown] = useState(true);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [pw, setPw] = useState({ current: '', next: '', again: '', totp: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await authFetch('/api/v1/account/sessions');
    if (!r.ok) return setMessage({ tone: 'bad', text: 'Your signed-in sessions could not be loaded.' });
    const b = await r.json();
    setSessions(b.sessions);
    setCurrentKnown(b.currentSessionKnown);
  }, [authFetch]);
  useEffect(() => { load(); }, [load]);

  const signOut = async (s: Session) => {
    setMessage(null);
    const r = await authFetch(`/api/v1/account/sessions/${s.id}/revoke`, { method: 'POST' });
    if (s.current && r.ok) return logout();
    setMessage(r.ok ? { tone: 'ok', text: `${s.device} is signed out. It may keep working for up to an hour, until its current access ends.` } : { tone: 'bad', text: 'That session had already ended.' });
    load();
  };
  const signOutOthers = async () => {
    setMessage(null);
    const r = await authFetch('/api/v1/account/sessions/revoke-others', { method: 'POST' });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return setMessage({ tone: 'bad', text: 'The other sessions could not be signed out.' });
    if (!b.keptCurrent) return logout();
    setMessage({ tone: 'ok', text: b.ended ? `${b.ended} other session${b.ended === 1 ? '' : 's'} signed out.` : 'No other sessions were signed in.' });
    load();
  };

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (pw.next !== pw.again) return setMessage({ tone: 'bad', text: 'The two new passwords do not match.' });
    if (pw.next.length < 8) return setMessage({ tone: 'bad', text: 'Use at least 8 characters for the new password.' });
    setBusy(true);
    const r = await authFetch('/api/v1/account/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next, totpCode: pw.totp }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMessage({ tone: 'bad', text: r.status === 429 ? 'Too many attempts. Wait 15 minutes and try again.' : b.message ?? 'The password was not changed.' });
    setPw({ current: '', next: '', again: '', totp: '' });
    setMessage({ tone: 'ok', text: b.message ?? 'Password changed.' });
    load();
  };

  const others = (sessions ?? []).filter((s) => !s.current).length;

  return (
    <div className="space-y-6">
      <div className="border-b border-pos-line pb-4">
        <h3 className="text-lg font-semibold text-pos-ink">Security</h3>
        <p className="mt-0.5 text-[12px] text-pos-ink/65">Your password, the authenticator app and the devices signed in to your account.</p>
      </div>

      {message && <p role="status" className={`rounded-[10px] px-3 py-2 text-[13px] ${message.tone === 'ok' ? 'bg-[#22a356]/10 text-[#15803d]' : 'bg-[#dc2626]/5 text-[#dc2626]'}`}>{message.text}</p>}

      <section className="rounded-xl border border-pos-line bg-pos-muted p-4">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-pos-ink"><ShieldCheck className="h-4 w-4 text-[#15803d]" /> Authenticator app required</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-pos-ink/65">Every sign-in, password change and password reset asks for a 6-digit code from your authenticator app. It cannot be switched off for any account.</p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[14px] font-semibold text-pos-ink">Signed-in sessions</h4>
          <button type="button" onClick={signOutOthers} disabled={!sessions || (currentKnown && others === 0)} className="inline-flex items-center gap-1.5 rounded-full border border-pos-line px-3 py-1.5 text-[12.5px] text-pos-ink hover:bg-pos-tint disabled:opacity-40">
            <LogOut className="h-3.5 w-3.5" /> Sign out all other sessions
          </button>
        </div>
        {!currentKnown && <p className="text-[12px] text-pos-ink/55">This browser signed in before sessions were tracked, so it is not marked. Signing out all others signs this one out too.</p>}
        {sessions === null ? (
          <p className="text-[13px] text-pos-ink/55">Loading sessions.</p>
        ) : sessions.length === 0 ? (
          <p className="text-[13px] text-pos-ink/55">No signed-in sessions.</p>
        ) : (
          <ul className="divide-y divide-pos-line rounded-xl border border-pos-line">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-start gap-3">
                  <Laptop className="mt-0.5 h-4 w-4 text-pos-ink/60" />
                  <div>
                    <p className="text-[13.5px] font-medium text-pos-ink">{s.device}{s.current && <span className="ml-2 rounded-full bg-[#22a356]/10 px-2 py-0.5 text-[12px] font-medium text-[#15803d]">This device</span>}</p>
                    <p className="text-[12px] text-pos-ink/55">
                      {s.ipMasked ? <>Network <span className="font-mono">{s.ipMasked}</span>, </> : null}last used {when(s.lastUsedAt)}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => signOut(s)} className="text-[12.5px] text-[#dc2626] hover:underline">{s.current ? 'Sign out here' : 'Sign out'}</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={change} className="space-y-3 rounded-xl border border-pos-line p-4">
        <h4 className="flex items-center gap-2 text-[14px] font-semibold text-pos-ink"><KeyRound className="h-4 w-4 text-pos-ink/60" /> Change password</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[12px] text-pos-ink/60">Current password<input type="password" required autoComplete="current-password" maxLength={128} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className={input} /></label>
          <label className="text-[12px] text-pos-ink/60">Authenticator code<input inputMode="numeric" required autoComplete="one-time-code" maxLength={6} value={pw.totp} onChange={(e) => setPw({ ...pw, totp: digits(e.target.value) })} className={`${input} font-mono tabular-nums`} /></label>
          <label className="text-[12px] text-pos-ink/60">New password<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={input} /></label>
          <label className="text-[12px] text-pos-ink/60">New password again<input type="password" required autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} className={input} /></label>
        </div>
        <p className="text-[12px] text-pos-ink/55">Other devices are signed out when the password changes; this one stays signed in.</p>
        <button type="submit" disabled={busy} className="rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60">{busy ? 'Changing' : 'Change password'}</button>
      </form>
    </div>
  );
}
