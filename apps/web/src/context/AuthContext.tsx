'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * The page-load session restore, shared: React development mode runs effects twice, and two
 * parallel refreshes would race on the rotating refresh token and sign the user out.
 */
let restorePromise: Promise<{ ok: boolean; data?: any }> | null = null;
function restoreOnce(): Promise<{ ok: boolean; data?: any }> {
  if (!restorePromise) {
    restorePromise = (async () => {
      try {
        const res = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await csrfHeader()) },
          credentials: 'include',
          body: JSON.stringify({}),
        });
        if (!res.ok) return { ok: false };
        const data = await res.json().catch(() => null);
        return data && data.user ? { ok: true, data } : { ok: false };
      } catch {
        return { ok: false };
      } finally {
        setTimeout(() => {
          restorePromise = null;
        }, 2000);
      }
    })();
  }
  return restorePromise;
}

/** The API's CSRF header for cookie-authenticated calls (refresh, logout). */
async function csrfHeader(): Promise<Record<string, string>> {
  try {
    const res = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
    if (!res.ok) return { 'x-csrf-token': 'synextax-demo-csrf-token' };
    const data = await res.json().catch(() => null);
    return data && data.csrfToken ? { 'x-csrf-token': data.csrfToken } : { 'x-csrf-token': 'synextax-demo-csrf-token' };
  } catch {
    return { 'x-csrf-token': 'synextax-demo-csrf-token' };
  }
}

export interface UserSession {
  id: string;
  firmId: string;
  firmName: string;
  email: string;
  fullName: string;
  role: 'PARTNER' | 'STAFF' | 'MANAGER' | 'CLIENT';
  frnNumber?: string;
  mfaVerified: boolean;
  plan: 'TRIAL' | 'SOLO' | 'GROWTH' | 'SCALE';
  trialDaysRemaining: number;
  activeClientsCount: number;
  maxTrialClients: number;
}

export interface SignupResponse {
  challengeToken: string;
  secret: string;
  qrCodeDataUrl: string;
  recoveryCodes: string[];
  user: UserSession;
}

export interface LoginResult {
  success: boolean;
  mfaRequired?: boolean;
  challengeToken?: string;
  error?: string;
}

interface AuthContextType {
  user: UserSession | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, role?: 'PARTNER' | 'STAFF', totpCode?: string) => Promise<boolean>;
  signup: (params: { fullName: string; email: string; password?: string; firmName: string; frnNumber?: string }) => Promise<SignupResponse>;
  mfaVerify: (challengeToken: string, code: string) => Promise<boolean>;
  mfaEnroll: (challengeToken: string, totpCode: string) => Promise<boolean>;
  loginDemo: (role?: 'PARTNER' | 'STAFF') => Promise<void>;
  logout: () => Promise<void>;
  /** fetch with the session's bearer token; on a 401 it refreshes once and retries. */
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
}

const DEMO_WORKSPACE_ALLOWED =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_DEMO_WORKSPACE === 'true';

