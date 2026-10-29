"""Prepare broad-scale national contours around every indexed beach.

AusBathyTopo contours are 250 m model context, not a replacement for local
surveys. The original archive is cached for processing; clipped GeoJSON
collections are the active source files archived through Git LFS.
"""
import hashlib
import json
import tempfile
import urllib.request
import zipfile
from pathlib import Path

import shapefile
from rasterio.crs import CRS
from rasterio.warp import transform, transform_geom
from shapely.geometry import LineString, MultiLineString, Point, mapping
from shapely.ops import unary_union
from shapely.strtree import STRtree

from depth_explorer.national import directory
from depth_explorer.store import Store, sha256, timestamp

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://data.imas.utas.edu.au/attachments/8f007712-6a2b-4007-9529-9bd72dd37ca0/CONTOURS_shelf_AusBathyTopo2024_5m.zip"
METADATA_URL = "https://metadata.imas.utas.edu.au/geonetwork/geonetwork/api/records/8f007712-6a2b-4007-9529-9bd72dd37ca0"
DOI = "https://doi.org/10.25959/BWNC-BC86"
AREA_RADIUS_M = 10_000
MAX_DEPTH_M = 30
REVISION = 1
ARCHIVE_NAME = "ausbathy-2024-shallow-5m.zip"


def _download(cache_path):
    if cache_path.exists() and cache_path.stat().st_size > 100_000_000:
        return cache_path
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    partial = cache_path.with_suffix(cache_path.suffix + ".part")
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "DepthAtlas/1.0 (public coastal data archive)"})
    with urllib.request.urlopen(request, timeout=90) as response, partial.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    if partial.stat().st_size < 100_000_000:
        partial.unlink(missing_ok=True)
        raise ValueError("AusBathyTopo source archive download was incomplete")
    partial.replace(cache_path)
    return cache_path


def _locations(seed, national, config, packages):
    places = directory(seed, national, config, packages)
    grouped = {area["id"]: [] for area in places["areas"]}
    for beach in places["beaches"]:
        point = beach.get("entry", {}).get("point") if beach.get("entry", {}).get("verified") else None
        grouped.setdefault(beach["area_id"], []).append(point or beach["point"])
    return places["areas"], grouped


def _point_in_source_crs(point, source_crs):
    x, y = transform(CRS.from_epsg(4326), source_crs, [point[0]], [point[1]])
    return x[0], y[0]


def _line_geometry(shape_record):
    shape = shape_record.shape
    points = shape.points
    if len(points) < 2:
        return None
    starts = list(shape.parts) + [len(points)]
    lines = [LineString(points[a:b]) for a, b in zip(starts, starts[1:]) if b - a >= 2]
    if not lines:
        return None
    return lines[0] if len(lines) == 1 else MultiLineString(lines)


