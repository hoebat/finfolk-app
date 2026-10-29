const METRES_PER_DEGREE = 111320;
const CLUSTER_DISTANCE = 18000;
const CLUSTER_RADIUS = 30000;
const EDGE_BUFFER = 2200;
const LONE_POINT_RADIUS = 2800;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function splitCoastClusters(points) {
  const remaining = new Set(points);
  const clusters = [];
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

function coastalLinks(points) {
  if (points.length < 2) return [];
  const selected = new Uint8Array(points.length), nearestDistance = new Float64Array(points.length), parent = new Int32Array(points.length);
  nearestDistance.fill(Infinity);
  parent.fill(-1);
  selected[0] = 1;
  for (let index = 1; index < points.length; index++) {
    nearestDistance[index] = distance(points[0], points[index]);
    parent[index] = 0;
  }
  const links = [];
  for (let count = 1; count < points.length; count++) {
    let next = -1;
    for (let index = 0; index < points.length; index++) {
      if (!selected[index] && (next < 0 || nearestDistance[index] < nearestDistance[next])) next = index;
    }
    if (next < 0 || nearestDistance[next] > CLUSTER_DISTANCE) break;
    selected[next] = 1;
    links.push([points[parent[next]], points[next]]);
    for (let index = 0; index < points.length; index++) {
      if (selected[index]) continue;
      const candidate = distance(points[next], points[index]);
      if (candidate < nearestDistance[index]) {
        nearestDistance[index] = candidate;
        parent[index] = next;
      }
    }
  }
  return links;
}

// Rounded, shoreline-adjacent browse bands are approximate references, not official boundaries.
export function buildAreaZones(areas = [], beaches = []) {
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
    const points = unique.map(point => ({x: (point.lon - origin.lon) * lonScale, y: (point.lat - origin.lat) * METRES_PER_DEGREE}));
    const area = areaById.get(areaId);
    for (const cluster of splitCoastClusters(points)) {
      const radius = cluster.length === 1 ? LONE_POINT_RADIUS : EDGE_BUFFER;
      const locations = cluster.map(point => [origin.lon + point.x / lonScale, origin.lat + point.y / METRES_PER_DEGREE]);
      const xs = locations.map(point => point[0]), ys = locations.map(point => point[1]);
      const marginLon = radius / lonScale, marginLat = radius / METRES_PER_DEGREE;
      const links = coastalLinks(cluster).map(([a, b]) => [
        [origin.lon + a.x / lonScale, origin.lat + a.y / METRES_PER_DEGREE],
        [origin.lon + b.x / lonScale, origin.lat + b.y / METRES_PER_DEGREE]
      ]);
      zones.push({
        id: areaId,
        name: area.name,
        points: locations,
        lines: links,
        radius_m: radius,
        bounds: [Math.min(...xs) - marginLon, Math.min(...ys) - marginLat, Math.max(...xs) + marginLon, Math.max(...ys) + marginLat]
      });
    }
  }
  return zones;
}
