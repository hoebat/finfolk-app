# FinFolk

A coastal atlas and social companion for Australian divers. Beaches, depth charts and nearby stays run on GitHub Pages. IndexedDB saves map regions on-device; Neon Auth and Postgres power opt-in profiles, recent Regulars and buddy connections. Photos and videos stay on Instagram or TikTok.

**Discover** offers Suggested places and an All beaches index, sorted by state/territory → coastal region → beach. **Map** has independent beach/region search and an on-demand Place / Layers sidebar. Existing beach links such as `?site=edithvale`, `?site=maroubra` and `?site=hyams-beach` remain supported. Legacy `view=areas` links open All beaches; `view=guides` links open Suggested. Official activity and fisheries links remain in each beach’s sourced details.

## What the data establishes

A listed beach is not a verified entry point, swim route, fishing permission or a current-conditions report. Sixteen local contour maps cover the four original regions plus Sydney Northern Beaches, Southern Sydney, Central Coast, Hunter, Northern Rivers, Illawarra, Eurobodalla, Sapphire Coast, partial Point Danger–Tweed entrance coverage, Corner Inlet, Mallacoota and statewide Tasmania. Coverage is limited to actual published survey lines, not entire regional envelopes. A separate, faint national context layer shows 5 m contours derived from a 250 m bathymetry grid around the beach directory. It is broad-scale visual context only: it does not count as local survey coverage, appear in depth estimates or recommendations, or establish a swim route. Numeric point depths and profiles appear only when a valid raster grid is available. Filled water shading can also use publisher-rendered imagery (see below).

