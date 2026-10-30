"""Build coastal browse regions from official Australian locality boundaries."""
import json
import math
import os
import tempfile
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

import shapefile
from shapely.geometry import Point, box, shape
from shapely.ops import nearest_points, transform, unary_union
from shapely.strtree import STRtree

SOURCE_URL = (
    "https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/"
    "edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files/"
    "SAL_2021_AUST_GDA94_SHP.zip"
)
SOURCE_NAME = "ABS Suburbs and Localities 2021"
SOURCE_FILE = "SAL_2021_AUST_GDA94_SHP.zip"
TERRITORY_SOURCE_URL = (
    "https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/"
    "edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files/"
    "STE_2021_AUST_SHP_GDA94.zip"
)
TERRITORY_SOURCE_FILE = "STE_2021_AUST_SHP_GDA94.zip"
SOURCE_CRS = "EPSG:4283"
AREA_CRS = "EPSG:3577"
MAX_LINK_DISTANCE_M = 6000
TREE_PADDING_LAT = MAX_LINK_DISTANCE_M / 110_000
TREE_PADDING_LON = TREE_PADDING_LAT / math.cos(math.radians(45))
EARTH_RADIUS_M = 6_371_008.8


def download(cache_dir):
    """Cache the official source archive outside the browser bundle."""
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    target = cache_dir / SOURCE_FILE
    if target.is_file() and target.stat().st_size > 50_000_000 and zipfile.is_zipfile(target):
        return target
    partial = target.with_suffix(target.suffix + ".part")
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "DepthAtlas/1.0 (Australian coastal map)"})
    with urllib.request.urlopen(request, timeout=120) as response, partial.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    if partial.stat().st_size < 50_000_000 or not zipfile.is_zipfile(partial):
        partial.unlink(missing_ok=True)
        raise ValueError("ABS Suburbs and Localities archive download was incomplete")
    os.replace(partial, target)
    return target


def download_territories(cache_dir):
    """Cache the ABS state/territory source used for Jervis Bay and islands."""
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    target = cache_dir / TERRITORY_SOURCE_FILE
    if target.is_file() and target.stat().st_size > 5_000_000 and zipfile.is_zipfile(target):
        return target
    partial = target.with_suffix(target.suffix + ".part")
    request = urllib.request.Request(TERRITORY_SOURCE_URL, headers={"User-Agent": "DepthAtlas/1.0 (Australian coastal map)"})
    with urllib.request.urlopen(request, timeout=90) as response, partial.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    if partial.stat().st_size < 5_000_000 or not zipfile.is_zipfile(partial):
        partial.unlink(missing_ok=True)
        raise ValueError("ABS State and Territory boundary archive download was incomplete")
    os.replace(partial, target)
    return target


def _metres(a, b):
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return EARTH_RADIUS_M * 2 * math.asin(min(1, math.sqrt(value)))


def _records(source_zip):
    """Read only the shapefile components we need into a temporary directory."""
    with tempfile.TemporaryDirectory(prefix="abs-localities-") as temporary:
        with zipfile.ZipFile(source_zip) as archive:
            members = [name for name in archive.namelist() if Path(name).suffix.lower() in {".shp", ".shx", ".dbf", ".prj"}]
            shp_name = next((name for name in members if Path(name).suffix.lower() == ".shp"), None)
            if not shp_name:
                raise ValueError("ABS archive does not contain a Suburbs and Localities shapefile")
            for name in members:
                suffix = Path(name).suffix.lower()
                if Path(name).name.startswith("SAL_2021_AUST_GDA94"):
                    destination = Path(temporary) / ("SAL_2021_AUST_GDA94" + suffix)
                    with archive.open(name) as source, destination.open("wb") as target:
                        while chunk := source.read(1024 * 1024):
                            target.write(chunk)
        reader = shapefile.Reader(str(Path(temporary) / "SAL_2021_AUST_GDA94.shp"), encoding="utf-8")
        try:
            fields = [field[0] for field in reader.fields[1:]]
            required = {"SAL_CODE21", "SAL_NAME21"}
            if not required.issubset(fields):
                raise ValueError("ABS locality file is missing expected 2021 identifiers")
            code_index, name_index = fields.index("SAL_CODE21"), fields.index("SAL_NAME21")
            # The caller consumes the generator while this temporary directory is alive.
            yield from ((index, record.shape, record.record[code_index], record.record[name_index])
                        for index, record in enumerate(reader.iterShapeRecords()))
        finally:
            reader.close()


def _other_territory_parts(source_zip):
    """Yield separated Other Territories polygons without distant islands joined."""
    with tempfile.TemporaryDirectory(prefix="abs-territories-") as temporary:
        with zipfile.ZipFile(source_zip) as archive:
            members = [name for name in archive.namelist() if Path(name).suffix.lower() in {".shp", ".shx", ".dbf"}]
            for name in members:
                suffix = Path(name).suffix.lower()
                if Path(name).name.startswith("STE_2021_AUST_GDA94"):
                    destination = Path(temporary) / ("STE_2021_AUST_GDA94" + suffix)
                    with archive.open(name) as source, destination.open("wb") as target:
                        while chunk := source.read(1024 * 1024):
                            target.write(chunk)
        reader = shapefile.Reader(str(Path(temporary) / "STE_2021_AUST_GDA94.shp"), encoding="utf-8")
        try:
            fields = [field[0] for field in reader.fields[1:]]
            code_index = fields.index("STE_CODE21")
            for record in reader.iterShapeRecords():
                if record.record[code_index] != "9":
                    continue
                geometry = shape(record.shape.__geo_interface__)
                parts = geometry.geoms if geometry.geom_type == "MultiPolygon" else [geometry]
                yield from ((index, part) for index, part in enumerate(parts) if not part.is_empty)
                break
        finally:
            reader.close()


