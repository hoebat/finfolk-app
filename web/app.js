// Keep an invite through OAuth redirects without putting it in the identity provider callback.
try { const invite = new URL(location.href).searchParams.get('invite'); if (/^[A-Za-z0-9_-]{24}$/.test(invite || '')) sessionStorage.setItem('finfolk:invite', invite); } catch {}
import {installOfflineUI} from './offline-ui.js';
import {installCommunity} from './community.js';
import {welcomeOnFirstVisit} from './welcome.js';
import {installLogbook} from './logbook.js';
import {estimateContourDepth} from './contour-estimate.js';
import {buildAreaZones} from './area-zones.js';
import {installMapSearch} from './map-search.js';
import {installAppShell} from './mobile-shell.js';
import {installSystemPanel} from './activity.js';
import {DEPTH_COLOURS,contourColour} from './map-style.js';
import {DepthMap} from './map.js';
import {StaticData,profileCSV} from './data-client.js';
import {dataLocations} from './data-pins.js';
import {nearestContour,edithvaleMeasurement,beachMeasurement} from './measure.js';
import {beachesForRegion,findBeach} from './beaches.js';
import {installDiscovery,capabilities} from './discovery.js';
const $=id=>document.getElementById(id), map=new DepthMap($('map'));
try{map.layers.measurement=globalThis.localStorage?.getItem('shore-depth:measurement-visible')!=='false';}catch{}
installSystemPanel();
const data=new StaticData();map.dataBase=data.base;
let catalog,region,profile=null,drawing=false,measuring=false,vertices=[],viewTimer,inspectionRequest=0,profileRequest=0,viewRequest=0,loadRequest=0;
let beachCatalog={beaches:[]},selectedBeachId='',contoursReady=false,discovery,selectionRequest=0,activeAreaId='';
const shell=installAppShell({onLayout:()=>map.resize(),onMapActivity:active=>map.setActive(active),onOpen:()=>map.cancelGesture()});
let mapSearch;
const logbook=installLogbook({shell,getBeaches:()=>beachCatalog.beaches,getSelectedBeach:()=>findBeach(beachCatalog,selectedBeachId)});
installOfflineUI(data.downloads,{region:()=>region,onOpen:id=>openSurvey(id)});
const community=installCommunity({shell,getBeaches:()=>beachCatalog.beaches,getSelectedBeach:()=>findBeach(beachCatalog,selectedBeachId)});
$('log-session').onclick=()=>logbook.newSession(findBeach(beachCatalog,selectedBeachId)).catch(e=>notice(e.message));
function revealMap(){map.resize();}
const number=(value,places=1)=>Number(value).toLocaleString('en-AU',{maximumFractionDigits:places});
function notice(message){$('notice').textContent=message;$('notice').hidden=!message;}
function elem(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function link(text,url){const a=elem('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function download(blob,name){const url=URL.createObjectURL(blob),a=elem('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function resetProfile(){profileRequest++;profile=null;vertices=[];drawing=false;map.pointPicking=measuring;map.line=[];$('profile-tool').classList.remove('active');$('profile-tool').textContent='⌁ Draw depth profile';$('drawing-help').hidden=true;$('export-csv').disabled=true;$('profile-stats').textContent='Draw a line to explore the change in depth';drawProfile();}
function stopMeasuring(){if(measuring)notice('');measuring=false;map.pointPicking=drawing;$('measure-start').classList.remove('active');$('measure-start').textContent='Pick a beach start point';}
function updateMeasurementVisibility(){
  const visible=map.layers.measurement;$('measurement-visibility').hidden=!map.measurement;$('measurement-visibility').setAttribute('aria-pressed',String(visible));$('measurement-visibility').title=visible?'Hide distance graphic':'Show distance graphic';$('measurement-hide-icon').hidden=!visible;$('measurement-show-icon').hidden=visible;
}
function clearMeasurement(){stopMeasuring();map.measurement=null;$('measure-result').textContent='Choose a start point to measure the straight-line distance to a published contour.';$('measure-reference').textContent='Contour reference depth only. The straight line does not assess an open-water route, tides or current conditions.';$('measure-clear').hidden=true;updateMeasurementVisibility();}
function showMeasurement(result,label='Selected start point'){
  stopMeasuring();map.measurement={...result,start_label:label};map.marker=null;$('inspection').hidden=true;inspectionRequest++;
  $('measure-result').textContent=`About ${number(result.distance_m/1000,2)} km one way · ${number(result.return_distance_m/1000,2)} km return · nearest published ${result.depth_m} m contour`;
  $('measure-reference').textContent=`${label}. ${result.feature.properties.datum_label}; survey ${result.feature.properties.survey_date||region.contour_survey}. Straight-line estimate with no tide adjustment; actual water depth and route conditions are not established.`;
  $('measure-clear').hidden=false;updateMeasurementVisibility();if(map.layers.measurement)map.fitPoints([result.start,result.target],90);else map.draw();notice('');
}
function measureFrom(point,label){try{showMeasurement(nearestContour(point,map.contours,Number($('measure-depth').value)),label);}catch(e){stopMeasuring();notice(e.message);}}
function measureEdithvale(){resetProfile();try{const result=edithvaleMeasurement(map.contours,Number($('measure-depth').value));showMeasurement(result,result.start_label);}catch(e){notice(e.message);}}
async function openSurvey(id,{reveal=true}={}){
  const request=++selectionRequest;activeAreaId='';if(reveal){const url=new URL(location.href);url.searchParams.delete('site');history.replaceState(null,'',url);}notice('Loading published depth map…');
  try{await load(id);if(request!==selectionRequest)return;const counts=new Map();for(const beach of beachCatalog.beaches.filter(b=>b.region===region.id))counts.set(beach.area_id,(counts.get(beach.area_id)||0)+1);const area=beachCatalog.areas.find(a=>a.id===[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]);map.focusedAreaId=area?.id||null;if(area){try{const context=await discovery.getAreaData(area);if(request!==selectionRequest)return;setAreaContext(context);}catch{setAreaContext();}}map.resize();notice('');if(reveal)revealMap();}catch(error){notice(error.message);}
}
$('survey-select').onchange=()=>openSurvey($('survey-select').value);
function hasPublishedData(r){return r.status!=='empty'&&(r.rasters.length>0||r.contours?.count>0);}
function updateBeachPicker(){discovery?.render();}
function updateCapabilities(){
  const c=capabilities(region,map.contours);
  for(const [id,available] of [['depth-layer',c.raster||!!map.surface],['coverage-layer',c.raster],['contour-layer',c.raster||c.contours],['pin-layer',!!map.sourcePins.length],['interval',c.fine]])$(id).closest('label').hidden=!available;
  $('raster-legend').hidden=!c.raster;$('contour-legend').hidden=!c.contours||!map.layers.contours||!!(map.surfaceImage&&map.layers.depth);$('basemap-attribution').hidden=!(map.layers.basemap||(map.surface&&map.layers.depth));
  $('context-layer-control').hidden=!map.contextContours.length;$('context-legend').hidden=!map.layers.context||!map.contextContours.length;if(map.contextSource?.metadata_url)$('context-source').href=map.contextSource.metadata_url;
  const surface=map.surface,show=!!surface&&map.layers.depth;$('surface-legend').hidden=!show;if(show){$('surface-source').href=surface.service+'/'+surface.layer;$('surface-source').title=surface.note;$('surface-status').textContent=map.zoom<surface.minZoom?'Zoom in for seabed shading':map.surfaceState==='error'?(map.surfaceImage?'Update failed · previous shading retained':'Shading unavailable · contours retained'):map.surfaceState==='loading'?'Loading seabed shading…':'Lighter = shallower · display only';$('surface-retry').hidden=map.surfaceState!=='error';}$('profile-panel').hidden=!c.raster;$('profile-tool').hidden=!c.raster;$('measure-panel').hidden=!c.measure;$('fetch').hidden=!c.contours;
}
function setAreaContext(data={}){map.coastline=data.coastline||[];map.contextContours=data.context_contours||[];map.contextSource=data.context_source||null;if(region?.status==='empty'){const available=map.contextContours.length>0;$('data-status').textContent=available?'No local survey · broad-scale context visible':'No depth data published yet';$('source-summary').textContent=available?'This map shows generalised 250 m model contours for regional context. No local numeric depth survey is published here.':'Government sources are configured. Survey data will appear after it is acquired and included in a site build.';}map.draw();updateCapabilities();}
async function chooseBeach(id,{writeURL=true,depth=Number($('measure-depth').value)||10}={}){
  const request=++selectionRequest;let beach=findBeach(beachCatalog,id);if(beach&&discovery){try{beach=await discovery.getBeach(beach.id);}catch{notice('Detailed site facts are unavailable; using the listed reference position.');}}if(request!==selectionRequest)return;if(id&&!beach){notice('That beach is not in the location list. Choose a beach from the picker.');return;}
  if(beach){activeAreaId=beach.area_id;map.focusedAreaId=beach.area_id;}else map.focusedAreaId=null;
  if(beach&&(beach.region!==region?.id||!contoursReady))await load(beach.region,false,{center:beach.point,zoom:15});else loadRequest++;if(request!==selectionRequest)return;
  selectedBeachId=beach?.id||'';$('log-session').hidden=!beach||!logbook.enabled;if([...$('measure-depth').options].some(o=>Number(o.value)===depth))$('measure-depth').value=depth;await discovery?.select(selectedBeachId);if(request!==selectionRequest)return;map.resize();map.selectedBeach=selectedBeachId;resetProfile();clearMeasurement();$('inspection').hidden=true;inspectionRequest++;notice('');
  if(beach){
    $('place-title').textContent=beach.name;document.title=`${beach.name} · FinFolk`;map.center=beach.point;map.zoom=15;map.marker=beach.point;map.draw();map.onview?.();
    try{if([...$('measure-depth').options].some(o=>Number(o.value)===depth))$('measure-depth').value=depth;const result=beachMeasurement(map.contours,beach,depth);if(result.distance_m>3000)throw Error('No matching mapped contour within 3 km of this beach reference.');showMeasurement(result,result.start_label);}
    catch(e){$('measure-result').textContent=`${beach.name}: automatic distance is unavailable.`;$('measure-reference').textContent='The selected beach location is shown on the map. Pick your exact entry point to measure against the available published contours.';notice(e.message);}
  }else{map.marker=null;map.center=region.center;map.zoom=region.zoom;map.draw();map.onview?.();$('place-title').textContent=region.name;document.title=`${region.name} · FinFolk`;}
  updateBeachPicker();if(writeURL){const url=new URL(location.href);if(beach){url.searchParams.set('site',beach.id);}else url.searchParams.delete('site');history.replaceState(null,'',url);}mapSearch?.setSelection(beach);return beach;
}
async function load(selected,retainView=false,view={}){
  const generation=++loadRequest;viewRequest++;const previous=region?.id,nextCatalog=await data.catalog(selected||previous);if(generation!==loadRequest)return;catalog=nextCatalog;region=catalog.regions.find(r=>r.id===(selected||previous))||catalog.regions[0];
  $('survey-select').value=region.id;contoursReady=false;if(!retainView||previous!==region.id){selectedBeachId='';$('log-session').hidden=true;map.setRegion(region,view);map.beaches=beachCatalog.beaches.filter(b=>activeAreaId?b.area_id===activeAreaId:b.region===region.id);discovery?.select('');resetProfile();clearMeasurement();$('inspection').hidden=true;inspectionRequest++;}else{map.rasters=region.rasters;map.tileFiles=region.tiles;map.tileMaxZoom=region.tile_max_zoom||map.zoom;map.images.clear();}
  map.version=catalog.updated_at||0;const title=findBeach(beachCatalog,selectedBeachId)?.name||region.name;$('place-title').textContent=title;document.title=`${title} · FinFolk`;updateBeachPicker();
  document.querySelectorAll('[data-region]').forEach(b=>b.classList.toggle('active',b.dataset.region===region.id));
  $('data-status').textContent=region.status==='raster'?`${region.rasters.length} raster source${region.rasters.length===1?'':'s'} available`:region.status==='contours'?`${region.contours.count} published contours`:'No depth data published yet';
  $('data-status').classList.toggle('ready',region.status!=='empty');
  $('source-summary').textContent=region.status==='raster'?region.rasters.map(r=>`${r.resolution_m} m source spacing · ${r.datum} · ${r.quality} coverage`).join('; '):region.status==='contours'?'Contour values are available. Numeric rasters have not been published for point depths or profiles.':'Government sources are configured. Survey data will appear after it is acquired and included in a site build.';
  if(region.contours)$('source-summary').textContent+=` Datum: ${region.contours.datum}.`;
  if(map.surface)$('source-summary').textContent+=' '+map.surface.note;
  $('fetch').disabled=!region.contours;
  $('empty-state').hidden=region.status!=='empty';$('profile-tool').disabled=region.status!=='raster';
  $('map-attribution').textContent=`${region.map_attribution||region.state+' government data'}`;
  const canFine=region.rasters.length&&region.rasters.every(r=>r.resolution_m<=5&&r.quality==='measured');$('interval').options[1].disabled=!canFine;if(!canFine)$('interval').value='5';
  $('measure-start').disabled=true;$('edithvale').disabled=true;$('edithvale').hidden=true;updateCapabilities();
  const requestedRegion=region.id;const collection=await data.contours(requestedRegion);if(generation!==loadRequest||region.id!==requestedRegion)return;map.contours=collection.features;map.setDataPins(dataLocations(region,collection.features));map.derived=[];
  const depths=[...new Set(collection.features.map(f=>f.properties.depth_m).filter(d=>Number.isFinite(d)&&d>0&&d<=200))].sort((a,b)=>a-b),selectedDepth=Number($('measure-depth').value);$('measure-depth').replaceChildren(...depths.map(depth=>{const option=elem('option',`${number(depth)} m`);option.value=depth;return option;}));if(depths.includes(selectedDepth))$('measure-depth').value=selectedDepth;else if(depths.includes(10))$('measure-depth').value='10';
  $('measure-start').disabled=!depths.length;$('measure-depth').disabled=!depths.length;$('edithvale').disabled=!depths.length;contoursReady=true;updateBeachPicker();updateCapabilities();map.draw();updateDerived();
}
for(const [id,key] of [['depth-layer','depth'],['contour-layer','contours'],['pin-layer','pins'],['coverage-layer','coverage'],['basemap-layer','basemap']])$(id).onchange=()=>{map.layers[key]=$(id).checked;if(key==='depth'&&!map.layers.depth)map.cancelSurface();if(key==='contours'&&!map.layers.contours)map.contourRenderer?.clear();map.draw();if(!region)return;$('map-attribution').textContent=`${region.map_attribution||region.state+' government data'}`;if(key==='contours')updateDerived();updateCapabilities();};
$('context-layer').onchange=()=>{map.layers.context=$('context-layer').checked;map.draw();updateCapabilities();};
$('zoom-in').onclick=()=>map.zoomBy(1);$('zoom-out').onclick=()=>map.zoomBy(-1);$('home').onclick=()=>{if(!region)return;map.center=region.center;map.zoom=region.zoom;map.draw();updateDerived();};
$('refresh').onclick=()=>{if(region)load(region.id,true).catch(e=>notice(e.message));};
map.onerror=message=>notice(message);
map.onsurface=()=>{if(region)updateCapabilities();};
$('surface-retry').onclick=()=>{map.surfaceKey=null;map.draw();};
map.onview=()=>{clearTimeout(viewTimer);viewTimer=setTimeout(updateDerived,350);};
async function updateDerived(){
  const request=++viewRequest;if(!map.active||!region?.rasters.length||!map.layers.contours){map.derived=[];return;}
  // Whole-bay source contours are efficient at overview scale. Derived lines are for site-scale inspection.
  if(map.zoom<12&&map.contours.length){map.derived=[];map.draw();return;}
  try{const collection=await data.derivedContours(region.id,map.bounds(),Number($('interval').value));if(request!==viewRequest)return;map.derived=collection.features;map.draw();}
  catch(e){if(request===viewRequest)notice(e.message);}
}
$('interval').onchange=updateDerived;
map.onclick=async(point,contour,pin)=>{
  if(!region)return;
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
      if(contour?.properties?.coverage_class==='regional-context'){$('inspection-kind').textContent='BROAD-SCALE MODEL CONTEXT';$('inspection-value').textContent=`${number(contour.properties.depth_m)} m regional contour`;details.append(elem('p','This line comes from a 250 m Australia-wide bathymetry model, smoothed for broad-scale mapping. It is not a local survey or point-depth estimate; nearshore positions may be inaccurate. Do not use it for freediving decisions or navigation.'),elem('p',`${contour.properties.datum_label} · ${contour.properties.source_name}`),link('Dataset metadata, licence & limits ↗',map.contextSource?.metadata_url||contour.properties.source_url),elem('p',`${point[1].toFixed(5)}, ${point[0].toFixed(5)}`));return;}
      const estimate=pin?.kind==='contour'?null:estimateContourDepth(point,map.contours);
      if(estimate){
        $('inspection-kind').textContent='ESTIMATED REFERENCE DEPTH';$('inspection-value').textContent=`≈ ${number(Math.round(estimate.depth_m*2)/2)} m`;
        details.append(elem('p',`Interpolated between the ${number(estimate.lower.depth_m)} m and ${number(estimate.upper.depth_m)} m contours, ${number(estimate.lower.distance_m,0)} m and ${number(estimate.upper.distance_m,0)} m away.`),elem('p',`${estimate.datum_label}${estimate.datum_code!==null?' · original DATUM code '+estimate.datum_code:''}. No numeric raster cell at this point. This assumes a gradual slope between the lines; seabed variation and vertical uncertainty are unknown. No tide adjustment.`),link('Government contour dataset ↗',region.contour_catalog||estimate.lower.feature.properties.source_url));
      }else{
        $('inspection-kind').textContent=contour?(pin?'PUBLISHED CONTOUR':'CONTOUR LABEL · NEAR CLICK'):'NO LOCAL DEPTH ESTIMATE';
        $('inspection-value').textContent=contour?`${number(contour.properties.depth_m)} m`:'No depth data';
        details.append(elem('p',contour?`Published/derived contour relative to ${contour.properties.datum_label}. This is a line label; point depth is unavailable.`:'No numeric raster cell or suitable nearby bracketing contours with a matching depth reference.'));
        if(contour&&pin)details.append(elem('p',region.contour_survey),link('Government contour dataset ↗',region.contour_catalog));
      }
    }else{
      const source=result.source;$('inspection-kind').textContent=result.status==='above-datum'?'ELEVATION ABOVE DATUM':'SURVEYED REFERENCE DEPTH';$('inspection-value').textContent=`${number(Math.abs(result.depth_m))} m`;
      const dl=elem('dl');for(const [label,value] of [['Datum',source.datum],['Grid',`${source.resolution_m} m source spacing`],['Survey',source.survey_date],['Coverage',source.quality],['Source',source.title]]){dl.append(elem('dt',label),elem('dd',value));}details.append(dl,link('Source dataset ↗',source.source_url));
    }
    details.append(elem('p',`${point[1].toFixed(5)}, ${point[0].toFixed(5)}`));
  }catch(e){if(request===inspectionRequest){$('inspection-value').textContent='Unavailable';$('inspection-details').textContent=e.message;}}
};
$('close-inspection').onclick=()=>{inspectionRequest++;$('inspection').hidden=true;map.marker=null;map.draw();};
$('profile-tool').onclick=()=>{stopMeasuring();if(drawing){resetProfile();map.draw();return;}resetProfile();drawing=true;map.pointPicking=true;$('inspection').hidden=true;$('drawing-help').hidden=false;shell.closePanel();$('finish-profile').disabled=true;$('profile-tool').classList.add('active');$('profile-tool').textContent='⌁ Drawing profile…';notice('');};
$('cancel-profile').onclick=()=>{resetProfile();map.draw();};
document.addEventListener('keydown',e=>{if(e.defaultPrevented||document.querySelector('dialog[open]'))return;if(e.key==='Escape'){if(measuring)stopMeasuring();if(drawing){resetProfile();map.draw();}}});
$('measure-start').onclick=()=>{if(measuring){stopMeasuring();return;}resetProfile();measuring=true;map.pointPicking=true;$('measure-start').classList.add('active');$('measure-start').textContent='Click your start point · Esc to cancel';notice('Click the beach entry point on the map. The measurement goes to the closest matching published contour.');shell.closePanel();};
$('measure-depth').onchange=()=>{if(map.measurement?.beach_id&&findBeach(beachCatalog,map.measurement.beach_id))chooseBeach(map.measurement.beach_id,{depth:Number($('measure-depth').value)}).catch(e=>notice(e.message));else if(map.measurement)measureFrom(map.measurement.start,map.measurement.start_label);};
$('measure-clear').onclick=()=>{clearMeasurement();map.draw();};
$('measurement-visibility').onclick=()=>{map.layers.measurement=!map.layers.measurement;try{globalThis.localStorage?.setItem('shore-depth:measurement-visible',String(map.layers.measurement));}catch{}updateMeasurementVisibility();if(map.layers.measurement&&map.measurement)map.fitPoints([map.measurement.start,map.measurement.target],90);else map.draw();};
$('edithvale').onclick=()=>{if(findBeach(beachCatalog,'edithvale'))chooseBeach('edithvale').catch(e=>notice(e.message));else measureEdithvale();};

$('finish-profile').onclick=async()=>{if(vertices.length<2)return;drawing=false;map.pointPicking=measuring;$('drawing-help').hidden=true;$('profile-tool').classList.remove('active');$('profile-tool').textContent='⌁ Draw depth profile';const request=++profileRequest,points=vertices.slice(),selectedRegion=region.id;$('profile-stats').textContent='Sampling native raster cells…';try{const result=await data.profile(selectedRegion,points);if(request!==profileRequest)return;profile={...result,points,region:selectedRegion};$('export-csv').disabled=false;const valid=result.samples.filter(s=>s.status==='depth').length;$('profile-stats').textContent=`${number(result.length_m/1000,2)} km · ${number(result.spacing_m)} m sampling · ${number(valid/result.samples.length*100,0)}% below-datum coverage · ${result.datum}`;drawProfile();shell.openPanel('place');}catch(e){if(request===profileRequest){$('profile-stats').textContent='Profile unavailable';notice(e.message);}}};
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
  try{const scale=2,w=map.width,h=map.height+240,canvas=elem('canvas');canvas.width=w*scale;canvas.height=h*scale;const c=canvas.getContext('2d');c.scale(scale,scale);c.fillStyle='#fff';c.fillRect(0,0,w,h);c.drawImage(map.canvas,0,0,w,map.height);c.fillStyle='#f8fbf8';c.fillRect(0,0,w,55);c.fillStyle='#234e51';c.font='22px Georgia';c.fillText(`${region.name} · surveyed seabed`,20,34);c.fillStyle='#fff';c.fillRect(0,map.height,w,240);c.fillStyle='#3f6566';c.font='10px system-ui';
    const sources=region.rasters.map(r=>`${r.title} | ${r.datum} | ${r.survey_date} | ${r.resolution_m} m | ${r.quality}`).join('; ')||(region.contours?`Published contours | ${region.contours.datum} | ${region.contour_survey}`:'No survey data is published for this area.');
    const wrap=(text,y)=>{let line='';for(const word of text.split(' ')){if(c.measureText(line+word).width>w-40){c.fillText(line,20,y);y+=14;line='';}line+=word+' ';}c.fillText(line,20,y);return y+17;};
    let y=wrap(sources,map.height+23);y=wrap(region.attribution+' · '+region.licence,y);if(map.layers.basemap||(map.surface&&map.layers.depth))y=wrap('Basemap © OpenStreetMap contributors · openstreetmap.org/copyright',y);if(map.surface&&map.layers.depth)y=wrap(map.surface.credit+' · Relative seabed shading, not numeric depth. Contour labels supply reference metres.',y);y=wrap('Reference depths only. No tide adjustment. Not supplied for navigation.',y);
    for(const [i,[depth,color]] of DEPTH_COLOURS.entries()){c.fillStyle=region.rasters.length||(map.surfaceImage&&map.layers.depth)?`rgb(${color.join(',')})`:contourColour(depth);c.fillRect(20+i*64,y,54,8);c.fillStyle='#426765';c.fillText(map.surfaceImage&&map.layers.depth?(i===0?'Shallower':i===5?'Deeper':''):`${depth}${depth===50?'+':''} m`,20+i*64,y+23);}canvas.toBlob(blob=>{if(blob)download(blob,`${region.id}-depth-map.png`);else notice('PNG export failed. Disable the online basemap and retry.');},'image/png');
  }catch(e){notice(`Map export failed: ${e.message}. Try disabling the online basemap.`);}
};
function showGuide(){
  if(!region)return;
  $('guide-title').textContent=`Survey data for ${region.name}`;const content=$('guide-content');content.replaceChildren();
  function step(title,text){const div=elem('section',undefined,'guide-step');div.append(elem('h3',title),elem('p',text));content.append(div);return div;}
  const first=step('Published survey coverage',region.status==='empty'?'No survey files are currently published for this area. The map leaves coverage blank.':region.status==='contours'?'Published contour lines are available. Point depths and numeric profiles are unavailable until a raster is published.':'Point values and profiles use numeric survey cells. Transparent areas are data gaps; grey areas have elevations above the reference datum.');if(region.contour_catalog)first.append(link('Government contour dataset ↗',region.contour_catalog));
  if(map.surface){const surface=step('Filled water shading',map.surface.note+' Imagery comes directly from the publisher and requires internet. Colours follow the publisher legend from shallow to deep; they are not converted into numeric samples. Water is clipped to the OpenStreetMap shore. Missing imagery or shore tiles leaves shading blank.');surface.append(link('Publisher raster layer ↗',map.surface.service+'/'+map.surface.layer));}
  const second=step('Original elevation data',region.notes);if(region.raster_catalog)second.append(link('Government dataset ↗',region.raster_catalog));if(region.raster_portal)second.append(document.createTextNode(' · '),link('Publisher download portal ↗',region.raster_portal));
  step('Depth reference','Depth is measured below the datum listed with each survey. AHD and chart datums are different references. Survey spacing describes horizontal detail, not vertical accuracy.');
  step('Explore and export','Click the map for source details. Where rasters are available, draw a seabed profile and export it as CSV. PNG map exports include depth references and attribution. This map does not estimate current water depth or determine whether a dive is safe.');
  const locations=step('Beach reference locations',beachCatalog.location_note||'Government monitoring and council reference locations.');
  const sourceIds=new Set(beachesForRegion(beachCatalog,region.id).map(b=>b.source_id));
  for(const source of beachCatalog.sources||[])if(sourceIds.has(source.id)){locations.append(elem('p',`${source.attribution}${source.licence?' · '+source.licence:''}`),link(source.publisher+' ↗',source.url));}
  for(const source of region.rasters){const row=elem('div',undefined,'source-row');row.append(elem('b',source.title),elem('span',`${source.survey_date} · ${source.resolution_m} m · ${source.datum} · ${source.quality}`),elem('br'),link('Source and original downloads ↗',source.source_url),elem('p',`${source.attribution} · ${source.licence}`));content.append(row);}
  $('guide').showModal();
}
$('data-guide').onclick=showGuide;$('empty-guide').onclick=showGuide;$('close-guide').onclick=()=>$('guide').close();
$('fetch').onclick=async()=>{try{const collection=await data.contours(region.id);download(new Blob([JSON.stringify(collection)],{type:'application/geo+json'}),`${region.id}-contours.geojson`);}catch(e){notice(e.message);}};
async function openBeach(id,options={}){
  shell.navigate('maps',{params:{site:id}});const epoch=shell.route.epoch;
  try{const beach=await chooseBeach(id,options);if(beach&&shell.route.epoch===epoch&&shell.route.view==='maps'){shell.openPanel('place');community.beachPanel(beach);}}catch(e){notice(e.message);}
}
async function openArea(area){
  const request=++selectionRequest;activeAreaId=area.id;map.focusedAreaId=area.id;const counts=new Map();for(const b of beachCatalog.beaches.filter(b=>b.area_id===area.id)){if(catalog.regions.some(r=>r.id===b.region&&hasPublishedData(r)))counts.set(b.region,(counts.get(b.region)||0)+1);}const survey=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0];
  try{await load(survey||area.map_region);if(request!==selectionRequest)return;try{const context=await discovery.getAreaData(area);if(request!==selectionRequest)return;setAreaContext(context);}catch{setAreaContext();}map.beaches=beachCatalog.beaches.filter(b=>b.area_id===area.id);map.center=area.center;map.zoom=10;map.resize();map.draw();map.onview?.();}catch(e){notice(e.message);}
}
async function start(){
  try{beachCatalog=await data.json('beaches.json');const regionShapes=beachCatalog.area_regions_file?await data.json(beachCatalog.area_regions_file).catch(()=>null):null;map.areaZones=buildAreaZones(beachCatalog.areas,beachCatalog.beaches,regionShapes);$('area-attribution').hidden=!regionShapes?.features?.length;map.draw();}catch(e){notice(`Beach locations are unavailable: ${e.message}`);}
  const [summaries,guides,social]=await Promise.all([data.json('data/beach-summaries.json').catch(()=>({beaches:[]})),data.json('guides.json'),data.json('social.json').catch(()=>({posts:[]}))]);
  catalog=await data.catalog();region=catalog.regions[0];
  const published=catalog.regions.filter(hasPublishedData);for(const state of [...new Set(published.map(r=>r.state))].sort((a,b)=>a.localeCompare(b))){const group=elem('optgroup');group.label=state;for(const r of published.filter(r=>r.state===state).sort((a,b)=>a.name.localeCompare(b.name))){const option=elem('option',r.name);option.value=r.id;group.append(option);}$('survey-select').append(group);}
  discovery=installDiscovery({catalog:beachCatalog,summaries,guides,social,getCommunityPosts:id=>logbook.publicInstagramPosts(id),navigation:shell,loadJSON:path=>data.json(path),onSelect:openBeach,onArea:openArea,onContext:(coastline,contextContours,contextSource)=>setAreaContext({coastline,context_contours:contextContours,context_source:contextSource}),onStays:stays=>{map.stays=stays;map.draw();}});
  mapSearch=installMapSearch({catalog:beachCatalog,onBeach:id=>openBeach(id),onArea:area=>{shell.navigate('maps',{params:{site:null}});openArea(area);},onAll:query=>discovery.showIndex(query),onTyping:()=>shell.closePanel()});
  map.onArea=zone=>{const area=beachCatalog.areas.find(candidate=>candidate.id===zone.id);if(!area)return;shell.navigate('maps',{params:{site:null}});openArea(area);};
  map.onBeach=beach=>openBeach(beach.id);
  map.onStay=stay=>{$('inspection').hidden=false;$('inspection-kind').textContent='NEARBY STAY';$('inspection-value').textContent=stay.name;$('inspection-details').replaceChildren(elem('p',`${(stay.distance_m/1000).toFixed(1)} km straight-line from beach reference`),elem('p',stay.status),link(stay.operator_url?'Provider & bookings ↗':'Mapped listing ↗',stay.operator_url||stay.source_url));};
  async function restoreMap(route){if(route.view!=='maps')return;const site=new URL(location.href).searchParams.get('site'),requested=findBeach(beachCatalog,site);if(requested&&requested.id!==selectedBeachId)await chooseBeach(requested.id,{writeURL:false});else if(!map.ready)await openSurvey(data.downloads.offlineRegion||published[0]?.id,{reveal:false});else map.resize();}
  shell.subscribe(route=>{mapSearch.close();if(route.reason==='popstate'||!map.ready)restoreMap(route).catch(e=>notice(e.message));});
  await restoreMap(shell.route);
  welcomeOnFirstVisit();
}
start().catch(e=>notice(`Cannot load published data: ${e.message}`));
