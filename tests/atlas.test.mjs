import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FAMILY_IDS, YEAR_MIN, YEAR_MAX, groupPlaces, projectPlace, listeningOptions } from '../core.js';

const readJson = relative => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
const atlas = readJson('../data/atlas.json');
const mappings = readJson('../data/tunings.json');
const originalEvents = readJson('../data/source/zeitpunkte.json').events;
const originalPlaces = readJson('../data/source/belegorte.json').locations;
const originalPeople = readJson('../data/source/komponisten.json');
const originalSources = readJson('../data/source/quellen.json');
const models = readJson('../data/source/modelle.json');
const projection = readJson('../assets/map-projection.json');
const ids = records => records.map(record => record.id).sort();
const byId = records => new Map(records.map(record => [record.id, record]));

test('the adaptation retains the complete supplied corpus and unique stable IDs', () => {
  const expected = [
    [atlas.events, originalEvents, 17],
    [atlas.places, originalPlaces, 13],
    [atlas.people, originalPeople, 26],
    [atlas.sources, originalSources, 34],
  ];
  for (const [adapted, original, count] of expected) {
    assert.equal(adapted.length, count);
    assert.equal(new Set(ids(adapted)).size, adapted.length, 'duplicate IDs would make selection ambiguous');
    assert.deepEqual(ids(adapted), ids(original));
  }
  assert.match(atlas.meta.sourceCommit, /^[a-f0-9]{40}$/);
  assert.ok(atlas.meta.sourceUrl.includes(atlas.meta.sourceCommit));
  assert.equal(mappings.sourceCommit, atlas.meta.sourceCommit);
  assert.equal(atlas.meta.researchDate, '2026-10-21');
});

test('all event dates, approximation flags, evidence kinds and citations survive translation', () => {
  const source = byId(originalEvents);
  for (const event of atlas.events) {
    const original = source.get(event.id);
    assert.equal(event.year, original.year, event.id);
    assert.equal(event.approximate, original.approximate_date, event.id);
    assert.equal(event.evidence, original.evidence, event.id);
    assert.deepEqual(event.sourceIds, original.sources, event.id);
    assert.equal(event.placeId, original.location_id, event.id);
    assert.ok(Number.isInteger(event.year) && event.year >= YEAR_MIN && event.year <= YEAR_MAX);
  }
  assert.deepEqual(atlas.events.filter(event => event.approximate).map(event => event.id), ['sweelinck1600', 'frescobaldi1640']);
  assert.equal(atlas.meta.yearMin, YEAR_MIN);
  assert.equal(atlas.meta.yearMax, YEAR_MAX);
});

test('person and source records keep their citations and limits of verification', () => {
  const people = byId(originalPeople);
  const sources = byId(originalSources);
  for (const person of atlas.people) {
    assert.deepEqual(person.sourceIds, people.get(person.id).sources, person.id);
    assert.equal(person.evidence, people.get(person.id).evidence === 'offen' ? 'open' : people.get(person.id).evidence);
    for (const key of ['summary', 'limitation', 'verification', 'locator']) assert.ok(person[key]?.trim(), `${person.id} missing ${key}`);
    // Context prose must not be converted into invented periods of personal use.
    for (const key of ['startYear', 'endYear', 'yearStart', 'yearEnd']) assert.equal(person[key], undefined);
  }
  for (const source of atlas.sources) {
    assert.equal(source.url, sources.get(source.id).url, source.id);
    assert.equal(source.title, sources.get(source.id).title, source.id);
    assert.ok(source.verification?.trim(), source.id);
  }
});

