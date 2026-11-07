import http from 'node:http';
import {existsSync} from 'node:fs';
import {readFile,writeFile,rename,mkdir,stat,realpath,unlink} from 'node:fs/promises';
import {resolve,dirname,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {PRESETS,validateTheme,compileTheme} from '../design-board/theme-engine.mjs';
import {previewResponse} from '../design-board/preview-data.mjs';
const PROJECT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpeg':'image/jpeg','.jpg':'image/jpeg','.gz':'application/gzip','.woff2':'font/woff2'};
async function optional(path){try{return await readFile(path,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function atomic(path,body){await mkdir(dirname(path),{recursive:true});const temporary=path+'.moodboard-'+randomBytes(6).toString('hex');try{await writeFile(temporary,body);await rename(temporary,path);}finally{await unlink(temporary).catch(()=>{});}}
export function createMoodboardServer({projectRoot=PROJECT,siteDirectory=join(projectRoot,'.cache/moodboard/site')}={}){
 const token=randomBytes(32).toString('hex'),themePath=join(projectRoot,'config/atelier-theme.json'),cssPath=join(projectRoot,'web/atelier-theme.css'),backupPath=join(projectRoot,'.cache/moodboard/previous.json');
 let mutating=false;
 const current=async()=>{const raw=await optional(themePath);return raw?validateTheme(JSON.parse(raw)):structuredClone(PRESETS.original);};
 async function snapshot(){return {theme:await optional(themePath),css:await optional(cssPath)};}
 async function install(theme,css){
  const previous=await snapshot();await atomic(backupPath,JSON.stringify(previous));
  try{await atomic(cssPath,css);if(theme===null)await unlink(themePath).catch(e=>{if(e.code!=='ENOENT')throw e;});else await atomic(themePath,theme);}
  catch(error){if(previous.css!==null)await atomic(cssPath,previous.css);else await unlink(cssPath).catch(()=>{});if(previous.theme!==null)await atomic(themePath,previous.theme);else await unlink(themePath).catch(()=>{});throw error;}
 }
 function send(res,status,body,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));}
 async function serve(res,base,relative,{inject=false}={}){
  const root=await realpath(base),candidate=await realpath(resolve(base,relative||'index.html'));
  if(candidate!==root&&!candidate.startsWith(root+sep))return send(res,404,{error:'Not found'});
  if(!(await stat(candidate)).isFile())return send(res,404,{error:'Not found'});
  let body=await readFile(candidate);
  if(inject)body=body.toString().replace('</head>','<link rel="stylesheet" href="/board/select-controls.css"><link rel="stylesheet" href="/board/workflow-design.css"><meta name="robots" content="noindex,nofollow"><script>try{localStorage.setItem("finfolk:welcome","1")}catch{}</script></head>').replace('</body>','<script type="module" src="/board/preview-bridge.js"></script></body>');
  if(extname(candidate)==='.html'&&res.sandbox)body=body.toString().replace(/<head[^>]*>/,m=>m+'<script src="/board/sandbox-boot.js"></script>');
  send(res,200,body,mime[extname(candidate)]||'application/octet-stream');
 }
 const server=http.createServer(async(req,res)=>{
  try{
   const address=server.address(),port=address&&typeof address==='object'?address.port:0,host=req.headers.host;
   if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host))return send(res,403,{error:'Loopback access only'});
   const url=new URL(req.url,'http://'+host),path=decodeURIComponent(url.pathname);
   res.sandbox=url.searchParams.get('sandbox')==='1';
   if(req.method==='GET'&&(path==='/try/'||path==='/try'))return await serve(res,join(projectRoot,'design-board'),'sandbox.html');
   if(req.method==='GET'&&path==='/api/bootstrap')return send(res,200,{theme:await current(),canRestore:(await optional(backupPath))!==null,token,project:projectRoot});
   if(req.method==='POST'&&['/api/apply','/api/restore'].includes(path)){
    if(req.headers.origin!=='http://'+host||req.headers['content-type']?.split(';')[0]!=='application/json')return send(res,403,{error:'Use the local mood board to save changes.'});
    const supplied=Buffer.from(String(req.headers['x-moodboard-token']||'')),expected=Buffer.from(token);
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return send(res,403,{error:'Reload the mood board before saving.'});
    if(mutating)return send(res,409,{error:'A save is already in progress.'});
    if(Number(req.headers['content-length'])>65536)return send(res,413,{error:'Theme file is too large.'});
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65536)return send(res,413,{error:'Theme file is too large.'});}
    const payload=JSON.parse(body||'{}');mutating=true;
    try{
     if(path==='/api/apply'){const theme=validateTheme(payload.theme);await install(JSON.stringify(theme,null,2)+'\n',compileTheme(theme));}
     else{const raw=await optional(backupPath);if(!raw)return send(res,404,{error:'There is no previous local theme yet.'});const previous=JSON.parse(raw);await install(previous.theme,previous.css||'/* Original FinFolk appearance. */\n');}
     return send(res,200,{theme:await current(),canRestore:true});
    }finally{mutating=false;}
   }
   if(req.method!=='GET')return send(res,405,{error:'Method not supported'});
   if(path.startsWith('/preview-api/')){const response=previewResponse(path);return send(res,response?200:404,response||{error:'Local preview endpoint unavailable'});}
   if(path==='/'||path==='/moodboard')return await serve(res,join(projectRoot,'design-board'),'index.html');
   if(/^\/web\/(?:feature-demos|demo-locations|animal-prints|animal-decoration|brand|visual-language|ink-palettes|australian-scenes|habitat|state-motifs|state-outlines|beach-thumbnail)\.js$/.test(path))return await serve(res,join(projectRoot,'web'),path.slice(5));
   if(/^\/web\/animal-(?:bluebottle|boxjelly|octopus|stonefish|lionfish|conesnail|seasnake|stingray|moray|bluedragon|irukandji|toadfish|seaurchin)(?:-hyper|-acid-light|-acid-dark|-muted-light|-muted-dark)?-v1\.webp$/.test(path))return await serve(res,join(projectRoot,'web'),path.slice(5));
   if(/^\/web\/(?:freediver-(?:ascending|descending|gliding)|swimmer-(?:freestyle|breaststroke|duck-dive|back-float)|habitat-(?:seagrass|reef-rocks|stingray|turtle|kelp|fan-coral|reef-arch|schooling-fish))-v1\.webp$/.test(path))return await serve(res,join(projectRoot,'web'),path.slice(5));
   if(/^\/web\/demo-(?:alex|maya|kai|shore)(?:-sketch-v2)?\.webp$/.test(path))return await serve(res,join(projectRoot,'web'),path.slice(5));
   if(path.startsWith('/board/'))return await serve(res,join(projectRoot,'design-board'),path.slice(7));
   if(path==='/preview') {res.writeHead(302,{Location:'/preview/'});return res.end();}
   if(path.startsWith('/preview/')){
    const relative=path.slice(9)||'index.html';
    if(relative==='neon-config.json')return send(res,200,{enabled:true,authUrl:'http://'+host+'/preview-api/auth',apiUrl:'http://'+host+'/preview-api/',googleEnabled:true,instagram:{enabled:false}});
    if(/^neon-client(?:\.[a-f0-9]+)?\.js$/.test(relative))return await serve(res,join(projectRoot,'design-board'),'preview-client.js');
    if(relative==='sw.js')return send(res,200,'self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",event=>event.waitUntil(self.registration.unregister()));','text/javascript');
    if(/^atelier-theme(?:\.[a-f0-9]+)?\.css$/.test(relative))return send(res,200,await optional(cssPath)||'','text/css; charset=utf-8');
    if(/^feature-demos(?:\.[a-f0-9]+)?\.(?:js|css)$/.test(relative))return await serve(res,join(projectRoot,'web'),'feature-demos.'+extname(relative).slice(1));
    if(/^demo-(?:alex|maya|kai|shore)(?:-sketch-v2)?\.webp$/.test(relative))return await serve(res,join(projectRoot,'web'),relative);
    const liveCSS=relative.match(/^(style|mobile)(?:\.[a-f0-9]+)?\.css$/);
    if(liveCSS)return await serve(res,join(projectRoot,'web'),liveCSS[1]+'.css');
    return await serve(res,siteDirectory,relative,{inject:relative==='index.html'||relative==='landing.html'});
   }
   send(res,404,{error:'Not found'});
  }catch(error){if(res.headersSent){res.end();return;}send(res,error.code==='ENOENT'?404:400,{error:error.code==='ENOENT'?'Not found':error.message||'Request failed'});}
 });
 return server;
}
async function main(){
 const args=process.argv.slice(2),portIndex=args.indexOf('--port'),siteIndex=args.indexOf('--site');
 const port=portIndex<0?8770:Number(args[portIndex+1]),siteDirectory=siteIndex<0?join(PROJECT,'.cache/moodboard/site'):resolve(args[siteIndex+1]);
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Choose a port between 1024 and 65535.');
 if(args.includes('--rebuild')||!(await optional(join(siteDirectory,'index.html')))){
  console.log('Preparing a local preview from the bundled beach directory…');
  const python=process.env.PYTHON||(existsSync(join(PROJECT,'.venv/bin/python'))?join(PROJECT,'.venv/bin/python'):'python3');
  const code='from pathlib import Path\nfrom depth_explorer.static import build\nfrom depth_explorer.store import Store\nimport sys\nbuild(Store(Path(sys.argv[1])),Path(sys.argv[2]),max_zoom=5)';
  const build=spawnSync(python,['-c',code,join(PROJECT,'.cache/moodboard/datasets'),siteDirectory],{cwd:PROJECT,stdio:'inherit'});
  if(build.status!==0)throw Error('Preview build failed. Set PYTHON to the project virtual environment and run npm run moodboard again.');
 }
 const server=createMoodboardServer({projectRoot:PROJECT,siteDirectory});
 server.on('error',error=>{console.error(error.message);process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>console.log(`FinFolk mood board: http://127.0.0.1:${port}/\nLocal checkout: ${PROJECT}\nChanges are saved only when you choose Save to local FinFolk.`));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
