import assert from 'node:assert/strict';

// Test map coordinates and interactions without a browser or a listening socket.
const module=await import('../web/map.js');
for(const point of [[151.28,-33.89],[144.86,-38.08],[0,0]])for(const zoom of [5,10,14,20]){
  const roundtrip=module.unproject(module.project(point,zoom),zoom);
  assert.ok(Math.abs(roundtrip[0]-point[0])<1e-9);
  assert.ok(Math.abs(roundtrip[1]-point[1])<1e-9);
}
let observation;
globalThis.ResizeObserver=class{constructor(cb){observation=cb;}observe(){}};
globalThis.devicePixelRatio=1;
const events={};
const canvas={clientWidth:800,clientHeight:500,getContext:()=>({setTransform(){}}),addEventListener:(event,fn)=>events[event]=fn,setPointerCapture(){}};
const map=new module.DepthMap(canvas);assert.equal(map.layers.basemap,true,'The shore and place names are visible by default');map.width=800;map.height=500;map.draw=()=>{};
let changed=0;map.onview=()=>changed++;
const anchor=[150,100],before=map.fromScreen(anchor);map.zoomBy(1,anchor);const after=map.fromScreen(anchor);
assert.ok(Math.abs(before[0]-after[0])<1e-9&&Math.abs(before[1]-after[1])<1e-9);
assert.equal(changed,1);
let clicked=0;map.onclick=()=>clicked++;
events.pointerdown({button:0,pointerId:1,offsetX:100,offsetY:100});
events.pointermove({offsetX:200,offsetY:100});events.pointerup({offsetX:200,offsetY:100});
assert.equal(clicked,0,'Dragging must not inspect or add profile vertices');
events.pointerdown({button:0,pointerId:2,offsetX:300,offsetY:200});events.pointerup({offsetX:300,offsetY:200});
assert.equal(clicked,1);
map.contours=[{properties:{depth_m:10},geometry:{type:'LineString',coordinates:[map.fromScreen([100,100]),map.fromScreen([200,100])]}}];
assert.equal(map.hitContour(150,103).properties.depth_m,10);
assert.equal(map.hitContour(150,120),null);
map.layers.contours=false;assert.equal(map.hitContour(150,103),null);
const pin={point:[151.28,-33.89],x:300,y:200,members:[{kind:'contour'}]};
map.layers.pins=true;map.pinHits=[pin];let selected;
map.onclick=(point,contour,location)=>selected={point,location};
events.pointerdown({button:0,pointerId:3,offsetX:300,offsetY:183});
events.pointerup({offsetX:300,offsetY:183});
assert.deepEqual(selected.point,pin.point,'Pin clicks inspect the actual source coordinate');
assert.equal(selected.location,pin);
map.layers.pins=false;assert.equal(map.hitDataPin(300,183),null);
const beach={id:'test',name:'Test beach'};map.beachHits=[{x:300,y:183,beach}];let beachSelected;map.onBeach=b=>beachSelected=b;events.pointerdown({button:0,pointerId:4,offsetX:300,offsetY:183});events.pointerup({offsetX:300,offsetY:183});assert.equal(beachSelected,beach);
map.pointPicking=true;beachSelected=null;events.pointerdown({button:0,pointerId:5,offsetX:300,offsetY:183});events.pointerup({offsetX:300,offsetY:183});assert.equal(beachSelected,null,'Measurement starts bypass beach pins');
map.pointPicking=false;const stay={id:'test-stay',name:'TEST stay'};map.stayHits=[{x:400,y:200,stay}];let staySelected;map.onStay=s=>staySelected=s;events.pointerdown({button:0,pointerId:6,offsetX:400,offsetY:200});events.pointerup({offsetX:400,offsetY:200});assert.equal(staySelected,stay);
console.log('Map checks passed: projection, anchor zoom, pan/click separation, contour hit testing.');

const {styleShorePixels,contourColour}=await import('../web/map-style.js');
const pixels=new Uint8ClampedArray([170,211,223,255,242,239,233,255,20,20,20,200]);
styleShorePixels(pixels);
assert.deepEqual([...pixels.slice(0,4)],[6,22,46,255]);
assert.ok(pixels[4]>pixels[0]+35,'Land remains visibly lighter than ocean');
assert.ok(pixels[8]>pixels[4],'Place-name text remains lighter than land');
assert.equal(pixels[11],200,'Styling preserves transparency');
assert.notEqual(contourColour(5),contourColour(20));

const placeName=new Uint8ClampedArray([45,84,105,255]);styleShorePixels(placeName);assert.ok(placeName[0]>90,'Blue place-name text stays legible instead of being coloured as water');