def _lines(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == "LineString":
        return [geometry]
    if geometry.geom_type in ("MultiLineString", "GeometryCollection"):
        return [line for item in geometry.geoms for line in _lines(item)]
    return []


def _area_buffer_digest(grouped):
    payload = {key: sorted([list(map(round, (p[0] * 100000, p[1] * 100000))) for p in points]) for key, points in sorted(grouped.items())}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _save_collections(store, areas, grouped, cache_dir):
    inventory = store.load()
    existing = inventory.get("context_contours", {}).get("ausbathy-2024-shallow-5m", {})
    digest = _area_buffer_digest(grouped)
    current_files = existing.get("areas", {})
    if (existing.get("source_revision") == REVISION and existing.get("area_points_sha256") == digest
            and set(current_files) == set(grouped)
            and all((store.root / item["file"]).is_file() and sha256(store.root / item["file"]) == item["sha256"] for item in current_files.values())):
        print("AusBathyTopo: using archived broad-scale context contours", flush=True)
        return

    cache_path = _download(cache_dir / ARCHIVE_NAME)
    with tempfile.TemporaryDirectory(prefix="ausbathy-context-") as temporary:
        with zipfile.ZipFile(cache_path) as archive:
            for member in archive.infolist():
                name = Path(member.filename).name
                if name and Path(name).suffix.lower() in (".shp", ".shx", ".dbf", ".prj"):
                    if ".." in Path(member.filename).parts:
                        raise ValueError("Unsafe file path in source archive")
                    archive.extract(member, temporary)
        shp = next(Path(temporary).glob("*.shp"))
        projection = CRS.from_wkt(shp.with_suffix(".prj").read_text())

        grouped_buffers = {}
        for area_id, points in grouped.items():
            projected = [_point_in_source_crs(point, projection) for point in points]
            grouped_buffers[area_id] = unary_union([Point(p).buffer(AREA_RADIUS_M) for p in projected]) if projected else None

        area_ids = [area_id for area_id, geom in grouped_buffers.items() if geom is not None and not geom.is_empty]
        buffers = [grouped_buffers[area_id] for area_id in area_ids]
        tree = STRtree(buffers)
        output = {area_id: [] for area_id in grouped}
        reader = shapefile.Reader(str(shp))
        depth_index = next((i for i, field in enumerate(reader.fields[1:]) if field[0].casefold() == "contour"), None)
        if depth_index is None:
            raise ValueError("AusBathyTopo archive has no Contour depth attribute")
        total = len(reader)
        for index, record in enumerate(reader.iterShapeRecords()):
            raw_depth = float(record.record[depth_index])
            depth = abs(raw_depth)
            if not 0 < depth <= MAX_DEPTH_M or depth % 5:
                continue
            line = _line_geometry(record)
            if line is None:
                continue
            for buffer_index in tree.query(line, predicate="intersects"):
                area_id = area_ids[int(buffer_index)]
                clipped = line.intersection(grouped_buffers[area_id])
                segments = _lines(clipped)
                for segment in segments:
                    if segment.length < 5:
                        continue
                    geometry = transform_geom(projection, "EPSG:4326", mapping(segment), precision=5)
                    output[area_id].append({
                        "type": "Feature",
                        "properties": {
                            "depth_m": depth,
                            "datum_label": "MSL depth",
                            "survey_date": "AusBathyTopo 250 m 2024 grid",
                            "coverage_class": "regional-context",
                            "model_resolution_m": 250,
                            "source_name": "AusBathyTopo 250 m 2024 · 5 m contours",
                            "source_url": DOI,
                        },
                        "geometry": geometry,
                    })
            if index and index % 10_000 == 0:
                print(f"AusBathyTopo: processed {index:,}/{total:,} source contours", flush=True)
        reader.close()

    area_records = {}
    for area_id, features in output.items():
        relative = f"processed/australia-context/{area_id}.geojson"
        path = store.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        collection = {"type": "FeatureCollection", "features": features}
        path.write_text(json.dumps(collection, separators=(",", ":")))
        area_records[area_id] = {"file": relative, "count": len(features), "sha256": sha256(path)}
        print(f"AusBathyTopo: {area_id}: {len(features):,} clipped context segments", flush=True)

    inventory["context_contours"] = {
        "ausbathy-2024-shallow-5m": {
            "title": "AusBathyTopo Australia-wide 5 m shallow contours",
            "source_url": SOURCE_URL,
            "metadata_url": METADATA_URL,
            "citation": "Flukes, E. (2025). Depth contours at multiple intervals of the Australian 250m 2024 bathymetry grid (AusBathyTopo). IMAS. https://doi.org/10.25959/BWNC-BC86",
            "licence": "CC BY 4.0",
            "attribution": "IMAS · AusBathyTopo 250 m 2024 · CC BY 4.0",
            "datum": "MSL depth (EPSG:5715)",
            "source_resolution_m": 250,
            "depth_interval_m": 5,
            "max_depth_m": MAX_DEPTH_M,
            "area_radius_m": AREA_RADIUS_M,
            "source_revision": REVISION,
            "area_points_sha256": digest,
            "prepared_at": timestamp(),
            "areas": area_records,
            "limitation": "Generalised regional context from a 250 m grid, smoothed with 200 m tolerance. Not suitable for high-precision use or navigation; nearshore/land-sea positions can be inaccurate. Use a local survey where published.",
        }
    }
    store.save(inventory)


def main(data="datasets", cache=".cache/national"):
    store = Store(data)
    seed = json.loads((ROOT / "web/beaches.json").read_text())
    config = json.loads((ROOT / "config/areas.json").read_text())
    snapshot_path = ROOT / cache / "snapshot.json"
    national = json.loads(snapshot_path.read_text()) if snapshot_path.exists() else {}
    areas, grouped = _locations(seed, national, config, store.catalog()["regions"])
    _save_collections(store, areas, grouped, ROOT / cache)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="datasets")
    parser.add_argument("--cache", default=".cache/national")
    arguments = parser.parse_args()
    main(arguments.data, arguments.cache)
