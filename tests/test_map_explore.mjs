import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {Window} from 'happy-dom';
import {build} from 'esbuild';
import {places,filterPlaces,pointCollection} from '../design-board/map-explore-data.mjs';
import {SCREENS,screenURL} from '../design-board/screens.mjs';

assert.equal(filterPlaces({category:'business'}).length,3);
assert.deepEqual(filterPlaces({query:'MAYA'}).map(p=>p.id),['shelly-folk']);
assert.equal(filterPlaces({category:'business',query:'maya'}).length,0);
assert.equal(filterPlaces({bounds:{contains:p=>p[1]>-33.82}}).length,5);
const points=pointCollection(places);
assert.equal(points.features.length,10);
assert.equal(points.features.find(p=>p.properties.id==='shelly').properties.count,3);
assert.equal(points.features.reduce((n,f)=>n+f.properties.count,0),places.length);
assert.ok(SCREENS.some(s=>s.id==='map-explore'));
assert.match(screenURL('map-explore'),/\/board\/map-explore.html/);

// Exercise the actual UI and map adapter without network, WebGL or a listening port.
const window=new Window({url:'http://localhost:8770/board/map-explore.html'});
window.document.write(await readFile(new URL('../design-board/map-explore.html',import.meta.url),'utf8'));
const source=await readFile(new URL('../design-board/map-explore.js',import.meta.url),'utf8');
const bundle=await build({stdin:{contents:source.replace("import './preview-bridge.js';",''),resolveDir:new URL('../design-board',import.meta.url).pathname},bundle:true,write:false,format:'iife',platform:'browser'});
class MapMock{
 constructor(options){this.options=options;this.events={};this.sources={};this.layers=[];this.camera=[];this.canvas={style:{}};}
 on(name,layer,handler){if(typeof layer==='function')this.events[name]=layer;else this.events[name+':'+layer]=handler;}
 addControl(){} getZoom(){return 11;} getContainer(){return {clientHeight:800};}
 addSource(id,source){this.sources[id]={...source,setData(data){this.data=data;},getClusterExpansionZoom:async()=>14};}
 getSource(id){return this.sources[id];} addLayer(layer){this.layers.push(layer);}
 getStyle(){return {layers:this.layers};} setPaintProperty(){} setLayoutProperty(){}
 getCanvas(){return this.canvas;} easeTo(options){this.camera.push(options);} fitBounds(bounds,options){this.fit={bounds,options};}
 getBounds(){return {contains:p=>p[1]>-33.82};}
}
class MarkerMock{setLngLat(){return this;}addTo(){return this;}remove(){}}
class BoundsMock{extend(){return this;}}
const context={window,document:window.document,location:window.location,localStorage:window.localStorage,URL,crypto,matchMedia:()=>({matches:false}),setTimeout:()=>1,clearTimeout(){},maplibregl:{Map:MapMock,Marker:MarkerMock,LngLatBounds:BoundsMock,NavigationControl:class{}}};
vm.runInNewContext(bundle.outputFiles[0].text,context);
const doc=window.document,click=selector=>doc.querySelector(selector).click();
const map=context.finfolkMapStudy.map;
map.events.load();
assert.equal(doc.querySelectorAll('[data-result]').length,13);
assert.equal(map.sources.finfolk.cluster,true);
click('[data-category=business]');assert.equal(doc.querySelectorAll('[data-result]').length,3);
assert.equal(map.sources.finfolk.data.features.length,3);
click('[data-result=school]');assert.equal(doc.querySelector('#detail').hidden,false);
assert.match(doc.querySelector('#detail h2').textContent,/Tidal Freediving/);
assert.equal(map.camera.length,1);
click('[data-category=spot]');assert.equal(doc.querySelector('#detail').hidden,true);
click('[data-result=shelly]');click('[data-associated=shelly-folk]');
assert.equal(doc.querySelectorAll('#detail .avatars img').length,3);
assert.match(doc.querySelector('#detail').textContent,/not current attendance/);
click('.detail-close');assert.equal(doc.querySelector('#detail').hidden,true);
click('#clear-filters');
const query=doc.querySelector('#map-query');query.value='maya';query.dispatchEvent(new window.Event('input'));
assert.equal(doc.querySelectorAll('[data-result]').length,1);
query.value='missing';query.dispatchEvent(new window.Event('input'));assert.ok(doc.querySelector('.empty-results'));
click('[data-clear]');assert.equal(doc.querySelectorAll('[data-result]').length,13);
map.events.movestart({originalEvent:{}});assert.equal(doc.querySelector('#search-area').hidden,false);
click('#search-area');assert.equal(doc.querySelectorAll('[data-result]').length,5);
assert.equal(doc.querySelector('#search-area').hidden,true);
click('#reset-view');assert.equal(doc.querySelectorAll('[data-result]').length,13);
click('#layers-toggle');assert.equal(doc.querySelector('#map-layers').hidden,false);
doc.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(doc.querySelector('#map-layers').hidden,true);
await map.events['click:ff-clusters']({features:[{properties:{cluster_id:1},geometry:{coordinates:[151,-33]}}]});
assert.equal(map.camera.at(-1).zoom,14);
assert.equal(doc.querySelector('#map-status').textContent,'');
await window.happyDOM.close();
console.log('Map study passed: combined filtering, co-located entries, cards and markers, people, empty state, area search, reset, layers and cluster expansion.');
