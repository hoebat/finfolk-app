import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';import {createHash} from 'node:crypto';
const source=resolve(process.argv[2] || '../statstrade-v2/js/statstrade-app/packages/libs');
const seen=new Set(),files={};
async function copy(spec){
 if(seen.has(spec))return;seen.add(spec);
 const [,family,...parts]=spec.split('/');
 const name=parts.join('/');const from=resolve(source,'xt-'+family,name);const to=resolve('vendor/xtalk',family,name);
 const data=await readFile(from,'utf8');await mkdir(dirname(to),{recursive:true});await writeFile(to,data);
 files[spec]=createHash('sha256').update(data).digest('hex');
 for(const m of data.matchAll(/require\("(@xtalk\/[^"\n]+)"\)/g))await copy(m[1]);
}
for(const entry of ['@xtalk/substrate/substrate.js','@xtalk/substrate/page-core.js','@xtalk/event/base-model.js','@xtalk/db/system/impl-memory.js','@xtalk/db/system/memory-util.js'])await copy(entry);
await copyFile(resolve(source,'../../../../ref/foundation/LICENSE'),'vendor/xtalk/LICENSE').catch(async()=>{await copyFile('../statstrade-v2/ref/foundation/LICENSE','vendor/xtalk/LICENSE');});
await writeFile('vendor/xtalk/provenance.json',JSON.stringify({familyVersion:'0.1.0',foundationVersion:'4.1.8',source:'statstrade-v2 generated XTalk runtime',files},null,2)+'\n');
console.log('Vendored',seen.size,'runtime modules with hashes and license.');
