"""Build dated, backend-free public-transport comparisons from official GTFS."""
import argparse
import hashlib
import json
import math
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from depth_explorer.net import atomic_json
from depth_explorer.store import distance
from depth_explorer.transit import Timetable, weekends

ROOT=Path(__file__).resolve().parents[1]

def fetch_feed(feed,cache):
    key=os.environ.get(feed.get('key_env',''))
    if feed.get('key_env') and not key:raise ValueError('Scheduled comparisons are not configured for this state')
    path=cache/(feed['id']+'.zip')
    if path.exists() and time.time()-path.stat().st_mtime<20*3600:return path
    headers={'User-Agent':'ShoreDepthExplorer/1.0'}
    if key:headers['Authorization']='apikey '+key
    part=path.with_suffix('.part')
    try:
        with urllib.request.urlopen(urllib.request.Request(feed['url'],headers=headers),timeout=60) as response,part.open('wb') as output:
            total=0
            while chunk:=response.read(1024*1024):
                total+=len(chunk)
                if total>2*1024**3:raise ValueError('GTFS feed exceeds 2 GiB download limit')
                output.write(chunk)
        import zipfile
        if not zipfile.is_zipfile(part):raise ValueError('Timetable response is not a ZIP')
        part.replace(path)
    except Exception:
        if path.exists() and time.time()-path.stat().st_mtime<7*86400:return path
        raise
    finally:part.unlink(missing_ok=True)
    return path

def connect_interchanges(timetable,config,cache):
    """Verify missing cross-feed station/coach links on the pedestrian network."""
    patterns=['^Southern Cross (Station|Railway Station|Coach Terminal)', '^Anderson Bus Interchange', '^Dandenong (Station|Railway Station|Bus)', '^Geelong (Station|Railway Station)', '^Frankston (Station|Railway Station)', '^Bomaderry Station', '^Kiama Station']
    deadline=time.monotonic()+180
    for pattern in patterns:
        if time.monotonic()>deadline:break
        candidates=[sid for sid,stop in timetable.stops.items() if re.search(pattern,stop['name'],re.I)]
        # Select one representative per already-connected station component.
        components=[];unseen=set(candidates)
        while unseen:
            start=min(unseen);reached={start};queue=[start]
            while queue:
                for neighbour in timetable.edges.get(queue.pop(),{}):
                    if neighbour not in reached:reached.add(neighbour);queue.append(neighbour)
            group=unseen & reached;unseen-=group
            representative=min(group,key=lambda sid:(0 if timetable.stops[sid]['name'].endswith('Railway Station') else 1,sid))
            components.append((representative,group))
        components.sort(key=lambda c:len(c[1]),reverse=True)
        if not components:continue
        a=components[0][0]
        for b,_ in sorted(components[1:],key=lambda c:distance(timetable.stops[a]['point'],timetable.stops[c[0]]['point']))[:6]:
            if time.monotonic()>deadline:break
            if distance(timetable.stops[a]['point'],timetable.stops[b]['point'])>600:continue
            coords=';'.join(','.join(map(str,timetable.stops[sid]['point'])) for sid in [a,b])
            url=config['walking_provider']+coords+'?overview=false&alternatives=false'
            file=cache/('transfer-'+hashlib.sha256(url.encode()).hexdigest()[:20]+'.json')
            try:
                if file.exists():j=json.loads(file.read_text())
                else:
                    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ShoreDepthExplorer/1.0'}),timeout=25) as response:j=json.load(response)
                    if j.get('code')!='Ok':continue
                    atomic_json(file,j);time.sleep(1)
                if any(w['distance']>60 for w in j['waypoints']) or j['routes'][0]['distance']>1200:continue
                duration=math.ceil((j['routes'][0]['distance']+sum(w['distance'] for w in j['waypoints']))/4000*3600)
                timetable.edges[a][b]=max(120,duration)
                # Fetch the reverse route independently: access can be directional.
                reversecoords=';'.join(reversed(coords.split(';')));reverseurl=config['walking_provider']+reversecoords+'?overview=false&alternatives=false'
                reversefile=cache/('transfer-'+hashlib.sha256(reverseurl.encode()).hexdigest()[:20]+'.json')
                if reversefile.exists():back=json.loads(reversefile.read_text())
                else:
                    with urllib.request.urlopen(urllib.request.Request(reverseurl,headers={'User-Agent':'ShoreDepthExplorer/1.0'}),timeout=25) as response:back=json.load(response)
                    if back.get('code')!='Ok':continue
                    atomic_json(reversefile,back);time.sleep(1)
                if any(w['distance']>60 for w in back['waypoints']) or back['routes'][0]['distance']>1200:continue
                duration=math.ceil((back['routes'][0]['distance']+sum(w['distance'] for w in back['waypoints']))/4000*3600)
                timetable.edges[b][a]=max(120,duration)
            except (OSError,ValueError,KeyError,IndexError):continue

