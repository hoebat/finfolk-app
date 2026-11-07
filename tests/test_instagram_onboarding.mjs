import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {stat} from 'node:fs/promises';
import {createMoodboardServer} from '../scripts/moodboard.mjs';
import {MEMBERS,portraitPath,POSTS} from '../design-board/profile-data.mjs';
for(const member of MEMBERS){assert.ok(portraitPath(member).endsWith('-sketch-v2.webp'));assert.ok((await stat(new URL('../design-board/'+portraitPath(member).slice('/board/'.length),import.meta.url))).size>0);}
for(const post of POSTS)assert.ok(post.poster.includes('sketch-v2'));
const server=createMoodboardServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [320,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/instagram\.com|facebook\.com/.test(r.url()))external.push(r.url());});
  await page.goto(base+'/board/onboarding.html?step=instagram-connect');const connect=page.locator('[data-feature-demo=instagram-setup]');await connect.locator('.demo-page.is-active').waitFor();
  assert.match(await page.locator('.onboarding-connect-steps').textContent(),/follow.*\/connect.*eight-character/s);
  await page.getByRole('button',{name:'Pause animation',exact:true}).click();const first=Number(await connect.getAttribute('data-step'));await page.getByRole('button',{name:'Next frame',exact:true}).click();assert.equal(Number(await connect.getAttribute('data-step')),(first+1)%4);
  await page.getByRole('button',{name:'See how profile posts work →',exact:true}).click();const posts=page.locator('[data-feature-demo=instagram-profile]');await posts.locator('.demo-page.is-active').waitFor();
  await page.getByRole('button',{name:'Pause animation',exact:true}).click();
  for(let i=0;i<4;i++){await page.getByRole('button',{name:'Next frame',exact:true}).click();const phase=posts.locator('.demo-page.is-active');assert.equal(await phase.count(),1);assert.ok(await phase.textContent());}
  assert.match(await posts.textContent(),/\/profile add @finfolk\.com\.au/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  if(width===390)await page.screenshot({path:'/tmp/finfolk-instagram-profile-animation.png',fullPage:true});
  await page.getByRole('button',{name:'Skip for now',exact:true}).click();await page.waitForURL('**#review');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[],'Preview never contacts Instagram automatically');await page.close();
 }
 const page=await browser.newPage({viewport:{width:390,height:900},reducedMotion:'reduce'});await page.goto(base+'/board/onboarding.html?step=instagram-connect');await page.getByRole('button',{name:'Play animation',exact:true}).waitFor();assert.equal(await page.locator('[data-feature-demo]').getAttribute('data-motion'),'paused');await page.getByRole('button',{name:'Previous frame',exact:true}).click();assert.equal(await page.locator('[data-feature-demo]').getAttribute('data-step'),'2');await page.screenshot({path:'/tmp/finfolk-instagram-connect-animation.png',fullPage:true});await page.close();
 console.log('Instagram onboarding passed: connection instructions, profile-post animation, manual playback, reduced motion, skips, illustrated assets and no automatic provider requests.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
