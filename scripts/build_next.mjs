import {execFileSync} from 'node:child_process';
import {readdir,stat,readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {resolve,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const environment=JSON.parse(await readFile('next.environment.json','utf8'));
if(environment.environment!=='next' || environment.database!=='finfolk_next' || environment.authUrl.includes('crimson-queen') || !environment.authUrl.includes('.neonauth.'))throw Error('Refusing non-isolated Next build.');
execFileSync(process.execPath,['scripts/generate_db.mjs','--check'],{stdio:'inherit'});
const sqlSha=createHash('sha256').update(await readFile('db/generated/pilot.sql')).digest('hex');
const apiConfig=JSON.parse(await readFile('wrangler.next-api.jsonc','utf8'));
if(sqlSha!==environment.sqlSha || apiConfig.vars.DB_SQL_SHA!==sqlSha)throw Error('Next release hashes do not match the generated SQL.');
execFileSync(process.execPath,['scripts/bundle_backbone.mjs'],{stdio:'inherit'});
const root=resolve('.cache/next-site');
execFileSync(process.env.PYTHON || '.venv/bin/python',['-m','depth_explorer','build-static','--output',root],{stdio:'inherit',env:{...process.env,NEON_AUTH_BASE_URL:environment.authUrl,NEON_API_URL:'https://next.finfolk.com.au/'}});
await writeFile(resolve(root,'CNAME'),'next.finfolk.com.au\n');
await writeFile(resolve(root,'robots.txt'),'User-agent: *\nDisallow: /\n');
await writeFile(resolve(root,'_headers'),'/*\n  X-Robots-Tag: noindex, nofollow\n');
const index=resolve(root,'index.html');
let html=await readFile(index,'utf8');
html=html.replace('<title>FinFolk</title>','<title>FinFolk Next · Preview</title>').replace('</head>','<meta name="robots" content="noindex,nofollow"></head>');
html=html.replace('</body>','<aside style="position:fixed;bottom:85px;right:12px;z-index:1000;background:#173e48;color:#fff;padding:8px 12px;border-radius:10px;font:12px system-ui;pointer-events:none">FinFolk Next · DSL / Substrate</aside></body>');
await writeFile(index,html);
async function compress(directory) {
 for(const entry of await readdir(directory,{withFileTypes:true})) {
  if(entry.name==='__compressed')continue;
  const path=resolve(directory,entry.name);
  if(entry.isDirectory()){await compress(path);continue;}
  if((await stat(path)).size <= 25*1024**2)continue;
  if(!relative(root,path).startsWith('data/'))throw Error('Oversized asset outside data: '+path);
  const packed=gzipSync(await readFile(path),{level:9});
  if(packed.length>25*1024**2)throw Error('Compressed asset still exceeds upload limit: '+path);
  const target=resolve(root,'__compressed',relative(root,path)+'.gz');
  await mkdir(dirname(target),{recursive:true});await writeFile(target,packed);await unlink(path);
 }
}
await compress(root);
const config=JSON.parse(await readFile(resolve(root,'neon-config.json'),'utf8'));
if(!config.enabled || config.authUrl!==environment.authUrl || config.apiUrl!=='https://next.finfolk.com.au/')throw Error('Preview isolation verification failed.');
config.backbone=true;config.googleEnabled=false;config.environment='next';config.sqlSha=environment.sqlSha;
await writeFile(resolve(root,'neon-config.json'),JSON.stringify(config));
console.log('FinFolk Next built with isolated account access and substrate models.');
