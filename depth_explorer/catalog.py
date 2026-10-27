"""Explicit area limits and publisher references. No implied survey coverage."""

import json
from pathlib import Path

REGIONS = {region['id']: region for region in json.loads(Path(__file__).with_name('regions.json').read_text())}

LIMITATION = "Surveyed seabed reference depths, not current water depths. No tide, swell or current adjustment. Publishers do not supply these products for navigation."
