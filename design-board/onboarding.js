import {onboardingWalkthrough} from './onboarding-walkthrough.js';
import{waterSelector}from'./onboarding-water.js';
import {ONBOARDING_STEPS,ONBOARDING_KEY,cleanOnboarding,onboardingErrors,onboardingNext} from './onboarding-model.mjs';
import {createProfileStore} from './profile-store.js';
import {initialState,profileDraft} from './profile-model.mjs';
import {LOCATIONS} from './profile-data.mjs';
import {visualPalette,applyPaletteVariables,PALETTE_OVERRIDES} from '../web/visual-language.js';
import {compileTheme} from './theme-engine.mjs';
import {PROFILE_ADD_COMMAND} from './profile-builder.mjs';

export async function installOnboarding({doc=document,store=createProfileStore()}={}){
 const win=doc.defaultView,main=doc.getElementById('onboarding-main'),status=doc.getElementById('onboarding-status');
 const headings={profile:['01 / YOUR PROFILE','You’re in.\nMake it yours.','Your account is ready. Start with your name and a little about yourself. Your profile stays closed while you set up.'],locations:['02 / YOUR PLACES','Where’s your water?','Choose the places you know, or somewhere you’d like to explore. You can change these later.'],privacy:['03 / YOUR CHOICE','Your story.\nYour say.','Choose who can find your profile. Your sessions still start private.'],'instagram-connect':['04 / OPTIONAL','Bring your Instagram.','Connect the account you post from. Your profile and sharing choices stay yours.'],instagram:['05 / OPTIONAL','Let your posts\ntell the story.','Bring selected Instagram posts into your profile when you’re ready.'],review:['ONE LAST LOOK','Make it yours.','Check your choices before saving. You can come back to any of these later.'],done:['YOU’RE READY','Your FinFolk\nstarts here.','A little exploring. A first session. A familiar face. Start wherever feels right.']};
 const node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn,primary=false)=>{const b=node('button',text,'onboarding-button'+(primary?' primary':''));b.type='button';b.onclick=fn;return b;};
 const link=(text,href,primary=false)=>{const a=node('a',text,'onboarding-button'+(primary?' primary':''));a.href=href;return a;};
 let walkthrough,water,waterSession={point:null,accuracy:null,message:''};let base=initialState(),savedProfile=false,storageAvailable=true,busy=false;
 try{const loaded=await store.load();if(loaded.state?.my){base=loaded.state;savedProfile=true;}}
 catch{storageAvailable=false;}
 if(!savedProfile)base={...base,connections:{},blocks:[],my:{...base.my,displayName:'',bio:'',beaches:[],availability:[],open:false,experience:'unspecified',portraitRemoved:true,sampleSocials:[],featuredPosts:[],featuredLogs:[],visitsByLocation:{},stats:{visits:0,months:0,dives:0,minutes:0,typicalDepth:0}}};
 let draft=cleanOnboarding({displayName:base.my.displayName,bio:base.my.bio,beaches:base.my.beaches,open:base.my.open});
 try{const raw=win.localStorage.getItem(ONBOARDING_KEY);if(raw)draft=cleanOnboarding(JSON.parse(raw));}catch{storageAvailable=false;}
 const requested=new URL(win.location.href).searchParams.get('step');
 if(ONBOARDING_STEPS.includes(requested)){
  // Standalone Atelier screen entries provide an explicit sample state for review.
  draft.step=requested;
  if(requested!=='profile'&&!draft.displayName)draft.displayName='Alex';
  if(requested==='done')draft.step='review';
 }
 let progressWritable=true;
 function persist(){if(!progressWritable)return;try{win.localStorage.setItem(ONBOARDING_KEY,JSON.stringify(draft));}catch{progressWritable=false;storageAvailable=false;status.textContent='Progress lasts for this visit. Browser storage is unavailable.';}}
 function target(value){let step=ONBOARDING_STEPS.includes(value)?value:'profile';if(step==='done'&&!draft.completed)step='review';return step;}
 function navigate(step,{replace=false}={}){draft.step=target(step);persist();win.history[replace?'replaceState':'pushState'](null,'',win.location.pathname+win.location.search+'#'+draft.step);render();main.focus({preventScroll:true});win.scrollTo({top:0,behavior:'instant'});}
 const stepIndex=()=>ONBOARDING_STEPS.indexOf(draft.step);
 function field(form,key,label,{type='text',hint='',max=80}={}){const wrap=node('label',undefined,'onboarding-field'),input=node(type==='textarea'?'textarea':'input');input.name=key;input.setAttribute('aria-label',label);if(type!=='textarea')input.type=type;input.value=draft[key]||'';input.maxLength=max;input.id='onboarding-'+key;wrap.append(node('span',label),input);if(hint)wrap.append(node('small',hint));const error=node('p','','onboarding-error');error.id=input.id+'-error';error.setAttribute('role','alert');wrap.append(error);form.append(wrap);input.oninput=()=>{draft[key]=input.value;draft.completed=false;input.removeAttribute('aria-invalid');error.textContent='';persist();};return input;}
 function showErrors(form,errors){for(const [key,message]of Object.entries(errors)){const input=form.querySelector(`[name="${key}"]`);if(!input)continue;input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',input.id+'-error');doc.getElementById(input.id+'-error').textContent=message;input.focus({preventScroll:true});}}
 function actions(form,{next='Continue →',skip,skipTo,back=true,onNext}={}){const bar=node('div',undefined,'onboarding-actions'+(!back?' single':''));if(back)bar.append(button('← Back',()=>navigate(ONBOARDING_STEPS[Math.max(0,stepIndex()-1)])));const submit=node('button',next,'onboarding-button primary');submit.type='submit';bar.append(submit);if(skip){const b=node('button','Skip for now','onboarding-skip');b.type='button';b.onclick=()=>{skip();navigate(skipTo||onboardingNext(draft.step));};bar.append(b);}form.append(bar);form.onsubmit=e=>{e.preventDefault();if(busy)return;const errors=onboardingErrors(draft.step,draft);if(Object.keys(errors).length){showErrors(form,errors);return;}if(onNext)onNext(submit);else navigate(onboardingNext(draft.step));};}
 function render(){
  walkthrough?.destroy();walkthrough=null;water?.dispose();main.replaceChildren();doc.title=headings[draft.step][1].replaceAll('\n',' ')+' · FinFolk';
  const layout=node('div',undefined,'onboarding-layout'),content=node('section',undefined,'onboarding-content');layout.dataset.step=draft.step;
  const progress=node('div',undefined,'onboarding-progress');progress.setAttribute('aria-label',`Setup step ${stepIndex()+1} of ${ONBOARDING_STEPS.length}`);for(let i=0;i<ONBOARDING_STEPS.length;i++)progress.append(node('span',undefined,i<=stepIndex()?'complete':''));content.append(progress);
  const [kicker,title,lede]=headings[draft.step];content.append(node('p',kicker,'onboarding-kicker'),node('h1',title),node('p',lede,'onboarding-lede'));
  const form=node('form');form.noValidate=true;content.append(form);layout.append(content);
  const art=node('aside',undefined,'onboarding-art'),figure=node('figure'),image=node('img');image.src='/board/assets/people/shore-session-sketch-v2.webp';image.alt='Illustrative freediving session beside a rocky reef';figure.append(image,node('figcaption','A little time in the blue. Illustrative artwork.'));art.append(figure,node('p','Pick your spot.\nPost your logs.\nDiscover your FinFolk.'));layout.append(art);main.append(layout);
  if(draft.step==='profile'){
   field(form,'displayName','Your name',{hint:'The name you’d like other divers to see.'});field(form,'bio','A little about you (optional)',{type:'textarea',max:500,hint:'Favourite water, what you enjoy, or the kind of sessions you’re looking for.'});actions(form,{back:false});
  }else if(draft.step==='locations'){
   water=waterSelector({doc,parent:form,places:LOCATIONS,selected:draft.beaches,session:waterSession,onChange:beaches=>{draft.beaches=beaches;draft.completed=false;persist();}});actions(form,{skip:()=>{draft.beaches=[];}});
  }else if(draft.step==='privacy'){
   const choices=node('div',undefined,'onboarding-choices');choices.setAttribute('role','radiogroup');choices.setAttribute('aria-label','Profile visibility');for(const [value,title,detail]of [[false,'Keep my profile closed','Stay out of People browsing. Set things up at your own pace.'],[true,'Let people find me','Appear in People at your selected places. Your sessions and statistics are still private.']]){const label=node('label',undefined,'onboarding-choice'),input=node('input');input.type='radio';input.name='visibility';input.value=value?'open':'closed';input.checked=draft.open===value;input.onchange=()=>{draft.open=value;draft.completed=false;persist();};const text=node('span');text.append(node('strong',title),node('small',detail));label.append(input,text);choices.append(label);}form.append(choices,node('p','Publishing a log or sharing a post is always a separate choice.','onboarding-small'));actions(form);
  }else if(draft.step==='instagram-connect'){
   walkthrough=onboardingWalkthrough({doc,parent:form,kind:'instagram-setup'});
   const guide=node('section',undefined,'onboarding-card');guide.append(node('h2','A quick connection.'));
   const steps=node('ol',undefined,'onboarding-connect-steps');for(const text of ['In Instagram, follow @finfolk.com.au from the account you want to link.','Send /connect to @finfolk.com.au in an Instagram DM.','Back in FinFolk, open Instagram → Connect Instagram and enter the eight-character code from the reply.'])steps.append(node('li',text));guide.append(steps,node('p','Codes expire after 10 minutes. If yours expires, send /connect again for a fresh code. Never share your code.','onboarding-small'));
   const original=link('Open @finfolk.com.au ↗','https://www.instagram.com/finfolk.com.au/');original.target='_blank';original.rel='noopener noreferrer';guide.append(original,button('Copy /connect',async()=>{try{await win.navigator.clipboard.writeText('/connect');status.textContent='/connect copied. Paste it into your Instagram DM to FinFolk.';}catch{status.textContent='Send /connect in an Instagram DM to @finfolk.com.au.';}}));
   guide.append(node('p','This walkthrough is a preview. It does not connect an account or send a message. Actual connection requires Instagram messaging to be enabled for your account.','onboarding-small'));form.append(guide);
   actions(form,{next:'See how profile posts work →',skipTo:'review',skip:()=>{draft.instagramLater=true;}});
  }else if(draft.step==='instagram'){
   form.append(node('h2','One post at a time.','onboarding-animation-heading'));
   walkthrough=onboardingWalkthrough({doc,parent:form,kind:'instagram-profile'});
   const card=node('div',undefined,'onboarding-card');card.append(node('p','Add this command on its own line in captions you want to use for your profile:'),node('code',PROFILE_ADD_COMMAND),node('p','The profile builder lets you review captions, choose featured posts and craft your bio. Instagram collection is simulated in this preview.'));form.append(card);
   form.append(button('Copy profile command',async()=>{try{await win.navigator.clipboard.writeText(PROFILE_ADD_COMMAND);status.textContent='Profile command copied.';}catch{status.textContent='Select and copy the command above.';}}));
   actions(form,{next:'Use posts after setup →',skip:()=>{draft.instagramLater=true;},onNext:()=>{draft.instagramLater=false;navigate('review');}});
  }else if(draft.step==='review'){
   const review=node('dl',undefined,'onboarding-review');for(const [label,value,step] of [['Name',draft.displayName||'Add your name','profile'],['About you',draft.bio||'You can add this later.','profile'],['Your places',draft.beaches.map(id=>LOCATIONS.find(p=>p.id===id).name).join(', ')||'Explore first. Choose later.','locations'],['Profile visibility',draft.open?'Open · discoverable at your places':'Closed · hidden from People','privacy'],['Instagram',draft.instagramLater?'Optional · set up later':'Build from posts after setup','instagram-connect']]){const row=node('div');row.append(node('dt',label),node('dd',value));const edit=button('Edit '+label.toLowerCase(),()=>navigate(step));edit.className='onboarding-edit';row.append(edit);review.append(row);}form.append(review,node('p','Saving updates your local Atelier profile.','onboarding-small'));
   const saveError=node('p','','onboarding-error');saveError.setAttribute('role','alert');saveError.tabIndex=-1;form.append(saveError);
   actions(form,{next:'Make it mine →',onNext:async submit=>{
    const errors=onboardingErrors('profile',draft);if(Object.keys(errors).length){navigate('profile');showErrors(main.querySelector('form'),errors);return;}
    busy=true;submit.disabled=true;submit.textContent='Saving…';saveError.textContent='';
    try{const profile=profileDraft({...base.my,displayName:draft.displayName,bio:draft.bio,beaches:draft.beaches,open:draft.open,sharing:savedProfile?base.my.sharing:{visits:false,months:false,dives:false,time:false,depth:false}},base.my);await store.save({...base,my:profile});base.my=profile;draft.completed=true;persist();navigate('done');status.textContent='Your profile is saved in this browser.';}
    catch{saveError.textContent='Your profile could not be saved. Your draft is still here. Try again, or explore without finishing setup.';saveError.focus({preventScroll:true});win.scrollTo({top:Math.max(0,saveError.getBoundingClientRect().top+win.scrollY-120),behavior:'instant'});submit.disabled=false;submit.textContent='Make it mine →';}
    finally{busy=false;}
   }});
  }else{
   content.insertBefore(node('div','✓','onboarding-complete'),progress.nextSibling);
   const next=node('div',undefined,'onboarding-next-actions');next.append(link('Explore your places','/preview/?view=discover&section=suggested&atelier-screen=discover',draft.instagramLater),link('See your profile','/board/profiles.html?screen=me'),link('Build your profile from posts','/board/profiles.html?screen=edit',!draft.instagramLater),link('Log your first session','/preview/?view=logbook&atelier-screen=new-session'));form.append(next,node('p','Saved locally. Instagram is optional and has not been connected.','onboarding-small'));
   const restart=button('Review my setup',()=>navigate('review'));form.append(restart);
  }
 }
 const theme=doc.getElementById('onboarding-theme'),themeStyle=node('style');doc.head.append(themeStyle);
 function choose(id){const palette=visualPalette(id);applyPaletteVariables(palette,doc.documentElement);doc.documentElement.dataset.theme=palette.id;theme.value=palette.id;}
 let preferred;try{preferred=win.localStorage.getItem('finfolk-theme');}catch{}choose(preferred);theme.onchange=()=>{themeStyle.textContent='';choose(theme.value);try{win.localStorage.setItem('finfolk-theme',theme.value);}catch{}};
 const receive=event=>{if(event.origin!==win.location.origin||event.source!==win.parent||win.parent===win||event.data?.type!=='finfolk:theme')return;try{themeStyle.textContent=compileTheme(event.data.theme);for(const key of PALETTE_OVERRIDES)doc.documentElement.style.removeProperty(key);}catch{status.textContent='The preview theme could not be applied.';}};
 const pop=()=>{draft.step=target(win.location.hash.slice(1)||'profile');render();main.focus({preventScroll:true});};win.addEventListener('popstate',pop);win.addEventListener('message',receive);
 if(!storageAvailable)status.textContent='Browser storage is unavailable. Progress may last only for this visit.';
 navigate(target(win.location.hash.slice(1)||draft.step),{replace:true});
 if(win.parent!==win)win.parent.postMessage({type:'finfolk:ready'},win.location.origin);
 return {get draft(){return structuredClone(draft);},destroy:async()=>{walkthrough?.destroy();water?.dispose();win.removeEventListener('popstate',pop);win.removeEventListener('message',receive);themeStyle.remove();await store.close?.();}};
}
if(typeof document!=='undefined'&&document.getElementById('onboarding-main'))installOnboarding().catch(()=>{document.getElementById('onboarding-main').textContent='Onboarding could not load. Reload to try again.';});
