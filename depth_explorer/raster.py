"""Native-cell sampling and masked visualisation; GIS imports are optional."""
import math
import struct
import zlib
from pathlib import Path

RADIUS = 6378137.0
PALETTE = [(0, (174, 231, 228)), (5, (83, 196, 218)), (10, (39, 150, 201)),
           (20, (29, 96, 158)), (30, (23, 58, 110)), (50, (6, 22, 46))]


def mercator(lon, lat):
    lat = max(-85.05112878, min(85.05112878, lat))
    return RADIUS * math.radians(lon), RADIUS * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def unmercator(x, y):
    return math.degrees(x / RADIUS), math.degrees(2 * math.atan(math.exp(y / RADIUS)) - math.pi / 2)


def tile_bounds(z, x, y):
    half = math.pi * RADIUS
    span = 2 * half / (2 ** z)
    return (-half + x * span, half - (y + 1) * span, -half + (x + 1) * span, half - y * span)


def colour(depth):
    if depth is None or not math.isfinite(depth):
        return (0, 0, 0, 0)
    if depth < 0:
        return (58, 75, 99, 230)  # observed positive elevation, not missing data
    for (a, ca), (b, cb) in zip(PALETTE, PALETTE[1:]):
        if depth <= b:
            t = max(0, (depth - a) / (b - a))
            return (*[round(v + (w - v) * t) for v, w in zip(ca, cb)], 230)
    return (*PALETTE[-1][1], 230)


def png(width, height, rgba):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    scanlines = b"".join(b"\x00" + rgba[row * width * 4:(row + 1) * width * 4] for row in range(height))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(scanlines)) + chunk(b"IEND", b""))


def gis():
    try:
        import numpy as np
        import rasterio
        return np, rasterio
    except ImportError as exc:
        raise RuntimeError("GeoTIFF support needs the GIS dependencies. Run: .venv/bin/python -m pip install -r requirements.txt") from exc


class Raster:
    def __init__(self, root, metadata):
        self.metadata = metadata
        self.path = (Path(root) / metadata["file"]).resolve()
        self.ascii = self.path.suffix.lower() == ".asc"
        if self.ascii:
            header = {}
            with self.path.open() as source:
                for _ in range(6):
                    key, value = source.readline().split()
                    header[key.lower()] = float(value)
                self.width, self.height = int(header["ncols"]), int(header["nrows"])
                self.cell = header["cellsize"]
                self.west = header.get("xllcorner", header.get("xllcenter", 0) - self.cell / 2)
                self.south = header.get("yllcorner", header.get("yllcenter", 0) - self.cell / 2)
                self.north = self.south + self.cell * self.height
                self.nodata = header.get("nodata_value", -9999)
                self.values = [float(v) for line in source for v in line.split()]
            if len(self.values) != self.width * self.height:
                raise ValueError("ASCII grid dimensions do not match values")
            self.bounds = [self.west, self.south, self.west + self.width * self.cell, self.north]
        else:
            _, rio = gis()
            from rasterio.warp import transform_bounds
            with rio.open(self.path) as ds:
                self.bounds = list(transform_bounds(ds.crs, "EPSG:4326", *ds.bounds, densify_pts=21))

    def samples(self, coordinates):
        """Returns positive-down reference depth; above-datum elevations stay negative."""
        factor = -1 if self.metadata["value_kind"] == "elevation" else 1
        if self.ascii:
            result = []
            for lon, lat in coordinates:
                col = math.floor((lon - self.west) / self.cell)
                row = math.floor((self.north - lat) / self.cell)
                if not (0 <= col < self.width and 0 <= row < self.height):
                    result.append(None)
                    continue
                value = self.values[row * self.width + col]
                result.append(value * factor if math.isfinite(value) and value != self.nodata else None)
            return result
        _, rio = gis()
        from rasterio.warp import transform
        with rio.open(self.path) as ds:
            xs, ys = transform("EPSG:4326", ds.crs, *zip(*coordinates))
            # With no nodata tag GDAL may return unmasked zeros outside the extent.
            indices = [i for i, (x, y) in enumerate(zip(xs, ys))
                       if 0 <= ds.index(x, y)[0] < ds.height and 0 <= ds.index(x, y)[1] < ds.width]
            values = ds.sample([(xs[i], ys[i]) for i in indices], indexes=1, masked=True)
            # GDAL scale/offset are meaningful even for integer-encoded elevations.
            scale, offset = ds.scales[0], ds.offsets[0]
            result = [None] * len(coordinates)
            for i, value in zip(indices, values):
                if not bool(value.mask[0]) and math.isfinite(float(value[0])):
                    result[i] = (float(value[0]) * scale + offset) * factor
            return result

    def image(self, z, x, y, size=256):
        left, bottom, right, top = tile_bounds(z, x, y)
        if self.ascii:
            coords = [unmercator(left + (col + .5) * (right - left) / size,
                                 top - (row + .5) * (top - bottom) / size)
                      for row in range(size) for col in range(size)]
            return bytes(channel for value in self.samples(coords) for channel in colour(value))
        np, rio = gis()
        from rasterio.transform import from_bounds
        from rasterio.vrt import WarpedVRT
        from rasterio.enums import Resampling
        with rio.open(self.path) as ds:
            with WarpedVRT(ds, crs="EPSG:3857", transform=from_bounds(left, bottom, right, top, size, size),
                           width=size, height=size, resampling=Resampling.nearest, dtype="float32",
                           nodata=float("nan")) as vrt:
                values = vrt.read(1, masked=True)
                valid = ~np.ma.getmaskarray(values) & np.isfinite(values.data)
                depths = (values.data * ds.scales[0] + ds.offsets[0]) * (-1 if self.metadata["value_kind"] == "elevation" else 1)
                depths = np.where(valid, depths, 0)
                output = np.zeros((size, size, 4), dtype="uint8")
                for channel in range(3):
                    output[:, :, channel] = np.interp(depths, [p[0] for p in PALETTE], [p[1][channel] for p in PALETTE]).astype("uint8")
                output[:, :, 3] = np.where(valid, 230, 0)
                output[valid & (depths < 0)] = [58, 75, 99, 230]
                return output.tobytes()

    def surface(self, bbox, width, height):
        """Read a bounded geographic display grid in one warped raster operation."""
        np, rio = gis()
        west, south, east, north = bbox
        if self.ascii:
            xs, ys = np.linspace(west, east, width), np.linspace(south, north, height)
            values = self.samples([(float(x), float(y)) for y in ys for x in xs])
            return np.array([np.nan if v is None else v for v in values]).reshape(height, width)
        from rasterio.transform import from_bounds
        from rasterio.vrt import WarpedVRT
        from rasterio.enums import Resampling
        # Contour x/y coordinates are cell centres, so extend the warp by half a cell.
        dx, dy = (east - west) / (width - 1), (north - south) / (height - 1)
        affine = from_bounds(west - dx / 2, south - dy / 2, east + dx / 2, north + dy / 2, width, height)
        with rio.open(self.path) as ds:
            with WarpedVRT(ds, crs="EPSG:4326", transform=affine, width=width, height=height,
                           resampling=Resampling.nearest, dtype="float32", nodata=float("nan")) as vrt:
                values = vrt.read(1, masked=True).filled(float("nan"))
                values = (values * ds.scales[0] + ds.offsets[0]) * (-1 if self.metadata["value_kind"] == "elevation" else 1)
                return values[::-1]  # contour coordinates increase from south to north


