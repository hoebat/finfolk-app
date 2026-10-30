"""Cache the ABS locality boundary archive used to build map overlays."""
import argparse
from pathlib import Path

from depth_explorer.area_boundaries import download, download_territories


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=Path(".cache/area-boundaries"))
    args = parser.parse_args()
    for path in (download(args.cache), download_territories(args.cache)):
        print(f"ABS boundary source cached: {path} ({path.stat().st_size:,} bytes)", flush=True)