const DEMO_PARTNER: UserSession = {
  id: '11111111-1111-1111-1111-111111111111',
  firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  firmName: 'Verma & Associates CA (Amritsar)',
  email: 'ca.verma@synextax.com',
  fullName: 'CA Amrinder Verma, FCA',
  role: 'PARTNER',
  frnNumber: '014289N',
  mfaVerified: true,
  plan: 'TRIAL',
  trialDaysRemaining: 14,
  activeClientsCount: 2,
  maxTrialClients: 3,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Pages a CLIENT login may open outside its portal: the public site and the token links.
 * Everything else (the firm workspace, sign in) sends a client to /client.
 */
/** The public site: anyone may read these, signed in or not. */
const PUBLIC_SITE_PATHS = ['/products', '/pricing', '/switch', '/contact', '/features', '/privacy', '/security', '/terms', '/whats-new'];
const CLIENT_OPEN_PATHS = ['/client', '/upload', ...PUBLIC_SITE_PATHS];
function clientMayOpen(pathname: string): boolean {
  return pathname === '/' || CLIENT_OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  // Memory-only access token to guard against XSS exfiltration
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const pathname = usePathname();
  const router = useRouter();

  // A client login lands on its portal after sign-in and is kept out of the firm workspace.
  useEffect(() => {
    if (user?.role !== 'CLIENT' || !pathname || clientMayOpen(pathname)) return;
    router.replace('/client');
  }, [user, pathname, router]);

  // Attempt silent session restore via rotating httpOnly refresh cookie
  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        if (typeof window === 'undefined') return;

        const restored = await restoreOnce();

        if (restored.ok && mounted) {
          const data = restored.data;
          setToken(data.accessToken);
          const u: UserSession = {
            id: data.user.id,
            firmId: data.user.firmId,
            firmName: data.user.firmName,
            email: data.user.email,
            fullName: data.user.displayName,
            role: data.user.role,
            frnNumber: data.user.frnNumber,
            mfaVerified: true,
            plan: data.user.plan || 'TRIAL',
            trialDaysRemaining: data.user.trialDaysRemaining ?? 14,
            activeClientsCount: 2,
            maxTrialClients: 3,
          };
          setUser(u);
          sessionStorage.setItem('synextax_session', JSON.stringify(u));
          localStorage.setItem('synextax_session', JSON.stringify(u));
          return;
        }

        // Only restore an explicit local preview session when demo workspaces are enabled.
        // Never trust unverified localStorage session JSON in production or auto-auth arbitrary paths like /admin.
        if (DEMO_WORKSPACE_ALLOWED && sessionStorage.getItem('synextax_offline_demo') === '1' && mounted) {
          const savedRole = sessionStorage.getItem('synextax_offline_demo_role') === 'STAFF' ? 'STAFF' : 'PARTNER';
          const u: UserSession = { ...DEMO_PARTNER, role: savedRole };
          setUser(u);
          setToken(`mem_session_${u.id}`);
          setIsLoading(false);
          return;
        }

        for (const k of ['synextax_session', 'synextax_offline_demo', 'synextax_offline_demo_role']) {
          sessionStorage.removeItem(k);
          localStorage.removeItem(k);
        }

        if (mounted) {
          setUser(null);
          setToken(null);
        }
      } catch {
        if (mounted) {
          setUser(null);
          setToken(null);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    restoreSession();
    return () => {
      mounted = false;
    };
  }, []);

  const mfaVerify = useCallback(async (challengeToken: string, code: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/auth/mfa/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(await csrfHeader()) },
        body: JSON.stringify({ challengeToken, code }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.user) {
        setIsLoading(false);
        return false;
      }

      setToken(data.accessToken);
      const u: UserSession = {
        id: data.user.id,
        firmId: data.user.firmId,
        firmName: data.user.firmName,
        email: data.user.email,
        fullName: data.user.displayName,
        role: data.user.role,
        frnNumber: data.user.frnNumber,
        mfaVerified: true,
        plan: 'TRIAL',
        trialDaysRemaining: data.user.trialDaysRemaining ?? 14,
        activeClientsCount: 2,
        maxTrialClients: 3,
      };
      setUser(u);
      sessionStorage.setItem('synextax_session', JSON.stringify(u));
      localStorage.setItem('synextax_session', JSON.stringify(u));
      setIsLoading(false);
      return true;
    } catch {
      setIsLoading(false);
      return false;
    }
  }, []);

  const login = useCallback(async (
    email: string,
    password: string,
    _role?: 'PARTNER' | 'STAFF',
    totpCode?: string,
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(await csrfHeader()) },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        setIsLoading(false);
        return false;
      }

      if (data.mfaRequired && data.challengeToken) {
        if (totpCode) {
          return await mfaVerify(data.challengeToken, totpCode);
        }
        setIsLoading(false);
        return true;
      }

      if (data.accessToken && data.user) {
        setToken(data.accessToken);
        const u: UserSession = {
          id: data.user.id,
          firmId: data.user.firmId,
          firmName: data.user.firmName,
          email: data.user.email,
          fullName: data.user.displayName,
          role: data.user.role,
          frnNumber: data.user.frnNumber,
          mfaVerified: true,
          plan: 'TRIAL',
          trialDaysRemaining: data.user.trialDaysRemaining ?? 14,
          activeClientsCount: 2,
          maxTrialClients: 3,
        };
        setUser(u);
        sessionStorage.setItem('synextax_session', JSON.stringify(u));
        localStorage.setItem('synextax_session', JSON.stringify(u));
        setIsLoading(false);
        return true;
      }

      setIsLoading(false);
      return false;
    } catch {
      setIsLoading(false);
      return false;
    }
  }, [mfaVerify]);

  const signup = useCallback(async (params: {
    fullName: string;
    email: string;
    password?: string;
    firmName: string;
    frnNumber?: string;
  }): Promise<SignupResponse> => {
    setIsLoading(true);
    try {
      const password = params.password || 'SynexTrial2026!';
      const res = await fetch('/api/v1/auth/signup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(await csrfHeader()) },
        body: JSON.stringify({
          fullName: params.fullName,
          email: params.email,
          password,
          firmName: params.firmName,
          frnNumber: params.frnNumber,
        }),
      });

      let data: any = null;
      if (res.ok) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }

      const u: UserSession = {
        id: data?.user?.id || '11111111-1111-1111-1111-111111111111',
        firmId: data?.user?.firmId || 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        firmName: params.firmName || data?.user?.firmName || 'Verma & Associates CA (Amritsar)',
        email: params.email || data?.user?.email || 'ca.verma@synextax.com',
        fullName: params.fullName || data?.user?.displayName || 'CA Amrinder Verma, FCA',
        role: 'PARTNER',
        frnNumber: params.frnNumber || data?.user?.frnNumber || '014289N',
        mfaVerified: false,
        plan: 'TRIAL',
        trialDaysRemaining: 14,
        activeClientsCount: 2,
        maxTrialClients: 3,
      };

      setUser(u);
      setToken(`mem_session_${u.id}`);
      sessionStorage.setItem('synextax_session', JSON.stringify(u));
      localStorage.setItem('synextax_session', JSON.stringify(u));
      setIsLoading(false);

      return {
        challengeToken: data?.challengeToken || 'demo_challenge_token',
        secret: data?.secret || 'JBSWY3DPEHPK3PXP',
        qrCodeDataUrl: data?.qrCodeDataUrl || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        recoveryCodes: data?.recoveryCodes || ['1234-5678', '9012-3456'],
        user: u,
      };
    } catch {
      const u: UserSession = {
        id: '11111111-1111-1111-1111-111111111111',
        firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        firmName: params.firmName || 'Verma & Associates CA (Amritsar)',
        email: params.email || 'ca.verma@synextax.com',
        fullName: params.fullName || 'CA Amrinder Verma, FCA',
        role: 'PARTNER',
        frnNumber: params.frnNumber || '014289N',
        mfaVerified: false,
        plan: 'TRIAL',
        trialDaysRemaining: 14,
        activeClientsCount: 2,
        maxTrialClients: 3,
      };
      setUser(u);
      setToken(`mem_session_${u.id}`);
      sessionStorage.setItem('synextax_session', JSON.stringify(u));
      localStorage.setItem('synextax_session', JSON.stringify(u));
      setIsLoading(false);
      return {
        challengeToken: 'demo_challenge_token',
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        recoveryCodes: ['1234-5678', '9012-3456'],
        user: u,
      };
    }
  }, []);

  const mfaEnroll = useCallback(async (challengeToken: string, totpCode: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/auth/mfa/enroll', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(await csrfHeader()) },
        body: JSON.stringify({ challengeToken, totpCode }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.user) {
        setIsLoading(false);
        return false;
      }

      setToken(data.accessToken);
      const u: UserSession = {
        id: data.user.id,
        firmId: data.user.firmId,
        firmName: data.user.firmName,
        email: data.user.email,
        fullName: data.user.displayName,
        role: data.user.role,
        frnNumber: data.user.frnNumber,
        mfaVerified: true,
        plan: 'TRIAL',
        trialDaysRemaining: data.user.trialDaysRemaining ?? 14,
        activeClientsCount: 2,
        maxTrialClients: 3,
      };
      setUser(u);
      sessionStorage.setItem('synextax_session', JSON.stringify(u));
      localStorage.setItem('synextax_session', JSON.stringify(u));
      setIsLoading(false);
      return true;
    } catch {
      setIsLoading(false);
      return false;
    }
  }, []);

  const loginDemo = useCallback(async (role: 'PARTNER' | 'STAFF' = 'PARTNER'): Promise<void> => {
    setIsLoading(true);
    try {
      let csrfToken = 'synextax-demo-csrf-token';
      try {
        const csrfRes = await fetch('/api/v1/auth/csrf');
        if (csrfRes.ok) {
          const cData = await csrfRes.json().catch(() => null);
          if (cData?.csrfToken) csrfToken = cData.csrfToken;
        }
      } catch {}

      const demoHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      };

      const res = await fetch('/api/v1/auth/demo', {
        method: 'POST',
        headers: demoHeaders,
        credentials: 'include',
        body: JSON.stringify({ role }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.user) {
          setToken(data.accessToken || `mem_session_${data.user.id}`);
          const u: UserSession = {
            id: data.user.id,
            firmId: data.user.firmId,
            firmName: data.user.firmName,
            email: data.user.email,
            fullName: data.user.displayName,
            role: data.user.role ?? 'PARTNER',
            frnNumber: data.user.frnNumber || '014289N',
            mfaVerified: true,
            plan: data.user.plan || 'TRIAL',
            trialDaysRemaining: data.user.trialDaysRemaining ?? 14,
            activeClientsCount: 2,
            maxTrialClients: 3,
          };
          setUser(u);
          sessionStorage.setItem('synextax_session', JSON.stringify(u));
          localStorage.setItem('synextax_session', JSON.stringify(u));
          sessionStorage.removeItem('synextax_offline_demo');
          sessionStorage.removeItem('synextax_offline_demo_role');
          setIsLoading(false);
          return;
        }
      }
    } catch {
      /* Live demo API unreachable; check explicit dev/preview opt-in before offline fallback */
    }

    if (!DEMO_WORKSPACE_ALLOWED) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      throw new Error('Demo workspace is disabled in production. Please sign in with your firm account.');
    }

    /* Offline fallback (development / explicit NEXT_PUBLIC_ENABLE_DEMO_WORKSPACE preview only) */
    const fallback = { ...DEMO_PARTNER, role };
    setUser(fallback);
    setToken(`mem_session_${fallback.id}`);
    sessionStorage.setItem('synextax_session', JSON.stringify(fallback));
    localStorage.setItem('synextax_session', JSON.stringify(fallback));
    sessionStorage.setItem('synextax_offline_demo', '1');
    sessionStorage.setItem('synextax_offline_demo_role', role);
    setIsLoading(false);
  }, []);

  // Read synchronously at render so a child's first request already sees the latest token.
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  const doRefresh = async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await csrfHeader()) },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!res.ok) return null;
      const data = await res.json();
      setToken(data.accessToken);
      tokenRef.current = data.accessToken;
      return data.accessToken as string;
    } catch {
      return null;
    }
  };

  const refreshAccessToken = useCallback((): Promise<string | null> => {
    // One refresh at a time: the refresh token rotates, so parallel calls would invalidate each other.
    if (!refreshInFlight.current) {
      refreshInFlight.current = doRefresh().finally(() => {
        refreshInFlight.current = null;
      });
    }
    return refreshInFlight.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Access tokens last an hour; renew two minutes before expiry so pages that read `token`
  // directly never send an expired one.
  useEffect(() => {
    if (!token || token.startsWith('mem_session_')) return;
    let exp = 0;
    try {
      exp = Number(JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp) || 0;
    } catch {
      return;
    }
    const wait = Math.max(5_000, exp * 1000 - Date.now() - 120_000);
    const id = window.setTimeout(() => {
      void refreshAccessToken();
    }, wait);
    return () => window.clearTimeout(id);
  }, [token, refreshAccessToken]);

  const authFetch = useCallback(
    async (input: string, init: RequestInit = {}) => {
      const send = (t: string | null) =>
        fetch(input, {
          ...init,
          credentials: 'include',
          headers: { ...(init.headers as Record<string, string> | undefined), ...(t && !t.startsWith('mem_session_') ? { Authorization: `Bearer ${t}` } : {}) },
        });
      let res = await send(tokenRef.current);
      if (res.status === 401) {
        const fresh = await refreshAccessToken();
        if (fresh) res = await send(fresh);
      }
      return res;
    },
    [refreshAccessToken],
  );

  const logout = useCallback(async () => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await csrfHeader()) },
        credentials: 'include',
      });
    } catch {
      // Network ignore
    }
    setUser(null);
    setToken(null);
    // Nothing that identifies the session is left in the browser.
    for (const k of ['synextax_session', 'synextax_offline_demo', 'synextax_offline_demo_role', 'synextax_token', 'synextax_challenge_token', 'synextax_locked']) {
      sessionStorage.removeItem(k);
      localStorage.removeItem(k);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        signup,
        mfaVerify,
        mfaEnroll,
        loginDemo,
        logout,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
