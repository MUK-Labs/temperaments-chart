import {
  YEAR_MIN, YEAR_MAX, DEFAULT_STATE, FAMILY_IDS, FAMILY_NAMES,
  normalizeState, stateFromSearch, stateToSearch, yearRange, filterEvents,
  filterPeople, closestEvent, nextEvent, groupPlaces, projectPlace,
  listeningOptions, safeExternalUrl, escapeHtml as html
} from './core.js';

const $ = id => document.getElementById(id);
const familyColors = { meantone: '#a01414', unequal: '#6d607e', equal: '#576e52', extended: '#a4732e', other: '#787673' };
const svgNamespace = 'http://www.w3.org/2000/svg';
let atlas, mapping, projection, groups, state, visibleEvents = [], playTimer = null, searchTimer = null, yearTimer = null;
let viewport = { x: 0, y: 0, zoom: 1 };
let drag = null, suppressMapClick = false;
let lastDetailKey = '';
const labelOffsets = {
  speyer: [22, 30], venedig: [23, -19], rom1555: [22, 16], salamanca: [-75, 34],
  florenz: [-95, -8], amsterdam: [-115, -12], paris: [-77, 18],
  quedlinburg: [-143, 4], koethen: [24, 33], berlin: [40, -3],
  koenigsberg: [19, -13], luebeck: [-28, -28]
};

function externalLink(url, text, className = '') {
  const safe = safeExternalUrl(url);
  return safe ? `<a href="${html(safe)}" target="_blank" rel="noopener noreferrer"${className ? ` class="${html(className)}"` : ''}>${text}</a>` : text;
}

function evidenceBadge(code) {
  const short = { A: 'A · primary', B: 'B · reported', C: 'C · context', 'A+B': 'A + B · mixed', open: 'Open question' };
  return `<span class="evidence-badge" title="${html(atlas.meta.evidenceDescriptions[code] || '')}">${html(short[code] || code)}</span>`;
}

function familyOf(record) {
  return state.family !== 'all' && record.families?.includes(state.family) ? state.family : record.families?.[0] || 'other';
}

function syncUrl() {
  const search = stateToSearch(state);
  if (window.location.search !== search) window.history.replaceState(null, '', `${window.location.pathname}${search}${window.location.hash}`);
}

function selectClosest() {
  const nearest = closestEvent(filterEvents(atlas, state, { mapping }), state.year);
  state.selection = nearest ? { type: 'event', id: nearest.id } : null;
}

function update(changes = {}, { pickNearest = false, sync = true } = {}) {
  state = normalizeState({ ...state, ...changes }, atlas);
  if (pickNearest) selectClosest();
  render();
  if (sync) syncUrl();
}

function chooseEvent(id, { jump = true, scroll = false } = {}) {
  const event = atlas.events.find(item => item.id === id);
  if (!event) return;
  stopPlaying();
  update({ selection: { type: 'event', id }, ...(jump ? { year: event.year } : {}) });
  revealDetail(scroll);
}

function choosePerson(id) {
  if (!atlas.people.some(item => item.id === id)) return;
  stopPlaying();
  update({ selection: { type: 'person', id } });
  revealDetail(true);
}

function choosePlace(id) {
  if (suppressMapClick) return;
  const group = groups.find(item => item.id === id);
  if (!group) return;
  const active = visibleEvents.filter(event => group.eventIds.includes(event.id));
  if (active.length === 1) chooseEvent(active[0].id, { jump: false });
  else {
    stopPlaying();
    update({ selection: { type: 'place', id: group.id } });
    revealDetail(false);
  }
}

