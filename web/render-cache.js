import {activity} from './activity.js';
import {OCEAN_COLOUR,contourColour} from './map-style.js';
const EMPTY=[];
export function worldPoint([lon,lat]){lat=Math.max(-85.05112878,Math.min(85.05112878,lat));return [(lon+180)/360*256,(1-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))/Math.PI)/2*256];}
export function intersects(a,b){return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
export function prepareContour(feature){
  const g=feature.geometry,lines=(g.type==='LineString'?[g.coordinates]:g.coordinates).map(line=>line.map(worldPoint));let bounds=[Infinity,Infinity,-Infinity,-Infinity];for(const line of lines)for(const [x,y] of line){bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);}
  return {feature,lines,bounds,origin:[bounds[0],bounds[1]],anchors:lines.filter(l=>l.length).map(l=>l[Math.floor(l.length/2)])};
}
export class ContourRenderer {
  constructor(redraw){this.redraw=redraw;this.cache=new WeakMap();this.entries=[];this.generation=0;}
  clear(){this.generation++;this.context=null;this.features=null;this.derived=null;this.entries=[];}
  update(context,features,derived){
    if(derived===undefined){derived=features;features=context;context=[];}
    context=context.length?context:EMPTY;features=features.length?features:EMPTY;derived=derived.length?derived:EMPTY;
    if(this.context===context&&this.features===features&&this.derived===derived)return;
    if(this.context!==context||this.features!==features)this.entries=[];this.context=context;this.features=features;this.derived=derived;const generation=++this.generation,all=[...context,...features,...derived];if(!all.length){this.entries=[];return;}
    const task=activity.begin({label:'Preparing depth contours',kind:'Rendering'}),entries=[];
    (async()=>{let slice=performance.now();try{for(let i=0;i<all.length;i++){
      if(generation!==this.generation){task.finish({state:'cancelled'});return;}
      const feature=all[i];if(!(feature.properties?.depth_m>=0))continue;let entry=this.cache.get(feature);
      if(!entry){entry=prepareContour(feature);entry.paths=entry.lines.map(line=>{const path=new Path2D();line.forEach(([x,y],i)=>i?path.lineTo(x-entry.origin[0],y-entry.origin[1]):path.moveTo(x-entry.origin[0],y-entry.origin[1]));return path;});this.cache.set(feature,entry);}entries.push(entry);
      if(i%32===0&&performance.now()-slice>5){await new Promise(resolve=>setTimeout(resolve,0));slice=performance.now();}
    }if(generation!==this.generation){task.finish({state:'cancelled'});return;}this.entries=entries;task.finish();this.redraw();}catch(error){task.finish({state:'error',error:error.message});}})();
  }
  draw(c,{left,top,zoom,width,height,shaded}){
    const scale=2**zoom,view=[left/scale,top/scale,(left+width)/scale,(top+height)/scale],visible=this.entries.filter(e=>intersects(e.bounds,view)),labels=[];
    c.save();c.translate(-left,-top);c.scale(scale,scale);c.globalAlpha=shaded ? .38 : .9;
    for(const entry of visible){const depth=entry.feature.properties.depth_m,context=entry.feature.properties.coverage_class==='regional-context';c.strokeStyle=context?'#70c2c1':shaded?'#c7eaf3':contourColour(depth);c.globalAlpha=shaded ? .3 : context ? .42 : .9;c.lineWidth=(context ? .65 : depth%10===0 ? 1.1 : .7)/scale;c.save();if(context)c.setLineDash([2/scale,2/scale]);c.translate(...entry.origin);for(const path of entry.paths)c.stroke(path);c.restore();c.setLineDash([]);}
    c.restore();c.save();c.font='10px system-ui';c.lineWidth=3;c.strokeStyle=OCEAN_COLOUR;c.fillStyle='#d4e6f2';
    for(const entry of visible){if(entry.feature.properties.coverage_class==='regional-context'||labels.length>=65)continue;for(const anchor of entry.anchors){const p=[anchor[0]*scale-left,anchor[1]*scale-top];if(p[0]>45&&p[0]<width-45&&p[1]>80&&p[1]<height-55&&!labels.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<65)){const text=`${entry.feature.properties.depth_m} m`;c.strokeText(text,p[0]+4,p[1]-4);c.fillText(text,p[0]+4,p[1]-4);labels.push(p);break;}}}c.restore();
  }
  hit(x,y,{left,top,zoom}){
    const scale=2**zoom,wx=(x+left)/scale,wy=(y+top)/scale,pad=7/scale,box=[wx-pad,wy-pad,wx+pad,wy+pad];
    for(const contextOnly of [false,true]){let best=pad,hit=null;for(const entry of this.entries){if((entry.feature.properties.coverage_class==='regional-context')!==contextOnly||!intersects(entry.bounds,box))continue;for(const line of entry.lines)for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((wx-a[0])*dx+(wy-a[1])*dy)/len)):0,d=Math.hypot(wx-a[0]-t*dx,wy-a[1]-t*dy);if(d<best){best=d;hit=entry.feature;}}}if(hit)return hit;}return null;
  }
}
// Cached parent tiles provide geographic context while sharper tiles arrive.
export function cachedTile(images,z,x,y){
  for(let delta=0;delta<=4&&z-delta>=0;delta++){const factor=2**delta,px=Math.floor(x/factor),py=Math.floor(y/factor),image=images.get(`https://tile.openstreetmap.org/${z-delta}/${px}/${py}.png`);if(image?.complete&&image.naturalWidth&&!image.failed)return {image,sx:(x%factor)*256/factor,sy:(y%factor)*256/factor,sw:256/factor,sh:256/factor};}return null;
}
export function coversView(snapshot,bounds,zoom){return snapshot?.zoom===zoom&&snapshot.bounds[0]<=bounds[0]&&snapshot.bounds[1]<=bounds[1]&&snapshot.bounds[2]>=bounds[2]&&snapshot.bounds[3]>=bounds[3];}
