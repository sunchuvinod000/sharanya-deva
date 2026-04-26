import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Check, MapPin, Pencil, X } from 'lucide-react';
import { api } from '../services/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import CascadingAddress from '../components/CascadingAddress.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { formatDisplayDate } from '../i18n/formatDate.js';
import { translateStateName } from '../i18n/geoLabels.js';
import { purposeOfVisitLabel } from '../i18n/farmerDisplay.js';

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-gray-50';

const btnPrimary =
  'inline-flex min-h-10 touch-manipulation items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-50 sm:min-h-0';

const btnSecondary =
  'inline-flex min-h-10 touch-manipulation items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 sm:min-h-0';

const sectionCard = 'rounded-xl border border-slate-100 bg-slate-50/40 p-4';

const CORE_STEP_KEYS_BOREWELL = ['pending', 'soil_collected', 'approved', 'visited'];
const CORE_STEP_KEYS_SIMPLE = ['pending', 'visited'];

function isBorewellPipelinePurpose(purposeOfVisit) {
  return purposeOfVisit === 'borewell_point';
}

function buildTimelineSteps(status, t, borewellPipeline) {
  const keys = borewellPipeline ? CORE_STEP_KEYS_BOREWELL : CORE_STEP_KEYS_SIMPLE;
  const steps = keys.map((key) => ({ key, label: t(`step.${key}`) }));
  if (status === 'success') steps.push({ key: 'success', label: t('status.success') });
  else if (status === 'failure') steps.push({ key: 'failure', label: t('status.failure') });
  return steps;
}

const STEP_ORDER_BOREWELL = {
  pending: 0,
  soil_collected: 1,
  approved: 2,
  visited: 3,
  success: 4,
  failure: 4,
  rejected: -1,
  on_hold: -2,
};

/** House opening, marriage, etc.: pending → visited → outcome */
const STEP_ORDER_SIMPLE = {
  pending: 0,
  visited: 1,
  success: 2,
  failure: 2,
  rejected: -1,
  on_hold: -2,
};

/** Status for timeline highlighting: restored stage after hold, or inferred from dates if DB was inconsistent. */
function effectivePipelineStatus(req) {
  const { status, status_before_hold: before } = req;
  if (status === 'rejected') return 'rejected';
  if (status === 'success' || status === 'failure') return status;
  if (status === 'on_hold' && before) return before;
  function inferFromDates() {
    if (req.visit_date) return 'visited';
    if (req.approved_date) return 'approved';
    if (req.soil_collected_date) return 'soil_collected';
    return null;
  }
  if (status === 'pending') {
    const d = inferFromDates();
    if (d) return d;
  }
  if (status === 'on_hold') {
    const d = inferFromDates();
    if (d) return d;
  }
  return status;
}

/** Two-step pipeline (non–borewell): only pending vs visited for the progress bar. */
function effectivePipelineStatusSimple(req) {
  const { status, status_before_hold: before } = req;
  if (status === 'rejected') return 'rejected';
  if (status === 'success' || status === 'failure') return status;
  if (status === 'on_hold') {
    if (before === 'visited') return 'visited';
    return 'pending';
  }
  if (status === 'visited' || req.visit_date) return 'visited';
  return 'pending';
}

function validNext(status, borewellPipeline) {
  if (borewellPipeline) {
    switch (status) {
      case 'pending':
        return ['soil_collected'];
      case 'soil_collected':
        return ['approved', 'rejected'];
      case 'approved':
        return ['visited'];
      case 'visited':
        return ['success', 'failure'];
      case 'on_hold':
        return ['pending'];
      default:
        return [];
    }
  }
  switch (status) {
    case 'pending':
      return ['visited', 'rejected'];
    case 'soil_collected':
    case 'approved':
      return ['visited'];
    case 'visited':
      return ['success', 'failure'];
    case 'on_hold':
      return ['pending'];
    default:
      return [];
  }
}

const DATE_FIELDS = {
  pending: null,
  soil_collected: 'soil_collected_date',
  approved: 'approved_date',
  rejected: null,
  visited: 'visit_date',
  success: 'completed_date',
  failure: 'completed_date',
  on_hold: null,
};

