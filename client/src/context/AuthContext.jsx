import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as authService from '../services/authService';
import { getErrorMessage } from '../utils/errors';

const AuthContext = createContext(null);

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
    setUser(data.user);
    setBusiness(data.business);
    setStatus('authenticated');
    return data;
  }

  async function login(payload) {
    const data = await authService.login(payload);
    setUser(data.user);
    setBusiness(data.business);
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
