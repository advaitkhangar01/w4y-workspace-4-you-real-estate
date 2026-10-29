/* eslint-disable react-hooks/set-state-in-effect, react-refresh/only-export-components */
// client/src/context/AuthContext.jsx
// Global auth state - JWT stored in localStorage + memory

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('ds16_token');
    const storedUser = localStorage.getItem('ds16_user');
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('ds16_token');
        localStorage.removeItem('ds16_user');
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('ds16_token', data.token);
    localStorage.setItem('ds16_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('ds16_token');
    localStorage.removeItem('ds16_user');
    setToken(null);
    setUser(null);
  }, []);

  const isAdmin = user?.role === 'admin';
  const isEmployee = user?.role === 'employee' || user?.role === 'civil_engineer' || user?.role === 'liasoning';
  const isAccounts = user?.role === 'back_office' || user?.role === 'accounts' || user?.department?.toLowerCase() === 'accounts';
  const isDesignHead = user?.role === 'design_head' || user?.role === 'design';
  const isProjectOrDesignHead = user?.role === 'project_head' || user?.role === 'design_head' || user?.role === 'design';

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAdmin, isEmployee, isAccounts, isDesignHead, isProjectOrDesignHead }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
