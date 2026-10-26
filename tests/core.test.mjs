import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_STATE, DEFAULT_YEAR, YEAR_MIN, YEAR_MAX, clampYear, normalizeState,
  stateFromSearch, stateToSearch, yearRange, filterEvents, filterPeople,
  closestEvent, nextEvent, safeExternalUrl, escapeHtml,
} from '../core.js';

const atlas = JSON.parse(readFileSync(new URL('../data/atlas.json', import.meta.url), 'utf8'));
const mapping = JSON.parse(readFileSync(new URL('../data/tunings.json', import.meta.url), 'utf8'));
const state = changes => normalizeState({ ...DEFAULT_STATE, ...changes }, atlas);
const eventIds = result => result.map(event => event.id);

test('the opening time window shows dated evidence around 1722', () => {
  const initial = stateFromSearch('', atlas);
  assert.deepEqual(initial, DEFAULT_STATE);
  assert.deepEqual(yearRange(initial), [1697, 1747]);
  assert.deepEqual(eventIds(filterEvents(atlas, initial)), ['werckmeister1707', 'bach1722', 'neidhardt1724', 'rameau1726', 'rameau1737']);
});

test('window boundaries are inclusive and clamped to the available timeline', () => {
  const endsAtBach = state({ year: 1697, window: 25 });
  assert.deepEqual(eventIds(filterEvents(atlas, endsAtBach)), ['werckmeister1691', 'werckmeister1707', 'bach1722']);
  const startsAtBach = state({ year: 1747, window: 25 });
  assert.deepEqual(eventIds(filterEvents(atlas, startsAtBach)), ['bach1722', 'neidhardt1724', 'rameau1726', 'rameau1737', 'cpe1753']);
  assert.deepEqual(yearRange(state({ year: 1500, window: 50 })), [1500, 1550]);
  assert.deepEqual(yearRange(state({ year: 1850, window: 50 })), [1800, 1850]);
  assert.deepEqual(eventIds(filterEvents(atlas, state({ year: 1850, window: 25 }))), ['montal1834']);
  assert.deepEqual(yearRange(state({ year: 1722, window: 'all' })), [YEAR_MIN, YEAR_MAX]);
  assert.equal(filterEvents(atlas, state({ window: 'all' })).length, 17);
});

test('families and evidence filter the same dated records, including the 1722 contextual claim', () => {
  assert.deepEqual(eventIds(filterEvents(atlas, state({ family: 'unequal', evidence: 'A' }))), ['werckmeister1707', 'neidhardt1724', 'rameau1726']);
  assert.deepEqual(eventIds(filterEvents(atlas, state({ evidence: 'C' }))), ['bach1722']);
  assert.deepEqual(eventIds(filterEvents(atlas, state({ family: 'extended' }))), []);
  assert.deepEqual(eventIds(filterEvents(atlas, state({ family: 'extended' }), { ignoreTime: true })), ['vicentino1555']);
  assert.deepEqual(eventIds(filterEvents(atlas, state({ window: 'all', evidence: 'B' }))), ['frescobaldi1640', 'luebeck1782']);
});

test('mixed evidence stays available under either constituent category, without changing event evidence', () => {
  for (const evidence of ['A', 'B', 'A+B']) {
    assert.ok(filterPeople(atlas, state({ evidence })).some(person => person.id === 'jsbach_wohltemperiert'));
  }
  assert.ok(!filterPeople(atlas, state({ evidence: 'C' })).some(person => person.id === 'jsbach_wohltemperiert'));
  assert.ok(!filterEvents(atlas, state({ evidence: 'A' })).some(event => event.id === 'bach1722'));
  assert.deepEqual(filterPeople(atlas, state({ evidence: 'open' })).map(person => person.id), ['wa_mozart_forschungsfrage', 'beethoven_offener_befund']);
});

test('search finds accented people and places using ordinary keyboard spelling', () => {
  assert.deepEqual(eventIds(filterEvents(atlas, state({ query: 'Kothen' }))), ['bach1722']);
  assert.deepEqual(eventIds(filterEvents(atlas, state({ query: 'KÖTHEN' }))), ['bach1722']);
  const couperin = filterPeople(atlas, state({ query: 'francois couperin' })).map(person => person.id);
  assert.ok(couperin.includes('francois_couperin_zeugnis'));
  assert.deepEqual(couperin, filterPeople(atlas, state({ query: 'François Couperin' })).map(person => person.id));
  assert.deepEqual(filterPeople(atlas, state({ query: 'amade mozart' })).map(person => person.id), ['wa_mozart_forschungsfrage']);
  assert.deepEqual(eventIds(filterEvents(atlas, state({ query: 'Paris Rameau' }))), ['rameau1726', 'rameau1737']);
  assert.deepEqual(eventIds(filterEvents(atlas, state({ query: 'this phrase has no matching evidence' }))), []);
});

