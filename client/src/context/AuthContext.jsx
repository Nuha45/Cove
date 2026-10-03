import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authService from '../services/authService';
import { getErrorMessage } from '../utils/errors';
import { setDefaultCurrency } from '../utils/display';
import {
  isTransientError,
  SESSION_RETRY_DELAYS_MS,
  UNAVAILABLE_MESSAGE,
  withTransientRetry,
} from '../utils/retry';

const AuthContext = createContext(null);

const COOKIE_BLOCKED_MESSAGE =
  'Your details were accepted, but this browser did not keep you signed in. Allow cookies for this site, or open Cove in Safari or Chrome instead of an in-app browser, then log in again.';

// Login succeeds even when the browser drops the session cookie, so confirm it before showing the app.
async function confirmSession() {
  try {
    return await authService.me();
  } catch (err) {
    if (err.response?.status === 401) {
      err.response.data = { ...(err.response.data || {}), message: COOKIE_BLOCKED_MESSAGE };
    }
    throw err;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [waking, setWaking] = useState(false);
  // Set during render so children format money in the shop's currency on their first paint.
  setDefaultCurrency(business?.currency);

  async function loadSession() {
    setStatus('loading');
    setError('');
    try {
      // A signed-in seller reopening the browser often meets a sleeping API; retry before treating it as an error.
      const data = await withTransientRetry(() => authService.me(), {
        delays: SESSION_RETRY_DELAYS_MS,
        onRetry: () => setWaking(true),
      });
      setUser(data.user);
      setBusiness(data.business);
      setStatus('authenticated');
    } catch (err) {
      setUser(null);
      setBusiness(null);
      if (err.response?.status === 401) {
        setStatus('unauthenticated');
        return;
      }
      setError(isTransientError(err) ? UNAVAILABLE_MESSAGE : getErrorMessage(err));
      setStatus('error');
    } finally {
      setWaking(false);
    }
  }

  // Background refresh that keeps the current screen; failures leave the existing session state alone.
  const refreshUser = useCallback(async () => {
    try {
      const data = await authService.me();
      setUser(data.user);
      setBusiness(data.business);
    } catch {
      // The next normal request handles an expired session.
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, []);

  async function register(payload) {
    const data = await authService.register(payload);
    const session = await confirmSession();
    setUser(session.user);
    setBusiness(session.business);
    setStatus('authenticated');
    return data;
  }

  async function login(payload) {
    const data = await authService.login(payload);
    const session = await confirmSession();
    setUser(session.user);
    setBusiness(session.business);
    setStatus('authenticated');
    return data;
  }

  async function logout() {
    await authService.logout();
    setUser(null);
    setBusiness(null);
    setStatus('unauthenticated');
  }

  const value = useMemo(
    () => ({
      user,
      business,
      status,
      error,
      waking,
      register,
      login,
      logout,
      refresh: loadSession,
      refreshUser,
    }),
    [user, business, status, error, waking, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
