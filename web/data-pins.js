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

// Cluster all records in world coordinates before viewport filtering. Grouping
// therefore does not depend on panning, canvas size, or which members are visible.
export function clusterDataPins(pins,toWorld,radius=80){
  const ordered=pins.map(pin=>({...pin,world:toWorld(pin.point)})).filter(pin=>pin.world.every(Number.isFinite)).sort((a,b)=>a.world[0]-b.world[0]||a.world[1]-b.world[1]||a.kind.localeCompare(b.kind)||String(a.feature?.id??a.feature?.properties?.OBJECTID??a.source?.id??'').localeCompare(String(b.feature?.id??b.feature?.properties?.OBJECTID??b.source?.id??'')));
  const buckets=new Map(),groups=[];
  for(const pin of ordered){
    const [x,y]=pin.world,cx=Math.floor(x/radius),cy=Math.floor(y/radius);let nearest=null,best=radius;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const group of buckets.get(`${cx+dx}/${cy+dy}`)||[]){const d=Math.hypot(group.seed[0]-x,group.seed[1]-y);if(d<best){nearest=group;best=d;}}
    if(nearest)nearest.members.push(pin);
    else{const group={seed:pin.world,members:[pin]};groups.push(group);const key=`${cx}/${cy}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(group);}
  }
  return groups.map(({members})=>{
    const x=members.reduce((s,p)=>s+p.world[0],0)/members.length,y=members.reduce((s,p)=>s+p.world[1],0)/members.length;
    const anchor=members.reduce((a,b)=>Math.hypot(b.world[0]-x,b.world[1]-y)<Math.hypot(a.world[0]-x,a.world[1]-y)?b:a);
    return {...anchor,members};
  });
}

export function visibleDataPins(groups,toScreen,width,height){
  return groups.map(group=>({...group,x:toScreen(group.point)[0],y:toScreen(group.point)[1]})).filter(pin=>pin.x>=0&&pin.x<=width&&pin.y>=30&&pin.y<=height-30);
}
