const METRES_PER_DEGREE = 111320;
const CLUSTER_DISTANCE = 18000;
const CLUSTER_RADIUS = 30000;
const EDGE_BUFFER = 900;
const LONE_POINT_RADIUS = 1200;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 2) return sorted;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (const point of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function circle(center, radius, count = 18) {
  return Array.from({length: count}, (_, index) => {
    const angle = index * Math.PI * 2 / count;
    return {x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius};
  });
}

function capsule(a, b, radius, steps = 9) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const result = [];
  for (let index = 0; index <= steps; index++) {
    const theta = angle - Math.PI / 2 + index * Math.PI / steps;
    result.push({x: b.x + Math.cos(theta) * radius, y: b.y + Math.sin(theta) * radius});
  }
  for (let index = 0; index <= steps; index++) {
    const theta = angle + Math.PI / 2 + index * Math.PI / steps;
    result.push({x: a.x + Math.cos(theta) * radius, y: a.y + Math.sin(theta) * radius});
  }
  return result;
}

function bufferedHull(points) {
  if (points.length === 1) return circle(points[0], LONE_POINT_RADIUS);
  const hull = convexHull(points);
  if (hull.length <= 2) return capsule(hull[0], hull.at(-1), EDGE_BUFFER);
  const center = hull.reduce((sum, point) => ({x: sum.x + point.x / hull.length, y: sum.y + point.y / hull.length}), {x: 0, y: 0});
  const expanded = hull.map(point => {
    const length = Math.max(1, distance(point, center));
    return {x: point.x + (point.x - center.x) / length * EDGE_BUFFER, y: point.y + (point.y - center.y) / length * EDGE_BUFFER};
  });
  let smooth = expanded;
  for (let iteration = 0; iteration < 2; iteration++) {
    smooth = smooth.flatMap((point, index) => {
      const next = smooth[(index + 1) % smooth.length];
      return [
        {x: point.x * .75 + next.x * .25, y: point.y * .75 + next.y * .25},
        {x: point.x * .25 + next.x * .75, y: point.y * .25 + next.y * .75}
      ];
    });
  }
  return smooth;
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

// These are approximate browse zones around the app's beach references, not official boundaries.
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
      const polygon = bufferedHull(cluster).map(point => [origin.lon + point.x / lonScale, origin.lat + point.y / METRES_PER_DEGREE]);
      const xs = polygon.map(point => point[0]), ys = polygon.map(point => point[1]);
      zones.push({id: areaId, name: area.name, polygon, bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]});
    }
  }
  return zones;
}
