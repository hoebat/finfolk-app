"""Explicit area limits and publisher references. No implied survey coverage."""

REGIONS = {
    "port-phillip": {
        "id": "port-phillip", "name": "Port Phillip Bay", "state": "Victoria",
        "bbox": [144.30, -38.40, 145.18, -37.80], "center": [144.85, -38.10], "zoom": 10,
        "raster_catalog": "https://discover.data.vic.gov.au/dataset/victorian-coastal-digital-elevation-model-2021-vcdem-10m",
        "raster_portal": "https://datashare.maps.vic.gov.au/search?md=373819c3-70dd-473c-9ceb-02d879950cf6",
        "contour_catalog": "https://discover.data.vic.gov.au/dataset/port-phillip-bay-depth-contours-at-1-25000",
        "contour_service": "https://core-gis.mapshare.vic.gov.au/arcgis/rest/services/Mapshare/MarineCoastal/MapServer/25",
        "contour_field": "depth", "contour_sign": 1,
        "contour_datum": "Unverified — original DATUM code retained per feature",
        "contour_survey": "1971–2000 (catalogue temporal coverage)",
        "attribution": "© State of Victoria, Department of Energy, Environment and Climate Action",
        "licence": "CC BY 4.0",
        "notes": "The 10 m DEM may contain interpolated/coarse-source areas. Verify the delivered product and source footprints. Contours alone do not support point depths or profiles.",
    },
    "bondi": {
        "id": "bondi", "name": "Sydney Eastern Beaches", "state": "New South Wales",
        "bbox": [151.215, -34.01, 151.34, -33.815], "center": [151.277, -33.915], "zoom": 11,
        "raster_catalog": "https://data.nsw.gov.au/data/dataset/marine-lidar-topo-bathy-2018",
        "raster_portal": "https://elevation.fsdf.org.au/",
        "combined_catalog": "https://www.data.nsw.gov.au/data/dataset/nsw-bathymetry-sourced-from-multibeam-and-marine-lidar-surveys",
        "contour_catalog": "https://data.nsw.gov.au/data/dataset/marine-lidar-topo-bathy-2018",
        "contour_service": "https://mapprod2.environment.nsw.gov.au/arcgis/rest/services/Coastal_Marine/NSW_Marine_Lidar_Bathymetry_Data_2018/MapServer/0",
        "contour_field": "Contour", "contour_sign": -1,
        "contour_datum": "AHD", "contour_survey": "July–December 2018",
        "attribution": "© State Government of NSW and NSW Department of Climate Change, Energy, the Environment and Water",
        "licence": "Creative Commons Attribution — retain supplied licence version",
        "notes": "Coverage requested from South Head to La Perouse, including Gordon’s Bay, Coogee and Maroubra. Published 2018 marine lidar contours use AHD; actual survey gaps remain visible. The source 5 m elevation grids are separate downloads, and laser coverage typically ends around 20–40 m. The catalogue ZIP is a coverage index, not the elevation rasters.",
    },
}

LIMITATION = "Surveyed seabed reference depths, not current water depths. No tide, swell or current adjustment. Publishers do not supply these products for navigation."
