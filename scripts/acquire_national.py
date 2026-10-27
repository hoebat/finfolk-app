"""Acquire national place names, mapped stays and survey metadata; no fabricated depth."""
import argparse
import json
import re
import shutil
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime,timezone
from pathlib import Path
from depth_explorer.national import CoastIndex,safe_url,slug,directory
from depth_explorer.catalog import REGIONS
from depth_explorer.store import distance
from depth_explorer.net import atomic_json,query_features

GA='https://services.ga.gov.au/gis/rest/services/Composite_Gazetteer_of_Australia/MapServer/0'
COAST='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_coastline.geojson'
WFS='https://warehouse.ausseabed.gov.au/geoserver/ows'
AGENT='ShoreDepthExplorer/1.0 (https://github.com/hoebat/shore-depth-explorer)'

def fetch(url,cache,json_data=True,body=None,max_bytes=80*1024**2):
    if cache.exists() and time.time()-cache.stat().st_mtime<6*86400:return json.loads(cache.read_text()) if json_data else cache.read_bytes()
    req=urllib.request.Request(url,data=body,headers={'User-Agent':AGENT})
    with urllib.request.urlopen(req,timeout=80) as response:data=response.read(max_bytes+1)
    if len(data)>max_bytes:raise ValueError('Source exceeded acquisition size budget')
    parsed=json.loads(data) if json_data else data
    if json_data and isinstance(parsed,dict) and (parsed.get('error') or parsed.get('remark')):raise ValueError('Source returned an incomplete result')
    cache.parent.mkdir(parents=True,exist_ok=True);part=cache.with_suffix('.part');part.write_bytes(data);part.replace(cache)
    return parsed

def beaches(cache,coast):
    path=cache/'gazetteer.geojson'
    if path.exists() and time.time()-path.stat().st_mtime<6*86400:collection=json.loads(path.read_text())
    else:
        collection,metadata=query_features(GA,None,"upper(feature) like '%BEACH%'")
        atomic_json(path,collection);atomic_json(cache/'gazetteer-service.json',metadata)
    rows=[]
    for f in collection['features']:
        p={k.lower():v for k,v in f['properties'].items()};point=f['geometry']['coordinates'][:2];authority=p['authority']
        if not -50<=point[1]<=-5 or not 90<=point[0]<=180:continue
        shore=coast.nearest(point)
        if shore>5000:continue
        sid=authority
        if sid=='ACT' and 150.5<point[0]<150.9 and -35.3<point[1]<-35.1:sid='JBT'
        elif sid in ['AAD','AHO']:sid='EXT'
        if sid not in ['VIC','NSW','TAS','SA','WA','QLD','NT','JBT','EXT']:continue
        rows.append({'id':'ga-'+slug(p['id']),'name':p['name'].title(),'state_id':sid,'point':point,'reference_label':'Geoscience Australia / '+authority+' gazetted place-name reference','source_id':'ga-gazetteer','source_record_id':p['id'],'source_url':'https://placenames.fsdf.org.au/','coast_distance_m':round(shore),'facts':[]})
    # AHO is a naming authority, not a state. Use nearby state records only
    # for browsing; do not turn that approximation into a legal jurisdiction.
    established=[b for b in rows if b['state_id']!='EXT']
    for row in rows:
        if row['state_id']=='EXT':
            nearest=min(established,key=lambda b:distance(row['point'],b['point']),default=None)
            if nearest and distance(row['point'],nearest['point'])<100000:row['state_id']=nearest['state_id']
            if 158.9<row['point'][0]<159.2 and -31.7<row['point'][1]<-31.3:row['state_id']='NSW'
            row['jurisdiction_id']='unverified'
    return rows

