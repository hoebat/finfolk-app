import {readResource} from './activity.js';
import {DatasetCache} from './dataset-cache.js';
// Browser-only access to native survey chunks. No service endpoints or range server.
const EARTH=6371008.8;
export function distance(a,b){const l1=a[1]*Math.PI/180,l2=b[1]*Math.PI/180,dl=l2-l1,dn=(b[0]-a[0])*Math.PI/180;return EARTH*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dl/2)**2+Math.cos(l1)*Math.cos(l2)*Math.sin(dn/2)**2)));}
export function validatePoint(p){if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<-180||p[0]>180||p[1]<-85||p[1]>85)throw Error('Coordinates must be finite [longitude, latitude] values');return p;}
export function profileCoordinates(points,resolution){
  if(!Array.isArray(points)||points.length<2||points.length>100)throw Error('A profile needs 2 to 100 vertices');points.forEach(validatePoint);
  const lengths=points.slice(1).map((p,i)=>distance(points[i],p)),total=lengths.reduce((a,b)=>a+b,0);if(total<1||total>150000)throw Error('Profile length must be between 1 m and 150 km');
  const n=Math.max(1,Math.floor(total/Math.max(resolution,total/4999))),coords=[],distances=[];let segment=0,start=0;
  const unit=([lon,lat])=>{lon*=Math.PI/180;lat*=Math.PI/180;return [Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)];};
  for(let i=0;i<=n;i++){const along=total*i/n;while(segment<lengths.length-1&&along>start+lengths[segment]){start+=lengths[segment++];}const t=lengths[segment]?(along-start)/lengths[segment]:0,angle=lengths[segment]/EARTH,a=points[segment],b=points[segment+1];let p=a;
    if(angle>1e-12){const va=unit(a),vb=unit(b),wa=Math.sin((1-t)*angle)/Math.sin(angle),wb=Math.sin(t*angle)/Math.sin(angle),[x,y,z]=va.map((v,j)=>wa*v+wb*vb[j]);p=[Math.atan2(y,x)*180/Math.PI,Math.atan2(z,Math.hypot(x,y))*180/Math.PI];}coords.push(p);distances.push(along);}
  return {coords,distances,length_m:total,spacing_m:total/n};
}
let projectionScript;
async function nativePoint(grid,point){
  if(grid.projection==='EPSG:4326')return point;
  if(grid.projection==='EPSG:3857'){const [lon,lat]=point;return [6378137*lon*Math.PI/180,6378137*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];}
  if(!globalThis.proj4){projectionScript??=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('./vendor/proj4.js',import.meta.url).href;script.onload=resolve;script.onerror=()=>reject(Error('Projection library unavailable; rebuild with npm dependencies installed'));document.head.append(script);});await projectionScript;}
  return globalThis.proj4('EPSG:4326',grid.projection,point);
}
export function cellFor(grid,[x,y]){const [a,b,c,d,e,f]=grid.transform,det=a*e-b*d;if(!det)throw Error('Invalid raster transform');return [Math.floor((e*(x-c)-b*(y-f))/det),Math.floor((-d*(x-c)+a*(y-f))/det)];}
export function profileCSV(profile){const columns=['distance_m','longitude','latitude','reference_depth_m','status','datum','source','survey_date','resolution_m'];const quote=value=>{let text=String(value??'');if(/^[=+@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};return [columns,...profile.samples.map(s=>[s.distance_m,s.lon,s.lat,s.depth_m,s.status,s.source?.datum,s.source?.title,s.source?.survey_date,s.source?.resolution_m])].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';}
export class StaticData {
  constructor(base=new URL('./',import.meta.url),fetcher=globalThis.fetch,projector=nativePoint){this.base=base;this.fetcher=fetcher.bind(globalThis);this.downloads=new DatasetCache(base,this.fetcher);this.projector=projector;this.cache=new Map();}
  url(path){return new URL(path,this.base).href;}
  async json(path){return this.downloads.read(path,{parse(text){if(text.startsWith('version https://git-lfs.github.com/spec/v1'))throw Error('An unresolved Git LFS pointer was deployed; rebuild with LFS checkout enabled');return JSON.parse(text);}});}
  async catalog(regionId){if(regionId)this.downloads.store.meta('lastRegion',regionId);if(regionId)await this.downloads.useRegion(regionId);const catalog=await this.json('data/catalog.json');if(catalog.format_version!==1)throw Error('Unsupported static dataset version');this.current=catalog;return catalog;}
  region(id){const region=this.current?.regions.find(r=>r.id===id);if(!region)throw Error('Unknown region');return region;}
  async contours(id){const path=this.region(id).contour_file;return path?this.json(path):{type:'FeatureCollection',features:[]};}
  async chunk(meta,key){
    const file=meta.grid.chunks[key];if(!file)return null;const path=this.url(file);if(this.cache.has(path))return this.cache.get(path);
    const pending=(async()=>{if(typeof DecompressionStream==='undefined')throw Error('This browser needs support for gzip DecompressionStream');const compressed=await this.downloads.read(file,{read:'arrayBuffer'}),decoded=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();if(decoded.byteLength!==meta.grid.chunk_size**2*4)throw Error('Numeric survey chunk has an invalid size');return new DataView(decoded);})();
    this.cache.set(path,pending);if(this.cache.size>64)this.cache.delete(this.cache.keys().next().value);try{return await pending;}catch(e){this.cache.delete(path);throw e;}
  }
  async sampleMany(id,points){
    points.forEach(validatePoint);const result=points.map(([lon,lat])=>({lon,lat,depth_m:null,status:'no-data',source:null}));
    for(const meta of this.region(id).rasters.slice().reverse()){
      const g=meta.grid,groups=new Map();
      for(let i=0;i<points.length;i++){if(result[i].status!=='no-data')continue;const [col,row]=cellFor(g,await this.projector(g,points[i]));if(!Number.isFinite(col+row)||col<0||row<0||col>=g.width||row>=g.height)continue;const key=`${Math.floor(col/g.chunk_size)}/${Math.floor(row/g.chunk_size)}`;if(!g.chunks[key])continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push([i,((row%g.chunk_size)*g.chunk_size+col%g.chunk_size)*4]);}
      const entries=[...groups.entries()];for(let start=0;start<entries.length;start+=8)await Promise.all(entries.slice(start,start+8).map(async([key,pending])=>{const data=await this.chunk(meta,key);for(const [i,offset] of pending){const raw=data.getFloat32(offset,true),value=raw===0?0:raw;if(Number.isFinite(value))result[i]={...result[i],depth_m:value,status:value<0?'above-datum':'depth',source:meta};}}));
    }return result;
  }
  async sample(id,point){return (await this.sampleMany(id,[point]))[0];}
  async profile(id,points){const region=this.region(id);if(!region.rasters.length)throw Error('A numeric raster must be published before drawing a profile');if(new Set(region.rasters.map(r=>r.datum.trim().toLowerCase())).size>1)throw Error('Cannot compare incompatible vertical datums in one profile');const coords=profileCoordinates(points,Math.min(...region.rasters.map(r=>r.resolution_m))),samples=await this.sampleMany(id,coords.coords);samples.forEach((s,i)=>s.distance_m=coords.distances[i]);return {samples,length_m:coords.length_m,spacing_m:coords.spacing_m,datum:region.rasters[0].datum,limitation:this.current.limitation};}
  async derivedContours(id,bbox,interval){
    const region=this.region(id);if(![2,5].includes(interval))throw Error('Contour interval must be 2 or 5 metres');if(interval===2&&!region.rasters.every(r=>r.resolution_m<=5&&r.quality==='measured'))throw Error('2 m contours require measured grids with source spacing ≤5 m');if(!region.rasters.length)return {features:[]};
    const [w,s,e,n]=bbox,res=Math.min(...region.rasters.map(r=>r.resolution_m)),width=Math.max(2,Math.min(128,Math.ceil(distance([w,s],[e,s])/res))),height=Math.max(2,Math.min(128,Math.ceil(distance([w,s],[w,n])/res))),xs=Array.from({length:width},(_,i)=>w+(e-w)*i/(width-1)),ys=Array.from({length:height},(_,i)=>s+(n-s)*i/(height-1)),points=ys.flatMap(y=>xs.map(x=>[x,y])),data=await this.sampleMany(id,points);
    return contourLines(xs,ys,data.map(v=>v.status==='depth'?v.depth_m:null),interval,region.rasters[0].datum);
  }
}
export function contourLines(xs,ys,values,interval,datum){
  // Marching triangles. Reject an entire cell if any corner is missing.
  const features=[],finite=values.filter(v=>v!==null&&Number.isFinite(v)),high=Math.min(200,Math.max(0,...finite)),width=xs.length;
  for(let level=interval;level<=high;level+=interval){const coordinates=new Map(),adjacency=new Map(),edges=[];
    function segment(a,b){const ka=a.map(v=>v.toFixed(10)).join(','),kb=b.map(v=>v.toFixed(10)).join(',');if(ka===kb)return;coordinates.set(ka,a);coordinates.set(kb,b);const index=edges.length;edges.push([ka,kb]);for(const key of [ka,kb]){if(!adjacency.has(key))adjacency.set(key,[]);adjacency.get(key).push(index);}}
    function triangle(points){const hits=[];for(let i=0;i<3;i++){const a=points[i],b=points[(i+1)%3];if((a[2]<level)===(b[2]<level))continue;const t=(level-a[2])/(b[2]-a[2]);hits.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}if(hits.length===2)segment(...hits);}
    for(let y=0;y<ys.length-1;y++)for(let x=0;x<xs.length-1;x++){const ids=[y*width+x,y*width+x+1,(y+1)*width+x+1,(y+1)*width+x],v=ids.map(i=>values[i]);if(v.some(z=>z===null||!Number.isFinite(z)))continue;const p=[[xs[x],ys[y],v[0]],[xs[x+1],ys[y],v[1]],[xs[x+1],ys[y+1],v[2]],[xs[x],ys[y+1],v[3]]];triangle([p[0],p[1],p[2]]);triangle([p[0],p[2],p[3]]);}
    const used=new Set();function walk(start,index){const line=[coordinates.get(start)];let key=start;while(index!==undefined&&!used.has(index)){used.add(index);const edge=edges[index];key=edge[0]===key?edge[1]:edge[0];line.push(coordinates.get(key));index=adjacency.get(key).find(i=>!used.has(i));}if(line.length>1)features.push({type:'Feature',properties:{depth_m:level,datum_label:datum,source_kind:'derived-contour'},geometry:{type:'LineString',coordinates:line}});}
    for(const [key,indices] of adjacency)if(indices.length!==2)for(const i of indices)if(!used.has(i))walk(key,i);edges.forEach((edge,i)=>{if(!used.has(i))walk(edge[0],i);});
  }return {type:'FeatureCollection',features};
}
