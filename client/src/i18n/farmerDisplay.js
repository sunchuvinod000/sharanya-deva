import { formatDisplayDate } from './formatDate.js';

/** Planned visit column: borewell shows em dash; otherwise formatted date or em dash if missing. */
export function rowExpectedVisitDisplay(farmer, locale) {
  if (String(farmer.purpose_of_visit || '').trim() === 'borewell_point') return '--';
  if (!farmer.expected_visit_date) return '--';
  return formatDisplayDate(farmer.expected_visit_date, locale);
}

/** Single-line village · mandal · district for tables and cards. */
export function farmerLocationLine(f) {
  const parts = [f.village, f.mandal_name, f.district_name].filter(
    (p) => p != null && String(p).trim() !== ''
  );
  return parts.length ? parts.join(' · ') : '';
}

/** Translate stored purpose slug; falls back to raw value. */
export function purposeOfVisitLabel(purpose, t) {
  if (purpose == null || String(purpose).trim() === '') return '';
  const key = `addFarmer.purpose.${purpose}`;
  const out = t(key);
  return out !== key ? out : String(purpose);
}
