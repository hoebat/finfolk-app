"""Static GTFS journey comparisons. No live routing and no timetable guesses."""
import csv
import heapq
import io
import itertools
import math
import re
import zipfile
from bisect import bisect_left
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']

def seconds(value):
    h,m,s=map(int,value.split(':'))
    if h < 0 or not 0 <= m < 60 or not 0 <= s < 60: raise ValueError('Invalid GTFS time')
    return h*3600+m*60+s

def weekends(today, count=4):
    first=today+timedelta(days=(5-today.weekday())%7)
    return [first+timedelta(days=7*i) for i in range(count)]

def active_services(calendars, exceptions, day):
    key=day.strftime('%Y%m%d')
    active={r['service_id'] for r in calendars if r['start_date']<=key<=r['end_date'] and r[DAYS[day.weekday()]]=='1'}
    for row in exceptions:
        if row['date']==key:
            if row['exception_type']=='1': active.add(row['service_id'])
            elif row['exception_type']=='2': active.discard(row['service_id'])
    return active

def archives(path):
    """VIC uses nested mode archives; NSW can use a single complete archive."""
    with zipfile.ZipFile(path) as root:
        if 'stops.txt' in root.namelist(): yield 'main',root
        else:
            for name in sorted(root.namelist()):
                if name.endswith('.zip'):
                    with zipfile.ZipFile(io.BytesIO(root.read(name))) as child:
                        if 'stops.txt' in child.namelist(): yield name,child

def rows(archive, name):
    if name not in archive.namelist(): return iter(())
    return csv.DictReader(io.TextIOWrapper(archive.open(name),encoding='utf-8-sig'))

