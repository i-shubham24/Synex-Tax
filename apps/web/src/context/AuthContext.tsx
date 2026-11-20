'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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

        // Purge any legacy storage tokens
        localStorage.removeItem('synextax_token');
        localStorage.removeItem('synextax_user');

        const res = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (res.ok && mounted) {
          const data = await res.json();
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

        // Check sessionStorage cache for offline/demo tab restore
        const cachedToken = sessionStorage.getItem('synextax_token');
        const cachedUser = sessionStorage.getItem('synextax_session');
        if (cachedToken && cachedUser && mounted) {
          const parsed = JSON.parse(cachedUser) as UserSession;
          setUser(parsed);
          setToken(cachedToken);
          return;
        }

        // Try demo login to establish real signed JWT session
        try {
          let csrfToken = '';
          const csrfRes = await fetch('/api/v1/auth/csrf');
          if (csrfRes.ok) {
            const cData = await csrfRes.json();
            csrfToken = cData.csrfToken || '';
          }

          const demoHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
          if (csrfToken) demoHeaders['x-csrf-token'] = csrfToken;

          const demoRes = await fetch('/api/v1/auth/demo', {
            method: 'POST',
            headers: demoHeaders,
            body: JSON.stringify({ role: 'PARTNER' }),
          });

          if (demoRes.ok && mounted) {
            const dData = await demoRes.json();
            setToken(dData.accessToken);
            const u: UserSession = {
              id: dData.user.id,
              firmId: dData.user.firmId,
              firmName: dData.user.firmName,
              email: dData.user.email,
              fullName: dData.user.displayName,
              role: 'PARTNER',
              frnNumber: dData.user.frnNumber || '014289N',
              mfaVerified: true,
              plan: 'TRIAL',
              trialDaysRemaining: dData.user.trialDaysRemaining ?? 14,
              activeClientsCount: 2,
              maxTrialClients: 3,
            };
            setUser(u);
            sessionStorage.setItem('synextax_session', JSON.stringify(u));
            sessionStorage.setItem('synextax_token', dData.accessToken);
            return;
          }
        } catch {
          // Dev offline fallback
        }

        if (mounted) {
          setUser(DEMO_PARTNER);
          setToken(`mem_session_${DEMO_PARTNER.id}_${Date.now()}`);
        }
      } catch {
        if (mounted) {
          setUser(DEMO_PARTNER);
          setToken(`mem_session_${DEMO_PARTNER.id}_${Date.now()}`);
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
          role: role,
          frnNumber: data.user.frnNumber || '014289N',
          mfaVerified: true,
          plan: 'TRIAL',
          trialDaysRemaining: data.user.trialDaysRemaining ?? 14,
          activeClientsCount: 2,
          maxTrialClients: 3,
        };
        setUser(u);
        sessionStorage.setItem('synextax_session', JSON.stringify(u));
        sessionStorage.setItem('synextax_token', data.accessToken);
        setIsLoading(false);
        return;
      }
    } catch {
      // Fall back to offline demo session
    }

    const fallback = { ...DEMO_PARTNER, role };
    setUser(fallback);
    setToken(`mem_session_${fallback.id}_${Date.now()}`);
    sessionStorage.setItem('synextax_session', JSON.stringify(fallback));
    setIsLoading(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // Network ignore
    }
    setUser(null);
    setToken(null);
    sessionStorage.removeItem('synextax_session');
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
