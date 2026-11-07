// Preserve the native-generated alpha masks while making small lossless web assets.
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const {jobs}=JSON.parse(await readFile(new URL('design-board/silhouette-expansion-prompts.json',root),'utf8'));
for(const {id} of jobs){
 const input=new URL('design-board/assets/silhouettes/'+id+'.png',root),output=new URL('web/'+id+'.webp',root);
 const metadata=await sharp(input.pathname).metadata();if(!metadata.hasAlpha)throw Error(id+' must retain its transparent background.');
 await sharp(input.pathname).resize(1024,1024,{fit:'inside',withoutEnlargement:true}).webp({lossless:true}).toFile(output.pathname);
 console.log(id+' · transparent WebP');
}
