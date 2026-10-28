import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {Window} from 'happy-dom';
const window=new Window({url:'https://example.test/shore-depth-explorer/',settings:{disableIframePageLoading:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
window.document.write(await readFile(new URL('../web/index.html',import.meta.url),'utf8'));
const directory=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',`import json
from pathlib import Path
from depth_explorer.national import directory
from depth_explorer.catalog import REGIONS
print(json.dumps(directory(json.loads(Path('web/beaches.json').read_text()),{},json.loads(Path('config/areas.json').read_text()),list(REGIONS.values()))))`],{cwd:new URL('..',import.meta.url)}));
for(const b of directory.beaches){b.entry_documented=!!b.entry?.verified;b.has_access_facts=b.facts.some(f=>['Access','Entry'].includes(f.label));b.restricted_activities=(b.restrictions||[]).map(r=>r.activity);b.fact_count=b.facts.length;b.detail_file='data/areas/'+b.area_id+'.json';}
for(const area of directory.areas){area.detail_file='data/areas/'+area.id+'.json';area.depth_count=2;area.survey_count=1;}
const regions=JSON.parse(await readFile(new URL('../depth_explorer/regions.json',import.meta.url),'utf8')).map(r=>({...r,rasters:[],tiles:{},contour_file:`data/contours/${r.id}.geojson`,status:'contours',contours:{count:2,datum:r.contour_datum}}));
// Production areas can span both surveyed beaches and unsurveyed directory entries.
for(const area of directory.areas){area.map_region=area.id;regions.push({id:area.id,name:area.name,center:area.center,zoom:10,rasters:[],tiles:{},contour_file:null,status:'empty'});}
regions.push({id:'unavailable-configured-survey',name:'Unavailable survey',state:'TEST',center:[151,-34],zoom:10,rasters:[],tiles:{},contour_file:'data/contours/unavailable.geojson',contours:null,status:'empty'});
const guides=await readFile(new URL('../web/guides.json',import.meta.url),'utf8'),social=await readFile(new URL('../web/social.json',import.meta.url),'utf8');
for(const name of ['document','location','history','Event','MouseEvent','HTMLCanvasElement'])globalThis[name]=window[name];
globalThis.devicePixelRatio=1;globalThis.ResizeObserver=class{observe(){}};
const ctx=new Proxy({measureText:text=>({width:text.length*7})},{get:(target,key)=>target[key]||(()=>{})});window.HTMLCanvasElement.prototype.getContext=()=>ctx;
const originalFetch=globalThis.fetch;let contourRequests=0,areaRequests=0;
globalThis.fetch=async url=>{
 const path=new URL(url).pathname;
 if(path.endsWith('/beaches.json'))return new Response(JSON.stringify(directory));
 if(path.endsWith('/guides.json'))return new Response(guides);
 if(path.endsWith('/social.json'))return new Response(social);
 if(path.endsWith('/data/catalog.json'))return new Response(JSON.stringify({format_version:1,regions}));
 if(path.endsWith('/data/beach-summaries.json'))return new Response(JSON.stringify({beaches:directory.beaches.map(b=>({id:b.id,depths:{10:{status:'available',distance_m:350}},datum:'TEST',survey_date:'TEST',start_label:'SYNTHETIC TEST REFERENCE'}))}));
 const area=directory.areas.find(a=>path.endsWith('/'+a.detail_file));
 if(area){areaRequests++;const b=directory.beaches.find(b=>b.area_id===area.id),p=b.point;return new Response(JSON.stringify({beaches:directory.beaches.filter(b=>b.area_id===area.id),coastline:[],surveys:[{name:'TEST source survey',metadata_url:'https://example.test/source'}],stays:[{id:'checked',name:'TEST checked stay',types:['campground','cabin'],type:'campground',point:p,verified:true,source_url:'https://example.test/operator',amenities:{toilets:true},reviewed_at:'TEST',status:'TEST source'}, {id:'mapped',name:'TEST mapped stay',type:'caravan-park',point:p,verified:false,source_url:'https://example.test/mapped',amenities:{}}]}));}
 const region=regions.find(r=>r.contour_file&&path.endsWith('/'+r.contour_file));
 if(region){contourRequests++;const [x,y]=region.center;return new Response(JSON.stringify({features:[0,10].map(depth=>({properties:{depth_m:depth,datum_label:'TEST'},geometry:{type:'LineString',coordinates:[[x-.01,y],[x+.01,y]]}}))}));}
 return new Response('',{status:404});
};
const $=id=>document.getElementById(id),waitFor=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('App timed out: '+$('notice').textContent);};
try{
 await import('../web/app.js');await waitFor(()=>document.querySelectorAll('.area-button').length>0&&!$('measure-start').disabled);
 assert.equal(contourRequests,1,'The home page opens one published map');assert.equal($('explorer').hidden,false);assert.equal($('search-options').open,false);assert.equal(document.querySelector('.directory-menu').open,false);assert.equal(areaRequests,0,'Regional detail files load only when selected');assert.equal($('origin-filter'),null);assert.equal($('transport-status'),null);
 assert.ok($('map').compareDocumentPosition($('beach-summary'))&window.Node.DOCUMENT_POSITION_FOLLOWING,'Map precedes potentially long beach details');
 document.querySelector('[data-view="maps"]').click();await waitFor(()=>!$('measure-start').disabled);assert.equal($('explorer').hidden,false);assert.equal($('survey-select').options.length,regions.filter(r=>r.status!=='empty'&&r.contour_file).length);assert.equal($('empty-state').hidden,true);assert.equal($('search-results-panel').hidden,true);assert.ok(contourRequests>0);
 document.querySelector('[data-view="discover"]').click();
 for(const id of ['profile-tool','profile-panel','raster-legend'])assert.equal($(id).hidden,true);
 const states=[...document.querySelectorAll('#region-picker .state-group>summary')].map(s=>s.textContent);assert.deepEqual(states,states.slice().sort((a,b)=>a.localeCompare(b)));
 $('beach-search').value='greenfield';$('beach-search').dispatchEvent(new window.Event('input'));assert.equal($('search-results-panel').hidden,false,'Map search reveals the compact results');document.querySelector('#beach-results .beach-open').click();
 await waitFor(()=>$('place-title').textContent==='Greenfield Beach');assert.equal(new URL(location.href).searchParams.get('site'),'greenfield');assert.equal($('explorer').hidden,false);assert.ok($('beach-summary').textContent.includes('Camping, caravan parks & cabins nearby'));
 assert.equal(document.querySelectorAll('.stay-card').length,1);document.querySelector('.stay-filters input').click();assert.equal(document.querySelectorAll('.stay-card').length,2);
 const amenity=document.querySelector('select[aria-label="Stay amenities"]');amenity.value='showers';amenity.dispatchEvent(new window.Event('change'));assert.equal(document.querySelectorAll('.stay-card').length,0);
 $('beach-search').value='jervis';$('beach-search').dispatchEvent(new window.Event('input'));
 for(let i=0;i<3;i++){[...document.querySelectorAll('#beach-results .compare-toggle input')].find(c=>!c.checked).click();}
 assert.equal(document.querySelectorAll('.compare-card').length,3);assert.ok([...document.querySelectorAll('#beach-results .compare-toggle input')].filter(c=>!c.checked).every(c=>c.disabled));
 document.querySelector('[data-view="guides"]').click();assert.equal($('guides-page').hidden,false);assert.equal($('explorer').hidden,true);assert.ok($('guides-content').textContent.includes('Ocean swimming'));assert.ok($('guides-content').textContent.includes('Spearfishing'));
 document.querySelector('[data-view="areas"]').click();assert.equal($('areas-page').hidden,false);const summary=document.querySelector('.area-group>summary');summary.click();summary.parentElement.dispatchEvent(new window.Event('toggle'));assert.ok(document.querySelector('.area-beaches'));
 $('beach-search').value='hyams';$('beach-search').dispatchEvent(new window.Event('input'));document.querySelector('#beach-results .beach-open').click();await waitFor(()=>$('place-title').textContent==='Hyams Beach');assert.ok($('beach-summary').textContent.includes('sanctuary'));
 assert.equal(document.querySelector('.beach-facts').open,false);assert.ok(document.querySelector('.social-gallery').compareDocumentPosition(document.querySelector('.nearby-stays'))&window.Node.DOCUMENT_POSITION_FOLLOWING,'Photos precede campsites and source notes');assert.ok($('map').closest('.map-column'));const staysTab=[...document.querySelectorAll('.place-tab')].find(b=>b.textContent==='Camping & stays');assert.ok(staysTab);staysTab.click();assert.equal(document.querySelector('.nearby-stays').hidden,false);assert.equal(document.querySelector('.social-gallery').hidden,true);document.querySelector('.place-tab').click();assert.equal(document.querySelector('.social-gallery').hidden,false);assert.equal(document.querySelectorAll('.social-gallery iframe').length,0);const load=[...document.querySelectorAll('.social-gallery button')].find(b=>b.textContent.includes('Load Instagram'));assert.ok(load);load.click();assert.equal(document.querySelectorAll('.social-gallery iframe').length,1);
 assert.ok(document.querySelector('.social-gallery a').href.startsWith('https://www.instagram.com/'));
 const areaButton=document.querySelector('[data-area="vic-port-phillip"]');areaButton.click();await waitFor(()=>$('place-title').textContent==='Port Phillip Bay'&&!$('measure-start').disabled);assert.equal($('explorer').hidden,false);assert.equal($('empty-state').hidden,true,'Area overview retains published contours instead of loading its empty directory layer');assert.equal($('survey-select').value,'port-phillip');
 $('survey-select').value='bondi';$('survey-select').dispatchEvent(new window.Event('change'));await waitFor(()=>$('place-title').textContent==='Sydney Eastern Beaches'&&!$('measure-start').disabled);assert.equal($('explorer').hidden,false);assert.equal($('empty-state').hidden,true);
 assert.equal(document.body.textContent.toLowerCase().includes('public transport'),false);
 console.log('Application DOM checks passed: sorted area tree, lazy data, beach selection, source-checked stays, comparison, guides, restriction facts and opt-in social embeds.');
}finally{globalThis.fetch=originalFetch;await window.happyDOM.close();}
