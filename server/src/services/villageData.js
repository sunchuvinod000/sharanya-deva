import { readFileSync } from 'fs';
import { resolveStateGeoJsonPath, STATES_WITH_GEO_JSON } from '../config/geoSources.js';

/** When our DB / UI name differs from the census JSON label (normalized key = state|districtName). */
const DISTRICT_NAME_TO_JSON_LABEL = {
  'andhra pradesh|nellore': 'Sri Potti Sriramulu Nellore',
  /** LGD geo JSON uses dotted / full official names */
  'andhra pradesh|ysr kadapa': ['Y.S.R. Kadapa', 'Y S R'],
  'andhra pradesh|anantapur': 'Ananthapuramu',
  'andhra pradesh|ntr': 'Ntr',
  'andhra pradesh|konaseema': 'Dr. B.R. Ambedkar Konaseema',
};

const cache = new Map();

export function normalizeKey(s) {
  if (s == null || typeof s !== 'string') return '';
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\./g, '');
}

function loadStateData(state) {
  if (cache.has(state)) return cache.get(state);
  const abs = resolveStateGeoJsonPath(state);
  if (!abs) {
    console.warn('[villageData] No geo JSON for state:', state);
    cache.set(state, null);
    return null;
  }
  const parsed = JSON.parse(readFileSync(abs, 'utf8'));
  if (!parsed?.districts || !Array.isArray(parsed.districts)) {
    cache.set(state, null);
    return null;
  }
  cache.set(state, parsed);
  return parsed;
}

export function statesWithVillageData() {
  return [...STATES_WITH_GEO_JSON];
}

/**
 * Resolve DB/catalog district name to a district block in JSON.
 * @returns {{ district: string, subDistricts: Array }} | null
 */
export function findDistrictEntry(state, dbDistrictName) {
  const data = loadStateData(state);
  if (!data) return null;
  const alias = DISTRICT_NAME_TO_JSON_LABEL[`${normalizeKey(state)}|${normalizeKey(dbDistrictName)}`];
  const targets = new Set();
  if (alias != null) {
    const labels = Array.isArray(alias) ? alias : [alias];
    for (const l of labels) targets.add(normalizeKey(l));
  }

  const dbNorm = normalizeKey(dbDistrictName);
  targets.add(dbNorm);

  for (const d of data.districts) {
    const jsonNorm = normalizeKey(d.district);
    if (targets.has(jsonNorm)) return d;
  }

  for (const d of data.districts) {
    const jsonNorm = normalizeKey(d.district);
    if (jsonNorm.includes(dbNorm) || dbNorm.includes(jsonNorm)) return d;
  }
  return null;
}

function findSubdistrictEntry(districtEntry, mandalNameFromDb) {
  if (!districtEntry?.subDistricts?.length) return null;
  const mNorm = normalizeKey(mandalNameFromDb);
  let sd = districtEntry.subDistricts.find((s) => normalizeKey(s.subDistrict) === mNorm);
  if (sd) return sd;
  sd = districtEntry.subDistricts.find(
    (s) =>
      mNorm.includes(normalizeKey(s.subDistrict)) || normalizeKey(s.subDistrict).includes(mNorm)
  );
  return sd ?? null;
}

/**
 * @returns {string[]} village names, or [] if state/file missing or district/mandal not matched
 */
export function listVillages(state, dbDistrictName, mandalNameFromDb) {
  const dEntry = findDistrictEntry(state, dbDistrictName);
  if (!dEntry) return [];
  const sd = findSubdistrictEntry(dEntry, mandalNameFromDb);
  if (!sd?.villages || !Array.isArray(sd.villages)) return [];
  return [...sd.villages];
}

export function isVillageInDirectory(state, dbDistrictName, mandalNameFromDb, villageName) {
  const list = listVillages(state, dbDistrictName, mandalNameFromDb);
  if (list.length === 0) return true;
  const vNorm = normalizeKey(villageName);
  return list.some((v) => normalizeKey(v) === vNorm);
}
