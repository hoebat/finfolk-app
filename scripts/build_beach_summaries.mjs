import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {beachMeasurement} from '../web/measure.js';
export function summary(beach,region,features){
  const origin=beach.entry?.verified?{...beach,point:beach.entry.point,reference_label:beach.entry.label}:beach;
  const out={id:beach.id,depths:{},datum:region.contours?.datum||'unverified',survey_date:region.contours?.survey_date||null,source_url:region.contour_catalog};
  for(const depth of [5,10,15,20]){try{const result=beachMeasurement(features,origin,depth);out.start_label=result.start_label;out.start=result.start;out.depths[depth]=result.distance_m<=3000?{status:'available',distance_m:result.distance_m,target:result.target}:{status:'outside-radius'};}catch{out.depths[depth]={status:'unavailable'};}}
  return out;
}
export async function buildSummaries(site,write=true){const catalog=JSON.parse(await readFile(join(site,'data/catalog.json'),'utf8')),beaches=JSON.parse(await readFile(join(site,'beaches.json'),'utf8'));const features=new Map();for(const region of catalog.regions)features.set(region.id,JSON.parse(await readFile(join(site,region.contour_file),'utf8')).features);const output={version:1,generated_at:new Date().toISOString(),beaches:beaches.beaches.map(b=>summary(b,catalog.regions.find(r=>r.id===b.region),features.get(b.region)||[]))};if(write)await writeFile(join(site,'data/beach-summaries.json'),JSON.stringify(output));return output;}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){const out=await buildSummaries(process.argv[2]||'_site',!process.argv.includes('--stdout'));if(process.argv.includes('--stdout'))process.stdout.write(JSON.stringify(out));}
