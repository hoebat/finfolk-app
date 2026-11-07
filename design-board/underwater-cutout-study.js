// Positions share a 1600 × 1200 artboard, including the downloadable composition.
export const SCENE_SIZE={width:1600,height:1200};
export const SCENE_LAYERS=Object.freeze([
 {id:'distant-kelp',asset:'habitat-kelp-v1.webp',x:1120,y:315,w:430,h:790,opacity:.23,flip:true},
 {id:'distant-reef',asset:'habitat-reef-rocks-v1.webp',x:450,y:825,w:1040,h:470,opacity:.28},
 {id:'far-fish',asset:'habitat-schooling-fish-v1.webp',x:250,y:180,w:310,h:230,opacity:.38},
 {id:'turtle',asset:'habitat-turtle-v1.webp',x:205,y:500,w:230,h:230,rotation:-18,opacity:.65},
 {id:'ray',asset:'habitat-stingray-v1.webp',x:1045,y:510,w:320,h:320,rotation:20,opacity:.8},
 {id:'ascending',asset:'freediver-ascending-v1.webp',x:485,y:100,w:675,h:675},
 {id:'fish',asset:'habitat-schooling-fish-v1.webp',x:1080,y:175,w:420,h:300},
 {id:'reef-arch',asset:'habitat-reef-arch-v1.webp',x:165,y:790,w:950,h:550},
 {id:'left-kelp',asset:'habitat-kelp-v1.webp',x:-120,y:310,w:520,h:1050},
 {id:'seagrass',asset:'habitat-seagrass-v1.webp',x:1050,y:740,w:300,h:510,flip:true},
 {id:'fan-coral',asset:'habitat-fan-coral-v1.webp',x:1170,y:660,w:570,h:660},
]);
const assetURL=asset=>new URL('../web/'+asset,import.meta.url).href;
const patternURL=collection=>assetURL('animal-octopus'+(collection==='hyper'?'-hyper':'')+'-v1.webp');
const presence=value=>Math.max(0,Math.min(.7,Number(value)/100||0));
export function createUnderwaterScene(){
 const scene=document.createElement('div');scene.className='underwater-scene';scene.dataset.pose='ascending';scene.dataset.stencil='behind';scene.setAttribute('role','img');scene.setAttribute('aria-label','An ascending freediver above a reef arch, framed by kelp, fan coral and seagrass, with a turtle, ray and schooling fish. Solid navy cutouts over a marine animal print.');
 const print=document.createElement('span');print.className='underwater-scene__print';scene.append(print);
 for(const layer of SCENE_LAYERS){const cutout=document.createElement('span');cutout.className='underwater-scene__cutout';cutout.dataset.sceneLayer=layer.id;cutout.setAttribute('aria-hidden','true');cutout.style.cssText=`left:${layer.x/16}%;top:${layer.y/12}%;width:${layer.w/16}%;height:${layer.h/12}%;opacity:${layer.opacity??1};transform:rotate(${layer.rotation||0}deg) scaleX(${layer.flip?-1:1});`;cutout.style.setProperty('--scene-mask',`url("${assetURL(layer.asset)}")`);scene.append(cutout);}
 return scene;
}
function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('A scene cutout could not be loaded. Reload and try again.'));image.src=src;});}
export async function sceneCanvas({collection='muted',patternPresence=42,scale=2}={}){
 const canvas=document.createElement('canvas');canvas.width=SCENE_SIZE.width*scale;canvas.height=SCENE_SIZE.height*scale;const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#f2e8d6';ctx.fillRect(0,0,1600,1200);
 const [print,...masks]=await Promise.all([loadImage(patternURL(collection)),...SCENE_LAYERS.map(layer=>loadImage(assetURL(layer.asset)))]);
 const tile=document.createElement('canvas');tile.width=tile.height=205;tile.getContext('2d').drawImage(print,0,0,205,205);ctx.fillStyle=ctx.createPattern(tile,'repeat');ctx.globalAlpha=presence(patternPresence);ctx.fillRect(0,0,1600,1200);ctx.globalAlpha=1;
 for(const [index,layer] of SCENE_LAYERS.entries()){
  const cutout=document.createElement('canvas');cutout.width=layer.w*scale;cutout.height=layer.h*scale;const ink=cutout.getContext('2d'),mask=masks[index],ratio=Math.min(cutout.width/mask.width,cutout.height/mask.height),w=mask.width*ratio,h=mask.height*ratio;
  ink.drawImage(mask,(cutout.width-w)/2,(cutout.height-h)/2,w,h);ink.globalCompositeOperation='source-in';ink.fillStyle='#172440';ink.fillRect(0,0,cutout.width,cutout.height);
  ctx.save();ctx.globalAlpha=layer.opacity??1;ctx.translate(layer.x+layer.w/2,layer.y+layer.h/2);ctx.rotate((layer.rotation||0)*Math.PI/180);ctx.scale(layer.flip?-1:1,1);ctx.drawImage(cutout,-layer.w/2,-layer.h/2,layer.w,layer.h);ctx.restore();
 }
 return canvas;
}
export function installUnderwaterScene({onStatus=()=>{}}={}){
 const host=document.getElementById('underwater-scene-art');if(!host)return;const scene=createUnderwaterScene();host.replaceChildren(scene);
 const collection=document.getElementById('scene-collection'),strength=document.getElementById('scene-presence'),output=document.getElementById('scene-presence-value'),download=document.getElementById('scene-download');
 function render(){scene.style.setProperty('--scene-print',`url("${patternURL(collection.value)}")`);scene.style.setProperty('--scene-presence',String(presence(strength.value)));output.value=strength.value+'%';}
 collection.onchange=render;strength.oninput=render;render();
 download.onclick=async()=>{download.disabled=true;download.textContent='Preparing image…';try{const canvas=await sceneCanvas({collection:collection.value,patternPresence:Number(strength.value)}),blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not prepare the scene image.');const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='finfolk-underwater-ascent-'+collection.value+'.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);onStatus('Underwater scene downloaded at 3200 × 2400.');}catch(error){onStatus(error.message,true);}finally{download.disabled=false;download.textContent='Download scene PNG';}};
}
