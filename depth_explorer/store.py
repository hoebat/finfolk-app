"""Local source inventory, point inspection, and resolution-aware transects."""
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

from .catalog import LIMITATION, REGIONS
from .net import atomic_json
from .raster import Raster, png, tile_bounds, unmercator


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def distance(a, b):
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, math.radians(b[0] - a[0])
    h = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(h)))


def valid_point(value):
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise ValueError("Coordinates must be [longitude, latitude]")
    lon, lat = map(float, value)
    if not math.isfinite(lon + lat) or not -180 <= lon <= 180 or not -85 <= lat <= 85:
        raise ValueError("Coordinates are outside the supported map extent")
    return lon, lat


class Store:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.inventory = self.root / "inventory.json"

    def load(self):
        return json.loads(self.inventory.read_text()) if self.inventory.exists() else {"rasters": [], "contours": {}, "acquisitions": []}

    def save(self, inventory):
        inventory["updated_at"] = timestamp()
        atomic_json(self.inventory, inventory)

    def layers(self, region):
        if region not in REGIONS:
            raise ValueError("Unknown region")
        return [Raster(self.root, meta) for meta in self.load()["rasters"] if meta["region"] == region]

    def catalog(self):
        inventory = self.load()
        regions = []
        for region in REGIONS.values():
            layers = [m for m in inventory["rasters"] if m["region"] == region["id"]]
            contours = inventory["contours"].get(region["id"])
            regions.append({**region, "rasters": layers, "contours": contours,
                            "status": "raster" if layers else "contours" if contours else "empty"})
        return {"regions": regions, "limitation": LIMITATION, "updated_at": inventory.get("updated_at")}

    def contours(self, region):
        info = self.load()["contours"].get(region)
        if not info:
            return {"type": "FeatureCollection", "features": []}
        return json.loads((self.root / info["file"]).read_text())

    def sample_many(self, region, points):
        output = [{"lon": lon, "lat": lat, "depth_m": None, "status": "no-data", "source": None} for lon, lat in points]
        for layer in reversed(self.layers(region)):  # latest import has explicit priority
            pending = [i for i, value in enumerate(output) if value["status"] == "no-data"]
            if not pending:
                break
            values = layer.samples([points[i] for i in pending])
            for i, depth in zip(pending, values):
                if depth is not None:
                    output[i].update(depth_m=depth, status="above-datum" if depth < 0 else "depth", source=layer.metadata)
        return output

    def sample(self, region, lon, lat):
        return self.sample_many(region, [valid_point([lon, lat])])[0]

    def profile(self, region, raw_points):
        if not isinstance(raw_points, list) or not 2 <= len(raw_points) <= 100:
            raise ValueError("A profile needs 2 to 100 vertices")
        points = [valid_point(point) for point in raw_points]
        layers = self.layers(region)
        if not layers:
            raise ValueError("Import a numeric raster for this region before drawing a depth profile")
        lengths = [distance(a, b) for a, b in zip(points, points[1:])]
        total = sum(lengths)
        if total < 1 or total > 150_000:
            raise ValueError("Profile length must be between 1 m and 150 km")
        resolution = min(layer.metadata["resolution_m"] for layer in layers)
        step = max(resolution, total / 4999)
        n = max(1, math.floor(total / step))
        coords, distances, segment, start = [], [], 0, 0
        for index in range(n + 1):
            along = total * index / n
            while segment < len(lengths) - 1 and along > start + lengths[segment]:
                start += lengths[segment]
                segment += 1
            t = (along - start) / lengths[segment] if lengths[segment] else 0
            a, b = points[segment], points[segment + 1]
            # Spherical interpolation keeps distance sampling uniform on long transects.
            angle = lengths[segment] / 6371008.8
            def unit(p):
                lon, lat = map(math.radians, p)
                return math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)
            if angle > 1e-12:
                va, vb = unit(a), unit(b)
                wa, wb = math.sin((1 - t) * angle) / math.sin(angle), math.sin(t * angle) / math.sin(angle)
                x, y, z = [wa * u + wb * v for u, v in zip(va, vb)]
                coords.append((math.degrees(math.atan2(y, x)), math.degrees(math.atan2(z, math.hypot(x, y)))))
            else:
                coords.append(a)
            distances.append(along)
        samples = self.sample_many(region, coords)
        for sample, along in zip(samples, distances):
            sample["distance_m"] = along
        return {"samples": samples, "length_m": total, "spacing_m": total / n,
                "datum": layers[0].metadata["datum"], "limitation": LIMITATION}

    def tile(self, region, z, x, y):
        if not 0 <= z <= 20 or not 0 <= x < 2**z or not 0 <= y < 2**z:
            raise ValueError("Invalid tile coordinates")
        pixels = bytearray(256 * 256 * 4)
        a, b, c, d = tile_bounds(z, x, y)
        west, south = unmercator(a, b)
        east, north = unmercator(c, d)
        for layer in self.layers(region):
            w, s, e, n = layer.bounds
            if max(west, w) >= min(east, e) or max(south, s) >= min(north, n):
                continue
            overlay = layer.image(z, x, y)
            for offset in range(0, len(pixels), 4):
                if overlay[offset + 3]:
                    pixels[offset:offset + 4] = overlay[offset:offset + 4]
        return png(256, 256, pixels)

    def derived_contours(self, region, bbox, interval):
        from .raster import gis
        np, _ = gis()
        try:
            import contourpy
        except ImportError as exc:
            raise RuntimeError("Generated contours need contourpy; install requirements.txt") from exc
        layers = self.layers(region)
        if not layers:
            return {"type": "FeatureCollection", "features": []}
        if interval not in (2, 5):
            raise ValueError("Contour interval must be 2 or 5 metres")
        if interval == 2 and not all(m.metadata["resolution_m"] <= 5 and m.metadata["quality"] == "measured" for m in layers):
            raise ValueError("2 m contours require measured rasters with source resolution ≤5 m")
        west, south, east, north = bbox
        resolution = min(layer.metadata["resolution_m"] for layer in layers)
        width = max(2, min(400, math.ceil(distance((west, south), (east, south)) / resolution)))
        height = max(2, min(400, math.ceil(distance((west, south), (west, north)) / resolution)))
        xs, ys = np.linspace(west, east, width), np.linspace(south, north, height)
        array = np.full((height, width), np.nan)
        for layer in layers:
            overlay = layer.surface(bbox, width, height)
            array = np.where(np.isfinite(overlay), overlay, array)
        array = np.where(array >= 0, array, np.nan)
        generator = contourpy.contour_generator(x=xs, y=ys, z=np.ma.masked_invalid(array), corner_mask=False)
        finite = array[np.isfinite(array)]
        features = []
        if len(finite):
            high = min(200, float(finite.max()))
            for level in range(interval, int(high) + 1, interval):
                for line in generator.lines(level):
                    features.append({"type": "Feature", "properties": {"depth_m": level, "datum_label": layers[0].metadata["datum"], "source_kind": "derived-contour"},
                                     "geometry": {"type": "LineString", "coordinates": line.tolist()}})
        return {"type": "FeatureCollection", "features": features,
                "sampling_grid": [width, height], "note": "Derived from a display sampling grid; point values come from native raster cells."}
