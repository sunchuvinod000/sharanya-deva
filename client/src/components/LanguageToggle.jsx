import { useI18n } from '../context/I18nContext.jsx';

export default function LanguageToggle({ className = '' }) {
  const { locale, setLocale, t } = useI18n();
  const base =
    'inline-flex shrink-0 overflow-hidden rounded-lg border border-slate-200/90 bg-white p-0.5 text-xs font-semibold shadow-sm';

  const btn = (active) =>
    `rounded-md px-2.5 py-1.5 transition sm:px-3 ${
      active ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
    }`;

  return (
    <div className={`${base} ${className}`} role="group" aria-label={t('lang.toggle')}>
      <button type="button" className={btn(locale === 'en')} onClick={() => setLocale('en')}>
        English
      </button>
      <button type="button" className={btn(locale === 'kn')} onClick={() => setLocale('kn')}>
        ಕನ್ನಡ
      </button>
    </div>
  );
}
