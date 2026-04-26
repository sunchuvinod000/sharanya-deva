import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiLogin } from '../services/api.js';

const AuthContext = createContext(null);

/** Decode JWT payload segment (base64url per RFC 7519). */
function decodePayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
    const json = JSON.parse(atob(padded));
    return json;
  } catch {
    return null;
  }
}

function isTokenValid(token) {
  if (!token) return false;
  const p = decodePayload(token);
  if (!p?.exp) return false;
  return p.exp * 1000 > Date.now();
}

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [token, setToken] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('token');
    if (stored && isTokenValid(stored)) {
      setToken(stored);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
    setBootstrapping(false);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const data = await apiLogin(email, password);
      localStorage.setItem('token', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      const u = data.user ?? decodePayload(data.accessToken);
      if (u) localStorage.setItem('user', JSON.stringify(u));
      setToken(data.accessToken);
      navigate('/dashboard');
    },
    [navigate]
  );

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setToken(null);
    navigate('/login');
  }, [navigate]);

  const value = useMemo(() => {
    const stored = token ?? localStorage.getItem('token');
    const authenticated = !!stored && isTokenValid(stored);
    let user = null;
    if (authenticated) {
      try {
        user = JSON.parse(localStorage.getItem('user') || 'null');
      } catch {
        user = decodePayload(stored);
      }
    }
    return {
      login,
      logout,
      user,
      isAuthenticated: authenticated,
    };
  }, [login, logout, token]);

  if (bootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
