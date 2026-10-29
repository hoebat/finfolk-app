# Shore Depth Explorer

A backend-free GitHub Pages guide to Australian coastal beaches, reference depths, ocean activities and nearby camping, caravan parks and cabins.

**Discover** explains its suggestions using sourced site facts. **Areas** is sorted by state/territory → coastal region → beach. **Guides** covers ocean swimming, freediving and spearfishing, with links to official advice and fisheries authorities. Existing beach links such as `?site=edithvale`, `?site=maroubra` and `?site=hyams-beach` remain supported.

## What the data establishes

A listed beach is not a verified entry point, swim route, fishing permission or a current-conditions report. Sixteen regional contour maps cover the four original regions plus Sydney Northern Beaches, Southern Sydney, Central Coast, Hunter, Northern Rivers, Illawarra, Eurobodalla, Sapphire Coast, partial Point Danger–Tweed entrance coverage, Corner Inlet, Mallacoota and southeast Tasmania. Coverage is limited to actual published survey lines, not entire regional envelopes. Elsewhere, survey discovery and the beach directory remain useful even where depth data has not been published in the app. Numeric point depths, shading and profiles appear only when a valid raster grid is available.

The national directory uses Geoscience Australia's Composite Gazetteer, screened to within 5 km of the Natural Earth 1:10 million coastline to exclude inland records. Screening is approximate and does not produce a shoreline measurement. Directory completeness follows the source, including its named-place coverage and positional limitations. Source IDs, aliases and legacy beach IDs are retained. Nearby matching gazetteer names are merged with reviewed records rather than replacing them.

Coastal regions are curated browsing groups assigned using state/territory and nearest coastal centres, with reviewed assignments retained. They are not legal or administrative polygons. AHO naming authority does not establish a state: approximate browsing assignments keep a separate unverified legal-jurisdiction field. Jervis Bay Territory records are separate from neighbouring NSW browsing areas. Survey packages and geographic directory areas are independent.

## Discover and compare

Search names, aliases, states and regions. Filter by target contour and reference distance, or by nearby source-checked stay listings; compare up to three beaches. Discovery can focus on documented activity facts or on nearby source-checked camping. Each suggestion shows its reason and missing information. Known activity restrictions exclude a location from the relevant suggestions; missing restrictions never imply permission. Spearfishing suggestions are research leads rather than legal approvals.

Automatic 5/10/15/20 m summaries use the same spherical nearest-segment calculation as the interactive map. Estimates are limited to contours within 3 km. A sourced reference within 250 m of a mapped 0 m line may snap to that line; otherwise its original location is explicitly labelled. Monitoring points and beach polygon centres may be offshore. No tide, route or current-water-depth adjustment is made. Coarse national products are not substituted for local swim-to-depth estimates.

## Nearby stays

Select a beach to load nearby campgrounds, caravan parks and cabins. The default radius is 25 km, adjustable to 5/10/50 km. Distances are straight-line from the beach reference, not travel distances. Maps and provider links allow independent access and booking checks.

Default results are checked against a parks, council or operator listing. “Source checked” means the listing was reviewed, not that a site is open or available today. A separately labelled opt-in includes OpenStreetMap listings whose camping permission, opening and facilities require verification. Private/no-access or abandoned mapped records are excluded. A protected-area polygon alone never establishes permission to camp.

Unknown amenities, access and seasonality are not inferred. Optional mapped amenities retain their source separately from the operator listing and location coordinates. The UI links to current booking information and does not publish live vacancies or prices. Site reference positions do not identify a particular cabin or pitch.

## Photos and activity guides

`web/social.json` contains curated Instagram/X post URLs, location associations and publisher sources. Posts are embedded only after an explicit load click. No social image files or CDN thumbnails are downloaded or rehosted. Source links remain available if a post is deleted, private or blocked. Galleries with no matching posts are hidden. A regional photograph is labelled as regional context, not necessarily the selected beach. Historical images do not establish present conditions.

