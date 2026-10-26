import {DepthMap} from './map.js';
import {StaticData,profileCSV} from './data-client.js';
import {dataLocations} from './data-pins.js';
import {nearestContour,edithvaleMeasurement} from './measure.js';
const $=id=>document.getElementById(id), map=new DepthMap($('map'));
const data=new StaticData();map.dataBase=data.base;
let catalog,region,profile=null,drawing=false,measuring=false,vertices=[],viewTimer,inspectionRequest=0,profileRequest=0,viewRequest=0,loadRequest=0;
const number=(value,places=1)=>Number(value).toLocaleString('en-AU',{maximumFractionDigits:places});
function notice(message){$('notice').textContent=message;$('notice').hidden=!message;}
function elem(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function link(text,url){const a=elem('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function download(blob,name){const url=URL.createObjectURL(blob),a=elem('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function resetProfile(){profileRequest++;profile=null;vertices=[];drawing=false;map.pointPicking=measuring;map.line=[];$('profile-tool').classList.remove('active');$('profile-tool').textContent='⌁ Draw depth profile';$('drawing-help').hidden=true;$('export-csv').disabled=true;$('profile-stats').textContent='Draw a line to explore the change in depth';drawProfile();}
function stopMeasuring(){if(measuring)notice('');measuring=false;map.pointPicking=drawing;$('measure-start').classList.remove('active');$('measure-start').textContent='Pick a beach start point';}
function clearMeasurement(){stopMeasuring();map.measurement=null;$('measure-result').textContent='Choose a start point to measure the straight-line distance to a published contour.';$('measure-reference').textContent='Contour reference depth only. The straight line does not assess an open-water route, tides or current conditions.';$('measure-clear').hidden=true;}
function showMeasurement(result,label='Selected start point'){
  stopMeasuring();map.measurement={...result,start_label:label};map.marker=null;$('inspection').hidden=true;inspectionRequest++;
  $('measure-result').textContent=`About ${number(result.distance_m/1000,2)} km one way · ${number(result.return_distance_m/1000,2)} km return · nearest published ${result.depth_m} m contour`;
  $('measure-reference').textContent=`${label}. ${result.feature.properties.datum_label}; survey ${result.feature.properties.survey_date||region.contour_survey}. Straight-line estimate with no tide adjustment; actual water depth and route conditions are not established.`;
  $('measure-clear').hidden=false;map.fitPoints([result.start,result.target],90);notice('');
}
function measureFrom(point,label){try{showMeasurement(nearestContour(point,map.contours,Number($('measure-depth').value)),label);}catch(e){stopMeasuring();notice(e.message);}}
function measureEdithvale(){resetProfile();try{const result=edithvaleMeasurement(map.contours,Number($('measure-depth').value));showMeasurement(result,result.start_label);}catch(e){notice(e.message);}}
async function load(selected,retainView=false){
  const generation=++loadRequest;viewRequest++;const previous=region?.id,nextCatalog=await data.catalog();if(generation!==loadRequest)return;catalog=nextCatalog;region=catalog.regions.find(r=>r.id===(selected||previous))||catalog.regions[0];
  if(!retainView||previous!==region.id){map.setRegion(region);resetProfile();clearMeasurement();$('inspection').hidden=true;inspectionRequest++;}else{map.rasters=region.rasters;map.tileFiles=region.tiles;map.tileMaxZoom=region.tile_max_zoom||map.zoom;map.images.clear();}
  map.version=catalog.updated_at||0;$('place-title').textContent=region.name;document.title=`${region.name} · Depth Atlas`;
  document.querySelectorAll('[data-region]').forEach(b=>b.classList.toggle('active',b.dataset.region===region.id));
  $('data-status').textContent=region.status==='raster'?`${region.rasters.length} raster source${region.rasters.length===1?'':'s'} available`:region.status==='contours'?`${region.contours.count} published contours`:'No depth data published yet';
  $('data-status').classList.toggle('ready',region.status!=='empty');
  $('source-summary').textContent=region.status==='raster'?region.rasters.map(r=>`${r.resolution_m} m source spacing · ${r.datum} · ${r.quality} coverage`).join('; '):region.status==='contours'?'Contour values are available. Numeric rasters have not been published for point depths or profiles.':'Government sources are configured. Survey data will appear after it is acquired and included in a site build.';
  $('fetch').disabled=!region.contours;
  $('empty-state').hidden=region.status!=='empty';$('profile-tool').disabled=region.status!=='raster';
  $('datum-tag').textContent=region.rasters.length?`Depth below ${region.rasters[0].datum}`:region.contours?`Contours · ${region.contours.datum}`:'Reference datum shown per source';
  $('map-attribution').textContent=`${region.state} government data${map.layers.basemap?' · © OpenStreetMap contributors':''}`;
  const canFine=region.rasters.length&&region.rasters.every(r=>r.resolution_m<=5&&r.quality==='measured');$('interval').options[1].disabled=!canFine;if(!canFine)$('interval').value='5';
  $('measure-start').disabled=true;$('edithvale').disabled=true;$('edithvale').hidden=region.id!=='port-phillip';
  const requestedRegion=region.id;const collection=await data.contours(requestedRegion);if(region.id!==requestedRegion)return;map.contours=collection.features;map.setDataPins(dataLocations(region,collection.features));map.derived=[];
  const depths=[...new Set(collection.features.map(f=>f.properties.depth_m).filter(d=>Number.isFinite(d)&&d>0&&d<=200))].sort((a,b)=>a-b),selectedDepth=Number($('measure-depth').value);$('measure-depth').replaceChildren(...depths.map(depth=>{const option=elem('option',`${number(depth)} m`);option.value=depth;return option;}));if(depths.includes(selectedDepth))$('measure-depth').value=selectedDepth;else if(depths.includes(10))$('measure-depth').value='10';
  $('measure-start').disabled=!depths.length;$('measure-depth').disabled=!depths.length;$('edithvale').disabled=!depths.length;map.draw();updateDerived();
}
document.querySelectorAll('[data-region]').forEach(button=>button.onclick=()=>{notice('');load(button.dataset.region).catch(e=>notice(e.message));});
for(const [id,key] of [['depth-layer','depth'],['contour-layer','contours'],['pin-layer','pins'],['coverage-layer','coverage'],['basemap-layer','basemap']])$(id).onchange=()=>{map.layers[key]=$(id).checked;map.draw();$('map-attribution').textContent=`${region.state} government data${map.layers.basemap?' · © OpenStreetMap contributors':''}`;if(key==='contours')updateDerived();};
$('zoom-in').onclick=()=>map.zoomBy(1);$('zoom-out').onclick=()=>map.zoomBy(-1);$('home').onclick=()=>{map.center=region.center;map.zoom=region.zoom;map.draw();updateDerived();};
$('refresh').onclick=()=>load(region.id,true).catch(e=>notice(e.message));
map.onmove=([lon,lat])=>{$('coordinates').textContent=`${Math.abs(lat).toFixed(5)}°${lat<0?'S':'N'}   ${Math.abs(lon).toFixed(5)}°${lon<0?'W':'E'}`;};
map.onerror=message=>notice(message);
map.onview=()=>{clearTimeout(viewTimer);viewTimer=setTimeout(updateDerived,350);};
async function updateDerived(){
  const request=++viewRequest;if(!region?.rasters.length||!map.layers.contours){map.derived=[];return;}
  // Whole-bay source contours are efficient at overview scale. Derived lines are for site-scale inspection.
  if(map.zoom<12&&map.contours.length){map.derived=[];map.draw();return;}
  try{const collection=await data.derivedContours(region.id,map.bounds(),Number($('interval').value));if(request!==viewRequest)return;map.derived=collection.features;map.draw();}
  catch(e){if(request===viewRequest)notice(e.message);}
}
$('interval').onchange=updateDerived;
map.onclick=async(point,contour,pin)=>{
  if(measuring){measureFrom(point);return;}
  if(drawing){vertices.push(point);map.line=vertices;map.draw();$('finish-profile').disabled=vertices.length<2;return;}
  map.marker=point;map.draw();$('inspection').hidden=false;const request=++inspectionRequest,selectedRegion=region.id;
  $('inspection-kind').textContent='REFERENCE DEPTH';$('inspection-value').textContent='Inspecting…';$('inspection-details').replaceChildren();
  if(pin?.members.length>1){
    $('inspection-kind').textContent='GROUPED DATA RECORDS';$('inspection-value').textContent=`${pin.members.length} records`;
    const details=$('inspection-details'),pageSize=8;
    function renderPage(page){details.replaceChildren(elem('p','The number counts published data records, not metres of depth. Choose a record to see its source.'));const items=elem('div',undefined,'pin-records');for(const member of pin.members.slice(page*pageSize,(page+1)*pageSize)){const label=member.kind==='contour'?`${number(member.feature.properties.depth_m)} m contour`:member.kind==='footprint'?'Raster footprint':'Raster cell',button=elem('button',label,'pin-record');button.onclick=()=>map.onclick(member.point,member.feature,{...member,members:[member]});items.append(button);}details.append(items);const controls=elem('div',undefined,'pin-pages'),prev=elem('button','Previous'),next=elem('button','Next');prev.disabled=page===0;next.disabled=(page+1)*pageSize>=pin.members.length;prev.onclick=()=>renderPage(page-1);next.onclick=()=>renderPage(page+1);controls.append(prev,elem('span',`${page+1} / ${Math.ceil(pin.members.length/pageSize)}`),next);details.append(controls);}
    renderPage(0);const screen=map.toScreen(point),spread=Math.max(...pin.members.map(p=>{const q=map.toScreen(p.point);return Math.hypot(q[0]-screen[0],q[1]-screen[1]);}));if(spread>4&&map.zoom<20)map.fitPoints(pin.members.map(p=>p.point),90);return;
  }
  if(pin?.kind==='footprint'){$('inspection-kind').textContent='RASTER FILE FOOTPRINT';$('inspection-value').textContent=pin.source.title;$('inspection-details').append(elem('p','This pin marks the file extent. Its centre may contain a data gap; click the raster to inspect an actual cell.'),link('Source dataset ↗',pin.source.source_url));return;}
  try{const result=await data.sample(selectedRegion,point);if(request!==inspectionRequest||region.id!==selectedRegion)return;
    const details=$('inspection-details');details.replaceChildren();
    if(result.status==='no-data'){
      $('inspection-kind').textContent=contour?(pin?'PUBLISHED CONTOUR':'CONTOUR LABEL · NEAR CLICK'):'NO RASTER COVERAGE';
      $('inspection-value').textContent=contour?`${number(contour.properties.depth_m)} m`:'No depth data';
      details.append(elem('p',contour?`Published/derived contour relative to ${contour.properties.datum_label}. This is a line label; point depth is unavailable.`:'There is no numeric raster cell here. This may be outside a survey or inside a data gap.'));
      if(contour&&pin)details.append(elem('p',region.contour_survey),link('Government contour dataset ↗',region.contour_catalog));
    }else{
      const source=result.source;$('inspection-kind').textContent=result.status==='above-datum'?'ELEVATION ABOVE DATUM':'SURVEYED REFERENCE DEPTH';$('inspection-value').textContent=`${number(Math.abs(result.depth_m))} m`;
      const dl=elem('dl');for(const [label,value] of [['Datum',source.datum],['Grid',`${source.resolution_m} m source spacing`],['Survey',source.survey_date],['Coverage',source.quality],['Source',source.title]]){dl.append(elem('dt',label),elem('dd',value));}details.append(dl,link('Source dataset ↗',source.source_url));
    }
    details.append(elem('p',`${point[1].toFixed(5)}, ${point[0].toFixed(5)}`));
  }catch(e){if(request===inspectionRequest){$('inspection-value').textContent='Unavailable';$('inspection-details').textContent=e.message;}}
};
$('close-inspection').onclick=()=>{inspectionRequest++;$('inspection').hidden=true;map.marker=null;map.draw();};
$('profile-tool').onclick=()=>{stopMeasuring();if(drawing){resetProfile();map.draw();return;}resetProfile();drawing=true;map.pointPicking=true;$('inspection').hidden=true;$('drawing-help').hidden=false;$('finish-profile').disabled=true;$('profile-tool').classList.add('active');$('profile-tool').textContent='⌁ Drawing profile…';notice('');};
$('cancel-profile').onclick=()=>{resetProfile();map.draw();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(measuring)stopMeasuring();if(drawing){resetProfile();map.draw();}}});
$('measure-start').onclick=()=>{if(measuring){stopMeasuring();return;}resetProfile();measuring=true;map.pointPicking=true;$('measure-start').classList.add('active');$('measure-start').textContent='Click your start point · Esc to cancel';notice('Click the beach entry point on the map. The measurement goes to the closest matching published contour.');};
$('measure-depth').onchange=()=>{if(map.measurement)measureFrom(map.measurement.start,map.measurement.start_label);};
$('measure-clear').onclick=()=>{clearMeasurement();map.draw();};
$('edithvale').onclick=measureEdithvale;
$('finish-profile').onclick=async()=>{if(vertices.length<2)return;drawing=false;map.pointPicking=measuring;$('drawing-help').hidden=true;$('profile-tool').classList.remove('active');$('profile-tool').textContent='⌁ Draw depth profile';const request=++profileRequest,points=vertices.slice(),selectedRegion=region.id;$('profile-stats').textContent='Sampling native raster cells…';try{const result=await data.profile(selectedRegion,points);if(request!==profileRequest)return;profile={...result,points,region:selectedRegion};$('export-csv').disabled=false;const valid=result.samples.filter(s=>s.status==='depth').length;$('profile-stats').textContent=`${number(result.length_m/1000,2)} km · ${number(result.spacing_m)} m sampling · ${number(valid/result.samples.length*100,0)}% below-datum coverage · ${result.datum}`;drawProfile();}catch(e){if(request===profileRequest){$('profile-stats').textContent='Profile unavailable';notice(e.message);}}};
const chart=$('profile-chart'),ctx=chart.getContext('2d');
new ResizeObserver(drawProfile).observe(chart);
function drawProfile(){
  const width=chart.clientWidth,height=chart.clientHeight,dpr=devicePixelRatio||1;chart.width=width*dpr;chart.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  const left=54,right=width-22,top=23,bottom=height-28;ctx.font='9px system-ui';ctx.lineWidth=1;ctx.textBaseline='middle';
  const data=profile?.samples||[],depths=data.filter(s=>s.depth_m!==null).map(s=>s.depth_m),min=Math.min(0,...depths),max=Math.max(10,...depths),range=max-min||1;
  const sy=d=>top+(d-min)/range*(bottom-top),sx=d=>left+d/(profile?.length_m||1)*(right-left);
  for(let i=0;i<=4;i++){const value=min+range*i/4,y=sy(value);ctx.strokeStyle='#e8efeb';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillStyle='#8ca29d';ctx.textAlign='right';ctx.fillText(profile?`${number(value,0)} m`:`${i*5} m`,left-10,y);}
  $('profile-empty').hidden=!!profile;
  if(!profile)return;
  ctx.textAlign='center';for(let i=0;i<=4;i++){const d=profile.length_m*i/4;ctx.fillText(d>=1000?`${number(d/1000,2)} km`:`${number(d,0)} m`,sx(d),height-10);}
  ctx.textAlign='left';ctx.fillText(`Reference depth below ${profile.datum} · gaps remain blank`,left,10);
  // Each contiguous valid run has its own path, so no-data is never connected across.
  let run=[];function paint(){if(!run.length)return;ctx.strokeStyle='#287f79';ctx.lineWidth=2;ctx.beginPath();run.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();if(run.length===1){ctx.beginPath();ctx.arc(...run[0],2,0,Math.PI*2);ctx.fillStyle='#287f79';ctx.fill();}else{ctx.lineTo(run.at(-1)[0],bottom);ctx.lineTo(run[0][0],bottom);ctx.closePath();ctx.fillStyle='#dceee6a0';ctx.fill();}run=[];}
  for(const sample of data){if(sample.depth_m===null){paint();continue;}run.push([sx(sample.distance_m),sy(sample.depth_m)]);}paint();
}
$('export-csv').onclick=()=>{if(profile)download(new Blob([profileCSV(profile)],{type:'text/csv'}),`${profile.region}-depth-profile.csv`);};
$('export-map').onclick=()=>{
  try{const scale=2,w=map.width,h=map.height+164,canvas=elem('canvas');canvas.width=w*scale;canvas.height=h*scale;const c=canvas.getContext('2d');c.scale(scale,scale);c.fillStyle='#fff';c.fillRect(0,0,w,h);c.drawImage(map.canvas,0,0,w,map.height);c.fillStyle='#f8fbf8';c.fillRect(0,0,w,55);c.fillStyle='#234e51';c.font='22px Georgia';c.fillText(`${region.name} · surveyed seabed`,20,34);c.fillStyle='#fff';c.fillRect(0,map.height,w,164);c.fillStyle='#3f6566';c.font='10px system-ui';
    const sources=region.rasters.map(r=>`${r.title} | ${r.datum} | ${r.survey_date} | ${r.resolution_m} m | ${r.quality}`).join('; ')||(region.contours?`Published contours | ${region.contours.datum} | ${region.contour_survey}`:'No survey data is published for this area.');
    const wrap=(text,y)=>{let line='';for(const word of text.split(' ')){if(c.measureText(line+word).width>w-40){c.fillText(line,20,y);y+=14;line='';}line+=word+' ';}c.fillText(line,20,y);return y+17;};
    let y=wrap(sources,map.height+23);y=wrap(region.attribution+' · '+region.licence,y);if(map.layers.basemap)y=wrap('Basemap © OpenStreetMap contributors · openstreetmap.org/copyright',y);y=wrap('Reference depths only. No tide adjustment. Not supplied for navigation.',y);
    for(const [i,[depth,color]] of [[0,[166,232,209]],[5,[83,200,194]],[10,[40,157,182]],[20,[36,102,151]],[30,[39,64,115]],[50,[27,35,71]]].entries()){c.fillStyle=`rgb(${color.join(',')})`;c.fillRect(20+i*64,y,54,8);c.fillStyle='#426765';c.fillText(`${depth}${depth===50?'+':''} m`,20+i*64,y+23);}canvas.toBlob(blob=>{if(blob)download(blob,`${region.id}-depth-map.png`);else notice('PNG export failed. Disable the online basemap and retry.');},'image/png');
  }catch(e){notice(`Map export failed: ${e.message}. Try disabling the online basemap.`);}
};
function showGuide(){
  $('guide-title').textContent=`Survey data for ${region.name}`;const content=$('guide-content');content.replaceChildren();
  function step(title,text){const div=elem('section',undefined,'guide-step');div.append(elem('h3',title),elem('p',text));content.append(div);return div;}
  const first=step('Published survey coverage',region.status==='empty'?'No survey files are currently published for this area. The map leaves coverage blank.':region.status==='contours'?'Published contour lines are available. Point depths and numeric profiles are unavailable until a raster is published.':'Point values and profiles use numeric survey cells. Transparent areas are data gaps; grey areas have elevations above the reference datum.');first.append(link('Government contour dataset ↗',region.contour_catalog));
  const second=step('Original elevation data',region.notes);second.append(link('Government dataset ↗',region.raster_catalog),document.createTextNode(' · '),link('Publisher download portal ↗',region.raster_portal));
  step('Depth reference','Depth is measured below the datum listed with each survey. AHD and chart datums are different references. Survey spacing describes horizontal detail, not vertical accuracy.');
  step('Explore and export','Click the map for source details. Where rasters are available, draw a seabed profile and export it as CSV. PNG map exports include depth references and attribution. This map does not estimate current water depth or determine whether a dive is safe.');
  for(const source of region.rasters){const row=elem('div',undefined,'source-row');row.append(elem('b',source.title),elem('span',`${source.survey_date} · ${source.resolution_m} m · ${source.datum} · ${source.quality}`),elem('br'),link('Source and original downloads ↗',source.source_url),elem('p',`${source.attribution} · ${source.licence}`));content.append(row);}
  $('guide').showModal();
}
$('data-guide').onclick=showGuide;$('empty-guide').onclick=showGuide;document.querySelector('.map-tag').onclick=showGuide;$('close-guide').onclick=()=>$('guide').close();
$('fetch').onclick=async()=>{try{const collection=await data.contours(region.id);download(new Blob([JSON.stringify(collection)],{type:'application/geo+json'}),`${region.id}-contours.geojson`);}catch(e){notice(e.message);}};
const edithvaleRequested=new URLSearchParams(location.search).get('site')==='edithvale';
load(edithvaleRequested?'port-phillip':undefined).then(()=>{if(edithvaleRequested)measureEdithvale();}).catch(e=>notice(`Cannot load published data: ${e.message}`));
