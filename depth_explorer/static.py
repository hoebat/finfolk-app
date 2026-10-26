"""Build a backend-free Pages artifact from locally prepared survey data."""
import array
import gzip
import hashlib
import json
import math
import shutil
import sys
import tempfile
from pathlib import Path

from .net import atomic_json
from .raster import Raster, gis
from .store import Store, timestamp

PROJECT = Path(__file__).resolve().parents[1]
CHUNK_SIZE = 256
LFS_POINTER = b"version https://git-lfs.github.com/spec/v1"


def is_pointer(path):
    with Path(path).open("rb") as source:
        return source.read(len(LFS_POINTER)) == LFS_POINTER


def chunk_bytes(values):
    data = array.array("f", values)
    if sys.byteorder != "little":
        data.byteswap()
    return gzip.compress(data.tobytes(), mtime=0)


def export_raster(store, meta, output, write):
    raster = Raster(store.root, meta)
    chunks = {}
    data_location = None
    factor = -1 if meta["value_kind"] == "elevation" else 1
    if raster.ascii:
        width, height = raster.width, raster.height
        affine = [raster.cell, 0, raster.west, 0, -raster.cell, raster.north]
        projection = "EPSG:4326"
        def block(row, col):
            values = [float("nan")] * CHUNK_SIZE**2
            for y in range(min(CHUNK_SIZE, height - row)):
                for x in range(min(CHUNK_SIZE, width - col)):
                    value = raster.values[(row + y) * width + col + x]
                    if math.isfinite(value) and value != raster.nodata:
                        values[y * CHUNK_SIZE + x] = value * factor
            return values
        dataset = None
    else:
        np, rio = gis()
        from rasterio.windows import Window
        dataset = rio.open(raster.path)
        width, height = dataset.width, dataset.height
        affine = list(dataset.transform)[:6]
        projection = dataset.crs.to_proj4()
        if "+nadgrids=" in projection:
            dataset.close()
            raise ValueError("Static projection requires datum-grid assets; rectify this raster to a supported CRS first")
        def block(row, col):
            data = np.full((CHUNK_SIZE, CHUNK_SIZE), np.nan, dtype="float32")
            h, w = min(CHUNK_SIZE, height - row), min(CHUNK_SIZE, width - col)
            source = dataset.read(1, window=Window(col, row, w, h), masked=True).astype("float32").filled(np.nan)
            data[:h, :w] = (source * dataset.scales[0] + dataset.offsets[0]) * factor
            return data.ravel()
    try:
        for row in range(0, height, CHUNK_SIZE):
            for col in range(0, width, CHUNK_SIZE):
                values = block(row, col)
                if data_location is None:
                    first = next((i for i, v in enumerate(values) if math.isfinite(v) and v > 0), None)
                    if first is not None:
                        y, x = divmod(first, CHUNK_SIZE)
                        a, b, c, d, e, f = affine
                        native_x = a * (col + x + .5) + b * (row + y + .5) + c
                        native_y = d * (col + x + .5) + e * (row + y + .5) + f
                        if raster.ascii:
                            data_location = [native_x, native_y]
                        else:
                            from rasterio.warp import transform
                            lon, lat = transform(dataset.crs, "EPSG:4326", [native_x], [native_y])
                            data_location = [lon[0], lat[0]]
                if not any(math.isfinite(v) for v in values):
                    continue
                key = f"{col // CHUNK_SIZE}/{row // CHUNK_SIZE}"
                path = f"data/grids/{meta['id']}/{key}.f32.gz"
                write(path, chunk_bytes(values))
                chunks[key] = path
    finally:
        if dataset:
            dataset.close()
    # Native coordinates and cells are retained; only the display PNGs are reprojected.
    return {**{k: v for k, v in meta.items() if k not in ("file", "originals")}, "data_location": data_location,
            "grid": {"width": width, "height": height, "transform": affine, "projection": projection,
                     "chunk_size": CHUNK_SIZE, "encoding": "gzip-float32-le-positive-depth", "chunks": chunks}}


