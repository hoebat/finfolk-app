import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createMoodboardServer} from '../scripts/moodboard.mjs';
import {cleanOnboarding,onboardingErrors,onboardingNext,ONBOARDING_KEY} from '../design-board/onboarding-model.mjs';
assert.equal(cleanOnboarding(null).open,false);assert.deepEqual(cleanOnboarding({beaches:['bad','bondi','bondi']}).beaches,['bondi']);assert.equal('verified' in cleanOnboarding({verified:true}),false);assert.equal(cleanOnboarding({step:'verify',displayName:'Alex'}).step,'profile');assert.ok(onboardingErrors('profile',{displayName:'  '}).displayName);assert.equal(onboardingNext('profile'),'locations');
const server=createMoodboardServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
  const issues=[];page.on('pageerror',e=>issues.push(e.message));
  await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')}));await page.goto(base+'/board/onboarding.html');await page.getByLabel('Your name',{exact:true}).waitFor();
  assert.equal(await page.locator('[name=email],[name=verificationCode]').count(),0);assert.equal(await page.getByRole('button',{name:'← Back',exact:true}).count(),0);
  await page.getByRole('button',{name:'Continue →',exact:true}).click();assert.ok(await page.locator('#onboarding-displayName-error').textContent());
  await page.getByLabel('Your name',{exact:true}).fill('Ocean Alex');await page.getByLabel('A little about you (optional)',{exact:true}).fill('Shore sessions and quiet mornings.');
  await page.reload();assert.equal(await page.getByLabel('Your name',{exact:true}).inputValue(),'Ocean Alex');
  await page.getByRole('button',{name:'Continue →',exact:true}).click();await page.getByText('Bondi Beach',{exact:true}).click();await page.getByRole('button',{name:'Continue →',exact:true}).click();
  assert.equal(await page.locator('input[value=closed]').isChecked(),true);await page.getByRole('button',{name:'Continue →',exact:true}).click();
  await page.getByRole('button',{name:'Skip for now',exact:true}).click();
  assert.equal(await page.locator('.onboarding-review').getByText('Ocean Alex',{exact:true}).count(),1);
  await page.getByRole('button',{name:'Edit name',exact:true}).click();assert.equal(await page.getByLabel('Your name',{exact:true}).inputValue(),'Ocean Alex');
  await page.goBack();await page.waitForURL('**/onboarding.html#review');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  if(width===390)await page.screenshot({path:'/tmp/finfolk-onboarding-review.png'});
  await page.getByRole('button',{name:'Make it mine →',exact:true}).click();await page.waitForURL('**/onboarding.html#done');
  await page.getByRole('link',{name:'See your profile',exact:true}).click();await page.getByRole('heading',{name:'Ocean Alex',exact:true}).waitFor();
  assert.equal(await page.locator('.profile-owner-state').textContent(),'Closed · Hidden from People. Published logs can still be shared; accepted buddies keep access to permitted statistics.');
  assert.equal(await page.locator('[data-featured-post]').count(),0,'New member does not inherit sample featured posts');
  assert.equal(await page.locator('.member-bio').textContent(),'Shore sessions and quiet mornings.');assert.deepEqual(issues,[]);await context.close();
 }
 // Both auth providers arrive at the same setup; no provider data is collected here.
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')}));await page.goto(base+'/board/onboarding.html');await page.getByLabel('Your name',{exact:true}).fill('Verified Member');await page.getByRole('button',{name:'Continue →',exact:true}).click();await page.getByRole('button',{name:'Skip for now',exact:true}).click();await page.locator('input[value=open]').check();await page.getByRole('button',{name:'Continue →',exact:true}).click();await page.getByRole('button',{name:'Skip for now',exact:true}).click();assert.match(await page.locator('.onboarding-review').textContent(),/Explore first.*Open/s);await context.close();
 // Older drafts migrate to profile setup without retaining simulated authentication.
 const legacy=await browser.newContext({viewport:{width:390,height:844}});await legacy.addInitScript(key=>localStorage.setItem(key,JSON.stringify({step:'verify',displayName:'Existing draft',bio:'Keep me',accountMethod:'email',email:'old@example.test',verified:false})),ONBOARDING_KEY);const old=await legacy.newPage();await old.goto(base+'/board/onboarding.html');assert.equal(await old.getByLabel('Your name',{exact:true}).inputValue(),'Existing draft');assert.equal(await old.getByLabel('A little about you (optional)',{exact:true}).inputValue(),'Keep me');const migrated=await old.evaluate(key=>JSON.parse(localStorage.getItem(key)),ONBOARDING_KEY);assert.equal(migrated.step,'profile');assert.equal('accountMethod' in migrated,false);await legacy.close();
 // Failed storage must never claim completion.
 const broken=await browser.newContext({viewport:{width:390,height:844}});await broken.addInitScript(()=>Object.defineProperty(window,'indexedDB',{value:undefined}));const p=await broken.newPage();await p.goto(base+'/board/onboarding.html?step=review');await p.getByRole('button',{name:'Make it mine →',exact:true}).click();await p.getByText('Your profile could not be saved.',{exact:false}).waitFor();assert.ok(!p.url().endsWith('#done'));await broken.close();
 console.log('Onboarding passed: phone/tablet/desktop, post-verification entry, draft migration, validation, resume, Back, skips, privacy, local profile handoff and save failure.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
