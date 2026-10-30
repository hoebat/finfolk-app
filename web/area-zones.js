const METRES_PER_DEGREE = 111320;
const CLUSTER_DISTANCE = 18000;
const CLUSTER_RADIUS = 30000;
const DEFAULT_BUFFER = 2800;

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

function splitCoastClusters(points) {
  const remaining = new Set(points), clusters = [];
  while (remaining.size) {
    const seed = remaining.values().next().value;
    remaining.delete(seed);
    const cluster = [seed], queue = [seed];
    while (queue.length) {
      const current = queue.pop();
      for (const other of [...remaining]) {
        if (distance(current, other) <= CLUSTER_DISTANCE && distance(seed, other) <= CLUSTER_RADIUS) {
          remaining.delete(other);
          cluster.push(other);
          queue.push(other);
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function circumcircle(a, b, c) {
  const determinant = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(determinant) < 1e-8) return null;
  const aa = a.x * a.x + a.y * a.y, bb = b.x * b.x + b.y * b.y, cc = c.x * c.x + c.y * c.y;
  const x = (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / determinant;
  const y = (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / determinant;
  return {x, y, radius: Math.hypot(x - a.x, y - a.y)};
}

function delaunay(points) {
  if (points.length < 3) return [];
  const extent = Math.max(...points.map(point => Math.max(Math.abs(point.x), Math.abs(point.y))), 1) * 32;
  const vertices = [...points, {x: -extent, y: -extent}, {x: extent, y: -extent}, {x: 0, y: extent}];
  const count = points.length, triangles = [[count, count + 1, count + 2]];
  for (let index = 0; index < count; index++) {
    const point = vertices[index], bad = [];
    for (let t = 0; t < triangles.length; t++) {
      const triangle = triangles[t], circle = circumcircle(...triangle.map(i => vertices[i]));
      if (circle && Math.hypot(point.x - circle.x, point.y - circle.y) <= circle.radius + 1e-6) bad.push(t);
    }
    const edges = new Map();
    for (const t of bad) {
      const [a, b, c] = triangles[t];
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const key = edgeKey(u, v), edge = edges.get(key);
        if (edge) edge.count++;
        else edges.set(key, {u, v, count: 1});
      }
    }
    const removed = new Set(bad);
    for (let t = triangles.length - 1; t >= 0; t--) if (removed.has(t)) triangles.splice(t, 1);
    for (const edge of edges.values()) if (edge.count === 1) triangles.push([edge.u, edge.v, index]);
  }
  return triangles.filter(triangle => triangle.every(index => index < count));
}

function polygonArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function traceBoundary(triangles, points) {
  const edges = new Map();
  for (const [a, b, c] of triangles) for (const [u, v] of [[a, b], [b, c], [c, a]]) {
    const key = edgeKey(u, v), edge = edges.get(key);
    if (edge) edge.count++;
    else edges.set(key, {u, v, count: 1});
  }
  const remaining = new Set([...edges.values()].filter(edge => edge.count === 1).map(edge => edgeKey(edge.u, edge.v)));
  const adjacent = new Map();
  for (const key of remaining) {
    const edge = edges.get(key);
    for (const vertex of [edge.u, edge.v]) {
      if (!adjacent.has(vertex)) adjacent.set(vertex, []);
      adjacent.get(vertex).push(key);
    }
  }
  const rings = [];
  while (remaining.size) {
    const firstKey = remaining.values().next().value, first = edges.get(firstKey), start = first.u;
    let current = start, previous = -1;
    const ring = [];
    for (let guard = 0; guard <= edges.size + 1; guard++) {
      ring.push(current);
      const options = (adjacent.get(current) || []).filter(key => remaining.has(key));
      if (!options.length) break;
      let nextKey = options[0];
      if (options.length > 1 && previous >= 0) {
        const incoming = Math.atan2(points[current].y - points[previous].y, points[current].x - points[previous].x);
        let smallestTurn = Infinity;
        for (const key of options) {
          const edge = edges.get(key), next = edge.u === current ? edge.v : edge.u;
          const turn = (Math.atan2(points[next].y - points[current].y, points[next].x - points[current].x) - incoming + Math.PI * 3) % (Math.PI * 2);
          if (turn < smallestTurn) {smallestTurn = turn; nextKey = key;}
        }
      }
      remaining.delete(nextKey);
      const edge = edges.get(nextKey), next = edge.u === current ? edge.v : edge.u;
      previous = current;
      current = next;
      if (current === start) break;
    }
    if (ring.length >= 3 && current === start) rings.push(ring);
  }
  return rings;
}

// Use a local projection for a small browse-area cluster. Rings are indicative
// map regions built from reference locations, not official coastal boundaries.
function concaveRings(points) {
  if (points.length < 3) return [];
  const triangles = delaunay(points);
  const nearest = points.map((point, index) => Math.min(...points.filter((_, other) => other !== index).map(other => distance(point, other))));
  const sorted = nearest.filter(Number.isFinite).sort((a, b) => a - b);
  const spacing = sorted[Math.floor(sorted.length * .7)] || DEFAULT_BUFFER;
  const maxRadius = Math.max(5000, Math.min(14000, spacing * 3.2));
  const selected = triangles.filter(triangle => {
    const circle = circumcircle(...triangle.map(index => points[index]));
    return circle && circle.radius <= maxRadius;
  });
  return traceBoundary(selected, points).map(indices => indices.map(index => points[index]));
}

function smoothRing(ring, iterations = 1) {
  let result = ring;
  for (let pass = 0; pass < iterations; pass++) {
    const smooth = [];
    for (let i = 0; i < result.length; i++) {
      const a = result[i], b = result[(i + 1) % result.length];
      smooth.push({x: a.x * .75 + b.x * .25, y: a.y * .75 + b.y * .25});
      smooth.push({x: a.x * .25 + b.x * .75, y: a.y * .25 + b.y * .75});
    }
    result = smooth;
  }
  return result;
}

function circle(point, radius, steps = 24) {
  return Array.from({length: steps}, (_, index) => {
    const angle = Math.PI * 2 * index / steps;
    return {x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius};
  });
}

function capsule(a, b, radius, steps = 12) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x), ring = [];
  for (let index = 0; index <= steps; index++) {
    const t = angle - Math.PI / 2 + Math.PI * index / steps;
    ring.push({x: b.x + Math.cos(t) * radius, y: b.y + Math.sin(t) * radius});
  }
  for (let index = 0; index <= steps; index++) {
    const t = angle + Math.PI / 2 + Math.PI * index / steps;
    ring.push({x: a.x + Math.cos(t) * radius, y: a.y + Math.sin(t) * radius});
  }
  return ring;
}

function makeClusterRings(points) {
  if (points.length === 1) return [circle(points[0], DEFAULT_BUFFER)];
  if (points.length === 2) return [capsule(points[0], points[1], DEFAULT_BUFFER)];
  const bufferedFarthestPair = () => {
    let pair = [points[0], points[1]], farthest = 0;
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      const d = distance(points[i], points[j]);
      if (d > farthest) {farthest = d; pair = [points[i], points[j]];}
    }
    return [capsule(pair[0], pair[1], DEFAULT_BUFFER)];
  };
  let rings = concaveRings(points);
  if (!rings.length) return bufferedFarthestPair();
  rings = rings.filter(ring => Math.abs(polygonArea(ring)) >= 700000);
  return rings.length ? rings.map(ring => smoothRing(ring, 1)) : bufferedFarthestPair();
}

function buildInferredAreaZones(areas = [], beaches = []) {
  const areaById = new Map(areas.filter(area => !area.fallback && !area.id.endsWith('-other-coast')).map(area => [area.id, area]));
  const members = new Map();
  for (const beach of beaches) {
    const area = areaById.get(beach.area_id), point = beach.entry?.point || beach.point;
    if (!area || !Array.isArray(point) || point.length < 2 || !point.every(Number.isFinite)) continue;
    if (!members.has(area.id)) members.set(area.id, []);
    members.get(area.id).push({lon: point[0], lat: point[1]});
  }

  const zones = [];
  for (const [areaId, locations] of members) {
    const unique = [...new Map(locations.map(point => [`${point.lon.toFixed(5)},${point.lat.toFixed(5)}`, point])).values()];
    if (!unique.length) continue;
    const origin = unique.reduce((sum, point) => ({lon: sum.lon + point.lon / unique.length, lat: sum.lat + point.lat / unique.length}), {lon: 0, lat: 0});
    const lonScale = METRES_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);
    const localPoints = unique.map(point => ({x: (point.lon - origin.lon) * lonScale, y: (point.lat - origin.lat) * METRES_PER_DEGREE}));
    const polygons = [];
    for (const cluster of splitCoastClusters(localPoints)) for (const ring of makeClusterRings(cluster)) {
      const geographic = ring.map(point => [origin.lon + point.x / lonScale, origin.lat + point.y / METRES_PER_DEGREE]);
      if (geographic.length >= 3) polygons.push(geographic);
    }
    if (!polygons.length) continue;
    const xs = polygons.flatMap(ring => ring.map(point => point[0])), ys = polygons.flatMap(ring => ring.map(point => point[1]));
    zones.push({id: areaId, name: areaById.get(areaId).name, polygons,
      bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]});
  }
  return zones;
}