function revealDetail(scroll) {
  $('detail-panel').focus({ preventScroll: true });
  if (scroll || matchMedia('(max-width: 850px)').matches) $('detail-panel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}

function renderControls() {
  const [from, to] = yearRange(state);
  $('year-number').value = state.year;
  $('year-slider').value = state.year;
  $('year-slider').setAttribute('aria-valuetext', state.window === 'all' ? `${state.year}, all dates shown` : `${state.year}, showing ${from} to ${to}`);
  $('window-size').value = state.window;
  $('family-filter').value = state.family;
  $('evidence-filter').value = state.evidence;
  if (document.activeElement !== $('search')) $('search').value = state.query;
  $('window-caption').textContent = state.window === 'all' ? 'All dated evidence · 1511–1834' : `${from}–${to} · a ${to - from}-year window`;
  $('year-slider').style.setProperty('--window-start', `${(from - YEAR_MIN) / (YEAR_MAX - YEAR_MIN) * 100}%`);
  $('year-slider').style.setProperty('--window-end', `${(to - YEAR_MIN) / (YEAR_MAX - YEAR_MIN) * 100}%`);
  const candidates = filterEvents(atlas, state, { ignoreTime: true, mapping });
  $('previous-event').disabled = !nextEvent(candidates, state.year, -1);
  $('next-event').disabled = !nextEvent(candidates, state.year, 1);
  $('play-button').disabled = state.window === 'all';
  $('play-button').title = state.window === 'all' ? 'Choose a time window to animate the timeline' : 'Move through the years';
}

function selectedPlaceIds() {
  if (!state.selection) return [];
  if (state.selection.type === 'event') return [atlas.events.find(event => event.id === state.selection.id)?.placeId].filter(Boolean);
  if (state.selection.type === 'person') return atlas.people.find(person => person.id === state.selection.id)?.placeIds || [];
  return groups.find(group => group.placeIds.includes(state.selection.id))?.placeIds || [];
}

function makeSvg(tag, attributes, text) {
  const element = document.createElementNS(svgNamespace, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderMap() {
  const selected = selectedPlaceIds();
  const markedGroups = groups.filter(group => visibleEvents.some(event => group.eventIds.includes(event.id)));
  const unmapped = visibleEvents.filter(event => !event.placeId).length;
  $('map-summary').textContent = `${markedGroups.length} of ${groups.length} cities highlighted${unmapped ? ` · ${unmapped} milestone without a single map point` : ''}`;
  const fragment = document.createDocumentFragment();
  for (const group of groups) {
    const { x, y } = projectPlace(group, projection);
    const active = visibleEvents.filter(event => group.eventIds.includes(event.id));
    const all = atlas.events.filter(event => group.eventIds.includes(event.id));
    const nearest = closestEvent(active.length ? active : all, state.year);
    const family = nearest ? familyOf(nearest) : 'other';
    const isSelected = group.placeIds.some(id => selected.includes(id));
    const [dx, dy] = labelOffsets[group.id] || [18, -18];
    const dates = [...new Set((active.length ? active : all).map(event => event.dateLabel))].join(' · ');
    const marker = makeSvg('g', {
      class: `map-marker family-${family}${active.length ? '' : ' is-inactive'}${isSelected ? ' is-selected' : ''}`,
      'data-place': group.id, tabindex: '0', role: 'button', 'aria-pressed': String(isSelected),
      'aria-label': `${group.name}: ${active.length} matching of ${all.length} dated records. ${dates}. Open evidence.`,
      style: `--family-color:${familyColors[family]}`
    });
    marker.append(makeSvg('title', {}, `${group.name} · ${dates}${active.length ? '' : '\nOutside the current filters; select to explore this place.'}`));
    marker.append(makeSvg('line', { class: 'marker-leader', x1: x, y1: y, x2: x + dx + (dx < 0 ? 45 : -5), y2: y + dy - 5 }));
    marker.append(makeSvg('circle', { class: 'marker-area', cx: x, cy: y, r: '15' }));
    marker.append(makeSvg('circle', { class: 'marker-halo', cx: x, cy: y, r: '13' }));
    marker.append(makeSvg('circle', { class: 'marker-point', cx: x, cy: y, r: active.length ? '7.5' : '5' }));
    const label = makeSvg('text', { class: 'marker-label', x: x + dx, y: y + dy }, group.name);
    label.append(makeSvg('tspan', { class: 'marker-subtitle', x: x + dx, dy: '17' }, dates));
    // SVG text normally only receives pointer events on painted glyphs. Give
    // both lines one generous target, including the space between the lines.
    marker.append(makeSvg('rect', { class: 'marker-label-hit', x: x + dx - 6, y: y + dy - 20, width: Math.max(group.name.length * 10, dates.length * 7) + 12, height: 44, fill: 'transparent' }));
    marker.append(label);
    fragment.append(marker);
  }
  $('map-markers').replaceChildren(fragment);
  for (const marker of $('map-markers').children) {
    const box = marker.querySelector('.marker-label').getBBox();
    if (!box.width) continue;
    const hit = marker.querySelector('.marker-label-hit');
    for (const [key, value] of Object.entries({ x: box.x - 6, y: box.y - 5, width: box.width + 12, height: box.height + 10 })) hit.setAttribute(key, value);
  }
}

function setViewport() {
  const width = projection.width / viewport.zoom, height = projection.height / viewport.zoom;
  viewport.x = Math.max(0, Math.min(projection.width - width, viewport.x));
  viewport.y = Math.max(0, Math.min(projection.height - height, viewport.y));
  $('map').setAttribute('viewBox', `${viewport.x} ${viewport.y} ${width} ${height}`);
  $('map').style.touchAction = viewport.zoom > 1 ? 'none' : 'pan-y';
  $('zoom-out').disabled = viewport.zoom <= 1;
  $('zoom-in').disabled = viewport.zoom >= 3.4;
  $('zoom-reset').disabled = viewport.zoom === 1;
}

function zoom(factor) {
  const nextZoom = Math.max(1, Math.min(3.4, viewport.zoom * factor));
  viewport.x += projection.width / viewport.zoom / 2 - projection.width / nextZoom / 2;
  viewport.y += projection.height / viewport.zoom / 2 - projection.height / nextZoom / 2;
  viewport.zoom = nextZoom;
  setViewport();
}

function citations(ids, locator = '') {
  return [...new Set(ids)].map(id => {
    const source = atlas.sources.find(item => item.id === id);
    if (!source) return '';
    return `<div class="source-citation">${externalLink(source.url, `${html(source.author)} · ${html(source.year)} <span aria-hidden="true">↗</span>`)}<p>${html(source.title)}</p><p>${html(locator || source.locator)}</p><p><a href="#source-${html(id)}" data-source="${html(id)}">Source access &amp; qualifications</a></p></div>`;
  }).join('');
}

function listeningSection(type, id) {
  const options = listeningOptions(mapping, type, id);
  return `<section class="detail-section"><h3>Hear it in the explorer</h3>${options.length ? options.map(option => `<div class="listen-option">${externalLink(option.tuning.url, `<span>${html(option.label)}</span><span class="arrow" aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span>`, 'listen-link')}<span class="listen-status">${html(mapping.statusLabels[option.status])}</span><span class="listen-note">${html(option.note)}</span></div>`).join('') + '<p class="new-tab-note">Opens in a new tab · harpsichord sound.<br>Select “Enable sound” in the explorer to play.</p>' : `<p class="caveat">${html(mapping.mappingNotes[id] || 'The source does not establish one numerical keyboard tuning. No preset is assigned.')}</p>`}</section>`;
}

function renderEventDetail(event) {
  const people = event.personIds.map(id => atlas.people.find(person => person.id === id)).filter(Boolean);
  const person = people[0];
  const place = atlas.places.find(item => item.id === event.placeId);
  const isVisible = visibleEvents.some(item => item.id === event.id);
  const family = familyOf(event);
  return `<div class="detail-topline"><span class="date-label">${html(event.dateLabel)}</span>${evidenceBadge(event.evidence)}</div>
    ${!isVisible ? '<p class="selection-notice">This selection is outside the current filters. <button data-action="show-selected">Show it in the atlas.</button></p>' : ''}
    <p class="eyebrow">${html(FAMILY_NAMES[family])}</p><h2 class="detail-title">${html(person?.name || event.title.split(' · ')[0])}</h2>
    <p class="detail-place">${html(place ? `${place.name} · ${place.role}` : 'Frankfurt / Leipzig · publication cities; no single map point')}</p>
    <p class="detail-description">${html(event.summary)}</p>
    ${person ? `<section class="detail-section"><h3>Context from the full record${person.evidence !== event.evidence ? ` · ${html(person.evidence)}` : ''}</h3><p>${html(person.summary)}</p></section>` : ''}
    ${person?.limitation ? `<section class="detail-section"><h3>Limits of this evidence</h3><p class="caveat">${html(person.limitation)}</p></section>` : ''}
    ${listeningSection('event', event.id)}
    <section class="detail-section"><h3>Read the sources</h3>${citations([...event.sourceIds, ...people.flatMap(item => item.sourceIds)])}${event.verification || person?.verification ? `<p class="listen-note">${html(event.verification || person.verification)}</p>` : ''}${person ? `<button class="detail-record-button" data-person="${html(person.id)}">Full person / context record <span>Includes later testimony and practical comparisons ↗</span></button>` : ''}</section>`;
}

function renderPersonDetail(person) {
  return `<div class="detail-topline"><span class="date-label">Person / context</span>${evidenceBadge(person.evidence)}</div><p class="eyebrow">${html(person.role)}</p><h2 class="detail-title">${html(person.name)}</h2><p class="detail-place">${html(person.place)}<br>${html(person.dateLabel)}</p><p class="detail-description">${html(person.summary)}</p><section class="detail-section"><h3>Limits of the attribution</h3><p class="caveat">${html(person.limitation)}</p></section>${listeningSection('person', person.id)}<section class="detail-section"><h3>A practical comparison</h3><p>${html(person.practical)}</p></section>${person.eventIds.length ? `<section class="detail-section"><h3>Dated milestones</h3>${person.eventIds.map(id => eventDetailButton(atlas.events.find(event => event.id === id))).join('')}</section>` : `<p class="new-tab-note">This register entry is not assigned its own dated milestone.${person.placeIds.length ? ' Its associated source location is highlighted on the map.' : ' No precise map point is assigned.'}</p>`}<section class="detail-section"><h3>Read the sources</h3>${citations(person.sourceIds)}<p class="listen-note">${html(person.locator)}</p><p class="listen-note">${html(person.verification)}</p></section>`;
}

function eventDetailButton(event) {
  return event ? `<button class="detail-record-button" data-event="${html(event.id)}">${html(event.dateLabel)} · ${html(event.title)}<span>${html(event.summary)}</span></button>` : '';
}

function renderPlaceDetail(id) {
  const group = groups.find(item => item.placeIds.includes(id));
  if (!group) return '';
  const places = atlas.places.filter(place => group.placeIds.includes(place.id));
  const events = atlas.events.filter(event => group.eventIds.includes(event.id));
  const active = events.filter(event => visibleEvents.some(item => item.id === event.id));
  const people = atlas.people.filter(person => group.personIds.includes(person.id));
  return `<div class="detail-topline"><span class="date-label">Place of evidence</span><span class="evidence-badge">${events.length} dated records</span></div><h2 class="detail-title">${html(group.name)}</h2><p class="detail-place">${html([...new Set(places.map(place => place.role))].join(' · '))}</p><p class="detail-description">${active.length} of ${events.length} dated records match your current window and filters. Select a milestone to move to its year and explore its tuning links.</p><section class="detail-section"><h3>Evidence at this place · all dates</h3>${events.map(eventDetailButton).join('')}</section>${people.length ? `<section class="detail-section"><h3>People &amp; contexts</h3>${people.map(person => `<button class="detail-record-button" data-person="${html(person.id)}">${html(person.name)}<span>${html(person.dateLabel)}</span></button>`).join('')}</section>` : ''}<section class="detail-section"><h3>About this point</h3><p class="caveat">${places.map(place => html(place.note)).join(' ')}</p><p class="listen-note">A publication or reported practice here does not establish regional adoption.</p></section>`;
}

function renderDetail() {
  const selection = state.selection;
  const detailKey = selection ? `${selection.type}:${selection.id}` : '';
  if (selection?.type === 'event') $('detail-content').innerHTML = renderEventDetail(atlas.events.find(event => event.id === selection.id));
  else if (selection?.type === 'person') $('detail-content').innerHTML = renderPersonDetail(atlas.people.find(person => person.id === selection.id));
  else if (selection?.type === 'place') $('detail-content').innerHTML = renderPlaceDetail(selection.id);
  else $('detail-content').innerHTML = `<p class="eyebrow">Follow the evidence</p><h2 class="detail-title">A place. A text.<br>A way of hearing.</h2><p class="detail-description">Select a point on the map or timeline to read its historical context and open a listening model.</p><section class="detail-section"><h3>No dated milestones in this view</h3><p class="caveat">The archive is selective. An empty window does not mean a tuning was absent or that musical practice stopped.</p><button class="detail-record-button" data-action="all-dates">Show all dates <span>Keep the current search and evidence filters</span></button><button class="detail-record-button" data-action="people">Explore the complete register <span>Including undated testimony and open research questions</span></button></section>`;
  if (detailKey !== lastDetailKey) $('detail-panel').scrollTop = 0;
  lastDetailKey = detailKey;
}

function renderTimeline() {
  const range = YEAR_MAX - YEAR_MIN;
  const position = year => (year - YEAR_MIN) / range * 100;
  const [from, to] = yearRange(state);
  const visibleIds = new Set(visibleEvents.map(event => event.id));
  const ticks = Array.from({ length: 8 }, (_, index) => YEAR_MIN + index * 50);
  let content = `<div class="timeline-axis" aria-hidden="true">${ticks.map(year => `<span class="axis-label" style="left:${position(year)}%">${year}</span>`).join('')}</div>`;
  for (const family of FAMILY_IDS) {
    const events = atlas.events.filter(event => familyOf(event) === family);
    content += `<div class="timeline-row family-${family}"><div class="timeline-row-label"><i class="dot"></i>${html({ meantone: 'Meantone', unequal: 'Unequal', equal: 'Equal / near-equal', extended: 'Extended', other: 'Context' }[family])}</div><div class="timeline-track"><div class="time-window" style="--left:${position(from)}%;--width:${position(to) - position(from)}%"></div><div class="time-cursor" style="--left:${position(state.year)}%"></div>`;
    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      const previousClose = index > 0 && event.year - events[index - 1].year < 9;
      const nextClose = index < events.length - 1 && events[index + 1].year - event.year < 9;
      const offset = previousClose ? 9 : nextClose ? -9 : 0;
      const selected = state.selection?.type === 'event' && state.selection.id === event.id;
      const label = `${event.dateLabel} · ${event.title}. ${event.summary}`;
      content += `<button class="timeline-point${visibleIds.has(event.id) ? '' : ' is-inactive'}${selected ? ' is-selected' : ''}${event.approximate ? ' approximate' : ''}${offset ? ' has-offset' : ''}" style="--point:${position(event.year)}%;--offset:${offset}px" data-event="${html(event.id)}" data-timeline-point="${html(event.id)}" title="${html(label)}" aria-label="${html(label)}" aria-pressed="${selected}"></button>`;
    }
    content += '</div></div>';
  }
  content += '<p class="timeline-axis-note" id="timeline-hover">Hover or focus a point to identify it; select to move to that year.</p>';
  $('timeline').innerHTML = content;
  $('timeline-count').textContent = `${visibleEvents.length} / ${atlas.events.length} milestones highlighted`;
}

function renderEventList() {
  const [from, to] = yearRange(state);
  $('records-period').textContent = state.window === 'all' ? 'Across all dates' : `Inside the viewing window · ${from}–${to}`;
  $('results-count').textContent = `${visibleEvents.length} ${visibleEvents.length === 1 ? 'record' : 'records'}${state.query ? ` matching “${state.query}”` : ''}`;
  if (!visibleEvents.length) {
    $('event-list').innerHTML = `<div class="empty-state"><h3>No dated evidence in this view.</h3><p>Try a wider window or another search. The full people register also includes material without a precise milestone.</p><button data-action="all-dates">Show all dates</button> <button data-action="reset">Reset all filters</button> <button data-action="people">Open people &amp; contexts</button></div>`;
    return;
  }
  $('event-list').innerHTML = visibleEvents.map(event => {
    const primary = listeningOptions(mapping, 'event', event.id)[0];
    const selected = state.selection?.type === 'event' && state.selection.id === event.id;
    return `<article class="event-card family-${familyOf(event)}${selected ? ' is-selected' : ''}"><div class="event-card-top"><span class="date-label">${html(event.dateLabel)}</span>${evidenceBadge(event.evidence)}</div><h3><button class="event-card-title" data-event="${html(event.id)}" data-scroll="true">${html(event.title)}</button></h3><p class="event-card-summary">${html(event.summary)}</p><div class="event-card-footer"><button data-event="${html(event.id)}" data-scroll="true">Evidence &amp; sources →</button>${primary ? externalLink(primary.tuning.url, `${html(primary.status === 'comparison' ? 'Hear comparison' : 'Hear model')} ↗<span class="sr-only">: ${html(primary.label)} (new tab)</span>`) : '<span class="small-muted">No single preset assigned</span>'}</div></article>`;
  }).join('');
}

function renderPeople() {
  const people = filterPeople(atlas, state, mapping);
  $('people-count').textContent = `${people.length} / ${atlas.people.length} records`;
  $('people-list').innerHTML = people.length ? people.map(person => {
    const option = listeningOptions(mapping, 'person', person.id)[0];
    return `<article class="person-card"><h3><button data-person="${html(person.id)}">${html(person.name)}</button></h3><p>${html(person.place)}</p><p>${html(person.dateLabel)}</p><p class="person-summary">${html(person.summary)}</p><div class="person-tags">${evidenceBadge(person.evidence)}${option ? externalLink(option.tuning.url, `${html(option.status === 'comparison' ? 'Hear comparison' : 'Hear model')} ↗<span class="sr-only">: ${html(option.label)} (new tab)</span>`) : ''}</div></article>`;
  }).join('') : '<p class="section-description">No person records match these filters. Clear the search or reset the family and evidence filters.</p>';
}

function renderSources() {
  $('source-count').textContent = `${atlas.sources.length} references`;
  $('source-provenance').innerHTML = `${externalLink(atlas.meta.sourceUrl, 'Adapted from the Preferences research dossier ↗')} · ${externalLink(atlas.meta.dossierUrl, 'Read the PDF ↗')}<br>Source checks: ${html(atlas.meta.researchDate)} · English interactive adaptation: ${html(atlas.meta.adaptationDate)} · Pinned source: <code>${html(atlas.meta.sourceCommit.slice(0, 10))}</code><br>${html(atlas.meta.sourceNote)} Original data and the listening-model mappings are preserved in ${externalLink('https://github.com/MUK-Labs/temperaments-chart/tree/main/data', 'this project’s data folder ↗')}.`;
  $('source-list').innerHTML = atlas.sources.map(source => `<article id="source-${html(source.id)}" class="bibliography-item"><span class="source-id">${html(source.id)}</span><h4>${html(source.author)} (${html(source.year)}).<br>${externalLink(source.url, `${html(source.title)} ↗`)}</h4><p>${html(source.publication)}</p><p>${html(source.locator)}</p><details><summary>Evidence, access &amp; limits</summary><p><strong>Source type.</strong> ${html(source.type)}</p><p><strong>Supports.</strong> ${html(source.supports)}</p><p><strong>Limits.</strong> ${html(source.limits)}</p><p><strong>Verification in the original dossier.</strong> ${html(source.verification)}</p></details></article>`).join('');
}

function render() {
  visibleEvents = filterEvents(atlas, state, { mapping });
  renderControls();
  renderMap();
  renderDetail();
  renderTimeline();
  renderEventList();
  renderPeople();
}

function stopPlaying() {
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
  $('play-label').textContent = 'Play';
  $('play-button').setAttribute('aria-label', 'Play timeline');
  $('play-button').setAttribute('aria-pressed', 'false');
  $('play-button').firstElementChild.textContent = '▶';
}

function togglePlay() {
  if (playTimer) { stopPlaying(); syncUrl(); return; }
  if (state.window === 'all') return;
  if (state.year >= YEAR_MAX) update({ year: YEAR_MIN }, { pickNearest: true });
  $('play-label').textContent = 'Pause';
  $('play-button').setAttribute('aria-label', 'Pause timeline');
  $('play-button').setAttribute('aria-pressed', 'true');
  $('play-button').firstElementChild.textContent = 'Ⅱ';
  let ticks = 0;
  playTimer = setInterval(() => {
    const nextYear = state.year + 1;
    if (nextYear > YEAR_MAX) { stopPlaying(); syncUrl(); return; }
    update({ year: nextYear }, { pickNearest: true, sync: ++ticks % 5 === 0 });
  }, 280);
}

function openReference(id) {
  $(id).open = true;
  $(id).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}

function reset() {
  stopPlaying();
  clearTimeout(searchTimer);
  clearTimeout(yearTimer);
  $('search').value = '';
  update({ ...DEFAULT_STATE }, { pickNearest: true });
  viewport = { x: 0, y: 0, zoom: 1 };
  setViewport();
}

function bindControls() {
  const commitYear = value => { clearTimeout(yearTimer); stopPlaying(); update({ year: value }, { pickNearest: true }); };
  $('year-slider').addEventListener('input', event => commitYear(event.target.value));
  $('year-number').addEventListener('input', event => {
    clearTimeout(yearTimer);
    const value = event.target.value;
    if (/^\d{4}$/.test(value) && Number(value) >= YEAR_MIN && Number(value) <= YEAR_MAX) yearTimer = setTimeout(() => commitYear(value), 180);
  });
  for (const eventName of ['change', 'blur']) $('year-number').addEventListener(eventName, event => {
    if (String(state.year) !== event.target.value) commitYear(event.target.value);
  });
  $('year-number').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); commitYear(event.currentTarget.value); event.currentTarget.blur(); } });
  $('window-size').addEventListener('change', event => { stopPlaying(); update({ window: event.target.value }, { pickNearest: true }); });
  for (const [id, property] of [['family-filter', 'family'], ['evidence-filter', 'evidence']]) $(id).addEventListener('change', event => { stopPlaying(); update({ [property]: event.target.value }, { pickNearest: true }); });
  $('search').addEventListener('input', event => {
    stopPlaying(); clearTimeout(searchTimer);
    const query = event.target.value;
    searchTimer = setTimeout(() => update({ query }, { pickNearest: true }), 120);
  });
  $('reset-button').addEventListener('click', reset);
  $('play-button').addEventListener('click', togglePlay);
  for (const [id, direction] of [['previous-event', -1], ['next-event', 1]]) $(id).addEventListener('click', () => { const event = nextEvent(filterEvents(atlas, state, { ignoreTime: true, mapping }), state.year, direction); if (event) chooseEvent(event.id); });
  $('people-nav').addEventListener('click', () => { $('people-section').open = true; });
  $('sources-nav').addEventListener('click', () => { $('sources-section').open = true; });
  $('share-button').addEventListener('click', async () => {
    syncUrl();
    try {
      await navigator.clipboard.writeText(window.location.href);
      $('share-status').textContent = 'View link copied';
    } catch {
      let field = $('share-url');
      if (!field) { field = document.createElement('input'); field.id = 'share-url'; field.readOnly = true; field.setAttribute('aria-label', 'View URL — select and copy'); $('share-status').after(field); }
      field.value = window.location.href; field.focus(); field.select();
      $('share-status').textContent = 'Copy the selected link';
    }
  });
  $('application').addEventListener('click', event => {
    const source = event.target.closest('[data-source]');
    if (source) { $('sources-section').open = true; const item = $(`source-${source.dataset.source}`); if (item) item.querySelector('details').open = true; return; }
    const eventButton = event.target.closest('[data-event]');
    if (eventButton) { chooseEvent(eventButton.dataset.event, { scroll: eventButton.dataset.scroll === 'true' }); return; }
    const person = event.target.closest('[data-person]');
    if (person) { choosePerson(person.dataset.person); return; }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'all-dates') { stopPlaying(); update({ window: 'all' }, { pickNearest: true }); }
    if (action === 'reset') reset();
    if (action === 'people') openReference('people-section');
    if (action === 'show-selected') { const selected = atlas.events.find(item => item.id === state.selection?.id); if (selected) update({ year: selected.year, family: 'all', evidence: 'all', query: '' }); }
  });
  $('map').addEventListener('click', event => { const marker = event.target.closest('[data-place]'); if (marker) choosePlace(marker.dataset.place); });
  $('map').addEventListener('keydown', event => {
    const marker = event.target.closest('[data-place]');
    if (marker && ['Enter', ' '].includes(event.key)) { event.preventDefault(); suppressMapClick = false; choosePlace(marker.dataset.place); }
    else if (event.key === '+') zoom(1.4);
    else if (event.key === '-') zoom(1 / 1.4);
  });
  for (const type of ['pointerover', 'focusin']) $('timeline').addEventListener(type, event => {
    const button = event.target.closest('[data-timeline-point]');
    if (button) { const item = atlas.events.find(item => item.id === button.dataset.timelinePoint); $('timeline-hover').textContent = `${item.dateLabel} · ${item.title} — ${item.summary}`; }
  });
  $('zoom-in').addEventListener('click', () => zoom(1.4));
  $('zoom-out').addEventListener('click', () => zoom(1 / 1.4));
  $('zoom-reset').addEventListener('click', () => { viewport = { x: 0, y: 0, zoom: 1 }; setViewport(); });
  $('map').addEventListener('pointerdown', event => {
    suppressMapClick = false;
    if (event.button !== 0 || viewport.zoom === 1) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: viewport.x, startY: viewport.y };
  });
  $('map').addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!suppressMapClick && Math.abs(dx) + Math.abs(dy) > 5) {
      suppressMapClick = true;
      $('map').setPointerCapture(event.pointerId);
      $('map').classList.add('is-dragging');
    }
    if (!suppressMapClick) return;
    const bounds = $('map').getBoundingClientRect();
    viewport.x = drag.startX - dx * projection.width / viewport.zoom / bounds.width;
    viewport.y = drag.startY - dy * projection.height / viewport.zoom / bounds.height;
    setViewport();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('map').addEventListener(type, event => {
    if (drag && event.pointerId === drag.id) { drag = null; $('map').classList.remove('is-dragging'); }
  });
  window.addEventListener('popstate', () => { stopPlaying(); state = stateFromSearch(window.location.search, atlas); if (!state.selection) selectClosest(); render(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playTimer) { stopPlaying(); syncUrl(); } });
}