def walking_links(timetable,beaches,config,cache):
    """Only route to sourced access points. Unknown reference points are unranked."""
    output={};issues=[];deadline=time.monotonic()+360
    for beach in beaches:
        entry=beach.get('entry');streets=beach.get('access_streets',[])
        if not (entry and entry.get('verified')) and not streets:continue
        point=entry['point'] if entry and entry.get('verified') else beach['point']
        nearby=sorted(((distance(s['point'],point),sid,s) for sid,s in timetable.stops.items() if distance(s['point'],point)<=2000),key=lambda x:x[0])
        # Avoid duplicate GTFS platforms producing identical foot-route requests.
        candidates=[];points=set()
        for _,sid,stop in nearby:
            key=tuple(round(x,5) for x in stop['point'])
            if key in points:continue
            points.add(key);candidates.append((sid,stop))
            if len(candidates)==4:break
        links=[]
        for sid,stop in candidates:
            if time.monotonic()>deadline:
                issues.append({'beach_id':beach['id'],'status':'walking-refresh-time-budget'});break
            coords=';'.join(','.join(map(str,p)) for p in [stop['point'],point]);url=config['walking_provider']+coords+'?overview=full&geometries=geojson&steps=true&alternatives=false'
            file=cache/('walk-'+hashlib.sha256(url.encode()).hexdigest()[:20]+'.json')
            try:
                if file.exists() and time.time()-file.stat().st_mtime<90*86400:j=json.loads(file.read_text())
                else:
                    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ShoreDepthExplorer/1.0'}),timeout=25) as response:j=json.load(response)
                    if j.get('code')!='Ok':raise ValueError('No pedestrian network route')
                    atomic_json(file,j);time.sleep(1)
                reverse_url=config['walking_provider']+';'.join(reversed(coords.split(';')))+'?overview=false&alternatives=false'
                reverse_file=cache/('walk-return-'+hashlib.sha256(reverse_url.encode()).hexdigest()[:20]+'.json')
                if reverse_file.exists():back=json.loads(reverse_file.read_text())
                else:
                    with urllib.request.urlopen(urllib.request.Request(reverse_url,headers={'User-Agent':'ShoreDepthExplorer/1.0'}),timeout=25) as response:back=json.load(response)
                    if back.get('code')!='Ok':continue
                    atomic_json(reverse_file,back);time.sleep(1)
                if len(back['waypoints'])!=2 or back['waypoints'][1]['distance']>60 or back['waypoints'][0]['distance']>(60 if entry and entry.get('verified') else 200):continue
                if len(j['waypoints'])!=2 or j['waypoints'][0]['distance']>60 or j['waypoints'][1]['distance']>(60 if entry and entry.get('verified') else 200):continue
                route=j['routes'][0];steps=route['legs'][0].get('steps',[])
                # For a beach reference centre, require a named, documented access
                # street within the final 600 m of the mapped pedestrian route.
                if not (entry and entry.get('verified')):
                    tail=[];metres=0
                    for step in reversed(steps):
                        tail.append(step.get('name','').lower());metres+=step.get('distance',0)
                        if metres>600:break
                    if not any(street.lower() in ' '.join(tail) for street in streets):continue
                seconds=math.ceil(max(route['distance']+j['waypoints'][0]['distance']+(j['waypoints'][1]['distance'] if entry and entry.get('verified') else 0),back['routes'][0]['distance']+back['waypoints'][1]['distance']+(back['waypoints'][0]['distance'] if entry and entry.get('verified') else 0))/4000*3600)
                if seconds>3600:continue
                links.append({'stop_id':sid,'seconds':seconds,'distance_m':route['distance'],'reference_offset_m':j['waypoints'][1]['distance'],'point':j['waypoints'][1]['location'],'source_url':config['walking_source'],'access_source':entry['source_url'] if entry and entry.get('verified') else beach['access_source'],'route_id':hashlib.sha256(url.encode()).hexdigest()[:20],'geometry':route['geometry'],'label':f"Walk {math.ceil(seconds/60)} min between {stop['name']} and sourced beach access at {beach['name']}"})
            except (OSError,ValueError,KeyError,IndexError):issues.append({'beach_id':beach['id'],'status':'walking-route-unavailable'})
        if links:output[beach['id']]=links
    return output,issues

