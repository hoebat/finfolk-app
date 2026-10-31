const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const stateTitles={ready:'Ready to claim',waiting:'Waiting for your message',checking:'Checking your account',follow_required:'Follow required',claimed:'Account claimed',expired:'Code expired',failed:'Could not verify',review_requested:'Review requested'};
const storagePrefix='finfolk:instagram-claim:';
export function clearInstagramClaimStorage(){try{for(const key of Object.keys(sessionStorage))if(key.startsWith(storagePrefix))sessionStorage.removeItem(key);}catch{}}
export async function renderInstagramClaim({host,api,refresh=()=>{},initialState}) {
  const root=el('section',undefined,'instagram-claim');root.id='instagram-claim';host.append(root);
  const key=api.user?.uid?storagePrefix+api.user.uid:null;
  let state=initialState,command='',savedExpiry='',checks=0;
  try{const saved=key&&JSON.parse(sessionStorage.getItem(key)||'null');if(saved?.command && /^\/claim [a-f0-9]{24}$/i.test(saved.command)){command=saved.command;savedExpiry=saved.expiresAt;}}catch{}
  const forget=()=>{command='';savedExpiry='';try{if(key)sessionStorage.removeItem(key);}catch{}};
  const button=(text,fn,cls='secondary')=>{const b=el('button',text,cls);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(error){message.textContent=error.message;}finally{b.disabled=false;}};return b;};
  const message=el('p','','claim-feedback');message.setAttribute('role','status');
  async function load(){const next=await api.call('instagramClaimStatus');if(JSON.stringify(next)!==JSON.stringify(state)){state=next;draw();}}
  async function generate(){
    const data=await api.call('instagramClaimStart');command=data.command;savedExpiry=data.expiresAt;
    try{if(key)sessionStorage.setItem(key,JSON.stringify({command,expiresAt:savedExpiry}));}catch{}
    state={...state,state:'waiting',expiresAt:data.expiresAt,error:''};checks=0;draw();message.textContent='Your command is ready. Follow @finfolk.com.au, then send it as a direct message.';
  }
  function draw(){
    const stage=state?.state || 'ready';
    if(['claimed','expired','ready'].includes(stage))forget();
    if(savedExpiry && state?.expiresAt && new Date(savedExpiry).getTime()!==new Date(state.expiresAt).getTime())forget();
    root.replaceChildren(el('h2','Claim your Instagram account'),el('p','Follow @finfolk.com.au, then send your claim command in an Instagram message.'),el('strong',stateTitles[stage] || 'Ready to claim','claim-state'),message);
    message.textContent='';
    if(stage==='claimed'){
      root.append(el('p',`@${state.handle} is claimed and linked to your FinFolk profile.`));
      const profile=el('a','Open @'+state.handle+' on Instagram ↗');profile.href='https://www.instagram.com/'+encodeURIComponent(state.handle)+'/';profile.target='_blank';profile.rel='noopener noreferrer';root.append(profile);
      const disconnect=el('details');disconnect.append(el('summary','Disconnect or change Instagram account'),el('p','Disconnect first to claim another account. This stops Instagram commands and automatic post sharing for the current connection.'));
      disconnect.append(button('Disconnect Instagram',async()=>{await api.call('instagramDisconnect');forget();await refresh();}));root.append(disconnect);
    }else{
      const steps=el('ol',undefined,'instagram-claim-steps');
      const follow=el('li');follow.append(el('h3','Follow @finfolk.com.au'),el('p','Open our Instagram profile, tap Follow, then tap Message. Use the Instagram account you want to claim.'));
      const open=el('a','Open @finfolk.com.au on Instagram ↗','claim-instagram-link');open.href='https://www.instagram.com/finfolk.com.au/';open.target='_blank';open.rel='noopener noreferrer';follow.append(open);steps.append(follow);
      const send=el('li');send.append(el('h3','Send your claim command'));
      if(api.user?.emailVerified===false){send.append(el('p','Verify your FinFolk email in Profile & buddies before generating your command.'),button('Go to email verification',()=>{document.getElementById('account-tab-profile')?.click();document.getElementById('account-email-verification')?.scrollIntoView?.({block:'start'});}));}
      else if(!state?.enabled){send.append(el('p','Automatic claims are not open yet. You can still add an Instagram profile link in Profile & buddies.'));}
      else{
        if(command && new Date(savedExpiry).getTime()>Date.now()){
          const label=el('label','Your one-time claim command'),code=el('input');code.name='instagram-claim-command';code.value=command;code.readOnly=true;code.autocomplete='off';label.append(code);send.append(label);
          send.append(button('Copy command',async()=>{
            if(new Date(savedExpiry).getTime()<=Date.now()){state={...state,state:'expired'};draw();return;}
            if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(command);message.textContent='Command copied. Paste it into your Instagram message to @finfolk.com.au and send.';}else{code.select();message.textContent='Command selected. Copy it, then paste and send it in Instagram.';}
          },'primary'));
          const expiry=el('time',new Date(savedExpiry).toLocaleString('en-AU',{dateStyle:'medium',timeStyle:'short'}));expiry.dateTime=savedExpiry;
          const expires=el('p','Expires ');expires.append(expiry);send.append(expires);
        }else if(['waiting','checking','follow_required','failed','review_requested'].includes(stage))send.append(el('p','Your command is not available in this browser. Generate a replacement to continue.'));
        send.append(button(stage==='ready' || stage==='expired'?'Generate my claim command':'Generate a replacement command',generate,command?'secondary':'primary'),el('small','The code lasts 24 hours. A replacement invalidates your previous command.'));
      }
      steps.append(send);
      const done=el('li');done.append(el('h3','See your account claimed'),el('p','FinFolk checks who sent the message and that they follow us. You’ll receive a confirmation in Instagram, and this page will update automatically.'));
      if(stage==='follow_required')done.append(el('p','Follow @finfolk.com.au, then resend the same command.'));
      if(stage==='checking')done.append(el('p','Your message arrived. We’re checking the sending account.'));
      if(stage==='review_requested')done.append(el('p','You requested manual help. Your account will remain unclaimed until the review is complete.'));
      if(state?.error && ['failed','review_requested'].includes(stage))done.append(el('p',state.error));
      done.append(button('Check status',load));
      if(state?.reviewAvailable && ['failed','follow_required'].includes(stage))done.append(button('Request manual review',async()=>{await api.call('instagramClaimRequestReview');await load();}));
      steps.append(done);root.append(steps);
    }
    const guide=el('details',undefined,'instagram-command-guide');guide.append(el('summary','Instagram DM commands'));
    for(const [syntax,description]of[['/help','See commands and examples.'],['/claim <CODE>','Claim the Instagram account that sends this message.'],['/status','Check your connection.'],['/checkin <beach>','Record today’s beach visit.'],['/points','See your participation and referral points.']]){const row=el('p');row.append(el('code',syntax),document.createTextNode(' — '+description));guide.append(row);}root.append(guide);
  }
  try{if(!state)state=await api.call('instagramClaimStatus');draw();}catch(error){root.replaceChildren(el('h2','Claim your Instagram account'),message);message.textContent=error.message;root.append(button('Retry',load));}
  const timer=setInterval(()=>{
    if(!root.isConnected || checks>=24 || ['claimed','expired'].includes(state?.state)){clearInterval(timer);return;}
    if(document.hidden || !['waiting','checking','follow_required'].includes(state?.state))return;
    checks++;load().catch(()=>{message.textContent='Status could not refresh. Use Check status to retry.';});
  },5000);timer.unref?.();
  const onVisibility=()=>{if(!root.isConnected){document.removeEventListener('visibilitychange',onVisibility);return;}if(!document.hidden && state?.state!=='claimed')load().catch(()=>{});};
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
