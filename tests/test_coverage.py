import unittest
from scripts.fetch_missing_contours import covers
from depth_explorer.catalog import REGIONS

class CoverageTests(unittest.TestCase):
    def test_expanded_sydney_requires_new_snapshot(self):
        requested = REGIONS['bondi']['bbox']
        self.assertFalse(covers([151.265, -33.915, 151.315, -33.875], requested))
        self.assertFalse(covers(None, requested))
        self.assertTrue(covers(requested, requested))
        self.assertTrue(covers([151, -35, 152, -33], requested))