The national context contours come from [IMAS AusBathyTopo 250 m 2024](https://metadata.imas.utas.edu.au/geonetwork/geonetwork/api/records/8f007712-6a2b-4007-9529-9bd72dd37ca0). The publisher describes them as smoothed for broad-scale mapping and unsuitable for high-precision use or navigation; nearshore and land-sea positions may be inaccurate. The map keeps them in a separate toggle and labels clicked lines as model context, never as a point-depth estimate.

The national directory uses Geoscience Australia's Composite Gazetteer, screened to within 5 km of the Natural Earth 1:10 million coastline to exclude inland records. Screening is approximate and does not produce a shoreline measurement. Directory completeness follows the source, including its named-place coverage and positional limitations. Source IDs, aliases and legacy beach IDs are retained. Nearby matching gazetteer names are merged with reviewed records rather than replacing them.

Coastal regions are curated browsing groups assigned using state/territory and nearest coastal centres, with reviewed assignments retained. They are not legal or administrative polygons. AHO naming authority does not establish a state: approximate browsing assignments keep a separate unverified legal-jurisdiction field. Jervis Bay Territory records are separate from neighbouring NSW browsing areas. Survey packages and geographic directory areas are independent.

## Discover and compare

Search names, aliases, states and regions. Filter by target contour and reference distance, or by nearby source-checked stay listings; compare up to three beaches. Discovery can focus on documented activity facts or on nearby source-checked camping. Each suggestion shows its reason and missing information. Known activity restrictions exclude a location from the relevant suggestions; missing restrictions never imply permission. Spearfishing suggestions are research leads rather than legal approvals.

Automatic 5/10/15/20 m summaries use the same spherical nearest-segment calculation as the interactive map. Estimates are limited to contours within 3 km. A sourced reference within 250 m of a mapped 0 m line may snap to that line; otherwise its original location is explicitly labelled. Monitoring points and beach polygon centres may be offshore. No tide, route or current-water-depth adjustment is made. Coarse national products are not substituted for local swim-to-depth estimates.

When a map click has no numeric raster cell, the inspector can estimate reference depth between nearby published contours. It linearly weights the two depths by distance, requires supporting lines on opposite sides (at least 150°), limits each support to 1.5 km and their combined spacing to 2 km, and keeps source, survey date, datum label and original DATUM code compatible. Open contour ends and intervening mapped 0 m boundaries are rejected. The popup shows an approximate depth, supporting contour values/distances and the retained reference. It assumes a gradual slope; vertical accuracy and unresolved seabed variation remain unknown. This display estimate never creates raster coverage or feeds profiles or swim-to-depth measurements.

## Filled water shading

NSW packages use the NSW 2018 marine-lidar bathymetry DEM map service. Port Phillip/Western Port, Corner Inlet and Mallacoota use the relevant CoastKit bathymetry compilation layers. Imagery is requested directly from the publisher after the map settles, padded by 128 screen pixels and capped at 1400 image pixels per side. Small pans within a loaded view reuse it; obsolete requests and image-processing workers are cancelled. The last valid image stays anchored to its geographic bounds until a replacement succeeds. These services require internet; the app still has no backend. No raster service has been configured for Tasmania, which retains its published contours.

The publisher's legend colour order is mapped into an aqua-to-navy palette. Shading shows **relative** shallow-to-deep appearance; it does not assume a linear stretch or infer numerical depths from rendered colours. The source's actual transparent gaps remain blank, and an OpenStreetMap water mask keeps land visible. Missing shore tiles leave their area unshaded. Contour labels and measurements continue to use the original local contour records. A compilation's source dates, spacing and datum can differ from those contour records. Imagery never enables point depths, numeric profiles or higher-resolution claims. The map legend links directly to the active publisher layer; service errors have a retry control and preserve contours.

## Interface and system activity

The interface uses system typography, translucent glass materials, segmented controls and restrained scale/entrance motion. Discover, Map and Settings are available from the desktop rail and mobile navigation; Account is available from the avatar. Settings works without signing in and groups global map display, appearance and offline storage preferences. Map choices apply across beaches and regions and are saved on this device, with the existing theme and distance-graphic choices preserved. If browser storage is blocked, preferences still work for the current visit. A preferred 2 m derived contour interval applies only to measured grids with source spacing of 5 m or finer; other maps use 5 m.

Map search stays at the top. Selecting a beach opens a Place panel containing its facts, photos, stays, community details, logging and beach-specific distance measurements. The independent Map tools panel holds published maps, coverage and source information, legends, downloads, save-region, zoom, fit, refresh, export and general depth profiles. There are no Place/Layers tabs. Source capabilities continue to govern available measurements and tools; Settings retains global choices even where the current map lacks the corresponding data.

Existing beach and legacy discovery links remain supported. Shared beach links initially leave Place closed; region selection fits the map without opening Place. Escape, close buttons or the map dismiss an open map panel. The canvas stays mounted across navigation and retains its camera and selected beach; Settings and Discover pause map viewport downloads. Suggested and All beaches retain independent filters and scrolling. Touch supports panning and pinch zoom without accidental point selection. Reduced-motion preferences remove animations; reduced-transparency preferences use solid surfaces.

The distance-graphic preference in Settings hides or restores the beach-to-contour line, endpoints and label while preserving the numeric result. Account retains identity, privacy and protected administration controls, with a link to global Settings for app preferences.

The separate **System** callout, available in both Discover and Map, opens a non-modal live activity panel. It shows active/finished operations, a 32-second request-start timeline, services, request durations, failures, superseded work and recent map paint times. Fetches stay active until the body has been read. Transfer totals use browser-exposed resource timing only; payload bytes are separately labelled “read”. Cross-origin imagery often hides transfer size, and activity inside social embeds cannot be observed. The session log is bounded, keeps in-flight operations, and is never saved or uploaded. Clearing finished entries does not cancel work.

The Canvas renderer prepares reusable contour paths in small batches, culls features outside the viewport, and caches water masks against geographic imagery bounds. A worker colours imagery away from the UI thread, with a yielding fallback if a worker is unavailable, including an older open tab after a deployment. Cached parent shoreline tiles and the last complete shore frame bridge zoom changes. Tile downloads are limited to six concurrent requests, prioritised near the centre, and stale queued views are discarded before download. Drag painting is coalesced with animation frames. Native numeric data, gaps and measurement geometry remain the source of depth calculations. Initial beach links start at the selected location instead of downloading an unrelated overview. Tile caches are bounded more tightly on mobile devices.

## Atelier map study

Run `npm run moodboard`, then open `http://127.0.0.1:8770/#preview/map-explore` (Explore → Map · places & community). The standalone view is `/board/map-explore.html`.

This isolated MapLibre GL JS prototype combines dive spots, fictional businesses, people associated with shared spots, and sample events. It includes category/text filtering, clustered markers, linked result cards, co-located entries, explicit area search, a mobile results sheet and map appearance controls. It uses locally vendored MapLibre 5.12.0 and OpenFreeMap vector tiles; tiles and fonts require internet. Business, member and event fixtures never call production APIs. The existing coastal map retains survey, depth and offline tools.

Run `npm run test:map-study` for the data and DOM interaction checks. Those checks use a map adapter stub and do not verify WebGL rendering or tile availability; review the running study in a browser before moving it into the production app.

The map study also includes **Community notes** on dive spots, with an Atelier screen at `/#preview/site-notes`. Notes have topics, authors and dates, toggleable upvotes, Most helpful/Newest sorting, and an observation date required for conditions. Fictional sample notes and vote totals are labelled; added notes and votes stay in browser local storage. Own preview notes support removal and undo. Run `npm run test:site-notes` and `npm run test:site-notes:browser` (with the Atelier running) for model and responsive UI checks.

## Nearby stays

Select a beach to load nearby campgrounds, caravan parks and cabins. The default radius is 25 km, adjustable to 5/10/50 km. Distances are straight-line from the beach reference, not travel distances. Maps and provider links allow independent access and booking checks.

Default results are checked against a parks, council or operator listing. “Source checked” means the listing was reviewed, not that a site is open or available today. A separately labelled opt-in includes OpenStreetMap listings whose camping permission, opening and facilities require verification. Private/no-access or abandoned mapped records are excluded. A protected-area polygon alone never establishes permission to camp.

Unknown amenities, access and seasonality are not inferred. Optional mapped amenities retain their source separately from the operator listing and location coordinates. The UI links to current booking information and does not publish live vacancies or prices. Site reference positions do not identify a particular cabin or pitch.

## Photos and activity guides

`web/social.json` contains curated Instagram/X post URLs, location associations and publisher sources. Posts are embedded only after an explicit load click. No social image files or CDN thumbnails are downloaded or rehosted. Source links remain available if a post is deleted, private or blocked. Every beach has a Photos tab with an Instagram location search and a form to load a public post/reel URL. Up to eight added links per beach are saved in browser local storage, scoped to this site/device; returning to a beach never automatically loads an embed. Links can be removed. If storage is blocked they work for the current visit. Added links are labelled as having an unverified location association. A regional photograph is labelled as regional context, not necessarily the selected beach. Historical images do not establish present conditions.

Only validated HTTPS Instagram post/reel and X status URLs are accepted. Fixed official embed interfaces are used; arbitrary embed HTML is not accepted. No social API key, automatic search subscription or application backend is needed. New curated entries should be checked against the original creator or an attributable publisher before adding their location association.

`web/guides.json` contains sourced educational content, review dates and fisheries-authority links. Guides are not a training course, a live closure service or a complete legal-zone engine. Read the official current sources for the exact water and activity. New location restrictions require a source, scope and review date; no suitability or safety score is inferred.

## Prepare national data

```sh
python3 -m scripts.acquire_national
python3 -m scripts.fetch_national_context
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

`beaches.json` is a lightweight national search/directory index. `data/areas/` contains regional beach facts, nearby stays, survey links, an approximate context coastline and the beach area's clipped broad-scale model contours, loaded only when a beach or area is opened. `data/beach-summaries.json` contains generated reference-depth summaries from local source contours only. `data/surveys.json` retains the national source-survey inventory.

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

Repository Settings → Pages must use GitHub Actions. Pushes to `main`, manual runs and weekly refreshes run the build and publish to https://hoebat.github.io/finfolk-app/. Pull requests test and build without refreshing external sources or deploying. Actions caches national sources independently from survey archives. Survey caches are partitioned by the committed dataset inventory so new imported data is not overwritten by an incompatible cached inventory.

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

Shore and place names are enabled by default using OpenStreetMap tiles, styled in the browser with navy water and muted blue-grey land. Survey contours use contrasting aqua and blue lines with a metre legend. Geographic water colour provides map context; reference depths come from the published survey lines or verified raster cells. If online tiles are unavailable, the local coarse context coastline provides an approximate outline. The layer can be switched off under Settings → Map display. PNG exports retain attribution and the applicable survey colour legend.

## Accounts, Regulars and offline regions

Account is available from the avatar; Map and Discover remain the main navigation. Users can link Instagram/TikTok, choose beaches and sharing fields, check in, and send buddy requests. Closed is the default. Both Open divers need 3 distinct visit days in the last 30 days for allowed activity statistics and 5 for allowed dive summaries. Accepted buddies bypass visit gates, while blocking and field-level privacy always apply. These checks run in the API against current Postgres rows.

Large downloads start automatically with progress and Cancel. Settings contains recent-cache limits, saved regions, quota estimates and removal controls. System remains a live diagnostics panel with a link to storage settings. Complete saved packages and the app shell can reopen offline; government imagery and social embeds remain online services.

The active backend is Neon, replacing the disabled Firebase implementation. Production Postgres/Auth services are provisioned; public account activation waits for the Cloudflare API deployment and browser acceptance checks. See [Neon setup, deployment and verification](docs/NEON_SETUP.md). The legacy Firebase and Instagram webhook files are retained for reference, excluded from active frontend deployment, and not enabled.

## Custom domain

The root `CNAME` declares `finfolk.com.au` and is copied into the Pages artifact. GitHub Actions deployments require the domain to be configured separately in repository Settings → Pages; the CNAME file alone does not activate it. See [custom domain setup](docs/CUSTOM_DOMAIN.md) for DNS and HTTPS settings.

Instagram onboarding and automatic public tag indexing are implemented behind disabled feature switches. Members opt in, verify Instagram ownership and following, then tag FinFolk. The server holds ambiguous authors for review; private sessions stay separate. See [Instagram setup, pilot and administration](docs/INSTAGRAM_SETUP.md).

## Beach location thumbnails

Suggested cards, All beaches cards and directory rows, and selected beach headers show an approximate state silhouette with a dot projected dynamically from the beach's existing `[longitude, latitude]`. The outline and dot share a latitude-corrected equirectangular projection. Coordinates outside the outline remain at their actual position; missing coordinates omit the dot. Jervis Bay is separate, and recognised external territories use their nearby island group. Unmatched or unverified external-territory coordinates show no island map. Thumbnails use the directory state assignment and do not establish legal jurisdiction or an entry point.

The bundled outlines are simplified from the Australian Bureau of Statistics [States and Territories 2021 boundaries](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files), © ABS, CC BY 4.0. Source URL, CRS and archive SHA-256 are retained in `web/state-outlines.js`. Regenerate with `python -m scripts.build_state_outlines` (or `--source /path/to/STE_2021_AUST_SHP_GDA94.zip`). Normal builds and browser rendering use the committed asset without downloads; both thumbnail modules are fingerprinted and included in the offline shell.

## Local design mood board

Run `npm run moodboard` and open **http://127.0.0.1:8770/**. The FinFolk Atelier previews 18 production UI screens: the landing page, discovery, beach directory, place details and stays, coastal map and tools, logbook, session detail and editor, check-in, profile and buddies, posts and trips, Instagram, trip report, sign-in/registration, welcome and Settings while you adjust colours, typography, card shapes, materials and animal motifs. Its starting moods explore coastal surrealism and fashion-inspired natural forms. Your supplied FinFolk Nasties swatch is included as a reference; additional reference images and field notes stay in this browser.

The **Finfolk Coop** category previews the catalogue, redemption confirmation, reward history, empty shop and reward management. Open [the shop](http://127.0.0.1:8770/#preview/finnies-shop), use **More → Finfolk Coop** in product previews, or follow **Workflow reviews → Spend Finnies at Finfolk Coop**. Fictional outlet rewards and sample Finnies are saved locally; real balances are unaffected. See [the shop study guide](docs/finnies-atelier.md) and run `npm run test:finnies-atelier`.


Changes preview immediately. **Save to local FinFolk** writes `web/atelier-theme.css` and `config/atelier-theme.json` in this checkout; **Restore previous** restores the preceding local theme. Saved moods and draft controls are browser-local. Export/import JSON to move a theme between browsers, or export its generated CSS. The preview uses bundled beach records and bypasses service-worker caching. The landing page at `/preview/landing.html` uses the same theme, a top theme dropdown and noninteractive mobile walkthroughs. The examples cover profile locations, private logs, people, Instagram connecting/check-ins, and Instagram/TikTok post submissions; they send no messages or account changes. The **UI screens** tab opens the screen browser; use the screen selector or arrow controls to move through pages in responsive or phone view. Member screens render the real UI with clearly labelled, browser-memory sample records. Sign-in and external account operations are blocked; no production account or API is used. Sample edits reset on screen change. The local adapter and fixtures live only under `design-board/` and are excluded from site builds.

The command builds a lightweight preview on first launch using the existing Python virtual environment (`PYTHON` overrides it). Use `npm run moodboard -- --rebuild` after changing application source, `--port 8771` to choose another port, or `--site /absolute/path/to/built/site` to use a fuller local dataset. Theme changes do not need a rebuild. Run `npm run test:moodboard` for compiler, browser-control, validation, local save/restore and preview-isolation tests.

### Personal animal selection

Settings → Appearance includes **Your signature animal**, independently of the colour theme. Guests and members can choose the FinFolk collection, a quiet appearance, or one of the six Nasties animals. The choice is saved on this device and survives navigation/reload. The six original prints were developed from the supplied reference with ChatGPT native image generation, in engraved navy, ivory and muted rose. The mood board includes a selectable print gallery, tonal/original-colour treatments and a 0–100% presence control. Print placement offers state silhouettes, state-section backgrounds, all-over page prints or header bands. Patterned card frames have been removed. The silhouette treatment fills the existing geographic outline with artwork and keeps its dynamically projected location dot visible; changing animals updates existing and newly rendered thumbnails. Versioned WebP assets in `web/animal-*-v1.webp` power the picker thumbnails and decorative header, and are included in the offline shell. The complete generation prompts are saved in `design-board/animal-print-prompts.json`; original PNG masters remain in the Codex generated-images folder.

### Freediving focus and colour collections

FinFolk is focused on freedivers and freediving training. Discovery and profile preferences no longer offer spearfishing or general swimming activities; stored profile activity values are filtered to freediving when saved. The landing page and local sample journeys use this same focus.

The muted collection remains available alongside **Acid tide**, **Pink current** and **Cobalt club** hyper themes. All six animals have original muted and hyper artwork, generated with ChatGPT native image generation. Appearance settings change the mood independently of the visitor’s animal choice; the landing page, picker thumbnails and state silhouettes follow the selection. The Atelier also exposes the print collection directly. Hyper generation prompts are retained in `design-board/hyper-print-prompts.json`.

### Logo ideation board

Open **http://127.0.0.1:8770/#logos** or choose **Logo ideation** in the Atelier. Six native ChatGPT image-generation directions compare fin ligatures, buddy silhouettes, a curious creature, editorial punctuation, tessellated fins and an expressive wordmark. Each includes muted, reversed and hyper studies, plus notes on what needs refinement. Shortlist concepts and add notes in the browser; **Export logo brief** downloads the complete review. Full-size PNG boards and WebP previews are retained under `design-board/assets/logos/`; prompts are in `design-board/logo-prompts.json`. The original directions remain archived explorations. The single thinner f from Slow melt is now the locked identity; the current Design studies workspace develops its treatments.

The **Two-level fins** filter at **http://127.0.0.1:8770/#fins** develops the selected tessellated-fin direction into three paired studies: Shared edge, The f revealed, and Long line. Each compares a full mark with a single rear-fin icon. These studies use native ChatGPT image generation; their prompts are in `design-board/fin-study-prompts.json` and PNG/WebP assets are in `design-board/assets/logos/`. They share the existing shortlist and notes workflow.

The **Odd little club** filter at **http://127.0.0.1:8770/#club** compares four motif-lettering studies: Tentacle type, Hidden Nasties, Letters in print, and Creature ligatures. They explore animal-shaped letterforms, negative-space animals, clipped textile prints and interlocking edges. Native ChatGPT image-generation prompts are in `design-board/club-study-prompts.json`; PNG masters and WebP previews are under `design-board/assets/logos/club-*-v1.*`. Existing notes, shortlists and brief export support these studies too.

The **Lava-lamp 70s** filter at **http://127.0.0.1:8770/#lava** focuses on three molten lettering variations: Slow melt, Liquid ligatures and After hours. The earlier motif-lettering studies remain in Odd little club. Native generation prompts are in `design-board/lava-study-prompts.json`; masters and previews are under `design-board/assets/logos/club-{slow-melt,liquid-ligatures,after-hours}-v1.{png,webp}`.

### Locked Slow melt identity and freediver stencils

Open **http://127.0.0.1:8770/#designs** for the locked single-f identity, four colour treatments, six stencil comparisons and four responsive landing/product studies. `#small-marks` jumps to 16/24/32/48/64 px comparisons; `#page-designs` opens the responsive pages. The clean, thinner right-hand f from the Slow melt monogram is the master. All colourways use exactly the same SVG path. Below 128 CSS pixels logos stay plain; at larger sizes a container query enables a fine print at 25% tile size. The Atelier header, local app, landing navigation, favicon and touch icon use the locked identity.

The four responsive pages are **Print house**, **Acid social**, **Midnight current** and **Below the surface**. Each combines the shared f and native-generated freediver masks with a real local app iframe. Animal and muted/hyper controls change the logo/stencil print and send an isolated preview theme to that iframe. They do not overwrite saved animal or theme preferences. The fourth page develops the original title-sequence-style stencil direction. The actual local landing page uses a solid freediver against the pattern; the studies compare that with pattern revealed inside the diver. Quiet removes patterned fills. Content cards remain plain, and app state boundaries/dots remain code-driven.

The Atelier colour picker changes treatment, never logo geometry. Older icon selections migrate to Navy ink; all archived notes, logo experiments and generated page concepts remain available and included in review exports. Design notes and the Atelier colour preference persist locally. These changes have not been published.

The vector assets and native stencil WebPs are in `web/finfolk-mark*.svg` and `web/freediver-*-v1.webp`. Original transparent PNGs are retained in `design-board/assets/identity/`; native ChatGPT generation prompts are in `design-board/locked-identity-prompts.json`. `node scripts/prepare_brand_assets.mjs` traces the approved native alpha contour and regenerates the shared vector colourways, PNG master, favicon and touch icon using Sharp. Branding and stencils are included in the offline shell. **npm run test:moodboard** checks the workspace, landing, local product previews and locked identity; **npm test** includes the broader app checks.

### Current visual language: yellow, cobalt and muted light/dark

The Atelier shell and primary moods now use four appearances: **Yellow** (default), **Cobalt**, **Muted light**, and **Muted dark**. The header palette switches update both the studio frame and its live preview; the app Appearance settings expose the same four choices. Earlier mood experiments, custom themes and notes remain available. Stored coastal/sand/night choices resolve to navy, and acid/pink to yellow.

The nine underwater scenes and thirteen animal motifs have reusable three-ink masters and **Acid light / Acid dark / Muted light / Muted dark** colourways. Motifs, picker previews and regional prints follow the app theme; the scene gallery also has a palette selector and PNG/master downloads. `node scripts/prepare_ink_palettes.mjs` rebuilds all colourways from the preserved originals. Palette colours and the separation/remapping functions live in `web/ink-palettes.js`. Masters under `design-board/assets/ink-masters/` contain three grayscale coverage masks, palette mappings and source hashes; each portable `master.zip` also includes its original image. Every export uses the same masks at the same pixel positions. Separation approximates the inks in the flattened generated source; the original images remain available.

The horizontal motif strips beneath discovery, logbook, account and trip headings have been removed from the theme compiler and app styles. Native-generated seagrass, reef-rock and stingray shapes now carry the print organically around page edges, with clear reading surfaces above them. The study gallery also includes a turtle silhouette. A **Pattern darkness** control in the Atelier and responsive pages darkens print inside masks (65% by default); solid divers use navy against a restrained pattern field.

The Nasties collection now has thirteen animals: the original six plus sea snakes, stingrays, moray eels, blue dragons, Irukandji, smooth toadfish and shortspined urchins, each with muted and hyper tessellations. All were developed with native ChatGPT image generation in the existing engraved fashion-print language. Versioned WebP assets live under `web/animal-{seasnake,stingray,moray}*-v1.webp` and `web/habitat-*-v1.webp`; original PNGs are in `design-board/assets/habitat/` and prompts are in `design-board/habitat-and-nasties-prompts.json`. New prints and silhouettes are included in the offline shell.


The official large logo is the **full Slow melt wordmark** from the approved screenshot; the single thinner f stays the small mark. In prose the brand is always **FinFolk**. Native-extracted PNG and shared SVG masters are in `web/finfolk-wordmark.{png,svg}`; source and contour are under `design-board/assets/identity/`. `node scripts/prepare_wordmark_assets.mjs` regenerates the full contour and the eight latest regional WebPs. Prompts are saved in `design-board/regional-identity-prompts.json` and regional PNG masters in `design-board/assets/regional/`.

Blue-ringed octopus is the default personal motif. Each coastal state has an independent, locally supported creative identity: NSW bluebottle, VIC blue-ringed octopus, QLD blue dragon, WA cone snail, SA smooth toadfish, TAS shortspined sea urchin, and NT Irukandji. Sources, species and the specific type of danger are in `web/state-motifs.js` and linked in the **Design studies → A critter for every coast** gallery. These animals have shared ranges; they are not official or exclusive emblems. ACT and unassigned territories remain neutral; Jervis Bay uses the nearby NSW treatment. A personal animal never replaces a state's identity. Quiet removes prints; muted/hyper updates all regional artwork while geographic outlines and projected location dots stay unchanged.


The landing page now focuses on Instagram/TikTok post previews, the three-visit-days-in-30 **Regulars** feature, freediving locations and the logbook. Appearance and animal controls are available in app Settings; the landing page no longer displays those pickers.

**Weather & tides** panels on the landing page and beach details request Open-Meteo weather, waves and hourly sea level using the selected place’s stored longitude/latitude. Forecasts load on request, use location-local time, and are kept in memory for 15 minutes. Refresh requests fresh data. Unavailable, partial and stale responses do not become zeroes or invented forecasts. Regional sea level includes tidal and weather effects and is labelled in metres above mean sea level; it is not a station tide table or an adjustment to surveyed depth data. Panels link to official [BOM tide predictions](https://www.bom.gov.au/australia/tides/) and [marine forecasts and warnings](https://www.bom.gov.au/coastal-location/australia). Data attribution is visible in each loaded panel. Provider references: [weather API](https://open-meteo.com/en/docs), [marine API and coastal accuracy limits](https://open-meteo.com/en/docs/marine-weather-api), [data licences](https://open-meteo.com/en/licence). The default public API is suitable for this local noncommercial preview; commercial deployment needs the provider’s commercial service or a self-hosted feed. Tests use deterministic fixtures and never call the live provider.


### Product copy

FinFolk uses direct, action-led language across landing pages, live design previews, onboarding and the app: **Pick your spot. Post your logs. Find your FinFolk.** Buttons describe their action; empty states explain what is missing and what to do next. Keep the established navigation labels and exact privacy, publishing, Regulars eligibility and forecast explanations. Sessions start private; “Post your logs” does not imply automatic publication. Built-in theme captions use “Freediving locations”; archived artwork and user-authored content retain their original text.


### Local People and profile prototype

Open **http://127.0.0.1:8770/board/profiles.html?screen=people** to browse fictional freedivers by location. **People**, **Diver profile**, **My profile**, and **Edit profile** are also in the Atelier screen gallery. Local app previews add People and My profile navigation; the production shell and API are unchanged.

The prototype uses six fictional adults and native ChatGPT-generated portraits. PNG masters and optimized WebPs are in `design-board/assets/people/`; portrait prompts are in `design-board/profile-portrait-prompts.json` and the two illustrative social-post stills use `design-board/profile-post-prompts.json`. Portraits are unobstructed, with the existing motifs behind the page. Fictional social links and posts show explicit sample dialogs. Valid profile URLs entered in Edit profile open Instagram or TikTok directly.

Edits, portrait blobs, sample connections and blocks are isolated in IndexedDB database `finfolk:profile-showcase:v1`. No account changes or connection requests are sent to the backend. Storage failures retain changes for the current visit and display that limitation. Portraits accept JPEG/PNG/WebP up to 2 MiB. The editor selects and orders only the owner’s sample posts and published logs; private logs are excluded in both editing and display. Closed profiles are excluded from People; statistics retain the existing consent and 3/5 visit-day gates, with accepted-buddy access to permitted fields. Locations indicate followed places or sample Regulars status, never current whereabouts. Samples use deterministic illustrative counts, not live attendance.

`node tests/test_profile_showcase.mjs` covers location browsing, editing, persistence, portrait validation, social URLs, connection states, blocking, private-log exclusion and statistic gates. It is included in the full app and moodboard suites.


Local product previews share **Explore, Community, Events, Practice and You** navigation. Explore opens the map and retains place notes. Community includes people, groups/outlets and Finfolk Coop. Finnies summaries sit within Community and You. Sessions and training live under Practice. Desktop rails and mobile tabs use the same sections; local studio utilities remain available through the menu. Production navigation is unchanged.

Australian landing scenes: Ningaloo (WA), Great Barrier Reef (QLD), Julian Rocks (NSW), Port Phillip Heads (VIC), Bicheno (TAS) and Point Lowly (SA) are fixed section backgrounds. Original PNGs and location reference/prompt records are retained in `design-board/assets/scenes/` and `design-board/australian-scene-prompts.json`. The shared `web/australian-scenes.js` registry supplies the gallery and landing placements. The ink export script also builds desktop/mobile WebPs for all four palettes. Lower backgrounds load near the viewport; changing appearance updates loaded scenes and motifs together. These are place-inspired illustrations, not current-condition photographs.

### Session watch studies

Open **http://127.0.0.1:8770/board/sessions.html** or choose **Session · watch studies** in the Atelier screen gallery. Fictional Garmin Descent, Suunto Ocean, Apple Watch Ultra / Oceanic+ and manual sessions combine a story, illustrative imagery, session totals and selectable dive profiles. Select a numbered dive or a dive-list row to inspect its depth, underwater duration and preceding surface interval. A missing Suunto sample leaves a chart gap; the manual example has entered totals only. All four Atelier themes are supported.

These are display fixtures, not decoded exports or verified file compatibility. No upload, watch connection, download or account write is performed. Source references: [Garmin export guidance](https://support.garmin.com/et-EE/?faq=NxZWyZYGqL17VNBMKDUjb5), [Suunto export guidance](https://www.suunto.com/Support/faq-articles/suunto-app/what-type-of-files-can-i-export-from-the-suunto-app/), [Oceanic+ export updates](https://www.oceanicworldwide.com/oceanicplus-app-updates/). Run `node tests/test_sessions_showcase.mjs` for source switching, totals, dive selection, missing-data states and themes.

### Watch sync walkthroughs

Open **http://127.0.0.1:8770/board/watch-sync.html** or choose **Watch sync · Garmin / Suunto / Apple Watch / File import** in UI screens. Four animated proposals show account connection or export, permissions, the normal watch-to-phone sync, transfer and private logbook review. Switch sources, select any step, pause, advance or replay. Playback ends on the last screen, pauses while the page is hidden and starts paused for reduced-motion users. All four Atelier themes and phone layouts are supported.

These are local illustrative walkthroughs, with no account authorization, file upload or network transfer. Garmin and Suunto journeys require provider access and dive-data validation. The Apple journey is an iPhone companion concept; full Oceanic+ profiles through Health are unconfirmed. File format support is planned, not verified. Run `node tests/test_watch_sync.mjs` for routes, playback, completion and theme checks.

The session study includes **Add media**: paste and review an Instagram/TikTok post link, select a fictional tagged Instagram post, or preview up to six JPEG/PNG/WebP photos under 25 MB each. Optional descriptions accompany local photos. Attachments are separate for each watch example, remain in browser memory and reset on reload. No file upload, public submission or watch-data change occurs. Social previews contact providers only after **Load preview**; original links remain available when embeds cannot display. The **How tagging works** disclosure explains tagging, private attachments and the separate reviewed public beach-listing flow. Run `node tests/test_session_media.mjs` for link and photo validation.

### Collect content after a session

Every session study now has a unique **Session tag**, plus **Copy session tag** and **Copy caption** controls. Posting date is separate from session date: a post published days later can still belong to an older dive. **Collected posts** opens a shared inbox; select multiple posts, search sessions by date/location, and assign them together to one session.

Open **Simulate tagged post** inside that inbox to exercise collection. A recognized session hashtag routes a fictional own-account post directly to its session; absent, unknown or conflicting codes keep it unsorted. Reusing the platform and post ID simulates duplicate delivery without changing assignment. Return attached posts to the inbox or remove them from the collection; neither changes an original social post. Each collected item belongs to at most one session. Removed items are not restored by duplicate delivery.

Instagram webhook and TikTok automatic collection are simulated only. No production subscriptions, rollout flags or APIs are changed. Shared collection state survives session navigation and resets on reload. Run `node tests/test_session_collection.mjs` for routing, late posting, deduplication, bulk assignment and removal checks.

### Events and workflow reviews

Open **http://127.0.0.1:8770/board/events.html** or choose **Create event** in the Atelier gallery. Eligible sample pages also link to the editor from My pages. The local event study includes an organiser selector, live event preview, field-level validation, draft/publish confirmation and return-to-edit behaviour. Published visibility is locked. A no-eligible-page scenario explains the published/claimed-page requirement. Dates use the browser's timezone. No event is published or invitation sent outside the preview; reload resets the event.

Open **http://127.0.0.1:8770/#workflows** or choose **Workflows** for nine authored journeys covering onboarding, locations, people, page ownership, sessions, media collection, public post sharing, events and settings. Each step records expected behaviour, role, prerequisites and manual review status/notes. Reviews persist in this browser with device/theme/time context; JSON export and confirmed per-journey reset are available. Missing screens are explicit review gaps and cannot be marked Passed. Same-screen steps preserve the live preview's state. Deep links use `#workflows/events/create`; review completion does not certify backend integrations. Run `node tests/test_workflows.mjs` for reference and validation checks.

The event study now follows the landing-page planning mockup: choose a place, session name, day and meeting time, optionally add a meeting point, then choose fictional connections and create the local plan. Invite-only is the default. End time defaults to two hours after meeting; end time, organiser, description, category, capacity and visibility are under **More options**. Selected people and details survive Back/Return to edit. Invitation confirmations are explicitly previews; no messages are sent.

The event study separates a **Meeting area** (a named circular map zone, default radius 1 km) from the optional **Exact meeting spot · accepted invitees only**. Tap to position the zone or private pin; radius and coordinate controls support keyboard use. Map tiles come from OpenStreetMap with attribution. Coordinates remain editable if tiles fail. A supplied pin must remain inside the zone; the zone centre is never derived from that pin.

Saved plans include **Preview as** controls for the organiser, selected invitees and an uninvited visitor. Pending invitations show only the zone. **Accept invitation** reveals the precise marker, private instructions and an explicit directions link; without a pin it shows “Meeting spot to be confirmed”. Organisers can simulate pending/accepted/declined/revoked states. Private fields are omitted from unaccepted-view markup, including for public events. This demonstrates UI permissions with fictional local state; it does not change production access controls or send invitations. `node tests/test_meeting_zone.mjs` checks geometry and private-field projections.

On phones the meeting map now renders at the available screen width with readable map scale and 44 px controls. **Move map** enables drag/pinch navigation; switch back to **Place zone/Place pin** to position a location while vertical swipes scroll the page. Coordinate controls are collapsed, with a separate zone-size slider. Compact form spacing, full-width primary actions, 16 px inputs and small-screen date/time stacking keep the event flow usable from 320 px wide through landscape layouts.

### Breathing practice study

Open **http://127.0.0.1:8770/board/practice.html** or the Practice group in the screen gallery. Natural breathing and body-scan sessions use a quiet timer without prescribed breathing rhythms. Dry static and CO₂/custom practice accept an existing instructor-set routine; each hold begins manually, and End hold remains prominent. Target times never start a later hold automatically. O₂ practice is log-only, with no guided player or suggested routine. Exercise details link to DAN, PADI and SSI guidance, reviewed 3 November 2026.

Practice records capture actual timed phases, optional before/after comfort, per-round comfort and notes. Completed, stopped and interrupted records remain distinct. Focus loss, hidden tabs or hidden preview frames interrupt playback; it never resumes a hold automatically. Interrupted records are retained so reloads do not silently lose them. These are self-reported/timer records, not measurements of breathing, oxygen levels or diving readiness. Audio cues are optional and off by default.

History shows practice days, sessions and minutes over 7/30 days. Records and named routines persist privately in this browser, with record deletion, confirmed clear-all and JSON export. Storage failures fall back to visit-only state with a notice. Sample history is displayed separately and never included in real totals. No account writes, watch integration, leaderboards or changes to dive statistics occur. The Breathing practice workflow covers setup, manual timing, interruptions, reflection and history. Run `node tests/test_practice.mjs` for timing and routine validation checks.

Each practice card and setup screen includes **Watch demo**. Five illustrated four-step walkthroughs pair a supported seated figure (and a buddy for dry hold practice) with sample app controls. Body-scan highlights move between body regions; natural-breathing artwork never dictates a breathing cadence. All hold timings remain the user's existing plan, while the O₂ walkthrough only demonstrates recording completed practice. Play/pause, previous/next and replay controls are keyboard accessible. Reduced-motion mode opens paused with static illustrations. Demos pause when hidden or focus is lost, create no records and never launch the practice clock. **Exercise animations** is also available in the screen gallery at `/board/practice.html?screen=demo&exercise=scan`.

### Atelier section links

Copy the Atelier address after selecting a tab or preview screen. Links restore the view on refresh and support browser Back/Forward:

- `#preview/landing` or `#preview/practice-library`: Live site and selected screen.
- `#board`, `#screens`, `#workflows`, `#designs`, `#logos`: workspace tabs.
- `#workflows/events/create`: a workflow step.
- `#fins`, `#club`, `#lava`, `#logos/shortlist`: logo filters.
- `#small-marks`, `#page-designs`, `#underwater-scene`: design subsections.

Empty or unknown routes and invalid preview IDs open the landing preview. Returning to Live site during a visit retains its selected screen. Theme, device size and temporary edits are not encoded in links.

The Atelier’s **Screen categories**, **Design & artwork**, **Logo collections**, and **Workflow reviews** menus link directly to the registered screens and studies. Screen categories and workflow lists follow their shared registries so additions appear automatically. Artwork links also include `#wordmark`, `#state-motifs`, `#stencils`, and `#habitat`. Menus show the current destination, close after selection, and support keyboard navigation and Escape.

### Instagram profile builder preview

Open `http://127.0.0.1:8770/#preview/profile-builder` or **Screen categories → People & profiles → Profile builder · Instagram**. In a post caption, put `/profile add @finfolk.com.au` on its own line. The Atelier simulates collection when you paste your Instagram post/reel URL and caption into **Build from Instagram → Add post to draft**. This does not fetch posts, verify ownership or enable a live Instagram command.

Collect up to 20 posts, review caption excerpts as a suggested bio, add selected named locations, and choose which posts to feature. Suggestions are assembled from supplied captions, not AI-generated claims. Experience, availability, visibility, check-ins and statistics remain manually controlled. Save profile persists the collection and curated profile in this browser; Cancel discards changes. Removing a post from the collection removes its featured card, while leaving reviewed bio text and the original Instagram post intact. Run `npm run test:profile-builder` for command, collection and editor checks.

The profile builder uses a mobile-first three-step flow: **Add posts → Craft profile → Review**. Inputs remain mounted when switching steps so drafts survive Back/Next. Phones show the portrait at review, with caption disclosures, 16 px inputs and 44 px or larger touch controls. Continue/Back/Save actions sit above the bottom navigation. Desktop keeps the adjacent preview. Run `npm run test:profile-builder:mobile` to check the full flow at 320, 390, 768 and 1440 px.

### Mobile-first workflow design

All Atelier product previews share `design-board/workflow-design.css`: phone-sized single-column compositions, editorial headings, warm surfaces, consistent spacing, readable inputs and 44–48 px controls. Grids expand at 720 px, larger compositions at 901 px and three-column galleries at 1200 px. The existing palette system remains available. People filters collapse on phones so portraits come first; page management, events, practice, sessions and watch walkthroughs share the same visual foundations. Production app components receive these foundations only inside the local Atelier preview.

Live site and workflow reviews open in phone mode. The workflow reviewer has a journey chooser, horizontal step navigation, a phone preview, a separate review card and Previous/Next actions. Missing screens remain explicit gaps and cannot pass review. Review notes, export, reset and hash routes remain available.

Run `npm run test:workflows:mobile` for all registered screens at 390/1440 px, representative flows at 320/768 px, and review persistence/navigation checks. The test saves visual review screenshots under `/tmp/finfolk-workflow-review/`. Run `npm run test:moodboard` for the broader local workflow checks.

Atelier scrolling uses one canvas scrollbar on desktop/tablet, with an independent inspector. The shell sizes itself beneath the actual header height. On phones the document scrolls normally. Preview step changes scroll only the embedded document; wheel gestures within product previews do not spill into the host. Run `npm run test:atelier-scroll` for wheel, step navigation and content-reachability checks at 390/820/1440 px.

The event workflow’s **Check page eligibility** and **Check validation** steps open dedicated scenarios (`scenario=no-eligible` and `scenario=validation`). Eligibility uses the same published/claimed/owner-or-admin rule in My pages and the event editor; Create event carries the selected organising page. The validation scenario starts with visible errors and reveals the relevant disclosures. Missing meeting time highlights the time control. Run `npm run test:event-scenarios` for the blocked state, organiser handoff, field correction, Back and draft-save flow on phone and desktop.

### Breath analyser UI concept

Open `http://127.0.0.1:8770/#preview/breath-connect` in the Atelier for the mobile-friendly device concept. Eight states cover connection, setup, blow, delayed CO₂ analysis, results, sample retry, disconnection and a local demo journal. The preview simulates every reading and does not connect to hardware. Demo records are kept in a separate browser storage key with JSON export and deletion. Run `node tests/test_breath_analyser.mjs` to check the flow and mobile layouts.

### Post-verification onboarding

Open `http://127.0.0.1:8770/#preview/onboarding` or **Screen categories → Getting started → Onboarding · full journey**. This setup starts **after the member has already created and verified their account through Google or email**. It does not offer sign-up, collect credentials or repeat email verification. The local landing page sends visitors to account entry first.

The phone-first flow is **Profile → Places → Privacy → Connect Instagram (optional) → Profile posts (optional) → Review → Done**. Name is required; bio, places and Instagram are optional. Back and reload preserve progress. New profiles start Closed with no shared statistics, sample buddies, featured posts or invented activity. Experience starts “Not shared”.

Finish writes reviewed choices to the same IndexedDB store used by My profile and the profile builder, preserving unrelated existing profile data. Save failures keep the draft and offer retry. Progress uses `finfolk:atelier:onboarding:v1`; older account/verification drafts migrate to Profile while retaining entered profile details and discarding simulated authentication fields.

The Atelier uses an already-verified member context for this local preview; it does not implement a live authentication handoff. Instagram remains an optional profile-builder handoff, with no live connection claimed. Each step is registered in the **Set up your FinFolk** workflow. Run `npm run test:onboarding` for entry, migration, validation, resume, skips, privacy, profile handoff and storage failures at 320, 390, 768 and 1440 px.

### Illustrated imagery and Instagram onboarding

Sample portraits and session images now use an acid-ocean comic/linocut style: cobalt, chartreuse, hot pink, loose contours and ink hatching. Seven assets were generated with built-in imagegen; the existing illustrated reef-glide scene supplies the shore-session artwork. Masters and WebP files live in `design-board/assets/people/*-sketch-v2.*`; landing-demo copies live in `web/demo-*-sketch-v2.webp`. The prompt set, source references and output paths are recorded in `design-board/illustrated-assets.json`. Prior versions are retained. User-uploaded photos remain user content.

Onboarding now includes a connection walkthrough before profile posts: follow `@finfolk.com.au`, DM `/connect`, and enter the returned eight-character code in FinFolk within ten minutes. The next step animates `/profile add @finfolk.com.au` in a caption, collection, bio review and featuring the post. Each walkthrough has manual frames, pause/play, reduced-motion support and optional skipping. Playback pauses offscreen and while the document is hidden, and is disposed on navigation. These animations make no provider requests and do not claim an actual connection.

Open `http://127.0.0.1:8770/board/onboarding.html?step=instagram-connect` for the connection walkthrough, or use the registered Getting started screens and onboarding workflow. Run `npm run test:instagram-onboarding` for playback, reduced motion, instructions, skips, responsive layouts, illustrated assets and provider-request isolation.

### Connected page management and personal progress

Open `/board/pages.html?screen=mine` for My pages, or choose Page workspace, Page events, Personal sessions or Personal progress in the Atelier menus. Page workspaces connect Overview, Content, Team, Events and History using browser-persisted state (`finfolk:management:v1`). Drafts remain separate from public content. Page claims use an expiring /connect code from the page’s own Instagram account. Owners manage access; invitations are bound to an email, expire after seven days and can be revoked.

Events bring people together and track attendance. They have no training itinerary. Personal sessions remain independent and capture preparation tips, breathing/training metrics, dive notes and before/after results. Existing practice records and watch-study dives can be linked by source ID, with duplicate links rejected. Progress compares matching activity, context and metric, with a chart and exact-value table. Missing measurements remain missing.

Sessions start private. Owners can share selected preparation, dive records, before/after values with selected event members or all attendees. Organiser status grants no personal-data access; leaving an event or revoking a share removes event-scoped access. Cancelling an event or archiving a page preserves personal records. Detailed meeting-map event creation also saves to the shared management event list.

All actions remain local simulations. Run `npm run test:management` for permissions, publishing, claims, invitation lifecycle, personal records, selective sharing, comparisons and responsive browser checks.

### Claim pages and add content through Instagram

Pages use the same command pattern as personal profiles. From the page’s Instagram account, follow `@finfolk.com.au`, DM `/connect`, then enter the eight-character reply code in the page’s connection screen. Codes expire after ten minutes, are single-use and bound to the page, Instagram sender and requesting member. A fresh code replaces unused codes; another member cannot take an already-owned page. The older page challenge/reviewer flow is retired.

After connection, captions containing `/profile add @finfolk.com.au` on their own line feed the page’s Instagram content collection. Only the connected account is accepted. Duplicate receipts are rejected. Page owners/admins review collected drafts, publish/unpublish posts or remove them from the page; the original Instagram post is unaffected. Public pages show only published posts.

The Atelier provides explicitly labelled local DM and post-receipt simulations; no real Instagram connection, provider request or message is sent. Open `/board/pages.html?screen=claim&id=tideline` to try it. Run `npm run test:page-instagram` for sender/member isolation, expiry, replay, deduplication, draft privacy and publication.

Page claiming and Instagram content now include the same animated phone walkthrough component used by personal profiles. Page-specific frames show the current page identity, `/connect` and code redemption, then `/profile add`, draft collection, review and public publication. Pause/play, previous/next frames, reduced motion, visibility-aware playback and navigation cleanup are shared with onboarding. Run `npm run test:page-walkthrough` to verify both animations at 320, 390, 768 and 1440 px.

### Australian school demo collection

Open `http://127.0.0.1:8770/#preview/school-demos` or **Screen categories → Australian schools**. Six pages cover Freediving Australia, Apnea Australia, Freediving Central, OceanSense, Rusty Freediving and Freedive Tasmania. Public introductions and offerings are paraphrased from each school’s official website, linked on the page with a research date of 4 November 2026. The collection uses existing original acid-ocean illustrations; it does not reproduce school photography or advertise invented course dates or prices.

The pages support the same /connect claiming, Instagram post collection, content, team, events and history workflows as the other page demos. Five Instagram handles were confirmed from the official sites. Apnea Australia has a clearly labelled demo-only identity because its official handle was not verified. All provider IDs are synthetic. Sample posts and gatherings are labelled illustrative, not school announcements; no school endorsement or actual connection is implied.

`collection=schools` keeps page, team, invitation and event links scoped to `finfolk:school-demos:v1`, separate from existing management and personal-session data. The gallery has region filtering and a confirmed collection-only reset. Existing edits survive reloads. Run `npm run test:school-demos` for six identities, assets, filters, responsive pages, isolated claiming/persistence and event handoff.

## Product navigation in the Atelier

The local previews now use **Explore · Community · Events · Practice · You**. Explore opens the map; community notes stay attached to places. Community opens an overview of people, groups/outlets and Finfolk Coop. Events has its own browser and creation flow. Practice holds sessions, progress and training. Community and You show the sample Finnies balance; no balance is added to the global header.

Open [Community](http://127.0.0.1:8770/#preview/community-home), [Events](http://127.0.0.1:8770/#preview/events-browse), [Practice](http://127.0.0.1:8770/#preview/practice-home), or [You](http://127.0.0.1:8770/#preview/you-home). The Atelier menus group product screens by the same sections, alongside Workflows and Design studio. Existing hashes, stored reviews and local shop data remain available. This is an Atelier change; production navigation and point-earning rules are unchanged.

Run `npm run test:product-navigation` for the five-tab desktop/mobile journey, map notes and return-state checks.

The product screen browser includes section filters and search. Community features the Coop as a distinct destination while keeping Finnies within Community and You. The Community and Practice landing pages use the existing four-theme palette and responsive card system.

## Try FinFolk: one connected sandbox

Open **[Try FinFolk](http://127.0.0.1:8770/try/)** with `npm run moodboard` running, or choose **Try FinFolk ↗** in the Atelier header. The first visit starts with onboarding, then opens Explore’s map. The standalone shell uses Explore, Community, Events, Practice and You without the design inspector.

Changes persist in the separate `finfolk:sandbox:v1` IndexedDB database: profiles and portraits, notes, pages, events, sessions, practice data, simulated media and the Finnies wallet. Browser refresh resumes the demo. If storage is blocked, changes remain in the current tab and the header explains that limitation.

Use **Demo → View as** to switch between the member, page owner, page admin and Coop operator. Each has separate private records. The operator can complete or refund the member’s sample claims; the member sees the resulting Finnies balance on return. **Demo → Product scenarios** opens the existing mockups, including device and error concepts. **Reset demo** resets only sandbox records and returns to onboarding; existing Atelier studies and reviews remain untouched.

Read [the sandbox guide](docs/sandbox.md). Run `npm run test:sandbox` for shared state and permission tests, complete browser journeys, storage failure, responsive themes and the 87-screen sweep.