Only validated HTTPS Instagram post/reel and X status URLs are accepted. Fixed official embed interfaces are used; arbitrary embed HTML is not accepted. No social API key, automatic search subscription or application backend is needed. New curated entries should be checked against the original creator or an attributable publisher before adding their location association.

`web/guides.json` contains sourced educational content, review dates and fisheries-authority links. Guides are not a training course, a live closure service or a complete legal-zone engine. Read the official current sources for the exact water and activity. New location restrictions require a source, scope and review date; no suitability or safety score is inferred.

## Prepare national data

```sh
python3 -m scripts.acquire_national
python3 -m scripts.fetch_missing_contours
python3 -m depth_explorer build-static --output _site
```

The national acquisition archives sources and creates `.cache/national/snapshot.json`:

- Composite Gazetteer: enumerate object IDs and verify complete feature batches; exclude inland records using coarse coastline proximity.
- OpenStreetMap: named campgrounds, caravan sites and chalets near the coast; mapped listings stay explicitly unverified unless separately reviewed.
- AusSeabed Marine Data Register: enumerate survey metadata without downloading full national raster archives. Preserve download links, dates, licences, constraints and publication status. Spatial WFS queries associate actual survey footprints with each directory area's envelope; an intersecting area is not proof of a surveyed cell at a beach.

Partial or failed responses do not replace an existing valid source snapshot. Refresh status and counts are recorded. Acquisition never invents depth values, amenities, permission or missing source records. All source data is treated as data, not executable instructions.

The source registry for imported surveys is `depth_explorer/regions.json`. Browsing groups live in `config/areas.json`; reviewed stay records are in `config/stays.json`. Add a new survey package and verify its metadata before publishing detailed regional depth data. Existing `port-phillip` and `bondi` CLI region IDs remain supported.

## Static artifact

`beaches.json` is a lightweight national search/directory index. `data/areas/` contains regional beach facts, nearby stays, survey links and an approximate context coastline, loaded only when a beach or area is opened. `data/beach-summaries.json` contains generated reference-depth summaries. `data/surveys.json` retains the national source-survey inventory.

`data/catalog.json` describes actual regional survey files, numeric rasters, chunks and tiles, plus clearly empty directory map regions. An empty region never requests a fabricated contour file. Numeric grid chunks are gzip-compressed 256 × 256 little-endian Float32 arrays with NaN for missing cells. PNG tiles are for display only. Native source cells supply point values and profiles, and missing data stays blank.

JavaScript and CSS assets are fingerprinted together. Paths retain the GitHub Pages repository prefix. The builder invokes Node to share the interactive geometry implementation, checks unresolved Git LFS pointers, applies an 850 MiB default budget to all output, and atomically replaces the artifact only after a successful build. Derived regional files are loaded on demand; full national high-resolution rasters are not bundled.

## Run locally

