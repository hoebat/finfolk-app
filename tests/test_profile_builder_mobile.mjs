import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createMoodboardServer} from '../scripts/moodboard.mjs';
const server=createMoodboardServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:844}});const page=await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/board/profiles.html?screen=edit`);
  await page.locator('[data-profile-collect]').waitFor();
  assert.equal(await page.locator('.profile-step-panel:not([hidden])').getAttribute('id'),'profile-step-1');
  if(width<761)assert.equal(await page.locator('.profile-editor-preview').isVisible(),false);
  await page.locator('[name=profilePostURL]').fill('https://instagram.com/p/MobilePreview/');
  await page.locator('[name=profilePostCaption]').fill('Shore dives at Portsea Beach.\n/profile add @finfolk.com.au');
  await page.locator('[data-profile-collect]').click();await page.locator('[data-profile-feature]').click();
  assert.equal(await page.locator('.profile-source-caption').getAttribute('open'),null);
  await page.locator('.profile-step-next').click();await page.locator('[name=suggestedBio]').fill('My mobile profile draft.');
  await page.getByRole('button',{name:'Use reviewed bio',exact:true}).click();
  await page.locator('[name=displayName]').fill('Mobile Diver');
  await page.locator('.profile-step-back').click();await page.locator('.profile-step-next').click();
  assert.equal(await page.locator('[name=displayName]').inputValue(),'Mobile Diver');
  assert.equal(await page.locator('[name=suggestedBio]').inputValue(),'My mobile profile draft.');
  await page.locator('.profile-step-next').click();
  assert.equal(await page.locator('button[type=submit]').isVisible(),true);
  assert.equal(await page.locator('.profile-editor-preview').isVisible(),true);
  for(const step of [1,2,3]){
   await page.locator('.profile-builder-steps button').nth(step-1).click();
   assert.ok(await page.locator('.profile-editor').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
   for(const b of await page.locator('.profile-builder-steps button').all()){const box=await b.boundingBox();assert.ok(box.height>=44);}
   assert.ok(Number.parseFloat(await page.locator('[name=bio]').evaluate(el=>getComputedStyle(el).fontSize))>=16);
  }
  if(width===390){await page.locator('.profile-builder-steps button').first().click();await page.screenshot({path:'/tmp/finfolk-builder-mobile-first.png'});await page.locator('.profile-builder-steps button').last().click();}
  await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.locator('h1').filter({hasText:'Mobile Diver'}).waitFor();
  await page.reload();await page.locator('h1').filter({hasText:'Mobile Diver'}).waitFor();
  assert.equal(await page.locator('.member-bio').textContent(),'My mobile profile draft.');
  await context.close();
 }
 console.log('Mobile profile builder passed at 320, 390, 768 and 1440 px: steps, draft retention, touch targets, input sizes, save and reload.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
