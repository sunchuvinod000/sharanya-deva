function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Local calendar YYYY-MM-DD from a Date (for converting API instants). */
function localYmd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Normalize API DATE / datetime values to `YYYY-MM-DD` for `<input type="date">` and comparisons.
 * Avoids off-by-one when the server sent an ISO string like `2026-05-20T18:30:00.000Z` meaning
 * calendar day 21 May in IST—naive `.slice(0, 10)` would read as the 20th.
 */
export function parseApiDateToYmd(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : localYmd(value);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return localYmd(d);
}
