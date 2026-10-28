"""Acquire missing or expanded coverage; retain archived snapshots that cover it."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from depth_explorer.acquire import contour_collection, save_contours
from depth_explorer.catalog import REGIONS
from depth_explorer.store import Store


def covers(archive_bbox, requested_bbox):
    return (isinstance(archive_bbox, list) and len(archive_bbox) == 4
            and archive_bbox[0] <= requested_bbox[0] and archive_bbox[1] <= requested_bbox[1]
            and archive_bbox[2] >= requested_bbox[2] and archive_bbox[3] >= requested_bbox[3])


def main(root="datasets", workers=3):
    store = Store(root)
    pending = []
    for region in REGIONS:
        archived = store.load()["contours"].get(region)
        if (archived and covers(archived.get("query_bbox"), REGIONS[region]["bbox"])
                and archived.get("source_revision") == REGIONS[region].get("source_revision", 0)):
            print(f"{region}: using archived published contours")
            continue
        if not REGIONS[region].get("contour_service"):
            continue
        pending.append(region)
    # Only the main thread writes the inventory; failed downloads retain archives.
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(contour_collection, region): region for region in pending}
        for future in as_completed(futures):
            region = futures.pop(future)
            try:
                collection, metadata = future.result()
                result = save_contours(store, region, collection, metadata)
                print(f"{region}: acquired {result['count']} government contours", flush=True)
            except Exception as exc:
                message = str(exc).replace("\n", " ").replace("\r", " ")
                print(f"::warning::{region}: contour acquisition unavailable: {message}", flush=True)



if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="datasets")
    parser.add_argument("--workers", type=int, choices=range(1, 5), default=3)
    args = parser.parse_args()
    main(args.data, args.workers)
