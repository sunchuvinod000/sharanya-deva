import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Root of the API package: the `server/` directory (contains `src/`, `data/geo/`, etc.). */
export const SERVER_ROOT = path.resolve(__dirname, '../..');

/**
 * Census-style state geo JSON files live under `server/data/geo/`.
 * Optional: set `GEO_JSON_DIR` to an absolute folder that contains these same filenames.
 */
const STATE_FILES = {
  'Andhra Pradesh': ['andhra-pradesh.json', 'Andhra Pradesh.json'],
  Telangana: ['telangana.json', 'Telangana.json'],
  Karnataka: ['karnataka.json', 'Karnataka.json'],
  'Tamil Nadu': ['tamil-nadu.json', 'Tamil Nadu.json'],
};

/**
 * Census JSON `district` string → row in `districts` table for Andhra Pradesh.
 */
export function jsonDistrictToDbName(state, jsonDistrictLabel) {
  if (state === 'Andhra Pradesh') {
    if (jsonDistrictLabel === 'Y S R' || jsonDistrictLabel === 'Y.S.R. Kadapa') return 'YSR Kadapa';
    if (jsonDistrictLabel === 'Sri Potti Sriramulu Nellore') return 'Nellore';
    if (jsonDistrictLabel === 'Ananthapuramu') return 'Anantapur';
    if (jsonDistrictLabel === 'Ntr') return 'NTR';
    if (jsonDistrictLabel === 'Dr. B.R. Ambedkar Konaseema') return 'Konaseema';
  }
  return jsonDistrictLabel;
}

/**
 * Absolute path to the state geo JSON, or null.
 * Search order: `GEO_JSON_DIR` (if set), then `server/data/geo/`.
 */
export function resolveStateGeoJsonPath(state) {
  const filenames = STATE_FILES[state];
  if (!filenames) return null;

  const dirs = [];
  const override = process.env.GEO_JSON_DIR?.trim();
  if (override) dirs.push(path.resolve(override));
  dirs.push(path.join(SERVER_ROOT, 'data', 'geo'));

  for (const dir of dirs) {
    for (const name of filenames) {
      const abs = path.join(dir, name);
      if (existsSync(abs)) return abs;
    }
  }
  return null;
}

export const STATES_WITH_GEO_JSON = Object.keys(STATE_FILES);
