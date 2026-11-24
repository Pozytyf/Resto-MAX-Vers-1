import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, getStoredToken, setStoredToken } from '../../services/api';
import type { AuthUser, Permission } from '../../types';

interface SendVerificationResult {
  ok: boolean;
  alreadyVerified?: boolean;
  emailStatus?: string;
  previewVerifyToken?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  pendingVerifyToken: string | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  pinLogin: (restaurantId: string, userId: string, pin: string) => Promise<AuthUser>;
  posPinSwitch: (userId: string, pin: string) => Promise<AuthUser>;
  switchVenue: (restaurantId: string) => Promise<AuthUser>;
  registerRestaurant: (payload: {
    restaurantName: string;
    city: string;
    ownerName: string;
    email: string;
    phone: string;
    password: string;
    planCode?: string;
  }) => Promise<AuthUser>;
  verifyEmail: (token: string) => Promise<{ ok: boolean; email?: string }>;
  sendVerificationEmail: () => Promise<SendVerificationResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pendingVerifyToken, setPendingVerifyToken] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      try {
        const res = await apiFetch<{ user: AuthUser }>('/api/auth/me');
        setUser(res.user);
        if (res.user.emailVerified) {
          setPendingVerifyToken(null);
        }
      } catch {
        setUser(null);
        setPendingVerifyToken(null);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/auth/me');
      setUser(res.user);
      if (res.user.emailVerified) {
        setPendingVerifyToken(null);
      }
    } catch {
      setStoredToken(null);
      setUser(null);
      setPendingVerifyToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const res = await apiFetch<{ token: string; user: AuthUser }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
    );
    setStoredToken(res.token);
    setUser(res.user);
    if (res.user.emailVerified) {
      setPendingVerifyToken(null);
    }
    return res.user;
  };

  const pinLogin = async (
    restaurantId: string,
    userId: string,
    pin: string,
  ): Promise<AuthUser> => {
    const res = await apiFetch<{ token: string; user: AuthUser }>(
      '/api/auth/pin-login',
      {
        method: 'POST',
        body: JSON.stringify({ restaurantId, userId, pin }),
      },
    );
    setStoredToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const posPinSwitch = async (userId: string, pin: string): Promise<AuthUser> => {
    const res = await apiFetch<{ token: string; user: AuthUser }>(
      '/api/restaurant/pos/pin-switch',
      {
        method: 'POST',
        body: JSON.stringify({ userId, pin }),
      },
    );
    setStoredToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const switchVenue = async (restaurantId: string): Promise<AuthUser> => {
    const res = await apiFetch<{ user: AuthUser }>('/api/auth/switch-venue', {
      method: 'POST',
      body: JSON.stringify({ restaurantId }),
    });
    setUser(res.user);
    return res.user;
  };

  const registerRestaurant = async (payload: {
    restaurantName: string;
    city: string;
    ownerName: string;
    email: string;
    phone: string;
    password: string;
    planCode?: string;
  }): Promise<AuthUser> => {
    const res = await apiFetch<{
      token: string;
      user: AuthUser;
      emailVerificationRequired?: boolean;
      previewVerifyToken?: string;
    }>('/api/auth/register-restaurant', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(res.token);
    setUser(res.user);
    setPendingVerifyToken(res.previewVerifyToken || null);
    return res.user;
  };

  const verifyEmail = useCallback(
    async (token: string): Promise<{ ok: boolean; email?: string }> => {
      const clean = token.trim();
      const res = await apiFetch<{ ok: boolean; email?: string }>(
        '/api/auth/verify-email',
        {
          method: 'POST',
          body: JSON.stringify({ token: clean }),
        },
      );
      setPendingVerifyToken(null);
      setUser((prev) => (prev ? { ...prev, emailVerified: true } : prev));
      await refreshUser().catch(() => {});
      return res;
    },
    [refreshUser],
  );

  const sendVerificationEmail =
    useCallback(async (): Promise<SendVerificationResult> => {
      const res = await apiFetch<SendVerificationResult>(
        '/api/auth/send-verification',
        {
          method: 'POST',
        },
      );
      if (res.alreadyVerified) {
        setPendingVerifyToken(null);
        setUser((prev) => (prev ? { ...prev, emailVerified: true } : prev));
      } else if (res.previewVerifyToken) {
        setPendingVerifyToken(res.previewVerifyToken);
      }
      await refreshUser().catch(() => {});
      return res;
    }, [refreshUser]);

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore error if already expired
    } finally {
      setStoredToken(null);
      setUser(null);
      setPendingVerifyToken(null);
    }
  };

  const can = useCallback(
    (permission: Permission) => {
      if (!user) return false;
      if (user.permissions.includes('superadmin:all')) return true;
      return user.permissions.includes(permission);
    },
    [user],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        pendingVerifyToken,
        login,
        pinLogin,
        posPinSwitch,
        switchVenue,
        registerRestaurant,
        verifyEmail,
        sendVerificationEmail,
        logout,
        refreshUser,
        can,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
