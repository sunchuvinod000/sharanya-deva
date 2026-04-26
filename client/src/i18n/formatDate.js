/** Format API date strings for display; use Kannada calendar locale when `kn`. */
export function formatDisplayDate(dateStr, locale) {
  if (dateStr == null || dateStr === '') return '';
  const s = String(dateStr).trim();
  const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s);
  if (Number.isNaN(d.getTime())) return s;
  const loc = locale === 'kn' ? 'kn-IN' : 'en-IN';
  return d.toLocaleDateString(loc, { year: 'numeric', month: 'short', day: 'numeric' });
}