def make_journey(timetable,beach,origin,day,trip_type,outbound_labels,return_labels,links,valid_until,generated_at):
    options=[]
    for walk in links:
        sid=walk['stop_id'];arrival=outbound_labels.get(sid);back=return_labels.get(sid)
        if not arrival or not back or not arrival[1] or not back[1]:continue
        outbound=timetable.itinerary(arrival[1]);return_legs=timetable.itinerary(back[1],reverse=True)
        if not outbound or not return_legs:continue
        ride_first=next((leg for leg in outbound if leg['kind']=='ride'),None)
        if not ride_first or not 6*3600<=ride_first['departure_s']<=10*3600:continue
        arrive=arrival[0]+walk['seconds'];depart=back[0]-walk['seconds'];offset=86400 if trip_type=='overnight' else 0
        if depart+offset-arrive<4*3600:continue
        if trip_type=='overnight' and depart<14*3600:continue
        start=outbound[0]['departure_s'];finish=return_legs[-1]['arrival_s']
        if start<6*3600 or finish>23*3600:continue
        walk_public={k:v for k,v in walk.items() if k!='geometry'}
        end_walk={**walk_public,'kind':'walk','departure_s':arrival[0],'arrival_s':arrive}
        start_walk={**walk_public,'kind':'walk','departure_s':depart,'arrival_s':back[0]}
        duration=math.ceil((arrive-start)/60);return_duration=math.ceil((finish-depart)/60)
        walking=sum(leg['arrival_s']-leg['departure_s'] for leg in outbound if leg['kind']=='walk')+walk['seconds']
        return_walking=sum(leg['arrival_s']-leg['departure_s'] for leg in return_legs if leg['kind']=='walk')+walk['seconds']
        all_walks=[leg['arrival_s']-leg['departure_s'] for leg in outbound+return_legs if leg['kind']=='walk']+[walk['seconds']]
        options.append({'status':'available','beach_id':beach['id'],'origin_id':origin['id'],'date':day.isoformat(),'trip_type':trip_type,'valid_until':valid_until,'generated_at':generated_at,'walk_verified':True,'walk_max_leg_min':math.ceil(max(all_walks)/60),'walking_min':math.ceil(max(walking,return_walking)/60),'transfers':max(0,sum(leg['kind']=='ride' for leg in outbound)-1),'outbound_min':duration,'time_at_destination_min':math.floor((depart+offset-arrive)/60),'outbound':outbound+[end_walk],'return':{'date':(day+timedelta(days=trip_type=='overnight')).isoformat(),'duration_min':return_duration,'legs':[start_walk]+return_legs},'access_source':walk['access_source']})
    # Keep tradeoffs so walking/transfer filters can choose a different valid trip.
    unique={}
    for option in options:
        key=(option['outbound_min'],option['walking_min'],option['transfers']);unique.setdefault(key,option)
    return list(unique.values())

