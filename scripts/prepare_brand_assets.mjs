// Trace the approved native-generated alpha silhouette; all colourways share its path.
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const {data,info}=await sharp(root+'design-board/assets/identity/slow-melt-f-source.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
const {width:w,height:h,channels:c}=info;
const filled=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&data[(y*w+x)*c+3]>=128;
const edges=new Map(),key=(x,y)=>x+','+y;
const add=(x,y,a,b)=>edges.set(key(x,y),[a,b]);
for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(filled(x,y)){
 if(!filled(x,y-1))add(x,y,x+1,y);
 if(!filled(x+1,y))add(x+1,y,x+1,y+1);
 if(!filled(x,y+1))add(x+1,y+1,x,y+1);
 if(!filled(x-1,y))add(x,y+1,x,y);
}
let outline=[];
while(edges.size){const start=edges.keys().next().value;let cursor=start;const loop=[];do{const p=cursor.split(',').map(Number);loop.push(p);const next=edges.get(cursor);edges.delete(cursor);if(!next)break;cursor=key(...next);}while(cursor!==start);if(loop.length>outline.length)outline=loop;}
const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
function simplify(points){let far=0,index=0;for(let i=1;i<points.length-1;i++){const d=distance(points[i],points[0],points.at(-1));if(d>far){far=d;index=i;}}return far>1.2?[...simplify(points.slice(0,index+1)).slice(0,-1),...simplify(points.slice(index))]:[points[0],points.at(-1)];}
const half=Math.floor(outline.length/2),points=[...simplify(outline.slice(0,half+1)).slice(0,-1),...simplify([...outline.slice(half),outline[0]]).slice(0,-1)];
const xs=outline.map(p=>p[0]),ys=outline.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),scale=224/Math.max(maxX-minX,maxY-minY);
const coords=points.map(([x,y])=>[(x-(minX+maxX)/2)*scale+128,(y-(minY+maxY)/2)*scale+128]);
const fmt=p=>p.map(v=>v.toFixed(2)).join(' '),mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
const d='M'+fmt(mid(coords.at(-1),coords[0]))+coords.map((p,i)=>'Q'+fmt(p)+' '+fmt(mid(p,coords[(i+1)%coords.length]))).join('')+'Z';
for(const [name,colour] of Object.entries({navy:'#172440',ivory:'#f2e8d6',cobalt:'#1641ff',pink:'#ff148d'})){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="${colour}" d="${d}"/></svg>\n`;
 await writeFile(root+'web/finfolk-mark-'+name+'.svg',svg);
 if(name==='navy'){
  await writeFile(root+'web/finfolk-mark.svg',svg);
  await sharp(Buffer.from(svg)).resize(512,512).png().toFile(root+'web/finfolk-mark.png');
  await sharp(Buffer.from(svg)).resize(32,32).png().toFile(root+'web/finfolk-favicon.png');
 }
}
const icon=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="54" fill="#f2e8d6"/><path fill="#172440" d="${d}"/></svg>\n`;
await writeFile(root+'web/finfolk-icon.svg',icon);
await sharp(Buffer.from(icon)).resize(180,180).png().toFile(root+'web/finfolk-touch.png');
await writeFile(root+'design-board/assets/identity/slow-melt-f-contour.json',JSON.stringify({source:'slow-melt-f-source.png',viewBox:'0 0 256 256',path:d,points:coords.length},null,2)+'\n');
console.log('Locked f: '+coords.length+' contour points; four identical colourways, favicon and touch icon.');
