"""National directory preparation, independent of published bathymetry packages."""
import json
import math
from collections import defaultdict
from pathlib import Path
from .store import distance

ROOT=Path(__file__).resolve().parents[1]

def safe_url(value):
    from urllib.parse import urlsplit
    if not isinstance(value,str):return None
    try:
        parsed=urlsplit(value)
        return value if parsed.scheme=='https' and parsed.hostname and not parsed.username and not parsed.password else None
    except ValueError:return None

def slug(value):
    import re,unicodedata
    return re.sub('[^a-z0-9]+','-',unicodedata.normalize('NFKD',value).encode('ascii','ignore').decode().lower()).strip('-')

def area_for(point,state_id,areas):
    candidates=[a for a in areas if a['state_id']==state_id and not a.get('fallback')]
    nearest=min(candidates,key=lambda a:distance(point,a['center']),default=None)
    if nearest and distance(point,nearest['center'])<=nearest['max_distance_km']*1000:return nearest['id']
    return state_id.lower()+'-other-coast'

class CoastIndex:
    """Coarse shoreline proximity screening, never used for depth measurements."""
    def __init__(self,collection):
        self.cells=defaultdict(list)
        for feature in collection['features']:
            geom=feature['geometry'];lines=[geom['coordinates']] if geom['type']=='LineString' else geom['coordinates']
            for line in lines:
                for a,b in zip(line,line[1:]):
                    if not (90<=a[0]<=180 and -50<=a[1]<=-5):continue
                    if abs(a[0]-b[0])>5:continue
                    for x in range(math.floor(min(a[0],b[0])),math.floor(max(a[0],b[0]))+1):
                        for y in range(math.floor(min(a[1],b[1])),math.floor(max(a[1],b[1]))+1):self.cells[x,y].append((a,b))
    def nearest(self,point):
        x,y=map(math.floor,point);best=float('inf');scale=math.cos(math.radians(point[1]))
        for dx in [-1,0,1]:
            for dy in [-1,0,1]:
                for a,b in self.cells.get((x+dx,y+dy),[]):
                    ax=(a[0]-point[0])*scale;ay=a[1]-point[1];vx=(b[0]-a[0])*scale;vy=b[1]-a[1];length=vx*vx+vy*vy;t=max(0,min(1,-(ax*vx+ay*vy)/length)) if length else 0
                    candidate=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];best=min(best,distance(point,candidate))
        return best

def package_for(point, packages):
    """Prefer a published local package over a larger overlapping envelope."""
    matches = [r for r in packages if r.get('status') != 'empty' and r['bbox'][0] <= point[0] <= r['bbox'][2] and r['bbox'][1] <= point[1] <= r['bbox'][3]]
    return min(matches, key=lambda r: ((r['bbox'][2]-r['bbox'][0])*(r['bbox'][3]-r['bbox'][1]), r['id']), default=None)


