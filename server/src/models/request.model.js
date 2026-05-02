import pool from '../config/db.js';
import { resolveFarmCoordsForDistance } from '../services/roughFarmLocation.js';
import { haversine } from '../utils/distance.js';

export const STATUS_DATE_MAP = {
  soil_collected: 'soil_collected_date',
  approved: 'approved_date',
  visited: 'visit_date',
  success: 'completed_date',
  failure: 'completed_date',
};

const TERMINAL = new Set(['rejected', 'success', 'failure']);
const ON_HOLD = 'on_hold';

/** Full borewell queue: soil → temple approval → field visit → outcome. */
function allowedNextStatusesBorewell(current) {
  switch (current) {
    case 'pending':
      return ['soil_collected'];
    case 'soil_collected':
      return ['approved', 'rejected'];
    case 'approved':
      return ['visited'];
    case 'visited':
      return ['success', 'failure'];
    default:
      return [];
  }
}

/**
 * House opening / marriage / etc.: only pending → visited → outcome.
 * Allows jumping to visited from legacy soil/approved rows for the same request.
 */
function allowedNextStatusesSimple(current) {
  switch (current) {
    case 'pending':
      return ['visited', 'rejected'];
    case 'soil_collected':
    case 'approved':
      return ['visited'];
    case 'visited':
      return ['success', 'failure'];
    default:
      return [];
  }
}

export function isBorewellPurpose(purposeOfVisit) {
  return purposeOfVisit != null && String(purposeOfVisit).trim() === 'borewell_point';
}

export function isValidStatusTransition(current, next, purposeOfVisit) {
  if (TERMINAL.has(current)) return false;
  if (next === ON_HOLD) return current !== ON_HOLD;
  if (current === ON_HOLD) return next === 'pending';
  const borewell = isBorewellPurpose(purposeOfVisit);
  const allowed = borewell ? allowedNextStatusesBorewell(current) : allowedNextStatusesSimple(current);
  return allowed.includes(next);
}

export async function createForFarmer(farmerId) {
  const [result] = await pool.execute(
    `INSERT INTO requests (farmer_id, status, priority, requested_date, created_at, updated_at)
     VALUES (?, 'pending', 'normal', CURRENT_DATE, NOW(), NOW())
     RETURNING id`,
    [farmerId]
  );
  return result.insertId;
}

export async function updateExpectedSoilAndApproval(id, soilYmd) {
  const [result] = await pool.execute(
    `UPDATE requests
     SET expected_soil_date = ?,
         expected_approval_date = ?
     WHERE id = ?`,
    [soilYmd, soilYmd, id]
  );
  return result.affectedRows > 0;
}

export async function updateExpectedVisitDate(id, expectedVisitDate) {
  const [result] = await pool.execute(
    `UPDATE requests SET expected_visit_date = ? WHERE id = ?`,
    [expectedVisitDate, id]
  );
  return result.affectedRows > 0;
}

/**
 * @param {object} opts
 * @param {string|null} [opts.visit] YYYY-MM-DD
 * @param {string|null} [opts.soil] YYYY-MM-DD — also sets expected_approval_date to the same day
 * @param {string|null} [opts.reason]
 */
export async function rescheduleRequest(id, { visit = null, soil = null, reason = null } = {}) {
  if (!visit && !soil) return false;
  const parts = ['rescheduled_at = NOW()', 'reschedule_reason = ?'];
  const params = [reason || null];
  if (visit) {
    parts.push('expected_visit_date = ?');
    params.push(visit);
  }
  if (soil) {
    parts.push('expected_soil_date = ?', 'expected_approval_date = ?');
    params.push(soil, soil);
  }
  params.push(id);
  const [result] = await pool.execute(
    `UPDATE requests SET ${parts.join(', ')} WHERE id = ?`,
    params
  );
  return result.affectedRows > 0;
}

export async function putOnHold(id, reason) {
  const [result] = await pool.execute(
    `UPDATE requests
     SET status_before_hold = CASE
           WHEN (status)::text <> 'on_hold' THEN (status)::text
           ELSE status_before_hold
         END,
         status = 'on_hold',
         hold_at = NOW(),
         hold_reason = ?
     WHERE id = ?
       AND status NOT IN ('rejected', 'success', 'failure')`,
    [reason || null, id]
  );
  return result.affectedRows > 0;
}

