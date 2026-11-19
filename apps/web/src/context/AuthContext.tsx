'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface UserSession {
  id: string;
  firmId: string;
  firmName: string;
  email: string;
  fullName: string;
  role: 'PARTNER' | 'STAFF' | 'CLIENT_ADMIN' | 'READONLY';
  frnNumber?: string;
  mfaVerified: boolean;
  plan: 'TRIAL' | 'SOLO' | 'GROWTH' | 'SCALE';
  trialDaysRemaining: number;
  activeClientsCount: number;
  maxTrialClients: number;
}

interface AuthContextType {
  user: UserSession | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, role?: 'PARTNER' | 'STAFF') => Promise<boolean>;
  signup: (params: { fullName: string; email: string; firmName: string; frnNumber?: string }) => Promise<boolean>;
  loginDemo: (role: 'PARTNER' | 'STAFF') => void;
  logout: () => void;
  upgradePlan: (plan: 'SOLO' | 'GROWTH' | 'SCALE') => void;
}

const DEMO_USERS: Record<'PARTNER' | 'STAFF', UserSession> = {
  PARTNER: {
    id: 'u-101',
    firmId: '00000000-0000-0000-0000-000000000001',
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
  },
  STAFF: {
    id: 'u-102',
    firmId: '00000000-0000-0000-0000-000000000001',
    firmName: 'Verma & Associates CA (Amritsar)',
    email: 'staff.rajat@synextax.com',
    fullName: 'Rajat Sharma (Senior Tax Associate)',
    role: 'STAFF',
    frnNumber: '014289N',
    mfaVerified: true,
    plan: 'TRIAL',
    trialDaysRemaining: 14,
    activeClientsCount: 2,
    maxTrialClients: 3,
  },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  // Auth token is stored exclusively in memory state to protect against XSS token exfiltration
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    try {
      // Purge any legacy authentication token from localStorage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('synextax_token');

        // Restore non-sensitive display session from sessionStorage (tab scoped)
        const savedSession = sessionStorage.getItem('synextax_session');
        if (savedSession) {
          const parsed = JSON.parse(savedSession) as UserSession;
          setUser(parsed);
          // Set in-memory session token
          setToken(`mem_session_${parsed.id}_${Date.now()}`);
        } else {
          // Default to partner session in trial mode if no session exists
          setUser(DEMO_USERS.PARTNER);
          setToken(`mem_session_${DEMO_USERS.PARTNER.id}_${Date.now()}`);
        }
      }
    } catch {
      // Ignore storage errors in restricted contexts
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, _password: string, role: 'PARTNER' | 'STAFF' = 'PARTNER'): Promise<boolean> => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 300));

    const selectedUser = DEMO_USERS[role] || {
      id: 'u-custom',
      firmId: '00000000-0000-0000-0000-000000000001',
      firmName: 'Verma & Associates CA (Amritsar)',
      email,
      fullName: email.split('@')[0],
      role,
      frnNumber: '014289N',
      mfaVerified: true,
      plan: 'TRIAL',
      trialDaysRemaining: 14,
      activeClientsCount: 2,
      maxTrialClients: 3,
    };

    const sessionJwt = 'jwt_mem_token_' + selectedUser.id + '_' + Date.now();
    setUser(selectedUser);
    setToken(sessionJwt);

    // Save non-sensitive metadata in sessionStorage only
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('synextax_session', JSON.stringify(selectedUser));
      localStorage.removeItem('synextax_token');
      localStorage.removeItem('synextax_user');
    }

    setIsLoading(false);
    return true;
  };

  const signup = async (params: {
    fullName: string;
    email: string;
    firmName: string;
    frnNumber?: string;
  }): Promise<boolean> => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 400));

    const newUser: UserSession = {
      id: 'u-trial-' + Date.now(),
      firmId: 'firm-trial-' + Date.now(),
      firmName: params.firmName || 'Amritsar Practice Hub',
      email: params.email,
      fullName: params.fullName,
      role: 'PARTNER',
      frnNumber: params.frnNumber || '014289N',
      mfaVerified: true,
      plan: 'TRIAL',
      trialDaysRemaining: 14,
      activeClientsCount: 2,
      maxTrialClients: 3,
    };

    const sessionJwt = 'jwt_mem_token_trial_' + newUser.id;
    setUser(newUser);
    setToken(sessionJwt);

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('synextax_session', JSON.stringify(newUser));
      localStorage.removeItem('synextax_token');
      localStorage.removeItem('synextax_user');
    }

    setIsLoading(false);
    return true;
  };

  const loginDemo = (role: 'PARTNER' | 'STAFF') => {
    const selectedUser = DEMO_USERS[role];
    const sessionJwt = 'jwt_mem_token_' + selectedUser.id + '_' + Date.now();
    setUser(selectedUser);
    setToken(sessionJwt);

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('synextax_session', JSON.stringify(selectedUser));
      localStorage.removeItem('synextax_token');
      localStorage.removeItem('synextax_user');
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('synextax_session');
      localStorage.removeItem('synextax_user');
      localStorage.removeItem('synextax_token');
    }
  };

  const upgradePlan = (newPlan: 'SOLO' | 'GROWTH' | 'SCALE') => {
    if (!user) return;
    const updated = {
      ...user,
      plan: newPlan,
      trialDaysRemaining: 365,
      maxTrialClients: newPlan === 'SOLO' ? 50 : newPlan === 'GROWTH' ? 200 : 600,
    };
    setUser(updated);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('synextax_session', JSON.stringify(updated));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        loginDemo,
        logout,
        upgradePlan,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
