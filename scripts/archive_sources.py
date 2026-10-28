"""Stage only active public survey sources for a Git LFS archive commit."""
import argparse
import json
import os
import shutil
import subprocess
from pathlib import Path
from depth_explorer.store import Store, sha256


def prepare(root, output):
    store = Store(root)
    inventory = store.load()
    committed = json.loads(subprocess.check_output(["git", "show", "HEAD:datasets/inventory.json"]))
    changed = inventory != committed
    if not changed:
        return False
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    paths = {"inventory.json"}
    for item in inventory["contours"].values():
        processed = Path(item["file"])
        paths.add(str(processed))
        raw = Path("raw") / processed.parent.name / processed.stem
        paths.add(str(raw / "original.geojson"))
        if item.get("sha256") and sha256(store.root / raw / "original.geojson") != item["sha256"]:
            raise ValueError("Raw survey checksum does not match inventory")
        paths.update(str(raw / name) for name in ["original.geojson", "service.json"] if (store.root / raw / name).is_file())
    for item in inventory["rasters"]:
        paths.add(item["file"])
        paths.update(original["file"] for original in item.get("originals", []))
    for relative in sorted(paths):
        path = Path(relative)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("Unsafe source archive path")
        source = store.root / path
        if not source.is_file():
            raise ValueError(f"Missing active source file: {relative}")
        target = output / path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="datasets")
    parser.add_argument("--output", default=".cache/source-archive")
    args = parser.parse_args()
    changed = prepare(args.data, args.output)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write(f"changed={str(changed).lower()}\n")
    print("Source archive prepared" if changed else "Committed source archive is current")
