"""Acquire missing or expanded coverage; retain archived snapshots that cover it."""
from depth_explorer.acquire import fetch_contours
from depth_explorer.catalog import REGIONS
from depth_explorer.store import Store


def covers(archive_bbox, requested_bbox):
    return (isinstance(archive_bbox, list) and len(archive_bbox) == 4
            and archive_bbox[0] <= requested_bbox[0] and archive_bbox[1] <= requested_bbox[1]
            and archive_bbox[2] >= requested_bbox[2] and archive_bbox[3] >= requested_bbox[3])


def main():
    store = Store("datasets")
    for region in REGIONS:
        archived = store.load()["contours"].get(region)
        if (archived and covers(archived.get("query_bbox"), REGIONS[region]["bbox"])
                and archived.get("source_revision") == REGIONS[region].get("source_revision", 0)):
            print(f"{region}: using archived published contours")
            continue
        try:
            result = fetch_contours(store, region)
            print(f"{region}: acquired {result['count']} government contours")
        except Exception as exc:
            # No fake or coarse substitute: the public UI exposes empty coverage.
            message = str(exc).replace("\n", " ").replace("\r", " ")
            print(f"::warning::{region}: contour acquisition unavailable: {message}")


if __name__ == "__main__":
    main()