function zoneFromFeature(feature, area) {
  const geometry = feature?.geometry;
  if (!area || !geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return null;
  const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
  const polygons = rings.filter(ring => Array.isArray(ring) && ring.length >= 4
    && ring.every(point => Array.isArray(point) && point.length >= 2 && point.slice(0, 2).every(Number.isFinite)));
  if (!polygons.length) return null;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const ring of polygons) for (const [lon, lat] of ring) {
    west = Math.min(west, lon); south = Math.min(south, lat); east = Math.max(east, lon); north = Math.max(north, lat);
  }
  return {id: area.id, name: area.name, polygons,
    bounds: [west, south, east, north],
    boundarySource: feature.properties?.boundary_source || 'ABS locality boundaries'};
}

export function buildAreaZones(areas = [], beaches = [], regionCollection = null) {
  const eligible = areas.filter(area => !area.fallback && !area.id.endsWith('-other-coast'));
  const byId = new Map(eligible.map(area => [area.id, area]));
  const official = (regionCollection?.features || [])
    .map(feature => zoneFromFeature(feature, byId.get(feature.properties?.id)))
    .filter(Boolean);
  const included = new Set(official.map(zone => zone.id));
  const inferred = buildInferredAreaZones(eligible.filter(area => !included.has(area.id)), beaches);
  return [...official, ...inferred];
}
