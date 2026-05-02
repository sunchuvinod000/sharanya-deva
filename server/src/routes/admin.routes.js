import { Router } from 'express';
import pool from '../config/db.js';
import { verifyToken } from '../middleware/auth.js';
import { requireAdminForMutations } from '../middleware/requireAdminForMutations.js';
import { parseRouteId, parseValidLatLng } from '../utils/httpParams.js';
import * as farmerModel from '../models/farmer.model.js';
import * as requestModel from '../models/request.model.js';
import * as villageData from '../services/villageData.js';
import {
  roughCoordinatesFromValidatedAddress,
  isWithinIndiaRoughBounds,
  resolveFarmCoordsForDistance,
} from '../services/roughFarmLocation.js';
import { resolveDistrictCentroid } from '../utils/districtResolver.js';

const router = Router();
router.use(verifyToken);
router.use(requireAdminForMutations);

/** Must stay aligned with client `<select>` options in Add Farmer / Request detail. */
const ALLOWED_PURPOSES = new Set(['house_opening', 'marriage', 'personal_function', 'borewell_point']);

function logRouteError(tag, err) {
  console.error(tag, err?.code ?? err?.errno, err?.message ?? err);
}

function parseJsonField(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return null;
}

function parseYmd(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: 'Invalid date format. Use YYYY-MM-DD.' };
  return { value: s };
}

function parseYyyyMm(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(s)) return { error: 'Invalid month format. Use YYYY-MM.' };
  return { value: s };
}

function parsePin6(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, 6);
  if (!/^\d{6}$/.test(digits)) return { error: 'PIN code must be exactly 6 digits.' };
  return { value: digits };
}


/**
 * Unified per-request scheduling.
 * Body: { action, expectedVisitDate?, reason? }
 * Actions: set_expected_soil | set_expected_visit | reschedule | on_hold | resume
 */
async function handleRequestSchedule(id, body) {
  const action = String(body?.action ?? '')
    .trim()
    .toLowerCase();
  if (!action) {
    return { status: 400, json: { message: 'action is required.' } };
  }

  if (action === 'set_expected_soil') {
    const parsed = parseYmd(body?.expectedSoilDate ?? body?.expected_soil_date);
    if (parsed?.error) return { status: 400, json: { message: parsed.error } };
    if (!parsed?.value) return { status: 400, json: { message: 'Expected soil date is required.' } };
    const ok = await requestModel.updateExpectedSoilAndApproval(id, parsed.value);
    if (!ok) return { status: 404, json: { message: 'Request not found.' } };
    return { status: 200, json: { message: 'Expected soil and approval dates updated.' } };
  }

  if (action === 'set_expected_visit') {
    const parsed = parseYmd(body?.expectedVisitDate ?? body?.expected_visit_date);
    if (parsed?.error) return { status: 400, json: { message: parsed.error } };
    if (!parsed?.value) return { status: 400, json: { message: 'Expected visit date is required.' } };
    const ok = await requestModel.updateExpectedVisitDate(id, parsed.value);
    if (!ok) return { status: 404, json: { message: 'Request not found.' } };
    return { status: 200, json: { message: 'Expected visit date updated.' } };
  }

  if (action === 'reschedule') {
    const visitRaw = body?.expectedVisitDate ?? body?.expected_visit_date ?? null;
    const soilRaw = body?.expectedSoilDate ?? body?.expected_soil_date ?? null;
    const visitParsed =
      visitRaw != null && String(visitRaw).trim() !== '' ? parseYmd(visitRaw) : { value: null };
    const soilParsed =
      soilRaw != null && String(soilRaw).trim() !== '' ? parseYmd(soilRaw) : { value: null };
    if (visitParsed?.error) return { status: 400, json: { message: visitParsed.error } };
    if (soilParsed?.error) return { status: 400, json: { message: soilParsed.error } };
    const visit = visitParsed?.value ?? null;
    const soil = soilParsed?.value ?? null;
    if (!visit && !soil) {
      return {
        status: 400,
        json: { message: 'Provide expected visit date and/or expected soil date.' },
      };
    }
    const reason = body?.reason != null ? String(body.reason) : '';
    const ok = await requestModel.rescheduleRequest(id, { visit, soil, reason });
    if (!ok) return { status: 404, json: { message: 'Request not found.' } };
    return { status: 200, json: { message: 'Rescheduled.' } };
  }

  if (action === 'on_hold') {
    const reason = body?.reason != null ? String(body.reason) : '';
    const ok = await requestModel.putOnHold(id, reason);
    if (!ok) return { status: 404, json: { message: 'Request not found.' } };
    return { status: 200, json: { message: 'On hold.' } };
  }

  if (action === 'resume') {
    const rawVisit = body?.expectedVisitDate ?? body?.expected_visit_date ?? null;
    const rawSoil = body?.expectedSoilDate ?? body?.expected_soil_date ?? null;
    const visitParsed = rawVisit ? parseYmd(rawVisit) : { value: null };
    const soilParsed = rawSoil ? parseYmd(rawSoil) : { value: null };
    if (visitParsed?.error) return { status: 400, json: { message: visitParsed.error } };
    if (soilParsed?.error) return { status: 400, json: { message: soilParsed.error } };
    const ok = await requestModel.resumeFromHold(id, {
      visit: visitParsed?.value ?? null,
      soil: soilParsed?.value ?? null,
    });
    if (!ok) {
      return {
        status: 404,
        json: { message: 'Cannot resume: request was not found or is not on hold.' },
      };
    }
    return { status: 200, json: { message: 'Resumed.' } };
  }

  return { status: 400, json: { message: 'Unknown action.' } };
}