def directory(seed,national,config,packages):
    states={s['id']:s['name'] for s in config['states']};reverse={v:k for k,v in states.items()}
    areas=config['areas'];byid={a['id']:a for a in areas};beaches=[]
    legacy={'port-phillip':'vic-port-phillip','bondi':'nsw-sydney-east','jervis-bay':'nsw-jervis-bay','western-port':'vic-western-port'}
    for original in seed['beaches']:
        b=dict(original);sid=reverse.get(b.get('state'),'EXT')
        if b['id'] in ['murrays-beach','cave-beach']:sid='JBT'
        b.update(state_id=sid,jurisdiction_id=sid,state=states[sid],area_id='jbt-booderee' if sid=='JBT' else legacy.get(b['region']) or area_for(b['point'],sid,areas))
        beaches.append(b)
    for b in national.get('beaches',[]):
        b=dict(b)
        if b.get('state_id') not in states:continue
        normal=slug(b['name']).removesuffix('-beach')
        duplicate=next((existing for existing in beaches if existing['state_id']==b['state_id'] and normal in [slug(value).removesuffix('-beach') for value in [existing['name'],*existing.get('aliases',[])]] and distance(existing['point'],b['point'])<1500),None)
        if duplicate:
            duplicate.setdefault('additional_sources',[]).append({'id':b['id'],'url':b['source_url']});continue
        b.update(area_id=area_for(b['point'],b['state_id'],areas),state=states[b['state_id']],jurisdiction_id=b.get('jurisdiction_id',b['state_id']))
        # Imported locations can reuse an existing survey package if in its area.
        package=package_for(b['point'],packages)
        b['region']=package['id'] if package else b['area_id'];beaches.append(b)
    used={b['area_id'] for b in beaches};outareas=[]
    for area in areas:
        if area['id'] not in used:continue
        a=dict(area);members=[b for b in beaches if b['area_id']==a['id']];xs=[b['point'][0] for b in members];ys=[b['point'][1] for b in members]
        a.update(bbox=[min(xs)-.05,min(ys)-.05,max(xs)+.05,max(ys)+.05],center=[(min(xs)+max(xs))/2,(min(ys)+max(ys))/2],beach_count=len(members),map_region=legacy.get(a['id'],a['id']))
        # An area has its own map when records span different survey packages.
        package_ids={b['region'] for b in members};a['map_region']=next(iter(package_ids)) if len(package_ids)==1 else a['id']
        outareas.append(a)
        for b in members:b['area_name']=a['name'];b['region_name']=a['name'];b['group']=a['name']
    beaches.sort(key=lambda b:(b['state'],b['area_name'],b['name'],b['id']))
    return {'version':2,'location_note':seed['location_note'],'sources':seed['sources']+national.get('sources',[]),'states':[s for s in config['states'] if any(b['state_id']==s['id'] for b in beaches)],'areas':outareas,'beaches':beaches,'refresh':national.get('refresh',{}),'survey_catalogue_url':'https://portal.ga.gov.au/persona/marine'}

