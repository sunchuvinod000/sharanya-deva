import pool from '../config/db.js';

export async function findByPhone(phone) {
  const [rows] = await pool.execute('SELECT id FROM farmers WHERE phone = ? LIMIT 1', [phone]);
  return rows[0] ?? null;
}

export async function findByPhoneExcludingId(phone, excludeFarmerId) {
  const [rows] = await pool.execute(
    'SELECT id FROM farmers WHERE phone = ? AND id != ? LIMIT 1',
    [String(phone), excludeFarmerId]
  );
  return rows[0] ?? null;
}

/**
 * @param {number} id
 * @param {{
 *   full_name: string,
 *   purpose_of_visit: string | null,
 *   phone: string,
 *   village: string,
 *   mandal_id: number,
 *   district_id: number,
 *   state: string,
 *   pin_code: string,
 *   district: string,
 *   subdistrict: string,
 *   farm_latitude: number | null,
 *   farm_longitude: number | null,
 *   location_verified: boolean,
 *   address_json: string | null,
 * }} row
 */
export async function updateFarmerDetails(id, row) {
  await pool.execute(
    `UPDATE farmers SET
       full_name = ?, purpose_of_visit = ?, phone = ?, village = ?, mandal_id = ?, district_id = ?,
       state = ?, pin_code = ?, district = ?, subdistrict = ?,
       farm_latitude = ?, farm_longitude = ?, location_verified = ?, address_json = ?
     WHERE id = ?`,
    [
      row.full_name,
      row.purpose_of_visit,
      row.phone,
      row.village,
      row.mandal_id,
      row.district_id,
      row.state,
      row.pin_code,
      row.district,
      row.subdistrict,
      row.farm_latitude,
      row.farm_longitude,
      Boolean(row.location_verified),
      row.address_json,
      id,
    ]
  );
}

