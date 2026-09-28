import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as authService from '../services/authService';
import { getErrorMessage } from '../utils/errors';

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

  async function loadSession() {
    setStatus('loading');
    setError('');
    try {
      const data = await authService.me();
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
      setError(getErrorMessage(err));
      setStatus('error');
    }
  }

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
      register,
      login,
      logout,
      refresh: loadSession,
    }),
    [user, business, status, error]
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
