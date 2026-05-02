import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api.js';
import { parseApiDateToYmd } from '../utils/dateYmd.js';
import { useI18n } from '../context/I18nContext.jsx';

function yyyymmFromDateInput(ymd) {
  if (!ymd) return '';
  return String(ymd).slice(0, 7);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function weekdayMon0(date) {
  const d = date.getDay();
  return (d + 6) % 7;
}

function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const q = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(q)));
}

function calendarRowsByDay(rows) {
  const map = new Map();
  for (const r of rows) {
    const ymd = r.expected_visit_date ? parseApiDateToYmd(r.expected_visit_date) : '';
    if (!ymd) continue;
    const list = map.get(ymd) || [];
    list.push(r);
    map.set(ymd, list);
  }
  return map;
}

/** Date input plus optional availability calendar modal (matches Add Farmer behaviour). */
export default function ExpectedVisitCalendarField({
  value,
  onChange,
  label,
  hint,
  enableCalendar = true,
  required = false,
  labelClassName = 'mb-1 block text-sm font-medium text-slate-700',
  inputClassName = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-gray-50',
}) {
  const { t, tx } = useI18n();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState('');
  const [calendarRows, setCalendarRows] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState('');
  const [calendarSelectedYmd, setCalendarSelectedYmd] = useState('');
  const [calendarAllowBooked, setCalendarAllowBooked] = useState(false);
  const [calendarFeasibilityPin, setCalendarFeasibilityPin] = useState('');
  const [pinLookup, setPinLookup] = useState(null);
  const [pinLookupErr, setPinLookupErr] = useState('');
  const [pinLookupLoading, setPinLookupLoading] = useState(false);
  const [monthFade, setMonthFade] = useState(false);

  useEffect(() => {
    if (!enableCalendar && calendarOpen) setCalendarOpen(false);
  }, [enableCalendar, calendarOpen]);

  useEffect(() => {
    if (calendarOpen) {
      setCalendarVisible(true);
      setCalendarAllowBooked(false);
      const tid = setTimeout(() => setCalendarVisible(true), 0);
      return () => clearTimeout(tid);
    }
    setCalendarVisible(false);
  }, [calendarOpen]);

  useEffect(() => {
    if (!calendarOpen) return;
    const m =
      calendarMonth ||
      yyyymmFromDateInput(value) ||
      (() => {
        const d = new Date();
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      })();
    let cancel = false;
    (async () => {
      setCalendarLoading(true);
      setCalendarError('');
      try {
        const { data } = await api.get('/admin/visit-calendar', { params: { month: m } });
        if (cancel) return;
        setCalendarMonth(data.month || m);
        setCalendarRows(Array.isArray(data.rows) ? data.rows : []);
      } catch (e) {
        if (cancel) return;
        const raw = e.response?.data?.message;
        setCalendarError(raw ? tx(raw) : t('addFarmer.calendarLoadFailed'));
        setCalendarRows([]);
      } finally {
        if (!cancel) setCalendarLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [calendarOpen, calendarMonth, value, t, tx]);

  const rowsByYmd = useMemo(() => calendarRowsByDay(calendarRows), [calendarRows]);
  const selectedDayRows = calendarSelectedYmd ? rowsByYmd.get(calendarSelectedYmd) || [] : [];
  const feasibilityPinDigits = String(calendarFeasibilityPin).replace(/\D/g, '').slice(0, 6);
  const feasibilityPinOk = /^\d{6}$/.test(feasibilityPinDigits);

  useEffect(() => {
    if (!calendarOpen || !calendarAllowBooked) return;
    if (!feasibilityPinOk) {
      setPinLookup(null);
      setPinLookupErr('');
      setPinLookupLoading(false);
      return;
    }
    let cancel = false;
    (async () => {
      setPinLookupLoading(true);
      setPinLookupErr('');
      try {
        const { data } = await api.get('/admin/pincode-lookup', { params: { pin: feasibilityPinDigits } });
        if (cancel) return;
        setPinLookup(data);
        if (!data?.centroid) {
          setPinLookupErr(t('addFarmer.calendarPinNoCentroid', { district: data?.centroidDistrict || data?.district || '' }));
        }
      } catch (e) {
        if (cancel) return;
        const raw = e.response?.data?.message;
        setPinLookup(null);
        setPinLookupErr(raw ? tx(raw) : t('addFarmer.calendarPinLookupFailed'));
      } finally {
        if (!cancel) setPinLookupLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [calendarOpen, calendarAllowBooked, feasibilityPinOk, feasibilityPinDigits, t, tx]);

  function changeMonth(delta) {
    const base =
      calendarMonth ||
      (() => {
        const d = new Date();
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      })();
    const [yy, mm] = base.split('-').map((n) => Number(n));
    const dt = new Date(yy, mm - 1 + delta, 1);
    setMonthFade(true);
    setCalendarMonth(`${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}`);
    setCalendarSelectedYmd('');
    setCalendarAllowBooked(false);
    setCalendarFeasibilityPin('');
    setPinLookup(null);
    setPinLookupErr('');
    setTimeout(() => setMonthFade(false), 160);
  }

  function openCalendar() {
    setCalendarOpen(true);
    setCalendarMonth(yyyymmFromDateInput(value) || '');
    setCalendarSelectedYmd(value || '');
    setCalendarAllowBooked(false);
    setCalendarFeasibilityPin('');
    setPinLookup(null);
    setPinLookupErr('');
  }

  return (
    <div>
      <label className={labelClassName}>{label}</label>
      <div className={enableCalendar ? 'flex gap-2' : undefined}>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClassName}
          required={required}
        />
        {enableCalendar ? (
          <button
            type="button"
            onClick={openCalendar}
            className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-gray-50"
          >
            {t('addFarmer.calendarButton')}
          </button>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}

      {calendarOpen && enableCalendar ? (
        <div
          className={`fixed inset-0 z-[70] flex items-center justify-center p-4 transition-colors duration-200 ${
            calendarVisible ? 'bg-black/45' : 'bg-black/0'
          }`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCalendarOpen(false);
          }}
        >
          <div
            className={`w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl transition-all duration-200 ${
              calendarVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[0.98] opacity-0'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{t('addFarmer.calendarTitle')}</p>
                <p className="text-xs text-slate-500">{calendarMonth || t('geo.dash')}</p>
              </div>
              <button
                type="button"
                onClick={() => setCalendarOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('addFarmer.calendarClose')}
              </button>
            </div>

            {calendarError ? (
              <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-800">{calendarError}</div>
            ) : null}

            <div className="grid gap-0 sm:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="border-b border-slate-100 p-4 sm:border-b-0 sm:border-r sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => changeMonth(-1)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('addFarmer.calendarPrev')}
                  </button>
                  <button
                    type="button"
                    onClick={() => changeMonth(1)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('addFarmer.calendarNext')}
                  </button>
                </div>

                {calendarLoading ? (
                  <p className="py-10 text-center text-sm text-slate-500">{t('dashboard.working')}</p>
                ) : (
                  <div className={`transition-opacity duration-150 ${monthFade ? 'opacity-0' : 'opacity-100'}`}>
                    {(() => {
                      const base =
                        calendarMonth ||
                        (() => {
                          const d = new Date();
                          return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
                        })();
                      const [yy, mm] = base.split('-').map((n) => Number(n));
                      const first = new Date(yy, mm - 1, 1);
                      const startPad = weekdayMon0(first);
                      const dim = daysInMonth(yy, mm);
                      const cells = [];
                      for (let i = 0; i < startPad; i++) cells.push(null);
                      for (let d = 1; d <= dim; d++) {
                        cells.push(`${yy}-${pad2(mm)}-${pad2(d)}`);
                      }
                      while (cells.length % 7 !== 0) cells.push(null);

                      const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

                      return (
                        <div>
                          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500">
                            {weekDays.map((w) => (
                              <div key={w} className="py-1">
                                {w}
                              </div>
                            ))}
                          </div>
                          <div className="mt-1 grid grid-cols-7 gap-1">
                            {cells.map((ymd, idx) => {
                              if (!ymd) return <div key={`e-${idx}`} className="h-16 rounded-lg bg-transparent" />;
                              const booked = rowsByYmd.get(ymd) || [];
                              const isSelected = ymd === calendarSelectedYmd;
                              const available = booked.length === 0;
                              const firstRow = booked[0];
                              const sub =
                                booked.length === 0
                                  ? t('addFarmer.calendarAvailable')
                                  : booked.length === 1
                                    ? `${firstRow.purpose_of_visit || t('geo.dash')} · ${firstRow.district || t('geo.dash')}`
                                    : `${booked.length} ${t('addFarmer.calendarBooked')}`;
                              return (
                                <button
                                  key={ymd}
                                  type="button"
                                  onClick={() => {
                                    setCalendarSelectedYmd(ymd);
                                    setCalendarAllowBooked(false);
                                    setCalendarFeasibilityPin('');
                                    setPinLookup(null);
                                    setPinLookupErr('');
                                  }}
                                  className={`h-16 rounded-lg border px-2 py-1 text-left text-xs transition ${
                                    isSelected
                                      ? 'border-amber-400 bg-amber-50'
                                      : available
                                        ? 'border-slate-200 bg-white hover:bg-slate-50'
                                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                                  }`}
                                  title={
                                    available ? t('addFarmer.calendarAvailableTitle') : t('addFarmer.calendarBookedTitle')
                                  }
                                >
                                  <div className="font-semibold text-slate-900">{Number(String(ymd).slice(8, 10))}</div>
                                  <div
                                    className={`mt-0.5 line-clamp-2 text-[11px] ${available ? 'text-emerald-700' : 'text-slate-600'}`}
                                  >
                                    {sub}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div className="p-4 sm:p-5">
                <p className="text-sm font-semibold text-slate-900">{t('addFarmer.calendarDayDetails')}</p>
                <p className="mt-1 text-xs text-slate-500">{calendarSelectedYmd || t('geo.dash')}</p>

                <div className="mt-3 space-y-2">
                  {calendarSelectedYmd && selectedDayRows.length === 0 ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                      {t('addFarmer.calendarDayAvailable')}
                    </div>
                  ) : calendarSelectedYmd && selectedDayRows.length > 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      <p className="font-medium">{t('addFarmer.calendarDayBooked')}</p>
                      <label className="mt-2 flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={calendarAllowBooked}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setCalendarAllowBooked(on);
                            if (!on) {
                              setCalendarFeasibilityPin('');
                              setPinLookup(null);
                              setPinLookupErr('');
                            }
                          }}
                        />
                        <span>{t('addFarmer.calendarAllowBooked')}</span>
                      </label>
                      {calendarAllowBooked ? (
                        <div className="mt-3">
                          <label className="mb-1 block text-xs font-medium text-amber-950">
                            {t('addFarmer.calendarFeasibilityPinLabel')}
                          </label>
                          <input
                            inputMode="numeric"
                            maxLength={6}
                            value={calendarFeasibilityPin}
                            onChange={(e) => setCalendarFeasibilityPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder={t('addFarmer.calendarFeasibilityPinPlaceholder')}
                            className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                          />
                          {pinLookupLoading ? (
                            <p className="mt-1 text-xs text-amber-900/80">{t('addFarmer.calendarPinLookupLoading')}</p>
                          ) : pinLookupErr ? (
                            <p className="mt-1 text-xs font-medium text-rose-700">{pinLookupErr}</p>
                          ) : pinLookup?.district ? (
                            <p className="mt-1 text-xs text-amber-900/80">
                              {t('addFarmer.calendarPinResolved', {
                                district: pinLookup.centroidDistrict || pinLookup.district,
                                state: pinLookup.state,
                              })}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-amber-900/80">{t('addFarmer.calendarFeasibilityNote')}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {selectedDayRows.map((r) => {
                    const address = `${r.village || ''}${r.mandal_name ? `, ${r.mandal_name}` : ''}${r.district ? `, ${r.district}` : ''}${r.state ? `, ${r.state}` : ''}${r.pin_code ? ` — ${r.pin_code}` : ''}`;
                    const tooltip = `${r.farmer_name || ''}\n${r.purpose_of_visit || ''}\n${address}`.trim();
                    let distanceLine = null;
                    if (calendarAllowBooked && feasibilityPinOk && pinLookup?.centroid && r.district_centroid) {
                      const km = haversineKm(pinLookup.centroid, r.district_centroid);
                      if (Number.isFinite(km) && km < 1e8) {
                        distanceLine = t('addFarmer.calendarFeasibilityDistance', {
                          km: Math.round(km),
                          pin: feasibilityPinDigits,
                          other: String(r.pin_code ?? '').slice(0, 6) || t('geo.dash'),
                        });
                      }
                    }
                    return (
                      <div
                        key={r.request_id}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        title={tooltip}
                      >
                        <div className="font-semibold text-slate-900">{r.farmer_name}</div>
                        <div className="text-xs text-slate-600">
                          {r.purpose_of_visit || t('geo.dash')} · {r.district || t('geo.dash')}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{address || t('geo.dash')}</div>
                        {distanceLine ? <div className="mt-1 text-xs font-medium text-amber-800">{distanceLine}</div> : null}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={
                      !calendarSelectedYmd ||
                      (selectedDayRows.length > 0 && (!calendarAllowBooked || !feasibilityPinOk || !pinLookup?.centroid))
                    }
                    onClick={() => {
                      if (!calendarSelectedYmd) return;
                      onChange(calendarSelectedYmd);
                      setCalendarOpen(false);
                    }}
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('addFarmer.calendarUseDate')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarOpen(false)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('addFarmer.calendarCancel')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
