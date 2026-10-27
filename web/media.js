// Use public-post embeds only. Never accept arbitrary HTML or image CDN URLs.
export function socialPostURL(value){
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;const host=u.hostname.replace(/^www\./,'');let match;
    if(host==='instagram.com'&&(match=u.pathname.match(/^\/(p|reel)\/([A-Za-z0-9_-]+)\/?$/)))return {platform:'instagram',url:`https://www.instagram.com/${match[1]}/${match[2]}/`,embed:`https://www.instagram.com/${match[1]}/${match[2]}/embed/`};
    if(['x.com','twitter.com'].includes(host)&&(match=u.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)\/?$/)))return {platform:'x',url:`https://x.com/${match[1]}/status/${match[2]}`,id:match[2]};
  }catch{}return null;
}
export function postsForBeach(catalog,beach){return (catalog?.posts||[]).filter(p=>(p.beach_ids?.includes(beach.id)||p.area_ids?.includes(beach.area_id))&&socialPostURL(p.url));}
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
function anchor(text,url){const a=el('a',text);try{const u=new URL(url);if(u.protocol==='https:'&&!u.username&&!u.password)a.href=u.href;}catch{}a.target='_blank';a.rel='noopener noreferrer';return a;}
let xScript;
export function socialGallery(posts){
  if(!posts.length)return null;const section=el('section');section.className='social-gallery';section.append(el('h3','Location photos & social posts'),el('p','Historical public posts, loaded only when you choose. These images do not establish current conditions.'));
  const grid=el('div');grid.className='social-grid';
  for(const post of posts){const parsed=socialPostURL(post.url);if(!parsed)continue;const card=el('article');card.className='social-card';const button=el('button',`Load ${parsed.platform==='x'?'X':'Instagram'} post`);button.className='secondary';const body=el('div');card.append(el('h4',post.title),el('p',post.location_context),el('small',`${post.author||'Original creator'} · association reviewed ${post.reviewed_at}`),button,body,anchor('Open original post ↗',parsed.url));if(post.association_source)card.append(document.createTextNode(' · '),anchor('Location source ↗',post.association_source));
    button.onclick=async()=>{button.disabled=true;button.textContent='Loading post…';try{
      if(parsed.platform==='instagram'){const frame=el('iframe');frame.src=parsed.embed;frame.title=post.title;frame.loading='lazy';frame.referrerPolicy='strict-origin-when-cross-origin';frame.setAttribute('allowfullscreen','');frame.height='520';body.append(frame);button.remove();}
      else{xScript??=new Promise((resolve,reject)=>{if(globalThis.twttr?.widgets){resolve();return;}const s=el('script');s.src='https://platform.twitter.com/widgets.js';s.onload=()=>{if(globalThis.twttr?.widgets?.createTweet)resolve();else if(globalThis.twttr?.ready)globalThis.twttr.ready(resolve);else{xScript=null;reject(Error('embed unavailable'));}};s.onerror=()=>{xScript=null;reject(Error('embed unavailable'));};document.head.append(s);});await xScript;const embedded=await globalThis.twttr.widgets.createTweet(parsed.id,body,{dnt:true});if(!embedded)throw Error('post unavailable');button.remove();}
      body.append(el('small','If the post cannot be displayed, use the original-post link.'));
    }catch{button.textContent='Post unavailable · open original or retry';button.disabled=false;}};grid.append(card);
  }section.append(grid);return section;
}
