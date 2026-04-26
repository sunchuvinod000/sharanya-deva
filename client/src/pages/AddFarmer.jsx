import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';
import CascadingAddress from '../components/CascadingAddress.jsx';
import { useI18n } from '../context/I18nContext.jsx';

const phoneRe = /^[6-9]\d{9}$/;
const pinRe = /^\d{6}$/;

export default function AddFarmer() {
  const { t, tx } = useI18n();
  const [fullName, setFullName] = useState('');
  const [purposeOfVisit, setPurposeOfVisit] = useState('');
  const [phone, setPhone] = useState('');
  const [village, setVillage] = useState('');
  const [state, setState] = useState('Andhra Pradesh');
  const [districtId, setDistrictId] = useState('');
  const [mandalId, setMandalId] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [villages, setVillages] = useState([]);
  const [villagesLoading, setVillagesLoading] = useState(false);
  const [villageFromDirectory, setVillageFromDirectory] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  function resetForm() {
    setFullName('');
    setPurposeOfVisit('');
    setPhone('');
    setVillage('');
    setState('Andhra Pradesh');
    setDistrictId('');
    setMandalId('');
    setPinCode('');
    setVillages([]);
    setVillageFromDirectory(false);
  }

  useEffect(() => {
    if (!districtId || !mandalId) {
      setVillages([]);
      setVillage('');
      setVillageFromDirectory(false);
      return;
    }
    let cancel = false;
    (async () => {
      setVillagesLoading(true);
      setVillage('');
      try {
        const { data } = await api.get('/admin/geo/villages', {
          params: { districtId, mandalId },
        });
        if (cancel) return;
        setVillages(data.villages || []);
        setVillageFromDirectory(!!data.hasDirectory);
      } catch {
        if (!cancel) {
          setVillages([]);
          setVillageFromDirectory(false);
        }
      } finally {
        if (!cancel) setVillagesLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [districtId, mandalId]);

  const onStateChange = useCallback((s) => {
    setState(s);
    setDistrictId('');
    setMandalId('');
  }, []);

  const onDistrictChange = useCallback((id) => {
    setDistrictId(id);
    setMandalId('');
  }, []);

  const onMandalChange = useCallback((id) => {
    setMandalId(id);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!phoneRe.test(phone)) {
      setError(t('addFarmer.errPhone'));
      return;
    }
    if (!pinRe.test(pinCode)) {
      setError(t('addFarmer.errPin'));
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/admin/farmers', {
        full_name: fullName,
        purpose_of_visit: purposeOfVisit,
        phone,
        village,
        mandal_id: mandalId,
        district_id: districtId,
        state,
        pin_code: pinCode,
      });
      let msg = t('addFarmer.successBase', { id: data.requestId });
      if (data.geocoded) {
        msg += t('addFarmer.successGeocoded');
        if (data.geocodingDisplayName) {
          msg += ` (${data.geocodingDisplayName})`;
        }
      } else {
        msg += t('addFarmer.successNoCoords');
      }
      setSuccess(msg);
      resetForm();
    } catch (err) {
      const raw = err.response?.data?.message;
      setError(raw ? tx(raw) : t('addFarmer.errRegister'));
    } finally {
      setLoading(false);
    }
  }

  const sortedVillages = [...villages].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

  const villageMode =
    !districtId || !mandalId
      ? 'wait'
      : villagesLoading
        ? 'loading'
        : villageFromDirectory && sortedVillages.length > 0
          ? 'select'
          : 'manual';

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:rounded-2xl sm:p-6 md:p-8">
        <h2 className="mb-4 text-lg font-semibold text-slate-800 sm:mb-6 sm:text-xl">{t('addFarmer.title')}</h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {success && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{success}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('addFarmer.fullName')}</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('addFarmer.purpose')}</label>
              <select
                value={purposeOfVisit}
                onChange={(e) => setPurposeOfVisit(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                required
              >
                <option value="">{t('addFarmer.purposeSelect')}</option>
                <option value="house_opening">{t('addFarmer.purpose.house_opening')}</option>
                <option value="marriage">{t('addFarmer.purpose.marriage')}</option>
                <option value="personal_function">{t('addFarmer.purpose.personal_function')}</option>
                <option value="borewell_point">{t('addFarmer.purpose.borewell_point')}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('addFarmer.phone')}</label>
              <input
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                required
              />
            </div>
          </div>

          <CascadingAddress
            state={state}
            districtId={districtId}
            mandalId={mandalId}
            onStateChange={onStateChange}
            onDistrictChange={onDistrictChange}
            onMandalChange={onMandalChange}
            village={village}
            onVillageChange={setVillage}
            villageMode={villageMode}
            villageOptions={sortedVillages}
          />
          {villageMode === 'manual' && districtId && mandalId && (
            <p className="text-xs text-slate-500">{t('addFarmer.manualVillageHint')}</p>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('addFarmer.pin')}</label>
            <input
              inputMode="numeric"
              maxLength={6}
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-amber-500 px-5 py-2.5 font-medium text-white hover:bg-amber-600 disabled:opacity-60"
          >
            {loading ? t('addFarmer.saving') : t('addFarmer.register')}
          </button>
        </form>
      </div>
    </div>
  );
}