const {surfaceForRegion,surfaceURL,recolourSurface}=await import('../web/surfaces.js');
const surface=surfaceForRegion({id:'bondi',rasters:[]});assert.equal(surface.layer,2);assert.equal(surfaceForRegion({id:'tas-southeast',rasters:[]}),null);assert.equal(surfaceForRegion({id:'port-phillip',rasters:[{}]}),null,'Numeric raster packages use their actual grid rendering');
const url=new URL(surfaceURL(surface,[151,-34,152,-33],2000,1000));assert.equal(url.searchParams.get('size'),'1400,700');assert.equal(url.searchParams.get('bboxSR'),'3857');assert.equal(url.searchParams.get('layers'),'show:2');assert.equal(url.searchParams.get('transparent'),'true');const box=url.searchParams.get('bbox').split(',').map(Number);assert.ok(box[0]<box[2]&&box[1]<box[3]);
const surfacePixels=new Uint8ClampedArray([255,0,0,255,0,0,255,127,17,31,43,0]);recolourSurface(surfacePixels,[[255,0,0],[0,0,255]]);assert.deepEqual([...surfacePixels],[174,231,228,255,6,22,46,127,17,31,43,0],'Legend order is recoloured while transparent source gaps stay blank');
map.setRegion({id:'bondi',center:[151,-34],zoom:11,rasters:[]});assert.ok(map.surface);map.surfaceImage={image:{}};map.setRegion({id:'tas-southeast',center:[147,-43],zoom:11,rasters:[]});assert.equal(map.surface,null);assert.equal(map.surfaceImage,null,'Changing regions clears previous imagery');

const controller=new AbortController();map.surfaceController=controller;map.surfaceImage={bounds:[150,-35,152,-33],zoom:12};const retained=map.surfaceImage;map.surfaceState='loading';map.cancelSurface();assert.equal(controller.signal.aborted,true,'Turning shading off cancels network/worker work');assert.equal(map.surfaceImage,retained,'Cancelling an update retains the previous valid view');assert.equal(map.surfaceState,'ready');

const imageInstances=[],networkStarts=[];
globalThis.Image=class{constructor(){this.complete=false;this.naturalWidth=0;imageInstances.push(this);}set src(value){this.url=value;networkStarts.push(value);}get src(){return this.url;}};
const queuedMap=new module.DepthMap(canvas);queuedMap.schedule=()=>{};
for(let i=0;i<10;i++)queuedMap.image(`https://example.test/tile-${i}.png`,false,9-i);
queuedMap.pumpTiles();assert.equal(networkStarts.length,6,'Only six tile requests start concurrently');assert.equal(networkStarts[0],'https://example.test/tile-9.png','Visible centre tiles are prioritised');
queuedMap.viewEpoch++;queuedMap.pruneTiles();assert.equal(queuedMap.pendingTiles.length,0,'Stale queued zooms are discarded before download');assert.equal(networkStarts.length,6);
queuedMap.image('https://example.test/current.png');queuedMap.pumpTiles();assert.equal(networkStarts.length,6,'The concurrency cap also applies across view changes');
let next;while((next=imageInstances.find(image=>image.url&&!image.complete))){next.complete=true;next.naturalWidth=256;next.onload();}
assert.ok(networkStarts.includes('https://example.test/current.png'));assert.equal(networkStarts.length,7,'Superseded queued tiles never use the network');assert.equal(queuedMap.tileActive,0);clearTimeout(queuedMap.tileTimer);delete globalThis.Image;

const touchEvents={},touchCanvas={...canvas,addEventListener:(type,fn)=>touchEvents[type]=fn},touchMap=new module.DepthMap(touchCanvas);touchMap.width=800;touchMap.height=500;touchMap.draw=()=>{};touchMap.zoom=10;let touchClicks=0;touchMap.onclick=()=>touchClicks++;
const anchorBeforePinch=touchMap.fromScreen([350,200]);touchEvents.pointerdown({button:0,pointerType:'touch',pointerId:10,offsetX:300,offsetY:200});touchEvents.pointerdown({button:0,pointerType:'touch',pointerId:11,offsetX:400,offsetY:200});touchEvents.pointermove({pointerType:'touch',pointerId:11,offsetX:500,offsetY:200});assert.equal(touchMap.zoom,11);const anchorAfterPinch=touchMap.fromScreen([400,200]);assert.ok(Math.abs(anchorBeforePinch[0]-anchorAfterPinch[0])<1e-9&&Math.abs(anchorBeforePinch[1]-anchorAfterPinch[1])<1e-9,'Pinch zoom preserves the point between the fingers');touchEvents.pointerup({pointerType:'touch',pointerId:10});touchEvents.pointerup({pointerType:'touch',pointerId:11});assert.equal(touchClicks,0,'A pinch does not select a beach, inspect, or add a profile point');touchEvents.pointerdown({button:0,pointerType:'touch',pointerId:12,offsetX:100,offsetY:100});touchEvents.pointerup({pointerType:'touch',pointerId:12,offsetX:100,offsetY:100});assert.equal(touchClicks,1,'Single-finger taps still work after a pinch');
