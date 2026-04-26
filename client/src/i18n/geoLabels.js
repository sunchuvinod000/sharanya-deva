const GEO_STATE_KEYS = {
  'Andhra Pradesh': 'geoState.andhraPradesh',
  Telangana: 'geoState.telangana',
  Karnataka: 'geoState.karnataka',
  'Tamil Nadu': 'geoState.tamilNadu',
  Unknown: 'geoState.unknown',
};

/** Display label for known Indian state names; keeps API/storage values in English. */
export function translateStateName(state, t) {
  if (state == null || state === '') return state;
  const key = GEO_STATE_KEYS[String(state)];
  return key ? t(key) : state;
}
