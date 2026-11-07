// Shared application boundary: only the HTTP transport and SDK call fetch APIs.
let configuration;
export async function appConfiguration(){
 configuration ||= fetch(new URL('./neon-config.json',import.meta.url),{cache:'no-cache',signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw Error('Account configuration unavailable.');return r.json();});
 try{return await configuration;}catch(error){configuration=Promise.resolve({backbone:false});return {backbone:false};}
}
export async function applicationBackbone(config){
 if(config)configuration=Promise.resolve(config);
 config ||= await appConfiguration();if(!config.backbone)return null;
 const {createApplicationBackbone}=await import('./next-backbone.js');
 const app=createApplicationBackbone(config);app.setPublicTransport((name,input,options)=>httpOperation(config,name,input,options));return app;
}
async function httpOperation(config,name,input,options={}){
 const {operations}=await import('./next-backbone.js'),spec=operations[name];
 if(!spec || spec.auth || spec.transport!=='rest')throw Error('Invalid public operation.');
 const path=spec.path.replace(/:([a-z]+)/g,(_,key)=>encodeURIComponent(input[key]));
 const url=new URL(path.replace(/^\//,''),config.apiUrl.endsWith('/')?config.apiUrl:config.apiUrl+'/');
 if(!spec.write)for(const [key,value] of Object.entries(input))if(value!=null && !spec.path.includes(':'+key))url.searchParams.set(key,String(value));
 const response=await fetch(url,{method:spec.method,cache:'no-store',referrerPolicy:'no-referrer',signal:options.signal,...(spec.write?{headers:{'Content-Type':'application/json'},body:JSON.stringify(input),keepalive:name==='publicReferral'}:{})});
 const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error?.message || result.error || 'Request failed.'),{status:response.status});return result;
}
// Retain the original transport in production and for standalone component tests.
export async function publicOperation(name,input,apiUrl,legacy,options={}){
 if(!configuration)return legacy();
 const config=await appConfiguration();if(!config.backbone)return legacy();
 if(apiUrl && new URL(apiUrl).origin!==new URL(config.apiUrl).origin)throw Error('Public API environment mismatch.');
 const app=await applicationBackbone(config);return app.public.call(name,input,options);
}