test('navigation references resolve and reciprocal event/place/person connections agree', () => {
  const places = byId(atlas.places), events = byId(atlas.events), people = byId(atlas.people), sources = byId(atlas.sources);
  for (const record of [...atlas.events, ...atlas.places, ...atlas.people]) {
    for (const id of record.sourceIds) assert.ok(sources.has(id), `${record.id}: missing source ${id}`);
  }
  for (const record of [...atlas.events, ...atlas.people]) {
    assert.ok(record.families.length > 0, record.id);
    for (const family of record.families) assert.ok(FAMILY_IDS.includes(family), `${record.id}: unknown family`);
    assert.ok(Object.hasOwn(atlas.meta.evidenceLabels, record.evidence), `${record.id}: unknown evidence`);
  }
  for (const event of atlas.events) {
    if (event.placeId !== null) assert.ok(places.get(event.placeId)?.eventIds.includes(event.id), event.id);
    for (const personId of event.personIds) assert.ok(people.get(personId)?.eventIds.includes(event.id), event.id);
  }
  for (const person of atlas.people) {
    for (const eventId of person.eventIds) assert.ok(events.get(eventId)?.personIds.includes(person.id), person.id);
    for (const placeId of person.placeIds) assert.ok(places.get(placeId)?.personIds.includes(person.id), person.id);
  }
  for (const place of atlas.places) {
    for (const eventId of place.eventIds) assert.equal(events.get(eventId)?.placeId, place.id);
    for (const personId of place.personIds) assert.ok(people.get(personId)?.placeIds.includes(place.id), place.id);
  }
});

test('map grouping preserves both Rome histories and does not invent a single 1691 location', () => {
  const source = byId(originalPlaces);
  for (const place of atlas.places) {
    assert.equal(place.lat, source.get(place.id).latitude);
    assert.equal(place.lon, source.get(place.id).longitude);
    const point = projectPlace(place, projection);
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    assert.ok(point.x >= 0 && point.x <= projection.width, `${place.name} outside map horizontally`);
    assert.ok(point.y >= 0 && point.y <= projection.height, `${place.name} outside map vertically`);
  }
  const groups = groupPlaces(atlas.places);
  assert.equal(groups.length, 12);
  const rome = groups.find(place => place.placeIds.includes('rom1555'));
  assert.deepEqual(rome.placeIds.sort(), ['rom1555', 'rom1640']);
  assert.deepEqual(rome.eventIds.sort(), ['frescobaldi1640', 'vicentino1555']);
  assert.deepEqual(rome.personIds.sort(), ['frescobaldi_spaet', 'valentini_um1643', 'vicentino_1555']);
  assert.equal(byId(atlas.events).get('werckmeister1691').placeId, null);
  assert.ok(groups.every(place => !place.eventIds.includes('werckmeister1691')));
  const map = byId(atlas.places);
  assert.ok(projectPlace(map.get('salamanca'), projection).x < projectPlace(map.get('paris'), projection).x);
  assert.ok(projectPlace(map.get('berlin'), projection).y < projectPlace(map.get('florenz'), projection).y);
});

test('every listening association names a real model and states its historical relationship', () => {
  assert.equal(mappings.tunings.length, 8);
  assert.equal(new Set(mappings.tunings.map(tuning => tuning.id)).size, 8);
  assert.deepEqual(Object.keys(mappings.people).sort(), ids(atlas.people));
  assert.deepEqual(Object.keys(mappings.events).sort(), ids(atlas.events));
  for (const [type, records] of [['person', atlas.people], ['event', atlas.events]]) {
    for (const record of records) {
      const raw = mappings[type === 'person' ? 'people' : 'events'][record.id];
      const resolved = listeningOptions(mappings, type, record.id);
      assert.equal(resolved.length, raw.length, `${record.id} silently drops an unknown model`);
      for (const option of resolved) {
        assert.ok(option.tuning?.url, record.id);
        assert.ok(Object.hasOwn(mappings.statusLabels, option.status), record.id);
        assert.ok(option.note?.trim(), `${record.id} lacks relationship explanation`);
      }
    }
  }
});

