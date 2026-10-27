import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from depth_explorer.national import CoastIndex,directory,safe_url
from depth_explorer.catalog import REGIONS
from scripts.acquire_national import main,surveys

COAST={'features':[{'geometry':{'type':'LineString','coordinates':[[145,-39],[145,-37]]}}]}

class NationalTests(unittest.TestCase):
    def test_coastal_screen_distinguishes_inland_points(self):
        coast=CoastIndex(COAST)
        self.assertLess(coast.nearest([145.001,-38]),100)
        self.assertGreater(coast.nearest([145.5,-38]),30000)

    def test_existing_links_aliases_and_territory_survive_import(self):
        root=Path(__file__).resolve().parents[1];seed=json.loads((root/'web/beaches.json').read_text());areas=json.loads((root/'config/areas.json').read_text())
        example={'id':'ga-test','name':'Edithvale Beach','point':[145.1068,-38.0387],'state_id':'VIC','source_url':'https://example.test/'}
        output=directory(seed,{'beaches':[example]},areas,list(REGIONS.values()))
        self.assertEqual(len(output['beaches']),len(seed['beaches']))
        edithvale=next(b for b in output['beaches'] if b['id']=='edithvale');self.assertEqual(edithvale['region'],'port-phillip');self.assertTrue(edithvale['additional_sources'])
        murrays=next(b for b in output['beaches'] if b['id']=='murrays-beach');self.assertEqual(murrays['jurisdiction_id'],'JBT');self.assertEqual(murrays['region'],'jervis-bay')

    def test_imported_uncertain_jurisdiction_is_not_inferred_from_browse_state(self):
        root=Path(__file__).resolve().parents[1];areas=json.loads((root/'config/areas.json').read_text())
        b={'id':'ga-aho','name':'TEST beach','point':[151.2,-33.9],'state_id':'NSW','jurisdiction_id':'unverified','source_url':'https://example.test/'}
        result=directory({'beaches':[],'sources':[],'location_note':''},{'beaches':[b]},areas,list(REGIONS.values()))
        self.assertEqual(result['beaches'][0]['jurisdiction_id'],'unverified')

    def test_source_links_are_https_without_embedded_credentials(self):
        for value in ['http://example.org','javascript:alert(1)','https://key:secret@example.org',None]:self.assertIsNone(safe_url(value))
        self.assertEqual(safe_url('https://example.org/'),'https://example.org/')

    def test_incomplete_survey_index_is_rejected(self):
        cap=b'<wfs:WFS_Capabilities xmlns:wfs="http://www.opengis.net/wfs/2.0" />'
        response={'numberMatched':2,'features':[{'id':'one','properties':{'NAME':'TEST survey'}}]}
        with tempfile.TemporaryDirectory() as root,patch('scripts.acquire_national.fetch',side_effect=[cap,response]):
            with self.assertRaisesRegex(ValueError,'Incomplete'):surveys(Path(root))

    def test_failed_refresh_retains_last_valid_records(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root);previous={'beaches':[],'stays':[{'id':'test'}],'surveys':[{'id':'test'}],'refresh':{}}
            (path/'snapshot.json').write_text(json.dumps(previous))
            with patch('scripts.acquire_national.fetch',side_effect=[COAST,OSError('offline')]),patch('scripts.acquire_national.beaches',side_effect=OSError()),patch('scripts.acquire_national.stays',side_effect=OSError()),patch('scripts.acquire_national.surveys',side_effect=OSError()):main(path)
            result=json.loads((path/'snapshot.json').read_text());self.assertEqual(result['stays'],previous['stays']);self.assertEqual(result['surveys'],previous['surveys']);self.assertEqual(result['refresh']['stays']['status'],'retained')
