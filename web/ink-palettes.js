// Pixel positions never change. Three soft ink masks retain engraved edge blends.
export const INK_ROLES=Object.freeze(['paper','ink','accent']);
export const SOURCE_INKS=Object.freeze({paper:'#edff35',ink:'#1641ff',accent:'#ff148d'});
export const SCENE_PALETTES=Object.freeze({
 'acid-light':{id:'acid-light',name:'Acid Club',colours:{paper:'#edff35',ink:'#1641ff',accent:'#ff148d'}},
 'acid-dark':{id:'acid-dark',name:'Blue Hour',colours:{paper:'#1641ff',ink:'#edff35',accent:'#ff148d'}},
 'muted-light':{id:'muted-light',name:'Salt Paper',colours:{paper:'#f2e8d6',ink:'#172440',accent:'#bc8190'}},
 'muted-dark':{id:'muted-dark',name:'Night Swim',colours:{paper:'#172440',ink:'#f2e8d6',accent:'#edb2c7'}},
});
const themePalettes={yellow:'acid-light',acid:'acid-light',pink:'acid-light',cobalt:'acid-dark','navy-light':'muted-light',navy:'muted-dark',night:'muted-dark',sand:'muted-dark',coastal:'muted-dark'};
export function inkPaletteId(appearance='light',collection='muted'){
 if(appearance&&typeof appearance==='object'){
  const p=appearance.palette,light=hex=>rgb(hex).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  return (appearance.collection==='hyper'?'acid':'muted')+'-'+(p&&light(p.paper)<light(p.ink)?'dark':'light');
 }
 if(Object.hasOwn(SCENE_PALETTES,appearance))return appearance;
 return themePalettes[appearance]||(collection==='hyper'?'acid':'muted')+'-'+(appearance==='dark'?'dark':'light');
}
export const themeForInkPalette=id=>({'acid-light':'yellow','acid-dark':'cobalt','muted-light':'navy-light','muted-dark':'navy'})[inkPaletteId(id)];
export const rgb=hex=>[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const clamp=n=>Math.max(0,Math.min(1,n));
export function separateInks(pixels,source=SOURCE_INKS){
 if(pixels.length%3)throw Error('Expected RGB pixels.');
 const colours=INK_ROLES.map(role=>rgb(source[role])),[paper,ink,accent]=colours,u=sub(ink,paper),v=sub(accent,paper),uu=dot(u,u),uv=dot(u,v),vv=dot(v,v),det=uu*vv-uv*uv;
 if(det<=0)throw Error('Source inks must be distinct.');
 const weights=new Uint8Array(pixels.length);
 for(let i=0;i<pixels.length;i+=3){
  const p=[pixels[i],pixels[i+1],pixels[i+2]],d=sub(p,paper),du=dot(d,u),dv=dot(d,v),a=(du*vv-dv*uv)/det,b=(dv*uu-du*uv)/det;
  let w;
  if(a>=0&&b>=0&&a+b<=1)w=[1-a-b,a,b];
  else{let best=Infinity;for(const [start,end] of [[0,1],[0,2],[1,2]]){const edge=sub(colours[end],colours[start]),t=clamp(dot(sub(p,colours[start]),edge)/dot(edge,edge)),distance=p.reduce((sum,value,c)=>sum+(value-colours[start][c]-t*edge[c])**2,0);if(distance<best){best=distance;w=[0,0,0];w[start]=1-t;w[end]=t;}}}
  weights[i]=Math.round(w[0]*255);weights[i+1]=Math.min(255-weights[i],Math.round(w[1]*255));weights[i+2]=255-weights[i]-weights[i+1];
 }
 return weights;
}
export function colourInks(weights,colours){
 if(weights.length%3)throw Error('Expected three ink weights per pixel.');
 const inks=INK_ROLES.map(role=>rgb(colours[role])),pixels=new Uint8Array(weights.length);
 for(let i=0;i<weights.length;i+=3)for(let c=0;c<3;c++)pixels[i+c]=Math.round((weights[i]*inks[0][c]+weights[i+1]*inks[1][c]+weights[i+2]*inks[2][c])/255);
 return pixels;
}