async function loadJson(path) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status})`);
  return response.json();
}

async function init() {
  try {
    [atlas, mapping, projection] = await Promise.all([loadJson('./data/atlas.json'), loadJson('./data/tunings.json'), loadJson('./assets/map-projection.json')]);
    groups = groupPlaces(atlas.places);
    state = stateFromSearch(window.location.search, atlas);
    if (!state.selection) selectClosest();
    bindControls();
    renderSources(); render(); setViewport();
    $('load-status').hidden = true;
    $('application').hidden = false;
    if (window.location.hash === '#people-section') $('people-section').open = true;
    if (window.location.hash === '#sources-section' || window.location.hash.startsWith('#source-')) $('sources-section').open = true;
    const hashTarget = window.location.hash ? $(window.location.hash.slice(1)) : null;
    if (hashTarget) { if (hashTarget.querySelector('details')) hashTarget.querySelector('details').open = true; hashTarget.scrollIntoView(); }
    syncUrl();
  } catch (error) {
    console.error('Atlas could not start:', error);
    $('load-status').classList.add('error');
    $('load-status').innerHTML = `The atlas could not load its data. Please reload the page. If you opened a downloaded file directly, serve this folder over HTTP or use the GitHub Pages version.<br>${externalLink('https://github.com/AdrianArtacho/Tuning/tree/main/sandbox/Preferences', 'Open the original research ↗')}`;
    for (const element of document.querySelectorAll('.time-controls input,.time-controls button,.time-controls select,.filters input,.filters select,.filters button,#share-button')) element.disabled = true;
  }
}

init();
