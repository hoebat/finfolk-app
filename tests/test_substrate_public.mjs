import assert from 'node:assert/strict';
import {applicationBackbone,publicOperation} from '../web/app-backbone.js';
import {getInstagramFeed} from '../web/instagram-discovery.js';
const oldFetch=globalThis.fetch,requests=[];
globalThis.fetch=async(url,options)=>{requests.push({url:new URL(url),options});return Response.json({posts:[]});};
try {
 const app=await applicationBackbone({backbone:true,apiUrl:'https://next.public.test/',authUrl:'https://auth.public.test'});
 await publicOperation('publicTrips',{beachId:'bondi',ownerId:'fixture'},'https://next.public.test/',()=>assert.fail('Next cannot bypass substrate'));
 assert.equal(requests[0].url.pathname,'/trips');assert.equal(requests[0].url.searchParams.get('beachId'),'bondi');assert.equal(app.public.read('publicTrips',{ownerId:'fixture',beachId:'bondi'}).posts.length,0);
 await publicOperation('publicReferral',{postId:'fixture'},'https://next.public.test/',()=>assert.fail());assert.equal(requests.at(-1).options.keepalive,true);assert.equal(requests.at(-1).options.method,'POST');
 const feed=await getInstagramFeed('https://next.public.test/','bondi');assert.equal(feed.posts.length,0);assert.equal(requests.at(-1).url.pathname,'/instagram/posts');
 await assert.rejects(()=>publicOperation('unknown',{},'https://next.public.test/',()=>assert.fail()),/Unknown/);
 await assert.rejects(()=>publicOperation('publicTrips',{},'https://production.test/',()=>assert.fail()),/environment mismatch/);
 app.member('private-user',async()=>({private:true}));app.clearMember();assert.equal(app.public.actor,'public');assert.equal(app.state('auth').status,'signed-out');
 console.log('SUBSTRATE_PUBLIC_PASS: shared anonymous models, existing feed interface, query serialization, environment binding and keepalive mutations.');
} finally {globalThis.fetch=oldFetch;}