export async function createFarmer(data) {
  const {
    full_name,
    phone,
    village,
    mandal_id,
    district_id,
    state,
    pin_code,
  } = data;
  const [locRows] = await pool.execute(
    `SELECT d.name AS district_name, m.name AS mandal_name
     FROM mandals m
     INNER JOIN districts d ON m.district_id = d.id
     WHERE m.id = ? AND d.id = ?
     LIMIT 1`,
    [mandal_id, district_id]
  );
  const loc = locRows[0];
  if (!loc) {
    throw new Error('Mandal does not belong to the selected district.');
  }
  const [result] = await pool.execute(
    `INSERT INTO farmers (
       full_name, phone, village, mandal_id, district_id, state, pin_code,
       district, subdistrict, district_geoname_id,
       farm_latitude, farm_longitude, location_verified, address_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      full_name,
      phone,
      village,
      mandal_id,
      district_id,
      state,
      pin_code,
      loc.district_name,
      loc.mandal_name,
      0,
      null,
      null,
      false,
      null,
    ]
  );
  return result.insertId;
}

export async function findByIdWithLocation(id) {
  const [rows] = await pool.execute(
    `SELECT f.*, d.name AS district_name, m.name AS mandal_name
     FROM farmers f
     JOIN districts d ON f.district_id = d.id
     JOIN mandals m ON f.mandal_id = m.id
     WHERE f.id = ?`,
    [id]
  );
  return rows[0] ?? null;
}

/**
 * Find farmers by last 10 digits of phone (for nearby map anchor). Ordered by id ascending.
 */
export async function findFarmersForNearbyAnchor({ phone }) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) {
    return { error: 'invalid_phone', rows: [] };
  }
  const last10 = digits.slice(-10);
  const sql = `
    SELECT f.id, f.full_name, f.phone, f.village, f.farm_latitude, f.farm_longitude,
           f.location_verified, f.state, f.pin_code,
           d.name AS district_name, m.name AS mandal_name
    FROM farmers f
    INNER JOIN districts d ON f.district_id = d.id
    INNER JOIN mandals m ON f.mandal_id = m.id
    WHERE RIGHT(regexp_replace(f.phone::text, '[^0-9]', '', 'g'), 10) = ?
    ORDER BY f.id ASC
    LIMIT 50
  `;
  const [rows] = await pool.execute(sql, [last10]);
  return { rows };
}

export async function updateLocation(farmerId, lat, lng, addressPayload) {
  const json =
    addressPayload && typeof addressPayload === 'object'
      ? JSON.stringify(addressPayload)
      : null;
  await pool.execute(
    `UPDATE farmers SET farm_latitude = ?, farm_longitude = ?, location_verified = TRUE, address_json = ? WHERE id = ?`,
    [lat, lng, json, farmerId]
  );
}

const PAGE_SIZE = 20;

export async function findAllPaginated({ search, districtId, page, dateField, from, to }) {
  const p = Math.max(1, Number(page) || 1);
  const limit = PAGE_SIZE;
  const offset = (p - 1) * limit;

  const conditions = [];
  const params = [];

  if (search) {
    const term = `%${search}%`;
    conditions.push(
      "(f.full_name ILIKE ? OR f.phone ILIKE ? OR f.village ILIKE ? OR COALESCE(f.purpose_of_visit, '') ILIKE ?)"
    );
    params.push(term, term, term, term);
  }
  if (districtId) {
    conditions.push('f.district_id = ?');
    params.push(districtId);
  }

  const requestDateSub =
    dateField === 'expected_visit_date'
      ? 'expected_visit_date'
      : dateField === 'expected_soil_date'
        ? 'expected_soil_date'
        : dateField === 'expected_approval_date'
          ? 'expected_approval_date'
          : null;
  const df = requestDateSub ?? 'registered_at';
  const fromDate = from ? String(from).slice(0, 10) : '';
  const toDate = to ? String(to).slice(0, 10) : '';
  const hasFrom = /^\d{4}-\d{2}-\d{2}$/.test(fromDate);
  const hasTo = /^\d{4}-\d{2}-\d{2}$/.test(toDate);
  if (hasFrom || hasTo) {
    if (df === 'registered_at') {
      if (hasFrom) {
        conditions.push('(f.created_at)::date >= ?::date');
        params.push(fromDate);
      }
      if (hasTo) {
        conditions.push('(f.created_at)::date <= ?::date');
        params.push(toDate);
      }
    } else {
      const sub = `(SELECT r.${requestDateSub}
                   FROM requests r
                   WHERE r.farmer_id = f.id
                   ORDER BY r.created_at DESC
                   LIMIT 1)`;
      if (hasFrom) {
        conditions.push(`${sub} >= ?`);
        params.push(fromDate);
      }
      if (hasTo) {
        conditions.push(`${sub} <= ?`);
        params.push(toDate);
      }
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) AS total FROM farmers f ${where}`;
  const [countRows] = await pool.execute(countSql, params);
  const total = Number(countRows[0]?.total ?? 0);

  const dataSql = `
    SELECT
      f.id,
      f.full_name,
      f.phone,
      f.village,
      f.purpose_of_visit,
      f.state,
      f.pin_code,
      f.created_at,
      d.name AS district_name,
      m.name AS mandal_name,
      (SELECT r.status FROM requests r WHERE r.farmer_id = f.id ORDER BY r.created_at DESC LIMIT 1) AS status,
      (SELECT r.priority FROM requests r WHERE r.farmer_id = f.id ORDER BY r.created_at DESC LIMIT 1) AS priority,
      (SELECT r.requested_date FROM requests r WHERE r.farmer_id = f.id ORDER BY r.created_at DESC LIMIT 1) AS requested_date,
      (SELECT r.expected_soil_date FROM requests r WHERE r.farmer_id = f.id ORDER BY r.created_at DESC LIMIT 1) AS expected_soil_date,
      (SELECT r.expected_approval_date FROM requests r WHERE r.farmer_id = f.id ORDER BY r.created_at DESC LIMIT 1) AS expected_approval_date,
      (SELECT r.expected_visit_date FROM requests r WHERE r.farmer_id = f.id ORDER BY r.created_at DESC LIMIT 1) AS expected_visit_date
    FROM farmers f
    JOIN districts d ON f.district_id = d.id
    JOIN mandals m ON f.mandal_id = m.id
    ${where}
    ORDER BY d.name ASC, m.name ASC, f.created_at ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [farmers] = await pool.execute(dataSql, params);

  return {
    farmers,
    total,
    page: p,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
