import { useNavigate } from 'react-router-dom';
import { Copy, ChevronRight } from 'lucide-react';
import StatusBadge from './StatusBadge.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { farmerLocationLine, purposeOfVisitLabel, rowExpectedVisitDisplay } from '../i18n/farmerDisplay.js';

/**
 * Rows: farmer-shaped objects with id, full_name, phone, village, mandal_name, district_name,
 * purpose_of_visit, status, expected_visit_date (same shape as farmer list rows).
 *
 * When `embedded` is true (e.g. dashboard card body), skips the outer bordered shell used on full-page list views.
 */
export default function FarmersDataTable({ rows, embedded = false }) {
  const navigate = useNavigate();
  const { t, locale } = useI18n();

  async function copyPhone(e, phone) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(String(phone));
    } catch {
      // ignore
    }
  }

  const desktopOuter = embedded
    ? 'hidden md:block overflow-x-auto'
    : 'hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:block';
  const desktopInnerWrap = embedded ? '' : 'overflow-x-auto';

  return (
    <>
      <div className={desktopOuter}>
        <div className={desktopInnerWrap}>
          <table className="w-full min-w-[820px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-[17%]" />
              <col className="w-[13%]" />
              <col className="w-[30%]" />
              <col className="w-[15%]" />
              <col className="w-[11%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200 bg-slate-50/90">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('farmerList.thName')}
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('farmerList.thPhone')}
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('farmerList.thLocation')}
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('farmerList.thPurpose')}
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('farmerList.thStatus')}
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('farmerList.expectedVisitDate')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((f) => (
                <tr
                  key={f.id}
                  onClick={() => navigate(`/farmers/${f.id}`)}
                  className="cursor-pointer transition-colors hover:bg-amber-50/60"
                >
                  <td className="truncate px-4 py-3 font-medium text-slate-900" title={f.full_name}>
                    {f.full_name}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate tabular-nums text-slate-700">{f.phone}</span>
                      <button
                        type="button"
                        onClick={(e) => copyPhone(e, f.phone)}
                        className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        aria-label={t('farmerList.copyPhone')}
                        title={t('farmerList.copyPhone')}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700" title={farmerLocationLine(f) || undefined}>
                    <span className="line-clamp-2 break-words">{farmerLocationLine(f) || t('geo.dash')}</span>
                  </td>
                  <td
                    className="truncate px-4 py-3 text-slate-700"
                    title={purposeOfVisitLabel(f.purpose_of_visit, t) || undefined}
                  >
                    {purposeOfVisitLabel(f.purpose_of_visit, t) || t('geo.dash')}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={f.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600 tabular-nums">
                    {rowExpectedVisitDisplay(f, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className={`space-y-3 md:hidden ${embedded ? 'px-3 pb-3 sm:px-4 sm:pb-4' : ''}`}>
        {rows.map((f) => (
          <li key={f.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/farmers/${f.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/farmers/${f.id}`);
                }
              }}
              className="flex w-full cursor-pointer items-stretch gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm outline-none transition hover:border-amber-200/80 hover:shadow-md focus-visible:ring-2 focus-visible:ring-amber-500/40"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <div className="font-semibold leading-tight text-slate-900">{f.full_name}</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                  <span className="tabular-nums">{f.phone}</span>
                  <button
                    type="button"
                    onClick={(e) => copyPhone(e, f.phone)}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-white"
                  >
                    <Copy className="h-3 w-3" />
                    {t('farmerList.copyPhone')}
                  </button>
                </div>
                <div className="text-sm leading-snug text-slate-600">{farmerLocationLine(f) || t('geo.dash')}</div>
                <div className="text-sm text-slate-600">
                  <span className="text-slate-500">{t('farmerList.thPurpose')}:</span>{' '}
                  {purposeOfVisitLabel(f.purpose_of_visit, t) || t('geo.dash')}
                </div>
                <div className="text-xs text-slate-500">{rowExpectedVisitDisplay(f, locale)}</div>
                <div className="pt-0.5">
                  <StatusBadge status={f.status} />
                </div>
              </div>
              <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-300" aria-hidden />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
