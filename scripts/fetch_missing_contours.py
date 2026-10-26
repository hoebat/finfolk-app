"""Best-effort build-time acquisition; existing archived surveys are never replaced."""
from depth_explorer.acquire import fetch_contours
from depth_explorer.catalog import REGIONS
from depth_explorer.store import Store


def main():
    store = Store("datasets")
    for region in REGIONS:
        if store.load()["contours"].get(region):
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
