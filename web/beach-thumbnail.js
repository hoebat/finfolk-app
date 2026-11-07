import {STATE_OUTLINES, OUTLINE_SOURCE} from './state-outlines.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const prepared = new Map();
const validPoint = point => Array.isArray(point) && point.length === 2 &&
  point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;

function outlineFor(beach) {
  if (beach.state_id !== 'EXT') return STATE_OUTLINES[beach.state_id];
  if (!validPoint(beach.point)) return null;
  // Some EXT directory records have unverified jurisdiction and mainland points.
  // Only select an island group near the coordinates; never assign a distant one.
  const separation = ({bounds: [w, s, e, n]}) =>
    Math.hypot(Math.max(w - beach.point[0], 0, beach.point[0] - e) * Math.cos(beach.point[1] * Math.PI / 180),
      Math.max(s - beach.point[1], 0, beach.point[1] - n));
  const closest = ['CC', 'CX', 'NF'].map(id => STATE_OUTLINES[id]).reduce((best, item) => {
    return !best || separation(item) < separation(best) ? item : best;
  }, null);
  return separation(closest) <= 1 ? closest : null; // Roughly 111 km of near-island context.
}

function prepare(outline) {
  if (prepared.has(outline)) return prepared.get(outline);
  const [west, south, east, north] = outline.bounds;
  // Local equirectangular projection, with longitude corrected for centre latitude.
  const cosLatitude = Math.cos((south + north) / 2 * Math.PI / 180);
  const project = ([lon, lat]) => [(lon - west) * cosLatitude, north - lat];
  const rings = outline.rings.map(ring => ring.map(project));
  const result = {project, rings, width: (east - west) * cosLatitude, height: north - south, layouts: new Map()};
  prepared.set(outline, result);
  return result;
}

/** Project the outline and the current [longitude, latitude] through one transform. */
export function thumbnailGeometry(beach, {compact = false} = {}) {
  const width = compact ? 100 : 240, height = compact ? 100 : 150;
  const outline = outlineFor(beach);
  if (!outline) return {width, height, path: '', dot: null, label: beach.state_id || '—', name: beach.state || 'Location'};
  const geometry = prepare(outline), point = validPoint(beach.point) ? geometry.project(beach.point) : null;
  const west = Math.min(0, point?.[0] ?? 0), north = Math.min(0, point?.[1] ?? 0);
  const east = Math.max(geometry.width, point?.[0] ?? 0), south = Math.max(geometry.height, point?.[1] ?? 0);
  const standardBounds = west === 0 && north === 0 && east === geometry.width && south === geometry.height;
  let layout = standardBounds ? geometry.layouts.get(compact) : null;
  if (!layout) {
    const padding = compact ? 10 : 14, footer = compact ? 19 : 23;
    const scale = Math.min((width - padding * 2) / Math.max(east - west, 1e-8),
      (height - padding * 2 - footer) / Math.max(south - north, 1e-8));
    const transform = ([x, y]) => [width / 2 + (x - (west + east) / 2) * scale,
      (height - footer) / 2 + (y - (north + south) / 2) * scale];
    const path = geometry.rings.map(ring => ring.map((point, i) =>
      (i ? 'L' : 'M') + transform(point).map(value => value.toFixed(2)).join(',')).join('') + 'Z').join('');
    layout = {transform, path};
    // Bound the cache to two layouts per outline; exceptional offshore points use their own fit.
    if (standardBounds) geometry.layouts.set(compact, layout);
  }
  return {width, height, path: layout.path, dot: point ? layout.transform(point) : null, label: outline.label, name: outline.name};
}

function svgElement(tag, attributes = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

export function beachThumbnail(beach, {compact = false} = {}) {
  const geometry = thumbnailGeometry(beach, {compact}), {width, height, path, dot, label, name} = geometry;
  const description = dot ? `${beach.name} location in ${name}` :
    `${beach.name} · ${name}. ${path ? 'Location unavailable' : 'Location map unavailable'}`;
  const svg = svgElement('svg', {viewBox: `0 0 ${width} ${height}`, width, height,
    class: 'beach-thumbnail' + (compact ? ' beach-thumbnail--compact' : ''), role: 'img', 'aria-label': description});
  svg.append(svgElement('title', {}, description), svgElement('desc', {},
    `${OUTLINE_SOURCE.attribution}. ${OUTLINE_SOURCE.licence}. Approximate geographic context.`));
  if (path) svg.append(svgElement('path', {d: path, class: 'beach-thumbnail-land', 'fill-rule': 'evenodd'}));
  if (dot) svg.append(svgElement('circle', {cx: dot[0], cy: dot[1], r: compact ? 4 : 4.5, class: 'beach-thumbnail-dot'}));
  svg.append(svgElement('text', {x: width / 2, y: height - (compact ? 7 : 9),
    'text-anchor': 'middle', class: 'beach-thumbnail-label'}, label));
  return svg;
}
