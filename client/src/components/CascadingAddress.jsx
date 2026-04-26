import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useI18n } from '../context/I18nContext.jsx';
import { translateStateName } from '../i18n/geoLabels.js';

const STATES = ['Andhra Pradesh', 'Telangana', 'Karnataka', 'Tamil Nadu'];

/**
 * villageMode:
 * - 'wait' — mandal not chosen yet
 * - 'loading' — fetching village list
 * - 'select' — directory list
 * - 'manual' — free-text village
 *
 * State / district / mandal / village all come from your seeded database (and local village
 * JSON under `server/data/geo/` via the server). No external geo HTTP APIs.
 */
export default function CascadingAddress({
  state,
  districtId,
  mandalId,
  onStateChange,
  onDistrictChange,
  onMandalChange,
  village = '',
  onVillageChange,
  villageMode = 'wait',
  villageOptions = [],
}) {
  const { t } = useI18n();
  const [districts, setDistricts] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [loadingD, setLoadingD] = useState(false);
  const [loadingM, setLoadingM] = useState(false);

  useEffect(() => {
    if (!state) {
      setDistricts([]);
      return;
    }
    let cancel = false;
    (async () => {
      setLoadingD(true);
      try {
        const { data } = await api.get('/admin/districts', { params: { state } });
        if (!cancel) setDistricts(data);
      } catch {
        if (!cancel) setDistricts([]);
      } finally {
        if (!cancel) setLoadingD(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [state]);

  useEffect(() => {
    if (!districtId) {
      setMandals([]);
      return;
    }
    let cancel = false;
    (async () => {
      setLoadingM(true);
      try {
        const { data } = await api.get('/admin/mandals', { params: { districtId } });
        if (!cancel) setMandals(data);
      } catch {
        if (!cancel) setMandals([]);
      } finally {
        if (!cancel) setLoadingM(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [districtId]);

  /** Drop district if it is not in the list for the current state. */
  useEffect(() => {
    if (!districtId || !districts.length || loadingD) return;
    const ok = districts.some((d) => Number(d.id) === Number(districtId));
    if (!ok) onDistrictChange('');
  }, [districts, districtId, loadingD, onDistrictChange]);

  /** Drop mandal if it is not in the list for the current district. */
  useEffect(() => {
    if (!mandalId || !mandals.length || loadingM) return;
    const ok = mandals.some((m) => Number(m.id) === Number(mandalId));
    if (!ok) onMandalChange('');
  }, [mandals, mandalId, loadingM, onMandalChange]);

  const selectClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-slate-900 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-slate-500';

  const villageWait = villageMode === 'wait';
  const villageLoading = villageMode === 'loading';
  const villageSelect = villageMode === 'select';
  const villageManual = villageMode === 'manual';

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('address.state')}</label>
          <select
            value={state || ''}
            onChange={(e) => onStateChange(e.target.value)}
            className={selectClass}
            required
          >
            <option value="">{t('address.selectState')}</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {translateStateName(s, t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('address.district')}</label>
          <select
            value={String(districtId || '')}
            onChange={(e) => {
              const raw = e.target.value;
              const id = raw ? Number(raw) : '';
              onDistrictChange(Number.isFinite(id) && id > 0 ? id : '');
            }}
            className={selectClass}
            required
            disabled={!state || loadingD}
          >
            <option value="">{loadingD ? t('address.loading') : t('address.selectDistrict')}</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('address.mandal')}</label>
          <select
            value={String(mandalId || '')}
            onChange={(e) => onMandalChange(e.target.value ? Number(e.target.value) : '')}
            className={selectClass}
            required
            disabled={!districtId || loadingM}
          >
            <option value="">{loadingM ? t('address.loading') : t('address.selectMandal')}</option>
            {mandals.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('address.village')}</label>
          {villageSelect && (
            <select
              value={village}
              onChange={(e) => onVillageChange(e.target.value)}
              className={selectClass}
              required
            >
              <option value="">{t('address.selectVillage')}</option>
              {villageOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          )}
          {villageManual && (
            <input
              value={village}
              onChange={(e) => onVillageChange(e.target.value)}
              className={selectClass}
              required
              placeholder={t('address.enterVillage')}
              disabled={!mandalId}
            />
          )}
          {(villageWait || villageLoading) && (
            <select disabled className={selectClass} aria-label={t('address.village')}>
              <option value="">{villageLoading ? t('address.loading') : t('address.selectMandalFirst')}</option>
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
