// One saved three-ink master per drawing; every colourway uses the same masks.
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {UNDERWATER_ARTWORK,ACID_VIGNETTES} from '../design-board/underwater-scene.js';
import {AUSTRALIAN_SCENES} from '../web/australian-scenes.js';
import {ANIMALS} from '../web/animal-prints.js';
import {INK_ROLES,SOURCE_INKS,SCENE_PALETTES,separateInks,colourInks} from '../web/ink-palettes.js';
const root=fileURLToPath(new URL('../',import.meta.url)),catalog=[];
const jobs=[...ACID_VIGNETTES.map(id=>({id,type:'scenes',name:UNDERWATER_ARTWORK[id].name,source:'design-board/assets/scenes/'+UNDERWATER_ARTWORK[id].asset+'.png',asset:UNDERWATER_ARTWORK[id].asset})),...ANIMALS.map(a=>({id:a.id,type:'motifs',name:a.name,source:'web/'+a.prints.hyper,asset:'animal-'+a.id}))];
for(const job of jobs){
 const source=resolve(root,job.source),original=await readFile(source),sourceHash=createHash('sha256').update(original).digest('hex'),{data,info}=await sharp(original).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true}),raw={width:info.width,height:info.height,channels:3};
 const master=resolve(root,'design-board/assets/ink-masters',job.type,job.asset);await mkdir(master,{recursive:true});
 let previous;try{previous=JSON.parse(await readFile(join(master,'master.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 let weights;
 if(previous?.sourceSHA256===sourceHash&&previous.algorithm==='srgb-three-ink-projection-v1'){
  const masks=await Promise.all(INK_ROLES.map(role=>sharp(join(master,previous.masks[role])).greyscale().raw().toBuffer()));weights=new Uint8Array(data.length);
  if(masks.some(mask=>mask.length!==data.length/3))throw Error('Ink master dimensions changed: '+job.id);
  for(let i=0;i<masks[0].length;i++){if(masks[0][i]+masks[1][i]+masks[2][i]!==255)throw Error('Ink master coverage must sum to 255: '+job.id);for(let c=0;c<3;c++)weights[i*3+c]=masks[c][i];}
 }else weights=separateInks(data);
 for(const [channel,role] of INK_ROLES.entries())await sharp(weights,{raw}).extractChannel(channel).png().toFile(join(master,role+'-mask.png'));
 const outputs={};
 for(const palette of Object.values(SCENE_PALETTES)){
  const pixels=colourInks(weights,palette.colours),base=job.type==='scenes'?resolve(root,'design-board/assets/scenes/palettes',job.asset,palette.id):resolve(root,'web',job.asset+'-'+palette.id+'-v1');
  if(job.type==='scenes'){await mkdir(resolve(base,'..'),{recursive:true});await sharp(pixels,{raw}).png().toFile(base+'.png');}
  const australian=AUSTRALIAN_SCENES.find(s=>s.asset===job.asset);if(australian)for(const [suffix,width] of [['',1280],['-mobile',768]])await sharp(pixels,{raw}).resize({width,withoutEnlargement:true}).webp({quality:82}).toFile(resolve(root,'web','scene-'+australian.slug+'-'+palette.id+suffix+'-v1.webp'));
  await sharp(pixels,{raw}).webp({quality:92}).toFile(base+'.webp');outputs[palette.id]={...palette.colours,preview:relative(root,base+'.webp'),...(job.type==='scenes'?{png:relative(root,base+'.png')}:{})};
 }
 const manifest={version:1,id:job.id,type:job.type,name:job.name,width:info.width,height:info.height,source:job.source,sourceSHA256:sourceHash,algorithm:'srgb-three-ink-projection-v1',sourceInks:SOURCE_INKS,masks:Object.fromEntries(INK_ROLES.map(role=>[role,role+'-mask.png'])),maskEncoding:'8-bit grayscale coverage; the three masks sum to 255 at every pixel. Multiply each mask by its palette RGB ink and add the results.',palettes:outputs};
 await writeFile(join(master,'master.json'),JSON.stringify(manifest,null,2)+'\n');
 const portable={...manifest,source:'source'+(job.type==='scenes'?'.png':'.webp')};
 execFileSync('python3',['-c','import sys,json,zipfile,pathlib\nfolder=pathlib.Path(sys.argv[1]); data=json.loads(sys.argv[3])\nwith zipfile.ZipFile(folder/"master.zip","w",compression=zipfile.ZIP_DEFLATED) as z:\n z.write(sys.argv[2],data["source"])\n z.writestr("master.json",json.dumps(data,indent=2))\n for name in data["masks"].values(): z.write(folder/name,name)',master,source,JSON.stringify(portable)]);
 catalog.push({id:job.id,type:job.type,master:relative(root,join(master,'master.json')),bundle:relative(root,join(master,'master.zip'))});console.log(job.type+' / '+job.name+' · saved master + four palettes');
}
await writeFile(resolve(root,'design-board/assets/ink-masters/catalog.json'),JSON.stringify({version:1,palettes:SCENE_PALETTES,artworks:catalog},null,2)+'\n');