/**
 * Restore pipeline after on_hold. One UPDATE reads `status_before_hold` from the row (no separate SELECT),
 * maps it to a safe enum in SQL, and uses `COALESCE(CAST(? AS date), …)` for optional dates (42P18-safe).
 */
export async function resumeFromHold(id, { visit = null, soil = null } = {}) {
  const [result] = await pool.execute(
    `UPDATE requests
     SET status = (
           CASE LOWER(TRIM(COALESCE(status_before_hold::text, '')))
             WHEN 'soil_collected' THEN 'soil_collected'::"RequestStatus"
             WHEN 'approved' THEN 'approved'::"RequestStatus"
             WHEN 'rejected' THEN 'rejected'::"RequestStatus"
             WHEN 'visited' THEN 'visited'::"RequestStatus"
             WHEN 'pending' THEN 'pending'::"RequestStatus"
             ELSE 'pending'::"RequestStatus"
           END
         ),
         status_before_hold = NULL,
         hold_at = NULL,
         hold_reason = NULL,
         expected_visit_date = COALESCE(CAST(? AS date), expected_visit_date),
         expected_soil_date = COALESCE(CAST(? AS date), expected_soil_date),
         expected_approval_date = COALESCE(CAST(? AS date), expected_approval_date)
     WHERE id = ? AND status = 'on_hold'::"RequestStatus"`,
    [visit, soil, soil, id]
  );
  return result.affectedRows > 0;
}

/**
 * Shift planned dates (soil, approval, field visit) forward by `days` where each date is set and >= fromDate.
 * Returns affectedRows count.
 */
export async function shiftScheduleForward({ fromDate, days = 1 }) {
  const d = Number(days);
  const delta = Number.isFinite(d) ? Math.trunc(d) : 1;
  const shiftDays = delta === 0 ? 1 : Math.abs(delta);
  const [result] = await pool.execute(
    `UPDATE requests
     SET expected_soil_date = CASE
           WHEN expected_soil_date IS NOT NULL AND expected_soil_date >= ?::date
           THEN (expected_soil_date + (?::int * INTERVAL '1 day'))::date
           ELSE expected_soil_date END,
         expected_approval_date = CASE
           WHEN expected_approval_date IS NOT NULL AND expected_approval_date >= ?::date
           THEN (expected_approval_date + (?::int * INTERVAL '1 day'))::date
           ELSE expected_approval_date END,
         expected_visit_date = CASE
           WHEN expected_visit_date IS NOT NULL AND expected_visit_date >= ?::date
           THEN (expected_visit_date + (?::int * INTERVAL '1 day'))::date
           ELSE expected_visit_date END
     WHERE status NOT IN ('rejected', 'success', 'failure', 'on_hold')
       AND (
         (expected_soil_date IS NOT NULL AND expected_soil_date >= ?::date)
         OR (expected_approval_date IS NOT NULL AND expected_approval_date >= ?::date)
         OR (expected_visit_date IS NOT NULL AND expected_visit_date >= ?::date)
       )`,
    [
      fromDate,
      shiftDays,
      fromDate,
      shiftDays,
      fromDate,
      shiftDays,
      fromDate,
      fromDate,
      fromDate,
    ]
  );
  return Number(result.affectedRows || 0);
}

