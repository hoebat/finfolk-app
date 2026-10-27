import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
const window=new Window({url:'https://example.test/shore-depth-explorer/'});
window.document.write(await readFile(new URL('../web/index.html',import.meta.url),'utf8'));
const beaches=JSON.parse(await readFile(new URL('../web/beaches.json',import.meta.url),'utf8'));
const regions=JSON.parse(await readFile(new URL('../depth_explorer/regions.json',import.meta.url),'utf8')).map(r=>({...r,rasters:[],tiles:{},contour_file:`data/contours/${r.id}.geojson`,status:'contours',contours:{count:2,datum:r.contour_datum}}));
for(const name of ['document','location','history','Event','MouseEvent','HTMLCanvasElement'])globalThis[name]=window[name];
globalThis.devicePixelRatio=1;globalThis.ResizeObserver=class{observe(){}};
const ctx=new Proxy({measureText:text=>({width:text.length*7})},{get:(target,key)=>target[key]||(()=>{})});
window.HTMLCanvasElement.prototype.getContext=()=>ctx;
const originalFetch=globalThis.fetch;let stepRequests=0;
globalThis.fetch=async url=>{
 const path=new URL(url).pathname;
 if(path.endsWith('/beaches.json'))return new Response(JSON.stringify(beaches));
 if(path.endsWith('/data/catalog.json'))return new Response(JSON.stringify({format_version:1,regions}));
 if(path.endsWith('/data/beach-summaries.json'))return new Response(JSON.stringify({beaches:beaches.beaches.map(b=>({id:b.id,depths:{10:{status:'available',distance_m:350}},datum:'TEST',survey_date:'TEST',start_label:'SYNTHETIC TEST REFERENCE'}))}));
 if(path.endsWith('/data/journeys.json'))return new Response(JSON.stringify({origins:[{id:'test',name:'TEST origin',point:[145,-38]}],dates:['2030-01-05'],journeys:[{beach_id:'greenfield',origin_id:'test',date:'2030-01-05',trip_type:'day',status:'available',valid_until:'2030-01-05',walk_verified:true,walk_max_leg_min:10,walking_min:10,transfers:1,outbound_min:60,time_at_destination_min:300,itinerary_file:'data/journey-itineraries/test.json',return:{duration_min:65}}],sources:[]}));
 if(path.endsWith('/data/journey-itineraries/test.json')){stepRequests++;return stepRequests===1?new Response('',{status:404}):new Response(JSON.stringify({outbound:[{label:'TEST outbound train'}],return_legs:[{label:'TEST return bus'}]}));}
 const region=regions.find(r=>path.endsWith('/'+r.contour_file));
 if(region){const [x,y]=region.center;return new Response(JSON.stringify({features:[0,10].map(depth=>({properties:{depth_m:depth,datum_label:'TEST'},geometry:{type:'LineString',coordinates:[[x-.01,y],[x+.01,y]]}}))}));}
 return new Response('',{status:404});
};
const $=id=>document.getElementById(id),waitFor=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('App condition timed out: '+$('notice').textContent);};
try{
 await import('../web/app.js');await waitFor(()=>$('data-status').textContent==='2 published contours');
 assert.equal(document.querySelectorAll('[data-region]').length,4);
 for(const id of ['profile-tool','profile-panel','raster-legend'])assert.equal($(id).hidden,true,id+' should be hidden without raster data');
 assert.equal($('coverage-layer').closest('label').hidden,true);assert.equal($('interval').closest('label').hidden,true);
 assert.equal($('measure-panel').hidden,false);
 $('beach-search').value='jervis';$('beach-search').dispatchEvent(new window.Event('input'));
 assert.equal(document.querySelectorAll('.beach-card').length,12);
 const greenfield=[...document.querySelectorAll('.beach-open')].find(b=>b.textContent==='Greenfield Beach');assert.ok(greenfield);greenfield.click();
 await waitFor(()=>$('place-title').textContent==='Greenfield Beach');assert.ok($('beach-summary').textContent.includes('Getting there by public transport'));assert.equal(new URL(location.href).searchParams.get('site'),'greenfield');
 $('beach-search').value='edithvale';$('beach-search').dispatchEvent(new window.Event('input'));document.querySelector('.beach-open').click();
 $('beach-search').value='greenfield';$('beach-search').dispatchEvent(new window.Event('input'));document.querySelector('.beach-open').click();
 await new Promise(resolve=>setTimeout(resolve,30));assert.equal($('place-title').textContent,'Greenfield Beach');assert.equal(document.querySelector('.region.active').dataset.region,'jervis-bay','Stale region downloads must not override the latest beach');
 $('beach-search').value='jervis';$('beach-search').dispatchEvent(new window.Event('input'));
 assert.equal(stepRequests,0,'Itinerary detail must not load during search or selection');
 [...$('beach-summary').querySelectorAll('button')].find(b=>b.textContent==='Show journey steps').click();
 await waitFor(()=>$('beach-summary').textContent.includes('Journey steps unavailable'));
 [...$('beach-summary').querySelectorAll('button')].find(b=>b.textContent.includes('retry')).click();
 await waitFor(()=>$('beach-summary').textContent.includes('TEST outbound train'));assert.equal(stepRequests,2);assert.ok($('beach-summary').textContent.includes('TEST return bus'));
 for(let i=0;i<3;i++){const check=[...document.querySelectorAll('.compare-toggle input')].find(c=>!c.checked);check.click();}
 assert.equal(document.querySelectorAll('.compare-card').length,3);assert.ok([...document.querySelectorAll('.compare-toggle input')].filter(c=>!c.checked).every(c=>c.disabled));
 $('transit-filter').click();assert.equal(document.querySelectorAll('.beach-card').length,1);assert.ok($('beach-results').textContent.includes('Greenfield Beach'));
 $('transit-filter').click();$('beach-search').value='';$('beach-search').dispatchEvent(new window.Event('input'));$('state-filter').value='Victoria';$('state-filter').dispatchEvent(new window.Event('change'));assert.ok([...document.querySelectorAll('.beach-card')].every(c=>c.textContent.includes('Victoria')));
 assert.equal($('notice').textContent.includes('Cannot load'),false);
 console.log('Application DOM checks passed: startup, global Jervis Bay search, region selection, deep links, hidden raster controls, three-beach comparison and transport filters.');
}finally{globalThis.fetch=originalFetch;await window.happyDOM.close();}
