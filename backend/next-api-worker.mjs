import {createAPI,managedVerifier} from './api.mjs';
import {database} from './db.mjs';
const verifiers=new Map();
export default {
 async fetch(request,env,ctx){
  if(!env.HYPERDRIVE || !env.NEON_AUTH_BASE_URL || env.NEON_AUTH_BASE_URL.includes('ep-crimson-queen') || env.DB_BACKBONE_ENABLED!=='true')return Response.json({error:'Next backend is not isolated and ready.'},{status:503});
  const db=database(env.HYPERDRIVE.connectionString);
  try {
   const release=(await db.query('SELECT sql_sha FROM finfolk.backbone_release WHERE id=1'))[0];
   if(release?.sql_sha!==env.DB_SQL_SHA)return Response.json({error:'Next database release mismatch.'},{status:503});
   if(new URL(request.url).pathname==='/health')return Response.json({environment:'next',backbone:'Clojure/Postgres + xt.substrate + xt.db',ready:true,sqlSha:env.DB_SQL_SHA},{headers:{'Cache-Control':'no-store'}});
   let verify=verifiers.get(env.NEON_AUTH_BASE_URL);
   if(!verify){verify=managedVerifier(env);verifiers.set(env.NEON_AUTH_BASE_URL,verify);}
   return await createAPI({db,verify,origins:['https://next.finfolk.com.au','http://localhost:8000','http://127.0.0.1:8000']}).fetch(request,env,ctx);
  } finally {ctx.waitUntil(db.pool.end());}
 }
};