export async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT r.*,
            f.full_name, f.phone, f.village, f.state, f.pin_code, f.purpose_of_visit,
            f.farm_latitude, f.farm_longitude, f.location_verified, f.address_json, f.created_at AS farmer_created_at,
            d.name AS district_name, m.name AS mandal_name
     FROM requests r
     JOIN farmers f ON r.farmer_id = f.id
     JOIN districts d ON f.district_id = d.id
     JOIN mandals m ON f.mandal_id = m.id
     WHERE r.id = ?`,
    [id]
  );
  return rows[0] ?? null;
}

const REQUEST_ROW_SELECT_FULL = `SELECT id, farmer_id, status, status_before_hold, priority, notes, requested_date,
            expected_soil_date, expected_approval_date, expected_visit_date,
            hold_reason, hold_at, rescheduled_at, reschedule_reason,
            soil_collected_date, approved_date, visit_date, completed_date,
            created_at, updated_at
     FROM requests WHERE farmer_id = ? ORDER BY created_at DESC`;

const REQUEST_ROW_SELECT_LEGACY = `SELECT id, farmer_id, status, priority, notes, requested_date,
            expected_soil_date, expected_approval_date, expected_visit_date,
            hold_reason, hold_at, rescheduled_at, reschedule_reason,
            soil_collected_date, approved_date, visit_date, completed_date,
            created_at, updated_at
     FROM requests WHERE farmer_id = ? ORDER BY created_at DESC`;

function isMissingStatusBeforeHoldColumn(err) {
  const msg = String(err?.message || '');
  const code = String(err?.code || '');
  return (code === '42703' || code === 'ER_BAD_FIELD_ERROR') && msg.includes('status_before_hold');
}

export async function findByFarmerId(farmerId) {
  try {
    const [rows] = await pool.execute(REQUEST_ROW_SELECT_FULL, [farmerId]);
    return rows;
  } catch (e) {
    if (isMissingStatusBeforeHoldColumn(e)) {
      const [rows] = await pool.execute(REQUEST_ROW_SELECT_LEGACY, [farmerId]);
      return rows.map((r) => ({ ...r, status_before_hold: null }));
    }
    throw e;
  }
}

export async function updateStatus(id, newStatus) {
  const full = await findById(id);
  if (!full) return { ok: false, error: 'not_found' };
  const row = { status: full.status };
  if (!isValidStatusTransition(row.status, newStatus, full.purpose_of_visit)) {
    return { ok: false, error: 'invalid_transition' };
  }

  const dateCol = STATUS_DATE_MAP[newStatus];
  if (newStatus === 'on_hold') {
    await pool.execute(
      `UPDATE requests
       SET status_before_hold = (status)::text, status = ?, hold_at = NOW()
       WHERE id = ?`,
      [newStatus, id]
    );
  } else if (row.status === 'on_hold' && newStatus === 'pending') {
    await pool.execute(
      `UPDATE requests
       SET status = (COALESCE(status_before_hold, 'pending'))::"RequestStatus",
           status_before_hold = NULL,
           hold_at = NULL,
           hold_reason = NULL
       WHERE id = ?`,
      [id]
    );
  } else if (dateCol) {
    await pool.execute(
      `UPDATE requests SET status = ?, ${dateCol} = CURRENT_DATE::date WHERE id = ?`,
      [newStatus, id]
    );
  } else {
    await pool.execute(`UPDATE requests SET status = ? WHERE id = ?`, [newStatus, id]);
  }
  return { ok: true };
}

export async function updatePriority(id, priority) {
  const [result] = await pool.execute('UPDATE requests SET priority = ? WHERE id = ?', [
    priority,
    id,
  ]);
  return result.affectedRows > 0;
}

export async function updateNotes(id, notes) {
  const [result] = await pool.execute('UPDATE requests SET notes = ? WHERE id = ?', [notes, id]);
  return result.affectedRows > 0;
}

/** Latest request row for a farmer (same ordering as farmer detail). */
export async function getLatestRequestStatusForFarmer(farmerId) {
  const [rows] = await pool.execute(
    `SELECT status FROM requests WHERE farmer_id = ? ORDER BY created_at DESC LIMIT 1`,
    [farmerId]
  );
  return rows[0]?.status ?? null;
}

/** Mutations are blocked when this request is already marked success. */
export async function assertRequestNotSuccessForMutation(requestId) {
  const [rows] = await pool.execute(
    'SELECT (status)::text AS status_text FROM requests WHERE id = ? LIMIT 1',
    [requestId]
  );
  if (!rows?.length) return { error: 'not_found' };
  const t = rows[0].status_text == null ? '' : String(rows[0].status_text).trim();
  if (t === 'success') return { error: 'success_locked' };
  return { ok: true };
}

const REQUEST_PAGE_SIZE = 20;

export async function findAllPaginated({ status, districtId, priority, page }) {
  const p = Math.max(1, Number(page) || 1);
  const limit = REQUEST_PAGE_SIZE;
  const offset = (p - 1) * limit;

  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('r.status = ?');
    params.push(status);
  }
  if (districtId) {
    conditions.push('f.district_id = ?');
    params.push(districtId);
  }
  if (priority) {
    conditions.push('r.priority = ?');
    params.push(priority);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `
    SELECT COUNT(*) AS total
    FROM requests r
    JOIN farmers f ON r.farmer_id = f.id
    ${where}
  `;
  const [countRows] = await pool.execute(countSql, params);
  const total = Number(countRows[0]?.total ?? 0);

  const dataSql = `
    SELECT r.*,
           f.full_name AS farmer_name,
           f.phone,
           f.village,
           d.name AS district_name,
           m.name AS mandal_name
    FROM requests r
    JOIN farmers f ON r.farmer_id = f.id
    JOIN districts d ON f.district_id = d.id
    JOIN mandals m ON f.mandal_id = m.id
    ${where}
    ORDER BY r.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [requests] = await pool.execute(dataSql, params);

  return { requests, total, page: p, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/**
 * Farmers linked to a request for the nearby map.
 * Omits completed (`success`) only. Includes rows with no saved GPS when address is complete:
 * `/admin/nearby` applies the same address→rough point logic as unverified “approximate” farmers.
 * districtId / mandalId omitted → all matching farmers (radius applied on route).
 */
export async function getNearbyRows(districtId, mandalId) {
  const params = [];
  let extra = '';
  if (districtId != null && districtId !== '' && Number.isFinite(Number(districtId)) && Number(districtId) > 0) {
    extra += ' AND f.district_id = ?';
    params.push(Number(districtId));
  }
  if (mandalId != null && mandalId !== '' && Number.isFinite(Number(mandalId)) && Number(mandalId) > 0) {
    extra += ' AND f.mandal_id = ?';
    params.push(Number(mandalId));
  }
  const [rows] = await pool.execute(
    `SELECT r.id AS request_id,
            f.id AS farmer_id,
            f.full_name AS farmer_name,
            f.phone,
            f.village,
            f.purpose_of_visit,
            f.district_id,
            f.mandal_id,
            d.name AS district_name,
            m.name AS mandal_name,
            r.status,
            r.priority,
            r.requested_date,
            r.expected_soil_date,
            r.expected_approval_date,
            r.expected_visit_date,
            f.created_at AS farmer_created_at,
            f.farm_latitude,
            f.farm_longitude,
            f.location_verified,
            f.state,
            f.pin_code
     FROM requests r
     JOIN farmers f ON r.farmer_id = f.id
     JOIN districts d ON f.district_id = d.id
     JOIN mandals m ON f.mandal_id = m.id
     WHERE r.status <> 'success'
       AND (
         (f.farm_latitude IS NOT NULL AND f.farm_longitude IS NOT NULL)
         OR (
           f.location_verified IS DISTINCT FROM TRUE
           AND TRIM(COALESCE(f.state, '')) <> ''
           AND TRIM(COALESCE(f.village, '')) <> ''
           AND TRIM(COALESCE(d.name, '')) <> ''
           AND TRIM(COALESCE(m.name, '')) <> ''
         )
       )
       ${extra}`,
    params
  );
  return rows;
}

export function sortNearbyByDistance(rows, lat, lng) {
  const cLat = Number(lat);
  const cLng = Number(lng);
  const centerOk = Number.isFinite(cLat) && Number.isFinite(cLng);
  const sortKey = (km) => (km == null || !Number.isFinite(km) ? 1e12 : km);
  return rows
    .map((r) => {
      const pt = resolveFarmCoordsForDistance(r);
      const d = centerOk && pt != null ? haversine(cLat, cLng, pt.lat, pt.lng) : null;
      const distance_km =
        d != null && Number.isFinite(d) && d < 1e9 ? Number(d.toFixed(2)) : null;
      return { ...r, distance_km };
    })
    .sort((a, b) => sortKey(a.distance_km) - sortKey(b.distance_km));
}

/** Pending requests. Omit districtId (and mandalId) to list all districts. */
export async function getQueueRows(districtId, mandalId) {
  const conditions = ['r.status = ?'];
  const params = ['pending'];
  if (districtId != null && districtId !== '' && Number.isFinite(Number(districtId)) && Number(districtId) > 0) {
    conditions.push('f.district_id = ?');
    params.push(Number(districtId));
  }
  if (mandalId != null && mandalId !== '' && Number.isFinite(Number(mandalId)) && Number(mandalId) > 0) {
    conditions.push('f.mandal_id = ?');
    params.push(Number(mandalId));
  }
  const where = conditions.join(' AND ');
  const [rows] = await pool.execute(
    `SELECT r.id AS request_id,
            f.id AS farmer_id,
            f.full_name AS farmer_name,
            f.phone,
            f.village,
            d.name AS district_name,
            m.name AS mandal_name,
            r.priority,
            r.requested_date,
            r.expected_soil_date,
            r.expected_approval_date,
            r.expected_visit_date
     FROM requests r
     JOIN farmers f ON r.farmer_id = f.id
     JOIN districts d ON f.district_id = d.id
     JOIN mandals m ON f.mandal_id = m.id
     WHERE ${where}
     ORDER BY
       d.name ASC,
       m.name ASC,
       CASE r.priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
       r.requested_date ASC,
       r.id ASC`,
    params
  );
  return rows;
}

export async function getDashboardStats() {
  const [statusRows] = await pool.execute(
    'SELECT status, COUNT(*) AS c FROM requests GROUP BY status'
  );
  const statusCounts = {
    pending: 0,
    soil_collected: 0,
    approved: 0,
    rejected: 0,
    visited: 0,
    success: 0,
    failure: 0,
    on_hold: 0,
  };
  for (const row of statusRows) {
    statusCounts[row.status] = Number(row.c);
  }

  const [stateRows] = await pool.execute(`
    SELECT COALESCE(NULLIF(TRIM(f.state), ''), 'Unknown') AS state, COUNT(r.id) AS count
    FROM requests r
    JOIN farmers f ON r.farmer_id = f.id
    GROUP BY COALESCE(NULLIF(TRIM(f.state), ''), 'Unknown')
    ORDER BY count DESC
  `);

  /** Non–bore-well open pipeline: earliest planned field visit first (fixed-date purposes only). */
  const [nextToServe] = await pool.execute(`
    SELECT r.id,
           f.full_name AS farmer_name,
           f.phone,
           f.village,
           f.purpose_of_visit,
           d.name AS district,
           m.name AS mandal_name,
           r.status,
           r.priority,
           r.requested_date,
           r.expected_soil_date,
           r.expected_approval_date,
           r.expected_visit_date,
           f.id AS farmer_id
    FROM requests r
    JOIN farmers f ON r.farmer_id = f.id
    JOIN districts d ON f.district_id = d.id
    JOIN mandals m ON f.mandal_id = m.id
    WHERE r.status NOT IN ('rejected', 'success', 'failure', 'on_hold')
      AND COALESCE(TRIM(f.purpose_of_visit), '') <> ''
      AND TRIM(f.purpose_of_visit) <> 'borewell_point'
      AND r.expected_visit_date IS NOT NULL
    ORDER BY
      r.expected_visit_date ASC,
      r.id ASC
    LIMIT 15
  `);

  const [tc] = await pool.execute('SELECT COUNT(*)::bigint AS c FROM farmers');
  const totalFarmers = Number(tc[0]?.c ?? 0);
  const [mc] = await pool.execute(`
    SELECT COUNT(*)::bigint AS c FROM requests
    WHERE status IN ('success', 'failure')
      AND completed_date >= date_trunc('month', CURRENT_DATE)::date
  `);
  const monthlyCompleted = Number(mc[0]?.c ?? 0);

  return {
    statusCounts,
    stateCounts: stateRows.map((row) => ({ state: row.state, count: Number(row.count) })),
    nextToServe,
    totalFarmers,
    monthlyCompleted,
  };
}

/**
 * Calendar rows for fixed-date purposes (non-borewell) so the UI can show availability.
 * Returns open pipeline + on-hold (excludes rejected/success/failure). Includes overdue.
 *
 * @param {{ from: string, to: string }} opts YYYY-MM-DD (inclusive)
 */
export async function getFixedVisitCalendarRows({ from, to }) {
  const [rows] = await pool.execute(
    `
    SELECT r.id AS request_id,
           r.status,
           r.priority,
           r.expected_visit_date,
           f.id AS farmer_id,
           f.full_name AS farmer_name,
           f.phone,
           f.purpose_of_visit,
           f.village,
           f.state,
           f.pin_code,
           d.name AS district,
           m.name AS mandal_name
    FROM requests r
    JOIN farmers f ON r.farmer_id = f.id
    JOIN districts d ON f.district_id = d.id
    JOIN mandals m ON f.mandal_id = m.id
    WHERE r.status NOT IN ('rejected', 'success', 'failure')
      AND COALESCE(TRIM(f.purpose_of_visit), '') <> ''
      AND TRIM(f.purpose_of_visit) <> 'borewell_point'
      AND r.expected_visit_date IS NOT NULL
      AND r.expected_visit_date >= ?::date
      AND r.expected_visit_date <= ?::date
    ORDER BY r.expected_visit_date ASC, d.name ASC, m.name ASC, r.id ASC
    `,
    [from, to]
  );
  return rows;
}
