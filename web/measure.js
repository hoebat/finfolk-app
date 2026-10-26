import {distance,validatePoint} from './data-client.js';
const RAD=Math.PI/180,EARTH=6371008.8;
function bearing(a,b){const p1=a[1]*RAD,p2=b[1]*RAD,dl=(b[0]-a[0])*RAD;return Math.atan2(Math.sin(dl)*Math.cos(p2),Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl));}
function destination(point,angle,metres){const delta=metres/EARTH,phi=point[1]*RAD,lambda=point[0]*RAD,lat=Math.asin(Math.sin(phi)*Math.cos(delta)+Math.cos(phi)*Math.sin(delta)*Math.cos(angle)),lon=lambda+Math.atan2(Math.sin(angle)*Math.sin(delta)*Math.cos(phi),Math.cos(delta)-Math.sin(phi)*Math.sin(lat));return [((lon/RAD+540)%360)-180,lat/RAD];}
export function nearestOnSegment(point,a,b){
  const length=distance(a,b);if(length<.001)return a.slice(0,2);
  const d13=distance(a,point)/EARTH,heading=bearing(a,b),difference=bearing(a,point)-heading,along=Math.atan2(Math.sin(d13)*Math.cos(difference),Math.cos(d13))*EARTH;
  if(along<=0)return a.slice(0,2);if(along>=length)return b.slice(0,2);return destination(a,heading,along);
}
export function nearestContour(start,features,depth){
  validatePoint(start);if(!Number.isFinite(depth)||depth<0)throw Error('Choose a non-negative published contour depth');let best=null;
  for(const feature of features){if(Math.abs(feature.properties?.depth_m-depth)>1e-6||!Number.isFinite(feature.properties?.depth_m))continue;const geometry=feature.geometry,lines=geometry?.type==='LineString'?[geometry.coordinates]:geometry?.type==='MultiLineString'?geometry.coordinates:[];
    for(const line of lines)for(let i=1;i<line.length;i++){const a=line[i-1].slice(0,2),b=line[i].slice(0,2);if(!a.every(Number.isFinite)||!b.every(Number.isFinite))continue;const point=nearestOnSegment(start,a,b),metres=distance(start,point);if(!best||metres<best.distance_m)best={start:start.slice(),target:point,depth_m:depth,distance_m:metres,return_distance_m:metres*2,bearing_deg:(bearing(start,point)/RAD+360)%360,feature};}
  }
  if(!best)throw Error(`No published ${depth} m contour is available in this dataset. Choose another depth.`);return best;
}
export const EDITHVALE={name:'Edithvale Life Saving Club',point:[145.1068502,-38.0387296],source_url:'https://www.kingston.vic.gov.au/community/get-involved/community-groups/Edithvale-Life-Saving-Club'};
export function edithvaleMeasurement(features,depth=10){const shoreline=nearestContour(EDITHVALE.point,features,0);if(shoreline.distance_m>1000)throw Error('The local mapped low-water line is unavailable');return {...nearestContour(shoreline.target,features,depth),start_label:'Mapped low-water mark near Edithvale Life Saving Club',club_point:EDITHVALE.point,club_to_shore_m:shoreline.distance_m};}
