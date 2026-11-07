import {SESSION_EXAMPLES} from './session-data.mjs';
import {createCollectionStore,createCollectionUI} from './session-collection.mjs';
// Local Atelier attachments only. No production API or provider discovery.
export function socialAttachment(value){
 let u;try{u=new URL(value.trim());}catch{throw Error('Paste a full HTTPS Instagram post/Reel or TikTok video link.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('Use a public HTTPS post link.');
 const host=u.hostname.toLowerCase().replace(/^www\./,''),path=u.pathname;
 let match;
 if(host==='instagram.com'&&(match=path.match(/^\/(p|reel)\/([A-Za-z0-9_-]+)\/?$/)))return {kind:'social',origin:'link',platform:'Instagram',url:`https://www.instagram.com/${match[1]}/${match[2]}/`};
 if(host==='tiktok.com'&&(match=path.match(/^\/@([A-Za-z0-9._]+)\/video\/(\d+)\/?$/)))return {kind:'social',origin:'link',platform:'TikTok',url:`https://www.tiktok.com/@${match[1]}/video/${match[2]}`,creator:'@'+match[1]};
 throw Error('Use an Instagram /p/ or /reel/ link, or a full tiktok.com/@username/video/… link. Profiles, Stories and short links are not supported.');
}
export function photoError(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type))return 'Choose JPEG, PNG or WebP. Convert HEIC photos first.';if(file.size>=25*1024*1024)return 'Choose a photo smaller than 25 MB.';return '';}
const tagged=[{id:'reef',creator:'@alex.dives',title:'Morning along the reef',date:'29 October 2026',location:'Portsea Beach',image:'shore-session-sketch-v2.webp'},{id:'pool',creator:'@alex.dives',title:'A few quiet lengths',date:'25 October 2026',location:'Pool training',image:'pool-training-sketch-v2.webp'}];
export function createSessionMedia({doc=document,onView=()=>{}}={}){
 const win=doc.defaultView,dialog=doc.getElementById('profile-dialog'),body=doc.getElementById('profile-dialog-body'),title=doc.getElementById('profile-dialog-title'),close=doc.getElementById('profile-dialog-close');
 const api=globalThis.__finfolkSandbox;const records=new Map(api?.readDomain('media')||[]);for(const entries of records.values())for(const entry of entries)if(entry.blob)entry.objectURL=win.URL.createObjectURL(entry.blob);let current,host,opener,cleanup=()=>{},generation=0,disposed=false;
 const el=(tag,text,parent,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;parent.append(n);return n;};
 const button=(text,fn,parent,cls='dive-chip')=>{const b=el('button',text,parent,cls);b.type='button';b.onclick=fn;return b;};
 const localItems=()=>{if(!records.has(current))records.set(current,[]);return records.get(current);};
 const collection=createCollectionStore();
 const collectionUI=createCollectionUI({doc,store:collection,onChange:()=>render(),onView:id=>{dialog.close();onView(id);}});
 for(const p of tagged)collection.receive({platform:'Instagram',providerId:p.id,title:p.title,image:p.image,postedAt:'2026-11-02',caption:'@finfolk.com.au'});
 const items=()=>[...localItems(),...collection.forSession(current)];
 const status=parent=>{const n=el('p','',parent,'session-muted');n.setAttribute('role','status');return n;};
 function reset(){generation++;cleanup();cleanup=()=>{};body.replaceChildren();}
 function finish(){reset();if(opener?.isConnected)opener.focus();else host?.querySelector('button')?.focus();}
 close.onclick=()=>dialog.close();dialog.addEventListener('close',finish);
 function attach(values){localItems().push(...values.map(v=>({...v,id:win.crypto.randomUUID()})));render();dialog.close();}
 function open(mode='Paste link'){opener=doc.activeElement;dialog.showModal();choose(typeof mode==='string'?mode:'Paste link');close.focus();}
 function choose(mode){reset();title.textContent='Add media';const tabs=el('div',undefined,body,'media-options');for(const label of ['Paste link','Collected posts','Photos']){const b=button(label,()=>{choose(label);body.querySelector('[aria-pressed=true]')?.focus();},tabs);b.setAttribute('aria-pressed',String(mode===label));}
  el('p','Attachments stay in this session preview until reload. Your session remains private; social posts retain their original platform visibility.',body,'session-muted');
  const panel=el('section',undefined,body);el('h3',mode,panel);
  if(mode==='Paste link'){
   const form=el('form',undefined,panel,'media-form'),label=el('label','Public post or video link',form),input=el('input',undefined,label);input.type='url';input.required=true;input.placeholder='https://www.instagram.com/reel/…/';
   const check=el('button','Review link',form,'dive-chip');check.type='submit';const message=status(panel),preview=el('div',undefined,panel);
   input.oninput=()=>{preview.replaceChildren();message.textContent='';};
   form.onsubmit=e=>{e.preventDefault();preview.replaceChildren();try{const value=socialAttachment(input.value);if(items().some(i=>i.url===value.url))throw Error('This post is already attached to this session.');el('strong',value.platform,preview);el('p',value.url,preview,'media-url');const creatorLabel=el('label','Creator username (optional)',preview),creator=el('input',undefined,creatorLabel);creator.value=value.creator||'';creator.maxLength=64;button('Attach post',()=>{attach([{...value,creator:creator.value.trim()}]);},preview);message.textContent='Check the link, then attach it. No post has been fetched.';}catch(error){message.textContent=error.message;}};
  }else if(mode==='Collected posts'){
   collectionUI.renderInbox(panel);
  }else{
   const label=el('label','Choose photos · up to six per session',panel),input=el('input',undefined,label);input.type='file';input.multiple=true;input.accept='image/jpeg,image/png,image/webp';el('p','JPEG, PNG or WebP, each smaller than 25 MB. These files stay on your device.',panel,'session-muted');const feedback=status(panel),previews=el('div',undefined,panel,'media-grid');let pending=[];cleanup=()=>{for(const p of pending)win.URL.revokeObjectURL(p.objectURL);pending=[];};
   const confirm=button('Attach photos',()=>{const values=pending;pending=[];attach(values);},panel);confirm.disabled=true;
   input.onchange=async()=>{const token=++generation;cleanup();previews.replaceChildren();confirm.disabled=true;feedback.textContent='Checking photos…';const errors=[],capacity=6-items().filter(i=>i.kind==='photo').length;let accepted=0;
    for(const file of input.files){if(token!==generation||disposed)return;const error=photoError(file);if(error){errors.push(file.name+': '+error);continue;}if(accepted>=capacity){errors.push(file.name+': This session can hold up to six photos.');continue;}
     const objectURL=win.URL.createObjectURL(file),image=new win.Image();image.src=objectURL;
     try{await image.decode();}catch{win.URL.revokeObjectURL(objectURL);errors.push(file.name+': This image could not be read.');continue;}
     if(token!==generation||disposed){win.URL.revokeObjectURL(objectURL);return;}accepted++;const value={kind:'photo',origin:'device',blob:file,objectURL,name:file.name,description:''};pending.push(value);const card=el('div',undefined,previews,'media-card');const thumb=el('img',undefined,card);thumb.src=objectURL;thumb.alt=file.name;el('p',file.name,card);const label=el('label','Description (optional)',card),description=el('input',undefined,label);description.maxLength=300;description.oninput=()=>{value.description=description.value;};
    }if(token===generation){feedback.textContent=errors.join(' ')||(pending.length?'Ready to attach.':'Choose photos to continue.');confirm.disabled=!pending.length;}
   };
  }
 }
 function render(){api?.saveDomain('media',[...records]);if(!host)return;host.replaceChildren();const heading=el('div',undefined,host,'session-section-title');el('h2','Session media.',heading);button('Add media',()=>open(),heading);button('Collected posts ('+collection.inbox().length+')',()=>open('Collected posts'),heading);collectionUI.renderCode(host,SESSION_EXAMPLES.find(s=>s.id===current));el('p','Private session attachments · kept for this preview only; reload resets them.',host,'session-muted');
  const grid=el('div',undefined,host,'media-grid');if(!items().length)el('p','Bring the morning back. Add a social post, choose a tagged post or attach your own photos.',grid,'session-muted');
  for(const item of items()){const card=el('article',undefined,grid,'media-card');
   if(item.kind==='photo'||item.sample){const image=el('img',undefined,card);image.src=item.objectURL||'/board/assets/people/'+item.image;image.alt=item.description||item.title||item.name;}
   el('p',item.kind==='photo'?'Device photo':item.platform+' · '+(item.creator||'Creator on original post'),card,'session-kicker');el('h3',item.title||item.description||item.name||'Session post',card);
   if(item.sample){el('p','Fictional collected post · no original post is opened.',card,'session-muted');el('p','Posted: '+item.postedAt+' · Imported: '+new Date(item.importedAt).toLocaleDateString('en-AU')+' · Session date: '+SESSION_EXAMPLES.find(s=>s.id===current).date,card,'session-muted');button('Return to inbox',()=>{collection.returnToInbox(item.id);render();host.querySelector('button')?.focus();},card);}
   if(item.url){const link=el('a','Open original ↗',card);link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';el('p',item.url,card,'media-url');const feedback=status(card);button('Load preview',event=>{if(card.querySelector('iframe'))return;const frame=el('iframe',undefined,card);frame.title=item.platform+' session post';frame.referrerPolicy='no-referrer';frame.allow='fullscreen';frame.src=item.platform==='Instagram'?item.url+'embed/':'https://www.tiktok.com/player/v1/'+new URL(item.url).pathname.split('/').pop();frame.onerror=()=>{frame.remove();feedback.textContent='Preview unavailable. Use Open original.';};feedback.textContent='If the post is private, removed or blocked, use Open original.';},card);}
   button('Remove attachment',()=>{if(item.objectURL)win.URL.revokeObjectURL(item.objectURL);if(item.origin==='collected')collection.remove(item.id);else records.set(current,localItems().filter(i=>i!==item));render();host.querySelector('button')?.focus();},card);
  }
  const how=el('details',undefined,host,'media-help');el('summary','How tagging works',how);el('p','Post publicly on Instagram or TikTok and tag @finfolk.com.au. Posts collect in your inbox whenever they are published. Include your session hashtag to attach your own post automatically, even days later. Publication date never selects a session. Instagram webhook and TikTok collection are simulated here; neither integration is live. Paste a link as a fallback.',how);el('p','To list a post publicly on a beach, submit its link, beach and creator username through Your posts, confirm ownership, the tag and public-listing permission, then wait for review. Attaching it here does not submit or publish it. Removing an attachment leaves the original post online.',how);
 }
 return {mount(container,id){host=container;current=id;render();},destroy(){disposed=true;reset();for(const list of records.values())for(const item of list)if(item.objectURL)win.URL.revokeObjectURL(item.objectURL);dialog.removeEventListener('close',finish);close.onclick=null;},get records(){return records;}};
}
