import { getDistrictCentroid } from '../data/districtCentroids.js';
import { normalizeKey } from './villageData.js';

/** Fallback when a district is not in `districtCentroids.js` (whole-state box). */
const STATE_BBOX = {
  'Andhra Pradesh': { minLat: 12.5, maxLat: 19.2, minLng: 76.8, maxLng: 84.6 },
  Telangana: { minLat: 15.9, maxLat: 19.9, minLng: 77.0, maxLng: 81.4 },
  Karnataka: { minLat: 11.6, maxLat: 18.5, minLng: 74.0, maxLng: 78.6 },
  'Tamil Nadu': { minLat: 8.1, maxLat: 13.5, minLng: 76.2, maxLng: 80.4 },
};

function stableUInt32(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

function roundCoordPair(lat, lng) {
  return {
    lat: Math.round(lat * 1e8) / 1e8,
    lng: Math.round(lng * 1e8) / 1e8,
  };
}

/**
 * Deterministic rough point: district HQ centroid ± small jitter (~±20 km), else state box.
 * Replaced later by pinned GPS in the same DB columns.
 *
 * @param {{ state: string, districtName: string, mandalName: string, village: string, pinCode: string }} p
 * @returns {{ lat: number, lng: number } | null}
 */
export function roughCoordinatesFromValidatedAddress(p) {
  const { state, districtName, mandalName, village, pinCode } = p;
  const key = normalizeKey(
    [state, districtName ?? '', mandalName ?? '', village ?? '', pinCode ?? ''].join('|')
  );
  if (!key) return null;
  const h = stableUInt32(key);
  const u1 = (h & 0xffff) / 0xffff;
  const u2 = ((h >>> 16) & 0xffff) / 0xffff;
  /** ~±19 km latitude; similar scale for longitude in South India */
  const dLat = (u1 - 0.5) * 0.35;
  const dLng = (u2 - 0.5) * 0.35;

  const centroid = getDistrictCentroid(state, districtName ?? '');
  if (centroid) {
    return roundCoordPair(centroid.lat + dLat, centroid.lng + dLng);
  }

  const bbox = STATE_BBOX[state];
  if (!bbox) return null;
  const lat = bbox.minLat + u1 * (bbox.maxLat - bbox.minLat);
  const lng = bbox.minLng + u2 * (bbox.maxLng - bbox.minLng);
  return roundCoordPair(lat, lng);
}

/** DB/driver may return bool, 0/1, or string. */
export function isRowLocationVerified(raw) {
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0 || raw == null || raw === '') return false;
  const s = String(raw).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 't' || s === 'yes';
}

function numCoord(v) {
  if (v == null || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * One stored pair: `farm_latitude` / `farm_longitude`. `location_verified` only tells field-GPS vs approximate.
 * For distance/anchor when DB coords are missing and the row is not verified, returns a rough point from address
 * (ephemeral — not written back to `farm_latitude` / `farm_longitude`).
 */
export function resolveFarmCoordsForDistance(row) {
  const lat = numCoord(row.farm_latitude);
  const lng = numCoord(row.farm_longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  if (isRowLocationVerified(row.location_verified)) {
    return null;
  }
  const pt = roughCoordinatesFromValidatedAddress({
    state: String(row.state ?? ''),
    districtName: String(row.district_name ?? ''),
    mandalName: String(row.mandal_name ?? ''),
    village: String(row.village ?? ''),
    pinCode: String(row.pin_code ?? ''),
  });
  if (!pt || !Number.isFinite(pt.lat) || !Number.isFinite(pt.lng)) return null;
  return { lat: pt.lat, lng: pt.lng };
}

export function isWithinIndiaRoughBounds(lat, lng) {
  return lat >= 6 && lat <= 37 && lng >= 68 && lng <= 98;
}
