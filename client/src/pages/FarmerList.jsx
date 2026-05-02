import { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api.js';
import FarmersDataTable from '../components/FarmersDataTable.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { translateStateName } from '../i18n/geoLabels.js';
import { Search } from 'lucide-react';

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-gray-50';

export default function FarmerList() {
  const { t, tx } = useI18n();
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
          <div className="relative">
            {loading && farmers.length > 0 ? (
              <div
                className="pointer-events-none absolute inset-0 z-10 flex justify-center rounded-2xl bg-white/50 pt-16"
                aria-hidden
              >
                <span className="h-fit rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
                  {t('dashboard.working')}
                </span>
              </div>
            ) : null}
            <FarmersDataTable rows={farmers} />
          </div>

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
