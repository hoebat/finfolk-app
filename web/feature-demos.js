import {beachThumbnail} from './beach-thumbnail.js';
import {DEMO_LOCATIONS} from './demo-locations.js';
const portrait=name=>`<img src="${new URL('./demo-'+name.toLowerCase()+'-sketch-v2.webp',import.meta.url).href}" alt="" loading="lazy" width="900" height="1125">`;
const pill=text=>`<span class="demo-pill">${text}</span>`;
const field=(label,value,cls='')=>`<div class="demo-field ${cls}"><small>${label}</small><span>${value}</span></div>`;
const action=(text,cls='')=>`<div class="demo-action ${cls}">${text}</div>`;
const check='<span class="demo-check">✓</span>';
const page=(phase,content)=>`<div class="demo-page" data-phase="${phase}">${content}</div>`;
const ownProfile=()=>'<div class="demo-profile-mini">'+portrait('Alex')+'<div><h4>Alex</h4><p>Freediving &amp; pool training</p></div></div>'+pill('Closed profile');
function locationPages(){const spot=DEMO_LOCATIONS['locations'];return [
 page(0,'<p class="demo-overline">MY PROFILE</p>'+ownProfile()+'<p class="demo-bio">Weekend shore dives and regular training.</p><div class="demo-socials">'+pill('Instagram ↗')+pill('TikTok ↗')+'</div><p class="demo-overline">YOUR SPOTS</p><div class="demo-empty-spots">Add the places you dive.</div>'+action('Add a spot','demo-tap-target')),
 page(1,'<p class="demo-overline">EDIT PROFILE / LOCATIONS</p><h4>Pick your spot.</h4><div class="demo-search"><span>⌕</span><span data-demo-query>'+spot.query+'</span><i></i></div>'+field('State / territory',''+spot.state+' ▾')+'<p class="demo-hint">Add a location to your profile.</p>'),
 page(2,'<p class="demo-overline">EDIT PROFILE / LOCATIONS</p><div class="demo-search"><span>⌕</span><span>'+spot.query+'</span></div><div class="demo-location-card"><div data-demo-map></div><h4>'+spot.name+'</h4><p>'+spot.region+' · '+spot.state_id+'</p></div>'+action('Add to my profile','demo-tap-target')),
 page(3,'<p class="demo-overline">MY PROFILE</p>'+ownProfile()+'<div class="demo-confirmation">'+check+' Profile saved</div><p class="demo-overline">YOUR SPOTS</p><div class="demo-profile-spot"><div data-demo-map></div><strong>'+spot.name+'</strong><span>'+spot.state+'</span></div><p class="demo-hint">Your profile is still Closed. You choose what to share.</p>')
].join('');}
function logPages(){const spot=DEMO_LOCATIONS['logs'];return [
 page(0,'<p class="demo-overline">NEW SESSION</p><h4>Log a session</h4>'+field('Location',''+spot.name+' ▾','demo-tap-target')+field('Activity','Freediving ▾')+field('Date','29 October 2026')+pill('Private by default')),
 page(1,'<p class="demo-overline">NEW SESSION</p><h4>Log a session</h4>'+field('Location',''+spot.name+'')+'<div class="demo-field-pair">'+field('Duration','<span data-demo-duration>45 min</span>','demo-filled')+field('Maximum depth','<span data-demo-depth>8 m</span>','demo-filled demo-tap-target')+'</div>'+field('Notes','<span data-demo-notes>Shore session with my buddy. Equalisation practice.</span>','demo-notes')+pill('Private by default')),
 page(2,'<p class="demo-overline">NEW SESSION</p><h4>Ready to save</h4><div class="demo-session-summary"><strong>'+spot.name+'</strong><span>Freediving · 29 October</span><div><b>45 <small>min</small></b><b>8 <small>m max</small></b></div></div><div class="demo-privacy"><strong>Visibility</strong>'+pill('◉ Private')+'<span>○ Published</span></div><p class="demo-hint">Only you can see a private session.</p>'+action('Save session','demo-tap-target')),
 page(3,'<p class="demo-overline">MY SESSIONS</p><h4>Your logbook</h4><div class="demo-confirmation">'+check+' Session saved</div><div class="demo-saved-session">'+pill('Private')+'<p>29 October 2026</p><h4>'+spot.name+'</h4><div class="demo-session-stats"><b>45 <small>min</small></b><b>8 <small>m max</small></b></div><p>Shore session with my buddy. Equalisation practice.</p></div>')
].join('');}
function peoplePages(){const spot=DEMO_LOCATIONS['people'];return [
 page(0,'<p class="demo-overline">PEOPLE / '+spot.name.toUpperCase()+'</p><h4>Your FinFolk.</h4><div class="demo-people-grid">'+['Maya','Kai'].map(name=>'<div class="demo-person '+(name==='Maya'?'demo-tap-target':'')+'">'+portrait(name)+'<strong>'+name+'</strong>'+pill('Regular')+'</div>').join('')+'</div><p class="demo-hint">Freedivers who visit your spot.</p>'),
 page(1,'<div class="demo-profile-portrait">'+portrait('Maya')+'<div><span>REGULAR / '+spot.name.toUpperCase()+'</span><h4>Maya</h4></div></div><p class="demo-bio">Shore dives, reef sessions and regular pool training.</p>'+action('Connect')+'<div class="demo-socials">'+pill('Instagram ↗')+pill('TikTok ↗')+'</div>'),
 page(2,'<div class="demo-profile-mini">'+portrait('Maya')+'<div><h4>Maya</h4><p>Regular at '+spot.name+'</p></div></div><div class="demo-socials">'+pill('Instagram ↗')+pill('TikTok ↗')+'</div><p class="demo-overline">PUBLISHED LOG</p><div class="demo-saved-session"><h4>Shore freediving</h4><p>'+spot.name+'</p><div class="demo-session-stats"><b>45 <small>min</small></b><b>8 <small>m max</small></b></div></div>'+action('Connect with Maya','demo-tap-target')),
 page(3,'<div class="demo-profile-portrait">'+portrait('Maya')+'<div><span>REGULAR / '+spot.name.toUpperCase()+'</span><h4>Maya</h4></div></div>'+action(check+' Request sent','is-success')+'<p class="demo-hint">Maya chooses whether to accept your request.</p><div class="demo-socials">'+pill('Instagram ↗')+pill('TikTok ↗')+'</div>')
].join('');}
const brandMark='<span class="brand-mark" style="--brand-size:24px"><span class="brand-mark__fill"></span></span>';
const platformIcon=platform=>platform==='FinFolk'?brandMark:'<span class="demo-platform-symbol" aria-hidden="true">'+(platform==='Instagram'?'◎':'♪')+'</span>';
const thread=content=>'<div class="demo-thread-title">'+brandMark+'<div><strong>finfolk.com.au</strong><small>Instagram</small></div></div>'+content;
const message=(text,sent=false)=>'<div class="demo-message '+(sent?'is-sent':'')+'">'+text+'</div>';
const command=text=>'<code>'+text+'</code>';
const typed=text=>'<span data-demo-type="'+text+'">'+text+'</span>';
const video=(spot,pose='gliding')=>'<div class="demo-post-media demo-session-art" data-pose="'+pose+'"><span class="demo-session-diver" aria-hidden="true"></span><span class="demo-session-play" aria-hidden="true">▶</span><small>'+spot.name+' · Freediving</small></div>';
function instagramConnectPages(){const spot=DEMO_LOCATIONS['instagram-connect'];return [
 page(0,'<p class="demo-overline">INSTAGRAM</p><div class="demo-instagram-profile">'+brandMark+'<h4>finfolk.com.au</h4><p>Freediving locations, logs and community.</p></div>'+action('Follow @finfolk.com.au','demo-tap-target')+'<p class="demo-hint">Follow FinFolk to connect and use member commands.</p>'),
 page(1,thread(message(command(typed('/connect')),true)+'<div class="demo-connect-reply">'+message('Your FinFolk code: <b>•••• ••••</b><br>Enter it on FinFolk within 10 minutes.')+'</div>')+'<div class="demo-compose">Message… <span>↑</span></div>'),
 page(2,'<p class="demo-overline">ACCOUNT / INSTAGRAM</p><h4>Connect Instagram</h4>'+field('Code from your Instagram DM','<span class="demo-code">'+typed('•••• ••••')+'</span>','demo-tap-target')+'<div class="demo-confirmation demo-connect-success">'+check+' Connected to @alex.dives</div><p class="demo-hint">Enter the code sent to your own Instagram account.</p>'),
 page(3,thread(message(command(typed('/in '+spot.name+', '+spot.state_id)),true))+'<div class="demo-compose demo-tap-target">'+command('/in '+spot.name+', '+spot.state_id)+' <span>↑</span></div>'),
 page(4,thread(message(command('/in '+spot.name+', '+spot.state_id),true)+message('Checked in at '+spot.name+' for today. Your profile and sharing preferences still apply.'))),
 page(5,thread(message(command(typed('/out')),true))+'<div class="demo-compose demo-tap-target">'+command('/out')+' <span>↑</span></div>'),
 page(6,thread(message(command('/out'),true)+message('Checked out of '+spot.name+'. Your visit is recorded.'))),
 page(7,'<p class="demo-overline">MY ACCOUNT / VISITS</p>'+ownProfile()+'<div class="demo-confirmation">'+check+' Visit recorded</div><div class="demo-visit"><strong>'+spot.name+'</strong><span>Today · Self-reported visit</span>'+pill('1 visit day')+'</div><p class="demo-hint">Become a Regular after visits on 10 separate days within 30 days. Your profile is still Closed.</p>')
].join('');}
function postPages(platform){const instagram=platform==='Instagram',kind=instagram?'Instagram post/Reel':'TikTok video',url=instagram?'instagram.com/reel/example/':'tiktok.com/@alex.dives/video/123456789';const spot=DEMO_LOCATIONS[platform==='Instagram'?'instagram-post':'tiktok-post'];return [
 page(0,'<p class="demo-overline">'+(instagram?'NEW POST / REEL':'POST VIDEO')+'</p><h4>Share your session</h4>'+video(spot,instagram?'gliding':'ascending')+'<div class="demo-post-caption"><strong>@alex.dives</strong><p>Shore session at '+spot.name+'.<br><span class="demo-mention">'+typed('@finfolk.com.au')+'</span></p></div>'+action('Post','demo-tap-target')),
 page(1,'<p class="demo-overline">'+platform.toUpperCase()+'</p>'+video(spot,instagram?'gliding':'ascending')+'<div class="demo-share-sheet"><strong>Share your '+(instagram?'post':'video')+'</strong><div class="demo-copy-link demo-tap-target">↗ &nbsp; Copy link</div><p>'+url+'</p></div>'),
 page(2,'<div class="demo-post-submit"><p class="demo-overline">YOUR POSTS</p><h4>Submit your post</h4>'+field('Beach in your post',''+spot.name+'')+field('Public '+kind+' URL',url)+field('Your username','@alex.dives')+'<div class="demo-consents"><span>✓ I published this post.</span><span>✓ It tags @finfolk.com.au.</span><span>✓ List my post and username publicly after review, even if my profile is Closed.</span></div>'+action('Submit for review','demo-tap-target')+'</div>'),
 page(3,'<p class="demo-overline">YOUR POSTS</p><h4>Submitted for review</h4><div class="demo-review-card">'+video(spot,instagram?'gliding':'ascending')+pill('Pending review')+'<strong>'+spot.name+'</strong><span>'+platform+' · @alex.dives</span></div><p class="demo-hint">FinFolk reviews the tag, creator attribution and location before the post appears. You can withdraw it at any time.</p>')
].join('');}
function planningPages(){const spot=DEMO_LOCATIONS['planning'];return [
 page(0,'<p class="demo-overline">PLAN A SESSION</p><h4>Where shall we dive?</h4><div class="demo-search"><span>⌕</span><span>'+spot.name+'</span></div><div class="demo-location-card"><div data-demo-map></div><h4>'+spot.name+'</h4><p>'+spot.region+' · '+spot.state_id+'</p></div>'+action('Plan here','demo-tap-target')),
 page(1,'<p class="demo-overline">YOUR PLAN / '+spot.name.toUpperCase()+'</p><h4>Make a little time.</h4>'+field('Session','Saturday shore session')+'<div class="demo-field-pair">'+field('Day','Saturday')+field('Meet at','7:30 am','demo-tap-target')+'</div>'+field('Meeting point','To be confirmed')+pill('Invite only')+action('Choose your people')),
 page(2,'<p class="demo-overline">INVITE YOUR FINFOLK</p><h4>Who’s joining?</h4><div class="demo-plan-recap"><strong>'+spot.name+'</strong><span>Saturday · 7:30 am</span></div>'+['Maya','Kai'].map(name=>'<div class="demo-invite-person">'+portrait(name)+'<div><strong>'+name+'</strong><small>Your connection</small></div>'+check+'</div>').join('')+'<p class="demo-hint">Your invited connections can join the plan in FinFolk.</p>'+action('Send 2 invitations','demo-tap-target')),
 page(3,'<p class="demo-overline">YOUR UPCOMING SESSION</p><h4>See you at '+spot.query+'.</h4><div class="demo-profile-spot"><div data-demo-map></div><strong>'+spot.name+'</strong><span>Saturday · 7:30 am</span></div><div class="demo-confirmation">'+check+' Invitations sent</div><div class="demo-invite-person">'+portrait('Maya')+'<div><strong>Maya</strong><small>Joined your plan</small></div>'+pill('Joined')+'</div><div class="demo-invite-person">'+portrait('Kai')+'<div><strong>Kai</strong><small>Waiting for a reply</small></div>'+pill('Invited')+'</div><p class="demo-hint">Invite only · Meeting point to be confirmed.</p>')
].join('');}
function regularsPages(){const place=DEMO_LOCATIONS.people;
 const visits=count=>'<div class="demo-regular-days">'+['02 OCT','05 OCT','08 OCT','11 OCT','14 OCT','17 OCT','20 OCT','23 OCT','26 OCT','29 OCT'].map((date,index)=>'<div class="demo-regular-day '+(index<count?'is-recorded':'')+'"><span>'+date+'</span><b>'+(index<count?'✓':String(index+1).padStart(2,'0'))+'</b><small>'+(index<count?'Checked in':'Visit day')+'</small></div>').join('')+'</div><div class="demo-regular-meter"><span style="width:'+count/10*100+'%"></span></div><p class="demo-regular-count">'+count+' of 10 separate days · Last 30 days</p>';
 const spot='<div class="demo-plan-recap"><strong>'+place.name+'</strong><span>Same spot. 10 separate days.</span></div>';
 return [
  page(0,'<p class="demo-overline">MY ACCOUNT / CHECK IN</p><h4>Make it your spot.</h4>'+field('Location',''+place.name+' ▾')+field('Visit day','2 October 2026')+pill('Self-reported visit')+action('Check in at '+place.query+'','demo-tap-target')+'<p class="demo-hint">Start with a check-in at the place you dive.</p>'),
  page(1,'<p class="demo-overline">2 OCTOBER / FIRST VISIT</p><h4>One day down.</h4>'+spot+visits(1)+'<p class="demo-hint">Checking in again today still counts as one visit day.</p>'),
  page(2,'<p class="demo-overline">14 OCTOBER / FIFTH VISIT</p><h4>Making it a habit.</h4>'+spot+visits(5)+'<p class="demo-hint">Five separate days recorded. Halfway to becoming a Regular.</p>'),
  page(3,'<p class="demo-overline">29 OCTOBER / TENTH VISIT</p><h4>One more day.</h4>'+spot+visits(9)+action('Record my tenth visit','demo-tap-target')),
  page(4,'<p class="demo-overline">MY ACCOUNT / YOUR REGULARS</p><div class="demo-regular-award">'+check+'<span>REGULAR / '+place.name.toUpperCase()+'</span><h4>You’re a Regular.</h4></div>'+visits(10)+'<p class="demo-hint">10 separate days at '+place.query+' within the last 30 days. Keep checking in on future visits to stay a Regular.</p>'+pill('Your profile is still Closed')+'<p class="demo-hint">You choose who can see your profile.</p>')
 ].join('');
}
function instagramSetupPages(){return [
 page(0,'<p class="demo-overline">INSTAGRAM / FOLLOW</p><div class="demo-instagram-profile">'+brandMark+'<h4>finfolk.com.au</h4><p>Freediving, places and your people.</p></div>'+action('Follow @finfolk.com.au','demo-tap-target')+'<p class="demo-hint">Use the Instagram account you want to connect.</p>'),
 page(1,thread(message(command(typed('/connect')),true)+message('Your FinFolk code: <b>FOLK 7A2K</b><br>Enter it in FinFolk within 10 minutes.'))+'<p class="demo-hint">Illustrative code · no message is sent.</p>'),
 page(2,'<p class="demo-overline">FinFolk / CONNECT INSTAGRAM</p><h4>Your account. Your code.</h4>'+field('Code from your Instagram DM','<span class="demo-code">'+typed('FOLK 7A2K')+'</span>','demo-tap-target')+action('Connect Instagram')+'<p class="demo-hint">Paste the eight-character code from your own DM.</p>'),
 page(3,'<p class="demo-overline">CONNECTION PREVIEW</p>'+ownProfile()+'<div class="demo-confirmation">'+check+' Instagram connected · demo</div><p class="demo-hint">Connecting does not publish your posts or make your profile Open.</p>')
].join('');}
function instagramProfilePages(){const spot=DEMO_LOCATIONS['instagram-post'];return [
 page(0,'<p class="demo-overline">INSTAGRAM / YOUR CAPTION</p>'+video(spot)+'<div class="demo-field"><small>Caption</small><span>Slow mornings in the blue.</span><br>'+command(typed('/profile add @finfolk.com.au'))+'</div><p class="demo-hint">Choose a post you want on your profile.</p>'),
 page(1,'<p class="demo-overline">FinFolk / COLLECTED POSTS</p><h4>A little of your story.</h4>'+video(spot)+'<div class="demo-confirmation">'+check+' Post collected · demo</div><p class="demo-hint">Repeated delivery never adds the same post twice.</p>'),
 page(2,'<p class="demo-overline">FinFolk / PROFILE BUILDER</p><h4>Make it yours.</h4>'+field('Suggested bio','Slow mornings in the blue.')+pill('Caption excerpt · review first')+action('Use reviewed bio','demo-tap-target')+'<p class="demo-hint">Edit the text. Choose what to feature.</p>'),
 page(3,'<p class="demo-overline">MY PROFILE / PREVIEW</p>'+ownProfile()+field('About me','Slow mornings in the blue.')+'<p class="demo-overline">SELECTED POSTS</p>'+video(spot)+pill('Featured by you')+'<p class="demo-hint">Your privacy choices still apply.</p>')
].join('');}
const demoPageIdentity=()=>'<div class="demo-profile-mini">'+brandMark+'<div><h4 data-demo-page-name>Your page</h4><p data-demo-page-handle>@your.page · Instagram</p></div></div>';
function instagramPageClaimPages(){return [
 page(0,'<p class="demo-overline">INSTAGRAM / PAGE ACCOUNT</p>'+demoPageIdentity()+'<h4>Start with your page.</h4>'+action('Follow @finfolk.com.au','demo-tap-target')+'<p class="demo-hint">Switch to the Instagram account belonging to the page you want to claim.</p>'),
 page(1,thread(message(command(typed('/connect')),true)+message('Your FinFolk code: <b>FOLK 7A2K</b><br>Enter it within 10 minutes.'))+'<p class="demo-hint">This code comes from your page’s own Instagram DM.</p>'),
 page(2,'<p class="demo-overline">FinFolk / CLAIM PAGE</p><h4>Your page. Your code.</h4>'+field('Code from the page’s Instagram DM','<span class="demo-code">'+typed('FOLK 7A2K')+'</span>')+action('Connect and claim page','demo-tap-target')+'<p class="demo-hint">The sender must match the page’s Instagram account.</p>'),
 page(3,'<p class="demo-overline">PAGE OWNERSHIP / PREVIEW</p>'+demoPageIdentity()+'<div class="demo-confirmation">'+check+' Page claimed · demo</div>'+action('Add Instagram content')+'<p class="demo-hint">You can manage the page. Posts are published only after your review.</p>')
].join('');}
function instagramPageContentPages(){const spot=DEMO_LOCATIONS['instagram-post'];return [
 page(0,'<p class="demo-overline">INSTAGRAM / PAGE CAPTION</p>'+video(spot)+'<div class="demo-field"><small>Your page’s caption</small><span>Our next shore session.</span>'+command(typed('/profile add @finfolk.com.au'))+'</div><p class="demo-hint">Post from the page’s connected account.</p>'),
 page(1,'<p class="demo-overline">FinFolk / PAGE COLLECTION</p><h4>A post for your page.</h4>'+video(spot)+pill('Draft · page managers only')+'<p class="demo-hint">Only this page’s connected account supplies its posts.</p>'),
 page(2,'<p class="demo-overline">FinFolk / REVIEW CONTENT</p><h4>Choose what goes live.</h4>'+field('Collected caption','Our next shore session.')+pill('Not public yet')+action('Publish post','demo-tap-target')+'<p class="demo-hint">Review each post before publishing it.</p>'),
 page(3,'<p class="demo-overline">PUBLIC PAGE / PREVIEW</p>'+demoPageIdentity()+video(spot)+pill('Published by you')+'<p class="demo-hint">Unpublish or remove it from the page whenever you choose.</p>')
].join('');}
const standardDurations=[2400,2600,3000,3400];
export const FEATURE_DEMOS=Object.freeze({
 'instagram-page-claim':{title:'Claim page',captions:['Use your page’s Instagram account','DM /connect to @finfolk.com.au','Enter the page’s private code','Page ownership is connected · demo'],durations:[3500,5000,4500,4000],platforms:['Instagram','Instagram','FinFolk','FinFolk'],pages:instagramPageClaimPages},
 'instagram-page-content':{title:'Page content',captions:['Add /profile add to your page’s caption','Collect it into the page’s drafts','Review and publish the post','See it on the public page'],durations:[5000,4000,4000,4000],platforms:['Instagram','FinFolk','FinFolk','FinFolk'],pages:instagramPageContentPages},
 'instagram-setup':{title:'Connect Instagram',captions:['Follow @finfolk.com.au','Send /connect in an Instagram DM','Enter your private code in FinFolk','Your account is linked · demo'],durations:[3000,5000,4500,3500],platforms:['Instagram','Instagram','FinFolk','FinFolk'],pages:instagramSetupPages},
 'instagram-profile':{title:'Profile builder',captions:['Add /profile add @finfolk.com.au to your caption','Collect the selected post · demo','Review your bio and featured posts','See it on your profile'],durations:[5000,3500,4000,4000],platforms:['Instagram','FinFolk','FinFolk','FinFolk'],pages:instagramProfilePages},
 regulars:{title:'Your visits',captions:['Choose your spot and check in','Your first separate visit day','Five visits in. Keep coming back.','Return for your tenth separate day','10 days in 30. You’re a Regular.'],durations:[3200,3400,3400,3200,5000],pages:regularsPages},
 planning:{title:'Plan a session',captions:['Choose where to meet','Set the day and time','Invite your connections','See who has joined'],durations:[2800,3000,3400,4000],pages:planningPages},
 locations:{title:'My profile',captions:['Start with your profile','Search for a spot','Add '+DEMO_LOCATIONS.locations.query,'Your spots, on your profile'],durations:standardDurations,pages:locationPages},
 logs:{title:'Logbook',captions:['Choose your location','Add your session details','Keep it private or publish','Your session is saved'],durations:standardDurations,pages:logPages},
 people:{title:'People',captions:['Find divers at your spot','Open a profile','See their logs and socials','Send a connection request'],durations:standardDurations,pages:peoplePages},
 'instagram-connect':{title:'Instagram',captions:['Follow @finfolk.com.au','Send '+command('/connect')+' in Instagram','Enter your code on FinFolk','Send '+command('/in '+DEMO_LOCATIONS['instagram-connect'].name+', '+DEMO_LOCATIONS['instagram-connect'].state_id),'Receive your arrival confirmation','Send '+command('/out')+' when you leave','Receive your departure confirmation','See the visit in your account'],durations:[2600,3600,3400,3200,3000,2800,3000,3600],platforms:['Instagram','Instagram','FinFolk','Instagram','Instagram','Instagram','Instagram','FinFolk'],pages:instagramConnectPages},
 'instagram-post':{title:'Instagram',captions:['Mention @finfolk.com.au','Copy your public post link','Submit the link and location','Your post is pending review'],durations:[3400,2800,4200,3800],platforms:['Instagram','Instagram','FinFolk','FinFolk'],pages:()=>postPages('Instagram')},
 'tiktok-post':{title:'TikTok',captions:['Mention @finfolk.com.au','Copy the full video link','Submit the link and location','Your video is pending review'],durations:[3400,2800,4200,3800],platforms:['TikTok','TikTok','FinFolk','FinFolk'],pages:()=>postPages('TikTok')},
});
export function setDemoStep(figure,step,progress=1){
 const kind=figure.dataset.featureDemo,definition=FEATURE_DEMOS[kind];
 if(figure.dataset.step!==String(step)){
  figure.dataset.step=String(step);figure.querySelector('[data-demo-caption]').innerHTML=definition.captions[step];
  for(const page of figure.querySelectorAll('.demo-page'))page.classList.toggle('is-active',Number(page.dataset.phase)===step);
  for(const dot of figure.querySelectorAll('[data-demo-progress]'))dot.classList.toggle('is-active',Number(dot.dataset.demoProgress)===step);
  const platform=definition.platforms?.[step]||'FinFolk';figure.dataset.platform=platform.toLowerCase();
  const title=platform==='FinFolk'?(definition.platforms?(kind==='instagram-page-claim'?'Claim page':kind==='instagram-page-content'?'Page content':kind==='instagram-setup'?'Connect Instagram':kind==='instagram-profile'?'Your profile':kind==='instagram-connect'?(step===2?'Connect Instagram':'Your visits'):'Your posts'):definition.title):platform;
  figure.querySelector('.demo-app-title').innerHTML=platformIcon(platform)+'<span>'+title+'</span>';
 }
 const update=(element,value)=>{if(element&&element.textContent!==value)element.textContent=value;};
 const query=figure.querySelector('[data-demo-query]');if(step===1)update(query,DEMO_LOCATIONS.locations.query.slice(0,Math.floor(progress*(DEMO_LOCATIONS.locations.query.length+2))));
 for(const element of figure.querySelectorAll('.demo-page.is-active [data-demo-type]'))update(element,element.dataset.demoType.slice(0,Math.floor(progress*element.dataset.demoType.length*1.8)));
 if(kind==='instagram-connect'){
  if(step===1)figure.querySelector('.demo-connect-reply').classList.toggle('is-complete',progress>.65);
  if(step===2)figure.querySelector('.demo-connect-success').classList.toggle('is-complete',progress>.7);
 }
 if(kind==='logs'&&step===1){
  const values={'duration':progress>.2?'45 min':progress>.05?'4':'','depth':progress>.35?'8 m':'','notes':'Shore session with my buddy. Equalisation practice.'.slice(0,Math.max(0,Math.floor((progress-.4)*115)))};
  for(const [key,value]of Object.entries(values))update(figure.querySelector('[data-demo-'+key+']'),value);
 }
}
export function installFeatureDemos({doc=document,requestFrame,cancelFrame}={}){
 const win=doc.defaultView,request=requestFrame||win.requestAnimationFrame.bind(win),cancel=cancelFrame||win.cancelAnimationFrame.bind(win),motion=win.matchMedia('(prefers-reduced-motion: reduce)');
 const records=[];let paused=motion.matches,handle,last;
 for(const figure of doc.querySelectorAll('[data-feature-demo]')){
  const definition=FEATURE_DEMOS[figure.dataset.featureDemo];if(!definition)continue;delete figure.dataset.step;
  figure.innerHTML='<div class="feature-demo-phone" aria-hidden="true" inert><div class="demo-device-bar"><span>9:41</span><span class="demo-device-speaker"></span><span>● ▰</span></div><div class="demo-app-title"></div><div class="demo-pages">'+definition.pages()+'</div><div class="demo-home-bar"></div></div><figcaption><span class="demo-progress" aria-hidden="true">'+definition.durations.map((_,i)=>'<i data-demo-progress="'+i+'"></i>').join('')+'</span><span data-demo-caption></span></figcaption>';
  for(const map of figure.querySelectorAll('[data-demo-map]'))map.append(beachThumbnail(DEMO_LOCATIONS[figure.dataset.featureDemo]||DEMO_LOCATIONS.people));
  records.push({figure,definition,total:definition.durations.reduce((a,b)=>a+b,0),elapsed:0,visible:!win.IntersectionObserver});setDemoStep(figure,paused?definition.captions.length-1:0,paused?1:0);
 }
 const control=doc.getElementById('landing-motion-toggle');
 function sync(){for(const {figure}of records)figure.dataset.motion=paused?'paused':'playing';if(control){control.textContent=paused?'Play animations':'Pause animations';control.setAttribute('aria-pressed',String(paused));}}
 function setPaused(value){paused=value;sync();}
 function changed(event){setPaused(event.matches);if(event.matches)for(const {figure,definition}of records)setDemoStep(figure,definition.captions.length-1);}
 function tick(time){const delta=last===undefined?0:Math.min(time-last,100);last=time;
  if(!paused&&!doc.hidden)for(const record of records)if(record.visible){record.elapsed=(record.elapsed+delta)%record.total;let at=record.elapsed,step=0;while(at>=record.definition.durations[step])at-=record.definition.durations[step++];setDemoStep(record.figure,step,at/record.definition.durations[step]);}
  handle=request(tick);
 }
 const observer=win.IntersectionObserver?new win.IntersectionObserver(entries=>{for(const entry of entries){const record=records.find(r=>r.figure===entry.target);if(record){record.visible=entry.isIntersecting;record.figure.dataset.inView=String(entry.isIntersecting);}}},{threshold:.15}):null;
 for(const {figure}of records)observer?.observe(figure);
 const toggle=()=>setPaused(!paused);control?.addEventListener('click',toggle);motion.addEventListener('change',changed);sync();handle=request(tick);
 return {setPaused,seek(figure,step){const record=records.find(r=>r.figure===figure);if(!record)return;record.elapsed=record.definition.durations.slice(0,step).reduce((a,b)=>a+b,0);setDemoStep(figure,step);},destroy(){cancel(handle);observer?.disconnect();control?.removeEventListener('click',toggle);motion.removeEventListener('change',changed);}};
}
