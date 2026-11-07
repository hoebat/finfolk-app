const cache=new Map(),TTL=15*60*1000;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const validPoint=point=>Array.isArray(point)&&point.length===2&&point.every(finite)&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90;
export function conditionsURLs(point){
 if(!validPoint(point))throw Error('A location is needed to load the forecast.');
 const common={latitude:point[1],longitude:point[0],timezone:'auto',timeformat:'unixtime',forecast_days:3};
 const weather=new URL('https://api.open-meteo.com/v1/forecast');weather.search=new URLSearchParams({...common,current:'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m',wind_speed_unit:'kmh'});
 const marine=new URL('https://marine-api.open-meteo.com/v1/marine');marine.search=new URLSearchParams({...common,hourly:'wave_height,sea_level_height_msl',cell_selection:'sea'});
 return {weather:weather.href,marine:marine.href};
}
export function weatherLabel(code){
 if(!finite(code))return 'Weather unavailable';
 if(code===0)return 'Clear sky';if(code===1)return 'Mainly clear';if(code===2)return 'Partly cloudy';if(code===3)return 'Overcast';
 if([45,48].includes(code))return 'Fog';if([51,53,55,56,57].includes(code))return 'Drizzle';if([61,63,65,66,67].includes(code))return 'Rain';
 if([71,73,75,77,85,86].includes(code))return 'Snow';if([80,81,82].includes(code))return 'Rain showers';if([95,96,99].includes(code))return 'Thunderstorms';return 'Weather forecast';
}
export function compass(degrees){return finite(degrees)?['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((degrees%360+360)%360)/22.5)%16]:'';}
export function normaliseConditions(weather,marine,now=Date.now()){
 const seconds=now/1000,c=weather?.current,units=weather?.current_units;
 const fresh=c&&finite(c.time)&&c.time>=seconds-5400&&c.time<=seconds+1800;
 const current=fresh?{time:c.time,temperature:units?.temperature_2m==='°C'&&finite(c.temperature_2m)?c.temperature_2m:null,wind:units?.wind_speed_10m==='km/h'&&finite(c.wind_speed_10m)?c.wind_speed_10m:null,direction:finite(c.wind_direction_10m)?compass(c.wind_direction_10m):'',description:weatherLabel(c.weather_code)}:null;
 const hourly=marine?.hourly,times=Array.isArray(hourly?.time)?hourly.time:[],marineUnits=marine?.hourly_units;
 const samples=times.map((time,i)=>({time,level:marineUnits?.sea_level_height_msl==='m'&&finite(hourly.sea_level_height_msl?.[i])?hourly.sea_level_height_msl[i]:null,wave:marineUnits?.wave_height==='m'&&finite(hourly.wave_height?.[i])?hourly.wave_height[i]:null})).filter(p=>finite(p.time)&&p.time>=seconds-3600&&p.time<=seconds+86400).sort((a,b)=>a.time-b.time);
 const near=samples.findLast(p=>p.time<=seconds)||null;
 const available=!!(current&&(current.temperature!==null||current.wind!==null))||samples.some(p=>p.level!==null||p.wave!==null);
 let timezone=weather?.timezone||marine?.timezone||'UTC';try{new Intl.DateTimeFormat('en-AU',{timeZone:timezone});}catch{timezone='UTC';}
 return {current,samples,near,timezone,fetchedAt:now,available,partial:!current||!samples.some(p=>p.level!==null||p.wave!==null)};
}
export async function fetchConditions(point,{fetcher=(...args)=>globalThis.fetch(...args),now=Date.now(),refresh=false}={}){
 const urls=conditionsURLs(point),key=point.join(',');const prior=cache.get(key);
 if(!refresh&&prior&&now-prior.created<TTL)return prior.promise;
 const promise=(async()=>{
  async function request(url){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);try{const r=await fetcher(url,{signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw Error('Forecast unavailable');const data=await r.json();if(data?.error)throw Error('Forecast unavailable');return data;}finally{clearTimeout(timeout);}}
  const results=await Promise.allSettled([request(urls.weather),request(urls.marine)]);
  const data=normaliseConditions(results[0].status==='fulfilled'?results[0].value:null,results[1].status==='fulfilled'?results[1].value:null,now);
  if(!data.available)throw Error('Forecast unavailable. Try again or check the BOM links below.');
  if(data.partial)cache.delete(key);return data;
 })();cache.set(key,{created:now,promise});try{return await promise;}catch(error){cache.delete(key);throw error;}
}
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const link=(text,href)=>{const a=el('a',text);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;};
const value=(number,digits=0)=>finite(number)?number.toFixed(digits):'—';
export function conditionsTime(time,timezone){return new Intl.DateTimeFormat('en-AU',{timeZone:timezone,hour:'numeric',minute:'2-digit',day:'numeric',month:'short'}).format(new Date(time*1000));}
function seaLevelChart(data){
 const values=data.samples.filter(p=>p.level!==null);if(values.length<3)return null;
 const figure=el('figure',undefined,'conditions-tide-chart'),caption=el('figcaption','Next 24 hours · modelled sea level, including tides');figure.append(caption);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 600 120');svg.setAttribute('role','img');svg.setAttribute('aria-label','Modelled sea level from '+conditionsTime(values[0].time,data.timezone)+' to '+conditionsTime(values.at(-1).time,data.timezone)+', ranging from '+Math.min(...values.map(p=>p.level)).toFixed(2)+' to '+Math.max(...values.map(p=>p.level)).toFixed(2)+' metres above mean sea level.');
 const min=Math.min(...values.map(p=>p.level)),max=Math.max(...values.map(p=>p.level)),start=data.samples[0].time,end=data.samples.at(-1).time;
 let d='',previous;for(const p of data.samples){if(p.level===null){previous=null;continue;}const x=10+(p.time-start)/(end-start||1)*580,y=100-(p.level-min)/(max-min||1)*80;d+=(previous&&p.time-previous.time<=5400?'L':'M')+x.toFixed(1)+' '+y.toFixed(1);previous=p;}
 const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','3');path.setAttribute('stroke-linecap','round');svg.append(path);figure.append(svg);
 const times=el('div',undefined,'conditions-chart-times');times.append(el('span',conditionsTime(values[0].time,data.timezone)),el('span',conditionsTime(values.at(-1).time,data.timezone)));figure.append(times);return figure;
}
let sequence=0;
export function createConditionsPanel(beach,{load=fetchConditions}={}){
 const panel=el('section',undefined,'coastal-conditions'),heading=el('h3','Weather & tides'),id='coastal-conditions-'+(++sequence);heading.id=id;panel.setAttribute('aria-labelledby',id);
 const top=el('div',undefined,'conditions-heading'),button=el('button','Load forecast','secondary');button.type='button';top.append(heading,button);
 const status=el('p','Check the forecast for '+beach.name+'.','conditions-status');status.setAttribute('role','status');
 const body=el('div',undefined,'conditions-body'),sources=el('div',undefined,'conditions-links');sources.append(link('BOM tide predictions ↗','https://www.bom.gov.au/australia/tides/'),link('BOM marine forecasts & warnings ↗','https://www.bom.gov.au/coastal-location/australia'));
 panel.append(top,status,body,sources);
 if(!validPoint(beach.point)){button.disabled=true;status.textContent='Forecast unavailable: this place has no verified coordinates.';return panel;}
 button.onclick=async()=>{
  button.disabled=true;panel.setAttribute('aria-busy','true');status.textContent='Loading weather and sea-level forecast…';body.replaceChildren();
  try{const data=await load(beach.point,{refresh:button.dataset.loaded==='true'});button.dataset.loaded='true';
   status.textContent=(data.partial?'Some forecast data is unavailable. ':'')+'Retrieved '+conditionsTime(data.fetchedAt/1000,data.timezone)+' · '+data.timezone.replaceAll('_',' ');
   const grid=el('dl',undefined,'conditions-metrics');
   const metrics=[['Air',data.current?.temperature===null||!data.current?'—':value(data.current.temperature)+'°C',data.current?.description||'Weather unavailable'],['Wind',data.current?.wind===null||!data.current?'—':value(data.current.wind)+' km/h',data.current?.direction?data.current.direction+' · from this direction':'Unavailable'],['Waves',data.near?.wave===null||!data.near?'—':value(data.near.wave,1)+' m','Significant wave height'],['Sea level',data.near?.level===null||!data.near?'—':value(data.near.level,2)+' m','Above mean sea level']];
   for(const [name,amount,note]of metrics){const metric=el('div');metric.append(el('dt',name),el('dd',amount),el('small',note));grid.append(metric);}body.append(grid);
   if(data.current)body.append(el('p','Weather valid '+conditionsTime(data.current.time,data.timezone),'conditions-valid-time'));
   const chart=seaLevelChart(data);if(chart)body.append(chart);
   body.append(el('p','Regional forecasts, not beach observations. Sea level includes tides and weather effects; heights use mean sea level, not chart datum. Coastal accuracy varies. Check official tide predictions and warnings.','conditions-note'));
   const credit=el('p',undefined,'conditions-credit');credit.append(link('Open-Meteo & weather data providers','https://open-meteo.com/en/licence'),document.createTextNode(' · Marine: ECMWF, Météo-France & Copernicus Marine.'));body.append(credit);
  }catch(error){status.textContent='Forecast unavailable. Try again or check the BOM links below.';}finally{button.disabled=false;button.textContent='Refresh forecast';panel.removeAttribute('aria-busy');}
 };
 return panel;
}
