import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Test map coordinates and interactions without a browser or a listening socket.
const source=await readFile(new URL('../web/map.js',import.meta.url),'utf8');
const module=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
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
const map=new module.DepthMap(canvas);map.width=800;map.height=500;map.draw=()=>{};
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
console.log('Map checks passed: projection, anchor zoom, pan/click separation, contour hit testing.');