/**
 * Global schedule operations (no request id).
 * Body: { action, fromDate?, days? }
 * Actions: shift_forward (alias: shift)
 */
async function handleGlobalSchedule(body) {
  const action = String(body?.action ?? '')
    .trim()
    .toLowerCase();
  const normalized = action === 'shift' ? 'shift_forward' : action;
  if (!normalized) {
    return { status: 400, json: { message: 'action is required.' } };
  }
  if (normalized === 'shift_forward') {
    const fromParsed = parseYmd(body?.fromDate ?? body?.from_date);
    if (fromParsed?.error) return { status: 400, json: { message: fromParsed.error } };
    if (!fromParsed?.value) return { status: 400, json: { message: 'fromDate is required.' } };
    const daysRaw = body?.days ?? 1;
    const days = Math.max(1, Math.trunc(Number(daysRaw) || 1));
    const affected = await requestModel.shiftScheduleForward({ fromDate: fromParsed.value, days });
    return { status: 200, json: { message: 'Schedule shifted.', affected } };
  }
  return { status: 400, json: { message: 'Unknown action.' } };
}

router.get('/stats', async (_req, res) => {
  try {
    const data = await requestModel.getDashboardStats();
    return res.json(data);
  } catch (err) {
    console.error('[GET /admin/stats]', err.message);
    return res.status(500).json({ message: 'Failed to load dashboard statistics.' });
  }
});

/**
 * Fixed-date (non-borewell) visit calendar availability.
 * Query: ?month=YYYY-MM (defaults to current month)
 */
router.get('/visit-calendar', async (req, res) => {
  try {
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const parsed = parseYyyyMm(req.query.month ?? defaultMonth);
    if (parsed?.error) return res.status(400).json({ message: parsed.error });
    const month = parsed?.value ?? defaultMonth;
    const from = `${month}-01`;
    // end of month: JS Date trick (day 0 of next month)
    const [y, m] = month.split('-').map((n) => Number(n));
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${month}-${String(lastDay).padStart(2, '0')}`;
    const rows = await requestModel.getFixedVisitCalendarRows({ from, to });
    const withCentroids = rows.map((r) => {
      const out = resolveDistrictCentroid(String(r.state ?? ''), String(r.district ?? ''));
      const centroid = out.centroid;
      return {
        ...r,
        district_centroid: centroid,
        district_centroid_source: out.centroidSource,
      };
    });
    return res.json({ month, from, to, rows: withCentroids });
  } catch (err) {
    logRouteError('[GET /admin/visit-calendar]', err);
    return res.status(500).json({ message: 'Failed to load visit calendar.' });
  }
});

/** In-memory pin → lookup response (reduces India Post API chatter). Not shared across server instances. */
const pincodeLookupCache = new Map();
const PINCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Pincode lookup (offline client helper for feasibility). Uses India Post API (public).
 * Query: ?pin=123456
 */
router.get('/pincode-lookup', async (req, res) => {
  try {
    const parsed = parsePin6(req.query.pin);
    if (parsed?.error) return res.status(400).json({ message: parsed.error });
    const pin = parsed.value;

    const cached = pincodeLookupCache.get(pin);
    if (cached && Date.now() - cached.at < PINCODE_CACHE_TTL_MS) {
      return res.json(cached.payload);
    }

    const r = await fetch(`https://api.postalpincode.in/pincode/${pin}`, {
      headers: { accept: 'application/json' },
    });
    if (!r.ok) {
      return res.status(502).json({ message: 'Failed to lookup pincode.' });
    }
    const body = await r.json();
    const first = Array.isArray(body) ? body[0] : null;
    const po = first?.PostOffice && Array.isArray(first.PostOffice) ? first.PostOffice[0] : null;
    const district = po?.District ? String(po.District) : '';
    const state = po?.State ? String(po.State) : '';
    if (!district || !state) {
      return res.status(404).json({ message: 'Pincode not found.' });
    }

    const out = resolveDistrictCentroid(state, district);
    const payload = {
      pin,
      state,
      district,
      centroidDistrict: out.canonicalDistrict,
      centroid: out.centroid,
      centroidSource: out.centroidSource,
    };
    pincodeLookupCache.set(pin, { at: Date.now(), payload });
    return res.json(payload);
  } catch (err) {
    logRouteError('[GET /admin/pincode-lookup]', err);
    return res.status(500).json({ message: 'Failed to lookup pincode.' });
  }
});

router.get('/geo/village-states', (_req, res) => {
  return res.json({ states: villageData.statesWithVillageData() });
});