def stays(cache,coast):
    query='[out:json][timeout:60];nwr["tourism"~"^(camp_site|caravan_site|chalet)$"](-44,112,-10,154);out center tags;'
    data=None
    for host in ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']:
        try:data=fetch(host,cache/'stays-osm.json',body=urllib.parse.urlencode({'data':query}).encode());break
        except (OSError,ValueError):continue
    if data is None:raise ValueError('Mapped-stay source unavailable')
    output=[]
    for f in data['elements']:
        tags=f.get('tags',{});name=tags.get('name');c=f.get('center') or f
        if not name or tags.get('access') in ['no','private'] or tags.get('abandoned')=='yes' or tags.get('disused')=='yes':continue
        point=[c['lon'],c['lat']]
        if coast.nearest(point)>50000:continue
        def known(key):return {'yes':True,'no':False}.get(tags.get(key))
        output.append({'id':f"osm-{f['type']}-{f['id']}",'name':name,'type':{'camp_site':'campground','caravan_site':'caravan-park','chalet':'cabin'}[tags['tourism']],'point':point,'source_url':f"https://www.openstreetmap.org/{f['type']}/{f['id']}",'operator_url':safe_url(tags.get('website') or tags.get('contact:website')),'verified':False,'reviewed_at':datetime.now(timezone.utc).date().isoformat(),'status':'Mapped listing; permission, opening and facilities need operator verification','amenities':{'toilets':known('toilets'),'showers':known('shower'),'drinking_water':known('drinking_water'),'power':known('power_supply')},'vehicle_access':None,'season':None,'attribution':'© OpenStreetMap contributors · ODbL'})
    return output

def surveys(cache):
    caps=fetch(WFS+'?service=WFS&request=GetCapabilities',cache/'ausseabed-capabilities.xml',False)
    root=ET.fromstring(caps);ns={'wfs':'http://www.opengis.net/wfs/2.0','ows':'http://www.opengis.net/ows/1.1'};bounds={}
    for f in root.findall('.//wfs:FeatureType',ns):
        name=f.findtext('wfs:Name',namespaces=ns) or '';box=f.find('ows:WGS84BoundingBox',ns)
        if box is None:continue
        low=list(map(float,box.findtext('ows:LowerCorner',namespaces=ns).split()));high=list(map(float,box.findtext('ows:UpperCorner',namespaces=ns).split()));bbox=low+high
        key=slug(re.sub(r'_L\d+_Coverage$','',name.split(':')[-1]));bounds[key]=bbox
    records=[];seen=set();expected=None
    properties='NAME,NEWGAID,SURVEYID,START_DATE,END_DATE,DATA_URL,META_URL,LEGAL_CONSTRAINTS,USER_CONSTRAINTS,PRODUCT_STATUS,EMBARGO,CUSTODIAN'
    for start in range(0,20000,500):
        params={'service':'WFS','version':'2.0.0','request':'GetFeature','typeNames':'ausseabed:MARINEDATAREGISTER_ACQUISITIONS_INDEX','count':500,'startIndex':start,'outputFormat':'application/json','propertyName':properties,'sortBy':'NAME'}
        j=fetch(WFS+'?'+urllib.parse.urlencode(params),cache/f'surveys-{start}.json')
        matched=j.get('numberMatched',j.get('totalFeatures'))
        if expected is None:expected=int(matched) if str(matched).isdigit() else None
        for f in j['features']:
            if f['id'] in seen:raise ValueError('Survey index paging returned duplicate records')
            seen.add(f['id']);p=f['properties'];name=p['NAME'];bbox=bounds.get(slug(name));data_url=safe_url(p.get('DATA_URL'));meta=safe_url(p.get('META_URL'))
            if bbox and (bbox[2]<90 or bbox[0]>180 or bbox[3]<-50 or bbox[1]>-5):continue
            published=p.get('PRODUCT_STATUS')=='PUBLISHED' and p.get('EMBARGO')=='No'
            records.append({'id':f['id'],'name':name,'bounds':bbox,'metadata_url':meta or 'https://portal.ga.gov.au/persona/marine','download_url':data_url if published else None,'status':'download-available' if published and data_url else 'metadata-only','survey_start':p.get('START_DATE'),'survey_end':p.get('END_DATE'),'licence':p.get('LEGAL_CONSTRAINTS'),'limitations':p.get('USER_CONSTRAINTS'),'custodian':p.get('CUSTODIAN')})
        if len(j['features'])<500 or expected is not None and start+len(j['features'])>=expected:break
    if expected is not None and len(seen)!=expected:raise ValueError('Incomplete national survey index')
    return records

