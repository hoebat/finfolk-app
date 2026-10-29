import {distance,validatePoint} from './data-client.js';
import {nearestOnSegment} from './measure.js';
const RAD=Math.PI/180,METRES=6371008.8*RAD,prepared=new WeakMap();
function linesFor(feature){
  if(prepared.has(feature))return prepared.get(feature);
  const geometry=feature.geometry,lines=geometry?.type==='LineString'?[geometry.coordinates]:geometry?.type==='MultiLineString'?geometry.coordinates:[],rows=[];
  for(const line of lines){if(line.length<2||line.some(p=>!Number.isFinite(p[0])||!Number.isFinite(p[1])))continue;const bounds=[Infinity,Infinity,-Infinity,-Infinity];for(const p of line){bounds[0]=Math.min(bounds[0],p[0]);bounds[1]=Math.min(bounds[1],p[1]);bounds[2]=Math.max(bounds[2],p[0]);bounds[3]=Math.max(bounds[3],p[1]);}rows.push({line,bounds});}
  prepared.set(feature,rows);return rows;
}
// A local, bounded interpolation of published reference depths. Never fills raster
// cells or feeds profile/measurement calculations. It has no vertical accuracy model.
export function estimateContourDepth(point,features,{maxDistance=1500,maxSpan=2000}={}){
  validatePoint(point);const scaleX=METRES*Math.cos(point[1]*RAD),scaleY=METRES,dx=maxDistance/scaleX,dy=maxDistance/scaleY,groups=new Map();
  for(const feature of features){
    const p=feature.properties||{},depth=p.depth_m,label=String(p.datum_label||'').trim(),raw=p.datum??p.DATUM;
    if(typeof raw==='number'&&!Number.isFinite(raw))continue;
    if(!Number.isFinite(depth)||depth<0||!label||(/unknown|unverified/i.test(label)&&(raw===undefined||raw===null||raw==='')))continue;
    const key=JSON.stringify([label.toLowerCase(),raw??null,p.source_url||'',p.source_kind||'',p.survey_date||'']);let nearest;
    for(const {line,bounds:b} of linesFor(feature)){
      if(b[2]<point[0]-dx||b[0]>point[0]+dx||b[3]<point[1]-dy||b[1]>point[1]+dy)continue;
      for(let i=1;i<line.length;i++){
        const a=line[i-1].slice(0,2),b=line[i].slice(0,2),target=nearestOnSegment(point,a,b),metres=distance(point,target);if(metres>maxDistance||nearest&&metres>=nearest.distance_m)continue;
        // Open line ends can be survey clipping edges; don't extrapolate past them.
        const closed=line[0][0]===line.at(-1)[0]&&line[0][1]===line.at(-1)[1],atStart=i===1&&distance(target,a)<.05,atEnd=i===line.length-1&&distance(target,b)<.05;
        if(!closed&&(atStart||atEnd))continue;
        nearest={depth_m:depth,distance_m:metres,point:target,feature,vector:[(target[0]-point[0])*scaleX,(target[1]-point[1])*scaleY]};
      }
    }
    if(!nearest)continue;if(!groups.has(key))groups.set(key,new Map());const group=groups.get(key);if(!group.has(depth)||group.get(depth).distance_m>nearest.distance_m)group.set(depth,nearest);
  }
  let best;
  for(const group of groups.values()){
    const rows=[...group.values()].sort((a,b)=>a.depth_m-b.depth_m);
    for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
      const a=rows[i],b=rows[j],span=a.distance_m+b.distance_m;if(!span||span>maxSpan||best&&span>=best.span_m)continue;
      const lengthA=Math.hypot(...a.vector),lengthB=Math.hypot(...b.vector);if(lengthA<.5||lengthB<.5)continue;
      // Nearest supporting contours must be on opposite sides (at least 150°).
      const cosine=(a.vector[0]*b.vector[0]+a.vector[1]*b.vector[1])/(lengthA*lengthB);if(cosine>-.8660254)continue;
      const depth=a.depth_m+(b.depth_m-a.depth_m)*a.distance_m/span,p=a.feature.properties;
      best={depth_m:depth,lower:a,upper:b,span_m:span,datum_label:p.datum_label,datum_code:p.datum??p.DATUM??null,method:'linear-between-contours'};
    }
  }
  if(best){
    // A mapped zero contour crossing a supporting ray can indicate intervening
    // shore. Decline the estimate rather than interpolate through that boundary.
    for(const feature of features){if(feature.properties?.depth_m!==0)continue;
      for(const {line,bounds:b} of linesFor(feature)){if(b[2]<point[0]-dx||b[0]>point[0]+dx||b[3]<point[1]-dy||b[1]>point[1]+dy)continue;
        for(const support of [best.lower,best.upper])for(let i=1;i<line.length;i++){
          const a=[(line[i-1][0]-point[0])*scaleX,(line[i-1][1]-point[1])*scaleY],b=[(line[i][0]-point[0])*scaleX,(line[i][1]-point[1])*scaleY],v=support.vector,w=[b[0]-a[0],b[1]-a[1]],cross=(u,v)=>u[0]*v[1]-u[1]*v[0],den=cross(v,w);if(Math.abs(den)<1e-9)continue;
          const t=cross(a,w)/den,u=cross(a,v)/den;const length=Math.hypot(...v);if(t*length>1&&(1-t)*length>1&&u>=0&&u<=1)return null;
        }
      }
    }
  }
  return best||null;
}
