const el = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
const field = (host, title, name, type = 'text') => {
  const label = el('label', title), input = el(type === 'textarea' ? 'textarea' : 'input');
  input.name = name;
  if (type !== 'textarea') input.type = type;
  label.append(input); host.append(label); return input;
};
const action = (title, fn, status, cls = 'secondary') => {
  const button = el('button', title, cls); button.type = 'button';
  button.onclick = async () => {
    button.disabled = true;
    try { await fn(); } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  };
  return button;
};
const notice = () => { const node = el('p'); node.setAttribute('role','status'); return node; };
const endpoint = (config, path) => new URL(path, config.apiUrl.endsWith('/') ? config.apiUrl : config.apiUrl + '/');
const original = (post, config) => {
  const link = el('a', `@${post.creator_handle} · Open on ${post.platform === 'tiktok' ? 'TikTok' : 'Instagram'} ↗`);
  link.href = post.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.onclick = () => {
    // Aggregate clicks only; no visitor ID, handle, beach history or referrer is sent.
    if (config?.apiUrl) fetch(endpoint(config,'community/referral'), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postId:post.id}),cache:'no-store',keepalive:true,referrerPolicy:'no-referrer'}).catch(()=>{});
  };
  return link;
};
export function sharePostURL(post) {
  const url = new URL(location.href);
  url.search = ''; url.hash = '';
  url.searchParams.set('view','maps'); url.searchParams.set('site',post.beach_id); url.searchParams.set('post',post.id);
  return url.href;
}
export async function renderPostFeed({host,beach,config,loadAPI,signIn,isCurrent=()=>true}) {
  host.replaceChildren(el('h3','From the folk here'),el('p','Public posts from this beach, shared by their creators and reviewed by FinFolk.'));
  const status = notice(), cards = el('div'); host.append(status,cards);
  if (!config?.apiUrl) { status.textContent = 'Beach posts are opening soon.'; return; }
  let api;
  try { api = await loadAPI(); } catch {}
  if (!isCurrent()) return;
  let cursor = '', enabled = false;
  const more = action('More posts', page, status);
  more.hidden = true; host.append(more);
  async function page() {
    status.textContent = 'Loading beach posts…';
    let data;
    if (api?.user) data = await api.call('posts',{beachId:beach.id,cursor});
    else {
      const url = endpoint(config,'community/posts'); url.searchParams.set('beachId',beach.id);
      if (cursor) url.searchParams.set('cursor',cursor);
      const response = await fetch(url,{cache:'no-store',referrerPolicy:'no-referrer'});
      data = await response.json();
      if (!response.ok) throw Error(data.error || 'Beach posts could not load.');
    }
    if (!isCurrent()) return;
    enabled = !!data.enabled;
    for (const post of data.posts || []) {
      const card = el('article',undefined,'beach-social-card'); card.dataset.post = post.id;
      card.append(original(post,config));
      const feedback = notice();
      card.append(action('Load preview', async () => {
        if (card.querySelector('iframe')) return;
        const frame = el('iframe'); frame.loading = 'lazy'; frame.title = `${post.platform} post by @${post.creator_handle}`;
        frame.referrerPolicy = 'no-referrer'; frame.allow = 'fullscreen';
        frame.src = post.platform === 'instagram' ? post.url.replace(/\/$/,'') + '/embed/' : 'https://www.tiktok.com/player/v1/' + new URL(post.url).pathname.split('/').pop();
        frame.onerror = () => { feedback.textContent = 'Preview unavailable. Open the original post above.'; frame.remove(); };
        card.append(frame,el('small','If this preview is unavailable, use the original-post link.'));
      },feedback));
      card.append(action('Copy link',async()=>{
        const url = sharePostURL(post);
        if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); feedback.textContent = 'Link copied.'; }
        else feedback.textContent = url;
      },feedback));
      const report = el('details'); report.append(el('summary','Report this post'));
      if (!api?.user) report.append(action('Sign in to report',signIn,feedback));
      else {
        const reason = field(report,'What should we review?','report-reason','textarea'); reason.maxLength=1000;
        report.append(action('Send report',async()=>{
          await api.call('reportPost',{id:post.id,reason:reason.value}); feedback.textContent='Report sent to FinFolk for review.'; report.open=false;
        },feedback));
      }
      card.append(report,feedback); cards.append(card);
    }
    cursor = data.cursor || ''; more.hidden = !cursor;
    status.textContent = !enabled ? 'Beach posts are opening soon.' : cards.children.length ? '' : 'No approved posts here yet. Share your first tagged post.';
    const requested = new URL(location.href).searchParams.get('post');
    const selected = [...cards.children].find(n=>n.dataset.post === requested);
    if (selected) { selected.classList.add('shared-post'); selected.scrollIntoView?.({block:'nearest'}); }
    else if (requested && !cursor && enabled) status.textContent = 'That shared post may be unavailable or no longer listed. You can still explore the posts here.';
  }
  try { await page(); } catch(error) {
    if (!isCurrent()) return;
    status.textContent=error.message; host.append(action('Retry posts',page,status));
  }
  if (!isCurrent()) return;
  if (enabled) host.append(action(api?.user ? 'Share your tagged post' : 'Sign in to share a post',()=>signIn('posts'),status));
}
export async function renderPostManager({host,api,beaches,refresh}) {
  const box=el('section',undefined,'account-card post-manager'), status=notice();
  box.append(el('h2','Share your shores'),el('p','Post on Instagram or TikTok, tag @finfolk.com.au, then submit your link here. Public interactions stay on the original platform.'),status); host.append(box);
  try {
    const state=await api.call('postStatus');
    if (!state.enabled) box.append(el('p','Beach post submissions are opening soon.'));
    else {
      const form=el('form'), search=field(form,'Find the beach','post-beach-search','search'), select=el('select');
      select.name='post-beach'; select.setAttribute('aria-label','Beach in your post'); select.required=true;
      function options() {
        const previous=select.value; select.replaceChildren(); const prompt=el('option','Choose the beach'); prompt.value=''; select.append(prompt);
        for(const beach of beaches.filter(b=>!state.pilotBeaches?.length || state.pilotBeaches.includes(b.id)).filter(b=>`${b.name} ${b.area_name || ''}`.toLowerCase().includes(search.value.trim().toLowerCase())).slice(0,150)) {
          const option=el('option',`${beach.name} · ${beach.area_name || beach.state || ''}`); option.value=beach.id; select.append(option);
        }
        if([...select.options].some(o=>o.value===previous)) select.value=previous;
      }
      search.oninput=options; options(); form.append(select);
      const url=field(form,'Public Instagram post/Reel or full TikTok video URL','post-url','url'); url.required=true;
      const handle=field(form,'Your username on that platform','post-handle'); handle.required=true; handle.maxLength=31; handle.placeholder='@yourname';
      const own=field(form,'I published this post on my own account.','post-own','checkbox');
      const tagged=field(form,'This public post tags @finfolk.com.au.','post-tagged','checkbox');
      const consent=field(form,'List this post and my platform username publicly on FinFolk after review, even if my profile is Closed.','post-consent','checkbox');
      own.required=tagged.required=consent.required=true;
      const submit=el('button','Submit for review','primary'); submit.type='submit'; form.append(submit);
      form.onsubmit=async event=>{
        event.preventDefault(); if (!form.reportValidity()) return;
        submit.disabled=true; status.textContent='Submitting for review…';
        try {
          await api.call('post',{beachId:select.value,url:url.value,creatorHandle:handle.value,ownPost:own.checked,tagged:tagged.checked,publicConsent:consent.checked});
          form.reset(); options(); status.textContent='Submitted. Your post will appear after FinFolk reviews the tag, attribution and beach.';
          await history();
        } catch(error) {status.textContent=error.message;} finally {submit.disabled=false;}
      };
      box.append(form,el('small','Share one beach per submission. We review manually; submissions do not appear immediately. You can withdraw your post at any time.'));
    }
    const list=el('section',undefined,'post-history'); box.append(list);
    async function history() {
      const posts=await api.call('myPosts'); list.replaceChildren(el('h3','Your submissions'));
      if(!posts.length) list.append(el('p','No submissions yet. Your next day by the water is a good place to start.'));
      for(const post of posts) {
        const card=el('article',undefined,'beach-social-card');
        card.append(el('strong',`${post.beach_name} · ${post.status === 'pending' && post.public_consent === false ? 'Resubmit to give public-listing permission' : post.status}`),original(post));
        if(post.rejection_reason) card.append(el('p',post.rejection_reason));
        if(['rejected','removed'].includes(post.status)) card.append(el('small','Correct the post or link, then submit it again above for a new review.'));
        if(post.status!=='removed') card.append(action('Withdraw post',async()=>{await api.call('removePost',{id:post.id});await history();},status));
        list.append(card);
      }
    }
    await history();
    const followed=el('section'); box.append(followed,el('small','Follow beaches in Profile & buddies to personalise this view.'));
    try {
      const data=await api.call('followedPosts');
      followed.append(el('h3','From beaches you follow'));
      for(const post of data.posts || []) {const card=el('article',undefined,'beach-social-card');card.append(el('strong',post.beach_name),original(post),action('View beach',()=>{location.href=sharePostURL(post);},status));followed.append(card);}
      if(!data.posts?.length) followed.append(el('p','Follow your beaches and approved posts from those shores will appear here.'));
    } catch { followed.append(el('p','Your followed beach feed is unavailable. Try again later.')); }
  }catch(error){status.textContent=error.message;box.append(action('Retry',async()=>{host.replaceChildren();await renderPostManager({host,api,beaches,refresh});},status));}
}
export async function renderPostAdmin({host,api}) {
  const box=el('section',undefined,'account-card post-review'),status=notice();box.append(el('h2','Community review'),el('p','Check the original public post, its creator, the @finfolk.com.au tag and the selected beach before approving.'),status);host.append(box);
  const filter=field(box,'Find a listing by original post URL (optional)','review-filter','url');
  box.append(action('Search / refresh',load,status));
  const content=el('div');box.append(content);
  async function load(){
    const data=await api.call('reviewPosts',{url:filter.value});content.replaceChildren();
    content.append(el('h3','Submitted and approved posts'));
    if(!data.posts.length) content.append(el('p','No posts awaiting review.'));
    for(const post of data.posts){
      const row=el('article',undefined,'beach-social-card'); row.append(el('strong',`${post.beach_name} · ${post.status}`),original(post));
      const ownership=field(row,'I checked creator attribution.','review-ownership','checkbox'),tag=field(row,'I checked the @finfolk.com.au tag.','review-tag','checkbox'),beach=field(row,'I checked the selected beach.','review-beach','checkbox'),reason=field(row,'Reason for rejection or removal','review-reason','textarea');reason.maxLength=1000;
      if(post.status==='pending') row.append(action('Approve',async()=>{await api.call('reviewPost',{id:post.id,decision:'approved',ownershipChecked:ownership.checked,tagChecked:tag.checked,beachChecked:beach.checked});await load();},status));
      row.append(action(post.status==='approved'?'Remove listing':'Reject',async()=>{await api.call('reviewPost',{id:post.id,decision:post.status==='approved'?'removed':'rejected',reason:reason.value});await load();},status));content.append(row);
    }
    content.append(el('h3','Open reports'));
    if(!data.reports.length) content.append(el('p','No open reports.'));
    for(const report of data.reports){
      const row=el('article',undefined,'beach-social-card');row.append(el('p',report.reason),original({...report,id:report.post_id,platform:report.url.includes('instagram.com')?'instagram':'tiktok'}));
      const reason=field(row,'Removal reason','report-removal-reason','textarea');reason.maxLength=1000;
      if(['approved','pending'].includes(report.status))row.append(action('Remove reported post',async()=>{await api.call('reviewPost',{id:report.post_id,decision:'removed',reason:reason.value});await load();},status));
      row.append(action('Resolve report',async()=>{await api.call('resolvePostReport',{id:report.id});await load();},status));content.append(row);
    }
  }
  try{await load();}catch(error){status.textContent=error.message;box.append(action('Retry review queue',load,status));}
  try{
    const metrics=await api.call('communityMetrics'),details=el('details');details.append(el('summary','Pilot activity · last 28 days'));
    details.append(el('p',`${metrics.membership?.members || 0} site-wide members · ${metrics.membership?.joined || 0} new · ${metrics.repeatParticipants} checked in during multiple weeks`));
    for(const week of metrics.weeks || [])details.append(el('p',`${String(week.week).slice(0,10)}: ${week.checkins} check-ins · ${week.participants} participants`));
    for(const day of metrics.referrals || [])details.append(el('p',`${String(day.day).slice(0,10)} · ${day.platform}: ${day.clicks} outbound clicks`));
    details.append(el('small','Clicks measure referrals, not interactions on Instagram or TikTok. No visitor identifiers are stored.'));box.append(details);
  }catch(error){box.append(el('p','Pilot activity is unavailable: '+error.message));}
}
