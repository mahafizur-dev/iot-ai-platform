"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as api from "./api-client";
import { ApiError, type UserProfile } from "./api-client";

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  /** True until the initial refresh-on-mount settles, so guards don't bounce a returning user to /login. */
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Runs `call`, and on a 401 refreshes the access token once and retries. */
  withAuth: <T>(call: (accessToken: string) => Promise<T>) => Promise<T>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * The access token is held in memory only — deliberately not localStorage,
 * where XSS could read it. The refresh token is already an httpOnly cookie,
 * so a page reload restores the session via /auth/refresh at the cost of one
 * request rather than by persisting a bearer token in JS-readable storage.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Mirrors accessToken so withAuth reads the current value without being
  // re-created on every token change (which would retrigger callers' effects).
  const tokenRef = useRef<string | null>(null);
  const setSession = useCallback((result: api.AuthResult | null) => {
    tokenRef.current = result?.accessToken ?? null;
    setAccessToken(result?.accessToken ?? null);
    setUser(result?.user ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    api
      .refresh()
      .then((result) => {
        if (!cancelled) setSession(result);
      })
      .catch(() => {
        // No/invalid refresh cookie just means "not logged in" — not an error.
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [setSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      setSession(await api.login(email, password));
    },
    [setSession],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setSession(null);
    }
  }, [setSession]);

  const withAuth = useCallback(
    async <T,>(call: (token: string) => Promise<T>): Promise<T> => {
      if (!tokenRef.current) {
        throw new ApiError("Not authenticated", 401);
      }

      try {
        return await call(tokenRef.current);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          throw error;
        }

        // Access tokens are short-lived (15m); one transparent refresh+retry
        // keeps that from surfacing as a spurious error mid-session.
        const refreshed = await api.refresh();
        setSession(refreshed);
        return call(refreshed.accessToken);
      }
    },
    [setSession],
  );

  const value = useMemo<AuthState>(
    () => ({ user, accessToken, initializing, login, logout, withAuth }),
    [user, accessToken, initializing, login, logout, withAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
