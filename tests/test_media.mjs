import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {socialGallery} from '../web/media.js';
const window=new Window({settings:{disableJavaScriptFileLoading:true,disableIframePageLoading:true}});globalThis.document=window.document;
try{
 assert.equal(socialGallery([]),null);let calls=0;
 globalThis.twttr={widgets:{createTweet:async()=>{calls++;return null;}}};
 const gallery=socialGallery([{url:'https://x.com/author/status/123',title:'<script>TEST</script>',author:'TEST',location_context:'TEST source',reviewed_at:'TEST',association_source:'javascript:alert(1)'}]);document.body.append(gallery);
 assert.equal(document.querySelectorAll('script').length,0);assert.equal(document.querySelectorAll('img').length,0);assert.equal(calls,0);
 const button=gallery.querySelector('button');button.click();for(let i=0;i<10&&button.disabled;i++)await new Promise(resolve=>setTimeout(resolve,1));assert.match(button.textContent,/unavailable/);assert.equal(button.disabled,false);assert.ok([...gallery.querySelectorAll('a')].some(a=>a.href==='https://x.com/author/status/123'));assert.ok(![...gallery.querySelectorAll('a')].some(a=>a.href.startsWith('javascript:')));
 globalThis.twttr.widgets.createTweet=async(id,body)=>{const post=document.createElement('blockquote');post.textContent='TEST embedded post';body.append(post);return post;};button.click();for(let i=0;i<10&&button.isConnected;i++)await new Promise(resolve=>setTimeout(resolve,1));assert.equal(button.isConnected,false);assert.ok(gallery.textContent.includes('TEST embedded post'));
 console.log('Media checks passed: no automatic third-party loads, no rehosted images, escaped text, failed/deleted-post fallback and retry.');
}finally{delete globalThis.twttr;await window.happyDOM.close();}