def build(cache,output,today=None,feed_overrides=None):
    config=json.loads((ROOT/'config/transport.json').read_text());beaches=json.loads((ROOT/'web/beaches.json').read_text())['beaches']
    today=today or datetime.now(ZoneInfo(config['timezone'])).date();saturdays=weekends(today);days=[d+timedelta(days=i) for d in saturdays for i in [0,1]]
    generated=datetime.now(ZoneInfo('UTC')).isoformat();result={'version':1,'generated_at':generated,'origins':config['origins'],'dates':[d.isoformat() for d in saturdays],'sources':[],'journeys':[],'walking_routes':{},'issues':[],'walking_attribution':config['walking_note'],'method':'Dated scheduled examples. Earliest-arrival searches at 06:00, 07:00, 08:00, 09:00 and 10:00; latest feasible return by 23:00. Rankings compare generated options, not every possible departure.'}
    cache.mkdir(parents=True,exist_ok=True)
    old=json.loads(output.read_text()) if output.exists() else {'journeys':[]}
    for feed in config['feeds']:
        relevant=[b for b in beaches if b['state']==feed['state']]
        try:
            path=(feed_overrides or {}).get(feed['id']) or fetch_feed(feed,cache)
            points=[b['point'] for b in relevant]+[o['point'] for o in config['origins'] if o['state']==feed['state']]
            bbox=[min(p[0] for p in points)-.5,min(p[1] for p in points)-.5,max(p[0] for p in points)+.5,max(p[1] for p in points)+.5]
            timetable=Timetable().read(path,days,bbox);connect_interchanges(timetable,config,cache);links,issues=walking_links(timetable,relevant,config,cache);result['issues'].extend(issues)
            for walks in links.values():
                for walk in walks:result['walking_routes'][walk['route_id']]={'geometry':walk['geometry'],'source_url':walk['source_url'],'access_source':walk['access_source']}
            result['sources'].append({'state':feed['state'],'status':'available','source_url':feed['source_url'],'feed_downloaded_at':datetime.fromtimestamp(path.stat().st_mtime,ZoneInfo('UTC')).isoformat(),'walking_destinations':len(links),'valid_dates':[d.isoformat() for d in sorted(timetable.valid_dates)]})
            origins=[(o,timetable.origin_stops(o)) for o in config['origins'] if o['state']==feed['state']]
            for day in saturdays:
                print('Routing',feed['id'],day,flush=True)
                conns=timetable.for_day(day);sunday=timetable.for_day(day+timedelta(days=1))
                if not conns:continue
                for origin,starts in origins:
                    if not starts:continue
                    returns={kind:timetable.scan(cs,starts,23*3600,reverse=True) for kind,cs in [('day',conns),('overnight',sunday)]}
                    for hour in [6,7,8,9,10]:
                        outbound=timetable.scan(conns,starts,hour*3600)
                        for beach in relevant:
                            if beach['id'] not in links:continue
                            for kind in ['day','overnight']:
                                result['journeys'].extend(make_journey(timetable,beach,origin,day,kind,outbound,returns[kind],links[beach['id']],(day+timedelta(days=kind=='overnight')).isoformat(),generated))
        except (OSError,ValueError,KeyError,RuntimeError) as exc:
            # Never emit credentials or request headers in public build logs.
            message=str(exc) if isinstance(exc,ValueError) else 'Timetable acquisition or processing failed; previous valid comparisons retained'
            result['sources'].append({'state':feed['state'],'status':'unavailable','source_url':feed['source_url'],'message':message})
            ids={o['id'] for o in config['origins'] if o['state']==feed['state']}
            result['journeys'].extend(j for j in old.get('journeys',[]) if j['origin_id'] in ids and j['valid_until']>=today.isoformat() and j['date'] in result['dates'])
    unique={json.dumps([j['beach_id'],j['origin_id'],j['date'],j['trip_type'],j['outbound'],j['return']],sort_keys=True):j for j in result['journeys']}
    groups={}
    for journey in unique.values():
        group=(journey['beach_id'],journey['origin_id'],journey['date'],journey['trip_type'])
        groups.setdefault(group,[]).append(journey)
    pruned=[]
    for options in groups.values():
        frontier=[]
        metrics=lambda j:(j['outbound_min'],j['walking_min'],j['transfers'],j['walk_max_leg_min'],j['return']['duration_min'])
        for option in sorted(options,key=metrics):
            values=metrics(option)
            if any(all(a<=b for a,b in zip(metrics(existing),values)) for existing in frontier):continue
            frontier=[existing for existing in frontier if not all(a<=b for a,b in zip(values,metrics(existing)))];frontier.append(option)
        pruned.extend(frontier)
    result['journeys']=pruned;atomic_json(output,result);print('Published',len(result['journeys']),'scheduled journey options',flush=True);return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,default=Path('.cache/transit'));parser.add_argument('--output',type=Path,default=Path('config/journeys.json'));parser.add_argument('--date',type=date.fromisoformat);parser.add_argument('--vic-feed',type=Path);parser.add_argument('--nsw-feed',type=Path);args=parser.parse_args()
    build(args.cache,args.output,args.date,{k:v for k,v in [('vic',args.vic_feed),('nsw',args.nsw_feed)] if v})
