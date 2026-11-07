// The social previews have been replaced by locally served website selections.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {SCHOOLS,SCHOOL_KEY,schoolState} from '../design-board/school-demos.mjs';
import {SCHOOL_WEBSITE} from '../design-board/school-website.mjs';
import {SCHOOL_SERVICES} from '../design-board/school-services.mjs';
import {createMoodboardServer} from '../scripts/moodboard.mjs';
assert.deepEqual(SCHOOL_SERVICES['oceansense'].pathways.map(p=>p.agency),['SSI','Molchanovs','PADI']);
assert.deepEqual(SCHOOL_SERVICES['freedive-tasmania'].pathways.map(p=>p.agency),['PADI','Molchanovs']);
assert.ok(!SCHOOL_SERVICES['oceansense'].pathways.find(p=>p.agency==='PADI').programs.some(p=>p.label.includes('Instructor')));
assert.equal(SCHOOL_SERVICES['freediving-australia'].pathways[0].programs.length,1);
const provenance=JSON.parse(await readFile(new URL('../design-board/assets/schools/sources.json',import.meta.url)));
for(const school of SCHOOLS){assert.equal(SCHOOL_WEBSITE[school.id]?.length,2);for(const item of SCHOOL_WEBSITE[school.id]){assert.match(item.source,/^https:/);assert.ok(item.alt);const record=provenance.find(p=>p.local===item.image);assert.equal(record.school,school.id);assert.ok(record.width>=800);await stat(new URL('../design-board/'+item.image.slice('/board/'.length),import.meta.url));}}
const server=createMoodboardServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
try{
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  // All school images and content must remain visible with third parties blocked.
  await context.route('**/*',r=>{if(!r.request().url().startsWith(base)){external.push(r.request().url());return r.abort();}return r.continue();});
  await page.goto(base+'/board/pages.html?collection=schools&screen=public&id=freediving-australia');
  const saved=schoolState();saved.pages[0].bio='My saved school edit';saved.pages[0].posts.push({id:'local',title:'My collected story',caption:'Local content survives',published:true});
  await page.evaluate(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:SCHOOL_KEY,state:saved});
  await page.reload();await page.getByText('My saved school edit',{exact:true}).waitFor();await page.getByText('My collected story',{exact:true}).waitFor();
  await page.goto(base+'/board/pages.html?collection=schools&screen=school-gallery');await page.locator('.school-card').first().waitFor();assert.equal(await page.locator('.school-card .school-photo img').count(),6);await page.locator('.school-card img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
  for(const school of SCHOOLS){
   await page.goto(base+'/board/pages.html?collection=schools&screen=public&id='+school.id);
   await page.getByRole('heading',{name:'Meet the school.',exact:true}).waitFor();
   const offerings=SCHOOL_SERVICES[school.id];
   await page.getByRole('link',{name:'Services & accreditations ↓',exact:true}).click();
   await page.getByRole('heading',{name:'Services & accreditations.',exact:true}).waitFor({state:'visible'});
   assert.ok(page.url().endsWith('#school-services'));
   assert.equal(await page.locator('.school-service-list>li').count(),offerings.services.length);
   assert.deepEqual(await page.locator('.school-pathway>.school-agency').allTextContents(),offerings.pathways.map(p=>p.agency+' ↗'));
   assert.equal(await page.locator('.school-centre-status').count(),offerings.centre?1:0);
   assert.deepEqual(await page.locator('.school-service-list a').evaluateAll(links=>links.map(a=>a.href)),offerings.services.map(s=>s.source));
   assert.equal(await page.locator('.school-story-card').count(),2);assert.equal(await page.locator('iframe').count(),0);
   const hero=page.locator('.school-hero img');await hero.scrollIntoViewIfNeeded();await hero.evaluate(img=>img.decode());assert.ok(await hero.evaluate(i=>i.naturalWidth>=800));
   for(const [index,item] of SCHOOL_WEBSITE[school.id].entries()){
    const card=page.locator('.school-story-card').nth(index);await card.scrollIntoViewIfNeeded();await card.locator('img').evaluate(img=>img.decode());assert.ok(await card.locator('img').evaluate(i=>i.complete&&i.naturalWidth>0));
    assert.equal(await card.getByRole('link').getAttribute('href'),item.source);assert.equal(await card.locator('img').getAttribute('alt'),item.alt);assert.ok(await card.getByText(item.summary,{exact:true}).isVisible());
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  }
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('School website media passed: 12 local images, six pages, sourced services, agency pathways, section links, offline providers, saved edits and responsive layouts.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