test('listening URLs select audited presets, with sound enabled only by the visitor', () => {
  // These IDs were checked against the explorer catalogue at explorerCommit.
  const audited = new Set(['meantone', 'meantone-third', 'werckmeister-iii', 'kirnberger-iii', 'vallotti', '12edo', '31edo']);
  assert.match(mappings.explorerCommit, /^[a-f0-9]{40}$/);
  for (const tuning of mappings.tunings) {
    const url = new URL(tuning.url);
    assert.equal(url.origin + url.pathname, 'https://muk-labs.github.io/temperaments/');
    assert.equal(url.searchParams.get('scale'), tuning.preset || 'custom');
    assert.equal(url.searchParams.get('instrument'), 'harpsichord');
    assert.ok(!url.searchParams.has('mode'), 'do not launch in 12-EDO A/B reference instead of the requested model');
    assert.ok(!url.searchParams.has('dynamic'), 'historical comparisons use fixed tuning');
    assert.ok(!url.searchParams.has('autoplay'));
    assert.ok(!url.searchParams.has('root') || url.searchParams.get('root') === '60');
    assert.ok(!url.searchParams.has('a4') || url.searchParams.get('a4') === '440');
    if (tuning.preset) {
      assert.ok(audited.has(tuning.preset), tuning.id);
      assert.equal(url.hash, '');
    }
    assert.ok(FAMILY_IDS.includes(tuning.family));
    assert.ok(tuning.caveat?.trim());
  }
  assert.equal(mappings.defaults.dynamic, false);
  assert.equal(mappings.defaults.reference, false);
});

test('the custom two-sevenths-comma URL reproduces the supplied source model at every key', () => {
  const tuning = mappings.tunings.find(tuning => tuning.id === 'meantone-two-sevenths');
  assert.equal(tuning.kind, 'custom');
  assert.equal(tuning.sourceModelId, 'mt_2_7');
  const url = new URL(tuning.url);
  const decoded = new URLSearchParams(url.hash.slice(1)).get('scl');
  assert.equal(decoded, tuning.scl);
  const lines = decoded.trim().split('\n');
  assert.equal(lines[1], '12');
  assert.equal(lines.length, 14, 'description, count, eleven pitches and octave');
  assert.equal(lines.at(-1), '2/1');
  const values = lines.slice(2, -1).map(value => {
    assert.match(value, /^\d+\.\d+$/, 'Scala cents must have a decimal point; integers denote ratios');
    return Number(value);
  });
  const model = models.models.find(model => model.id === 'mt_2_7');
  const expected = models.chromatic_keyboard.slice(1).map(note => model.pitch_cents[note]);
  assert.equal(values.length, expected.length);
  for (let i = 0; i < values.length; i++) {
    assert.ok(Math.abs(values[i] - expected[i]) < 1e-9, `wrong pitch for ${models.chromatic_keyboard[i + 1]}`);
    assert.ok(values[i] > (values[i - 1] || 0) && values[i] < 1200);
  }
  assert.ok(tuning.sourceUrl.includes(atlas.meta.sourceCommit));
});

test('uncertain personal tunings and illustrative comparisons never become exact attributions', () => {
  for (const id of ['wa_mozart_forschungsfrage', 'beethoven_offener_befund']) {
    const person = byId(atlas.people).get(id);
    assert.equal(person.evidence, 'open');
    assert.deepEqual(person.eventIds, []);
    assert.deepEqual(person.placeIds, []);
    assert.deepEqual(mappings.people[id], []);
    assert.ok(mappings.mappingNotes[id]);
  }
  assert.deepEqual(mappings.people.buxtehude_luebeck, []);
  assert.deepEqual(mappings.events.schlick1511, []);
  assert.equal(byId(atlas.events).get('luebeck1782').year, 1782);
  assert.ok(!byId(atlas.events).get('luebeck1782').personIds.includes('buxtehude_luebeck'));
  for (const id of ['vicentino_1555', 'galilei_1581', 'jsbach_wohltemperiert', 'cpebach_1753', 'rameau_1726']) {
    assert.ok(mappings.people[id].every(option => option.status === 'comparison'), id);
  }
  assert.equal(mappings.people.tuerk_1789.find(option => option.tuningId === 'kirnberger-iii').status, 'comparison');
  assert.equal(mappings.people.werckmeister_1707.find(option => option.tuningId === 'werckmeister-iii').status, 'comparison');
  assert.ok(mappings.tunings.every(tuning => tuning.preset !== 'just'), 'Robert Rich’s modern scale must not stand in for unspecified Renaissance practice');
});
