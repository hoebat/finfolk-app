// Apply the immutable migrations only to the dedicated Next database, then
// publish the SQL hash checked by the preview API before it serves requests.
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
const environment=JSON.parse(await readFile(new URL('../next.environment.json',import.meta.url),'utf8'));
const connectionString=process.env.DATABASE_URL_UNPOOLED;
if(!connectionString)throw Error('DATABASE_URL_UNPOOLED is required for the Next release.');
const target=new URL(connectionString),auth=new URL(environment.authUrl);
const endpoint=auth.hostname.split('.')[0];
if(environment.environment!=='next' || environment.database!=='finfolk_next' || target.pathname!=='/finfolk_next' || target.hostname!==endpoint+'.ap-southeast-2.aws.neon.tech' || endpoint.includes('crimson-queen'))throw Error('Refusing a database outside the isolated Next environment.');
const sqlSha=createHash('sha256').update(await readFile(new URL('../db/generated/pilot.sql',import.meta.url))).digest('hex');
if(sqlSha!==environment.sqlSha)throw Error('Next SQL release hash is stale.');
const migrations=new URL('../backend/migrations/',import.meta.url);
const latest=(await readdir(migrations)).filter(name=>/^\d+_backbone_.*\.sql$/.test(name)).sort().at(-1);
if(!latest || createHash('sha256').update(await readFile(new URL(latest,migrations))).digest('hex')!==sqlSha)throw Error('Publish the generated SQL as a new immutable backbone migration first.');
await import('./migrate_neon.mjs');
const db=new pg.Client({connectionString});
await db.connect();
try {
 await db.query('BEGIN');
 await db.query('CREATE TABLE IF NOT EXISTS finfolk.backbone_release(id integer PRIMARY KEY CHECK(id=1),sql_sha text NOT NULL)');
 await db.query('INSERT INTO finfolk.backbone_release(id,sql_sha) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET sql_sha=excluded.sql_sha',[sqlSha]);
 await db.query('GRANT SELECT ON finfolk.backbone_release TO finfolk_api');
 await db.query('COMMIT');
 console.log('Next database release ready: '+sqlSha);
} catch(error){await db.query('ROLLBACK');throw error;}
finally {await db.end();}