class Timetable:
    def __init__(self):
        self.stops={};self.edges=defaultdict(dict);self.trips={};self.connections=[];self.services={};self.valid_dates=set()

    def read(self,path,days,bbox=None):
        # Include previous-day services whose GTFS times run beyond 24:00.
        needed=set(days)|{d-timedelta(days=1) for d in days}
        for prefix,archive in archives(path):
            print('Reading GTFS',prefix,flush=True)
            calendars=list(rows(archive,'calendar.txt'));exceptions=list(rows(archive,'calendar_dates.txt'))
            active={d:active_services(calendars,exceptions,d) for d in needed}
            self.valid_dates.update(d for d in days if active[d])
            routes={r['route_id']:r for r in rows(archive,'routes.txt')}
            trips={}
            for row in rows(archive,'trips.txt'):
                route=routes.get(row['route_id'],{});label=' '.join([route.get('route_short_name',''),route.get('route_long_name',''),row.get('trip_headsign','')])
                if re.search(r'\bschool\b|\bstudent\b',label,re.I): continue
                dates={d for d in needed if row['service_id'] in active[d]}
                if not dates: continue
                trip=prefix+':'+row['trip_id'];trips[row['trip_id']]=trip;self.trips[trip]={'label':label.strip(),'dates':dates,'route_type':route.get('route_type',''),'booking_note':'Check reservation requirements with the operator' if route.get('route_type') in ('2','102','200','204') else None}
            parents=defaultdict(list)
            for row in rows(archive,'stops.txt'):
                sid=row['stop_id'];point=[float(row['stop_lon']),float(row['stop_lat'])]
                if bbox and not (bbox[0]<=point[0]<=bbox[2] and bbox[1]<=point[1]<=bbox[3]):continue
                self.stops[sid]={'id':sid,'name':row['stop_name'],'point':point}
                if row.get('parent_station'):parents[row['parent_station']].append(sid)
            for parent,children in parents.items():
                # Published station membership is not a street crossing shortcut.
                for a in children:
                    for b in children:
                        if a!=b:self.edges[a][b]=max(self.edges[a].get(b,0),300)
                    if parent in self.stops:self.edges[a][parent]=300;self.edges[parent][a]=300
            for row in rows(archive,'transfers.txt'):
                a,b=row['from_stop_id'],row['to_stop_id']
                if row.get('transfer_type')=='3': self.edges[a].pop(b,None);continue
                self.edges[a][b]=max(60,int(row.get('min_transfer_time') or 300))
            previous={}
            for row in rows(archive,'stop_times.txt'):
                trip=trips.get(row['trip_id'])
                if not trip: continue
                arrival=row.get('arrival_time');departure=row.get('departure_time')
                # Untimed intermediate stops are not silently interpolated.
                if not arrival or not departure:previous.pop(trip,None);continue
                try:arr,dep=seconds(arrival),seconds(departure)
                except ValueError:continue
                seq=int(row['stop_sequence']);sid=row['stop_id']
                if sid not in self.stops:previous.pop(trip,None);continue
                prior=previous.get(trip)
                if prior:
                    if seq<=prior[0]:raise ValueError('GTFS stop sequence must increase within a trip')
                    if arr<prior[2]:raise ValueError('GTFS times run backwards')
                    self.connections.append((prior[2],arr,prior[1],sid,trip,prior[3],row.get('drop_off_type','0')))
                previous[trip]=(seq,sid,dep,row.get('pickup_type','0'))
        self.connections.sort(key=lambda c:c[0]);return self

    def for_day(self,day):
        previous=day-timedelta(days=1);out=[]
        for c in self.connections:
            dates=self.trips[c[4]]['dates']
            if day in dates and c[0]<86400:out.append(c)
            if previous in dates and c[0]>=86400:out.append((c[0]-86400,c[1]-86400,*c[2:]))
        return sorted(out,key=lambda c:c[0])

    def origin_stops(self,origin):
        regex=re.compile(origin['stop_pattern'],re.I)
        return [sid for sid,s in self.stops.items() if regex.search(s['name'])]

    def scan(self,connections,starts,start_time,reverse=False):
        """Connection scan, retaining trip continuity and transfer restrictions."""
        labels={sid:(start_time,None) for sid in starts};on_trip={}
        edges=self.edges
        if reverse:
            edges=defaultdict(dict)
            for a,links in self.edges.items():
                for b,t in links.items():edges[b][a]=t
        def improve(sid,time,trace):
            serial=itertools.count();queue=[(time if not reverse else -time,next(serial),sid,time,trace)]
            while queue:
                _,_,stop,t,node=heapq.heappop(queue)
                old=labels.get(stop)
                if old and (old[0]>=t if reverse else old[0]<=t):continue
                labels[stop]=(t,node)
                for dest,duration in edges.get(stop,{}).items():
                    nt=t-duration if reverse else t+duration
                    previous=labels.get(dest)
                    if previous and (previous[0]>=nt if reverse else previous[0]<=nt):continue
                    heapq.heappush(queue,(nt if not reverse else -nt,next(serial),dest,nt,('walk',nt,stop,dest,duration,node)))
        # Relax station/interchange transfers from the initial station.
        for sid in starts:
            for dest,duration in edges.get(sid,{}).items():improve(dest,start_time-duration if reverse else start_time+duration,('walk',start_time-duration if reverse else start_time+duration,sid,dest,duration,None))
        iterable=sorted(connections,key=lambda c:c[1],reverse=True) if reverse else connections
        for dep,arr,a,b,trip,pickup,dropoff in iterable:
            if dep<0 or arr>86400:continue
            source,target=(b,a) if reverse else (a,b);time=arr if reverse else dep
            current=labels.get(source);same=on_trip.get(trip)
            allowed=(dropoff if reverse else pickup) in ('','0')
            # Reserve five minutes between vehicles; boarding the first one has no penalty.
            reachable=current and (current[0]- (300 if current[1] else 0)>=time if reverse else current[0]+(300 if current[1] else 0)<=time)
            if not same and not (allowed and reachable):continue
            prior=same if same else current[1]
            trace=('ride',dep,arr,a,b,trip,prior)
            on_trip[trip]=trace
            if (pickup if reverse else dropoff) in ('','0'):improve(target,dep if reverse else arr,trace)
        return labels

    def itinerary(self,trace,reverse=False):
        steps=[]
        while trace:
            if trace[0]=='ride':
                _,dep,arr,a,b,trip,trace=trace;steps.append({'kind':'ride','departure_s':dep,'arrival_s':arr,'from':a,'to':b,'trip':trip})
            else:
                _,t,a,b,duration,trace=trace
                if reverse:a,b=b,a;dep,arr=t,t+duration
                else:dep,arr=t-duration,t
                steps.append({'kind':'walk','departure_s':dep,'arrival_s':arr,'from':a,'to':b})
        if not reverse:steps.reverse()
        merged=[]
        for step in steps:
            if merged and step['kind']=='ride' and merged[-1].get('trip')==step.get('trip'):
                merged[-1]['to']=step['to'];merged[-1]['arrival_s']=step['arrival_s']
            else:merged.append(step)
        def clock(t):return f'{t//3600:02}:{t%3600//60:02}'
        for step in merged:
            a=self.stops.get(step['from'],{}).get('name',step['from']);b=self.stops.get(step['to'],{}).get('name',step['to'])
            if step['kind']=='ride':
                info=self.trips[step['trip']];step['label']=f"{clock(step['departure_s'])}–{clock(step['arrival_s'])} {info['label']}: {a} → {b}";step['booking_note']=info['booking_note']
            else:step['label']=f"Walk between {a} and {b} ({math.ceil((step['arrival_s']-step['departure_s'])/60)} min)"
        return merged
