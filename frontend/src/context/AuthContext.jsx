import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api, saveSession, clearSession, getUser as readStoredUser, setUnauthorizedHandler } from '../services/api.js';

const AuthContext = createContext(null);

/**
 * The single source of truth for "who is logged in".
 *
 * WHY NOT JUST LOCALSTORAGE: on page load the old code read localStorage and
 * believed it. If the token had expired, or the account was suspended, or you
 * logged in as someone else in another tab, the app would happily show a
 * dashboard it should not have. So on load we ask the SERVER who we are.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `checking` is true while we ask the server. During that time we render
  // nothing, so a protected page can never flash before the check finishes.
  const [checking, setChecking] = useState(true);

  const logout = useCallback(async ({ callServer = true } = {}) => {
    if (callServer) {
      // Best effort. If the network is down we still clear locally - a user
      // stuck "logged in" with no working API is worse than a stale token.
      try { await api.logout(); } catch { /* ignore */ }
    }
    clearSession();
    setUser(null);
  }, []);

  // Any 401 anywhere in the app means the token is dead -> log out once.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (readStoredUser()) {
        clearSession();
        setUser(null);
      }
    });
  }, []);

  // Revalidate the stored token against the server on every page load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!localStorage.getItem('token')) { setChecking(false); return; }
      try {
        const { user: me } = await api.me();
        if (!cancelled) {
          setUser(me);
          saveSession(localStorage.getItem('token'), me); // refresh cached copy
        }
      } catch {
        if (!cancelled) { clearSession(); setUser(null); }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.login({ email, password });
    saveSession(data.token, data.user);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => api.register(payload), []);

  const refresh = useCallback(async () => {
    const { user: me } = await api.me();
    saveSession(localStorage.getItem('token'), me);
    setUser(me);
    return me;
  }, []);

  const value = useMemo(
    () => ({ user, checking, login, register, logout, refresh, setUser }),
    [user, checking, login, register, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
