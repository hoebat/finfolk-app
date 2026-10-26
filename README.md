# Shore Depth Explorer

A **backend-free GitHub Pages map** for Port Phillip Bay and Bondi Beach: coloured seabed depths, published and derived contours, point inspection, seabed profiles, PNG maps and CSV exports.

The deployed site is plain HTML, CSS, JavaScript, JSON, PNG and compressed numeric chunks. Point inspection, profiles and contours run in the browser. Python/GDAL is used **only to acquire and prepare data before publishing**. The optional street basemap uses OpenStreetMap; bathymetry requests stay on the static site.

**Data location pins** mark published contour vertices and verified underwater raster cells. Nearby pins are grouped in stable world coordinates, so panning and resizing do not change group membership. Group numbers count data records, not depth. Click a group to fit its extent or choose an individual record from a paginated list; overlapping records can be inspected without repeatedly zooming. The **Data locations** switch hides or shows pins independently of contour lines. A raster without a verified cell location is labelled as a file footprint, which may contain gaps.

## Deploy on GitHub Pages

1. In [repository Settings → Pages](https://github.com/hoebat/shore-depth-explorer/settings/pages), set **Build and deployment → Source → GitHub Actions**.
2. Push to `main`, or run **Test, build and deploy GitHub Pages** from the Actions tab.
3. The expected project-site address is **https://hoebat.github.io/shore-depth-explorer/**. The deploy job reports the actual URL when deployment succeeds.

The workflow checks out Git LFS objects, installs build dependencies, runs tests, acquires any missing government contour layers, builds `_site/`, and deploys that artifact. Pull requests run tests/builds without deploying or acquiring new data. If government services are unavailable, the workflow emits a warning and retains honest empty coverage; it does not generate substitute depths. Existing archived contour layers are never automatically replaced.

**Git LFS and Pages:** GitHub does not support directly serving LFS pointers as Pages content. This project uses `actions/checkout` with `lfs: true`, then publishes *materialized, derived files* in a Pages artifact. The build rejects unresolved LFS pointers. Source GeoTIFFs and archives remain in LFS and are not duplicated into the site. [GitHub LFS documentation](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage), [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Pages sites have a 1 GB published-size limit. This builder defaults to an **850 MiB budget** and fails before replacing the existing artifact if it exceeds that budget. Reduce coverage or display tile zoom rather than committing a larger site. Git LFS storage/download quotas are separate. [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Build and preview locally

Use Python 3.12 or 3.13, Node 22+, and Git LFS:

```sh
git clone https://github.com/hoebat/shore-depth-explorer.git
cd shore-depth-explorer
git lfs install --local
git lfs pull
python3.13 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm install --ignore-scripts
.venv/bin/python -m depth_explorer build-static
.venv/bin/python -m depth_explorer.server
```

Open **http://127.0.0.1:8765**. This is a read-only static-file preview, not an application backend. Any ordinary static HTTP server can serve `_site/`. Do not open `index.html` directly through `file://`; browsers restrict module and data fetches there.

All links/data requests are relative, so the same artifact works at a domain root or at `/shore-depth-explorer/`. Proj4js 2.22.0 is bundled from the pinned npm dependency for projected native grids; it is not fetched from a CDN at runtime. A build containing only empty coverage or geographic ASCII grids needs no GIS/npm packages, which allows basic offline checks.

## Acquire government data

The default local archive is **`datasets/`**. Its inventory, source metadata, raw files, and processed files are tracked; large survey formats use Git LFS through `.gitattributes`. Build output, local environments and `data/` from the original prototype are ignored. Use `--data /another/archive` before the subcommand if necessary.

### Published contours

```sh
.venv/bin/python -m depth_explorer fetch-contours all
```

The downloader enumerates intersecting object IDs, downloads batches, verifies that every expected feature was received, and only then replaces the local contour reference. It retains originals, metadata, checksums, download times, survey dates and attribution. Failures leave existing data intact. Victoria's unverified contour datum codes are preserved rather than relabelled AHD.

### Numeric bathymetry rasters

Numeric rasters are necessary for point values and depth profiles. Catalogue links can require interactive selection or a data order; a link labelled TIFF may be a styled map rather than an elevation raster.

| Area | Government source and download route | `[west, south, east, north]` |
| --- | --- | --- |
| Port Phillip Bay | [VCDEM 2021, 10 m](https://discover.data.vic.gov.au/dataset/victorian-coastal-digital-elevation-model-2021-vcdem-10m) → [DataShare](https://datashare.maps.vic.gov.au/search?md=373819c3-70dd-473c-9ceb-02d879950cf6) | `[144.35, -38.35, 145.18, -37.80]` |
| Bondi | [NSW marine lidar 2018, 5 m](https://data.nsw.gov.au/data/dataset/marine-lidar-topo-bathy-2018) → [ELVIS](https://elevation.fsdf.org.au/) | `[151.265, -33.915, 151.315, -33.875]` |

Download only intersecting numeric GeoTIFFs. NSW's small catalogue ZIP is a **coverage index**, not the elevation rasters. The NSW source describes its grids as elevations relative to AHD; verify the delivered tile metadata. For additional offshore coverage, inspect the [combined NSW lidar/multibeam catalogue](https://www.data.nsw.gov.au/data/dataset/nsw-bathymetry-sourced-from-multibeam-and-marine-lidar-surveys).

Victoria documents a newer [2022 DEM update](https://www.marineandcoasts.vic.gov.au/__data/assets/pdf_file/0033/691791/Victorian_Bathymetric_Dataset_Update_2022_Report.pdf); its availability is not assumed. A newer verified product can be imported using its own metadata. Some Victorian rasters may require contacting the custodian; this project sends no emails or requests on your behalf.

For a verified direct HTTPS download, archive it with:

```sh
.venv/bin/python -m depth_explorer download bondi 'https://publisher.example/verified-survey.tif' --name bondi-survey.tif
```

Replace the example URL. Checksums and timestamps are recorded. ZIPs are stored without automatic extraction. Existing downloads are not overwritten.

### Import and commit rasters through Git LFS

```sh
cp metadata/bondi.example.json metadata/bondi.local.json
# Edit the copy against the delivered survey metadata.
# Set datum_verified=true only after verifying the vertical datum.
.venv/bin/python -m depth_explorer import-raster bondi /path/to/tiles/*.tif --metadata metadata/bondi.local.json
.venv/bin/python -m depth_explorer build-static

git add .gitattributes datasets/
git lfs status
git lfs ls-files
git commit -m "Add verified Bondi bathymetry"
git push origin main
```

Repeat for `port-phillip`. `.gitattributes` tracks GeoTIFF, ZIP, LAS/LAZ, ASCII grids, numeric binary/gzip files and archived contour GeoJSON in Git LFS. Small inventories and metadata remain ordinary Git files. LFS must be installed **before adding survey files**. The build never publishes an unresolved pointer.

- Units must be metres. `value_kind=elevation` means positive up, so displayed reference depth is its negative. `value_kind=depth` is already positive down.
- `resolution_m` is effective source horizontal spacing, not vertical accuracy. `quality` is `measured`, `mixed`, or `unknown`, determined from source documentation.
- Imports clip to the region envelope and mosaic compatible input rasters in their native CRS/resolution. Scale/offset and validity masks are retained in a numeric Cloud Optimized GeoTIFF. Within one import, first-valid input pixels win. Later imports override earlier imports only where the later raster is valid.
- All layers in one region must share a verified vertical datum. No vertical datum conversion is guessed. Use separate archives for incompatible datums.
- Original files are copied unchanged with SHA-256 checksums. Keep `datasets/inventory.json`, its referenced processed files and provenance archives together.

## Measure the distance to a depth contour

The **Distance to depth** panel works with published contour data; a numeric raster is not required. Choose an available contour depth, then pick a beach entry point. The app calculates the nearest point on the actual contour segments using spherical geometry, draws the straight line, and displays one-way and return distances. It does not interpolate an absent contour, infer current water depth, or assess whether the line is a suitable swimming route.

The **Edithvale example** uses [Kingston Council’s Life Saving Club location](https://www.kingston.vic.gov.au/community/get-involved/community-groups/Edithvale-Life-Saving-Club), snaps to the nearest published **0 m / low-water-mark** line, then measures to the chosen contour. [Open the Edithvale example](https://hoebat.github.io/shore-depth-explorer/?site=edithvale). Using the currently published Port Phillip dataset, the 10 m contour is approximately **1.9 km from the mapped low-water mark** near the club, or about **3.8 km return**. The survey catalogue spans 1971–2000 and its vertical datum remains unverified. The mapped low-water mark is not the current beach waterline.

## Static data format

`_site/data/catalog.json` lists sources, native grid dimensions/affine transforms/projections, sparse chunk paths, contour GeoJSON paths, and display tile paths. Each numeric chunk is a gzip-compressed **256 × 256 little-endian Float32 array**, with positive-down reference depth and NaN for missing cells. The last chunk of a grid is padded with NaN. Whole missing chunks are omitted from the manifest.

The browser transforms clicked coordinates into each native grid and reads the appropriate cell. Chunks are fetched lazily with a bounded cache; a profile groups reads by chunk. Referenced files that fail to load produce an error, not a zero or a fabricated gap. NaN/missing chunks remain gaps. PNG tiles are display-only and are never sampled for depths. High zooms reuse the highest available display tile; inspection still reads native cells.

Browser-derived contours use a bounded viewport sampling grid and marching triangles, rejecting cells with missing corners. They are illustrative and can be coarser than native source detail. Fine 2 m contour intervals require measured sources with horizontal spacing ≤5 m. Profiles follow a spherical transect, retain gaps, include source/datum fields, and are capped at 5,000 samples.

## Tests

```sh
.venv/bin/python -m unittest discover -s tests -v
PYTHON=.venv/bin/python npm test
node --check web/app.js
```

Tests use synthetic grids inside temporary directories. They cover sign, zero versus missing data, source priority, datum compatibility, complete contour downloads, static build safety/size limits, unresolved LFS pointers, native Python-to-browser chunk decoding, repository-relative URLs, cache behaviour, profile gaps, CSV and contours. The GIS integration test checks projected GeoTIFF clipping, masks, scales and COG output when Rasterio/Numpy are installed; the Pages workflow installs these dependencies before testing.

## Depth reference

This is surveyed seabed **reference depth**, not current water depth. AHD, chart datum and the sea surface at a selected tide are different references. There is no tide adjustment, live-condition forecast or dive-safety assessment. Survey dates differ from catalogue update dates; seabeds, sand and dredged channels may have changed. Preserve the source publishers' navigation limitations when using or exporting these datasets.
