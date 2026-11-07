# Where’s your water? map selector

Open /board/onboarding.html?step=locations in the local FinFolk Atelier (default preview port 8770).

The places step now reuses the existing OSM/Web Mercator meeting-map component with optional accessible beach markers and a browser-location indicator. Use my location requests a one-time browser fix; location denial or timeout leaves search and beach selection available. No continuous tracking or reverse geocoding is used. Clear location removes the transient fix while preserving chosen beach IDs. Selecting a marker or list button toggles the beach in the existing profile draft. Continue, Back, reload, Skip and final profile save retain the established onboarding model.

The closest selector uses straight-line great-circle distance among the three existing sample beaches: Bondi, Portsea and Greenfield. Coordinate fixtures reuse the Atelier event locations. It is explicitly not a complete Australian beach search, route estimate, check-in or safety assessment. Only selected beach IDs enter persisted onboarding/profile data; precise coordinates and accuracy are held in memory for the setup visit. Map zoom/pan and OSM attribution remain available; selection still works if tiles fail.

The shared map API gained optional markers, onMarker and indicatorLabel inputs with no changes to existing meeting-zone defaults. Selector disposal disconnects map observers; late geolocation callbacks after leaving the step are ignored. Styles use FinFolk onboarding theme variables and respect narrow screens. Automated tests stub OSM tiles instead of requesting the public service.

Validation: npm run test:onboarding-water; node tests/test_onboarding.mjs; node tests/test_meeting_zone.mjs. Covers nearest ranking, permission success/denial, marker presence, search, multiple beach selection, clearing location, returning to the step, no persisted coordinates and 320/390/768/1440 widths.
