import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {conditionsURLs,normaliseConditions,fetchConditions,createConditionsPanel,conditionsTime,compass} from '../web/coastal-conditions.js';
const now=Date.UTC(2026,10,2,0),seconds=now/1000;
const weather={timezone:'Australia/Sydney',current:{time:seconds,temperature_2m:20,weather_code:2,wind_speed_10m:12,wind_direction_10m:90},current_units:{temperature_2m:'°C',wind_speed_10m:'km/h'}};
const marine={timezone:'Australia/Sydney',hourly:{time:Array.from({length:28},(_,i)=>seconds+(i-1)*3600),wave_height:Array(28).fill(.8),sea_level_height_msl:Array.from({length:28},(_,i)=>Math.sin(i/2)*.6)},hourly_units:{wave_height:'m',sea_level_height_msl:'m'}};
const point=[151.278267,-33.891157],urls=conditionsURLs(point);
assert.equal(new URL(urls.weather).searchParams.get('latitude'),'-33.891157');assert.equal(new URL(urls.marine).searchParams.get('longitude'),'151.278267');
assert.equal(new URL(urls.marine).searchParams.get('cell_selection'),'sea');
for(const point of [null,[],[1,'2'],[181,0],[0,91],[NaN,0]])assert.throws(()=>conditionsURLs(point));
let data=normaliseConditions(weather,marine,now);assert.equal(data.current.temperature,20);assert.equal(data.current.direction,'E');assert.equal(data.near.wave,.8);assert.equal(data.samples.length,26);assert.equal(data.partial,false);assert.match(conditionsTime(seconds,data.timezone),/11:00/);assert.equal(compass(360),'N');
const missing=structuredClone(marine);missing.hourly.sea_level_height_msl=Array(28).fill(null);missing.hourly.wave_height=Array(28).fill(null);data=normaliseConditions(null,missing,now);assert.equal(data.available,false);assert.equal(data.near.level,null,'Missing sea levels never become zero');
const stale=structuredClone(weather);stale.current.time-=7200;assert.equal(normaliseConditions(stale,null,now).available,false);assert.equal(normaliseConditions(weather,marine,now+4*86400_000).available,false,'An old response cannot be displayed as current');
const units=structuredClone(weather);units.current_units.wind_speed_10m='mph';assert.equal(normaliseConditions(units,null,now).current.wind,null,'Unexpected units are not mislabelled');
let requests=0;const fetcher=async(url,options)=>{requests++;assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');return Response.json(url.includes('marine-api')?marine:weather);};
const first=await fetchConditions(point,{fetcher,now});assert.equal(first.available,true);await fetchConditions(point,{fetcher,now:now+1000});assert.equal(requests,2,'Both feeds are reused during the freshness window');await fetchConditions(point,{fetcher,now:now+1000,refresh:true});assert.equal(requests,4);await fetchConditions(point,{fetcher,now:now+16*60_000});assert.equal(requests,6,'Expired cache requests fresh forecasts');
const partial=await fetchConditions([144,-38],{now,fetcher:async url=>{if(url.includes('marine-api'))throw Error('Offline');return Response.json(weather);}});assert.equal(partial.partial,true);assert.equal(partial.current.temperature,20);
await assert.rejects(fetchConditions([145,-39],{now,fetcher:async()=>{throw Error('Offline');}}),/Forecast unavailable/);
const window=new Window({url:'https://finfolk.test/'});globalThis.document=window.document;
try{
 let loads=0;const panel=createConditionsPanel({name:'Bondi Beach',point},{load:async(p,options)=>{loads++;assert.deepEqual(p,point);assert.equal(options.refresh,loads>1);return normaliseConditions(weather,marine,now);}});document.body.append(panel);
 assert.equal(loads,0,'Opening a place does not send a background forecast request');await panel.querySelector('button').onclick();assert.equal(loads,1);assert.equal(panel.querySelectorAll('dd').length,4);assert.equal(panel.querySelector('dd').textContent,'20°C');assert.ok(panel.querySelector('svg'));assert.match(panel.querySelector('.conditions-note').textContent,/mean sea level, not chart datum/);assert.match(panel.textContent,/BOM tide predictions/);assert.equal(panel.getAttribute('aria-busy'),null);await panel.querySelector('button').onclick();assert.equal(loads,2);
 const failure=createConditionsPanel({name:'Bondi',point},{load:async()=>{throw Error('Offline');}});await failure.querySelector('button').onclick();assert.match(failure.querySelector('[role=status]').textContent,/unavailable/);assert.equal(failure.querySelector('dd'),null);assert.equal(failure.querySelector('button').disabled,false);assert.equal(failure.querySelectorAll('.conditions-links a').length,2);
 const noCoordinates=createConditionsPanel({name:'Unknown',point:null});assert.equal(noCoordinates.querySelector('button').disabled,true);
}finally{await window.happyDOM.close();delete globalThis.document;}
console.log('Coastal conditions passed: coordinates, local time, missing/stale data, units, partial failures, fresh caching, refresh, chart and accessible error states.');