test('the complete people register does not infer lifetimes or adoption periods from the slider', () => {
  const early = filterPeople(atlas, state({ year: 1500, window: 10 }));
  const late = filterPeople(atlas, state({ year: 1850, window: 10 }));
  assert.equal(early.length, 26);
  assert.deepEqual(early.map(person => person.id), late.map(person => person.id));
  // The late Lübeck contract is not made contemporaneous with Buxtehude.
  assert.ok(!filterEvents(atlas, state({ year: 1700, window: 25 })).some(event => event.id === 'luebeck1782'));
  assert.ok(filterPeople(atlas, state({ query: 'Buxtehude' })).some(person => person.id === 'buxtehude_luebeck'));
});

test('search also finds named listening models without inventing open composer attributions', () => {
  const search = state({ window: 'all', query: 'Vallotti' });
  assert.ok(filterEvents(atlas, search, { mapping }).some(event => event.id === 'bach1722'));
  assert.ok(filterPeople(atlas, search, mapping).some(person => person.id === 'jsbach_wohltemperiert'));
  assert.ok(!filterPeople(atlas, search, mapping).some(person => person.id === 'wa_mozart_forschungsfrage'));
  assert.ok(filterEvents(atlas, state({ window: 'all', query: 'Two-sevenths-comma' }), { mapping }).some(event => event.id === 'zarlino1558'));
});

test('malformed shared parameters fall back safely and numeric years stay within bounds', () => {
  assert.deepEqual(stateFromSearch('?year=not-a-date&window=forever&family=unknown&evidence=wrong&event=missing&q=%20', atlas), DEFAULT_STATE);
  for (const value of ['', '   ', null, undefined, 'Infinity', 'NaN']) assert.equal(clampYear(value), DEFAULT_YEAR, String(value));
  assert.equal(clampYear(-1000), YEAR_MIN);
  assert.equal(clampYear(9999), YEAR_MAX);
  assert.equal(clampYear(1722.6), 1723);
  assert.equal(stateFromSearch('?person=nonexistent', atlas).selection, null);
  assert.equal(stateFromSearch('?place=nonexistent', atlas).selection, null);
  assert.equal(stateFromSearch('?window=-1', atlas).window, 25);
  assert.equal(stateFromSearch('?q=' + 'x'.repeat(300), atlas).query.length, 200);
});

test('share links round-trip year, all-time mode, filters, Unicode search and each valid selection type', () => {
  const selections = [
    { type: 'event', id: 'bach1722' },
    { type: 'person', id: 'jsbach_wohltemperiert' },
    { type: 'place', id: 'rom1555' },
  ];
  for (const selection of selections) {
    const original = state({ year: 1722, window: 'all', family: 'unequal', evidence: 'A+B', query: 'Köthen & Bach', selection });
    const encoded = stateToSearch(original);
    assert.deepEqual(stateFromSearch(encoded, atlas), original);
    assert.equal(new URLSearchParams(encoded).get(selection.type), selection.id);
  }
  const outOfWindowSelection = stateFromSearch('?year=1500&window=10&person=montal_1834', atlas);
  assert.deepEqual(outOfWindowSelection.selection, { type: 'person', id: 'montal_1834' }, 'a shared record remains addressable outside the current slider window');
});

test('previous, next and closest evidence navigation is chronological and does not mutate data', () => {
  const originalOrder = eventIds(atlas.events);
  assert.equal(nextEvent(atlas.events, 1722, 1).id, 'neidhardt1724');
  assert.equal(nextEvent(atlas.events, 1722, -1).id, 'werckmeister1707');
  assert.equal(nextEvent(atlas.events, 1834, 1), null);
  assert.equal(nextEvent(atlas.events, 1511, -1), null);
  assert.equal(closestEvent(atlas.events, 1723).id, 'bach1722', 'ties choose the earlier dated evidence');
  assert.equal(closestEvent([], 1722), null);
  assert.equal(nextEvent([], 1722, 1), null);
  assert.deepEqual(eventIds(atlas.events), originalOrder);
});

test('source links and URL-supplied text cannot introduce executable markup', () => {
  for (const unsafe of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', '//example.org']) assert.equal(safeExternalUrl(unsafe), '');
  assert.equal(safeExternalUrl('https://muk-labs.github.io/temperaments/?scale=12edo'), 'https://muk-labs.github.io/temperaments/?scale=12edo');
  const query = '<img src=x onerror="alert(1)"> & \'test\'';
  const restored = stateFromSearch(stateToSearch(state({ query })), atlas);
  assert.equal(restored.query, query);
  const escaped = escapeHtml(restored.query);
  assert.ok(!escaped.includes('<') && !escaped.includes('>') && !escaped.includes('"') && !escaped.includes("'"));
  assert.match(escaped, /&lt;img/);
});
