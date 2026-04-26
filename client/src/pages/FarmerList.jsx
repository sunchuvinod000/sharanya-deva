import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { formatDisplayDate } from '../i18n/formatDate.js';
import { translateStateName } from '../i18n/geoLabels.js';
import { farmerLocationLine, purposeOfVisitLabel } from '../i18n/farmerDisplay.js';
import { Copy, ChevronRight, Search } from 'lucide-react';

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-gray-50';

function rowRegisteredDate(farmer, locale) {
  return formatDisplayDate(farmer.created_at, locale);
}

export default function FarmerList() {
  const navigate = useNavigate();
  const { t, tx, locale } = useI18n();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [districts, setDistricts] = useState([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    api
      .get('/admin/districts')
      .then(({ data }) => setDistricts(data))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page };
      if (debounced) params.search = debounced;
      if (districtId) params.districtId = districtId;
      params.dateField = 'registered_at';
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;
      const { data } = await api.get('/admin/farmers', { params });
      setResult(data);
    } catch (e) {
      const raw = e.response?.data?.message;
      setError(raw ? tx(raw) : t('farmerList.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, debounced, districtId, fromDate, toDate, t, tx]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debounced, districtId, fromDate, toDate]);

  async function copyPhone(e, phone) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(String(phone));
    } catch {
      // ignore
    }
  }

  const total = result?.total ?? 0;
  const farmers = result?.farmers ?? [];
  const pageSize = 20;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const totalPages = result?.totalPages ?? 1;

  if (loading && !result) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="h-40 animate-pulse rounded-2xl bg-gray-200/80" />
        <div className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl min-w-0 flex-col gap-5">
      {/* Filters */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-start gap-2 border-b border-gray-100 pb-3">
          <Search className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <p className="text-sm leading-snug text-slate-600">{t('farmerList.filtersIntro')}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:gap-5">
          <div className="xl:col-span-4">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('farmerList.search')}
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('farmerList.placeholder')}
              className={inputClass}
              autoComplete="off"
            />
          </div>

          <div className="xl:col-span-3">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('farmerList.district')}
            </label>
            <select
              value={districtId}
              onChange={(e) => setDistrictId(e.target.value)}
              className={inputClass}
            >
              <option value="">{t('farmerList.allDistricts')}</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({translateStateName(d.state, t)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-5">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                {t('farmerList.registeredFrom')}
              </label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                {t('farmerList.registeredTo')}
              </label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {!loading && farmers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center shadow-sm">
          <p className="text-base font-medium text-slate-700">{t('farmerList.noFarmers')}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{t('farmerList.placeholder')}</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
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
                      {t('farmerList.thDate')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {farmers.map((f) => (
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
                      <td
                        className="px-4 py-3 text-slate-700"
                        title={farmerLocationLine(f) || undefined}
                      >
                        <span className="line-clamp-2 break-words">{farmerLocationLine(f) || t('geo.dash')}</span>
                      </td>
                      <td className="truncate px-4 py-3 text-slate-700" title={purposeOfVisitLabel(f.purpose_of_visit, t) || undefined}>
                        {purposeOfVisitLabel(f.purpose_of_visit, t) || t('geo.dash')}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={f.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 tabular-nums">
                        {rowRegisteredDate(f, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile list */}
          <ul className="space-y-3 md:hidden">
            {farmers.map((f) => (
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
                    <div className="text-sm leading-snug text-slate-600">
                      {farmerLocationLine(f) || t('geo.dash')}
                    </div>
                    <div className="text-sm text-slate-600">
                      <span className="text-slate-500">{t('farmerList.thPurpose')}:</span>{' '}
                      {purposeOfVisitLabel(f.purpose_of_visit, t) || t('geo.dash')}
                    </div>
                    <div className="text-xs text-slate-500">{rowRegisteredDate(f, locale)}</div>
                    <div className="pt-0.5">
                      <StatusBadge status={f.status} />
                    </div>
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-300" aria-hidden />
                </div>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          <footer className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-center text-sm text-slate-600 sm:text-left">{t('farmerList.showing', { from, to, total })}</p>
            <div className="flex items-center justify-center gap-2 sm:justify-end">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('farmerList.previous')}
              </button>
              <span className="min-w-[7rem] text-center text-sm tabular-nums text-slate-600">
                {t('farmerList.page', { page, total: totalPages })}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('farmerList.next')}
              </button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
