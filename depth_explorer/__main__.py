import argparse
import importlib.util
import json
import sys
from pathlib import Path

from .acquire import fetch_contours, import_rasters
from .catalog import REGIONS
from .net import download, atomic_json
from .store import Store, timestamp


def main():
    parser = argparse.ArgumentParser(description="Download and prepare government bathymetry")
    parser.add_argument("--data", type=Path, default=Path(__file__).resolve().parents[1] / "datasets")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("catalog", help="Show sources, download portals, and current local coverage")
    sub.add_parser("doctor", help="Report optional GIS dependency availability")
    static = sub.add_parser("build-static", help="Build a backend-free GitHub Pages artifact")
    static.add_argument("--output", type=Path, default=Path("_site"))
    static.add_argument("--max-zoom", type=int)
    static.add_argument("--budget-mb", type=float, default=850)
    fetch = sub.add_parser("fetch-contours", help="Download complete government contour features")
    fetch.add_argument("region", choices=[*REGIONS, "all"])
    ingest = sub.add_parser("import-raster", help="Clip and mosaic locally downloaded numeric GeoTIFFs")
    ingest.add_argument("region", choices=REGIONS)
    ingest.add_argument("files", nargs="+", type=Path)
    ingest.add_argument("--metadata", required=True, type=Path)
    remote = sub.add_parser("download", help="Download a verified HTTPS dataset URL into the raw archive")
    remote.add_argument("region", choices=REGIONS)
    remote.add_argument("url")
    remote.add_argument("--name", required=True, help="Local file name, e.g. bondi.tif or survey.zip")
    args = parser.parse_args()
    store = Store(args.data)
    try:
        if args.command == "catalog":
            print(json.dumps(store.catalog(), indent=2))
        elif args.command == "doctor":
            print(json.dumps({"python": sys.version.split()[0], "gis": {name: importlib.util.find_spec(name) is not None for name in ("rasterio", "numpy", "contourpy")}, "data_directory": str(store.root)}, indent=2))
        elif args.command == "build-static":
            from .static import build
            print(json.dumps(build(store, args.output, args.max_zoom, args.budget_mb), indent=2))
        elif args.command == "fetch-contours":
            failed = False
            for region in REGIONS if args.region == "all" else [args.region]:
                try:
                    result = fetch_contours(store, region)
                    print(f"{region}: downloaded {result['count']} contours")
                except Exception as exc:
                    print(f"{region}: {exc}", file=sys.stderr)
                    failed = True
            return int(failed)
        elif args.command == "import-raster":
            print(json.dumps(import_rasters(store, args.region, args.files, json.loads(args.metadata.read_text())), indent=2))
        elif args.command == "download":
            if Path(args.name).name != args.name or args.name in (".", ".."):
                raise ValueError("--name must be a plain filename")
            target = store.root / "raw" / args.region / args.name
            if target.exists():
                raise ValueError("Destination exists; use a new name to preserve originals")
            record = {**download(args.url, target), "downloaded_at": timestamp(), "region": args.region}
            atomic_json(target.with_suffix(target.suffix + ".download.json"), record)
            print(json.dumps(record, indent=2))
        return 0
    except (ValueError, OSError, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
