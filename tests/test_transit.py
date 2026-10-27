import unittest
from datetime import date
from depth_explorer.transit import Timetable, active_services, seconds, weekends

class TransitTests(unittest.TestCase):
    def timetable(self):
        t=Timetable();t.stops={k:{'name':k} for k in 'ABCDE'}
        t.trips={'one':{'label':'train','dates':{date(2026,10,31)},'booking_note':None},'two':{'label':'bus','dates':{date(2026,10,31)},'booking_note':None},'missed':{'label':'too soon','dates':{date(2026,10,31)},'booking_note':None}}
        t.connections=[(7*3600,8*3600,'A','B','one','0','0'),(8*3600+60,9*3600,'B','C','missed','0','0'),(8*3600+600,9*3600+600,'B','C','two','0','0')]
        return t

    def test_calendar_exceptions_and_weekends(self):
        row={'service_id':'weekend','start_date':'20261001','end_date':'20261130',**{d:'1' for d in ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']}}
        self.assertEqual(active_services([row],[{'date':'20261031','service_id':'weekend','exception_type':'2'}],date(2026,10,31)),set())
        self.assertEqual(active_services([],[{'date':'20261031','service_id':'added','exception_type':'1'}],date(2026,10,31)),{'added'})
        self.assertEqual(weekends(date(2026,10,27))[0],date(2026,10,31))
        self.assertEqual(seconds('25:10:00'),90600)

    def test_transfer_buffer_and_itinerary(self):
        t=self.timetable();labels=t.scan(t.connections,['A'],6*3600)
        self.assertEqual(labels['C'][0],9*3600+600)
        legs=t.itinerary(labels['C'][1]);self.assertEqual([leg['trip'] for leg in legs],['one','two'])
        self.assertNotIn('E',labels)

    def test_reverse_scan_builds_return_in_correct_order(self):
        t=self.timetable();labels=t.scan(t.connections,['C'],10*3600,reverse=True)
        self.assertEqual(labels['A'][0],7*3600)
        legs=t.itinerary(labels['A'][1],reverse=True);self.assertEqual([leg['trip'] for leg in legs],['one','two']);self.assertEqual(legs[0]['from'],'A');self.assertEqual(legs[-1]['to'],'C')

    def test_walk_transfer_and_same_trip_continuity(self):
        t=self.timetable();t.edges['B']['D']=120
        t.connections=[(7*3600,8*3600,'A','B','one','0','0'),(8*3600,8*3600+60,'B','C','one','0','0')]
        labels=t.scan(t.connections,['A'],6*3600)
        self.assertEqual(labels['D'][0],8*3600+120)
        legs=t.itinerary(labels['C'][1]);self.assertEqual(len(legs),1);self.assertEqual(legs[0]['to'],'C')

    def test_previous_service_day_and_pickup_restrictions(self):
        t=self.timetable();t.trips['one']['dates']={date(2026,10,30)}
        t.connections=[(25*3600,26*3600,'A','B','one','1','0')]
        connections=t.for_day(date(2026,10,31));self.assertEqual(connections[0][:2],(3600,7200))
        self.assertNotIn('B',t.scan(connections,['A'],0))

class WalkingValidationTests(unittest.TestCase):
    def test_unknown_entry_is_not_ranked_and_return_route_is_required(self):
        import io,json,tempfile
        from pathlib import Path
        from unittest.mock import patch
        from scripts.build_transport import walking_links
        t=Timetable();t.stops={'s':{'id':'s','name':'Test stop','point':[145,-38]}}
        b={'id':'b','name':'TEST beach','point':[145.001,-38]}
        config={'walking_provider':'https://example.test/','walking_source':'https://example.test/attribution'}
        with tempfile.TemporaryDirectory() as root:
            links,_=walking_links(t,[b],config,Path(root));self.assertEqual(links,{})
            b['entry']={'point':b['point'],'verified':True,'source_url':'https://example.test/entry'}
            route={'code':'Ok','waypoints':[{'distance':1,'location':[145,-38]},{'distance':1,'location':b['point']}],'routes':[{'distance':100,'legs':[{'steps':[]}],'geometry':{'type':'LineString','coordinates':[[145,-38],b['point']]}}]}
            with patch('scripts.build_transport.time.sleep'),patch('scripts.build_transport.urllib.request.urlopen',side_effect=[io.BytesIO(json.dumps(route).encode()),io.BytesIO(b'{"code":"NoRoute"}')]):
                links,_=walking_links(t,[b],config,Path(root));self.assertEqual(links,{},'A one-way-only walking result must not establish a return trip')

    def test_failed_refresh_retains_only_valid_comparisons(self):
        import json,tempfile
        from pathlib import Path
        from unittest.mock import patch
        from scripts.build_transport import build
        with tempfile.TemporaryDirectory() as root:
            p=Path(root)/'journeys.json'
            p.write_text(json.dumps({'journeys':[{'origin_id':'central','date':'2026-10-31','valid_until':'2026-10-31','beach_id':'test','trip_type':'day','outbound':[],'return':{'duration_min':60},'outbound_min':60,'walking_min':10,'transfers':1,'walk_max_leg_min':10},{'origin_id':'central','date':'2026-10-24','valid_until':'2026-10-24'}]}))
            with patch('scripts.build_transport.fetch_feed',side_effect=ValueError('Test feed unavailable')):
                result=build(Path(root),p,date(2026,10,27))
            self.assertEqual(len(result['journeys']),1);self.assertEqual(result['journeys'][0]['date'],'2026-10-31');self.assertTrue(all(source['status']=='unavailable' for source in result['sources']))