def main(cache):
    cache.mkdir(parents=True,exist_ok=True);snapshot=cache/'snapshot.json';previous=json.loads(snapshot.read_text()) if snapshot.exists() else {};out={**previous,'version':1,'refresh':dict(previous.get('refresh',{}))}
    raw=fetch(COAST,cache/'coastline.geojson');coast=CoastIndex(raw)
    for key,fn in [('beaches',lambda:beaches(cache,coast)),('stays',lambda:stays(cache,coast)),('surveys',lambda:surveys(cache))]:
        try:
            result=fn()
            if not result:raise ValueError('Source returned no records')
            out[key]=result;out['refresh'][key]={'status':'updated','at':datetime.now(timezone.utc).isoformat(),'count':len(result)};print(key,len(result),flush=True)
        except (OSError,ValueError,KeyError,ET.ParseError):
            out['refresh'][key]={'status':'retained' if previous.get(key) else 'unavailable','at':datetime.now(timezone.utc).isoformat(),'count':len(previous.get(key,[]))};print(key,'source unavailable; retained last valid snapshot',flush=True)
    # Spatial queries use source survey footprints, not compilation rectangles.
    try:
        root=Path(__file__).resolve().parents[1]
        config=json.loads((root/'config/areas.json').read_text())
        seed=json.loads((root/'web/beaches.json').read_text())
        areas=directory(seed,out,config,list(REGIONS.values()))['areas']
        coverage={}
        import hashlib
        for area in areas:
            w,s,e,n=area['bbox'];params={'service':'WFS','version':'2.0.0','request':'GetFeature','typeNames':'ausseabed:MARINEDATAREGISTER_ACQUISITIONS_INDEX','count':5000,'outputFormat':'application/json','propertyName':'NEWGAID','cql_filter':f"BBOX(GEOM,{w},{s},{e},{n},'EPSG:4326')"}
            url=WFS+'?'+urllib.parse.urlencode(params);j=fetch(url,cache/('area-surveys-'+hashlib.sha256(url.encode()).hexdigest()[:16]+'.json'))
            expected=j.get('numberMatched',j.get('totalFeatures'))
            if str(expected).isdigit() and int(expected)!=len(j['features']):raise ValueError('Truncated area survey query')
            coverage[area['id']]=[f['id'] for f in j['features']]
        out['coverage_by_area']=coverage
        out['refresh']['area_surveys']={'status':'updated','at':datetime.now(timezone.utc).isoformat(),'count':len(coverage)}
        print('Area survey footprints',len(coverage),flush=True)
    except (OSError,ValueError,KeyError):
        print('Area survey source unavailable; retaining previous links',flush=True)
    out['sources']=[{'id':'ga-gazetteer','publisher':'Geoscience Australia and contributing place-name authorities','url':'https://services.ga.gov.au/gis/rest/services/Composite_Gazetteer_of_Australia/MapServer','licence':'Creative Commons Attribution (service licence: CCBY)','attribution':'Geoscience Australia and contributing state/territory authorities. Place-name reference positions are not entry points.'},{'id':'natural-earth','publisher':'Natural Earth','url':'https://www.naturalearthdata.com/about/terms-of-use/','licence':'Public domain','attribution':'Natural Earth 1:10 million coastline, used only for coarse coastal screening.'},{'id':'ausseabed','publisher':'AusSeabed / Geoscience Australia','url':'https://ausseabed.gov.au/data/bathymetry','attribution':'Survey metadata and extents from the AusSeabed Marine Data Register; source licences retained per survey.'}]
    atomic_json(snapshot,out)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,default=Path('.cache/national'));args=parser.parse_args();main(args.cache)
