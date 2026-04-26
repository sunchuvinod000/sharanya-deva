import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ExternalLink, Loader2, MapPin, Navigation, Search, User } from 'lucide-react';
import { api } from '../services/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { farmerLocationLine, purposeOfVisitLabel } from '../i18n/farmerDisplay.js';
/** Max `radiusKm` shown in UI (server accepts up to 500). */
const NEARBY_RADIUS_MAX_KM = 300;
/** Default search radius when the page loads. */
const NEARBY_RADIUS_DEFAULT_KM = 100;
/** API `radiusKm` presets (km from center), up to `NEARBY_RADIUS_MAX_KM`. */
const RADIUS_OPTIONS = [10, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300];

const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm leading-snug text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/25 disabled:bg-gray-50';

function toYmd(value) {
  if (value == null || value === '') return '';
  return String(value).slice(0, 10);
}

/** Request registration date for date-range filter (nearby rows). */
function rowCompareDate(row) {
  return toYmd(row.requested_date || row.farmer_created_at);
}

function filtersAreActive(debounced, fromDate, toDate) {
  return Boolean(
    debounced.trim() || (fromDate && String(fromDate).trim()) || (toDate && String(toDate).trim())
  );
}

function wgs84Ok(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Opens Google Maps at effective row coords, or searches by address line if coords missing. */
function googleMapsUrlForNearbyRow(r) {
  const lat = r.farm_latitude != null ? Number(r.farm_latitude) : NaN;
  const lng = r.farm_longitude != null ? Number(r.farm_longitude) : NaN;
  if (wgs84Ok(lat, lng)) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  const q = farmerLocationLine(r)?.trim();
  if (q) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  return null;
}

function distanceSortKey(km) {
  const n = Number(km);
  return Number.isFinite(n) ? n : 1e12;
}

function formatDistanceKm(r, t) {
  const n = Number(r.distance_km);
  if (r.distance_km != null && Number.isFinite(n)) return `${n} ${t('nearby.km')}`;
  return t('nearby.distanceUnknown');
}

function digitsOnly(s) {
  return String(s ?? '').replace(/\D/g, '');
}

function filterNearbyRows(rows, { debounced, fromDate, toDate }) {
  const rawQ = debounced.trim();
  const qLower = rawQ.toLowerCase();
  const qDigits = digitsOnly(rawQ);

  return rows.filter((r) => {
    if (rawQ) {
      const hay = [r.farmer_name, r.phone, r.village, r.purpose_of_visit, farmerLocationLine(r)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const textMatch = hay.includes(qLower);
      const phoneDigits = digitsOnly(r.phone);
      const phoneMatch =
        qDigits.length >= 3 &&
        phoneDigits.length >= 3 &&
        (phoneDigits.includes(qDigits) || qDigits.includes(phoneDigits));
      if (!textMatch && !phoneMatch) return false;
    }
    const d = rowCompareDate(r);
    if (!d && (fromDate || toDate)) return false;
    if (fromDate && d && d < fromDate) return false;
    if (toDate && d && d > toDate) return false;
    return true;
  });
}

export default function DistrictQueue() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, tx } = useI18n();
  const [nearbyRaw, setNearbyRaw] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [myLoc, setMyLoc] = useState(null);
  /** Shown under coordinates: whose farm / GPS we used as the distance anchor. */
  const [centerCaption, setCenterCaption] = useState('');
  const [anchorPhone, setAnchorPhone] = useState('');
  /** When centering on a farmer's farm, omit that farmer from the nearby list. */
  const [excludeAnchorFarmerId, setExcludeAnchorFarmerId] = useState(null);
  const [farmerAnchorLoading, setFarmerAnchorLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  /** Search radius (km) sent to `/admin/nearby`. */
  const [searchRadiusKm, setSearchRadiusKm] = useState(NEARBY_RADIUS_DEFAULT_KM);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  /** Optional deep link: `?phone=…` */
  useEffect(() => {
    const p = searchParams.get('phone');
    if (p) {
      const digits = String(p).replace(/\D/g, '').slice(0, 15);
      setAnchorPhone(digits);
    }
  }, [searchParams]);

  useEffect(() => {
    setSearch('');
    setDebounced('');
    setFromDate('');
    setToDate('');
  }, [myLoc]);

  const loadNearby = useCallback(async () => {
    if (!myLoc) return;
    setLoading(true);
    setError('');
    try {
      const params = { lat: myLoc.lat, lng: myLoc.lng, radiusKm: searchRadiusKm };
      if (excludeAnchorFarmerId != null && Number.isInteger(excludeAnchorFarmerId)) {
        params.excludeFarmerId = excludeAnchorFarmerId;
      }
      const { data } = await api.get('/admin/nearby', { params });
      setNearbyRaw(Array.isArray(data) ? data : []);
    } catch (e) {
      const raw = e.response?.data?.message;
      const timedOut = e.code === 'ECONNABORTED';
      setError(raw ? tx(raw) : timedOut ? t('nearby.timeout') : t('nearby.loadFailed'));
      setNearbyRaw([]);
    } finally {
      setLoading(false);
    }
  }, [myLoc, searchRadiusKm, excludeAnchorFarmerId, t, tx]);

  useEffect(() => {
    if (myLoc) loadNearby();
  }, [myLoc, searchRadiusKm, loadNearby]);

  const filtersActive = filtersAreActive(debounced, fromDate, toDate);

  const visibleNearby = useMemo(() => {
    const filtered = filterNearbyRows(nearbyRaw, { debounced, fromDate, toDate });
    return [...filtered].sort((a, b) => distanceSortKey(a.distance_km) - distanceSortKey(b.distance_km));
  }, [nearbyRaw, debounced, fromDate, toDate]);

  /** Show list filters whenever a center exists — not only when the API returned rows (so phone/date filters stay usable after an empty result). */
  const showFilters = Boolean(myLoc);

  function useMyLocation() {
    setError('');
    if (!navigator.geolocation) {
      setError(t('nearby.geoFailed'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setExcludeAnchorFarmerId(null);
        setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCenterCaption(t('nearby.anchorYou'));
      },
      () => {
        setError(t('nearby.geoDenied'));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function useFarmerFarmAsCenter() {
    setError('');
    const digits = String(anchorPhone).replace(/\D/g, '');
    if (digits.length < 10) {
      setError(t('nearby.anchorPhoneInvalid'));
      return;
    }
    setFarmerAnchorLoading(true);
    try {
      const { data } = await api.get('/admin/farmers/anchor-location', {
        params: { phone: digits.slice(-10) },
      });
      const lat = Number(data?.latitude);
      const lng = Number(data?.longitude);
      if (!wgs84Ok(lat, lng)) {
        setError(t('nearby.anchorFarmerLoadFailed'));
        return;
      }
      setExcludeAnchorFarmerId(
        data.farmerId != null && Number.isInteger(Number(data.farmerId)) ? Number(data.farmerId) : null
      );
      setMyLoc({ lat, lng });
      setCenterCaption(
        t('nearby.anchorFarmerCaption', { name: data.fullName, phone: String(data.phone ?? digits) })
      );
    } catch (e) {
      const rawMsg = e.response?.data?.message;
      const timedOut = e.code === 'ECONNABORTED';
      setError(rawMsg ? tx(rawMsg) : timedOut ? t('nearby.timeout') : t('nearby.anchorFarmerLoadFailed'));
    } finally {
      setFarmerAnchorLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-4 sm:space-y-6">
      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm sm:rounded-2xl">
        <div className="border-b border-slate-100 bg-gradient-to-br from-amber-50/90 via-white to-slate-50/80 px-4 py-5 sm:px-8 sm:py-8">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] sm:items-start sm:gap-6 lg:gap-8">
            <div className="min-w-0 space-y-1.5 sm:space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-100/80 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900 sm:px-3">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {t('nearby.proximity')}
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{t('nearby.title')}</h1>
              <p className="text-sm leading-relaxed text-slate-600">
                {t('nearby.intro', { km: searchRadiusKm })}
              </p>
            </div>
            <div className="flex min-h-0 min-w-0 flex-col gap-3">
              <button
                type="button"
                onClick={useMyLocation}
                className="inline-flex h-9 w-full touch-manipulation items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 text-sm font-semibold text-white shadow-md shadow-amber-600/20 transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 sm:h-auto sm:rounded-xl sm:px-4 sm:py-2"
              >
                <Navigation className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {t('nearby.useLocation')}
              </button>
              <div className="rounded-xl border border-slate-200/90 bg-white/90 p-3.5 shadow-sm sm:p-4">
                <p className="text-xs font-semibold leading-tight text-slate-800">{t('nearby.anchorFarmerTitle')}</p>
                <p className="mt-1.5 text-xs leading-snug text-slate-600 sm:text-sm">{t('nearby.anchorFarmerHint')}</p>
                <div className="mt-3 flex flex-col gap-2.5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3">
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="nearby-anchor-phone">
                        {t('nearby.anchorPhoneLabel')}
                      </label>
                      <input
                        id="nearby-anchor-phone"
                        type="tel"
                        inputMode="numeric"
                        value={anchorPhone}
                        onChange={(e) => setAnchorPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                        placeholder={t('nearby.anchorPhonePlaceholder')}
                        className={`${inputClass} tabular-nums tracking-wide`}
                        autoComplete="tel"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="nearby-search-radius">
                        {t('nearby.searchRadiusLabel')}
                      </label>
                      <select
                        id="nearby-search-radius"
                        value={String(searchRadiusKm)}
                        onChange={(e) => setSearchRadiusKm(Number(e.target.value))}
                        className={inputClass}
                      >
                        {RADIUS_OPTIONS.map((km) => (
                          <option key={km} value={String(km)}>
                            {t('nearby.radiusOption', { km })}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-xs leading-snug text-slate-500">
                    {t('nearby.searchRadiusHintShort', { max: NEARBY_RADIUS_MAX_KM })}
                  </p>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={useFarmerFarmAsCenter}
                      disabled={farmerAnchorLoading || String(anchorPhone).replace(/\D/g, '').length < 10}
                      className="inline-flex h-9 min-h-9 w-full touch-manipulation items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 sm:h-auto sm:min-h-0 sm:py-2"
                    >
                      {farmerAnchorLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                      ) : (
                        <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      )}
                      {t('nearby.anchorFarmerButton')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {myLoc && (
            <div className="mt-4 flex flex-col gap-2 border-t border-slate-100/80 pt-4 sm:mt-6 sm:gap-3 sm:pt-6">
              {centerCaption ? (
                <p className="text-xs font-medium text-slate-800 sm:text-sm">{centerCaption}</p>
              ) : null}
              {excludeAnchorFarmerId != null ? (
                <p className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-2.5 py-2 text-xs leading-snug text-amber-950 sm:text-sm">
                  {t('nearby.anchorExcludedHint')}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="max-w-full truncate rounded-lg bg-slate-900/5 px-2.5 py-1 font-mono text-xs tabular-nums text-slate-700 sm:px-3">
                {Number(myLoc.lat).toFixed(6)}, {Number(myLoc.lng).toFixed(6)}
              </span>
              {!loading && nearbyRaw.length > 0 && (
                <span className="text-xs text-slate-600 sm:text-sm">
                  {filtersActive
                    ? t('nearby.inRangeFiltered', { shown: visibleNearby.length, total: nearbyRaw.length })
                    : t('nearby.inRange', { count: nearbyRaw.length })}
                </span>
              )}
              {!loading && nearbyRaw.length === 0 && (
                <span className="text-xs text-slate-600 sm:text-sm">{t('nearby.inRange', { count: 0 })}</span>
              )}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-2.5 text-xs text-red-800 sm:px-8 sm:py-3 sm:text-sm">
            {error}
          </div>
        )}

        {showFilters && (
          <div className="border-b border-slate-100 bg-white px-4 py-4 sm:px-8 sm:py-5">
            <div className="mb-3 flex items-start gap-2 border-b border-gray-100 pb-3">
              <Search className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              <p className="text-sm leading-snug text-slate-600">{t('nearby.filtersIntro')}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:gap-5">
              <div className="xl:col-span-5">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-7">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t('farmerList.registeredFrom')}
                  </label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t('farmerList.registeredTo')}
                  </label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div>
          {!myLoc && (
            <div className="px-4 py-12 text-center sm:px-8 sm:py-16">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 sm:h-14 sm:w-14 sm:rounded-2xl">
                <MapPin className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.5} />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-800">{t('nearby.noLocation')}</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500 sm:text-sm">{t('nearby.tapHint')}</p>
            </div>
          )}

          {myLoc && loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-500 sm:py-16">
              <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
              <span className="text-sm">{t('nearby.loading')}</span>
            </div>
          )}

          {myLoc && !loading && (
            <>
              <ul className="divide-y divide-slate-100 md:hidden">
                {nearbyRaw.length === 0 ? (
                  <li className="px-4 py-10 text-center text-xs text-slate-500 sm:text-sm">{t('nearby.empty')}</li>
                ) : visibleNearby.length === 0 ? (
                  <li className="px-4 py-10 text-center text-xs text-slate-500 sm:text-sm">{t('nearby.noMatches')}</li>
                ) : (
                  visibleNearby.map((r) => {
                    const mapsHref = googleMapsUrlForNearbyRow(r);
                    return (
                      <li key={r.request_id}>
                        <div className="flex min-w-0 flex-col gap-2 px-3 py-3">
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <span className="truncate font-medium text-slate-900">{r.farmer_name}</span>
                            <span className="shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                              {formatDistanceKm(r, t)}
                            </span>
                          </div>
                          <div className="truncate text-xs text-slate-600">{r.phone}</div>
                          <div className="line-clamp-2 text-xs leading-snug text-slate-600">
                            {farmerLocationLine(r) || t('geo.dash')}
                          </div>
                          <div className="text-xs text-slate-600">
                            <span className="text-slate-500">{t('farmerList.thPurpose')}:</span>{' '}
                            {purposeOfVisitLabel(r.purpose_of_visit, t) || t('geo.dash')}
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <StatusBadge status={r.status} />
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <button
                                type="button"
                                onClick={() => navigate(`/farmers/${r.farmer_id}`)}
                                className="text-sm font-medium text-amber-700 hover:underline"
                              >
                                {t('nearby.view')}
                              </button>
                              {mapsHref ? (
                                <a
                                  href={mapsHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
                                  title={t('nearby.mapsHint')}
                                  aria-label={t('nearby.mapsHint')}
                                >
                                  <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                                  {t('nearby.maps')}
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>

              <div className="hidden overflow-x-auto md:block">
                <table id="nearby-farmers-table" className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="whitespace-nowrap px-4 py-3 sm:px-6">{t('nearby.thFarmer')}</th>
                      <th className="whitespace-nowrap px-4 py-3">{t('nearby.thPhone')}</th>
                      <th className="min-w-[12rem] px-4 py-3">{t('farmerList.thLocation')}</th>
                      <th className="min-w-[8rem] px-4 py-3">{t('farmerList.thPurpose')}</th>
                      <th className="whitespace-nowrap px-4 py-3">{t('nearby.thDistance')}</th>
                      <th className="whitespace-nowrap px-4 py-3">{t('nearby.thGps')}</th>
                      <th className="whitespace-nowrap px-4 py-3">{t('nearby.thStatus')}</th>
                      <th className="whitespace-nowrap px-4 py-3">{t('nearby.thPriority')}</th>
                      <th className="whitespace-nowrap px-4 py-3 sm:pr-6">{t('nearby.thActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {nearbyRaw.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-14 text-center text-slate-500 sm:px-6">
                          {t('nearby.empty')}
                        </td>
                      </tr>
                    ) : visibleNearby.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-14 text-center text-slate-500 sm:px-6">
                          {t('nearby.noMatches')}
                        </td>
                      </tr>
                    ) : (
                      visibleNearby.map((r) => {
                        const mapsHref = googleMapsUrlForNearbyRow(r);
                        return (
                          <tr key={r.request_id} className="bg-white hover:bg-slate-50/60">
                            <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 sm:px-6">
                              {r.farmer_name}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-700">{r.phone}</td>
                            <td className="max-w-xs px-4 py-3 text-slate-700">
                              <span className="line-clamp-2 break-words">{farmerLocationLine(r) || t('geo.dash')}</span>
                            </td>
                            <td className="max-w-[10rem] truncate px-4 py-3 text-slate-700" title={purposeOfVisitLabel(r.purpose_of_visit, t) || undefined}>
                              {purposeOfVisitLabel(r.purpose_of_visit, t) || t('geo.dash')}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-sm font-medium text-amber-900">
                              <MapPin className="h-3.5 w-3.5 text-amber-600" />
                              {formatDistanceKm(r, t)}
                            </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              {r.location_verified ? (
                                <span className="text-xs font-medium text-emerald-700">{t('nearby.verified')}</span>
                              ) : (
                                <span className="text-xs text-slate-500">{t('nearby.approx')}</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <StatusBadge status={r.status} />
                            </td>
                            <td
                              className={`whitespace-nowrap px-4 py-3 ${r.priority === 'urgent' ? 'font-semibold text-red-600' : 'text-slate-700'}`}
                            >
                              {t(`priority.${r.priority}`)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 sm:pr-6">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <button
                                  type="button"
                                  onClick={() => navigate(`/farmers/${r.farmer_id}`)}
                                  className="font-medium text-amber-700 hover:text-amber-900 hover:underline"
                                >
                                  {t('nearby.view')}
                                </button>
                                {mapsHref ? (
                                  <a
                                    href={mapsHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900 hover:underline"
                                    title={t('nearby.mapsHint')}
                                    aria-label={t('nearby.mapsHint')}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                                    {t('nearby.maps')}
                                  </a>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
