import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
import {beachThumbnail, thumbnailGeometry} from '../web/beach-thumbnail.js';
import {STATE_OUTLINES} from '../web/state-outlines.js';
import {installDiscovery} from '../web/discovery.js';

const bondi = {id: 'bondi', name: 'Bondi Beach', state_id: 'NSW', state: 'New South Wales', point: [151.278267, -33.891157]};
const normal = thumbnailGeometry(bondi);
assert.ok(normal.path.length > 100 && normal.dot);
assert.equal(normal.label, 'NSW');
assert.ok(normal.dot[0] > 100 && normal.dot[0] < 160 && normal.dot[1] > 65 && normal.dot[1] < 95,
  'Bondi belongs on the southeast mainland coast, west of Lord Howe Island');
const east = thumbnailGeometry({...bondi, point: [152, bondi.point[1]]});
const north = thumbnailGeometry({...bondi, point: [bondi.point[0], -33]});
assert.ok(east.dot[0] > normal.dot[0]);
assert.ok(north.dot[1] < normal.dot[1], 'North is up, including southern latitudes');
assert.equal(normal.path, east.path, 'Changing coordinates moves the dot on the same outline');
assert.equal(normal.path, north.path);
assert.equal(normal.dot[1], east.dot[1]);
assert.equal(normal.dot[0], north.dot[0]);
for (const point of [null, undefined, [], [151, NaN], [Infinity, -34], ['151', -34], [200, -34], [151, -100]]) {
  const result = thumbnailGeometry({...bondi, point});
  assert.equal(result.dot, null);
  assert.equal(result.path, normal.path, 'Missing coordinates keep the state silhouette');
}
assert.equal(thumbnailGeometry({...bondi, state_id: 'unknown'}).path, '');
for (const [state_id, point, label] of [
  ['VIC', [145.11, -38.04], 'VIC'], ['TAS', [147.32, -42.9], 'TAS'],
  ['JBT', [150.72, -35.13], 'JBT'], ['EXT', [105.64, -10.48], 'CX'],
  ['EXT', [96.84, -12.18], 'CC'], ['EXT', [167.95, -29.05], 'NF'],
  ['NSW', [159.08, -31.55], 'NSW'], ['VIC', [150.1, -38], 'VIC'],
]) for (const compact of [false, true]) {
  const result = thumbnailGeometry({...bondi, state_id, point}, {compact});
  assert.equal(result.label, label);
  assert.ok(result.path && !/NaN|Infinity/.test(result.path));
  assert.ok(result.dot[0] >= 10 && result.dot[0] <= result.width - 10);
  assert.ok(result.dot[1] >= 10 && result.dot[1] <= result.height - 25);
}
assert.equal(Object.keys(STATE_OUTLINES).length, 12);
assert.equal(thumbnailGeometry({...bondi, state_id: 'EXT', point: null}).dot, null);
assert.equal(thumbnailGeometry({...bondi, state_id: 'EXT', point: [139.28568, -16.4806]}).path, '',
  'An unverified mainland EXT record must not be placed on an unrelated island outline');

const window = new Window({url: 'https://example.test/finfolk/?view=discover&section=index&state=NSW&area=nsw',
  settings: {disableJavaScriptFileLoading: true, disableCSSFileLoading: true}});
window.document.write(await readFile(new URL('../web/index.html', import.meta.url), 'utf8'));
for (const key of ['document', 'location', 'history']) globalThis[key] = window[key];
try {
  const thumbnail = beachThumbnail(bondi);
  assert.equal(thumbnail.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(thumbnail.getAttribute('aria-label'), 'Bondi Beach location in New South Wales');
  assert.equal(thumbnail.querySelectorAll('circle').length, 1);
  assert.ok(thumbnail.querySelector('desc').textContent.includes('Australian Bureau of Statistics'));
  const missing = beachThumbnail({...bondi, point: null});
  assert.equal(missing.querySelector('circle'), null);
  assert.ok(missing.getAttribute('aria-label').includes('Location unavailable'));

  const beach = {...bondi, area_id: 'nsw', area_name: 'Sydney', has_access_facts: true, facts: []};
  const catalog = {beaches: [beach], states: [{id: 'NSW', name: 'New South Wales'}],
    areas: [{id: 'nsw', name: 'Sydney', state_id: 'NSW'}]};
  let opened = '', requests = 0;
  const discovery = installDiscovery({catalog,
    summaries: {beaches: [{id: beach.id, depths: {10: {distance_m: 350}}}]}, guides: {}, social: {posts: []},
    navigation: {route: {view: 'discover'}, subscribe() {}, navigate() {}},
    onSelect: id => {opened = id;}, onArea() {}, loadJSON: async () => {requests++; return {};}});
  const $ = id => document.getElementById(id);
  assert.equal(document.querySelectorAll('#recommendations .beach-thumbnail').length, 1);
  assert.equal(document.querySelectorAll('#areas-tree .beach-thumbnail--compact').length, 1);
  document.querySelector('.beach-directory-open .beach-thumbnail').dispatchEvent(new window.MouseEvent('click', {bubbles: true}));
  assert.equal(opened, beach.id, 'The directory thumbnail opens the existing beach action');
  $('beach-search').value = 'Bondi';
  $('beach-search').dispatchEvent(new window.Event('input'));
  assert.equal(document.querySelectorAll('#beach-results .beach-thumbnail').length, 1);
  opened = '';
  document.querySelector('#beach-results .beach-thumbnail').dispatchEvent(new window.MouseEvent('click', {bubbles: true}));
  assert.equal(opened, beach.id, 'The card thumbnail opens the existing beach action');
  assert.equal(requests, 0, 'Thumbnails do not request map tiles or beach details');
  await discovery.select(beach.id);
  assert.equal(document.querySelectorAll('.beach-heading .beach-thumbnail--compact').length, 1);
  assert.equal(document.querySelector('.beach-heading h2').textContent, beach.name);
  console.log('Beach thumbnail checks passed: dynamic coordinates, shared projection, islands, missing locations, accessible SVGs and all four discovery placements.');
} finally {
  await window.happyDOM.close();
}
