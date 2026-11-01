import { openInstagramConnect, closeInstagramConnectDialogs } from './instagram-connect.js';
import { instagramHandle } from './logbook-model.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const storagePrefix='finfolk:instagram-claim:';
export function clearInstagramClaimStorage(){closeInstagramConnectDialogs();try{for(const key of Object.keys(sessionStorage))if(key.startsWith(storagePrefix))sessionStorage.removeItem(key);}catch{}}
export async function renderInstagramClaim({host,api,refresh=()=>{},initialState}) {
  const root=el('section',undefined,'instagram-claim');root.id='instagram-claim';host.append(root);
  const key=api.user?.uid?storagePrefix+api.user.uid:null;
  let state=initialState,editing=false;
  const forget=()=>{try{if(key)sessionStorage.removeItem(key);}catch{}};
  const button=(text,fn,cls='secondary')=>{const b=el('button',text,cls);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(error){message.textContent=error.message;}finally{b.disabled=false;}};return b;};
  const message=el('p','Loading your Instagram link…','claim-feedback');message.setAttribute('role','status');root.append(el('h2','Link Instagram'),message);
  async function load(){const next=await api.call('instagramClaimStatus');if(JSON.stringify(next)!==JSON.stringify(state)){state=next;draw();}}
  async function remove(){
    await api.call('instagramDisconnect');forget();editing=false;state=await api.call('instagramClaimStatus');draw();
    message.textContent='Link removed. You can link another Instagram account.';await refresh();
  }
  function external(label,url){const a=el('a',label,'claim-instagram-link');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
  function draw(){
    const stage=state?.state || 'ready';
    if(['claimed','expired','ready'].includes(stage))forget();
    root.replaceChildren(el('h2','Link Instagram'),message);message.textContent='';
    if(stage==='claimed'){
      root.append(el('strong','Instagram connected','claim-state'),external('@'+state.handle,'https://www.instagram.com/'+encodeURIComponent(state.handle)+'/'),el('p','Your Instagram account is connected to FinFolk.'),button('Remove link',remove));
    }else if(!state?.capabilities?.connect){
      const handle=state?.profileUrl?instagramHandle(state.profileUrl):'';
      if(handle && !editing){
        root.append(el('strong','Profile linked · not verified','claim-state'),external('@'+handle,state.profileUrl),el('p','Your Instagram profile link is saved.'),button('Change account',()=>{editing=true;draw();root.querySelector('input')?.focus();}),button('Remove link',remove));
      }else{
        root.append(el('p','Add your Instagram profile to FinFolk.'));
        const form=el('form'),label=el('label','Instagram username'),input=el('input');input.name='instagram-handle';input.placeholder='@yourname';input.autocomplete='off';input.spellcheck=false;input.required=true;input.maxLength=250;input.value=handle?'@'+handle:'';label.append(input);form.append(label);
        const preview=external('Open profile to check ↗','#');preview.hidden=true;
        const updatePreview=()=>{try{const username=instagramHandle(input.value);preview.hidden=!username;if(username){preview.href='https://www.instagram.com/'+encodeURIComponent(username)+'/';preview.textContent='Open @'+username+' ↗';}}catch{preview.hidden=true;}};
        input.oninput=updatePreview;updatePreview();form.append(preview);

        const submit=el('button',handle?'Save change':'Link profile','primary');submit.type='submit';form.append(submit);
        if(handle)form.append(button('Cancel',()=>{editing=false;draw();}));
        form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try{const username=instagramHandle(input.value);if(!username)throw Error('Enter your Instagram username.');const result=await api.call('instagramProfileLink',{handle:username});state={...state,profileUrl:result.profileUrl};editing=false;draw();await refresh();}catch(error){message.textContent=error.message;}finally{submit.disabled=false;}};root.append(form);
      }
      root.append(el('p','This saves a profile link. Verification by Instagram message is not available yet.','claim-note'));
      return;
    }else{
      if(api.user?.emailVerified===false){root.append(el('p','Verify your FinFolk email before linking Instagram.'),button('Verify email',()=>{document.getElementById('account-tab-profile')?.click();document.getElementById('account-email-verification')?.scrollIntoView?.({block:'start'});}));return;}
      root.append(el('p','Follow @finfolk.com.au, send /connect, then enter the code from our reply.'),button('Connect Instagram',()=>{
        openInstagramConnect({owner:root,api,onDone:refresh,onConnected:async result=>{
          forget();state={...state,...result};draw();
        }});
      },'primary'));
    }
    const guide=el('details',undefined,'instagram-command-guide');guide.append(el('summary','Instagram DM commands'));
    for(const [syntax,description]of[['/ping','Check that FinFolk is responding.'],['/help','See commands and examples.'],['/status','Check your connection.'],['/checkin <beach>','Record today’s beach visit.'],['/points','See your points.']]){const row=el('p');row.append(el('code',syntax),document.createTextNode(' — '+description));guide.append(row);}root.append(guide);
  }
  try{if(!state)state=await api.call('instagramClaimStatus');draw();}catch(error){root.replaceChildren(el('h2','Link Instagram'),message);message.textContent=error.message;root.append(button('Retry',load));}
  return root;
}
// Compatibility export for older page composition; linking is self-service via /connect.
export async function renderInstagramClaimReview() {}
