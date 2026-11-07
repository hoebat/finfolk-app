// Export social avatars from the locked vector master, preserving its contour.
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {VISUAL_PALETTES} from '../web/visual-language.js';

const root=new URL('../',import.meta.url);
const output=new URL('design-board/assets/social/slow-melt-v2/',root);
await mkdir(output,{recursive:true});
const master=await readFile(new URL('web/finfolk-mark.svg',root),'utf8');
const contour=master.match(/\bd="([^"]+)"/)[1];
const variants=[
 {id:'ivory',name:'Warm ivory',background:'#eee5d3',foreground:'#172440'},
 ...VISUAL_PALETTES.map(({id,name,palette})=>({id,name,background:palette.paper,foreground:palette.ink})),
];
const size=1080;
// The 224-unit master height becomes 71.75% of the canvas, clear of a circle crop.
const transform='translate(128 128) scale(.82) translate(-128 -128)';
const svgFor=(variant,circle=false)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="${size}" height="${size}" role="img" aria-label="Finfolk Slow melt f — ${variant.name}">${circle?`<defs><clipPath id="circle"><circle cx="128" cy="128" r="128"/></clipPath></defs><g clip-path="url(#circle)">`:''}<rect width="256" height="256" fill="${variant.background}"/><path fill="${variant.foreground}" transform="${transform}" d="${contour}"/>${circle?'</g>':''}</svg>\n`;
const maskSvg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="white" transform="${transform}" d="${contour}"/></svg>`;
const {data:mask,info:maskInfo}=await sharp(Buffer.from(maskSvg)).resize(size,size).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let furthest=0;
for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(mask[(y*size+x)*maskInfo.channels+3]>0)furthest=Math.max(furthest,Math.hypot(x+.5-size/2,y+.5-size/2));
assert.ok(furthest<size*.44,'All visible artwork must fit well inside the circular crop');

const previewLayers=[];
const previewWidth=1440,previewHeight=730;
let labels='';
for(const [i,variant] of variants.entries()){
 const stem=`finfolk-social-${variant.id}-v2`;
 const svg=svgFor(variant);
 assert.equal(svg.match(/\bd="([^"]+)"/)[1],contour,'Keep the locked f contour');
 await writeFile(new URL(stem+'.svg',output),svg);
 const png=await sharp(Buffer.from(svg)).png().toBuffer();
 const metadata=await sharp(png).metadata();
 assert.equal(metadata.width,size);assert.equal(metadata.height,size);
 await writeFile(new URL(stem+'.png',output),png);
 const left=54+i*350;
 previewLayers.push({input:await sharp(png).resize(280,280).png().toBuffer(),left,top:132});
 previewLayers.push({input:await sharp(Buffer.from(svgFor(variant,true))).resize(96,96).png().toBuffer(),left:left+44,top:454});
 previewLayers.push({input:await sharp(Buffer.from(svgFor(variant,true))).resize(48,48).png().toBuffer(),left:left+188,top:478});
 labels+=`<text x="${left}" y="600" font-size="21" font-weight="600">${variant.name}</text><text x="${left}" y="628" font-size="14" fill="#626b7a">${variant.foreground} on ${variant.background}</text>`;
}
const typography=`<svg xmlns="http://www.w3.org/2000/svg" width="${previewWidth}" height="${previewHeight}"><g fill="#172440" font-family="Helvetica, Arial, sans-serif"><text x="54" y="49" font-size="13" letter-spacing="2.5">FINFOLK / SLOW MELT / SOCIAL LOGOS</text><text x="54" y="89" font-size="28" font-weight="600">One familiar f. Four colourways.</text>${labels}<text x="54" y="692" font-size="14" fill="#626b7a">1080 × 1080 upload files · circular previews at 96 and 48 px · exact locked vector contour</text></g></svg>`;
previewLayers.push({input:Buffer.from(typography),left:0,top:0});
await sharp({create:{width:previewWidth,height:previewHeight,channels:4,background:'#f7f5ef'}}).composite(previewLayers).png().toFile(fileURLToPath(new URL('finfolk-social-logos-v2-preview.png',output)));
await writeFile(new URL('manifest.json',output),JSON.stringify({
 identity:'slow-melt-f',version:2,usage:'Instagram and TikTok profile photos',
 method:'Deterministic SVG export from the locked single-f master; no AI redrawing.',
 source:'../../../../web/finfolk-mark.svg',dimensions:{width:size,height:size},
 circleCrop:{artworkMaximumRadius:furthest/size,minimumRadialPadding:.5-furthest/size},
 variants:variants.map(variant=>({...variant,png:`finfolk-social-${variant.id}-v2.png`,svg:`finfolk-social-${variant.id}-v2.svg`})),
 preview:'finfolk-social-logos-v2-preview.png',
},null,2)+'\n');
console.log(`Exported ${variants.length} social logos at ${size} × ${size}, SVG masters and crop preview to ${fileURLToPath(output)}`);
console.log(`Circular-crop radial clearance: ${(100*(.5-furthest/size)).toFixed(1)}% of canvas width. Locked contour preserved.`);
