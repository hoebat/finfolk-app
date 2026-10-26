"""Bounded, atomic downloads and ArcGIS feature pagination using stdlib."""
import hashlib
import json
import math
import time
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".part")
    temp.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")
    temp.replace(path)


def get_json(url, params=None):
    if params:
        url += ("&" if "?" in url else "?") + urlencode(params)
    request = Request(url, headers={"User-Agent": "DepthExplorer/1.0 (public bathymetry research)"})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=45) as response:
                data = json.load(response)
            if "error" in data:
                raise ValueError(f"ArcGIS error: {data['error']}")
            return data
        except (OSError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def download(url, destination, max_bytes=4 * 1024**3):
    if urlsplit(url).scheme != "https":
        raise ValueError("Downloads require an HTTPS URL")
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_suffix(destination.suffix + ".part")
    digest, size = hashlib.sha256(), 0
    try:
        with urlopen(Request(url, headers={"User-Agent": "DepthExplorer/1.0"}), timeout=60) as response, temp.open("wb") as output:
            if response.headers.get("Content-Type", "").startswith("text/html"):
                raise ValueError("The URL returned a web page, not a downloadable dataset")
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise ValueError("Download exceeds configured size limit")
                digest.update(chunk)
                output.write(chunk)
        temp.replace(destination)
    finally:
        temp.unlink(missing_ok=True)
    return {"url": url, "bytes": size, "sha256": digest.hexdigest(), "file": str(destination)}


def query_features(service, bbox):
    """Enumerate IDs first: never silently accept a truncated feature response."""
    metadata = get_json(service, {"f": "json"})
    fields = [f["name"] for f in metadata.get("fields", [])]
    oid = next((f["name"] for f in metadata.get("fields", []) if f["type"] == "esriFieldTypeOID"), None)
    if not oid:
        raise ValueError("Source layer has no object ID field")
    common = {"where": "1=1", "geometry": ",".join(map(str, bbox)),
              "geometryType": "esriGeometryEnvelope", "inSR": 4326,
              "spatialRel": "esriSpatialRelIntersects"}
    ids = get_json(service + "/query", {**common, "returnIdsOnly": "true", "f": "json"})
    ids = sorted(set(ids.get("objectIds") or []))
    features = []
    def fetch(batch):
        result = get_json(service + "/query", {"objectIds": ",".join(map(str, batch)),
                         "outFields": "*", "outSR": 4326, "returnGeometry": "true", "f": "geojson"})
        if result.get("exceededTransferLimit"):
            if len(batch) == 1:
                raise ValueError("Source truncated a single feature")
            mid = len(batch) // 2
            return fetch(batch[:mid]) + fetch(batch[mid:])
        return result.get("features", [])
    for offset in range(0, len(ids), 100):
        features.extend(fetch(ids[offset:offset + 100]))
    # GeoJSON sometimes puts the OID in id, sometimes in properties.
    found = {f.get("properties", {}).get(oid, f.get("id")) for f in features}
    if set(ids) != found:
        raise ValueError(f"Incomplete feature download: expected {len(ids)} IDs, got {len(found)}")
    return {"type": "FeatureCollection", "features": features}, metadata


def normalize_contours(collection, region):
    output = {"type": "FeatureCollection", "features": []}
    for feature in collection.get("features", []):
        props = feature.get("properties") or {}
        lookup = {k.lower(): v for k, v in props.items()}
        value = lookup.get(region["contour_field"].lower())
        if value is None:
            raise ValueError(f"Missing contour field {region['contour_field']}")
        depth = float(value) * region["contour_sign"]
        if not (-1000 < depth < 12000):
            raise ValueError("Implausible contour value")
        geometry = feature.get("geometry")
        if not geometry or geometry.get("type") not in ("LineString", "MultiLineString"):
            raise ValueError("Expected line contour geometry")
        lines = [geometry.get("coordinates", [])] if geometry["type"] == "LineString" else geometry.get("coordinates", [])
        for line in lines:
            if len(line) < 2:
                raise ValueError("Contour lines require at least two coordinates")
            for coordinate in line:
                if len(coordinate) < 2 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in coordinate[:2]):
                    raise ValueError("Contour coordinates must be finite numbers")
                if not -180 <= coordinate[0] <= 180 or not -90 <= coordinate[1] <= 90:
                    raise ValueError("Contours must use longitude/latitude EPSG:4326")
        output["features"].append({**feature, "properties": {
            **props, "depth_m": depth, "datum_label": region["contour_datum"],
            "survey_date": region["contour_survey"], "source_kind": "published-contour",
        }})
    return output
