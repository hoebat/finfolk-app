import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {INK_ROLES,SOURCE_INKS,SCENE_PALETTES,rgb,separateInks,colourInks,inkPaletteId} from '../web/ink-palettes.js';
const inks=INK_ROLES.flatMap(role=>rgb(SOURCE_INKS[role])),weights=separateInks(Uint8Array.from(inks));
assert.deepEqual([...weights],[255,0,0,0,255,0,0,0,255]);
for(const palette of Object.values(SCENE_PALETTES))assert.deepEqual([...colourInks(weights,palette.colours)],INK_ROLES.flatMap(role=>rgb(palette.colours[role])));
assert.deepEqual(['yellow','cobalt','navy-light','navy'].map(theme=>inkPaletteId(theme)),['acid-light','acid-dark','muted-light','muted-dark']);
const catalog=JSON.parse(await readFile(new URL('../design-board/assets/ink-masters/catalog.json',import.meta.url),'utf8'));assert.equal(catalog.artworks.filter(a=>a.type==='scenes').length,15);assert.equal(catalog.artworks.filter(a=>a.type==='motifs').length,13);
for(const type of ['scenes','motifs']){
 const item=catalog.artworks.find(a=>a.type===type),manifestURL=new URL('../'+item.master,import.meta.url),manifest=JSON.parse(await readFile(manifestURL,'utf8'));
 const masks=await Promise.all(INK_ROLES.map(role=>sharp(new URL(manifest.masks[role],manifestURL).pathname).greyscale().raw().toBuffer()));
 const joined=new Uint8Array(masks[0].length*3);for(let i=0;i<masks[0].length;i++){assert.equal(masks.reduce((sum,m)=>sum+m[i],0),255);for(let c=0;c<3;c++)joined[i*3+c]=masks[c][i];}
 for(const palette of Object.values(SCENE_PALETTES)){const output=manifest.palettes[palette.id];const meta=await sharp(new URL('../'+output.preview,import.meta.url).pathname).metadata();assert.equal(meta.width,manifest.width);assert.equal(meta.height,manifest.height);if(output.png){const actual=await sharp(new URL('../'+output.png,import.meta.url).pathname).raw().toBuffer();assert.ok(actual.equals(Buffer.from(colourInks(joined,palette.colours))),'Saved masks reproduce the PNG at the same pixel positions');}}
 const zip=await readFile(new URL('../'+item.bundle,import.meta.url));assert.equal(zip.toString('ascii',0,2),'PK');
}
console.log('Ink palettes passed: four colourways, exact ink mappings, 28 saved masters, reusable masks and reproducible scene PNGs.');