def clip_cog(inputs, output, bbox):
    """Mosaic a homogeneous source in native CRS; clip and retain its internal mask."""
    np, rio = gis()
    from rasterio.merge import merge
    from rasterio.warp import transform_bounds
    from rasterio.io import MemoryFile
    from rasterio.shutil import copy
    from contextlib import ExitStack
    with ExitStack() as stack:
        sources = [stack.enter_context(rio.open(path)) for path in inputs]
        first = sources[0]
        if first.count != 1 or first.dtypes[0] not in ("float32", "float64", "int16", "int32", "uint16", "uint32"):
            raise ValueError("Expected a single numeric elevation band, not a rendered image")
        if first.crs is None:
            raise ValueError("Raster has no coordinate reference system")
        for source in sources:
            if source.count != 1 or source.crs != first.crs or source.res != first.res or source.scales != first.scales or source.offsets != first.offsets:
                raise ValueError("Mosaic inputs must share CRS, resolution, scale, offset, and one band")
            if source.transform.b or source.transform.d:
                raise ValueError("Rotated rasters must be rectified before import")
        clip_bounds = transform_bounds("EPSG:4326", first.crs, *bbox, densify_pts=21)
        # Clip to source union to avoid allocating vast all-nodata grids.
        union = [min(s.bounds.left for s in sources), min(s.bounds.bottom for s in sources),
                 max(s.bounds.right for s in sources), max(s.bounds.top for s in sources)]
        bounds = (max(clip_bounds[0], union[0]), max(clip_bounds[1], union[1]),
                  min(clip_bounds[2], union[2]), min(clip_bounds[3], union[3]))
        if bounds[0] >= bounds[2] or bounds[1] >= bounds[3]:
            raise ValueError("Raster does not intersect this region")
        cells = math.ceil((bounds[2] - bounds[0]) / first.res[0]) * math.ceil((bounds[3] - bounds[1]) / first.res[1])
        if cells > 180_000_000:
            raise ValueError("Clip exceeds 180 million cells; import smaller source groups")
        array, affine = merge(sources, bounds=bounds, dtype="float32", nodata=float("nan"), indexes=[1], masked=True)
        # Scale into physical metres so downstream exports do not lose band offsets.
        data = array.filled(float("nan")) * first.scales[0] + first.offsets[0]
        if not np.isfinite(data).any():
            raise ValueError("Clip contains no valid numeric cells")
        profile = dict(driver="GTiff", width=data.shape[2], height=data.shape[1], count=1,
                       dtype="float32", crs=first.crs, transform=affine, nodata=float("nan"))
        with MemoryFile() as memory:
            with memory.open(**profile) as target:
                target.write(data)
                target.write_mask(np.isfinite(data[0]).astype("uint8") * 255)
            copy(memory.name, output, driver="COG", compress="DEFLATE", blocksize=512,
                 overview_resampling="NEAREST")
        return {"native_crs": str(first.crs), "native_resolution": list(first.res),
                "valid_cells": int(np.isfinite(data).sum()), "total_cells": int(data.size)}
