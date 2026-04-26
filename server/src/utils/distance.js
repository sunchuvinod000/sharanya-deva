function finitePair(lat1, lng1, lat2, lng2) {
  return [lat1, lng1, lat2, lng2].every((x) => typeof x === 'number' && Number.isFinite(x));
}

/**
 * Great-circle distance in km. Non-finite inputs return +Infinity so callers can sort/filter safely.
 */
export function haversine(lat1, lng1, lat2, lng2) {
  if (!finitePair(lat1, lng1, lat2, lng2)) {
    return Number.POSITIVE_INFINITY;
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number.isFinite(dist) ? dist : Number.POSITIVE_INFINITY;
}
