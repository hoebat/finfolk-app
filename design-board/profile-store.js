const databaseName='finfolk:profile-showcase:v1';
export function createProfileStore(indexedDB){
 if(globalThis.__finfolkSandbox)return globalThis.__finfolkSandbox.profileStore();
 try{indexedDB??=globalThis.indexedDB;}catch{}
 let pending;
 function db(){if(!pending)pending=new Promise((resolve,reject)=>{if(!indexedDB){reject(Error('Browser storage is unavailable.'));return;}const request=indexedDB.open(databaseName,1);request.onupgradeneeded=()=>{for(const name of ['state','portraits'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return pending;}
 return {
  async load(){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction(['state','portraits'],'readonly'),state=tx.objectStore('state').get('local'),portrait=tx.objectStore('portraits').get('mine');tx.oncomplete=()=>resolve({state:state.result||null,portrait:portrait.result||null});tx.onerror=()=>reject(tx.error);});},
  async save(state,{portrait}={}){const database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction(['state','portraits'],'readwrite');tx.objectStore('state').put(structuredClone(state),'local');if(portrait===null)tx.objectStore('portraits').delete('mine');else if(portrait!==undefined)tx.objectStore('portraits').put(portrait,'mine');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Local changes could not be saved.'));});},
  async close(){if(pending)(await pending).close();},
 };
}
