"""Acquisition and explicit metadata-verified raster import."""
import json
import math
import shutil
import tempfile
import uuid
from pathlib import Path

from .catalog import REGIONS
from .net import atomic_json, normalize_contours, query_features
from .raster import Raster, clip_cog
from .store import sha256, timestamp


def fetch_contours(store, region_id):
    region = REGIONS[region_id]
    try:
        collections, service_metadata = [], {"layers": []}
        for service in region.get("contour_services", [region["contour_service"]]):
            part, metadata = query_features(service, region["bbox"])
            for feature in part["features"]:
                feature["properties"]["source_url"] = service
            collections.extend(part["features"])
            service_metadata["layers"].append({"url": service, "metadata": metadata})
        # A failed layer leaves the entire archived region intact. Major/minor
        # services can overlap; preserve a single record for identical geometry.
        unique = {}
        for feature in collections:
            props = {k.lower(): v for k, v in feature["properties"].items()}
            key = json.dumps([feature["geometry"], props.get(region["contour_field"].lower()), props.get("datum")], sort_keys=True)
            unique.setdefault(key, feature)
        collection = {"type": "FeatureCollection", "features": list(unique.values())}
        return save_contours(store, region_id, collection, service_metadata)
    except Exception as exc:
        inventory = store.load()
        inventory["acquisitions"].append({"region": region_id, "at": timestamp(), "status": "failed", "error": str(exc), "url": region["contour_service"]})
        store.save(inventory)
        raise


def save_contours(store, region_id, collection, service_metadata=None):
    region = REGIONS[region_id]
    normalized = normalize_contours(collection, region)
    if not normalized["features"]:
        raise ValueError("No contours found; existing local contours have been retained")
    ident = uuid.uuid4().hex[:12]
    raw = store.root / "raw" / region_id / ("contours-" + ident)
    raw.mkdir(parents=True, exist_ok=True)
    atomic_json(raw / "original.geojson", collection)
    if service_metadata:
        atomic_json(raw / "service.json", service_metadata)
    destination = store.root / "processed" / region_id / ("contours-" + ident + ".geojson")
    atomic_json(destination, normalized)
    metadata = {"file": str(destination.relative_to(store.root)), "count": len(normalized["features"]),
                "source_revision": region.get("source_revision", 0),
                "source_urls": region.get("contour_services", [region["contour_service"]]),
                "query_bbox": list(region["bbox"]) if service_metadata is not None else None,
                "downloaded_at": timestamp(), "sha256": sha256(raw / "original.geojson"),
                "source_url": region["contour_service"], "datum": region["contour_datum"],
                "survey_date": region["contour_survey"], "licence": region["licence"], "attribution": region["attribution"]}
    inventory = store.load()
    inventory["contours"][region_id] = metadata
    inventory["acquisitions"].append({"region": region_id, "at": timestamp(), "status": "complete", "kind": "contours", "count": metadata["count"]})
    store.save(inventory)
    return metadata


def import_rasters(store, region_id, files, metadata):
    required = ("title", "datum", "survey_date", "resolution_m", "value_kind", "quality", "source_url", "attribution", "licence")
    if any(not metadata.get(key) for key in required):
        raise ValueError("Metadata must include: " + ", ".join(required))
    if metadata.get("datum_verified") is not True or metadata.get("units") != "m":
        raise ValueError("Confirm datum_verified=true and units=m after checking source metadata")
    resolution = float(metadata["resolution_m"])
    if not math.isfinite(resolution) or resolution <= 0:
        raise ValueError("resolution_m must be a positive number")
    if metadata["value_kind"] not in ("elevation", "depth"):
        raise ValueError("value_kind must be elevation (positive up) or depth (positive down)")
    if metadata["quality"] not in ("measured", "mixed", "unknown"):
        raise ValueError("quality must be measured, mixed, or unknown")
    if region_id not in REGIONS:
        raise ValueError("Unknown region")
    inventory = store.load()
    for existing in inventory["rasters"]:
        if existing["region"] == region_id and existing["datum"].strip().casefold() != metadata["datum"].strip().casefold():
            raise ValueError("This region already contains a different vertical datum; use a separate data directory")
    files = [Path(f).resolve() for f in files]
    if not files or not all(path.is_file() for path in files):
        raise ValueError("Provide existing raster files")
    ident = region_id + "-" + uuid.uuid4().hex[:12]
    store.root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=store.root, prefix="import-") as temp:
        staging = Path(temp)
        raw = staging / "raw"
        raw.mkdir()
        originals = []
        for index, source in enumerate(files):
            target = raw / (f"{index:03d}-" + source.name)
            shutil.copy2(source, target)
            originals.append({"file": str(Path("raw") / ident / target.name), "original_name": source.name, "sha256": sha256(target), "bytes": target.stat().st_size})
        if files[0].suffix.lower() == ".asc":
            if len(files) != 1 or metadata.get("native_crs") != "EPSG:4326":
                raise ValueError("ASCII import accepts one grid with explicit native_crs=EPSG:4326; use GeoTIFF for projected rasters")
            processed = staging / "raster.asc"
            shutil.copy2(files[0], processed)
            details = {"native_crs": "EPSG:4326"}
        else:
            processed = staging / "raster.tif"
            details = clip_cog(files, processed, REGIONS[region_id]["bbox"])
        meta = {**metadata, **details, "id": ident, "region": region_id, "resolution_m": resolution,
                "imported_at": timestamp(), "originals": originals}
        candidate = Raster(staging, {**meta, "file": processed.name})
        a, b, c, d = candidate.bounds
        w, s, e, n = REGIONS[region_id]["bbox"]
        if max(a, w) >= min(c, e) or max(b, s) >= min(d, n):
            raise ValueError("Grid does not intersect selected region")
        meta["bounds"] = candidate.bounds
        meta["file"] = str(Path("processed") / ident / processed.name)
        meta["sha256"] = sha256(processed)
        atomic_json(raw / "metadata.json", meta)
        final_raw = store.root / "raw" / ident
        final_processed = store.root / "processed" / ident
        final_raw.parent.mkdir(parents=True, exist_ok=True)
        final_processed.mkdir(parents=True, exist_ok=False)
        shutil.move(str(raw), final_raw)
        shutil.move(str(processed), final_processed / processed.name)
        inventory["rasters"].append(meta)
        store.save(inventory)
    return meta
