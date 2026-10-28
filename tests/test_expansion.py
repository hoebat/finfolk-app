import unittest
from unittest.mock import patch
from depth_explorer.net import query_wfs_features, normalize_contours
from depth_explorer.national import package_for
from depth_explorer.catalog import REGIONS

class ExpansionTests(unittest.TestCase):
    def test_local_published_package_wins_overlap(self):
        broad={'id':'broad','bbox':[140,-40,150,-30],'status':'contours'}
        local={'id':'local','bbox':[144,-39,146,-37],'status':'contours'}
        self.assertEqual(package_for([145,-38],[broad,local])['id'],'local')
        self.assertEqual(package_for([145,-38],[{**local,'status':'empty'},broad])['id'],'broad')
        self.assertIsNone(package_for([155,-38],[broad]))

    def test_complete_wfs_paging_and_axis_order(self):
        page=[{'id':str(i)} for i in range(100)]
        with patch('depth_explorer.net.get_json',side_effect=[{'numberMatched':101,'features':page},{'numberMatched':101,'features':[{'id':'100'}]}]) as request:
            result,meta=query_wfs_features('https://example.test/wfs',[146,-44,149,-40],'contours','Geometry','OID')
        self.assertEqual(len(result['features']),101)
        params=request.call_args_list[1].args[1]
        self.assertEqual(params['startIndex'],100)
        self.assertEqual(params['cql_filter'],"BBOX(Geometry,146,-44,149,-40,'EPSG:4326')")
        self.assertEqual(params['srsName'],'EPSG:4326')

    def test_wfs_rejects_partial_duplicate_and_changing_count(self):
        first={'numberMatched':101,'features':[{'id':str(i)} for i in range(100)]}
        cases=[[{'numberMatched':2,'features':[{'id':'one'}]}], [first,{'numberMatched':101,'features':[{'id':'0'}]}], [first,{'numberMatched':102,'features':[{'id':'100'}]}]]
        for pages in cases:
            with self.subTest(pages=len(pages)),patch('depth_explorer.net.get_json',side_effect=pages):
                with self.assertRaises(ValueError):query_wfs_features('https://example.test',None,'contours','Geometry','OID')

    def test_new_reference_signs_and_existing_ids(self):
        self.assertTrue({'port-phillip','bondi','jervis-bay','western-port'}.issubset(REGIONS))
        self.assertEqual(len(REGIONS),16)
        for ident,value,expected in [('nsw-northern-beaches',-10,10),('tas-southeast',10,10),('vic-corner-inlet',10,10)]:
            region=REGIONS[ident]
            feature={'properties':{region['contour_field']:value},'geometry':{'type':'LineString','coordinates':[[147,-43],[147.1,-43.1]]}}
            output=normalize_contours({'features':[feature]},region)['features'][0]
            self.assertEqual(output['properties']['depth_m'],expected)
            self.assertEqual(output['properties']['datum_label'],region['contour_datum'])

    def test_tasmania_checks_whole_layer_before_local_envelope(self):
        from depth_explorer.acquire import contour_collection
        inside={'id':'inside','properties':{'CONTOUR':10},'geometry':{'type':'LineString','coordinates':[[147,-43],[147.1,-43.1]]}}
        outside={'id':'outside','properties':{'CONTOUR':10},'geometry':{'type':'LineString','coordinates':[[149,-41],[149.1,-41.1]]}}
        with patch('depth_explorer.acquire.query_wfs_features',return_value=({'features':[inside,outside]},{})) as request:
            collection,metadata=contour_collection('tas-southeast')
        self.assertIsNone(request.call_args.args[1])
        self.assertEqual([f['id'] for f in collection['features']],['inside'])
        self.assertEqual(metadata['layers'][0]['metadata']['local_envelope'],REGIONS['tas-southeast']['bbox'])

    def test_source_archive_contains_only_active_files(self):
        import json,tempfile
        from pathlib import Path
        from scripts.archive_sources import prepare
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'datasets';root.mkdir()
            inventory={'rasters':[],'contours':{'test':{'file':'processed/test/contours-one.geojson'}},'acquisitions':[]}
            (root/'inventory.json').write_text(json.dumps(inventory))
            for path in ['processed/test/contours-one.geojson','raw/test/contours-one/original.geojson','raw/test/contours-one/service.json','raw/test/stale/original.geojson']:
                target=root/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_text('{}')
            with patch('scripts.archive_sources.subprocess.check_output',return_value=b'{"rasters":[],"contours":{},"acquisitions":[]}'):
                self.assertTrue(prepare(root,Path(temp)/'out'))
            self.assertTrue((Path(temp)/'out/raw/test/contours-one/original.geojson').exists())
            self.assertFalse((Path(temp)/'out/raw/test/stale/original.geojson').exists())

    def test_arcgis_timeout_splits_batch_without_losing_features(self):
        from depth_explorer.net import query_features
        metadata={'fields':[{'name':'OBJECTID','type':'esriFieldTypeOID'}]}
        features=[{'id':i,'properties':{'OBJECTID':i}} for i in [1,2]]
        with patch('depth_explorer.net.get_json',side_effect=[metadata,{'objectIds':[1,2]},TimeoutError('large response'),{'features':features[:1]},{'features':features[1:]}]):
            result,_=query_features('https://example.test/layer',None)
        self.assertEqual([f['id'] for f in result['features']],[1,2])

    def test_source_transfer_checks_archive_and_original_hashes(self):
        import tempfile,json,zipfile,hashlib
        from pathlib import Path
        from depth_explorer.store import Store
        from scripts.seed_contours import seed
        raw=json.dumps({'features':[{'properties':{'Contour':-10},'geometry':{'type':'LineString','coordinates':[[151,-34],[151.1,-34.1]]}}]}).encode()
        expected={'contours':[{'region':'nsw-hunter','feature_count':1,'raw_sha256':hashlib.sha256(raw).hexdigest()}]}
        service=REGIONS['nsw-hunter']['contour_service']
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'sources.zip'
            with zipfile.ZipFile(path,'w') as z:
                z.writestr('nsw-hunter/original.geojson',raw)
                z.writestr('nsw-hunter/service.json',json.dumps({'layers':[{'url':service}]}))
            digest=hashlib.sha256(path.read_bytes()).hexdigest()
            store=Store(Path(temp)/'data')
            with patch('scripts.seed_contours.review_records',return_value=expected):
                with self.assertRaisesRegex(ValueError,'checksum mismatch'):seed(store,path,'0'*64)
                seed(store,path,digest)
            self.assertEqual(store.load()['contours']['nsw-hunter']['count'],1)
            expected['contours'][0]['raw_sha256']='0'*64
            with patch('scripts.seed_contours.review_records',return_value=expected):
                with self.assertRaisesRegex(ValueError,'government response checksum'):seed(store,path,digest)
