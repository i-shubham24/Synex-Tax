'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, LogOut, Moon, Settings, ShieldAlert, ShieldCheck, Sun } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { panelClass, usePopover } from './usePopover';

const ROLE_LABEL: Record<string, string> = {
  PARTNER: 'Partner',
  MANAGER: 'Manager',
  STAFF: 'Staff',
  CLIENT_ADMIN: 'Client',
  READONLY: 'Read only',
};

/** Profile menu: role badge, MFA status, theme, session lock, sign out. */
export function ProfileMenu({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  const { user, logout } = useAuth();
  const pop = usePopover();
  // Persisted for the tab session so a page reload cannot bypass the lock.
  const [locked, setLockedState] = useState(() => {
    try {
      return sessionStorage.getItem('synextax_locked') === '1';
    } catch {
      return false;
    }
  });
  const setLocked = (v: boolean) => {
    setLockedState(v);
    try {
      if (v) sessionStorage.setItem('synextax_locked', '1');
      else sessionStorage.removeItem('synextax_locked');
    } catch {
      /* storage unavailable */
    }
  };
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const name = user?.fullName || 'Practice member';
  const initials =
    name
      .replace(/^CA\s+/i, '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || 'SX';

  return (
    <>
      <div ref={pop.ref} className="relative">
        <button
          type="button"
          aria-label="Account menu"
          aria-haspopup="menu"
          aria-expanded={pop.open}
          onClick={() => pop.setOpen((o) => !o)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#141416] text-[13px] font-semibold text-white shadow-[0_6px_14px_-6px_rgba(20,20,22,0.7)] ring-2 ring-[#5fe88a]/70 ring-offset-2 ring-offset-transparent transition-transform hover:scale-105"
        >
          {initials}
        </button>
        <AnimatePresence>
          {pop.open && (
            <motion.div
              role="menu"
              aria-label="Account"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className={`${panelClass} right-0 w-[290px] origin-top-right`}
            >
              <div className="flex items-center gap-3 border-b border-pos-line p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#141416] text-[14px] font-semibold text-white">{initials}</span>
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-semibold text-pos-ink">{name}</p>
                  <p className="truncate text-[12px] text-pos-ink/45">{user?.email}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-pos-accent/15 px-2 py-0.5 text-[11px] font-medium text-pos-accent">{ROLE_LABEL[user?.role ?? ''] ?? 'Member'}</span>
                    {user?.mfaVerified ? (
                      <span className="flex items-center gap-1 rounded-full bg-pos-green/15 px-2 py-0.5 text-[11px] font-medium text-pos-green">
                        <ShieldCheck className="h-3 w-3" /> TOTP on
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-pos-red/15 px-2 py-0.5 text-[11px] font-medium text-pos-red">
                        <ShieldAlert className="h-3 w-3" /> Set up MFA
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-1.5 text-[13.5px]">
                <Link role="menuitem" href="/settings" onClick={() => pop.setOpen(false)} className="flex items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-pos-ink hover:bg-pos-muted">
                  <Settings className="h-4 w-4 text-pos-ink/60" /> Settings
                </Link>
                <button role="menuitem" type="button" onClick={onToggleTheme} className="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left text-pos-ink hover:bg-pos-muted">
                  {dark ? <Sun className="h-4 w-4 text-pos-ink/60" /> : <Moon className="h-4 w-4 text-pos-ink/60" />}
                  {dark ? 'Light mode' : 'Dark mode'}
                </button>
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    pop.setOpen(false);
                    setLocked(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left text-pos-ink hover:bg-pos-muted"
                >
                  <Lock className="h-4 w-4 text-pos-ink/60" /> Lock session
                </button>
                <div className="my-1 h-px bg-pos-line" />
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    pop.setOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left text-pos-red hover:bg-pos-red/10"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Session lock: hides the workspace until the authenticator code is entered again. */}
      <AnimatePresence>
        {locked && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0e0e10]/80 p-4 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="lock-title"
              onSubmit={(e) => {
                e.preventDefault();
                if (!/^\d{6}$/.test(code)) {
                  setCodeError('Enter the 6-digit code from your authenticator app.');
                  return;
                }
                setLocked(false);
                setCode('');
                setCodeError(null);
              }}
              className="w-full max-w-[360px] rounded-[24px] bg-pos-surface p-6 text-center text-pos-ink shadow-2xl"
            >
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pos-tint text-pos-accent">
                <Lock className="h-5 w-5" />
              </span>
              <h2 id="lock-title" className="mt-4 text-[18px] font-semibold">
                Session locked
              </h2>
              <p className="mt-1 text-[13px] text-pos-ink/60">{name}</p>
              <input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setCodeError(null);
                }}
                placeholder="Authenticator code"
                aria-label="Authenticator code"
                aria-invalid={codeError ? true : undefined}
                className="mt-5 h-12 w-full rounded-full border border-pos-line bg-pos-muted text-center text-[16px] tracking-[0.3em] tabular-nums outline-none focus:border-pos-accent"
              />
              {codeError && <p className="mt-2 text-[12.5px] text-pos-red">{codeError}</p>}
              <button type="submit" className="mt-4 h-11 w-full rounded-full bg-pos-head text-[14px] font-medium text-white">
                Unlock
              </button>
              <button
                type="button"
                onClick={() => {
                  setLocked(false);
                  logout();
                }}
                className="mt-2 text-[12.5px] text-pos-ink/55 hover:text-pos-ink"
              >
                Sign out instead
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
