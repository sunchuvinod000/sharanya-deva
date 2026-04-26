import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Clock, CheckCircle, Trophy, Users } from 'lucide-react';
import { api } from '../services/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { useI18n } from '../context/I18nContext.jsx';
import { formatDisplayDate } from '../i18n/formatDate.js';
import { translateStateName } from '../i18n/geoLabels.js';

const PIE_COLORS = {
  pending: '#eab308',
  soil_collected: '#3b82f6',
  approved: '#22c55e',
  on_hold: '#f59e0b',
  rejected: '#ef4444',
  visited: '#a855f7',
  success: '#059669',
  failure: '#e11d48',
};

function plannedVisitPrimary(r) {
  return r.expected_visit_date || r.expected_soil_date || null;
}

function plannedSoilSublineDiffers(r) {
  if (!r.expected_soil_date || !r.expected_visit_date) return false;
  return String(r.expected_soil_date).slice(0, 10) !== String(r.expected_visit_date).slice(0, 10);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { t, tx, locale } = useI18n();
  const chartCompact = useMediaQuery('(max-width: 639px)');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(
    async (opts = {}) => {
      const silent = Boolean(opts.silent);
      setError('');
      if (!silent) setLoading(true);
      try {
        const { data: res } = await api.get('/admin/stats');
        setData(res);
      } catch (e) {
        const raw = e.response?.data?.message;
        setError(raw ? tx(raw) : t('dashboard.loadFailed'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [t, tx]
  );

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-5">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4 lg:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[5.25rem] animate-pulse rounded-lg bg-gray-200 sm:h-28 sm:rounded-xl" />
          ))}
        </div>
        <div className="h-[220px] animate-pulse rounded-lg bg-gray-200 sm:h-72 sm:rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
        <p className="mb-3">{error}</p>
        <button
          type="button"
          onClick={load}
          className="rounded-lg bg-amber-500 px-4 py-2 text-white hover:bg-amber-600"
        >
          {t('dashboard.retry')}
        </button>
      </div>
    );
  }

  const emptyStatus = {
    pending: 0,
    soil_collected: 0,
    approved: 0,
    rejected: 0,
    visited: 0,
    success: 0,
    failure: 0,
    on_hold: 0,
  };
  const statusCounts = { ...emptyStatus, ...(data?.statusCounts ?? {}) };
  const stateCounts = Array.isArray(data?.stateCounts) ? data.stateCounts : [];

  const pieData = Object.entries(statusCounts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name: t(`status.${name}`), value, key: name }));

  const barData = stateCounts.map((row) => ({
    state: row.state,
    count: row.count,
  }));

  const pieRadius = chartCompact ? 64 : 100;
  const chartHeight = chartCompact ? 232 : 288;

  const nextToServe = data?.nextToServe ?? data?.recentRequests ?? [];

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-5 md:space-y-8">
      {toast && (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:rounded-xl sm:px-4"
        >
          {toast}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4 lg:gap-4">
        <div className="flex min-h-[5.25rem] min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:min-h-0 sm:rounded-xl sm:p-4">
          <div className="shrink-0 rounded-full bg-yellow-100 p-2 text-yellow-700">
            <Clock className="h-4 w-4 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium leading-tight text-slate-500 sm:text-sm">{t('dashboard.pending')}</p>
            <p className="text-lg font-bold tabular-nums text-slate-800 sm:text-2xl">{statusCounts.pending}</p>
          </div>
        </div>
        <div className="flex min-h-[5.25rem] min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:min-h-0 sm:rounded-xl sm:p-4">
          <div className="shrink-0 rounded-full bg-green-100 p-2 text-green-700">
            <CheckCircle className="h-4 w-4 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium leading-tight text-slate-500 sm:text-sm">
              {t('dashboard.awaitingVisit')}
            </p>
            <p className="text-lg font-bold tabular-nums text-slate-800 sm:text-2xl">{statusCounts.approved}</p>
          </div>
        </div>
        <div className="flex min-h-[5.25rem] min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:min-h-0 sm:rounded-xl sm:p-4">
          <div className="shrink-0 rounded-full bg-emerald-100 p-2 text-emerald-700">
            <Trophy className="h-4 w-4 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium leading-tight text-slate-500 sm:text-sm">
              <span className="sm:hidden">{t('dashboard.closedMonthShort')}</span>
              <span className="hidden sm:inline">{t('dashboard.closedMonthLong')}</span>
            </p>
            <p className="text-lg font-bold tabular-nums text-slate-800 sm:text-2xl">
              {Number(data?.monthlyCompleted ?? 0)}
            </p>
          </div>
        </div>
        <div className="flex min-h-[5.25rem] min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:min-h-0 sm:rounded-xl sm:p-4">
          <div className="shrink-0 rounded-full bg-blue-100 p-2 text-blue-700">
            <Users className="h-4 w-4 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium leading-tight text-slate-500 sm:text-sm">{t('dashboard.farmers')}</p>
            <p className="text-lg font-bold tabular-nums text-slate-800 sm:text-2xl">
              {Number(data?.totalFarmers ?? 0)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <div className="min-w-0 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:rounded-xl sm:p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800 sm:mb-3 sm:text-base">
            {t('dashboard.statusBreakdown')}
          </h3>
          <div className="w-full min-w-0" style={{ height: chartHeight, minHeight: chartHeight }}>
            {pieData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-slate-500">
                {t('dashboard.noRequestData')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={chartHeight} minWidth={0}>
                <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="48%"
                    outerRadius={pieRadius}
                    label={chartCompact ? false : true}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.key} fill={PIE_COLORS[entry.key] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: chartCompact ? '10px' : '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="min-w-0 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:rounded-xl sm:p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800 sm:mb-3 sm:text-base">
            {t('dashboard.requestsByState')}
          </h3>
          <div className="w-full min-w-0" style={{ height: chartHeight, minHeight: chartHeight }}>
            {barData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-slate-500">
                {t('dashboard.noRequestData')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={chartHeight} minWidth={0}>
                <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: chartCompact ? 48 : 56 }}>
                  <XAxis
                    dataKey="state"
                    tick={{ fontSize: chartCompact ? 9 : 11 }}
                    tickFormatter={(s) => translateStateName(s, t)}
                    interval={chartCompact ? 'preserveStartEnd' : 0}
                    angle={-30}
                    textAnchor="end"
                    height={chartCompact ? 52 : 60}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: chartCompact ? 10 : 12 }} width={chartCompact ? 28 : 36} />
                  <Tooltip
                    labelFormatter={(label) => translateStateName(label, t)}
                    formatter={(value) => [value, t('dashboard.chartCount')]}
                  />
                  <Bar dataKey="count" name={t('dashboard.chartCount')} fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm sm:rounded-xl">
        <div className="border-b border-gray-100 px-3 py-2.5 sm:px-4 sm:py-3">
          <h3 className="text-sm font-semibold text-slate-800 sm:text-base">{t('dashboard.nextToServe')}</h3>
          <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">{t('dashboard.nextToServeHelp')}</p>
        </div>

        {nextToServe.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-slate-500 sm:px-4 sm:py-10">{t('dashboard.nextToServeEmpty')}</p>
        ) : (
          <>
            <div className="md:hidden">
              <ul className="divide-y divide-gray-100">
                {nextToServe.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/farmers/${r.farmer_id}`)}
                      className="flex w-full min-w-0 flex-col gap-1 px-3 py-3 text-left active:bg-amber-50/60"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <span className="truncate font-medium text-slate-800">{r.farmer_name}</span>
                        <StatusBadge status={r.status} />
                      </div>
                      <div className="truncate text-xs text-slate-600">
                        {r.phone} · {r.district}
                        {r.mandal_name ? ` · ${r.mandal_name}` : ''}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 sm:text-sm">
                        <span>#{r.id}</span>
                        <span>·</span>
                        <span>
                          {t('dashboard.thExpectedVisit')}:{' '}
                          {plannedVisitPrimary(r)
                            ? formatDisplayDate(plannedVisitPrimary(r), locale)
                            : t('geo.dash')}
                          {plannedSoilSublineDiffers(r) && (
                            <span className="ml-1 block text-xs text-slate-500">
                              {t('dashboard.plannedSoilLine', {
                                date: formatDisplayDate(r.expected_soil_date, locale),
                              })}
                            </span>
                          )}
                        </span>
                        <span>·</span>
                        <span>
                          {t('dashboard.thRegistered')}: {formatDisplayDate(r.requested_date, locale)}
                        </span>
                        <span>·</span>
                        <span className={r.priority === 'urgent' ? 'font-semibold text-red-600' : ''}>
                          {t(`priority.${r.priority}`)}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2">{t('dashboard.thId')}</th>
                    <th className="px-4 py-2">{t('dashboard.thFarmer')}</th>
                    <th className="px-4 py-2">{t('dashboard.thPhone')}</th>
                    <th className="px-4 py-2">{t('dashboard.thDistrict')}</th>
                    <th className="px-4 py-2">{t('dashboard.thMandal')}</th>
                    <th className="px-4 py-2">{t('dashboard.thStatus')}</th>
                    <th className="px-4 py-2">{t('dashboard.thPriority')}</th>
                    <th className="px-4 py-2">{t('dashboard.thExpectedVisit')}</th>
                    <th className="px-4 py-2">{t('dashboard.thRegistered')}</th>
                  </tr>
                </thead>
                <tbody>
                  {nextToServe.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/farmers/${r.farmer_id}`)}
                      className="cursor-pointer border-t border-gray-100 hover:bg-amber-50/50"
                    >
                      <td className="px-4 py-2">{r.id}</td>
                      <td className="px-4 py-2 font-medium">{r.farmer_name}</td>
                      <td className="px-4 py-2">{r.phone}</td>
                      <td className="px-4 py-2">{r.district}</td>
                      <td className="px-4 py-2 text-slate-700">{r.mandal_name ?? t('geo.dash')}</td>
                      <td className="px-4 py-2">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className={`px-4 py-2 ${r.priority === 'urgent' ? 'font-semibold text-red-600' : ''}`}>
                        {t(`priority.${r.priority}`)}
                      </td>
                      <td className="px-4 py-2 text-slate-600 tabular-nums">
                        {plannedVisitPrimary(r) ? (
                          <>
                            <span className="whitespace-nowrap">
                              {formatDisplayDate(plannedVisitPrimary(r), locale)}
                            </span>
                            {plannedSoilSublineDiffers(r) && (
                              <div className="mt-0.5 text-xs font-normal text-slate-500">
                                {t('dashboard.plannedSoilLine', {
                                  date: formatDisplayDate(r.expected_soil_date, locale),
                                })}
                              </div>
                            )}
                          </>
                        ) : (
                          t('geo.dash')
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-600 tabular-nums">
                        {formatDisplayDate(r.requested_date, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
