// Use public-post embeds only. Never accept arbitrary HTML or image CDN URLs.
export function socialPostURL(value){
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;const host=u.hostname.replace(/^www\./,'');let match;
    if(host==='instagram.com'&&(match=u.pathname.match(/^\/(p|reel)\/([A-Za-z0-9_-]+)\/?$/)))return {platform:'instagram',url:`https://www.instagram.com/${match[1]}/${match[2]}/`,embed:`https://www.instagram.com/${match[1]}/${match[2]}/embed/`};
    if(['x.com','twitter.com'].includes(host)&&(match=u.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)\/?$/)))return {platform:'x',url:`https://x.com/${match[1]}/status/${match[2]}`,id:match[2]};
  }catch{}return null;
}