def prepare(stage,write,catalog,store=None):
    seed=json.loads((ROOT/'web/beaches.json').read_text());config=json.loads((ROOT/'config/areas.json').read_text());snapshot=ROOT/'.cache/national/snapshot.json'
    national=json.loads(snapshot.read_text()) if snapshot.exists() else {}
    output=directory(seed,national,config,catalog['regions']);known={r['id'] for r in catalog['regions']}
    boundary_archive=ROOT/'.cache/area-boundaries/SAL_2021_AUST_GDA94_SHP.zip'
    if boundary_archive.is_file():
        from .area_boundaries import build_area_regions
        territory_archive=ROOT/'.cache/area-boundaries/STE_2021_AUST_SHP_GDA94.zip'
        regions=build_area_regions(output['areas'],output['beaches'],boundary_archive,territory_archive if territory_archive.is_file() else None)
        output['area_regions_file']='data/area-regions.json'
        write('data/area-regions.json',json.dumps(regions,ensure_ascii=False,separators=(',',':')).encode())
    for a in output['areas']:
        if a['id'] not in known:
            catalog['regions'].append({'id':a['id'],'name':a['name'],'state':next(s['name'] for s in config['states'] if s['id']==a['state_id']),'bbox':a['bbox'],'center':a['center'],'zoom':10,'rasters':[],'tiles':{},'contours':None,'contour_file':None,'status':'empty','notes':'This directory area has no detailed depth package published in the app. Check the survey inventory for available source data.','attribution':'Place-name sources are listed per location.','licence':'See source records','contour_survey':'unavailable'})
            known.add(a['id'])
    stays=json.loads((ROOT/'config/stays.json').read_text()) if (ROOT/'config/stays.json').exists() else {'stays':[]}
    merged={s['id']:s for s in stays['stays']}
    for s in national.get('stays',[]):merged.setdefault(s['id'],s)
    allstays=list(merged.values());details={}
    shoreline=ROOT/'.cache/national/coastline.geojson'
    coast=CoastIndex(json.loads(shoreline.read_text())) if shoreline.exists() else None
    checked=[s for s in allstays if s.get('verified')]
    context_source=(store.load().get('context_contours',{}).get('ausbathy-2024-shallow-5m',{}) if store else {})
    for beach in output['beaches']:
        nearby=[distance(beach['point'],s['point']) for s in checked if distance(beach['point'],s['point'])<=25000]
        beach['nearby_checked_stays']=len(nearby);beach['nearest_checked_stay_km']=round(min(nearby)/1000,1) if nearby else None
    for a in output['areas']:
        members=[b for b in output['beaches'] if b['area_id']==a['id']]
        area_surveys=set(national.get('coverage_by_area',{}).get(a['id'],[]))
        detail={'version':1,'beaches':members,'surveys':[s for s in national.get('surveys',[]) if s['id'] in area_surveys],'stays':[s for s in allstays if any(distance(s['point'],b['point'])<=50000 for b in members)]}
        context_area=context_source.get('areas',{}).get(a['id'])
        if store and context_area and context_area.get('count',0):
            collection=json.loads((store.root/context_area['file']).read_text())
            detail['context_contours']=collection['features']
            detail['context_source']={key:value for key,value in context_source.items() if key!='areas'}
            a['context_count']=context_area['count']
            a['context_source_url']=context_source.get('metadata_url')
        if coast:
            w,s,e,n=a['bbox'];segments=set()
            for x in range(math.floor(w-.3),math.floor(e+.3)+1):
                for y in range(math.floor(s-.3),math.floor(n+.3)+1):
                    for first,last in coast.cells.get((x,y),[]):segments.add((tuple(first[:2]),tuple(last[:2])))
            detail['coastline']=[[[round(v,5) for v in point] for point in line] for line in sorted(segments)]
        path='data/areas/'+a['id']+'.json';write(path,json.dumps(detail,ensure_ascii=False,separators=(',',':')).encode());details[a['id']]=path
        a['detail_file']=path
        a['survey_count']=len(detail['surveys'])
        a['stay_count']=len(detail['stays'])
    write('data/surveys.json',json.dumps({'version':1,'surveys':national.get('surveys',[]),'refresh':national.get('refresh',{})},separators=(',',':')).encode())
    write('beaches.json',json.dumps(output,ensure_ascii=False,separators=(',',':')).encode())
    return output

def intersects(a,b):return a[0]<=b[2] and a[2]>=b[0] and a[1]<=b[3] and a[3]>=b[1]

def finish(output,stage,write):
    summaries=json.loads((stage/'data/beach-summaries.json').read_text());mapped={b['id'] for b in summaries['beaches'] if any(d.get('status')=='available' for d in b['depths'].values())}
    for a in output['areas']:a['depth_count']=sum(b['id'] in mapped for b in output['beaches'] if b['area_id']==a['id'])
    light=[]
    for b in output['beaches']:
        keep={k:b[k] for k in ['id','name','aliases','state','state_id','jurisdiction_id','area_id','area_name','region','region_name','point','source_id','source_url','reference_label','nearby_checked_stays','nearest_checked_stay_km'] if k in b}
        keep.update(detail_file=next(a['detail_file'] for a in output['areas'] if a['id']==b['area_id']),entry_documented=bool(b.get('entry',{}).get('verified')),fact_count=len(b.get('facts',[])),has_access_facts=any(f['label'] in ['Access','Entry'] for f in b.get('facts',[])),fact_categories=[f['category'] for f in b.get('facts',[]) if f.get('category')],restricted_activities=[r['activity'] for r in b.get('restrictions',[]) if r.get('status') in ['restricted','closed']])
        light.append(keep)
    write('beaches.json',json.dumps({**output,'beaches':light},ensure_ascii=False,separators=(',',':')).encode())
