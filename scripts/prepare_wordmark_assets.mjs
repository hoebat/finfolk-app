// Preserve every letter and counter of the approved, native-extracted wordmark.
import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const {data,info}=await sharp(root+'design-board/assets/identity/slow-melt-wordmark-source.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
const {width:w,height:h,channels:c}=info;
const filled=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&data[(y*w+x)*c+3]>=128;
const edges=new Map(),key=(x,y)=>x+','+y;
const add=(x,y,a,b)=>{const k=key(x,y);if(!edges.has(k))edges.set(k,[]);edges.get(k).push([a,b]);};
for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(filled(x,y)){
 if(!filled(x,y-1))add(x,y,x+1,y);
 if(!filled(x+1,y))add(x+1,y,x+1,y+1);
 if(!filled(x,y+1))add(x+1,y+1,x,y+1);
 if(!filled(x-1,y))add(x,y+1,x,y);
}
const loops=[];
while(edges.size){const start=edges.keys().next().value;let cursor=start;const loop=[];do{loop.push(cursor.split(',').map(Number));const list=edges.get(cursor);if(!list)break;const next=list.pop();if(!list.length)edges.delete(cursor);cursor=key(...next);}while(cursor!==start);if(loop.length>30)loops.push(loop);}
const area=loop=>Math.abs(loop.reduce((a,p,i)=>{const q=loop[(i+1)%loop.length];return a+p[0]*q[1]-q[0]*p[1];},0)/2);
const contours=loops.filter(loop=>area(loop)>50);
const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
function simplify(points){let far=0,index=0;for(let i=1;i<points.length-1;i++){const d=distance(points[i],points[0],points.at(-1));if(d>far){far=d;index=i;}}return far>1.1?[...simplify(points.slice(0,index+1)).slice(0,-1),...simplify(points.slice(index))]:[points[0],points.at(-1)];}
const all=contours.flat(),minX=Math.min(...all.map(p=>p[0])),maxX=Math.max(...all.map(p=>p[0])),minY=Math.min(...all.map(p=>p[1])),maxY=Math.max(...all.map(p=>p[1]));
const scale=1000/(maxX-minX),height=Math.ceil((maxY-minY)*scale+24);
const fmt=p=>p.map(v=>v.toFixed(2)).join(' '),mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
const paths=contours.map(loop=>{const half=Math.floor(loop.length/2);const points=[...simplify(loop.slice(0,half+1)).slice(0,-1),...simplify([...loop.slice(half),loop[0]]).slice(0,-1)].map(([x,y])=>[(x-minX)*scale+12,(y-minY)*scale+12]);return 'M'+fmt(mid(points.at(-1),points[0]))+points.map((p,i)=>'Q'+fmt(p)+' '+fmt(mid(p,points[(i+1)%points.length]))).join('')+'Z';});
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 ${height}"><path fill="#172440" fill-rule="evenodd" d="${paths.join('')}"/></svg>\n`;
await writeFile(root+'web/finfolk-wordmark.svg',svg);
await sharp(Buffer.from(svg)).resize({width:1600}).png().toFile(root+'web/finfolk-wordmark.png');
await writeFile(root+'design-board/assets/identity/slow-melt-wordmark-contour.json',JSON.stringify({source:'slow-melt-wordmark-source.png',viewBox:`0 0 1024 ${height}`,contours:contours.length,path:paths.join('')},null,2)+'\n');
for(const animal of ['bluedragon','irukandji','toadfish','seaurchin'])for(const variant of ['','-hyper'])await sharp(root+`design-board/assets/regional/animal-${animal}${variant}-v1.png`).webp({quality:82}).toFile(root+`web/animal-${animal}${variant}-v1.webp`);
console.log(`Full wordmark: ${contours.length} contours, 1024 × ${height}. Eight regional print assets prepared.`);
