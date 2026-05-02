import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ExternalLink, Loader2, MapPin, Navigation, Route, Search, User, X } from 'lucide-react';
import { api } from '../services/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { farmerLocationLine, purposeOfVisitLabel, rowExpectedVisitDisplay } from '../i18n/farmerDisplay.js';
/** Max `radiusKm` shown in UI (server accepts up to 500). */
const NEARBY_RADIUS_MAX_KM = 300;
/** Default search radius when the page loads. */
const NEARBY_RADIUS_DEFAULT_KM = 100;
/** Rows per page for the nearby list + desktop table. */
const NEARBY_TABLE_PAGE_SIZE = 20;
/** API `radiusKm` presets (km from center), up to `NEARBY_RADIUS_MAX_KM`. */
const RADIUS_OPTIONS = [10, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300];

const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm leading-snug text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/25 disabled:bg-gray-50';

const nearbyAnchorFieldClass =
  'box-border min-h-[3rem] h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 md:text-[0.9375rem] disabled:bg-gray-50';

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

function filterNearbyRows(rows, { debounced }) {
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
    return true;
  });
}

const ROUTE_PREVIEW_W = 420;
const ROUTE_PREVIEW_H = 280;
/** Extra inset so marker labels drawn below dots stay inside the viewBox. */
const ROUTE_PREVIEW_PAD = 42;
/** Max characters per node label on the preview SVG (long names truncated). */
const ROUTE_MAP_LABEL_MAX = 20;

function truncateRouteMapLabel(s, maxLen = ROUTE_MAP_LABEL_MAX) {
  const x = String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!x) return '—';
  return x.length > maxLen ? `${x.slice(0, maxLen - 1)}…` : x;
}

/** Prefix + body, total length capped at `totalMax` (for SVG badges). */
function routeMapPrefixedLabel(prefix, body, totalMax = ROUTE_MAP_LABEL_MAX) {
  const pre = String(prefix);
  const budget = Math.max(2, totalMax - pre.length);
  const core = truncateRouteMapLabel(body, budget);
  return `${pre}${core}`;
}

function routePreviewLayout(origin, stops, startLegend) {
  const geoPts = [];
  if (wgs84Ok(Number(origin.lat), Number(origin.lng))) {
    geoPts.push({ lat: Number(origin.lat), lng: Number(origin.lng) });
  }
  for (const r of stops) {
    const lat = r.farm_latitude != null ? Number(r.farm_latitude) : NaN;
    const lng = r.farm_longitude != null ? Number(r.farm_longitude) : NaN;
    if (!wgs84Ok(lat, lng)) continue;
    geoPts.push({ lat, lng });
  }

  const validGeo = geoPts.filter((p) => wgs84Ok(p.lat, p.lng));
  if (validGeo.length < 2) {
    return {
      screen: [],
      pathD: '',
      count: Math.max(0, stops.filter((r) => {
        const la = r.farm_latitude != null ? Number(r.farm_latitude) : NaN;
        const ln = r.farm_longitude != null ? Number(r.farm_longitude) : NaN;
        return wgs84Ok(la, ln);
      }).length),
    };
  }

  let minLat = validGeo[0].lat;
  let maxLat = validGeo[0].lat;
  let minLng = validGeo[0].lng;
  let maxLng = validGeo[0].lng;
  for (const p of validGeo) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  const spanLat = Math.max(maxLat - minLat, 1e-5);
  const spanLng = Math.max(maxLng - minLng, 1e-5);
  const innerW = ROUTE_PREVIEW_W - ROUTE_PREVIEW_PAD * 2;
  const innerH = ROUTE_PREVIEW_H - ROUTE_PREVIEW_PAD * 2;

  const toXY = (lat, lng) => ({
    x: ROUTE_PREVIEW_PAD + ((lng - minLng) / spanLng) * innerW,
    y: ROUTE_PREVIEW_PAD + ((maxLat - lat) / spanLat) * innerH,
  });

  const startXY = toXY(origin.lat, origin.lng);
  const startText = routeMapPrefixedLabel('0. ', startLegend);
  const screen = [{ ...startXY, kind: 'start', mapLabel: startText }];
  let seq = 0;
  for (const r of stops) {
    const lat = r.farm_latitude != null ? Number(r.farm_latitude) : NaN;
    const lng = r.farm_longitude != null ? Number(r.farm_longitude) : NaN;
    if (!wgs84Ok(lat, lng)) continue;
    seq += 1;
    screen.push({
      ...toXY(lat, lng),
      kind: 'stop',
      mapLabel: routeMapPrefixedLabel(`${seq}. `, r.farmer_name),
    });
  }

  const pathD =
    screen.length >= 2
      ? `M ${screen.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')} Z`
      : '';

  return { screen, pathD, count: screen.length - 1 };
}

