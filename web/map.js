import {activity,resourceLabel} from './activity.js';
import {ContourRenderer,cachedTile,coversView} from './render-cache.js';
import {OCEAN_COLOUR,contourColour,shoreTile} from './map-style.js';
import {surfaceForRegion,surfaceURL,loadSurface} from './surfaces.js';
// Local numeric data and contours, with opt-out publisher imagery for display.
import {clusterDataPins,visibleDataPins} from './data-pins.js';
const EMPTY_FEATURES=[];
export const R = 6378137, HALF = Math.PI * R;
export function project([lon,lat], z) {
  const size=256*2**z, clamped=Math.max(-85.05112878,Math.min(85.05112878,lat));
  return [(lon+180)/360*size,(1-Math.log(Math.tan(Math.PI/4+clamped*Math.PI/360))/Math.PI)/2*size];
}
export function unproject([x,y],z) {const size=256*2**z;return [x/size*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/size)))*180/Math.PI];}
export class DepthMap {
  constructor(canvas) {
    this.active=true;this.touchPoints=new Map();this.pendingTiles=[];this.tileActive=0;this.viewEpoch=0;this.ready=false;this.imageLimit=globalThis.matchMedia?.('(max-width:700px)').matches?128:256;this.canvas=canvas;this.ctx=canvas.getContext('2d');this.center=[144.86,-38.08];this.zoom=10;
    this.layers={depth:true,contours:true,context:true,pins:false,coverage:false,basemap:true,measurement:true};this.contours=[];this.contextContours=[];this.contextSource=null;this.derived=[];this.sourcePins=[];this.pinGroups=new Map();this.pinHits=[];this.line=[];this.rasters=[];this.images=new Map();this.region='port-phillip';this.pointPicking=false;this.measurement=null;this.beaches=[];this.beachHits=[];this.stays=[];this.stayHits=[];this.coastline=[];this.areaZones=[];this.areaHits=[];this.hoveredAreaId=null;
    new ResizeObserver(()=>this.resize()).observe(canvas);
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;canvas.setPointerCapture(e.pointerId);if(e.pointerType==='touch'){this.touchPoints.set(e.pointerId,[e.offsetX,e.offsetY]);if(this.touchPoints.size>=2){const [a,b]=[...this.touchPoints.values()],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];this.pinch={distance:Math.max(1,Math.hypot(b[0]-a[0],b[1]-a[1])),zoom:this.zoom,anchor:this.fromScreen(mid)};this.touchWasPinch=true;this.drag=null;return;}}this.drag={x:e.offsetX,y:e.offsetY,start:project(this.center,this.zoom),distance:0};});
    canvas.addEventListener('pointermove',e=>{const point=[e.offsetX,e.offsetY];if(e.pointerType==='touch'&&this.touchPoints.has(e.pointerId)){this.touchPoints.set(e.pointerId,point);if(this.pinch&&this.touchPoints.size>=2){const [a,b]=[...this.touchPoints.values()],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],size=Math.max(1,Math.hypot(b[0]-a[0],b[1]-a[1]));this.zoom=Math.max(5,Math.min(20,this.pinch.zoom+Math.round(Math.log2(size/this.pinch.distance))));const anchor=project(this.pinch.anchor,this.zoom);this.center=unproject([anchor[0]-mid[0]+this.width/2,anchor[1]-mid[1]+this.height/2],this.zoom);this.schedule();return;}}this.onmove?.(this.fromScreen(point));const stay=this.pointPicking?null:this.hitStay(...point),beach=this.pointPicking?null:this.hitBeach(...point),pin=this.pointPicking?null:this.hitDataPin(...point),area=this.pointPicking||this.drag||e.pointerType==='touch'?null:this.hitArea(...point);const hoverId=area?.id||null;if(hoverId!==this.hoveredAreaId){this.hoveredAreaId=hoverId;this.schedule();}canvas.title=stay?`${stay.name} — nearby stay`:beach?`${beach.name} — open beach summary`:area?`${area.name} · approximate coastal area`:pin?(pin.members.length>1?`${pin.members.length} data records — click to zoom or choose a record`:pin.kind==='contour'?`${pin.feature.properties.depth_m} m contour — click for source details`:'Raster data — click for details'):'';if(canvas.style)canvas.style.cursor=stay||beach||pin?'pointer':area?'help':'crosshair';if(!this.drag)return;const dx=point[0]-this.drag.x,dy=point[1]-this.drag.y;this.drag.distance=Math.max(this.drag.distance,Math.hypot(dx,dy));if(this.drag.distance>4){this.center=unproject([this.drag.start[0]-dx,this.drag.start[1]-dy],this.zoom);this.schedule();}});
    canvas.addEventListener('pointerleave',()=>{if(this.hoveredAreaId){this.hoveredAreaId=null;this.schedule();}canvas.title='';if(canvas.style)canvas.style.cursor='crosshair';});
    canvas.addEventListener('pointerup',e=>{if(e.pointerType==='touch'){this.touchPoints.delete(e.pointerId);if(this.pinch||this.touchWasPinch){this.pinch=null;this.drag=null;if(!this.touchPoints.size)this.touchWasPinch=false;this.schedule();this.onview?.();return;}}if(!this.drag)return;const moved=this.drag.distance;this.drag=null;if(moved<5){const stay=this.pointPicking?null:this.hitStay(e.offsetX,e.offsetY);if(stay){this.onStay?.(stay);return;}const beach=this.pointPicking?null:this.hitBeach(e.offsetX,e.offsetY);if(beach){this.onBeach?.(beach);return;}const pin=this.pointPicking?null:this.hitDataPin(e.offsetX,e.offsetY);if(pin){this.onclick?.(pin.point,pin.feature,pin);return;}const area=this.pointPicking?null:this.hitArea(e.offsetX,e.offsetY);if(area&&(area.id!==this.focusedAreaId||this.zoom<=10)){this.onArea?.(area);return;}this.onclick?.(this.fromScreen([e.offsetX,e.offsetY]),this.hitContour(e.offsetX,e.offsetY),null);}else{this.schedule();this.onview?.();}});
    canvas.addEventListener('pointercancel',e=>{if(e?.pointerType==='touch')this.touchPoints.delete(e.pointerId);this.pinch=null;this.touchWasPinch=this.touchPoints.size>0;this.drag=null;this.schedule();this.onview?.();});
    canvas.addEventListener('wheel',e=>{e.preventDefault();if(this.wheelTime&&Date.now()-this.wheelTime<100)return;this.wheelTime=Date.now();this.zoomBy(e.deltaY<0?1:-1,[e.offsetX,e.offsetY]);},{passive:false});
    canvas.addEventListener('keydown',e=>{const shifts={ArrowLeft:[-80,0],ArrowRight:[80,0],ArrowUp:[0,-80],ArrowDown:[0,80]};if(shifts[e.key]){e.preventDefault();const p=project(this.center,this.zoom),d=shifts[e.key];this.center=unproject([p[0]+d[0],p[1]+d[1]],this.zoom);this.draw();this.onview?.();}else if(e.key==='+'||e.key==='=')this.zoomBy(1);else if(e.key==='-')this.zoomBy(-1);});
  }
  setActive(active){if(this.active===active)return;this.active=active;if(!active){this.cancelSurface();this.viewEpoch++;this.pruneTiles();}else{this.resize();this.schedule();}}
  cancelGesture(){for(const id of this.touchPoints.keys()){try{if(this.canvas.hasPointerCapture?.(id))this.canvas.releasePointerCapture(id);}catch{}}this.touchPoints.clear();this.pinch=null;this.touchWasPinch=false;this.drag=null;this.schedule();this.onview?.();}
  resize(){const width=this.canvas.clientWidth,height=this.canvas.clientHeight,ratio=Math.min(2,devicePixelRatio||1),scaleBottom=Math.max(53,Math.ceil((this.canvas.parentElement?.querySelector('.map-bottom')?.getBoundingClientRect().height||0)+18));if(this.width===width&&this.height===height&&this.pixelRatio===ratio&&this.scaleBottom===scaleBottom)return;this.scaleBottom=scaleBottom;this.width=width;this.height=height;this.pixelRatio=ratio;this.canvas.width=width*ratio;this.canvas.height=height*ratio;this.ctx.setTransform(ratio,0,0,ratio,0,0);this.schedule();}
  toScreen(point){const p=project(point,this.zoom),c=project(this.center,this.zoom);return [p[0]-c[0]+this.width/2,p[1]-c[1]+this.height/2];}
  fromScreen(point){const c=project(this.center,this.zoom);return unproject([c[0]+point[0]-this.width/2,c[1]+point[1]-this.height/2],this.zoom);}
  bounds(){const a=this.fromScreen([0,this.height]),b=this.fromScreen([this.width,0]);return [...a,...b];}
  setRegion(region,view={}){this.ready=true;this.region=region.id;this.center=view.center||region.center;this.zoom=view.zoom||region.zoom;this.rasters=region.rasters;this.tileFiles=region.tiles||{};this.tileMaxZoom=region.tile_max_zoom||this.zoom;this.contours=[];this.contextContours=[];this.contextSource=null;this.derived=[];this.setDataPins([]);this.line=[];this.marker=null;this.measurement=null;this.coastline=[];this.stays=[];this.stayHits=[];this.hoveredAreaId=null;this.contourRenderer?.clear();this.surfaceController?.abort();this.surface=surfaceForRegion(region);this.surfaceState=null;this.surfaceImage=null;this.surfaceKey=null;this.surfaceRequest=(this.surfaceRequest||0)+1;clearTimeout(this.surfaceTimer);this.draw();}
  setDataPins(pins){this.sourcePins=pins;this.pinGroups.clear();this.pinHits=[];}
  fitPoints(points,padding=70){if(!points.length||!this.width||!this.height)return;const projected=points.map(p=>project(p,0)),xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);this.center=unproject([(left+right)/2,(top+bottom)/2],0);const scale=Math.min(Math.max(40,this.width-padding*2)/Math.max(right-left,.00001),Math.max(40,this.height-padding*2)/Math.max(bottom-top,.00001));this.zoom=Math.max(5,Math.min(20,Math.floor(Math.log2(scale))));this.draw();this.onview?.();}
  zoomBy(delta,anchor=[this.width/2,this.height/2]){const before=this.fromScreen(anchor);const z=Math.max(5,Math.min(20,this.zoom+delta));if(z===this.zoom)return;this.zoom=z;const p=project(before,z);this.center=unproject([p[0]-anchor[0]+this.width/2,p[1]-anchor[1]+this.height/2],z);this.draw();this.onview?.();}
  image(url,basemap=false,priority=0){
    if(this.images.has(url)){const cached=this.images.get(url);cached.epoch=this.viewEpoch;cached.priority=priority;this.images.delete(url);this.images.set(url,cached);return cached;}
    const image=new Image();image.crossOrigin='anonymous';image.epoch=this.viewEpoch;image.priority=priority;this.pendingTiles.push({image,url,basemap});this.images.set(url,image);
    if(this.images.size>this.imageLimit){const oldest=[...this.images].find(([,item])=>item.naturalWidth||item.failed);if(oldest)this.images.delete(oldest[0]);}
    if(!this.tileTimer)this.tileTimer=setTimeout(()=>{this.tileTimer=null;this.pumpTiles();},24);return image;
  }
  pruneTiles(){
    this.pendingTiles=this.pendingTiles.filter(job=>{if(job.image.epoch===this.viewEpoch)return true;if(this.images.get(job.url)===job.image)this.images.delete(job.url);return false;}).sort((a,b)=>a.image.priority-b.image.priority);activity.queue(this.pendingTiles.length);
  }
  pumpTiles(){
    if(this.active===false)return;
    this.pruneTiles();
    while(this.tileActive<6&&this.pendingTiles.length){const {image,url,basemap}=this.pendingTiles.shift(),task=activity.begin({url,...resourceLabel(url)});this.tileActive++;
      const settled=()=>{this.tileActive--;this.schedule();this.pumpTiles();};
      image.onload=()=>{task.finish();if(basemap){try{image.styled=shoreTile(image);this.shoreRevision=(this.shoreRevision||0)+1;}catch{image.styled=null;}}settled();};
      image.onerror=()=>{task.finish({state:'error',error:'Image unavailable'});image.failed=true;if(basemap){if(!this.basemapError){this.basemapError=true;this.onerror?.('Shore basemap unavailable. Check your connection; any context coastline shown is approximate.');}}else this.onerror?.('A published depth tile could not be loaded. Refresh the page or check the dataset build.');settled();};image.src=url;
    }
    activity.queue(this.pendingTiles.length);
  }
  cancelSurface(){clearTimeout(this.surfaceTimer);this.surfaceController?.abort();this.surfaceRequest++;this.surfaceKey=null;this.surfaceState=this.surfaceImage?'ready':null;this.onsurface?.();}
  queueSurface(){
    if(this.active===false)return;
    if(!this.surface||!this.layers.depth||!this.width||this.zoom<this.surface.minZoom){if(this.surfaceState==='loading')this.cancelSurface();return;}if(this.drag||this.pinch)return;
    if(coversView(this.surfaceImage,this.bounds(),this.zoom)){if(this.surfaceState==='loading'){clearTimeout(this.surfaceTimer);this.surfaceController?.abort();this.surfaceRequest++;this.surfaceKey=null;this.surfaceState='ready';this.onsurface?.();}return;}
    const padding=128,bounds=[...this.fromScreen([-padding,this.height+padding]),...this.fromScreen([this.width+padding,-padding])],zoom=this.zoom,url=surfaceURL(this.surface,bounds,this.width+padding*2,this.height+padding*2);if(url===this.surfaceKey)return;
    this.surfaceController?.abort();this.surfaceKey=url;const request=++this.surfaceRequest;clearTimeout(this.surfaceTimer);this.surfaceState='loading';this.onsurface?.();
    this.surfaceTimer=setTimeout(async()=>{const controller=new AbortController();this.surfaceController=controller;try{const image=await loadSurface(this.surface,url,{signal:controller.signal});if(request!==this.surfaceRequest)return;this.surfaceImage={image,bounds,zoom};this.surfaceState='ready';this.onsurface?.();this.schedule();}catch(error){if(request!==this.surfaceRequest||error.name==='AbortError')return;this.surfaceState='error';this.onsurface?.();this.schedule();}},240);
  }
  drawSurface(){
    const snapshot=this.surfaceImage;if(!snapshot||!this.layers.depth)return;
    if(!snapshot.composed||snapshot.revision!==this.shoreRevision){
      const {image,bounds,zoom}=snapshot,overlay=snapshot.composed??=document.createElement('canvas'),mask=snapshot.mask??=document.createElement('canvas');
      for(const canvas of [overlay,mask])if(canvas.width!==image.width||canvas.height!==image.height){canvas.width=image.width;canvas.height=image.height;}
      const c=overlay.getContext('2d'),m=mask.getContext('2d'),a=project([bounds[0],bounds[3]],zoom),b=project([bounds[2],bounds[1]],zoom),sx=image.width/(b[0]-a[0]),sy=image.height/(b[1]-a[1]);
      c.globalCompositeOperation='source-over';c.clearRect(0,0,image.width,image.height);c.drawImage(image,0,0);
      for(let x=Math.floor(a[0]/256);x<=Math.floor(b[0]/256);x++)for(let y=Math.floor(a[1]/256);y<=Math.floor(b[1]/256);y++){const tile=cachedTile(this.images,zoom,x,y);if(tile?.image.styled?.waterMask){const dx=(x*256-a[0])*sx,dy=(y*256-a[1])*sy;m.clearRect(dx,dy,257*sx,257*sy);m.drawImage(tile.image.styled.waterMask,tile.sx,tile.sy,tile.sw,tile.sh,dx,dy,257*sx,257*sy);}}
      c.globalCompositeOperation='destination-in';c.drawImage(mask,0,0);snapshot.revision=this.shoreRevision;
    }
    const a=this.toScreen([snapshot.bounds[0],snapshot.bounds[3]]),b=this.toScreen([snapshot.bounds[2],snapshot.bounds[1]]);this.ctx.drawImage(snapshot.composed,...a,b[0]-a[0],b[1]-a[1]);
  }
  schedule(){if(this.frame)return;this.frame=(globalThis.requestAnimationFrame||(callback=>setTimeout(callback,16)))(()=>{this.frame=null;this.draw();});}
  draw(){if(this.active===false||!this.width||!this.ready)return;const started=performance.now(),c=this.ctx,w=this.width,h=this.height;c.imageSmoothingEnabled=true;c.clearRect(0,0,w,h);c.fillStyle=OCEAN_COLOUR;c.fillRect(0,0,w,h);
    const center=project(this.center,this.zoom),left=center[0]-w/2,top=center[1]-h/2;
    const viewKey=`${this.region}/${this.zoom}/${left}/${top}/${w}/${h}/${this.layers.basemap}/${this.layers.depth}`;if(this.viewKey!==viewKey){this.viewKey=viewKey;this.viewEpoch++;this.pruneTiles();}
    let basemapTiles=0,currentTiles=0,totalTiles=0;this.queueSurface();
    if(this.layers.basemap&&this.baseFrame){const a=this.toScreen([this.baseFrame.bounds[0],this.baseFrame.bounds[3]]),b=this.toScreen([this.baseFrame.bounds[2],this.baseFrame.bounds[1]]);if(b[0]>=0&&b[1]>=0&&a[0]<=w&&a[1]<=h)c.drawImage(this.baseFrame.canvas,...a,b[0]-a[0],b[1]-a[1]);}
    for(let x=Math.floor(left/256);x<=Math.floor((left+w)/256);x++)for(let y=Math.floor(top/256);y<=Math.floor((top+h)/256);y++){
      if(x<0||y<0||x>=2**this.zoom||y>=2**this.zoom)continue;totalTiles++;const dx=x*256-left,dy=y*256-top;
      if(this.layers.basemap||(this.surface&&this.layers.depth)){const current=this.image(`https://tile.openstreetmap.org/${this.zoom}/${x}/${y}.png`,true,Math.hypot(dx+128-w/2,dy+128-h/2));if(current.complete&&current.naturalWidth)currentTiles++;const tile=cachedTile(this.images,this.zoom,x,y);if(tile){if(this.layers.basemap)c.drawImage(tile.image.styled||tile.image,tile.sx,tile.sy,tile.sw,tile.sh,Math.floor(dx),Math.floor(dy),257,257);basemapTiles++;}}
      if(this.layers.depth&&this.rasters.length){const z=Math.min(this.zoom,this.tileMaxZoom),factor=2**(this.zoom-z),sx=Math.floor(x/factor),sy=Math.floor(y/factor),file=this.tileFiles?.[`${z}/${sx}/${sy}`];if(file){const image=this.image(new URL(file,this.dataBase||new URL('./',import.meta.url)).href);if(image.complete&&image.naturalWidth){c.imageSmoothingEnabled=false;c.drawImage(image,(x%factor)*256/factor,(y%factor)*256/factor,256/factor,256/factor,Math.floor(dx),Math.floor(dy),257,257);}}}
    }
    const baseKey=`${this.zoom}/${left}/${top}/${w}/${h}`;
    if(this.layers.basemap&&!this.rasters.length&&!this.drag&&totalTiles&&currentTiles===totalTiles&&this.baseFrame?.key!==baseKey){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(this.canvas,0,0,w,h);this.baseFrame={canvas,bounds:this.bounds(),key:baseKey};}
    c.imageSmoothingEnabled=true;this.drawSurface();
    if((!this.layers.basemap||!basemapTiles)&&this.coastline?.length){c.save();c.strokeStyle='#a8bdce';c.lineWidth=1.5;c.beginPath();for(const line of this.coastline){line.map(p=>this.toScreen(p)).forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));}c.stroke();c.restore();}
    if(this.layers.coverage){c.save();c.setLineDash([5,4]);c.strokeStyle='#715c42';c.lineWidth=1.5;for(const r of this.rasters){const a=this.toScreen([r.bounds[0],r.bounds[3]]),b=this.toScreen([r.bounds[2],r.bounds[1]]);c.strokeRect(...a,b[0]-a[0],b[1]-a[1]);}c.restore();}
    if(this.layers.contours||this.layers.context){this.contourRenderer??=new ContourRenderer(()=>this.schedule());this.contourRenderer.update(this.layers.context?this.contextContours:EMPTY_FEATURES,this.layers.contours?this.contours:EMPTY_FEATURES,this.layers.contours?this.derived:EMPTY_FEATURES);this.contourRenderer.draw(c,{left,top,zoom:this.zoom,width:w,height:h,shaded:!!(this.surfaceImage&&this.layers.depth)});}
    this.drawAreaZones(left,top);
    if(this.line.length){c.strokeStyle='#d59143';c.lineWidth=2.5;c.beginPath();this.line.map(p=>this.toScreen(p)).forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();for(const p of this.line){const [x,y]=this.toScreen(p);c.fillStyle='#fff';c.strokeStyle='#c17a30';c.lineWidth=2;c.beginPath();c.arc(x,y,4,0,Math.PI*2);c.fill();c.stroke();}}
    if(this.marker){const [x,y]=this.toScreen(this.marker);c.strokeStyle='#b57028';c.fillStyle='#fff';c.lineWidth=2;c.beginPath();c.arc(x,y,6,0,Math.PI*2);c.fill();c.stroke();}
    if(this.measurement&&this.layers.measurement){const m=this.measurement,a=this.toScreen(m.start),b=this.toScreen(m.target);c.save();c.strokeStyle='#b96524';c.lineWidth=2.5;c.setLineDash([7,5]);c.beginPath();c.moveTo(...a);c.lineTo(...b);c.stroke();c.setLineDash([]);for(const [i,p] of [a,b].entries()){c.fillStyle=i?'#b96524':'#fff';c.beginPath();c.arc(...p,6,0,Math.PI*2);c.fill();c.stroke();}const label=`${(m.distance_m/1000).toFixed(2)} km to ${m.depth_m} m contour`,mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];c.font='bold 11px system-ui';const tw=c.measureText(label).width;c.fillStyle='#fffffff2';c.fillRect(mid[0]-tw/2-7,mid[1]-24,tw+14,21);c.fillStyle='#8e4c1d';c.textAlign='center';c.fillText(label,mid[0],mid[1]-9);c.restore();}
    this.beachHits=[];c.save();for(const beach of this.beaches||[]){const [x,y]=this.toScreen(beach.entry?.point||beach.point);if(x<0||y<0||x>w||y>h)continue;this.beachHits.push({x,y,beach});c.fillStyle=this.selectedBeach===beach.id?'#b96524':'#176d60';c.strokeStyle='#fff';c.lineWidth=2;c.beginPath();c.arc(x,y,7,0,Math.PI*2);c.fill();c.stroke();if(this.zoom>=13){c.font='bold 10px system-ui';c.lineWidth=3;c.strokeStyle='#fff';c.strokeText(beach.name,x+11,y+3);c.fillStyle='#17594e';c.fillText(beach.name,x+11,y+3);}}c.restore();
    this.stayHits=[];c.save();for(const stay of this.stays||[]){const [x,y]=this.toScreen(stay.point);if(x<0||y<0||x>w||y>h)continue;this.stayHits.push({x,y,stay});c.fillStyle=stay.verified?'#98601d':'#8b8e78';c.strokeStyle='#fff';c.lineWidth=2;c.beginPath();c.moveTo(x,y-9);c.lineTo(x-8,y+6);c.lineTo(x+8,y+6);c.closePath();c.fill();c.stroke();if(this.zoom>=14){c.font='10px system-ui';c.lineWidth=3;c.strokeStyle='#fff';c.strokeText(stay.name,x+11,y+3);c.fillStyle='#745220';c.fillText(stay.name,x+11,y+3);}}c.restore();
    if(this.layers.pins&&!this.pinGroups.has(this.zoom))this.pinGroups.set(this.zoom,clusterDataPins(this.sourcePins,p=>project(p,this.zoom)));
    this.pinHits=this.layers.pins?visibleDataPins(this.pinGroups.get(this.zoom),p=>this.toScreen(p),w,h):[];
    c.save();for(const pin of this.pinHits){const {x,y,members}=pin,count=members.length;c.fillStyle=pin.kind==='footprint'?'#8b795f':'#135e64';c.strokeStyle='#fff';c.lineWidth=2;if(count>1){c.beginPath();c.arc(x,y-17,19,0,Math.PI*2);c.fillStyle='#135e6426';c.fill();c.fillStyle='#135e64';c.beginPath();c.arc(x,y-17,14,0,Math.PI*2);c.fill();c.stroke();}else{c.beginPath();c.moveTo(x,y);c.lineTo(x-10,y-13);c.arc(x,y-17,13,Math.PI*.9,Math.PI*2.1);c.closePath();c.fill();c.stroke();}c.fillStyle='#fff';c.font='bold 10px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(count>1?(count>=1000?`${(count/1000).toFixed(1)}k`:String(count)):'•',x,y-17);}c.restore();
    const metresPerPixel=2*Math.PI*R*Math.cos(this.center[1]*Math.PI/180)/(256*2**this.zoom),ideal=100*metresPerPixel,magnitude=10**Math.floor(Math.log10(ideal)),length=[1,2,5,10].map(x=>x*magnitude).find(x=>x>=ideal)||magnitude*10,pixels=length/metresPerPixel;
    c.fillStyle='#bed2e8';c.font='9px system-ui';const scaleY=h-(this.scaleBottom||53);c.fillText(length>=1000?`${length/1000} km`:`${length} m`,17,scaleY);c.fillRect(17,scaleY+7,pixels,2);c.fillRect(17,scaleY+3,1,6);c.fillRect(17+pixels,scaleY+3,1,6);activity.frame(performance.now()-started);
  }
  hitStay(x,y){return (this.stayHits||[]).slice().reverse().find(p=>Math.hypot(p.x-x,p.y-y)<=12)?.stay||null;}
  hitBeach(x,y){return (this.beachHits||[]).slice().reverse().find(p=>Math.hypot(p.x-x,p.y-y)<=12)?.beach||null;}
  drawAreaZones(left,top){
    this.areaHits=[];
    if(!this.areaZones?.length)return;
    const view=this.bounds(),visible=this.areaZones.filter(zone=>zone.bounds[0]<=view[2]&&zone.bounds[2]>=view[0]&&zone.bounds[1]<=view[3]&&zone.bounds[3]>=view[1]);
    if(!visible.length)return;
    const w=this.width,h=this.height;
    this.areaCanvas??=document.createElement('canvas');this.areaMaskCanvas??=document.createElement('canvas');this.areaOverlayCanvas??=document.createElement('canvas');this.areaEdgesCanvas??=document.createElement('canvas');
    for(const canvas of [this.areaCanvas,this.areaMaskCanvas,this.areaOverlayCanvas,this.areaEdgesCanvas])if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;this.areaMaskKey=null;}
    const prepared=[];for(const zone of visible){
      const rings=(zone.polygons||[]).map(ring=>ring.map(point=>this.toScreen(point))),points=rings.flat(),xs=points.map(point=>point[0]),ys=points.map(point=>point[1]),bounds=[Math.min(...xs)-2,Math.min(...ys)-2,Math.max(...xs)+2,Math.max(...ys)+2];
      if(bounds[2]<0||bounds[3]<0||bounds[0]>w||bounds[1]>h)continue;
      const hit={zone,rings,bounds};prepared.push(hit);this.areaHits.push(hit);
    }
    if(!prepared.length)return;
    const mask=this.areaMaskCanvas,key=`${this.zoom}/${left}/${top}/${w}/${h}/${this.shoreRevision||0}`;
    if(key!==this.areaMaskKey){
      const maskCtx=mask.getContext('2d');maskCtx.clearRect(0,0,w,h);
      for(let x=Math.floor(left/256);x<=Math.floor((left+w)/256);x++)for(let y=Math.floor(top/256);y<=Math.floor((top+h)/256);y++){
        const tile=cachedTile(this.images,this.zoom,x,y),waterMask=tile?.image.styled?.waterMask;if(!waterMask)continue;
        const dx=x*256-left,dy=y*256-top;maskCtx.drawImage(waterMask,tile.sx,tile.sy,tile.sw,tile.sh,dx,dy,257,257);
      }
      this.areaMaskKey=key;
    }
    const shape=this.areaCanvas,shapeCtx=shape.getContext('2d'),overlay=this.areaOverlayCanvas,overlayCtx=overlay.getContext('2d'),edges=this.areaEdgesCanvas,edgesCtx=edges.getContext('2d');
    const drawRings=(context,zones,stroke=false,clipWater=true)=>{
      context.clearRect(0,0,w,h);context.save();context.fillStyle='#fff';context.strokeStyle='#fff';context.lineWidth=1.5;context.lineJoin='round';context.lineCap='round';
      for(const hit of zones){context.beginPath();for(const ring of hit.rings){if(ring.length<3)continue;context.moveTo(...ring[0]);for(let i=1;i<ring.length;i++)context.lineTo(...ring[i]);context.closePath();}if(stroke)context.stroke();else context.fill('evenodd');}
      if(clipWater){context.globalCompositeOperation='destination-in';context.drawImage(mask,0,0);}context.restore();
    };
    const tint=(zones,fill,edge)=>{
      drawRings(shapeCtx,zones);overlayCtx.clearRect(0,0,w,h);overlayCtx.fillStyle=fill;overlayCtx.fillRect(0,0,w,h);overlayCtx.save();overlayCtx.globalCompositeOperation='destination-in';overlayCtx.drawImage(shape,0,0);overlayCtx.restore();this.ctx.drawImage(overlay,0,0,w,h);
      drawRings(edgesCtx,zones,true,false);overlayCtx.clearRect(0,0,w,h);overlayCtx.fillStyle=edge;overlayCtx.fillRect(0,0,w,h);overlayCtx.save();overlayCtx.globalCompositeOperation='destination-in';overlayCtx.drawImage(edges,0,0);overlayCtx.restore();this.ctx.drawImage(overlay,0,0,w,h);
    };
    tint(prepared,'rgba(67,157,190,.14)','rgba(185,235,239,.55)');
    const active=prepared.filter(hit=>hit.zone.id===this.hoveredAreaId||hit.zone.id===this.focusedAreaId);if(active.length)tint(active,'rgba(64,211,220,.30)','rgba(223,255,245,.98)');
  }
  isWaterAtScreen(x,y){
    const world=project(this.fromScreen([x,y]),this.zoom),tileX=Math.floor(world[0]/256),tileY=Math.floor(world[1]/256),tile=cachedTile(this.images,this.zoom,tileX,tileY),styled=tile?.image.styled;
    if(!styled?.waterPixels)return false;
    const width=styled.width||256,height=styled.height||256,px=Math.max(0,Math.min(width-1,Math.floor(tile.sx+(world[0]-tileX*256)/256*tile.sw))),py=Math.max(0,Math.min(height-1,Math.floor(tile.sy+(world[1]-tileY*256)/256*tile.sh)));
    return styled.waterPixels[py*width+px]===1;
  }
  hitArea(x,y){
    for(const hit of [...this.areaHits].reverse()){
      const [left,top,right,bottom]=hit.bounds;if(x<left||x>right||y<top||y>bottom)continue;
      let inside=false;for(const ring of hit.rings){for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}}
      if(inside)return hit.zone;
    }
    return null;
  }
  hitDataPin(x,y){if(!this.layers.pins)return null;return this.pinHits.slice().reverse().find(pin=>Math.hypot(pin.x-x,pin.y-17-y)<=17)||null;}
  hitContour(x,y){if(!this.layers.contours&&!this.layers.context)return null;if(this.contourRenderer?.entries.length){const center=project(this.center,this.zoom),hit=this.contourRenderer.hit(x,y,{left:center[0]-this.width/2,top:center[1]-this.height/2,zoom:this.zoom});if(hit?.properties?.coverage_class==='regional-context'&&!this.layers.context)return null;if(hit?.properties?.coverage_class!=='regional-context'&&!this.layers.contours)return null;return hit;}let closest=null,best=7;for(const f of [...(this.layers.context?this.contextContours:[]),...(this.layers.contours?this.contours:[]),...(this.layers.contours?this.derived:[])]){const lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates;for(const line of lines){for(let i=1;i<line.length;i++){const a=this.toScreen(line[i-1]),b=this.toScreen(line[i]),dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/len)):0,d=Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);if(d<best){best=d;closest=f;}}}}return closest;}
}
