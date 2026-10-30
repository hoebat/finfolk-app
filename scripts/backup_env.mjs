import {readFile,writeFile,mkdir,chmod,readdir} from 'node:fs/promises';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {homedir} from 'node:os';
import {join,resolve,basename} from 'node:path';
const source=resolve(process.argv[2] || '.env.local');
const sourceName=basename(source);
if(!/^\.env(?:\.[A-Za-z0-9_-]+)+$/.test(sourceName))throw Error('Expected an environment file such as .env.local or .env.test.local.');
const backupDir=join(homedir(),'Library','Application Support','FinFolk','env-backups');
const keyDir=join(homedir(),'.config','finfolk');
const keyPath=join(keyDir,'env-backup.key');
await mkdir(backupDir,{recursive:true,mode:0o700});await chmod(backupDir,0o700);
await mkdir(keyDir,{recursive:true,mode:0o700});await chmod(keyDir,0o700);
let key;
try {key=await readFile(keyPath);}catch(e){
 if(e.code!=='ENOENT')throw e;
 if((await readdir(backupDir)).some(n=>n.endsWith('.enc.json')))throw Error('Backup key is missing. Restore it before creating another backup.');
 key=randomBytes(32);await writeFile(keyPath,key,{mode:0o600,flag:'wx'});
}
if(key.length!==32)throw Error('Invalid backup key.');await chmod(keyPath,0o600);
const plaintext=await readFile(source);await chmod(source,0o600);
const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
const document={version:1,source:sourceName,algorithm:'aes-256-gcm',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
const file=join(backupDir,'finfolk-'+sourceName.replace(/^\./,'').replaceAll('.','-')+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.enc.json');
await writeFile(file,JSON.stringify(document),{mode:0o600,flag:'wx'});
// Verify the file on disk without writing a second plaintext copy.
const saved=JSON.parse(await readFile(file,'utf8')),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(saved.iv,'base64'));
decipher.setAuthTag(Buffer.from(saved.tag,'base64'));
if(!Buffer.concat([decipher.update(Buffer.from(saved.ciphertext,'base64')),decipher.final()]).equals(plaintext))throw Error('Backup verification failed.');
console.log('Encrypted environment backup verified: '+file);
console.log('Recovery key is stored separately at: '+keyPath);
