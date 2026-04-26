import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const { t, tx, locale } = useI18n();
  const [email, setEmail] = useState('');

  useEffect(() => {
    document.title = `${t('login.subtitle')} · ${t('pageTitle.doc')}`;
  }, [locale, t]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      const raw = err.response?.data?.message;
      setError(raw ? tx(raw) : t('login.failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-900 px-4 py-8 font-sans text-base antialiased">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="mb-6 text-center text-2xl font-bold text-amber-500">{t('login.title')}</h1>
        <p className="mb-6 text-center text-sm text-slate-600">{t('login.subtitle')}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              {t('login.email')}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-slate-900 focus:border-amber-500 outline-none focus:ring-2 focus:ring-amber-500/30"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              {t('login.password')}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-slate-900 focus:border-amber-500 outline-none focus:ring-2 focus:ring-amber-500/30"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 font-medium text-white transition hover:bg-amber-600 disabled:opacity-60"
          >
            {loading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            {loading ? t('login.signingIn') : t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