def tile_range(bbox, zoom):
    west, south, east, north = bbox
    count = 2 ** zoom
    def xy(lon, lat):
        lat = max(-85.05112878, min(85.05112878, lat))
        return (max(0, min(count - 1, math.floor((lon + 180) / 360 * count))),
                max(0, min(count - 1, math.floor((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * count))))
    left, top = xy(west, north)
    right, bottom = xy(east, south)
    return left, top, right, bottom


def build(store, output, max_zoom=None, budget_mb=850, vendor=None):
    output = Path(output).resolve()
    protected = [PROJECT, PROJECT / "web", PROJECT / "depth_explorer", store.root]
    if (any(output == path or output in path.parents for path in protected)
            or any(path in output.parents for path in protected[1:]) or output.is_symlink()):
        raise ValueError("Choose a dedicated build output directory")
    if output.exists() and not (output / ".depth-atlas-build").is_file():
        raise ValueError("Refusing to replace a directory without a Depth Atlas build marker")
    if store.root.exists():
        for path in store.root.rglob("*"):
            if path.is_file() and is_pointer(path):
                raise ValueError(f"Unresolved Git LFS pointer: {path}. Run git lfs pull; Actions checkout must use lfs: true")
    if max_zoom is not None and not 5 <= max_zoom <= 17:
        raise ValueError("--max-zoom must be between 5 and 17")
    if not 0 < budget_mb <= 950:
        raise ValueError("Site budget must be between 0 and 950 MiB")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent, prefix="depth-build-") as temp:
        stage = Path(temp) / "site"
        stage.mkdir()
        total = 0
        def write(relative, data):
            nonlocal total
            total += len(data)
            if total > budget_mb * 1024**2:
                raise ValueError("Static site exceeds configured Pages size budget; reduce tile zoom or coverage")
            path = stage / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        for path in (PROJECT / "web").iterdir():
            if path.is_file():
                write(path.name, path.read_bytes())
        write(".nojekyll", b"")
        write(".depth-atlas-build", b"Generated by depth_explorer.static\n")
        catalog = store.catalog()
        vendor_path = Path(vendor) if vendor else PROJECT / "node_modules/proj4/dist/proj4.js"
        needs_projection = False
        for region in catalog["regions"]:
            if len({meta["datum"].strip().casefold() for meta in region["rasters"]}) > 1:
                raise ValueError("Cannot publish incompatible vertical datums within one region")
            region["rasters"] = [export_raster(store, meta, stage, write) for meta in region["rasters"]]
            needs_projection |= any(meta["grid"]["projection"] not in ("EPSG:4326", "EPSG:3857") for meta in region["rasters"])
            contour_path = f"data/contours/{region['id']}.geojson"
            write(contour_path, json.dumps(store.contours(region["id"]), allow_nan=False, separators=(",", ":")).encode())
            region["contour_file"] = contour_path
            region["tiles"] = {}
            if not region["rasters"]:
                continue
            resolution = min(meta["resolution_m"] for meta in region["rasters"])
            highest = max_zoom if max_zoom is not None else max(10, min(16, math.ceil(math.log2(156543.034 * math.cos(math.radians(region["center"][1])) / resolution))))
            region["tile_max_zoom"] = highest
            # Include full region limits but never generate cells outside valid file extents.
            rasters = store.layers(region["id"])
            for zoom in range(5, highest + 1):
                candidates = set()
                for layer in rasters:
                    w, s, e, n = layer.bounds
                    a, b, c, d = region["bbox"]
                    bounds = [max(w, a), max(s, b), min(e, c), min(n, d)]
                    if bounds[0] >= bounds[2] or bounds[1] >= bounds[3]:
                        continue
                    left, top, right, bottom = tile_range(bounds, zoom)
                    candidates.update((x, y) for x in range(left, right + 1) for y in range(top, bottom + 1))
                if len(candidates) > 50_000:
                    raise ValueError("More than 50,000 display tiles at one zoom; reduce --max-zoom")
                for x, y in sorted(candidates):
                    key = f"{zoom}/{x}/{y}"
                    path = f"data/tiles/{region['id']}/{key}.png"
                    write(path, store.tile(region["id"], zoom, x, y))
                    region["tiles"][key] = path
        if vendor_path.is_file():
            write("vendor/proj4.js", vendor_path.read_bytes())
            modules = vendor_path.resolve().parents[2]
            for name in ("proj4", "mgrs", "wkt-parser"):
                package = modules / name
                for licence in package.glob("LICENSE*"):
                    if licence.is_file():
                        write(f"vendor/licenses/{name}-{licence.name}", licence.read_bytes())
        elif needs_projection:
            raise ValueError("Projected rasters require the bundled Proj4js library. Run npm install --ignore-scripts before building")
        catalog.update(mode="static", built_at=timestamp(), format_version=1)
        payload = json.dumps(catalog, allow_nan=False, separators=(",", ":")).encode()
        write("data/catalog.json", payload)
        report = {"bytes": total, "regions": {r["id"]: {"rasters": len(r["rasters"]), "tiles": len(r["tiles"]), "status": r["status"]} for r in catalog["regions"]}, "built_at": catalog["built_at"]}
        write("build-report.json", json.dumps(report, indent=2).encode())
        if output.exists():
            shutil.rmtree(output)
        shutil.move(str(stage), output)
        return report
