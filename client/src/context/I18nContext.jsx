import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API_MESSAGE_MAP } from '../i18n/apiMessageMap.js';
import { locales } from '../i18n/locales.js';

const STORAGE_KEY = 'locale';
const I18nContext = createContext(null);

function interpolate(template, vars) {
  if (!vars || typeof template !== 'string') return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s === 'kn' || s === 'en') return s;
    } catch {
      /* ignore */
    }
    return 'en';
  });

  const setLocale = useCallback((next) => {
    const l = next === 'kn' ? 'kn' : 'en';
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l === 'kn' ? 'kn' : 'en';
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'kn' ? 'kn' : 'en';
  }, [locale]);

  const t = useCallback(
    (key, vars) => {
      const raw = locales[locale]?.[key] ?? locales.en[key] ?? key;
      return interpolate(raw, vars);
    },
    [locale]
  );

  /** Translate known English API `message` strings when locale is Kannada. */
  const tx = useCallback(
    (message) => {
      if (message == null || message === '') return message;
      if (locale !== 'kn') return message;
      const key = API_MESSAGE_MAP[String(message).trim()];
      if (!key) return message;
      return t(key);
    },
    [locale, t]
  );

  const value = useMemo(() => ({ locale, setLocale, t, tx }), [locale, setLocale, t, tx]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