// In-process bootstrap cache for cascading address data.
// This avoids rebuilding a large villages snapshot on every dashboard load.
let geoBootstrapCache = null;
let geoBootstrapCacheAt = 0;
const GEO_BOOTSTRAP_TTL_MS = 30 * 60 * 1000;

router.get('/geo/bootstrap', async (req, res) => {
  try {
    const bypassCache = String(req.query.refresh ?? '') === '1';
    const now = Date.now();
    if (!bypassCache && geoBootstrapCache && now - geoBootstrapCacheAt < GEO_BOOTSTRAP_TTL_MS) {
      return res.json(geoBootstrapCache);
    }

    const [districtRows] = await pool.execute('SELECT id, name, state FROM districts ORDER BY state, name');
    const [mandalRows] = await pool.execute('SELECT id, name, district_id FROM mandals ORDER BY district_id, name');

    const districtsByState = {};
    for (const d of districtRows) {
      const s = String(d.state ?? '');
      if (!districtsByState[s]) districtsByState[s] = [];
      districtsByState[s].push({ id: Number(d.id), name: d.name, state: d.state });
    }

    const mandalsByDistrict = {};
    for (const m of mandalRows) {
      const did = String(m.district_id);
      if (!mandalsByDistrict[did]) mandalsByDistrict[did] = [];
      mandalsByDistrict[did].push({ id: Number(m.id), name: m.name, district_id: Number(m.district_id) });
    }

    // Join once so villages can be derived from local geo JSON.
    const [joinRows] = await pool.execute(
      `SELECT m.id AS mandal_id, m.name AS mandal_name, d.id AS district_id, d.name AS district_name, d.state
       FROM mandals m
       INNER JOIN districts d ON m.district_id = d.id
       ORDER BY d.state, d.name, m.name`
    );
    const villagesByMandal = {};
    for (const r of joinRows) {
      const villages = villageData.listVillages(r.state, r.district_name, r.mandal_name);
      const matchedJsonDistrict = villageData.findDistrictEntry(r.state, r.district_name);
      villagesByMandal[String(r.mandal_id)] = {
        villages,
        hasDirectory: villages.length > 0,
        jsonDistrict: matchedJsonDistrict?.district ?? null,
      };
    }

    const payload = {
      states: villageData.statesWithVillageData(),
      districtsByState,
      mandalsByDistrict,
      villagesByMandal,
      generatedAt: new Date().toISOString(),
    };
    geoBootstrapCache = payload;
    geoBootstrapCacheAt = now;
    return res.json(payload);
  } catch (err) {
    logRouteError('[GET /admin/geo/bootstrap]', err);
    return res.status(500).json({ message: 'Failed to load geo bootstrap.' });
  }
});

router.get('/geo/villages', async (req, res) => {
  try {
    const districtId = req.query.districtId != null ? Number(req.query.districtId) : NaN;
    const mandalId = req.query.mandalId != null ? Number(req.query.mandalId) : NaN;
    if (!districtId || Number.isNaN(districtId) || !mandalId || Number.isNaN(mandalId)) {
      return res.status(400).json({ message: 'districtId and mandalId are required.' });
    }
    const [dRows] = await pool.execute(
      `SELECT d.name AS district_name, d.state, m.name AS mandal_name
       FROM districts d
       INNER JOIN mandals m ON m.district_id = d.id
       WHERE d.id = ? AND m.id = ?
       LIMIT 1`,
      [districtId, mandalId]
    );
    const row = dRows[0];
    if (!row) {
      return res.status(400).json({ message: 'Invalid district or mandal.' });
    }
    const villages = villageData.listVillages(row.state, row.district_name, row.mandal_name);
    const matchedJsonDistrict = villageData.findDistrictEntry(row.state, row.district_name);
    return res.json({
      villages,
      hasDirectory: villages.length > 0,
      jsonDistrict: matchedJsonDistrict?.district ?? null,
    });
  } catch (e) {
    console.error('[GET /admin/geo/villages]', e.message);
    return res.status(500).json({ message: 'Failed to load villages.' });
  }
});

