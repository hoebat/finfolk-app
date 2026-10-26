// Locations are taken from published contour vertices or verified raster cells.
export function dataLocations(region,features){
  const [west,south,east,north]=region.bbox,pins=[];
  for(const feature of features){
    if(!Number.isFinite(feature.properties?.depth_m)||feature.properties.depth_m<0)continue;
    const geometry=feature.geometry,lines=geometry?.type==='LineString'?[geometry.coordinates]:geometry?.type==='MultiLineString'?geometry.coordinates:[];
    let candidates=[];
    for(const line of lines){const inside=line.filter(([x,y])=>Number.isFinite(x+y)&&x>=west&&x<=east&&y>=south&&y<=north);if(inside.length>candidates.length)candidates=inside;}
    if(candidates.length)pins.push({point:candidates[Math.floor(candidates.length/2)].slice(0,2),kind:'contour',feature});
  }
  for(const source of region.rasters){
    if(source.data_location)pins.push({point:source.data_location,kind:'raster',source});
    else if(source.bounds){const [w,s,e,n]=source.bounds;pins.push({point:[(w+e)/2,(s+n)/2],kind:'footprint',source});}
  }
  return pins;
}

export function groupDataPins(pins,toScreen,width,height,spacing=64){
  const buckets=new Map();
  for(const pin of pins){const [x,y]=toScreen(pin.point);if(x<0||x>width||y<25||y>height-25)continue;const key=`${Math.floor(x/spacing)}/${Math.floor(y/spacing)}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push({...pin,x,y});}
  return [...buckets.values()].map(members=>{
    const x=members.reduce((sum,p)=>sum+p.x,0)/members.length,y=members.reduce((sum,p)=>sum+p.y,0)/members.length;
    const anchor=members.reduce((best,p)=>Math.hypot(p.x-x,p.y-y)<Math.hypot(best.x-x,best.y-y)?p:best);
    return {...anchor,members}; // Anchor remains on real source geometry, not an averaged location.
  });
}