Use Python 3.12+, Node 22+ and Git LFS:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm ci --ignore-scripts
.venv/bin/python -m scripts.acquire_national
.venv/bin/python -m depth_explorer fetch-contours all
.venv/bin/python -m depth_explorer build-static
.venv/bin/python -m depth_explorer.server
```

Open http://127.0.0.1:8765. The preview serves static files only. Without a national cache, builds fall back to reviewed seed beaches and stays; tests do not require source downloads. Projected raster builds require the bundled Proj4js library installed by npm.

## Import numeric bathymetry

Numeric GeoTIFFs are required for point depths and profiles. Source portals include [Victoria's coastal DEM](https://discover.data.vic.gov.au/dataset/victorian-coastal-digital-elevation-model-2021-vcdem-10m), [NSW marine lidar](https://data.nsw.gov.au/data/dataset/marine-lidar-topo-bathy-2018), [ELVIS](https://elevation.fsdf.org.au/) and [AusSeabed](https://portal.ga.gov.au/persona/marine). Catalogue ZIPs or styled map images may not be numeric elevation grids.

```sh
cp metadata/bondi.example.json metadata/bondi.local.json
# Verify the delivered survey metadata and edit the local copy.
python3 -m depth_explorer import-raster bondi /path/to/tiles/*.tif --metadata metadata/bondi.local.json
python3 -m depth_explorer build-static

git add .gitattributes datasets/
git lfs status
git lfs ls-files
git commit -m "Add verified regional bathymetry"
git push origin main
```

Confirm metre units, value sign, datum, source resolution, source quality, date, licence and attribution before import. Set `datum_verified=true` only after checking the source. Incompatible vertical datums are not mixed or guessed. Imports preserve originals/checksums and validity masks; later raster sources override earlier ones only where valid.

Large source rasters and archives use Git LFS. Materialised derived files are published through an Actions Pages artifact; unresolved LFS pointers are rejected. Small source configuration stays ordinary Git. National acquisition caches and `_site/` are ignored rather than committed. Stay within GitHub Pages and LFS quotas as regional coverage expands.

## Deploy and verify

Repository Settings → Pages must use GitHub Actions. Pushes to `main`, manual runs and weekly refreshes run the build and publish to https://hoebat.github.io/shore-depth-explorer/. Pull requests test and build without refreshing external sources or deploying. Actions caches national sources independently from survey archives. Survey caches are partitioned by the committed dataset inventory so new imported data is not overwritten by an incompatible cached inventory.

```sh
python3 -m unittest discover -s tests -v
npm test
node --check web/app.js
```

Tests cover numeric sampling, datum handling, complete downloads, atomic multi-layer acquisition, build safety and size limits, directory ordering and jurisdictions, failed-source retention, activity restriction handling, stay proximity/unknown amenities, social URL validation and app DOM flows. Synthetic fixtures are not published as survey data. The GIS test runs when Rasterio/Numpy are available and is enabled in Actions.

## October 2026 coastal expansion

The depth selector groups published packages by state. Imported beach references use the smallest available matching survey envelope; reviewed existing assignments and legacy links are retained. An envelope match alone does not establish a depth at a beach. Generated summaries still require an actual matching contour within 3 km.

New NSW and southern Gold Coast contours use the 2018 marine lidar service and AHD. The southern Gold Coast request yielded only partial Point Danger–Tweed entrance coverage; the map is named for that actual footprint and does not claim Palm Beach or Gold Coast-wide depth coverage. Victorian inlet contours preserve unverified original DATUM codes. Tasmania uses the authoritative IMAS SeaMap WFS and its CC BY 4.0 / MSL depth metadata. Its spatially filtered count is inconsistent, so acquisition validates all 1,504 source records before selecting the southeast envelope locally. No missing contour levels are interpolated.

Downloads run for up to three regions concurrently; one writer updates the inventory only after a complete region is validated. Actions archives active raw and processed sources in Git LFS through a separate repository-write job. Normal build/deploy jobs retain read-only repository access. Source archives are committed only when acquisition changes the inventory; concurrent branch changes reject the archive push instead of overwriting user commits. Large data are not sent through ordinary Git blobs.

`metadata/coastal-expansion-review.json` records the validated feature counts and source hashes. The proposed Fremantle–Cockburn numeric raster was inspected and deferred: the archive supplies sparse offshore 35–57 m data, and its vertical reference is not explicitly verified in embedded metadata. It is not published as a beach-depth raster. The existing numeric import still requires verified datum and metre units.

Checksum-pinned source transfers can seed previously reviewed government responses when build-worker connections time out. The importer verifies the bundle hash, each original response hash, feature count and configured publisher URLs before using the normal acquisition store. Published maps and later builds use the Git LFS archives; temporary transfer services are not application dependencies. Empty configured packages are excluded from the published-map selector.

## Ocean chart styling

Shore and place names are enabled by default using OpenStreetMap tiles, styled in the browser with navy water and muted blue-grey land. Survey contours use contrasting aqua and blue lines with a metre legend. Geographic water colour provides map context; reference depths come from the published survey lines or verified raster cells. If online tiles are unavailable, the local coarse context coastline provides an approximate outline. The layer can be switched off under Map data & layers. PNG exports retain attribution and the applicable survey colour legend.