def _locality_for_beach(geometry, point):
    if geometry.covers(point):
        return 0.0
    closest = nearest_points(point, geometry)[1]
    return _metres((point.x, point.y), (closest.x, closest.y))


def _metric_union(geometries):
    """Dissolve localities, soften mesh-block edges, and add a nearshore overlap."""
    from pyproj import Transformer

    dissolved = unary_union(geometries)
    if dissolved.is_empty:
        return dissolved
    to_metric = Transformer.from_crs(SOURCE_CRS, AREA_CRS, always_xy=True).transform
    to_geographic = Transformer.from_crs(AREA_CRS, SOURCE_CRS, always_xy=True).transform
    projected = transform(to_metric, dissolved)
    projected = projected.buffer(1500).buffer(-800)
    projected = projected.simplify(125, preserve_topology=True)
    if not projected.is_valid:
        projected = projected.buffer(0)
    return transform(to_geographic, projected)


def build_area_regions(areas, beaches, source_zip, territory_zip=None):
    """Return compact merged locality geometry for the app's curated coastal areas."""
    areas_by_id = {area["id"]: area for area in areas if not area.get("fallback") and not area["id"].endswith("-other-coast")}
    members = [beach for beach in beaches if beach.get("area_id") in areas_by_id
               and isinstance(beach.get("point"), list) and len(beach["point"]) == 2]
    points = [Point(beach["point"]) for beach in members]
    beach_tree = STRtree(points) if points else None
    closest = {}

    # For each official locality polygon, retain the beaches within six kilometres.
    # The area assignment comes from the catalogue; geometry comes from ABS.
    for feature_index, source_shape, code, locality_name in _records(source_zip):
        if not source_shape or source_shape.shapeType not in (5, 15, 25):
            continue
        geometry = shape(source_shape.__geo_interface__)
        if geometry.is_empty:
            continue
        west, south, east, north = geometry.bounds
        nearby = beach_tree.query(box(west - TREE_PADDING_LON, south - TREE_PADDING_LAT,
                                      east + TREE_PADDING_LON, north + TREE_PADDING_LAT)) if beach_tree else []
        for beach_index in nearby:
            point = points[int(beach_index)]
            current = closest.get(int(beach_index))
            if current and current[0] == 0:
                continue
            distance = _locality_for_beach(geometry, point)
            if distance <= MAX_LINK_DISTANCE_M and (current is None or distance < current[0]):
                closest[int(beach_index)] = (distance, feature_index, code, locality_name, geometry)

    # A locality touching two directory areas is assigned to the area with the
    # strongest beach association, avoiding overlapping region fills.
    locality_areas = defaultdict(lambda: defaultdict(int))
    locality_geometry = {}
    for beach_index, (_, feature_index, code, locality_name, geometry) in closest.items():
        area_id = members[beach_index]["area_id"]
        locality_areas[feature_index][area_id] += 1
        locality_geometry[feature_index] = (code, locality_name, geometry)
    assigned = defaultdict(list)
    for feature_index, counts in locality_areas.items():
        area_id = max(counts, key=lambda candidate: (counts[candidate], candidate))
        assigned[area_id].append(locality_geometry[feature_index][2])

    # ABS suburb/locality geography does not represent Jervis Bay Territory.
    # Use its separated component from the official Other Territories boundary
    # for coastal areas that have no locality polygons.
    missing = set(areas_by_id) - set(assigned)
    if territory_zip and missing:
        territory_best = {}
        by_area = {area_id: [(index, point) for index, point in enumerate(points)
                             if members[index]["area_id"] == area_id] for area_id in missing}
        for component_index, geometry in _other_territory_parts(territory_zip):
            west, south, east, north = geometry.bounds
            for area_id, area_points in by_area.items():
                for beach_index, point in area_points:
                    if not (west - TREE_PADDING_LON <= point.x <= east + TREE_PADDING_LON
                            and south - TREE_PADDING_LAT <= point.y <= north + TREE_PADDING_LAT):
                        continue
                    distance = _locality_for_beach(geometry, point)
                    current = territory_best.get((area_id, beach_index))
                    if distance <= MAX_LINK_DISTANCE_M and (current is None or distance < current[0]):
                        territory_best[(area_id, beach_index)] = (distance, component_index, geometry)
        for area_id in missing:
            parts = {result[1]: result[2] for (candidate, _), result in territory_best.items() if candidate == area_id}
            if parts:
                assigned[area_id].extend(parts.values())

    features = []
    for area_id, geometries in assigned.items():
        merged = _metric_union(geometries)
        if merged.is_empty:
            continue
        features.append({
            "type": "Feature",
            "properties": {
                "id": area_id,
                "name": areas_by_id[area_id]["name"],
                "boundary_source": "ABS locality and territory boundaries 2021",
                "boundary_parts": len(geometries),
            },
            "geometry": merged.__geo_interface__,
        })

    return {
        "type": "FeatureCollection",
        "name": "Coastal browse regions",
        "sources": [
            {"name": SOURCE_NAME, "url": SOURCE_URL},
            {"name": "ABS State and Territory boundaries 2021", "url": TERRITORY_SOURCE_URL},
        ],
        "attribution": "© Australian Bureau of Statistics, Suburbs and Localities 2021 · CC BY 4.0",
        "limitation": "Area shapes dissolve ABS locality boundaries around listed coastal places and extend slightly offshore for display. They are discovery overlays, not legal coastal boundaries or navigation data.",
        "features": features,
    }
