import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createMoodboardServer} from '../scripts/moodboard.mjs';
const server=createMoodboardServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [1440,820,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto(base+'/#workflows/events/create');await page.locator('.workflow-frame').waitFor();
  await page.mouse.move(width-35,550);await page.mouse.wheel(0,900);
  await page.waitForFunction(mobile=>mobile?scrollY>0:document.querySelector('.canvas').scrollTop>0,width<=760);
  if(width>760){assert.equal(await page.evaluate(()=>scrollY),0);assert.equal(await page.locator('.canvas').evaluate(el=>getComputedStyle(el).overflowY),'auto');}
  await page.locator('.workflow-review-form textarea').scrollIntoViewIfNeeded();assert.ok(await page.locator('.workflow-review-form textarea').isVisible());
  if(width>760){
   for(const hash of ['screens','designs','logos','board']){
    await page.goto(base+'/#'+hash);await page.waitForFunction(hash=>location.hash==='#'+hash,hash);
    await page.waitForTimeout(80);
    assert.ok(Math.abs(await page.locator('.studio-layout').evaluate(el=>el.getBoundingClientRect().bottom)-900)<2,'Layout fills the space under the actual header');
    await page.mouse.move(width-35,550);await page.mouse.wheel(0,700);
    await page.waitForFunction(()=>document.querySelector('.canvas').scrollTop>0);
   }
  }
  // The nested product viewport can scroll while its host pane stays put.
  await page.goto(base+'/#preview/profile-builder');await page.frameLocator('#preview').locator('[data-profile-collect]').waitFor();
  const iframe=page.locator('#preview');await iframe.scrollIntoViewIfNeeded();
  const next=page.frameLocator('#preview').locator('.profile-step-next');await next.scrollIntoViewIfNeeded();
  const before=await page.evaluate(()=>({body:scrollY,canvas:document.querySelector('.canvas').scrollTop}));
  const box=await next.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await page.frameLocator('#preview').locator('#profile-step-2:not([hidden])').waitFor();
  const after=await page.evaluate(()=>({body:scrollY,canvas:document.querySelector('.canvas').scrollTop}));
  assert.deepEqual(after,before,'Builder step navigation must not scroll the host');
  const frame=page.frameLocator('#preview');const innerBefore=await frame.locator('body').evaluate(()=>scrollY);
  const bounds=await iframe.boundingBox();const point={x:bounds.x+bounds.width/2,y:Math.max(220,Math.min(700,bounds.y+250))};await page.mouse.move(point.x,point.y);await page.mouse.wheel(0,500);await page.waitForTimeout(200);
  assert.ok(await frame.locator('body').evaluate(()=>scrollY)>innerBefore,'Phone preview scrolls');
  assert.deepEqual(await page.evaluate(()=>({body:scrollY,canvas:document.querySelector('.canvas').scrollTop})),after,'Preview wheel scrolling stays in its viewport');
  await page.close();
 }
 console.log('Atelier scrolling passed: desktop/tablet content, phone document, reachable reviews and isolated preview steps/wheel scrolling.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
