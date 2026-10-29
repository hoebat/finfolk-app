import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {socialGallery,instagramSearchURL} from '../web/media.js';
const window=new Window({settings:{disableJavaScriptFileLoading:true,disableIframePageLoading:true}});globalThis.document=window.document;
globalThis.localStorage=window.localStorage;
try{
 assert.equal(socialGallery([]),null);let calls=0;
 globalThis.twttr={widgets:{createTweet:async()=>{calls++;return null;}}};
 const gallery=socialGallery([{url:'https://x.com/author/status/123',title:'<script>TEST</script>',author:'TEST',location_context:'TEST source',reviewed_at:'TEST',association_source:'javascript:alert(1)'}]);document.body.append(gallery);
 assert.equal(document.querySelectorAll('script').length,0);assert.equal(document.querySelectorAll('img').length,0);assert.equal(calls,0);
 const button=gallery.querySelector('button');button.click();for(let i=0;i<10&&button.disabled;i++)await new Promise(resolve=>setTimeout(resolve,1));assert.match(button.textContent,/unavailable/);assert.equal(button.disabled,false);assert.ok([...gallery.querySelectorAll('a')].some(a=>a.href==='https://x.com/author/status/123'));assert.ok(![...gallery.querySelectorAll('a')].some(a=>a.href.startsWith('javascript:')));
 globalThis.twttr.widgets.createTweet=async(id,body)=>{const post=document.createElement('blockquote');post.textContent='TEST embedded post';body.append(post);return post;};button.click();for(let i=0;i<10&&button.isConnected;i++)await new Promise(resolve=>setTimeout(resolve,1));assert.equal(button.isConnected,false);assert.ok(gallery.textContent.includes('TEST embedded post'));
 const beach={id:'test-beach',name:'Edithvale Beach',area_name:'Port Phillip Bay',state:'Victoria'};
 const search=new URL(instagramSearchURL(beach));assert.equal(search.hostname,'www.instagram.com');assert.ok(search.searchParams.get('q').includes('Edithvale Beach'));
 const empty=socialGallery([],beach);document.body.append(empty);assert.equal(empty.querySelectorAll('iframe').length,0);assert.ok(empty.querySelector('form'));
 const input=empty.querySelector('input'),form=empty.querySelector('form'),submit=value=>{input.value=value;form.dispatchEvent(new window.Event('submit',{cancelable:true}));};
 for(const value of ['https://evil.example/p/a/','https://instagram.com.evil.test/p/a/','https://x.com/author/status/123','https://www.instagram.com/beach/','https://user:pass@instagram.com/p/a/']){submit(value);assert.equal(empty.querySelectorAll('iframe').length,0);assert.match(empty.querySelector('[role=status]').textContent,/Paste an Instagram/);}
 submit('https://www.instagram.com/reel/TEST_123/?igsh=tracking');assert.equal(empty.querySelector('iframe').src,'https://www.instagram.com/reel/TEST_123/embed/');assert.match(empty.textContent,/location not independently checked/);
 submit('https://instagram.com/reel/TEST_123/');assert.equal(empty.querySelectorAll('iframe').length,1,'Duplicate links are not added');
 const reopened=socialGallery([],beach);document.body.append(reopened);assert.equal(reopened.querySelectorAll('.social-card').length,1);assert.equal(reopened.querySelectorAll('iframe').length,0,'Remembered links must not automatically load Instagram');
 assert.equal(socialGallery([],{...beach,id:'different'}).querySelectorAll('.social-card').length,0,'Links belong to their beach');
 reopened.querySelector('.social-card>.text-button').click();assert.equal(socialGallery([],beach).querySelectorAll('.social-card').length,0,'Removing a saved link persists');
 localStorage.setItem('shore-depth:instagram:test-beach','{"bad":true}');assert.ok(socialGallery([],beach));localStorage.setItem('shore-depth:instagram:test-beach','["javascript:alert(1)","https://evil.example/p/a/"]');assert.equal(socialGallery([],beach).querySelectorAll('.social-card').length,0);
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('storage blocked');}});const blocked=socialGallery([],beach);blocked.querySelector('input').value='https://instagram.com/p/SAFE/';blocked.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));assert.equal(blocked.querySelectorAll('iframe').length,1);assert.match(blocked.textContent,/storage is unavailable/);delete globalThis.localStorage;
 console.log('Media checks passed: no automatic third-party loads, no rehosted images, escaped text, failed/deleted-post fallback and retry.');
}finally{delete globalThis.twttr;await window.happyDOM.close();}
