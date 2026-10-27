import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from depth_explorer.acquire import fetch_contours,save_contours
from depth_explorer.store import Store

class MultiLayerTests(unittest.TestCase):
    def feature(self,depth=10):
        return {'type':'Feature','properties':{'DEPTH':depth,'DATUM':1.6},'geometry':{'type':'LineString','coordinates':[[145.2,-38.4],[145.21,-38.4]]}}

    def test_layer_failure_keeps_previous_complete_snapshot(self):
        with tempfile.TemporaryDirectory() as root:
            store=Store(Path(root));old=save_contours(store,'western-port',{'features':[self.feature()]})
            with patch('depth_explorer.acquire.query_features',side_effect=[({'features':[self.feature(15)]},{}),ValueError('second layer unavailable')]):
                with self.assertRaises(ValueError):fetch_contours(store,'western-port')
            self.assertEqual(store.load()['contours']['western-port']['file'],old['file'])
            self.assertEqual(store.contours('western-port')['features'][0]['properties']['depth_m'],10)

    def test_duplicate_geometry_is_not_published_twice(self):
        with tempfile.TemporaryDirectory() as root:
            store=Store(Path(root))
            with patch('depth_explorer.acquire.query_features',side_effect=[({'features':[self.feature()]},{}),({'features':[self.feature(),self.feature(15)]},{})]):
                result=fetch_contours(store,'western-port')
            self.assertEqual(result['count'],2);self.assertEqual(len(result['source_urls']),2)
            self.assertEqual(store.contours('western-port')['features'][0]['properties']['DATUM'],1.6)
