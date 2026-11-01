"""Tests use explicitly synthetic fixtures, never published as real coverage."""
import io
import json
import math
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from depth_explorer.acquire import import_rasters, save_contours
from depth_explorer.catalog import REGIONS
from depth_explorer.net import normalize_contours, query_features
from depth_explorer.raster import Raster, colour, png, mercator, unmercator
from depth_explorer.server import make_handler
from depth_explorer.store import Store, distance


def metadata(**updates):
    return {"title": "SYNTHETIC TEST GRID", "datum": "TEST DATUM", "datum_verified": True,
            "units": "m", "value_kind": "elevation", "resolution_m": 100,
            "survey_date": "SYNTHETIC — not a survey", "quality": "unknown", "source_url": "https://example.test/synthetic",
            "attribution": "Test fixture only", "licence": "Test only", "native_crs": "EPSG:4326", **updates}


def fixture(path, values=None):
    path.write_text("ncols 4\nnrows 3\nxllcorner 151.27\nyllcorner -33.90\ncellsize 0.001\nNODATA_value -9999\n" +
                    (values or "2 0 -10 -20\n-5 -9999 -9999 -25\n-10 -15 -20 -30\n"))
    return path


class FixtureCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = Store(self.root / "data")
        self.file = fixture(self.root / "test.asc")

    def ingest(self, **updates):
        return import_rasters(self.store, "bondi", [self.file], metadata(**updates))