function parseFarmerRouteId(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/** When a farmer has multiple request rows, the latest may not be the one on hold; schedule actions must use that row's id. */
function pickPrimaryRequest(requests) {
  if (!Array.isArray(requests) || requests.length === 0) return null;
  const onHold = requests.find((r) => String(r?.status ?? '').trim() === 'on_hold');
  return onHold ?? requests[0];
}

const phoneRe = /^[6-9]\d{9}$/;
const pinRe = /^\d{6}$/;

export default function RequestDetail() {
  const { id } = useParams();
  const farmerId = parseFarmerRouteId(id);
  const navigate = useNavigate();
  const { t, tx, locale } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [statusPick, setStatusPick] = useState('');
  const [notes, setNotes] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [editingFarmer, setEditingFarmer] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPurpose, setEditPurpose] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editVillage, setEditVillage] = useState('');
  const [editState, setEditState] = useState('Andhra Pradesh');
  const [editDistrictId, setEditDistrictId] = useState('');
  const [editMandalId, setEditMandalId] = useState('');
  const [editPinCode, setEditPinCode] = useState('');
  const [editVillages, setEditVillages] = useState([]);
  const [editVillagesLoading, setEditVillagesLoading] = useState(false);
  const [editVillageFromDirectory, setEditVillageFromDirectory] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState('');

  const load = useCallback(async () => {
    if (farmerId == null) return;
    setLoading(true);
    setError('');
    try {
      const { data: res } = await api.get(`/admin/farmers/${farmerId}`);
      setData(res);
      const req = pickPrimaryRequest(res.requests);
      if (req) {
        setNotes(req.notes ?? '');
        setStatusPick('');
        setHoldReason(req.hold_reason ?? '');
      }
    } catch (e) {
      const raw = e.response?.data?.message;
      setError(raw ? tx(raw) : t('detail.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [farmerId, t, tx]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (pickPrimaryRequest(data?.requests)?.status === 'success' && editingFarmer) {
      setEditingFarmer(false);
      setEditErr('');
    }
  }, [data, editingFarmer]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (farmerId == null) {
    return <Navigate to="/farmers" replace />;
  }

  async function pinLocation(requestId) {
    setToast('');
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });
      const { data: saved } = await api.put(`/admin/requests/${requestId}/location`, {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
      const parts = [];
      if (saved.display_name) parts.push(saved.display_name);
      if (saved.geocodingError) parts.push(`${t('detail.geocodePrefix')} ${saved.geocodingError}`);
      setToast(
        parts.length ? t('detail.locationSavedWith', { extra: parts.join(' ') }) : t('detail.locationSaved')
      );
      await load();
    } catch (e) {
      const raw = e.response?.data?.message;
      setToast(raw ? tx(raw) : t('detail.pinFailed'));
    }
  }

  async function updateStatus(requestId) {
    try {
      await api.put(`/admin/requests/${requestId}/status`, { status: statusPick });
      const label = t(`status.${statusPick}`);
      setToast(t('detail.statusToast', { label }));
      await load();
    } catch (e) {
      const raw = e.response?.data?.message;
      setToast(raw ? tx(raw) : t('detail.statusFailed'));
    }
  }

  async function togglePriority(requestId, p) {
    const next = p === 'urgent' ? 'normal' : 'urgent';
    try {
      await api.put(`/admin/requests/${requestId}/priority`, { priority: next });
      setToast(t('detail.priorityUpdated'));
      await load();
    } catch (e) {
      const raw = e.response?.data?.message;
      setToast(raw ? tx(raw) : t('detail.priorityFailed'));
    }
  }

  async function saveNotes(requestId) {
    try {
      await api.put(`/admin/requests/${requestId}/notes`, { notes });
      setToast(t('detail.notesSaved'));
      await load();
    } catch (e) {
      const raw = e.response?.data?.message;
      setToast(raw ? tx(raw) : t('detail.notesFailed'));
    }
  }

  async function putOnHold(requestId) {
    try {
      await api.patch(`/admin/requests/${requestId}/schedule`, { action: 'on_hold', reason: holdReason });
      setToast(t('detail.onHoldSaved'));
      await load();
    } catch (e) {
      const raw = e.response?.data?.message;
      setToast(raw ? tx(raw) : t('detail.onHoldFailed'));
    }
  }

  async function resumeHold(requestId) {
    try {
      await api.patch(`/admin/requests/${requestId}/schedule`, { action: 'resume' });
      setToast(t('detail.resumed'));
      await load();
    } catch (e) {
      const raw = e.response?.data?.message;
      setToast(raw ? tx(raw) : t('detail.resumeFailed'));
    }
  }

  const onEditStateChange = useCallback((s) => {
    setEditState(s);
    setEditDistrictId('');
    setEditMandalId('');
    setEditVillage('');
  }, []);

  const onEditDistrictChange = useCallback((id) => {
    setEditDistrictId(id);
    setEditMandalId('');
    setEditVillage('');
  }, []);

  const onEditMandalChange = useCallback((id) => {
    setEditMandalId(id);
    setEditVillage('');
  }, []);

  useEffect(() => {
    if (!editingFarmer || !editDistrictId || !editMandalId) {
      if (!editingFarmer) return;
      setEditVillages([]);
      setEditVillageFromDirectory(false);
      setEditVillagesLoading(false);
      return;
    }
    let cancel = false;
    (async () => {
      setEditVillagesLoading(true);
      try {
        const { data } = await api.get('/admin/geo/villages', {
          params: { districtId: editDistrictId, mandalId: editMandalId },
        });
        if (cancel) return;
        setEditVillages(data.villages || []);
        setEditVillageFromDirectory(!!data.hasDirectory);
      } catch {
        if (!cancel) {
          setEditVillages([]);
          setEditVillageFromDirectory(false);
        }
      } finally {
        if (!cancel) setEditVillagesLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [editingFarmer, editDistrictId, editMandalId]);

  function beginEditFarmer() {
    if (!data?.farmer) return;
    const f = data.farmer;
    setEditFullName(f.full_name ?? '');
    setEditPurpose(f.purpose_of_visit ?? '');
    setEditPhone(String(f.phone ?? '').replace(/\D/g, ''));
    setEditVillage(f.village ?? '');
    setEditState(f.state ?? 'Andhra Pradesh');
    setEditDistrictId(f.district_id != null ? Number(f.district_id) : '');
    setEditMandalId(f.mandal_id != null ? Number(f.mandal_id) : '');
    setEditPinCode(String(f.pin_code ?? '').replace(/\D/g, ''));
    setEditErr('');
    setEditingFarmer(true);
  }

  function cancelEditFarmer() {
    setEditingFarmer(false);
    setEditErr('');
  }

  async function saveFarmerEdit() {
    setEditErr('');
    if (!phoneRe.test(editPhone)) {
      setEditErr(t('addFarmer.errPhone'));
      return;
    }
    if (!pinRe.test(editPinCode)) {
      setEditErr(t('addFarmer.errPin'));
      return;
    }
    if (!editDistrictId || !editMandalId || !String(editVillage).trim()) {
      setEditErr(t('api.farmerFieldsRequired'));
      return;
    }
    setEditSaving(true);
    try {
      await api.put(`/admin/farmers/${farmerId}`, {
        full_name: editFullName.trim(),
        purpose_of_visit: editPurpose.trim() || null,
        phone: editPhone,
        village: editVillage.trim(),
        mandal_id: editMandalId,
        district_id: editDistrictId,
        state: editState,
        pin_code: editPinCode,
      });
      setEditingFarmer(false);
      setToast(t('detail.farmerUpdated'));
      await load();
    } catch (e) {
      const raw = e.response?.data?.message;
      setEditErr(raw ? tx(raw) : t('detail.farmerUpdateFailed'));
    } finally {
      setEditSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-0 sm:px-1">
        <div className="h-10 w-40 animate-pulse rounded-lg bg-slate-200/80" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-2xl border border-slate-100 bg-slate-100/80" />
          <div className="h-96 animate-pulse rounded-2xl border border-slate-100 bg-slate-100/80" />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error || t('detail.notFound')}
      </div>
    );
  }

  const { farmer, requests } = data;
  const req = pickPrimaryRequest(requests);
  const hasReq = !!req;
  const borewellPipeline = hasReq ? isBorewellPipelinePurpose(farmer.purpose_of_visit) : true;
  const status = hasReq ? req.status : null;
  const pipelineStatus =
    hasReq && req
      ? borewellPipeline
        ? effectivePipelineStatus(req)
        : effectivePipelineStatusSimple(req)
      : null;
  const nextOpts = status != null ? validNext(status, borewellPipeline) : [];
  const rejected = status === 'rejected';
  const onHold = status === 'on_hold';
  const stepOrder = borewellPipeline ? STEP_ORDER_BOREWELL : STEP_ORDER_SIMPLE;
  const currentStepIdx =
    !hasReq || rejected ? -1 : stepOrder[pipelineStatus] ?? 0;
  const terminalOutcome = hasReq && (status === 'success' || status === 'failure');
  /** Success: read-only farmer + request (no edits, hold, pin, notes save). */
  const successLocked = status === 'success';
  const timelineSteps =
    hasReq && status != null ? buildTimelineSteps(status, t, borewellPipeline) : [];

  const sortedEditVillages = [...editVillages].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const editVillageMode =
    !editDistrictId || !editMandalId
      ? 'wait'
      : editVillagesLoading
        ? 'loading'
        : editVillageFromDirectory && sortedEditVillages.length > 0
          ? 'select'
          : 'manual';

  const geoAddr = farmer.address_json;
  const farmLat = farmer.farm_latitude != null ? Number(farmer.farm_latitude) : null;
  const farmLng = farmer.farm_longitude != null ? Number(farmer.farm_longitude) : null;

  return (
    <div className="relative mx-auto w-full min-w-0 max-w-5xl pb-[max(5rem,env(safe-area-inset-bottom))]">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/farmers')}
          className="inline-flex min-h-10 touch-manipulation items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-amber-800 shadow-sm hover:bg-amber-50/80 sm:min-h-0"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          {t('detail.back')}
        </button>
      </div>
      {toast && (
        <div
          role="status"
          className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg sm:left-auto sm:right-4 sm:mx-0"
        >
          {toast}
        </div>
      )}

      <div className="grid min-w-0 gap-5 lg:grid-cols-2 lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-0 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
          {!editingFarmer ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{farmer.full_name}</h1>
                {!successLocked && (
                  <button
                    type="button"
                    onClick={beginEditFarmer}
                    className={`${btnSecondary} shrink-0 gap-1.5 py-2 text-xs sm:text-sm`}
                  >
                    <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {t('detail.editFarmer')}
                  </button>
                )}
              </div>
              <a
                href={`tel:${farmer.phone}`}
                className="mt-3 inline-flex min-h-10 min-w-0 items-center text-base font-semibold text-amber-600 tabular-nums underline-offset-2 hover:underline sm:min-h-0"
              >
                {farmer.phone}
              </a>
              {farmer.purpose_of_visit ? (
                <p className="mt-3 text-sm leading-snug text-slate-600">
                  <span className="font-medium text-slate-700">{t('farmerList.thPurpose')}:</span>{' '}
                  {purposeOfVisitLabel(farmer.purpose_of_visit, t)}
                </p>
              ) : null}
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/90 p-3.5 text-sm leading-relaxed text-slate-700">
                <p className="break-words">
                  {farmer.village}, {farmer.mandal_name}, {farmer.district_name}
                </p>
                <p className="mt-1.5 break-words text-slate-600">
                  {translateStateName(farmer.state, t)} — {farmer.pin_code}
                </p>
                <p className="mt-3 border-t border-slate-200/80 pt-3 text-xs text-slate-500">
                  {t('detail.registered', {
                    date:
                      farmer.created_at != null
                        ? formatDisplayDate(farmer.created_at, locale)
                        : t('geo.dash'),
                  })}
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {editErr && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editErr}</div>}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{t('addFarmer.fullName')}</label>
                  <input
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{t('addFarmer.purpose')}</label>
                  <select
                    value={editPurpose}
                    onChange={(e) => setEditPurpose(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">{t('addFarmer.purposeSelect')}</option>
                    <option value="house_opening">{t('addFarmer.purpose.house_opening')}</option>
                    <option value="marriage">{t('addFarmer.purpose.marriage')}</option>
                    <option value="personal_function">{t('addFarmer.purpose.personal_function')}</option>
                    <option value="borewell_point">{t('addFarmer.purpose.borewell_point')}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{t('addFarmer.phone')}</label>
                  <input
                    inputMode="numeric"
                    maxLength={10}
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, ''))}
                    className={inputClass}
                    required
                  />
                </div>
              </div>
              <CascadingAddress
                state={editState}
                districtId={editDistrictId}
                mandalId={editMandalId}
                onStateChange={onEditStateChange}
                onDistrictChange={onEditDistrictChange}
                onMandalChange={onEditMandalChange}
                village={editVillage}
                onVillageChange={setEditVillage}
                villageMode={editVillageMode}
                villageOptions={sortedEditVillages}
              />
              {editVillageMode === 'manual' && editDistrictId && editMandalId && (
                <p className="text-xs text-slate-500">{t('addFarmer.manualVillageHint')}</p>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t('addFarmer.pin')}</label>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={editPinCode}
                  onChange={(e) => setEditPinCode(e.target.value.replace(/\D/g, ''))}
                  className={inputClass}
                  required
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  disabled={editSaving}
                  onClick={saveFarmerEdit}
                  className={`${btnPrimary} w-full sm:w-auto`}
                >
                  {editSaving ? t('addFarmer.saving') : t('detail.saveFarmer')}
                </button>
                <button
                  type="button"
                  disabled={editSaving}
                  onClick={cancelEditFarmer}
                  className={`${btnSecondary} w-full sm:w-auto`}
                >
                  {t('detail.cancelEdit')}
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-slate-100 pt-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('detail.farmGps')}</h2>
            {farmLat != null && farmLng != null && !Number.isNaN(farmLat) && !Number.isNaN(farmLng) ? (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {farmer.location_verified ? (
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      {t('detail.verifiedGps')}
                    </span>
                  ) : (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                      {t('detail.approxGps')}
                    </span>
                  )}
                </div>
                <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-xs tabular-nums leading-relaxed text-slate-800">
                  {farmer.farm_latitude}, {farmer.farm_longitude}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">{t('detail.noLocation')}</p>
            )}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {hasReq && !successLocked && (
                <button
                  type="button"
                  onClick={() => pinLocation(req.id)}
                  className={`${btnPrimary} w-full sm:w-auto`}
                >
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                  {farmer.location_verified ? t('detail.repin') : t('detail.pin')}
                </button>
              )}
              {farmLat != null && farmLng != null && !Number.isNaN(farmLat) && !Number.isNaN(farmLng) && (
                <Link
                  to={`/district-queue?phone=${encodeURIComponent(String(farmer.phone ?? ''))}`}
                  className={`${btnSecondary} w-full text-amber-800 sm:w-auto`}
                >
                  {t('detail.nearbyFromThisFarm')}
                </Link>
              )}
            </div>

            {geoAddr?.address && (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-sm">
                <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('detail.geocodedTitle')}
                </p>
                <dl className="space-y-2.5 sm:space-y-2">
                  {['city', 'county', 'state_district', 'state', 'country'].map((key) => (
                    <div
                      key={key}
                      className="grid gap-0.5 border-b border-slate-200/70 pb-2.5 last:border-0 last:pb-0 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-x-3"
                    >
                      <dt className="text-xs font-medium text-slate-500">{t(`geo.${key}`)}</dt>
                      <dd className="min-w-0 break-words text-slate-800">
                        {geoAddr.address[key] || t('geo.dash')}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>

        {hasReq ? (
        <div className="min-w-0 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('detail.panelRequest')}</p>
          <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="text-sm font-medium text-slate-600">{t('detail.currentStatus')}</span>
              <StatusBadge status={status} />
            </div>
            {onHold && req.status_before_hold && (
              <p className="mt-2 border-t border-slate-200/80 pt-2 text-xs text-slate-600">
                {t('detail.onHoldWasAt', { label: t(`status.${req.status_before_hold}`) })}
              </p>
            )}
            {!onHold && !rejected && status === 'pending' && pipelineStatus !== 'pending' && (
              <p className="mt-2 border-t border-slate-200/80 pt-2 text-xs text-amber-800">{t('detail.pipelineFromDates')}</p>
            )}
          </div>

          {rejected ? (
            <div className="mt-5 rounded-xl border border-red-100 bg-red-50/90 px-4 py-3 text-sm leading-relaxed text-red-900">
              {t('detail.rejectedMsg')}
            </div>
          ) : onHold ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
                {t('detail.onHoldMsg')}
              </div>
              <div className={sectionCard}>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">{t('detail.onHoldReason')}</label>
                <textarea
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => putOnHold(req.id)}
                  className="min-h-10 w-full touch-manipulation rounded-lg border border-amber-300 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-200/80 sm:min-h-0 sm:w-auto"
                >
                  {t('detail.updateHold')}
                </button>
                <button type="button" onClick={() => resumeHold(req.id)} className={`${btnPrimary} w-full sm:w-auto`}>
                  {t('detail.resume')}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <div className="relative border-l border-slate-200 pl-5">
                {timelineSteps.map((step, idx) => {
                  const isOutcome = step.key === 'success' || step.key === 'failure';
                  let done;
                  let active;
                  if (rejected) {
                    done = false;
                    active = false;
                  } else if (isOutcome) {
                    done = terminalOutcome && status === step.key;
                    active = done;
                  } else {
                    done = currentStepIdx > idx;
                    active = currentStepIdx === idx && !terminalOutcome;
                  }
                  const failOutcome = isOutcome && step.key === 'failure' && status === 'failure';
                  const successOutcome = isOutcome && step.key === 'success' && status === 'success';
                  const dateKey = DATE_FIELDS[step.key];
                  const dateVal = dateKey ? req[dateKey] : null;
                  const showCheck =
                    successOutcome || (done && step.key !== 'failure' && step.key !== 'success');
                  return (
                    <div key={`${step.key}-${idx}`} className="relative mb-5 pb-0.5 last:mb-0">
                      <span
                        className={`absolute -left-[22px] top-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold leading-none ${
                          failOutcome
                            ? 'border-rose-600 bg-rose-600 text-white'
                            : showCheck
                              ? 'border-green-500 bg-green-500 text-white'
                              : active
                                ? 'border-amber-500 bg-amber-100 text-amber-800'
                                : 'border-gray-300 bg-white text-gray-400'
                        }`}
                      >
                        {failOutcome ? (
                          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                        ) : showCheck ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          idx + 1
                        )}
                      </span>
                      <p
                        className={`pr-1 text-sm font-semibold leading-snug sm:text-base ${
                          failOutcome
                            ? 'text-rose-800'
                            : active
                              ? 'text-amber-700'
                              : done || successOutcome
                                ? 'text-green-800'
                                : 'text-slate-400'
                        }`}
                      >
                        {step.label}
                      </p>
                      {dateVal && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatDisplayDate(dateVal, locale)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {!terminalOutcome && (
                <div className={sectionCard}>
                  <label htmlFor="next-status" className="mb-1.5 block text-xs font-medium text-slate-600">
                    {t('detail.nextStatus')}
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                    <select
                      id="next-status"
                      value={statusPick}
                      onChange={(e) => setStatusPick(e.target.value)}
                      className={`${inputClass} min-h-10 w-full min-w-0 sm:max-w-xs`}
                    >
                      <option value="">{t('detail.select')}</option>
                      {nextOpts.map((s) => (
                        <option key={s} value={s}>
                          {t(`status.${s}`)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!statusPick}
                      onClick={() => updateStatus(req.id)}
                      className={`${btnPrimary} w-full shrink-0 disabled:cursor-not-allowed sm:w-auto`}
                    >
                      {t('detail.update')}
                    </button>
                  </div>
                </div>
              )}

              <div className={sectionCard}>
                <p className="text-xs font-medium text-slate-600">
                  {t('detail.priority')}:{' '}
                  <span className={`text-sm font-semibold text-slate-900 ${req.priority === 'urgent' ? 'text-red-600' : ''}`}>
                    {t(`priority.${req.priority}`)}
                  </span>
                </p>
                {!terminalOutcome && status !== 'rejected' && (
                  <button
                    type="button"
                    onClick={() => togglePriority(req.id, req.priority)}
                    className={`${btnSecondary} mt-2 w-full sm:w-auto`}
                  >
                    {t('detail.setPriority', {
                      p: t(req.priority === 'urgent' ? 'detail.normal' : 'detail.urgent'),
                    })}
                  </button>
                )}
              </div>

              {!successLocked && (
                <div className={sectionCard}>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">{t('detail.onHoldReason')}</label>
                  <textarea
                    value={holdReason}
                    onChange={(e) => setHoldReason(e.target.value)}
                    rows={3}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => putOnHold(req.id)}
                    className="mt-2 min-h-10 w-full touch-manipulation rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 sm:min-h-0 sm:inline-flex sm:w-auto"
                  >
                    {t('detail.putOnHold')}
                  </button>
                </div>
              )}

              <div className={sectionCard}>
                <label htmlFor="farmer-notes" className="mb-1.5 block text-xs font-medium text-slate-600">
                  {t('detail.notes')}
                </label>
                {successLocked ? (
                  <p className="min-h-[4.5rem] whitespace-pre-wrap rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm text-slate-800">
                    {notes || t('geo.dash')}
                  </p>
                ) : (
                  <>
                    <textarea
                      id="farmer-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      className={`${inputClass} min-w-0`}
                    />
                    <button
                      type="button"
                      onClick={() => saveNotes(req.id)}
                      className="mt-2 min-h-10 w-full touch-manipulation rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 sm:min-h-0 sm:inline-flex sm:w-auto"
                    >
                      {t('detail.saveNotes')}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        ) : (
        <div className="min-w-0 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center text-sm leading-relaxed text-slate-600 sm:p-8">
          {t('detail.noRequest')}
        </div>
        )}
      </div>
    </div>
  );
}