function RouteMapModal({ open, onClose, origin, stops, startLegend, t }) {
  const layout = useMemo(
    () => routePreviewLayout(origin, stops, startLegend),
    [origin, stops, startLegend]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hasPath = layout.screen.length >= 2 && layout.pathD;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="route-map-title"
        className="max-h-[min(90vh,640px)] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="route-map-title" className="text-base font-semibold text-slate-900">
              {t('nearby.routeMapTitle')}
            </h2>
            {hasPath ? (
              <p className="mt-0.5 text-xs text-slate-600">{t('nearby.routeMapSubtitle', { count: layout.count })}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
            aria-label={t('nearby.routeMapClose')}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-5">
          {!hasPath ? (
            <p className="text-center text-sm text-slate-600">{t('nearby.routeMapNoStops')}</p>
          ) : (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-emerald-50/80 via-sky-50/50 to-amber-50/70 shadow-inner">
                <svg
                  viewBox={`0 0 ${ROUTE_PREVIEW_W} ${ROUTE_PREVIEW_H}`}
                  className="h-auto w-full"
                  aria-hidden
                >
                  <defs>
                    <pattern id="routePreviewGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path
                        d="M 20 0 L 0 0 0 20"
                        fill="none"
                        stroke="rgb(148 163 184 / 0.35)"
                        strokeWidth="0.5"
                      />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#routePreviewGrid)" />
                  <path
                    d={layout.pathD}
                    fill="none"
                    stroke="#d97706"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray="6 5"
                  />
                  {layout.screen.map((p, i) => {
                    const isStart = p.kind === 'start';
                    const r = isStart ? 9 : 7;
                    const label = p.mapLabel ?? '—';
                    const labelY = p.y + r + 11;
                    return (
                      <g key={`${isStart ? 'o' : 's'}-${i}`}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={r}
                          fill={isStart ? '#f59e0b' : '#fff'}
                          stroke={isStart ? '#fff' : '#d97706'}
                          strokeWidth="2"
                        />
                        <text
                          x={p.x}
                          y={labelY}
                          textAnchor="middle"
                          dominantBaseline="hanging"
                          fill="#0f172a"
                          fontSize="8.25"
                          fontWeight={600}
                          stroke="#fff"
                          strokeWidth="2.5"
                          paintOrder="stroke fill"
                        >
                          {label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <p className="text-center text-[11px] text-slate-500">{t('nearby.routeMapPreviewNote')}</p>
              <ul className="max-h-32 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-xs text-slate-700">
                <li className="font-medium text-amber-900">
                  <span className="mr-2 inline-block min-w-[1.25rem] tabular-nums text-slate-500">0.</span>
                  {startLegend}
                </li>
                {stops
                  .filter((r) => {
                    const lat = r.farm_latitude != null ? Number(r.farm_latitude) : NaN;
                    const lng = r.farm_longitude != null ? Number(r.farm_longitude) : NaN;
                    return wgs84Ok(lat, lng);
                  })
                  .map((r, seq) => (
                    <li
                      key={r.request_id ?? seq}
                      className="flex min-w-0 items-baseline gap-2"
                      title={[r.farmer_name, r.phone].filter(Boolean).join(' · ') || undefined}
                    >
                      <span className="min-w-[1.25rem] shrink-0 tabular-nums text-slate-500">{seq + 1}.</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{r.farmer_name || '—'}</span>
                      {r.phone ? (
                        <span className="shrink-0 tabular-nums text-slate-500">{r.phone}</span>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('nearby.routeMapClose')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DistrictQueue() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, tx, locale } = useI18n();
  const [nearbyRaw, setNearbyRaw] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [myLoc, setMyLoc] = useState(null);
  /** Shown under coordinates: whose farm / GPS we used as the distance anchor. */
  const [centerCaption, setCenterCaption] = useState('');
  /** Farmer-anchor center: formatted village · mandal · district (replaces coords in UI). Cleared when using device GPS. */
  const [centerAddressLine, setCenterAddressLine] = useState('');
  const [anchorPhone, setAnchorPhone] = useState('');
  /** When centering on a farmer's farm, omit that farmer from the nearby list. */
  const [excludeAnchorFarmerId, setExcludeAnchorFarmerId] = useState(null);
  const [farmerAnchorLoading, setFarmerAnchorLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  /** Search radius (km) sent to `/admin/nearby`. */
  const [searchRadiusKm, setSearchRadiusKm] = useState(NEARBY_RADIUS_DEFAULT_KM);
  const [routeStops, setRouteStops] = useState([]);
  const [routeMapOpen, setRouteMapOpen] = useState(false);
  const [nearbyPage, setNearbyPage] = useState(1);

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
    setRouteStops([]);
    setRouteMapOpen(false);
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

  const visibleNearby = useMemo(() => {
    const filtered = filterNearbyRows(nearbyRaw, { debounced });
    return [...filtered].sort((a, b) => distanceSortKey(a.distance_km) - distanceSortKey(b.distance_km));
  }, [nearbyRaw, debounced]);

  const nearbyFilteredTotal = visibleNearby.length;
  const nearbyTotalPages = Math.max(1, Math.ceil(nearbyFilteredTotal / NEARBY_TABLE_PAGE_SIZE));

  const mapCenterKey = myLoc ? `${myLoc.lat},${myLoc.lng}` : '';

  useEffect(() => {
    setNearbyPage(1);
  }, [debounced, searchRadiusKm, excludeAnchorFarmerId, mapCenterKey]);

  useEffect(() => {
    if (nearbyPage > nearbyTotalPages) setNearbyPage(nearbyTotalPages);
  }, [nearbyPage, nearbyTotalPages]);

  const paginatedNearby = useMemo(() => {
    const start = (nearbyPage - 1) * NEARBY_TABLE_PAGE_SIZE;
    return visibleNearby.slice(start, start + NEARBY_TABLE_PAGE_SIZE);
  }, [visibleNearby, nearbyPage]);

  const nearbyFrom =
    nearbyFilteredTotal === 0 ? 0 : (nearbyPage - 1) * NEARBY_TABLE_PAGE_SIZE + 1;
  const nearbyTo = Math.min(nearbyPage * NEARBY_TABLE_PAGE_SIZE, nearbyFilteredTotal);

  /** Show list filters whenever a center exists — not only when the API returned rows (so phone/date filters stay usable after an empty result). */
  const showFilters = Boolean(myLoc);

  function generateRoute() {
    if (!myLoc) return;
    const candidates = visibleNearby
      .filter((r) => {
        const lat = r.farm_latitude != null ? Number(r.farm_latitude) : NaN;
        const lng = r.farm_longitude != null ? Number(r.farm_longitude) : NaN;
        return wgs84Ok(lat, lng);
      })
      .slice(0, 10);
    setRouteStops(candidates);
    setRouteMapOpen(true);
  }

  function useMyLocation() {
    setError('');
    if (!navigator.geolocation) {
      setError(t('nearby.geoFailed'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setExcludeAnchorFarmerId(null);
        setCenterAddressLine('');
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
      const addressLine =
        farmerLocationLine({
          village: data.village,
          mandal_name: data.mandalName ?? data.mandal_name,
          district_name: data.districtName ?? data.district_name,
        }) || '';
      setCenterAddressLine(addressLine);
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
        <div className="border-b border-slate-100 bg-gradient-to-br from-amber-50/90 via-white to-slate-50/80 px-4 py-4 sm:px-6 lg:py-5">
          <h1 className="sr-only">{t('nearby.title')}</h1>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between xl:gap-6">
            <div className="flex w-full min-w-0 shrink-0 flex-col gap-3.5 sm:max-w-lg xl:w-[20rem]">
              <div className="space-y-2">
                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-amber-100/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-amber-950">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                  {t('nearby.proximity')}
                </div>
                <p id="nearby-proximity-info" className="text-sm leading-relaxed text-slate-600">
                  {t('nearby.proximityInfo', { km: searchRadiusKm })}
                </p>
              </div>
              <button
                type="button"
                onClick={useMyLocation}
                aria-describedby="nearby-proximity-info"
                className="inline-flex min-h-[3rem] h-12 w-full touch-manipulation items-center justify-center gap-2.5 rounded-xl bg-amber-600 px-5 text-base font-semibold text-white shadow-md shadow-amber-600/25 transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 md:text-[0.9375rem]"
              >
                <Navigation className="h-5 w-5 shrink-0" aria-hidden />
                {t('nearby.useLocation')}
              </button>
            </div>
            <div className="min-w-0 flex-1 rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-md sm:p-5 lg:p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 sm:gap-x-6 sm:gap-y-5 sm:items-end lg:gap-x-8">
                <div className="min-w-0 sm:col-span-5 lg:col-span-4">
                  <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="nearby-anchor-phone">
                    {t('nearby.anchorPhoneLabel')}
                  </label>
                  <input
                    id="nearby-anchor-phone"
                    type="tel"
                    inputMode="numeric"
                    value={anchorPhone}
                    onChange={(e) => setAnchorPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                    placeholder={t('nearby.anchorPhonePlaceholder')}
                    className={`${nearbyAnchorFieldClass} tabular-nums tracking-wide`}
                    autoComplete="tel"
                  />
                </div>
                <div className="min-w-0 sm:col-span-4 lg:col-span-3">
                  <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="nearby-search-radius">
                    {t('nearby.searchRadiusLabel')}
                  </label>
                  <select
                    id="nearby-search-radius"
                    value={String(searchRadiusKm)}
                    onChange={(e) => setSearchRadiusKm(Number(e.target.value))}
                    className={nearbyAnchorFieldClass}
                  >
                    {RADIUS_OPTIONS.map((km) => (
                      <option key={km} value={String(km)}>
                        {t('nearby.radiusOption', { km })}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex min-w-0 flex-col justify-end sm:col-span-3 lg:col-span-5">
                  <button
                    type="button"
                    onClick={useFarmerFarmAsCenter}
                    disabled={farmerAnchorLoading || String(anchorPhone).replace(/\D/g, '').length < 10}
                    className="inline-flex min-h-[3rem] h-12 w-full touch-manipulation items-center justify-center gap-2.5 rounded-xl border-2 border-amber-300/90 bg-gradient-to-b from-amber-50 to-amber-100/70 px-4 text-base font-semibold text-amber-950 shadow-sm transition hover:border-amber-400 hover:from-amber-100 hover:to-amber-100 disabled:cursor-not-allowed disabled:opacity-50 md:text-[0.9375rem]"
                  >
                    {farmerAnchorLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
                    ) : (
                      <User className="h-5 w-5 shrink-0" aria-hidden />
                    )}
                    {t('nearby.anchorFarmerButton')}
                  </button>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                {t('nearby.searchRadiusHintShort', { max: NEARBY_RADIUS_MAX_KM })}
              </p>
            </div>
          </div>

          {myLoc && (
            <div className="mt-4 flex flex-col gap-2 border-t border-slate-100/80 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 lg:mt-5 lg:pt-5">
              {centerCaption ? (
                <p className="text-xs font-medium text-slate-800 sm:text-sm">{centerCaption}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {centerAddressLine ? (
                <span
                  className="max-w-full rounded-lg bg-slate-900/5 px-2.5 py-1.5 text-left text-sm leading-snug text-slate-800 sm:max-w-2xl sm:px-3"
                  title={`${Number(myLoc.lat).toFixed(6)}, ${Number(myLoc.lng).toFixed(6)}`}
                >
                  {centerAddressLine}
                </span>
              ) : (
                <span className="max-w-full truncate rounded-lg bg-slate-900/5 px-2.5 py-1 font-mono text-xs tabular-nums text-slate-700 sm:px-3">
                  {Number(myLoc.lat).toFixed(6)}, {Number(myLoc.lng).toFixed(6)}
                </span>
              )}
              {!loading && nearbyRaw.length > 0 && (
                <span className="text-xs text-slate-600 sm:text-sm">
                  {t('nearby.inRange', { count: nearbyRaw.length })}
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
          <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50/90 via-white to-amber-50/30 px-4 py-4 sm:px-8 sm:py-5">
            <div
              className={`mx-auto grid max-w-6xl gap-4 ${
                visibleNearby.length > 0 ? 'md:grid-cols-[minmax(0,13fr)_minmax(0,7fr)] md:items-center md:gap-6' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="relative">
                  <label htmlFor="nearby-list-search" className="sr-only">
                    {t('farmerList.search')} — {t('farmerList.placeholder')}
                  </label>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-amber-600/85"
                    aria-hidden
                  />
                  <input
                    id="nearby-list-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('farmerList.placeholder')}
                    className="h-11 w-full box-border rounded-xl border border-slate-200/90 bg-white pl-10 pr-3 text-sm text-slate-900 shadow-sm transition-[box-shadow,border-color] hover:border-slate-300 hover:shadow-md placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    autoComplete="off"
                  />
                </div>
              </div>

              {visibleNearby.length > 0 ? (
                <div className="flex min-h-0 min-w-0 md:items-center md:border-l md:border-slate-200/80 md:pl-6">
                  <button
                    type="button"
                    onClick={generateRoute}
                    className="inline-flex h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 px-4 text-sm font-semibold text-white shadow-md shadow-slate-900/20 ring-1 ring-white/10 transition hover:from-slate-700 hover:to-slate-900 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                  >
                    <Route className="h-4 w-4 shrink-0 text-amber-300/95" aria-hidden />
                    <span className="leading-none">{t('nearby.routeButton')}</span>
                  </button>
                </div>
              ) : null}
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
                  paginatedNearby.map((r) => {
                    const mapsHref = googleMapsUrlForNearbyRow(r);
                    return (
                      <li key={r.request_id}>
                        <div className="flex min-w-0 flex-col gap-2 px-3 py-3">
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <span className="truncate font-medium text-slate-900">{r.farmer_name}</span>
                            <div className="flex shrink-0 flex-col items-end gap-0.5">
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                                <MapPin className="h-3 w-3 text-amber-600" aria-hidden />
                                {formatDistanceKm(r, t)}
                              </span>
                              <span
                                className={
                                  r.location_verified
                                    ? 'text-[10px] font-medium text-emerald-700'
                                    : 'text-[10px] text-slate-500'
                                }
                              >
                                {r.location_verified ? t('nearby.verified') : t('nearby.approx')}
                              </span>
                            </div>
                          </div>
                          <div className="truncate text-xs text-slate-600">{r.phone}</div>
                          <div className="line-clamp-2 text-xs leading-snug text-slate-600">
                            {farmerLocationLine(r) || t('geo.dash')}
                          </div>
                          <div className="text-xs text-slate-600">
                            <span className="text-slate-500">{t('farmerList.thPurpose')}:</span>{' '}
                            {purposeOfVisitLabel(r.purpose_of_visit, t) || t('geo.dash')}
                          </div>
                          <div className="text-xs tabular-nums text-slate-600">
                            <span className="text-slate-500">{t('farmerList.expectedVisitDate')}:</span>{' '}
                            {rowExpectedVisitDisplay(r, locale)}
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
                      <th className="whitespace-nowrap px-4 py-3">{t('farmerList.expectedVisitDate')}</th>
                      <th className="whitespace-nowrap px-4 py-3">{t('nearby.thStatus')}</th>
                      <th className="whitespace-nowrap px-4 py-3 sm:pr-6">{t('nearby.thActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {nearbyRaw.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-14 text-center text-slate-500 sm:px-6">
                          {t('nearby.empty')}
                        </td>
                      </tr>
                    ) : visibleNearby.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-14 text-center text-slate-500 sm:px-6">
                          {t('nearby.noMatches')}
                        </td>
                      </tr>
                    ) : (
                      paginatedNearby.map((r) => {
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
                            <td className="whitespace-nowrap px-4 py-3 align-top">
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-sm font-medium text-amber-900">
                                  <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                                  {formatDistanceKm(r, t)}
                                </span>
                                <span
                                  className={`text-xs ${
                                    r.location_verified ? 'font-medium text-emerald-700' : 'text-slate-500'
                                  }`}
                                >
                                  {r.location_verified ? t('nearby.verified') : t('nearby.approx')}
                                </span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600 tabular-nums">
                              {rowExpectedVisitDisplay(r, locale)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <StatusBadge status={r.status} />
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

              {nearbyFilteredTotal > 0 ? (
                <footer className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50/90 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                  <p className="text-center text-sm text-slate-600 sm:text-left">
                    {t('nearby.paginationShowing', { from: nearbyFrom, to: nearbyTo, total: nearbyFilteredTotal })}
                  </p>
                  <div className="flex items-center justify-center gap-2 sm:justify-end">
                    <button
                      type="button"
                      disabled={nearbyPage <= 1}
                      onClick={() => setNearbyPage((p) => Math.max(1, p - 1))}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t('farmerList.previous')}
                    </button>
                    <span className="min-w-[7rem] text-center text-sm tabular-nums text-slate-600">
                      {t('nearby.paginationPage', { page: nearbyPage, total: nearbyTotalPages })}
                    </span>
                    <button
                      type="button"
                      disabled={nearbyPage >= nearbyTotalPages}
                      onClick={() => setNearbyPage((p) => p + 1)}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t('farmerList.next')}
                    </button>
                  </div>
                </footer>
              ) : null}
            </>
          )}
        </div>
      </section>

      <RouteMapModal
        open={routeMapOpen}
        onClose={() => setRouteMapOpen(false)}
        origin={myLoc ?? { lat: 0, lng: 0 }}
        stops={routeStops}
        startLegend={(centerCaption && centerCaption.trim()) || t('nearby.routeMapStartFallback')}
        t={t}
      />
    </div>
  );
}
