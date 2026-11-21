'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

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
        return res.ok ? { ok: true, data: await res.json() } : { ok: false };
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
    if (!res.ok) return {};
    const data = await res.json();
    return data.csrfToken ? { 'x-csrf-token': data.csrfToken } : {};
  } catch {
    return {};
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
  upgradePlan: (plan: 'SOLO' | 'GROWTH' | 'SCALE') => void;
  /** fetch with the session's bearer token; on a 401 it refreshes once and retries. */
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
}

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  // Memory-only access token to guard against XSS exfiltration
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Attempt silent session restore via rotating httpOnly refresh cookie
  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        if (typeof window === 'undefined') return;
        // Tokens never live in web storage: the access token is kept in memory and the refresh
        // token in an httpOnly cookie. Clear anything older code left behind.
        localStorage.removeItem('synextax_token');
        localStorage.removeItem('synextax_user');
        sessionStorage.removeItem('synextax_token');

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
            plan: 'TRIAL',
            trialDaysRemaining: data.user.trialDaysRemaining ?? 14,
            activeClientsCount: 2,
            maxTrialClients: 3,
          };
          setUser(u);
          sessionStorage.setItem('synextax_session', JSON.stringify(u));
          return;
        }

        // An offline demo chosen on the login page (sample data, no API) survives a reload in this tab.
        const cachedUser = sessionStorage.getItem('synextax_session');
        if (cachedUser && sessionStorage.getItem('synextax_offline_demo') === '1' && mounted) {
          setUser(JSON.parse(cachedUser) as UserSession);
          setToken(`mem_session_${DEMO_PARTNER.id}`);
          return;
        }

        // No session: the workspace gate sends the visitor to sign in.
        sessionStorage.removeItem('synextax_session');
        sessionStorage.removeItem('synextax_offline_demo');
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken, code }),
      });

      const data = await res.json();
      if (!res.ok) {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setIsLoading(false);
        return false;
      }

      if (data.mfaRequired && data.challengeToken) {
        if (totpCode) {
          return await mfaVerify(data.challengeToken, totpCode);
        }
        sessionStorage.setItem('synextax_challenge_token', data.challengeToken);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: params.fullName,
          email: params.email,
          password,
          firmName: params.firmName,
          frnNumber: params.frnNumber,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Signup failed');
      }

      const u: UserSession = {
        id: data.user.id,
        firmId: data.user.firmId,
        firmName: data.user.firmName,
        email: data.user.email,
        fullName: data.user.displayName,
        role: 'PARTNER',
        frnNumber: data.user.frnNumber,
        mfaVerified: false,
        plan: 'TRIAL',
        trialDaysRemaining: 14,
        activeClientsCount: 2,
        maxTrialClients: 3,
      };

      setUser(u);
      sessionStorage.setItem('synextax_session', JSON.stringify(u));
      setIsLoading(false);

      return {
        challengeToken: data.challengeToken,
        secret: data.secret,
        qrCodeDataUrl: data.qrCodeDataUrl,
        recoveryCodes: data.recoveryCodes,
        user: u,
      };
    } catch (err) {
      setIsLoading(false);
      throw err;
    }
  }, []);

  const mfaEnroll = useCallback(async (challengeToken: string, totpCode: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/auth/mfa/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken, totpCode }),
      });

      const data = await res.json();
      if (!res.ok) {
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
      let csrfToken = '';
      try {
        const csrfRes = await fetch('/api/v1/auth/csrf');
        if (csrfRes.ok) {
          const cData = await csrfRes.json();
          csrfToken = cData.csrfToken || '';
        }
      } catch {}

      const demoHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrfToken) demoHeaders['x-csrf-token'] = csrfToken;

      const res = await fetch('/api/v1/auth/demo', {
        method: 'POST',
        headers: demoHeaders,
        credentials: 'include',
        body: JSON.stringify({ role }),
      });

      if (res.ok) {
        const data = await res.json();
        setToken(data.accessToken);
        const u: UserSession = {
          id: data.user.id,
          firmId: data.user.firmId,
          firmName: data.user.firmName,
          email: data.user.email,
          fullName: data.user.displayName,
          // The server decides the role; the demo signs in as its partner whatever was picked.
          role: data.user.role ?? 'PARTNER',
          frnNumber: data.user.frnNumber || '014289N',
          mfaVerified: true,
          plan: 'TRIAL',
          trialDaysRemaining: data.user.trialDaysRemaining ?? 14,
          activeClientsCount: 2,
          maxTrialClients: 3,
        };
        setUser(u);
        sessionStorage.setItem('synextax_session', JSON.stringify(u));
        sessionStorage.removeItem('synextax_offline_demo');
        setIsLoading(false);
        return;
      }
      // The API answered with an error: report it rather than pretending to be signed in.
      setIsLoading(false);
      if (res.status === 404) throw new Error('The demo workspace is switched off on this site. Sign in with your firm’s account.');
      if (res.status >= 500) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body && typeof body.message === 'string'
            ? 'The demo workspace could not be opened: the server could not reach its database. Try again later.'
            : 'The demo workspace could not be opened: the SynexTax server is not responding. Try again later.',
        );
      }
      throw new Error('The demo workspace could not be opened. Try again in a moment.');
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('The demo workspace')) throw err;
      // Network failure only: fall through to the offline demo below.
    }

    // API unreachable (a static preview): sample data only, clearly offline.
    const fallback = { ...DEMO_PARTNER, role };
    setUser(fallback);
    setToken(`mem_session_${fallback.id}`);
    sessionStorage.setItem('synextax_session', JSON.stringify(fallback));
    sessionStorage.setItem('synextax_offline_demo', '1');
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
    sessionStorage.removeItem('synextax_session');
    sessionStorage.removeItem('synextax_offline_demo');
  }, []);

  const upgradePlan = useCallback((plan: 'SOLO' | 'GROWTH' | 'SCALE') => {
    setUser((prev) => (prev ? { ...prev, plan, trialDaysRemaining: 365, maxTrialClients: 999 } : null));
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
        upgradePlan,
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
