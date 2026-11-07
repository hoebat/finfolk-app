import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createMoodboardServer} from '../scripts/moodboard.mjs';
import {WORKFLOWS} from '../design-board/workflows.mjs';
import {SCREENS,screenURL} from '../design-board/screens.mjs';
const server=createMoodboardServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;let browser;
const screens=SCREENS.map(s=>s.id);
const snapshots=new Set(['people','edit-profile','pages-directory','create-event','practice-library','session-study','my-pages','signin','settings','discover','logbook']);
const findings=[];await mkdir('/tmp/finfolk-workflow-review',{recursive:true});
try{
 browser=await chromium.launch({headless:true});
 for(const width of [320,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  for(const screen of ([320,768].includes(width)?[...snapshots,'watch-garmin','practice-demo']:screens)){
   await page.goto(base+screenURL(screen));
   await page.waitForFunction(()=>!document.querySelector('#profile-main')||!document.querySelector('#profile-main').textContent.includes('Loading'));
   await page.waitForTimeout(160);
   assert.equal(await page.locator('#profile-main').filter({hasText:'could not load'}).count(),0,screen+' must load');
   const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,items:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right>innerWidth+2&&getComputedStyle(e).position!=='fixed';}).slice(0,8).map(e=>e.tagName+'.'+e.className)}));
   if(overflow.scroll>width+2)findings.push({screen,width,...overflow});
   if(width===390&&snapshots.has(screen))await page.screenshot({path:`/tmp/finfolk-workflow-review/${screen}.png`});
  }
  await page.goto(base+'/#workflows/events/create');await page.locator('.workflow-frame.phone').waitFor();
  assert.equal(await page.locator('.workflow-device-picker button').first().getAttribute('aria-pressed'),'true');
  await page.locator('[aria-label="Review status"]').selectOption('Needs changes');await page.locator('.workflow-review-form textarea').fill('Mobile layout reviewed.');
  await page.reload();await page.locator('.workflow-frame.phone').waitFor();assert.equal(await page.locator('.workflow-review-form textarea').inputValue(),'Mobile layout reviewed.');
  await page.locator('.workflow-navigation button').last().click();await page.waitForURL('**/#workflows/events/invalid');
  await page.evaluate(()=>history.back());await page.waitForURL('**/#workflows/events/create');
  await page.goto(base+'/#workflows/posts/review');await page.waitForFunction(()=>document.querySelector('.workflow-current h3')?.textContent==='Approve or reject a post');
  assert.equal(await page.locator('.workflow-review-form').getByRole('option',{name:'Passed',exact:true}).evaluate(el=>el.disabled),true);
  assert.equal(await page.locator('.workflow-frame').isVisible(),false);
  await page.goto(base+'/#workflows/events/create');await page.locator('.workflow-frame.phone').waitFor();
  if(width===390)await page.screenshot({path:'/tmp/finfolk-workflow-review/reviewer.png'});
  await page.close();
 }
 await writeFile('/tmp/finfolk-workflow-review/findings.json',JSON.stringify(findings,null,2));
 console.log(JSON.stringify({screens:screens.length,widths:[320,390,768,1440],overflow:findings},null,2));
 assert.equal(findings.length,0,'Workflow pages must fit the viewport. See /tmp/finfolk-workflow-review/findings.json');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
