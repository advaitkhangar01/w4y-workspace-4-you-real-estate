// client/src/pages/LoginPage.jsx
// Premium login page for W4Y

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { COMPANY_CONFIG } from '../config/company';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  // Redirect if already logged in
  if (user) {
    const isAdminOrAccounts = user.role === 'admin' || user.role === 'back_office' || user.role === 'accounts' || user.department?.toLowerCase() === 'accounts';
    navigate(isAdminOrAccounts ? '/admin/dashboard' : '/employee/dashboard', { replace: true });
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.username.trim() || !form.password.trim()) {
      toast.error('Please enter username and password');
      return;
    }
    setLoading(true);
    try {
      const loggedUser = await login(form.username.trim(), form.password);
      toast.success(`Welcome back, ${loggedUser.name.split(' ')[0]}!`);
      const isAdminOrAccounts = loggedUser.role === 'admin' || loggedUser.role === 'back_office' || loggedUser.role === 'accounts' || loggedUser.department?.toLowerCase() === 'accounts';
      navigate(isAdminOrAccounts ? '/admin/dashboard' : '/employee/dashboard', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-4">
      {/* Background subtle grid pattern */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(224,90,30,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(224,90,30,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="relative w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img src={COMPANY_CONFIG.logoUrl} alt={COMPANY_CONFIG.brand} className="h-16 w-auto object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">{COMPANY_CONFIG.brand}</h1>
          <p className="text-muted text-sm mt-1">Management Portal</p>
        </div>

        {/* Card */}
        <div className="card">
          <h2 className="text-lg font-semibold text-[#1A1A1A] mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Username</label>
              <input
                id="username"
                type="text"
                className="input"
                placeholder="Enter your username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoComplete="username"
                autoFocus
                disabled={loading}
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-[#1A1A1A] transition-colors"
                >
                  {showPass ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              id="login-btn"
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center mt-2 py-3"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-muted text-xs mt-6">
          {COMPANY_CONFIG.brand} &copy; {new Date().getFullYear()} — Internal use only
        </p>
      </div>
    </div>
  );
}
