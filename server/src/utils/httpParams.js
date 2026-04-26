/** @param {string|undefined} raw */
export function parseRouteId(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * @param {unknown} latRaw
 * @param {unknown} lngRaw
 * @returns {{ lat: number, lng: number } | { error: string }}
 */
export function parseValidLatLng(latRaw, lngRaw) {
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return { error: 'Invalid coordinates.' };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: 'Coordinates out of valid range.' };
  }
  return { lat, lng };
}
