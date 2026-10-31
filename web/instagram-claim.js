import { instagramHandle } from './logbook-model.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const stateTitles={ready:'Ready to claim',waiting:'Waiting for your message',checking:'Checking your account',follow_required:'Follow required',claimed:'Account claimed',expired:'Code expired',failed:'Could not verify',review_requested:'Review requested'};
const storagePrefix='finfolk:instagram-claim:';
export function clearInstagramClaimStorage(){try{for(const key of Object.keys(sessionStorage))if(key.startsWith(storagePrefix))sessionStorage.removeItem(key);}catch{}}
export async function renderInstagramClaim({host,api,refresh=()=>{},initialState}) {
  const root=el('section',undefined,'instagram-claim');root.id='instagram-claim';host.append(root);
  const key=api.user?.uid?storagePrefix+api.user.uid:null;
  let state=initialState,command='',savedExpiry='',checks=0,editing=false;
  try{const saved=key&&JSON.parse(sessionStorage.getItem(key)||'null');if(saved?.command && /^\/claim [a-f0-9]{24}$/i.test(saved.command)){command=saved.command;savedExpiry=saved.expiresAt;}}catch{}
  const forget=()=>{command='';savedExpiry='';try{if(key)sessionStorage.removeItem(key);}catch{}};
  const button=(text,fn,cls='secondary')=>{const b=el('button',text,cls);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(error){message.textContent=error.message;}finally{b.disabled=false;}};return b;};
  const message=el('p','Loading your Instagram link…','claim-feedback');message.setAttribute('role','status');root.append(el('h2','Link Instagram'),message);
  async function load(){const next=await api.call('instagramClaimStatus');if(JSON.stringify(next)!==JSON.stringify(state)){state=next;draw();}}
  async function generate(){
    const data=await api.call('instagramClaimStart');command=data.command;savedExpiry=data.expiresAt;
    try{if(key)sessionStorage.setItem(key,JSON.stringify({command,expiresAt:savedExpiry}));}catch{}
    state={...state,state:'waiting',expiresAt:data.expiresAt,error:''};checks=0;draw();message.textContent='Your command is ready. Follow @finfolk.com.au, then send it as a direct message.';
  }
  async function remove(){
    await api.call('instagramDisconnect');forget();editing=false;state=await api.call('instagramClaimStatus');draw();
    message.textContent='Link removed. You can link another Instagram account.';await refresh();
  }
  function external(label,url){const a=el('a',label,'claim-instagram-link');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
  function draw(){
    const stage=state?.state || 'ready';
    if(['claimed','expired','ready'].includes(stage))forget();
    if(savedExpiry && state?.expiresAt && new Date(savedExpiry).getTime()!==new Date(state.expiresAt).getTime())forget();
    root.replaceChildren(el('h2','Link Instagram'),message);message.textContent='';
    if(stage==='claimed'){
      root.append(el('strong','Instagram verified','claim-state'),external('@'+state.handle,'https://www.instagram.com/'+encodeURIComponent(state.handle)+'/'),el('p','Your Instagram account is connected to FinFolk.'),button('Remove link',remove));
    }else if(!state?.enabled){
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
      const active=['waiting','checking','follow_required','failed','review_requested'].includes(stage);
      if(!active){
        root.append(el('p','Follow @finfolk.com.au, then send us your personal command to verify your account.'),button('Start linking',generate,'primary'));
        return;
      }
      const steps=el('ol',undefined,'instagram-claim-steps'),follow=el('li');follow.append(el('h3','Follow @finfolk.com.au'),external('Open Instagram ↗','https://www.instagram.com/finfolk.com.au/'));steps.append(follow);
      const send=el('li');send.append(el('h3','Send this in a message'));
      if(command && new Date(savedExpiry).getTime()>Date.now()){
        const label=el('label','Your personal command'),code=el('input');code.name='instagram-claim-command';code.value=command;code.readOnly=true;code.autocomplete='off';label.append(code);send.append(label);
        send.append(button('Copy command',async()=>{
          if(new Date(savedExpiry).getTime()<=Date.now()){state={...state,state:'expired'};draw();return;}
          try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(command);message.textContent='Copied. In Instagram, tap Message, paste this command and send.';}catch{code.select();message.textContent='Select and copy the command, then paste it into a message to @finfolk.com.au.';}
        },'primary'));
      }else send.append(el('p','Generate a new command to continue.'),button('Get a new command',generate,'primary'));
      send.append(el('p','Tap Message on our Instagram profile, paste the command and send. This page will update automatically.'));steps.append(send);root.append(steps,el('strong',stateTitles[stage] || 'Waiting for your message','claim-state'));
      if(stage==='follow_required')root.append(el('p','Follow @finfolk.com.au, then resend the same command.'));
      if(stage==='checking')root.append(el('p','Your message arrived. We’re checking your account.'));
      if(stage==='review_requested')root.append(el('p','Your claim is waiting for manual review.'));
      if(state?.error && ['failed','review_requested'].includes(stage))root.append(el('p',state.error));
      const help=el('details');help.append(el('summary','Need help?'),button('Check status',load));
      if(savedExpiry)help.append(el('p','Your command expires '+new Date(savedExpiry).toLocaleString('en-AU',{dateStyle:'medium',timeStyle:'short'})+'.'));
      help.append(button('Generate a replacement command',generate));
      if(state?.reviewAvailable && ['failed','follow_required'].includes(stage))help.append(button('Request manual review',async()=>{await api.call('instagramClaimRequestReview');await load();}));root.append(help);
    }
    const guide=el('details',undefined,'instagram-command-guide');guide.append(el('summary','Instagram DM commands'));
    for(const [syntax,description]of[['/ping','Check that FinFolk is responding.'],['/help','See commands and examples.'],['/status','Check your connection.'],['/checkin <beach>','Record today’s beach visit.'],['/points','See your points.']]){const row=el('p');row.append(el('code',syntax),document.createTextNode(' — '+description));guide.append(row);}root.append(guide);
  }
  try{if(!state)state=await api.call('instagramClaimStatus');draw();}catch(error){root.replaceChildren(el('h2','Link Instagram'),message);message.textContent=error.message;root.append(button('Retry',load));}
  const timer=setInterval(()=>{
    if(!root.isConnected || checks>=24 || ['claimed','expired'].includes(state?.state)){clearInterval(timer);return;}
    if(document.hidden || !['waiting','checking','follow_required'].includes(state?.state))return;
    checks++;load().catch(()=>{message.textContent='Status could not refresh. Use Check status to retry.';});
  },5000);timer.unref?.();
  const onVisibility=()=>{if(!root.isConnected){document.removeEventListener('visibilitychange',onVisibility);return;}if(!document.hidden && state?.enabled && state?.state!=='claimed')load().catch(()=>{});};
  document.addEventListener('visibilitychange',onVisibility);
  return root;
}
export async function renderInstagramClaimReview({host,api}){
  const root=el('details');root.append(el('summary','Requested Instagram claim reviews'));host.append(root);
  root.addEventListener('toggle',async()=>{
    if(!root.open || root.dataset.loaded)return;
    const status=el('p');status.setAttribute('role','status');root.append(status);
    try{
      const claims=await api.call('instagramClaimReviewInbox');root.dataset.loaded='true';
      if(!claims.length)root.append(el('p','No requested reviews.'));
      for(const claim of claims){
        const card=el('section',undefined,'buddy-card');card.append(el('h3','Instagram claim review'),el('p',`Message sender: ${claim.sender_id}`),el('p',claim.error || 'Automatic verification did not complete.'));
        const field=(text,type='text')=>{const label=el('label',text),input=el('input');input.type=type;label.append(input);card.append(label);return input;};
        const handle=field('Username checked against the actual Instagram message');handle.value=claim.handle || '';
        const sender=field('I checked the actual message sender.','checkbox'),follow=field('I checked that this account follows @finfolk.com.au.','checkbox'),reason=field('Reason if rejecting this request');
        for(const decision of ['approve','reject']){const button=el('button',decision==='approve'?'Approve claim':'Reject claim','secondary');button.type='button';button.onclick=async()=>{button.disabled=true;try{await api.call('instagramClaimReview',{userId:claim.user_id,decision,handle:handle.value,senderChecked:sender.checked,followChecked:follow.checked,reason:reason.value});card.replaceChildren(el('p',decision==='approve'?'Claim approved.':'Claim rejected.'));}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};card.append(button);}root.append(card);
      }
    }catch(error){status.textContent=error.message;}
  });
}
