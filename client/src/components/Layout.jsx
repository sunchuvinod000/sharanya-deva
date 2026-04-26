import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  UserPlus,
  Users,
  MapPin,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import LanguageToggle from './LanguageToggle.jsx';

const LINK_KEYS = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/add-farmer', labelKey: 'nav.addFarmer', icon: UserPlus },
  { to: '/farmers', labelKey: 'nav.farmerList', icon: Users },
  { to: '/district-queue', labelKey: 'nav.nearby', icon: MapPin },
];

const TITLE_KEYS = {
  '/dashboard': 'pageTitle.dashboard',
  '/add-farmer': 'pageTitle.addFarmer',
  '/farmers': 'pageTitle.farmers',
  '/district-queue': 'pageTitle.nearby',
};

function titleKeyFromPath(pathname) {
  if (pathname.startsWith('/farmers/') && pathname !== '/farmers') return 'pageTitle.farmerDetail';
  return TITLE_KEYS[pathname] || 'pageTitle.dashboard';
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { t, locale } = useI18n();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const section = t(titleKeyFromPath(location.pathname));
    document.title = `${section} · ${t('pageTitle.doc')}`;
  }, [location.pathname, locale, t]);

  return (
    <div className="flex min-h-screen min-w-0 bg-gray-100 font-sans text-base text-slate-900 antialiased">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-slate-800 text-white shadow-lg transition md:relative md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-slate-700 px-4 py-6">
          <h1 className="text-lg font-semibold text-amber-500">{t('nav.brand')}</h1>
          <p className="text-xs text-slate-400">{t('nav.tagline')}</p>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {LINK_KEYS.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-slate-700 text-amber-400' : 'text-slate-200 hover:bg-slate-700/80'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-700 p-4">
          <p className="mb-2 truncate text-sm text-slate-300">{user?.name || 'Anand'}</p>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-amber-400 hover:bg-slate-600"
          >
            <LogOut className="h-4 w-4" />
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      {open && (
        <button
          type="button"
          aria-label={t('a11y.closeMenu')}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col md:ml-0">
        <header className="sticky top-0 z-20 flex min-w-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-2.5 shadow-sm sm:gap-3 sm:px-4 sm:py-3">
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 text-slate-700 hover:bg-gray-100 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={t('a11y.menu')}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-800 sm:text-lg">
            {t(titleKeyFromPath(location.pathname))}
          </h2>
          <LanguageToggle className="shrink-0" />
        </header>
        <main className="flex-1 min-w-0 p-3 sm:p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
