import { getDistrictCentroid, listCentroidDistrictNames } from '../data/districtCentroids.js';
import { normalizeKey } from '../services/villageData.js';

const SUPPORTED_STATES = new Set(['Andhra Pradesh', 'Telangana', 'Karnataka', 'Tamil Nadu']);

// Bounding boxes for deterministic fallback when a district centroid is missing.
const STATE_BBOX = {
  'Andhra Pradesh': { minLat: 12.5, maxLat: 19.2, minLng: 76.8, maxLng: 84.6 },
  Telangana: { minLat: 15.9, maxLat: 19.9, minLng: 77.0, maxLng: 81.4 },
  Karnataka: { minLat: 11.6, maxLat: 18.5, minLng: 74.0, maxLng: 78.6 },
  'Tamil Nadu': { minLat: 8.1, maxLat: 13.5, minLng: 76.2, maxLng: 80.4 },
};

/**
 * Aliases for centroid keys.
 * Keys/values are normalized via `normalizeKey()` at runtime.
 *
 * IMPORTANT: This is limited to the 4 supported states in this app.
 * Add only when we see a real mismatch (India Post spelling, legacy names, etc).
 */
const ALIASES_BY_STATE = {
  'Andhra Pradesh': {
    ananthapur: 'Anantapur',
    cuddapah: 'YSR Kadapa',
    kadapa: 'YSR Kadapa',
    ysr: 'YSR Kadapa',
    ysrkadapa: 'YSR Kadapa',
  },
  Telangana: {
    'ranga reddy': 'Rangareddy',
    rangareddy: 'Rangareddy',
    medchal: 'Rangareddy',
    mahabubnagar: 'Mahabubnagar',
    mahbubnagar: 'Mahabubnagar',
  },
  Karnataka: {
    bangalore: 'Bengaluru Urban',
    bengaluru: 'Bengaluru Urban',
    'bangalore urban': 'Bengaluru Urban',
    'bangalore rural': 'Bengaluru Rural',
    bellary: 'Ballari',
    gulbarga: 'Kalaburagi',
    bijapur: 'Vijayapura',
    shimoga: 'Shivamogga',
    mysore: 'Mysuru',
    tumkur: 'Tumakuru',
    chikmagalur: 'Chikkamagaluru',
    chikballapur: 'Chikkaballapura',
    davangere: 'Davanagere',
    'uttar kannada': 'Uttara Kannada',
  },
  'Tamil Nadu': {
    kanyakumari: 'Kanniyakumari',
    tuticorin: 'Thoothukkudi',
    'the nilgiris': 'The Nilgiris',
    nilgiris: 'The Nilgiris',
    trichy: 'Tiruchirappalli',
    tiruchchirappalli: 'Tiruchirappalli',
    tiruvarur: 'Thiruvarur',
    tiruvallur: 'Thiruvallur',
    tiruvannamalai: 'Tiruvannamalai',
    villupuram: 'Viluppuram',
  },
};

function normalizeDistrictInput(rawDistrict) {
  const s = String(rawDistrict ?? '').trim();
  if (!s) return '';
  // Remove common suffix/prefix noise in external datasets.
  return s
    .replace(/\bdistrict\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyAlias(state, rawDistrict) {
  const cleaned = normalizeDistrictInput(rawDistrict);
  if (!cleaned) return '';
  if (!SUPPORTED_STATES.has(String(state))) return cleaned;
  const aliases = ALIASES_BY_STATE[String(state)] || {};
  const k = normalizeKey(cleaned);
  for (const [aliasRaw, canonical] of Object.entries(aliases)) {
    if (k === normalizeKey(aliasRaw)) return canonical;
  }
  return cleaned;
}

function levenshtein(a, b) {
  const s = String(a);
  const t = String(b);
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

function stableUInt32(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

function fallbackCentroidFromStateBbox(state, districtName) {
  const bbox = STATE_BBOX[String(state)];
  if (!bbox) return null;
  const key = normalizeKey([state, districtName].join('|'));
  if (!key) return null;
  const h = stableUInt32(key);
  const u1 = (h & 0xffff) / 0xffff;
  const u2 = ((h >>> 16) & 0xffff) / 0xffff;
  const lat = bbox.minLat + u1 * (bbox.maxLat - bbox.minLat);
  const lng = bbox.minLng + u2 * (bbox.maxLng - bbox.minLng);
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

function fuzzyCanonicalizeToCentroidDistrict(state, cleanedDistrict) {
  if (!SUPPORTED_STATES.has(String(state))) return cleanedDistrict;
  const candidates = listCentroidDistrictNames(String(state));
  if (!candidates.length) return cleanedDistrict;

  const key = normalizeKey(cleanedDistrict);
  if (!key) return cleanedDistrict;

  // Exact normalized match among candidates (covers most cases without aliases).
  for (const c of candidates) {
    if (normalizeKey(c) === key) return c;
  }

  // Small edit-distance fallback on normalized keys (for spelling variants like Ananthapur/Anantapur).
  let best = null;
  let bestScore = 1e9;
  for (const c of candidates) {
    const ck = normalizeKey(c);
    const d = levenshtein(key, ck);
    if (d < bestScore) {
      bestScore = d;
      best = c;
    }
  }

  // Conservative threshold: allow minor typos but avoid wrong districts.
  // Example: "ananthapur"(10) vs "anantapur"(9) => distance 1.
  const maxAllowed = key.length <= 6 ? 1 : key.length <= 10 ? 2 : 3;
  if (best && bestScore <= maxAllowed) return best;
  return cleanedDistrict;
}

/**
 * Resolve a raw district name to:
 * - a canonical district label (matching `districtCentroids.js` where possible)
 * - a centroid (lat/lng) if available
 */
export function resolveDistrictCentroid(state, rawDistrict) {
  const s = String(state ?? '').trim();
  const afterAlias = applyAlias(s, rawDistrict);
  const canonicalDistrict = fuzzyCanonicalizeToCentroidDistrict(s, afterAlias);
  const centroid = getDistrictCentroid(s, canonicalDistrict);
  const resolved =
    centroid != null
      ? { centroid: { lat: centroid.lat, lng: centroid.lng }, centroidSource: 'district' }
      : {
          centroid: SUPPORTED_STATES.has(s) ? fallbackCentroidFromStateBbox(s, canonicalDistrict) : null,
          centroidSource: SUPPORTED_STATES.has(s) ? 'fallback' : null,
        };
  return {
    state: s,
    rawDistrict: String(rawDistrict ?? ''),
    canonicalDistrict,
    centroid: resolved.centroid,
    centroidSource: resolved.centroidSource,
  };
}

