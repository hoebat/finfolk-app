import {activity,readResource} from './activity.js';
import {DEPTH_COLOURS} from './map-style.js';
// Publisher-rendered rasters are display context, never numeric grid samples.
// Recolour by the order of the publisher's legend, without assuming a linear
// stretch or converting rendered RGB values into measured metres.
const NSW='https://mapprod2.environment.nsw.gov.au/arcgis/rest/services/Coastal_Marine/NSW_Marine_Lidar_Bathymetry_Data_2018/MapServer';
const VIC='https://biod-gis.mapshare.vic.gov.au/arcgis/rest/services/CoastKit/Bathymetry/MapServer';
const nswRegions=new Set(['bondi','jervis-bay','nsw-northern-beaches','nsw-southern-sydney','nsw-central-coast','nsw-hunter','nsw-northern-rivers','nsw-illawarra','nsw-eurobodalla','nsw-sapphire','qld-southern-gold-coast']);
export function surfaceForRegion(region){
  if(region.rasters?.length)return null;
  if(nswRegions.has(region.id))return {service:NSW,layer:2,minZoom:8,credit:'© NSW DCCEEW · marine lidar 2018',note:'NSW 2018 marine-lidar DEM display · AHD. Gaps remain blank. Colour is relative depth; use contour labels for metres.'};
  const layer={'port-phillip':13,'western-port':13,'vic-corner-inlet':15,'vic-mallacoota':19}[region.id];
  return layer?{service:VIC,layer,minZoom:10,credit:'© State of Victoria · CoastKit bathymetry',note:'CoastKit bathymetry compilation display. Source ages, spacing and datum may differ from the contour survey. Colour is relative depth; use contour labels for metres.'}:null;
}
export function surfaceURL(surface,bounds,width,height){
  const merc=([lon,lat])=>[lon*Math.PI/180*6378137,Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,lat))*Math.PI/360))*6378137];
  const factor=Math.min(1,1400/Math.max(width,height)),size=[Math.max(1,Math.round(width*factor)),Math.max(1,Math.round(height*factor))];
  const url=new URL(surface.service+'/export');url.search=new URLSearchParams({f:'image',bbox:[...merc(bounds.slice(0,2)),...merc(bounds.slice(2,4))].join(','),bboxSR:'3857',imageSR:'3857',size:size.join(','),format:'png32',transparent:'true',layers:`show:${surface.layer}`,interpolation:'RSP_NearestNeighbor'});return url.href;
}
const legends=new Map();
function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';const timeout=setTimeout(()=>{image.onload=image.onerror=null;reject(Error('Publisher imagery timed out'));},20000);image.onload=()=>{clearTimeout(timeout);resolve(image);};image.onerror=()=>{clearTimeout(timeout);reject(Error('Publisher imagery unavailable'));};image.src=url;});}
async function legend(surface){
  const key=`${surface.service}/${surface.layer}`;if(legends.has(key))return legends.get(key);
  const request=(async()=>{const data=await readResource(surface.service+'/legend?f=json',{read:'json',signal:AbortSignal.timeout(20000)}),entries=data.layers?.find(l=>l.layerId===surface.layer)?.legend;if(!entries?.length)throw Error('Publisher legend unavailable');const colours=[];
    for(const entry of entries){const image=await loadImage(`data:${entry.contentType};base64,${entry.imageData}`),canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0);const pixels=c.getImageData(Math.floor(canvas.width/2),0,1,canvas.height).data;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>200)colours.push([...pixels.slice(i,i+3)]);}
    if(colours.length<10)throw Error('Publisher legend is not a colour ramp');return colours;
  })();legends.set(key,request);try{return await request;}catch(error){legends.delete(key);throw error;}
}
function palette(t){const value=t*50;let i=1;while(i<DEPTH_COLOURS.length-1&&value>DEPTH_COLOURS[i][0])i++;const [a,ca]=DEPTH_COLOURS[i-1],[b,cb]=DEPTH_COLOURS[i],f=(value-a)/(b-a);return ca.map((v,j)=>Math.round(v+(cb[j]-v)*f));}
export function recolourSurface(pixels,colours){
  const lookup=new Map();for(let i=0;i<pixels.length;i+=4){if(!pixels[i+3])continue;const r=pixels[i],g=pixels[i+1],b=pixels[i+2],key=r*65536+g*256+b;let rgb=lookup.get(key);
    if(!rgb){let best=Infinity,index=0;for(let j=0;j<colours.length-1;j++){const c=colours[j],next=colours[j+1],v=next.map((n,k)=>n-c[k]),length=v.reduce((n,x)=>n+x*x,0),f=length?Math.max(0,Math.min(1,((r-c[0])*v[0]+(g-c[1])*v[1]+(b-c[2])*v[2])/length)):0,d=(r-c[0]-f*v[0])**2+(g-c[1]-f*v[1])**2+(b-c[2]-f*v[2])**2;if(d<best){best=d;index=j+f;}}rgb=palette(index/(colours.length-1));lookup.set(key,rgb);}pixels[i]=rgb[0];pixels[i+1]=rgb[1];pixels[i+2]=rgb[2];
  }return pixels;
}
async function colourInBackground(pixels,colours,signal){
  signal?.throwIfAborted();
  if(typeof Worker!=='undefined'){
    let worker;
    try{worker=new Worker(new URL('./surface-worker.js',import.meta.url),{type:'module'});}catch{}
    if(worker){return new Promise((resolve,reject)=>{
      const cleanup=()=>{worker.terminate();signal?.removeEventListener('abort',abort);},abort=()=>{cleanup();reject(signal.reason||new DOMException('Superseded','AbortError'));};
      signal?.addEventListener('abort',abort,{once:true});worker.onmessage=event=>{cleanup();if(event.data.error)reject(Error(event.data.error));else resolve(new Uint8ClampedArray(event.data.buffer));};worker.onerror=()=>{cleanup();reject(Error('Background image processing failed'));};
      worker.postMessage({buffer:pixels.buffer,colours},[pixels.buffer]);
    });}
  }
  // Yield on older browsers; do not block pan/zoom with a full-image loop.
  for(let offset=0;offset<pixels.length;offset+=32768){signal?.throwIfAborted();recolourSurface(pixels.subarray(offset,offset+32768),colours);await new Promise(resolve=>setTimeout(resolve,0));}return pixels;
}
export async function loadSurface(surface,url,{signal}={}){
  const timeout=AbortSignal.timeout(25000),combined=signal&&AbortSignal.any?AbortSignal.any([signal,timeout]):signal||timeout;
  const [blob,colours]=await Promise.all([readResource(url,{read:'blob',signal:combined}),legend(surface)]);combined?.throwIfAborted();
  let image,objectURL;
  try{if(typeof createImageBitmap==='function')image=await createImageBitmap(blob);else{objectURL=URL.createObjectURL(blob);image=await loadImage(objectURL);}
    combined?.throwIfAborted();const canvas=document.createElement('canvas');canvas.width=image.width||image.naturalWidth;canvas.height=image.height||image.naturalHeight;const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0);const pixels=c.getImageData(0,0,canvas.width,canvas.height),task=activity.begin({label:'Colouring seabed imagery',kind:'Rendering'});
    try{const coloured=await colourInBackground(pixels.data,colours,combined);combined?.throwIfAborted();c.putImageData(new ImageData(coloured,canvas.width,canvas.height),0,0);task.finish();return canvas;}catch(error){task.finish({state:error.name==='AbortError'?'cancelled':'error',error:error.message});throw error;}
  }finally{image?.close?.();if(objectURL)URL.revokeObjectURL(objectURL);}
}
