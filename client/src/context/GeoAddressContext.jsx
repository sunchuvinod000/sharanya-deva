import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { useI18n } from './I18nContext.jsx';

const GeoAddressContext = createContext(null);

export function GeoAddressProvider({ children }) {
  const { tx } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inflight = useRef(null);

  const loadBootstrap = useCallback(
    async (opts = {}) => {
      const force = opts.refresh === true;
      setLoading(true);
      setError('');
      try {
        const params = force ? { refresh: '1' } : {};
        const { data: payload } = await api.get('/admin/geo/bootstrap', { params });
        setData(payload);
        return payload;
      } catch (e) {
        const raw = e.response?.data?.message;
        setError(raw ? tx(raw) : 'Failed to load geo bootstrap.');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [tx]
  );

  const ensureLoaded = useCallback(async () => {
    if (data) return data;
    if (inflight.current) return inflight.current;
    inflight.current = (async () => {
      try {
        return await loadBootstrap({});
      } finally {
        inflight.current = null;
      }
    })();
    return inflight.current;
  }, [data, loadBootstrap]);

  /** Clears session cache and fetches fresh bootstrap (skips server in-memory TTL). */
  const refreshBootstrap = useCallback(async () => {
    inflight.current = null;
    setData(null);
    setError('');
    return loadBootstrap({ refresh: true });
  }, [loadBootstrap]);

  const getDistricts = useCallback(
    (state) => {
      if (!data || !state) return [];
      return data.districtsByState?.[String(state)] || [];
    },
    [data]
  );

  const getMandals = useCallback(
    (districtId) => {
      if (!data || !districtId) return [];
      return data.mandalsByDistrict?.[String(districtId)] || [];
    },
    [data]
  );

  const getVillages = useCallback(
    (mandalId) => {
      if (!data || !mandalId) return null;
      return data.villagesByMandal?.[String(mandalId)] || null;
    },
    [data]
  );

  const value = useMemo(
    () => ({
      data,
      loading,
      error,
      ensureLoaded,
      refreshBootstrap,
      getDistricts,
      getMandals,
      getVillages,
    }),
    [data, loading, error, ensureLoaded, refreshBootstrap, getDistricts, getMandals, getVillages]
  );

  return <GeoAddressContext.Provider value={value}>{children}</GeoAddressContext.Provider>;
}

export function useGeoAddress() {
  const ctx = useContext(GeoAddressContext);
  if (!ctx) throw new Error('useGeoAddress must be used within GeoAddressProvider');
  return ctx;
}

