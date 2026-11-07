import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createMoodboardServer} from '../scripts/moodboard.mjs';
const server=createMoodboardServer();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/`;
let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 const visible=async id=>{await page.locator('#'+id+'-tab').waitFor({state:'attached'});await page.waitForFunction(id=>document.getElementById(id+'-tab').getAttribute('aria-pressed')==='true',id);};
 for(const [hash,tab] of [['preview/practice-library','preview'],['board','board'],['screens','screens'],['designs','studies'],['logos','logos'],['workflows/events/create','workflows'],['fins','logos'],['club','logos'],['lava','logos'],['logos/shortlist','logos'],['small-marks','studies'],['page-designs','studies'],['underwater-scene','studies'],['wordmark','studies'],['state-motifs','studies'],['stencils','studies'],['habitat','studies']]){
  await page.goto(base+'#'+hash);await visible(tab);
  await page.reload();await visible(tab);
  assert.equal(new URL(page.url()).hash,'#'+hash);
 }
 await page.goto(base+'#preview/practice-library');await visible('preview');
 await page.selectOption('#screen-select','settings');await page.waitForURL('**/#preview/settings');
 const frame=await page.locator('#preview').getAttribute('src');
 await page.locator('#board-tab').evaluate(el=>el.click());await visible('board');
 await page.goBack();await visible('preview');assert.equal(new URL(page.url()).hash,'#preview/settings');
 assert.equal(await page.locator('#preview').getAttribute('src'),frame);
 await page.goForward();await visible('board');
 await page.locator('#preview-tab').evaluate(el=>el.click());await visible('preview');assert.equal(new URL(page.url()).hash,'#preview/settings');
 await page.locator('#screens-tab').evaluate(el=>el.click());await visible('screens');
 await page.click('[data-screen="practice-library"]');await visible('preview');assert.equal(new URL(page.url()).hash,'#preview/practice-library');
 // Every registered screen is reachable through the category menus.
 const {SCREENS}=await import('../design-board/screens.mjs');
 for(const screen of SCREENS)assert.equal(await page.locator(`#atelier-navigation a[href="#preview/${screen.id}"]`).count(),1);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  const summary=page.locator('#atelier-navigation summary').filter({hasText:'Product previews'});
  await summary.click();
  await page.locator('#atelier-navigation a[href="#preview/practice-demo"]').click();await visible('preview');
  assert.equal(await page.locator('#atelier-navigation a[aria-current="page"]').getAttribute('href'),'#preview/practice-demo');
  assert.equal(await page.locator('#atelier-navigation details[open]').count(),0);
  await summary.click();await summary.press('Escape');
  assert.equal(await page.locator('#atelier-navigation details[open]').count(),0);
  await page.locator('#atelier-navigation summary').filter({hasText:'Design studio'}).click();
  await page.locator('#atelier-navigation a[href="#habitat"]').click();await visible('studies');
  assert.equal(await page.locator('#habitat-section').isVisible(),true);
  assert.ok(await page.locator('#atelier-navigation').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
 }
 for(const hash of ['','nonsense','preview/missing']){
  await page.goto(base+(hash?'#'+hash:''));await visible('preview');
  assert.equal(new URL(page.url()).hash,'#preview/landing');
 }
 console.log('Atelier routes passed: direct links, refresh, screen selection, fallbacks and browser Back/Forward.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
