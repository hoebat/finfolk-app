import {LOCATIONS,OWN_ID} from './profile-data.mjs';
export const PROFILE_ADD_COMMAND='/profile add @finfolk.com.au';
const commandLine=/^\s*\/profile\s+add\s+@finfolk\.com\.au\s*[.!]?\s*$/i;
export function profilePostURL(value){
 let u;try{u=new URL(String(value).trim());}catch{throw Error('Enter a full Instagram post or reel URL.');}
 if(u.protocol!=='https:'||!['instagram.com','www.instagram.com'].includes(u.hostname)||u.username||u.password||u.port||!/^\/(p|reel)\/[A-Za-z0-9_-]{1,100}\/?$/.test(u.pathname))throw Error('Enter an Instagram post or reel URL, such as https://www.instagram.com/p/POST_ID/.');
 return 'https://www.instagram.com'+u.pathname.replace(/\/$/,'')+'/';
}
export function collectProfilePost({url,caption},posts=[]){
 const sourceUrl=profilePostURL(url),text=String(caption||'').trim();
 if(!text||text.length>5000)throw Error('Enter a caption of up to 5,000 characters.');
 const lines=text.split(/\r?\n/);if(lines.filter(line=>commandLine.test(line)).length!==1)throw Error('Add /profile add @finfolk.com.au on its own line in the caption.');
 if(lines.some(line=>!commandLine.test(line)&&/(^|\s)\/(profile|publish|checkin|me)\b/i.test(line)))throw Error('Use one profile command per caption.');
 if(posts.some(p=>p.sourceUrl===sourceUrl))throw Error('This post is already in your profile collection.');
 if(posts.length>=20)throw Error('Your profile collection holds up to 20 posts. Remove one before adding another.');
 const excerpt=lines.filter(line=>!commandLine.test(line)).join('\n').trim();
 if(!excerpt)throw Error('Add some caption text to help craft your profile.');
 const key=sourceUrl.split('/').filter(Boolean).at(-1);
 return {id:'instagram-profile-'+key,ownerId:OWN_ID,platform:'instagram',kind:sourceUrl.includes('/reel/')?'Reel':'Post',sourceUrl,caption:excerpt,title:excerpt.split('\n')[0].slice(0,100),locations:LOCATIONS.filter(place=>new RegExp('(^|[^a-z])'+place.name+'(?=$|[^a-z])','i').test(excerpt)).map(place=>place.id),sample:true};
}
export function cleanProfilePosts(value){
 if(!Array.isArray(value))return [];
 const posts=[];for(const item of value.slice(0,20)){try{posts.push(collectProfilePost({url:item.sourceUrl,caption:String(item.caption||'')+'\n'+PROFILE_ADD_COMMAND},posts));}catch{}}
 return posts;
}
export function suggestProfile(posts){
 const captions=[...new Set(posts.map(post=>post.caption.trim()).filter(Boolean))];
 return {bio:captions.join('\n\n').slice(0,500),beaches:[...new Set(posts.flatMap(post=>post.locations))]};
}