class DataTests(FixtureCase):
    def test_zero_depth_land_missing_and_extent_are_distinct(self):
        self.ingest()
        land = self.store.sample("bondi", 151.2705, -33.8975)
        zero = self.store.sample("bondi", 151.2715, -33.8975)
        gap = self.store.sample("bondi", 151.2715, -33.8985)
        outside = self.store.sample("bondi", 151.28, -33.90)
        self.assertEqual((land["status"], land["depth_m"]), ("above-datum", -2))
        self.assertEqual((zero["status"], zero["depth_m"]), ("depth", 0))
        self.assertEqual((gap["status"], gap["depth_m"]), ("no-data", None))
        self.assertIsNone(outside["depth_m"])
        self.assertEqual(self.store.sample("bondi", 151.2725, -33.8975)["depth_m"], 10)

    def test_depth_sign_is_explicit(self):
        self.ingest(value_kind="depth")
        self.assertEqual(self.store.sample("bondi", 151.2705, -33.8975)["depth_m"], 2)

    def test_import_preserves_original_and_records_checksum(self):
        meta = self.ingest()
        original = self.store.root / meta["originals"][0]["file"]
        self.assertEqual(original.read_bytes(), self.file.read_bytes())
        self.assertEqual(len(meta["sha256"]), 64)
        self.assertEqual(self.store.catalog()["regions"][1]["status"], "raster")

    def test_rejects_unverified_units_and_incompatible_datums(self):
        with self.assertRaises(ValueError): self.ingest(datum_verified=False)
        with self.assertRaises(ValueError): self.ingest(units="feet")
        with self.assertRaises(ValueError): self.ingest(resolution_m=float("nan"))
        self.ingest()
        with self.assertRaisesRegex(ValueError, "different vertical datum"):
            self.ingest(datum="OTHER DATUM")
        self.assertEqual(len(self.store.load()["rasters"]), 1)

    def test_priority_only_overrides_valid_pixels(self):
        self.ingest()
        fixture(self.file, "-40 -9999 -9999 -9999\n-9999 -9999 -9999 -9999\n-9999 -9999 -9999 -9999\n")
        self.ingest(title="SECOND TEST GRID")
        self.assertEqual(self.store.sample("bondi", 151.2705, -33.8975)["depth_m"], 40)
        self.assertEqual(self.store.sample("bondi", 151.2725, -33.8975)["depth_m"], 10)

    def test_profile_distance_step_and_gaps(self):
        self.ingest(resolution_m=20)
        profile = self.store.profile("bondi", [[151.2701, -33.8985], [151.2739, -33.8985]])
        self.assertAlmostEqual(profile["length_m"], distance([151.2701, -33.8985], [151.2739, -33.8985]))
        self.assertGreaterEqual(profile["spacing_m"], 20)
        self.assertLessEqual(len(profile["samples"]), 5000)
        self.assertEqual(profile["samples"][0]["distance_m"], 0)
        self.assertEqual(profile["samples"][-1]["distance_m"], profile["length_m"])
        self.assertTrue(any(s["depth_m"] is None for s in profile["samples"]))
        self.assertTrue(any(s["depth_m"] is not None for s in profile["samples"]))
        self.assertTrue(all(s["source"]["datum"] == "TEST DATUM" for s in profile["samples"] if s["source"]))

    def test_profile_rejects_missing_rasters_and_bad_coordinates(self):
        with self.assertRaisesRegex(ValueError, "Import a numeric raster"):
            self.store.profile("bondi", [[151.27, -33.9], [151.28, -33.9]])
        self.ingest()
        for points in ([[0, 0]], [[float("nan"), 0], [1, 1]], [[0, 0], [0, 0]]):
            with self.assertRaises(ValueError): self.store.profile("bondi", points)

    def test_contours_do_not_create_point_depths(self):
        collection = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"Contour": -10},
                      "geometry": {"type": "LineString", "coordinates": [[151.27, -33.9], [151.28, -33.89]]}}]}
        saved = save_contours(self.store, "bondi", collection)
        self.assertEqual(saved["count"], 1)
        self.assertEqual(self.store.contours("bondi")["features"][0]["properties"]["depth_m"], 10)
        self.assertEqual(self.store.catalog()["regions"][1]["status"], "contours")
        self.assertIsNone(self.store.sample("bondi", 151.275, -33.895)["depth_m"])

    def test_png_and_projection(self):
        self.assertEqual(colour(None)[3], 0)
        self.assertGreater(colour(0)[3], 0)
        image = png(1, 1, bytes(colour(0)))
        self.assertEqual(image[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(struct.unpack(">II", image[16:24]), (1, 1))
        lon, lat = unmercator(*mercator(151.28, -33.89))
        self.assertAlmostEqual(lon, 151.28)
        self.assertAlmostEqual(lat, -33.89)


class DownloadTests(unittest.TestCase):
    def test_complete_id_batches_and_partial_response_rejected(self):
        meta = {"fields": [{"name": "OBJECTID", "type": "esriFieldTypeOID"}]}
        with patch("depth_explorer.net.get_json", side_effect=[meta, {"objectIds": [1, 2]},
                   {"features": [{"properties": {"OBJECTID": 1}}, {"id": 2, "properties": {}}]}]):
            result, _ = query_features("https://example.test/layer", [1, 2, 3, 4])
            self.assertEqual(len(result["features"]), 2)
        with patch("depth_explorer.net.get_json", side_effect=[meta, {"objectIds": [1, 2]}, {"features": [{"id": 1}]}]):
            with self.assertRaisesRegex(ValueError, "Incomplete feature"):
                query_features("https://example.test/layer", [1, 2, 3, 4])

    def test_unverified_victorian_datum_code_is_retained(self):
        original = {"type": "FeatureCollection", "features": [{"properties": {"DEPTH": 12, "DATUM": 3}, "geometry": {"type": "LineString", "coordinates": [[144.8, -38], [144.9, -38]]}}]}
        feature = normalize_contours(original, REGIONS["port-phillip"])["features"][0]
        self.assertEqual(feature["properties"]["DATUM"], 3)
        self.assertIn("Unverified", feature["properties"]["datum_label"])


class StaticBuildTests(FixtureCase):
    def test_native_chunks_preserve_sign_zero_and_missing(self):
        import gzip
        from depth_explorer.static import build
        self.ingest()
        site = self.root / "site"
        report = build(self.store, site, max_zoom=5)
        self.assertFalse((site / "CNAME").exists(), "Legacy builds must not claim the production hostname")
        catalog = json.loads((site / "data/catalog.json").read_text())
        region = catalog["regions"][1]
        grid = region["rasters"][0]["grid"]
        location = region["rasters"][0]["data_location"]
        self.assertAlmostEqual(location[0], 151.2725)
        self.assertAlmostEqual(location[1], -33.8975)
        self.assertEqual(grid["projection"], "EPSG:4326")
        values = struct.unpack("<65536f", gzip.decompress((site / grid["chunks"]["0/0"]).read_bytes()))
        self.assertEqual(values[:4], (-2, 0, 10, 20))
        self.assertTrue(math.isnan(values[257]))
        self.assertEqual(grid["width"], 4)
        self.assertGreater(report["bytes"], 0)
        self.assertGreater(len(region["tiles"]), 0)
        self.assertNotIn("/api/", (site / "app.js").read_text())
        self.assertNotIn("/api/", (site / "map.js").read_text())
        app_asset = report["assets"]["app.js"]
        self.assertIn(app_asset, (site / "index.html").read_text())
        self.assertIn(report["assets"]["measure.js"], (site / app_asset).read_text())
        self.assertIn(report["assets"]["data-client.js"], (site / report["assets"]["measure.js"]).read_text())

    def test_unresolved_lfs_pointers_fail_build(self):
        from depth_explorer.static import build
        self.store.root.mkdir(parents=True)
        (self.store.root / "missing.tif").write_text("version https://git-lfs.github.com/spec/v1\noid sha256:fake\nsize 123\n")
        with self.assertRaisesRegex(ValueError, "Unresolved Git LFS pointer"):
            build(self.store, self.root / "site")

    def test_build_budget_failure_preserves_previous_artifact(self):
        from depth_explorer.static import build
        site = self.root / "site"
        build(self.store, site)
        original = (site / "data/catalog.json").read_bytes()
        with self.assertRaisesRegex(ValueError, "size budget"):
            build(self.store, site, budget_mb=.0001)
        self.assertEqual((site / "data/catalog.json").read_bytes(), original)
        with self.assertRaises(ValueError):
            build(self.store, self.store.root)


class MemoryHTTP:
    """Exercise BaseHTTPRequestHandler fully without binding a sandboxed socket."""
    def __init__(self, request): self.request = io.BytesIO(request); self.output = io.BytesIO()
    def makefile(self, mode, *args, **kwargs): return self.request if mode == "rb" else self.output
    def sendall(self, data): self.output.write(data)


class HTTPTests(FixtureCase):
    def setUp(self):
        super().setUp()
        from depth_explorer.static import build
        self.site = self.root / "site"
        build(self.store, self.site)

    def request(self, path, body=None, host="127.0.0.1:8765", origin=None):
        raw = json.dumps(body).encode() if body is not None else b""
        headers = f"{'POST' if body is not None else 'GET'} {path} HTTP/1.0\r\nHost: {host}\r\nContent-Length: {len(raw)}\r\n"
        if origin: headers += f"Origin: {origin}\r\n"
        connection = MemoryHTTP(headers.encode() + b"\r\n" + raw)
        handler = make_handler(self.site)
        with patch.object(handler, "log_message"):
            handler(connection, ("127.0.0.1", 1), object())
        response = connection.output.getvalue()
        head, body = response.split(b"\r\n\r\n", 1)
        return int(head.split(b" ")[1]), body

    def test_catalog_and_static_app(self):
        status, body = self.request("/data/catalog.json")
        self.assertEqual(status, 200)
        self.assertTrue(set(REGIONS).issubset({r["id"] for r in json.loads(body)["regions"]}))
        status, body = self.request("/")
        self.assertEqual(status, 200)
        self.assertIn(b"FinFolk", body)

    def test_invalid_inputs_and_no_file_traversal(self):
        for path in ("/api/sample?lon=NaN&lat=1", "/api/sample?region=missing&lon=1&lat=1", "/api/tiles/bondi/30/1/1.png"):
            self.assertEqual(self.request(path)[0], 404)
        self.assertEqual(self.request("/../metadata/bondi.example.json")[0], 404)
        self.assertEqual(self.request("/api/catalog", host="untrusted.test")[0], 400)
        self.assertEqual(self.request("/api/profile", {"region": "bondi"}, origin="https://untrusted.test")[0], 501)

    def test_static_assets_are_project_path_relative(self):
        status, body = self.request("/")
        self.assertEqual(status, 200)
        self.assertRegex(body, rb'src="\./app\.[a-f0-9]{12}\.js"')
        self.assertNotIn(b'src="/app.js"', body)
        self.assertEqual(self.request("/data/")[0], 404)


try:
    import rasterio
    import numpy as np
    GIS_AVAILABLE = True
except ImportError:
    GIS_AVAILABLE = False


@unittest.skipUnless(GIS_AVAILABLE, "Optional rasterio/numpy dependencies are not installed")
class GeoTIFFTests(FixtureCase):
    def test_projected_cog_masks_scaling_and_contours(self):
        from rasterio.transform import from_origin
        from rasterio.warp import transform
        xs, ys = transform("EPSG:4326", "EPSG:7856", [151.28], [-33.89])
        source = self.root / "projected.tif"
        values = np.arange(100, dtype="float32").reshape(10, 10) * -1
        values[4, 4] = -9999
        affine = from_origin(xs[0], ys[0], 5, 5)
        with rasterio.open(source, "w", driver="GTiff", width=10, height=10, count=1, dtype="float32", crs="EPSG:7856", transform=affine, nodata=-9999) as ds:
            ds.write(values, 1)
            ds.scales = (2,)
            ds.offsets = (1,)
        meta = import_rasters(self.store, "bondi", [source], metadata(datum="AHD", resolution_m=5, quality="measured"))
        with rasterio.open(self.store.root / meta["file"]) as ds:
            self.assertEqual(ds.tags(ns="IMAGE_STRUCTURE")["LAYOUT"], "COG")
            self.assertEqual(ds.crs.to_epsg(), 7856)
        lon, lat = transform("EPSG:7856", "EPSG:4326", [xs[0]+12.5, xs[0]+22.5], [ys[0]-12.5, ys[0]-22.5])
        # Original cell [2,2] is -22; scale 2, offset 1 -> -43 -> depth 43.
        self.assertAlmostEqual(self.store.sample("bondi", lon[0], lat[0])["depth_m"], 43)
        self.assertIsNone(self.store.sample("bondi", lon[1], lat[1])["depth_m"])
        self.assertIsNone(self.store.sample("bondi", 151.31, -33.9)["depth_m"])
        try:
            import contourpy
        except ImportError:
            self.skipTest("contourpy not installed")
        collection = self.store.derived_contours("bondi", meta["bounds"], 2)
        self.assertGreater(len(collection["features"]), 0)


if __name__ == "__main__":
    unittest.main()