router.post('/farmers', async (req, res) => {
  const {
    full_name,
    purpose_of_visit,
    expectedVisitDate,
    expected_visit_date,
    phone,
    village,
    mandal_id,
    district_id,
    state,
    pin_code,
  } = req.body ?? {};

  if (!full_name || !phone || !village || !mandal_id || !district_id || !state || !pin_code) {
    return res.status(400).json({ message: 'All farmer fields are required.' });
  }

  const purpose = purpose_of_visit != null ? String(purpose_of_visit).trim() : '';
  if (purpose && purpose.length > 50) {
    return res.status(400).json({ message: 'Purpose of visit is too long.' });
  }
  if (purpose && !ALLOWED_PURPOSES.has(purpose)) {
    return res.status(400).json({ message: 'Invalid purpose of visit.' });
  }
  const borewellPurpose = purpose === 'borewell_point';
  if (!borewellPurpose) {
    const parsed = parseYmd(expectedVisitDate ?? expected_visit_date);
    if (parsed?.error) return res.status(400).json({ message: parsed.error });
    if (!parsed?.value) {
      return res.status(400).json({ message: 'Expected visit date is required.' });
    }
  }

  let loc;
  let districtGeonamePlaceholder = 0;
  let farmLatitude = null;
  let farmLongitude = null;
  const addressJsonStr = null;

  try {
    const existing = await farmerModel.findByPhone(String(phone));
    if (existing) {
      return res.status(409).json({ message: 'A farmer with this phone number already exists.' });
    }

    const [mRows] = await pool.execute(
      `SELECT m.id, d.name AS district_name, m.name AS mandal_name
       FROM mandals m
       INNER JOIN districts d ON m.district_id = d.id
       WHERE m.id = ? AND d.id = ?
       LIMIT 1`,
      [mandal_id, district_id]
    );
    loc = mRows[0];
    if (!loc) {
      return res.status(400).json({ message: 'Mandal does not belong to the selected district.' });
    }

    const villageList = villageData.listVillages(state, loc.district_name, loc.mandal_name);
    if (
      villageList.length > 0 &&
      !villageData.isVillageInDirectory(state, loc.district_name, loc.mandal_name, String(village))
    ) {
      return res.status(400).json({
        message:
          'Village must match the official village list for this mandal. Select a village from the dropdown (or fix spelling).',
      });
    }

    const bodyLat = req.body?.farm_latitude ?? req.body?.latitude;
    const bodyLng = req.body?.farm_longitude ?? req.body?.longitude;
    if (bodyLat != null && bodyLng != null) {
      const parsed = parseValidLatLng(bodyLat, bodyLng);
      if (!('error' in parsed) && isWithinIndiaRoughBounds(parsed.lat, parsed.lng)) {
        farmLatitude = Math.round(parsed.lat * 1e8) / 1e8;
        farmLongitude = Math.round(parsed.lng * 1e8) / 1e8;
      }
    }
    if (farmLatitude == null || farmLongitude == null) {
      const rough = roughCoordinatesFromValidatedAddress({
        state: String(state),
        districtName: loc.district_name,
        mandalName: loc.mandal_name,
        village: String(village),
        pinCode: String(pin_code),
      });
      if (rough) {
        farmLatitude = rough.lat;
        farmLongitude = rough.lng;
      }
    }

  } catch (err) {
    console.error('[POST /admin/farmers] pre-transaction', err.message);
    return res.status(500).json({ message: 'Failed to register farmer.' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [ocRows] = await conn.execute(
      `SELECT COUNT(*)::int AS open_count
       FROM requests
       WHERE status NOT IN ('rejected', 'success', 'failure', 'on_hold')`
    );
    const expectedOffsetDays = Math.max(0, Number(ocRows[0]?.open_count) || 0);
    const fixedVisitParsed = !borewellPurpose ? parseYmd(expectedVisitDate ?? expected_visit_date) : null;
    const fixedVisitYmd = fixedVisitParsed?.value ?? null;

    const [insFarmer] = await conn.execute(
      `INSERT INTO farmers (
         full_name, purpose_of_visit, phone, village, mandal_id, district_id, state, pin_code,
         district, subdistrict, district_geoname_id,
         farm_latitude, farm_longitude, location_verified, address_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        full_name,
        purpose || null,
        String(phone),
        village,
        mandal_id,
        district_id,
        state,
        String(pin_code),
        loc.district_name,
        loc.mandal_name,
        districtGeonamePlaceholder,
        farmLatitude,
        farmLongitude,
        false,
        addressJsonStr,
      ]
    );
    const farmerId = insFarmer.insertId;
    const [insReq] = await conn.execute(
      `INSERT INTO requests (
         farmer_id, status, priority,
         expected_soil_date, expected_approval_date, expected_visit_date,
         requested_date, created_at, updated_at
       ) VALUES (
         ?, 'pending', 'normal',
         ${borewellPurpose ? '(CURRENT_DATE + (?::int * INTERVAL \'1 day\'))::date' : 'NULL'},
         ${borewellPurpose ? '(CURRENT_DATE + (?::int * INTERVAL \'1 day\'))::date' : 'NULL'},
         ${borewellPurpose ? '(CURRENT_DATE + (?::int * INTERVAL \'1 day\'))::date' : '?::date'},
         CURRENT_DATE, NOW(), NOW()
       )
       RETURNING id`,
      borewellPurpose
        ? [farmerId, expectedOffsetDays, expectedOffsetDays, expectedOffsetDays]
        : [farmerId, fixedVisitYmd]
    );
    const requestId = insReq.insertId;
    await conn.commit();
    const geocoded = farmLatitude != null && farmLongitude != null;
    return res.status(201).json({
      farmerId,
      requestId,
      message: 'Farmer registered and request created.',
      geocoded,
      ...(geocoded
        ? {
            geocodingDisplayName: `${village}, ${loc.mandal_name}, ${loc.district_name}`,
          }
        : {}),
      expectedVisitDateOffsetDays: expectedOffsetDays,
    });
  } catch (err) {
    if (conn) await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY' || err.code === '23505') {
      return res.status(409).json({ message: 'Duplicate entry.' });
    }
    console.error('[POST /admin/farmers]', err.message);
    return res.status(500).json({ message: 'Failed to register farmer.' });
  } finally {
    if (conn) conn.release();
  }
});

router.get('/farmers', async (req, res) => {
  try {
    const { search, districtId, page, dateField, from, to } = req.query;
    const result = await farmerModel.findAllPaginated({
      search: search ? String(search) : '',
      districtId: districtId ? Number(districtId) : null,
      page: page ? Number(page) : 1,
      dateField: dateField ? String(dateField) : undefined,
      from: from ? String(from) : undefined,
      to: to ? String(to) : undefined,
    });
    return res.json(result);
  } catch (err) {
    console.error('[GET /admin/farmers]', err?.message ?? err);
    return res.status(500).json({ message: 'Failed to list farmers.' });
  }
});

/** Resolve one farmer's farm GPS by phone (nearby map anchor). Uses the first matching row with saved farm GPS. */
router.get('/farmers/anchor-location', async (req, res) => {
  try {
    const phone = req.query.phone ?? req.query.mobile ?? '';

    const result = await farmerModel.findFarmersForNearbyAnchor({ phone });
    if (result.error === 'invalid_phone') {
      return res.status(400).json({ message: 'Enter a valid 10-digit mobile number.' });
    }
    const { rows } = result;
    if (!rows.length) {
      return res.status(404).json({
        message: 'No farmer matches this phone number.',
      });
    }
    const withCoords = rows.filter((f) => resolveFarmCoordsForDistance(f) != null);
    if (!withCoords.length) {
      return res.status(400).json({
        message:
          'That farmer has no usable map position. Pin the farm on their page, or ensure district/mandal/village are set for an approximate point.',
      });
    }
    const f = withCoords[0];
    const resolved = resolveFarmCoordsForDistance(f);
    const coords = parseValidLatLng(resolved.lat, resolved.lng);
    if ('error' in coords) {
      return res.status(400).json({
        message: 'Resolved farmer coordinates are invalid. Check address or pin the farm on their page.',
      });
    }
    if (!isWithinIndiaRoughBounds(coords.lat, coords.lng)) {
      return res.status(400).json({
        message: 'Resolved coordinates are outside the supported service area.',
      });
    }
    return res.json({
      farmerId: f.id,
      fullName: f.full_name,
      phone: f.phone,
      village: f.village,
      districtName: f.district_name,
      mandalName: f.mandal_name,
      latitude: coords.lat,
      longitude: coords.lng,
    });
  } catch (err) {
    console.error('[GET /admin/farmers/anchor-location]', err?.message ?? err);
    return res.status(500).json({ message: 'Failed to resolve farmer location.' });
  }
});

router.get('/farmers/:id', async (req, res) => {
  try {
    const id = parseRouteId(req.params.id);
    if (id == null) return res.status(400).json({ message: 'Invalid id.' });
    const farmer = await farmerModel.findByIdWithLocation(id);
    if (!farmer) return res.status(404).json({ message: 'Farmer not found.' });
    const requests = await requestModel.findByFarmerId(id);
    const { district_name, mandal_name, address_json, ...rest } = farmer;
    return res.json({
      farmer: {
        ...rest,
        mandal_name,
        district_name,
        address_json: parseJsonField(address_json),
      },
      requests,
    });
  } catch (err) {
    console.error('[GET /admin/farmers/:id]', err?.message ?? err);
    return res.status(500).json({ message: 'Failed to load farmer.' });
  }
});

router.put('/farmers/:id', async (req, res) => {
  const id = parseRouteId(req.params.id);
  if (id == null) return res.status(400).json({ message: 'Invalid id.' });

  try {
    const latestReqStatus = await requestModel.getLatestRequestStatusForFarmer(id);
    if (latestReqStatus === 'success') {
      return res.status(403).json({
        message: 'This farmer has a completed request and cannot be updated.',
      });
    }
  } catch (e) {
    console.error('[PUT /admin/farmers/:id] lock check', e?.message ?? e);
    return res.status(500).json({ message: 'Failed to update farmer.' });
  }

  const {
    full_name,
    purpose_of_visit,
    phone,
    village,
    mandal_id,
    district_id,
    state,
    pin_code,
  } = req.body ?? {};

  if (!full_name || !phone || !village || !mandal_id || !district_id || !state || pin_code == null || pin_code === '') {
    return res.status(400).json({ message: 'All farmer fields are required.' });
  }

  const pinStr = String(pin_code);
  if (!/^\d{6}$/.test(pinStr)) {
    return res.status(400).json({ message: 'PIN code must be exactly 6 digits.' });
  }

  const purpose =
    purpose_of_visit != null && String(purpose_of_visit).trim() !== ''
      ? String(purpose_of_visit).trim()
      : null;
  if (purpose && purpose.length > 50) {
    return res.status(400).json({ message: 'Purpose of visit is too long.' });
  }
  if (purpose && !ALLOWED_PURPOSES.has(purpose)) {
    return res.status(400).json({ message: 'Invalid purpose of visit.' });
  }

  try {
    const existingFarmer = await farmerModel.findByIdWithLocation(id);
    if (!existingFarmer) {
      return res.status(404).json({ message: 'Farmer not found.' });
    }

    const dup = await farmerModel.findByPhoneExcludingId(String(phone), id);
    if (dup) {
      return res.status(409).json({ message: 'A farmer with this phone number already exists.' });
    }

    const [putMRows] = await pool.execute(
      `SELECT m.id, d.name AS district_name, m.name AS mandal_name
       FROM mandals m
       INNER JOIN districts d ON m.district_id = d.id
       WHERE m.id = ? AND d.id = ?
       LIMIT 1`,
      [mandal_id, district_id]
    );
    const row = putMRows[0];
    if (!row) {
      return res.status(400).json({ message: 'Mandal does not belong to the selected district.' });
    }

    const villageList = villageData.listVillages(state, row.district_name, row.mandal_name);
    if (
      villageList.length > 0 &&
      !villageData.isVillageInDirectory(state, row.district_name, row.mandal_name, String(village))
    ) {
      return res.status(400).json({
        message:
          'Village must match the official village list for this mandal. Select a village from the dropdown (or fix spelling).',
      });
    }

    const wasVerified = Number(existingFarmer.location_verified) === 1;
    const geoChanged =
      String(state) !== String(existingFarmer.state) ||
      Number(district_id) !== Number(existingFarmer.district_id) ||
      Number(mandal_id) !== Number(existingFarmer.mandal_id) ||
      String(village) !== String(existingFarmer.village) ||
      pinStr !== String(existingFarmer.pin_code);

    let farmLat =
      existingFarmer.farm_latitude != null ? Number(existingFarmer.farm_latitude) : null;
    let farmLng =
      existingFarmer.farm_longitude != null ? Number(existingFarmer.farm_longitude) : null;
    if (farmLat != null && Number.isNaN(farmLat)) farmLat = null;
    if (farmLng != null && Number.isNaN(farmLng)) farmLng = null;

    let locationVerified = wasVerified;
    const existingAddrParsed = parseJsonField(existingFarmer.address_json);
    let addressJsonStr =
      existingAddrParsed != null ? JSON.stringify(existingAddrParsed) : null;

    if (geoChanged && !wasVerified) {
      farmLat = null;
      farmLng = null;
      locationVerified = false;
      addressJsonStr = null;

      const bodyLat = req.body?.farm_latitude ?? req.body?.latitude;
      const bodyLng = req.body?.farm_longitude ?? req.body?.longitude;
      if (bodyLat != null && bodyLng != null) {
        const parsed = parseValidLatLng(bodyLat, bodyLng);
        if (!('error' in parsed) && isWithinIndiaRoughBounds(parsed.lat, parsed.lng)) {
          farmLat = Math.round(parsed.lat * 1e8) / 1e8;
          farmLng = Math.round(parsed.lng * 1e8) / 1e8;
        }
      }
      if (farmLat == null || farmLng == null) {
        const rough = roughCoordinatesFromValidatedAddress({
          state: String(state),
          districtName: row.district_name,
          mandalName: row.mandal_name,
          village: String(village),
          pinCode: pinStr,
        });
        if (rough) {
          farmLat = rough.lat;
          farmLng = rough.lng;
        }
      }
    }

    await farmerModel.updateFarmerDetails(id, {
      full_name: String(full_name).trim(),
      purpose_of_visit: purpose,
      phone: String(phone),
      village: String(village).trim(),
      mandal_id: Number(mandal_id),
      district_id: Number(district_id),
      state: String(state),
      pin_code: pinStr,
      district: row.district_name,
      subdistrict: row.mandal_name,
      farm_latitude: farmLat,
      farm_longitude: farmLng,
      location_verified: locationVerified,
      address_json: addressJsonStr,
    });

    return res.json({ message: 'Farmer updated.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' || err.code === '23505') {
      return res.status(409).json({ message: 'Duplicate entry.' });
    }
    console.error('[PUT /admin/farmers/:id]', err?.message ?? err);
    return res.status(500).json({ message: 'Failed to update farmer.' });
  }
});

router.get('/requests', async (req, res) => {
  try {
    const { status, districtId, priority, page } = req.query;
    const result = await requestModel.findAllPaginated({
      status: status || undefined,
      districtId: districtId ? Number(districtId) : undefined,
      priority: priority || undefined,
      page: page ? Number(page) : 1,
    });
    return res.json(result);
  } catch (err) {
    logRouteError('[GET /admin/requests]', err);
    return res.status(500).json({ message: 'Failed to list requests.' });
  }
});

router.get('/requests/:id', async (req, res) => {
  try {
    const id = parseRouteId(req.params.id);
    if (id == null) return res.status(400).json({ message: 'Invalid id.' });
    const row = await requestModel.findById(id);
    if (!row) return res.status(404).json({ message: 'Request not found.' });
    const {
      full_name,
      phone,
      village,
      state,
      pin_code,
      farm_latitude,
      farm_longitude,
      location_verified,
      address_json,
      farmer_created_at,
      district_name,
      mandal_name,
      ...reqFields
    } = row;
    return res.json({
      request: reqFields,
      farmer: {
        full_name,
        phone,
        village,
        state,
        pin_code,
        farm_latitude,
        farm_longitude,
        location_verified,
        address_json: parseJsonField(address_json),
        created_at: farmer_created_at,
        district_name,
        mandal_name,
      },
    });
  } catch (err) {
    logRouteError('[GET /admin/requests/:id]', err);
    return res.status(500).json({ message: 'Failed to load request.' });
  }
});

router.put('/requests/:id/status', async (req, res) => {
  try {
    const id = parseRouteId(req.params.id);
    if (id == null) return res.status(400).json({ message: 'Invalid id.' });
    const lock = await requestModel.assertRequestNotSuccessForMutation(id);
    if (lock.error === 'not_found') {
      return res.status(404).json({ message: 'Request not found.' });
    }
    if (lock.error === 'success_locked') {
      return res.status(403).json({ message: 'Completed requests cannot be updated.' });
    }
    const { status: newStatus } = req.body ?? {};
    if (!newStatus) {
      return res.status(400).json({ message: 'Status is required.' });
    }
    const result = await requestModel.updateStatus(id, newStatus);
    if (result.error === 'not_found') {
      return res.status(404).json({ message: 'Request not found.' });
    }
    if (result.error === 'invalid_transition') {
      return res.status(400).json({ message: 'Invalid status transition.' });
    }
    return res.json({ message: 'Status updated.' });
  } catch (err) {
    logRouteError('[PUT /admin/requests/:id/status]', err);
    return res.status(500).json({ message: 'Failed to update status.' });
  }
});

router.put('/requests/:id/priority', async (req, res) => {
  try {
    const id = parseRouteId(req.params.id);
    if (id == null) return res.status(400).json({ message: 'Invalid id.' });
    const lock = await requestModel.assertRequestNotSuccessForMutation(id);
    if (lock.error === 'not_found') {
      return res.status(404).json({ message: 'Request not found.' });
    }
    if (lock.error === 'success_locked') {
      return res.status(403).json({ message: 'Completed requests cannot be updated.' });
    }
    const { priority } = req.body ?? {};
    if (priority !== 'normal' && priority !== 'urgent') {
      return res.status(400).json({ message: 'Priority must be normal or urgent.' });
    }
    const ok = await requestModel.updatePriority(id, priority);
    if (!ok) return res.status(404).json({ message: 'Request not found.' });
    return res.json({ message: 'Priority updated.' });
  } catch (err) {
    logRouteError('[PUT /admin/requests/:id/priority]', err);
    return res.status(500).json({ message: 'Failed to update priority.' });
  }
});

router.put('/requests/:id/location', async (req, res) => {
  try {
    const id = parseRouteId(req.params.id);
    if (id == null) return res.status(400).json({ message: 'Invalid id.' });
    const lock = await requestModel.assertRequestNotSuccessForMutation(id);
    if (lock.error === 'not_found') {
      return res.status(404).json({ message: 'Request not found.' });
    }
    if (lock.error === 'success_locked') {
      return res.status(403).json({ message: 'Completed requests cannot be updated.' });
    }
    const lat = req.body?.lat ?? req.body?.latitude;
    const lng = req.body?.lng ?? req.body?.longitude;
    if (lat == null || lng == null) {
      return res.status(400).json({ message: 'Latitude and longitude are required.' });
    }
    const coords = parseValidLatLng(lat, lng);
    if ('error' in coords) {
      return res.status(400).json({ message: coords.error });
    }
    const { lat: numLat, lng: numLng } = coords;
    const [rows] = await pool.execute('SELECT farmer_id FROM requests WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Request not found.' });

    await farmerModel.updateLocation(row.farmer_id, numLat, numLng, null);
    return res.json({
      message: 'Location saved.',
      address: null,
      display_name: null,
    });
  } catch (err) {
    logRouteError('[PUT /admin/requests/:id/location]', err);
    return res.status(500).json({ message: 'Failed to save location.' });
  }
});

/** Reserved for future DB-backed place hints; external geo APIs are not used. */
router.get('/places/nearby', async (req, res) => {
  const coords = parseValidLatLng(req.query.lat, req.query.lng);
  if ('error' in coords) {
    return res.status(400).json({ message: coords.error });
  }
  return res.json({ places: [] });
});

router.put('/requests/:id/notes', async (req, res) => {
  try {
    const id = parseRouteId(req.params.id);
    if (id == null) return res.status(400).json({ message: 'Invalid id.' });
    const lock = await requestModel.assertRequestNotSuccessForMutation(id);
    if (lock.error === 'not_found') {
      return res.status(404).json({ message: 'Request not found.' });
    }
    if (lock.error === 'success_locked') {
      return res.status(403).json({ message: 'Completed requests cannot be updated.' });
    }
    const { notes } = req.body ?? {};
    if (notes === undefined) {
      return res.status(400).json({ message: 'Notes field is required.' });
    }
    const ok = await requestModel.updateNotes(id, notes);
    if (!ok) return res.status(404).json({ message: 'Request not found.' });
    return res.json({ message: 'Notes saved.' });
  } catch (err) {
    logRouteError('[PUT /admin/requests/:id/notes]', err);
    return res.status(500).json({ message: 'Failed to save notes.' });
  }
});

/** Per-request scheduling: body `{ action, expectedVisitDate?, reason? }`. */
router.patch('/requests/:id/schedule', async (req, res) => {
  try {
    const id = parseRouteId(req.params.id);
    if (id == null) return res.status(400).json({ message: 'Invalid id.' });
    const lock = await requestModel.assertRequestNotSuccessForMutation(id);
    if (lock.error === 'not_found') {
      return res.status(404).json({ message: 'Request not found.' });
    }
    if (lock.error === 'success_locked') {
      return res.status(403).json({ message: 'Completed requests cannot be updated.' });
    }
    const out = await handleRequestSchedule(id, req.body ?? {});
    return res.status(out.status).json(out.json);
  } catch (err) {
    logRouteError('[PATCH /admin/requests/:id/schedule]', err);
    return res.status(500).json({ message: 'Failed to update schedule.' });
  }
});

/** Global scheduling: body `{ action, fromDate?, days? }` (e.g. `shift_forward`). */
router.post('/schedule', async (req, res) => {
  try {
    const out = await handleGlobalSchedule(req.body ?? {});
    return res.status(out.status).json(out.json);
  } catch (err) {
    logRouteError('[POST /admin/schedule]', err);
    return res.status(500).json({ message: 'Failed to update schedule.' });
  }
});

router.get('/nearby', async (req, res) => {
  try {
    const center = parseValidLatLng(req.query.lat, req.query.lng);
    if ('error' in center) {
      return res.status(400).json({ message: center.error });
    }
    const { lat, lng } = center;
    if (!isWithinIndiaRoughBounds(lat, lng)) {
      return res.status(400).json({
        message: 'Center coordinates are outside the supported service area.',
      });
    }
    const rawDistrict = req.query.districtId;
    const districtId =
      rawDistrict != null && rawDistrict !== '' && !Number.isNaN(Number(rawDistrict))
        ? Number(rawDistrict)
        : null;
    const rawMandal = req.query.mandalId;
    const mandalId =
      rawMandal != null && rawMandal !== '' && !Number.isNaN(Number(rawMandal))
        ? Number(rawMandal)
        : null;
    const rawRadius = req.query.radiusKm != null ? Number(req.query.radiusKm) : 100;
    const radiusKm =
      Number.isFinite(rawRadius) && rawRadius > 0 && rawRadius <= 500 ? rawRadius : 100;

    const excludeFarmerId = parseRouteId(req.query.excludeFarmerId);

    const rows = await requestModel.getNearbyRows(districtId, mandalId);
    const sorted = requestModel.sortNearbyByDistance(rows, lat, lng);
    let filtered = sorted.filter(
      (r) => r.distance_km != null && Number.isFinite(r.distance_km) && r.distance_km <= radiusKm
    );
    if (excludeFarmerId != null) {
      filtered = filtered.filter((r) => Number(r.farmer_id) !== excludeFarmerId);
    }
    return res.json(filtered);
  } catch (err) {
    logRouteError('[GET /admin/nearby]', err);
    return res.status(500).json({ message: 'Failed to load nearby farmers.' });
  }
});

router.get('/queue', async (req, res) => {
  try {
    const rawDistrict = req.query.districtId;
    const districtId =
      rawDistrict != null && rawDistrict !== '' && !Number.isNaN(Number(rawDistrict))
        ? Number(rawDistrict)
        : null;
    const rawMandal = req.query.mandalId;
    const mandalId =
      rawMandal != null && rawMandal !== '' && !Number.isNaN(Number(rawMandal))
        ? Number(rawMandal)
        : null;
    const rows = await requestModel.getQueueRows(districtId, mandalId);
    return res.json(rows);
  } catch (err) {
    logRouteError('[GET /admin/queue]', err);
    return res.status(500).json({ message: 'Failed to load queue.' });
  }
});

router.get('/districts', async (req, res) => {
  try {
    const state = req.query.state;
    let sql = 'SELECT id, name, state FROM districts';
    const params = [];
    if (state) {
      sql += ' WHERE state = ?';
      params.push(state);
    }
    sql += ' ORDER BY state, name';
    const [rows] = await pool.execute(sql, params);
    return res.json(rows);
  } catch (err) {
    logRouteError('[GET /admin/districts]', err);
    return res.status(500).json({ message: 'Failed to list districts.' });
  }
});

router.get('/mandals', async (req, res) => {
  try {
    const raw = req.query.districtId;
    if (raw == null || raw === '') {
      return res.json([]);
    }
    const districtId = parseRouteId(String(raw));
    if (districtId == null) {
      return res.status(400).json({ message: 'Invalid district id.' });
    }
    const [rows] = await pool.execute(
      'SELECT id, name, district_id FROM mandals WHERE district_id = ? ORDER BY name',
      [districtId]
    );
    return res.json(rows);
  } catch (err) {
    logRouteError('[GET /admin/mandals]', err);
    return res.status(500).json({ message: 'Failed to list mandals.' });
  }
});

export default router;
