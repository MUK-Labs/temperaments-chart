/** Pure state and data helpers shared by the interface and its regression tests. */
export const YEAR_MIN = 1500;
export const YEAR_MAX = 1850;
export const DEFAULT_YEAR = 1722;
export const FAMILY_IDS = ['meantone', 'unequal', 'equal', 'extended', 'other'];
export const FAMILY_NAMES = { meantone: 'Meantone', unequal: 'Unequal / circulating', equal: 'Equal / near-equal', extended: 'Extended pitch systems', other: 'Unspecified / context' };
export const DEFAULT_STATE = Object.freeze({ year: DEFAULT_YEAR, window: 25, family: 'all', evidence: 'all', query: '', selection: null });

export function clampYear(value) {
  if (value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(Number(value))) return DEFAULT_YEAR;
  return Math.max(YEAR_MIN, Math.min(YEAR_MAX, Math.round(Number(value))));
}

export function normalizeState(input = {}, atlas) {
  const windowValue = input.window === 'all' ? 'all' : Number(input.window);
  let selection = input.selection;
  if (selection) {
    const list = { event: atlas?.events, person: atlas?.people, place: atlas?.places }[selection.type];
    if (!list?.some(record => record.id === selection.id)) selection = null;
  }
  return {
    year: clampYear(input.year),
    window: [10, 25, 50, 'all'].includes(windowValue) ? windowValue : 25,
    family: FAMILY_IDS.includes(input.family) ? input.family : 'all',
    evidence: ['A', 'B', 'C', 'A+B', 'open'].includes(input.evidence) ? input.evidence : 'all',
    query: String(input.query ?? '').trim().slice(0, 200),
    selection: selection || null
  };
}

export function stateFromSearch(search, atlas) {
  const params = new URLSearchParams(search);
  const selectionType = ['event', 'person', 'place'].find(type => params.has(type));
  return normalizeState({
    year: params.has('year') ? params.get('year') : DEFAULT_YEAR,
    window: params.get('window') ?? 25,
    family: params.get('family'), evidence: params.get('evidence'), query: params.get('q'),
    selection: selectionType ? { type: selectionType, id: params.get(selectionType) } : null
  }, atlas);
}

export function stateToSearch(state) {
  const params = new URLSearchParams({ year: String(state.year), window: String(state.window) });
  if (state.family !== 'all') params.set('family', state.family);
  if (state.evidence !== 'all') params.set('evidence', state.evidence);
  if (state.query) params.set('q', state.query);
  if (state.selection) params.set(state.selection.type, state.selection.id);
  return `?${params.toString()}`;
}

export function yearRange(state) {
  if (state.window === 'all') return [YEAR_MIN, YEAR_MAX];
  return [Math.max(YEAR_MIN, state.year - state.window), Math.min(YEAR_MAX, state.year + state.window)];
}

export function normalizeText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function recordMatches(record, state, additionalText = '') {
  if (state.family !== 'all' && !record.families.includes(state.family)) return false;
  if (state.evidence !== 'all') {
    const evidence = record.evidence;
    if (evidence !== state.evidence && !(evidence === 'A+B' && ['A', 'B'].includes(state.evidence))) return false;
  }
  if (state.query) {
    const text = normalizeText([record.id, record.title, record.name, record.summary, record.dateLabel, record.place, record.period, record.role, record.limitation, ...record.families.map(id => FAMILY_NAMES[id]), additionalText].filter(Boolean).join(' '));
    if (!normalizeText(state.query).split(/\s+/).every(word => text.includes(word))) return false;
  }
  return true;
}

export function filterEvents(atlas, state, { ignoreTime = false, mapping } = {}) {
  const [from, to] = yearRange(state);
  return atlas.events.filter(event => {
    if (!ignoreTime && (event.year < from || event.year > to)) return false;
    const people = event.personIds.map(id => atlas.people.find(person => person.id === id));
    const place = atlas.places.find(place => place.id === event.placeId);
    const models = mapping ? listeningOptions(mapping, 'event', event.id).map(option => `${option.label} ${option.tuning.label}`) : [];
    return recordMatches(event, state, [place?.name, ...models, ...people.flatMap(person => person ? [person.name, person.summary, person.practical] : [])].filter(Boolean).join(' '));
  }).sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
}

export function filterPeople(atlas, state, mapping) {
  return atlas.people.filter(person => {
    const models = mapping ? listeningOptions(mapping, 'person', person.id).map(option => `${option.label} ${option.tuning.label}`).join(' ') : '';
    return recordMatches(person, state, `${person.practical} ${models}`);
  });
}

export function closestEvent(events, year) {
  return [...events].sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year) || a.year - b.year)[0] || null;
}

export function nextEvent(events, year, direction) {
  const sorted = [...events].sort((a, b) => a.year - b.year);
  return direction > 0 ? sorted.find(event => event.year > year) || null : sorted.reverse().find(event => event.year < year) || null;
}

export function groupPlaces(places) {
  const groups = new Map();
  for (const place of places) {
    const key = `${place.lat.toFixed(5)},${place.lon.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, { id: place.id, name: place.name, lat: place.lat, lon: place.lon, placeIds: [], eventIds: [], personIds: [] });
    const group = groups.get(key);
    group.placeIds.push(place.id);
    group.eventIds.push(...place.eventIds);
    group.personIds.push(...place.personIds);
  }
  return [...groups.values()].map(group => ({ ...group, eventIds: [...new Set(group.eventIds)], personIds: [...new Set(group.personIds)] }));
}

export function projectPlace(place, projection) {
  return {
    x: (place.lon - projection.west) * Math.PI / 180 * projection.scale,
    y: (projection.northMercator - Math.log(Math.tan(Math.PI / 4 + place.lat * Math.PI / 360))) * projection.scale
  };
}

export function listeningOptions(mapping, type, id) {
  const key = type === 'event' ? 'events' : type === 'person' ? 'people' : null;
  return (mapping[key]?.[id] || []).map(association => ({ ...association, tuning: mapping.tunings.find(tuning => tuning.id === association.tuningId) })).filter(option => option.tuning);
}

export function safeExternalUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
