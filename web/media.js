// Use public-post embeds only. Never accept arbitrary HTML or image CDN URLs.
export function socialPostURL(value){
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;const host=u.hostname.replace(/^www\./,'');let match;
    if(host==='instagram.com'&&(match=u.pathname.match(/^\/(p|reel)\/([A-Za-z0-9_-]+)\/?$/)))return {platform:'instagram',url:`https://www.instagram.com/${match[1]}/${match[2]}/`,embed:`https://www.instagram.com/${match[1]}/${match[2]}/embed/`};
    if(['x.com','twitter.com'].includes(host)&&(match=u.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)\/?$/)))return {platform:'x',url:`https://x.com/${match[1]}/status/${match[2]}`,id:match[2]};
  }catch{}return null;
}
export function postsForBeach(catalog,beach){return (catalog?.posts||[]).filter(p=>(p.beach_ids?.includes(beach.id)||p.area_ids?.includes(beach.area_id))&&socialPostURL(p.url));}
export function instagramSearchURL(beach){const url=new URL('https://www.instagram.com/explore/search/keyword/');url.searchParams.set('q',[beach.name,beach.area_name,beach.state,'Australia'].filter(Boolean).join(' '));return url.href;}
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
function anchor(text,url){const a=el('a',text);try{const u=new URL(url);if(u.protocol==='https:'&&!u.username&&!u.password)a.href=u.href;}catch{}a.target='_blank';a.rel='noopener noreferrer';return a;}
const storageKey=id=>`shore-depth:instagram:${id}`;
function storedPosts(id){try{const data=JSON.parse(globalThis.localStorage?.getItem(storageKey(id))||'[]');return Array.isArray(data)?[...new Set(data.filter(v=>typeof v==='string').map(v=>socialPostURL(v)).filter(p=>p?.platform==='instagram').map(p=>p.url))].slice(0,8):[];}catch{return [];}}
function savePosts(id,urls){try{if(!globalThis.localStorage)return false;if(urls.length)globalThis.localStorage.setItem(storageKey(id),JSON.stringify(urls));else globalThis.localStorage.removeItem(storageKey(id));return true;}catch{return false;}}
let xScript;
function postCard(post){
  const parsed=socialPostURL(post.url);if(!parsed)return null;const card=el('article');card.className='social-card';const button=el('button',`Load ${parsed.platform==='x'?'X':'Instagram'} post`);button.type='button';button.className='secondary social-preview';const body=el('div');body.className='social-embed';card.append(el('h4',post.title),el('p',post.location_context),el('small',post.added?'Added on this device · location not independently checked':`${post.author||'Original creator'} · association reviewed ${post.reviewed_at}`),button,body,anchor('Open original post ↗',parsed.url));if(post.association_source)card.append(document.createTextNode(' · '),anchor('Location source ↗',post.association_source));
  button.onclick=async()=>{button.disabled=true;button.textContent='Loading post…';try{
    if(parsed.platform==='instagram'){const frame=el('iframe');frame.src=parsed.embed;frame.title=post.title;frame.loading='lazy';frame.referrerPolicy='strict-origin-when-cross-origin';frame.setAttribute('allowfullscreen','');frame.height='520';body.append(frame);button.remove();}
    else{xScript??=new Promise((resolve,reject)=>{if(globalThis.twttr?.widgets){resolve();return;}const s=el('script');s.src='https://platform.twitter.com/widgets.js';s.onload=()=>{if(globalThis.twttr?.widgets?.createTweet)resolve();else if(globalThis.twttr?.ready)globalThis.twttr.ready(resolve);else{xScript=null;reject(Error('embed unavailable'));}};s.onerror=()=>{xScript=null;reject(Error('embed unavailable'));};document.head.append(s);});await xScript;const embedded=await globalThis.twttr.widgets.createTweet(parsed.id,body,{dnt:true});if(!embedded)throw Error('post unavailable');button.remove();}
    body.append(el('small','Private, removed or blocked posts may not display. Open the original post to view it on Instagram/X.'));
  }catch{button.textContent='Post unavailable · open original or retry';button.disabled=false;}};
  return {card,load:()=>button.click()};
}
export function socialGallery(posts,beach){
  if(!posts.length&&!beach)return null;const section=el('section');section.className='social-gallery';section.append(el('h3',beach?'Instagram photos':'Around the beach'),el('p','Find location photos or load a public post. Historical images do not show current conditions.'));
  const grid=el('div');grid.className='social-grid';const known=new Set(posts.map(p=>socialPostURL(p.url)?.url));let saved=beach?storedPosts(beach.id).filter(url=>!known.has(url)):[],feedback;
  function add(url,load=false){const result=postCard({url,title:`${beach.name} · linked post`,added:true,location_context:'A link you selected for this beach; check the creator’s caption for the location.'});if(!result)return;const remove=el('button','Remove link');remove.type='button';remove.className='text-button';remove.onclick=()=>{saved=saved.filter(v=>v!==url);savePosts(beach.id,saved);result.card.remove();if(feedback)feedback.textContent='Link removed from this device.';};result.card.append(remove);grid.prepend(result.card);if(load)result.load();}
  if(beach){
    section.append(anchor('Search Instagram ↗',instagramSearchURL(beach)),el('small','Search opens Instagram and may require sign-in. Check the location before choosing a post.'));
    const form=el('form');form.className='instagram-form';const label=el('label','Instagram post or reel link'),input=el('input'),button=el('button','Load post'),status=el('p');input.type='url';input.id=`instagram-url-${beach.id}`;input.placeholder='https://www.instagram.com/p/…/';input.required=true;input.autocomplete='off';label.htmlFor=input.id;button.type='submit';button.className='secondary';feedback=status;status.className='instagram-status';status.setAttribute('role','status');const row=el('div');row.append(input,button);form.append(label,row,status,el('small','Your links stay on this device. Previews load from Instagram only when you ask; they are not shared with other visitors.'));
    form.onsubmit=event=>{event.preventDefault();const parsed=socialPostURL(input.value.trim());if(parsed?.platform!=='instagram'){status.textContent='Paste an Instagram post (/p/) or reel (/reel/) link.';return;}if(known.has(parsed.url)||saved.includes(parsed.url)){status.textContent='This post is already below. Choose its Load button or original link.';return;}if(saved.length>=8){status.textContent='Remove a saved link before adding another (8 per beach).';return;}saved.push(parsed.url);const persisted=savePosts(beach.id,saved);add(parsed.url,true);input.value='';status.textContent=persisted?'Post added. Link saved on this device.':'Post added for this visit; device storage is unavailable.';};section.append(form);
  }
  for(const post of posts){const result=postCard(post);if(result)grid.append(result.card);}for(const url of saved)add(url);section.append(grid);return section;
}
