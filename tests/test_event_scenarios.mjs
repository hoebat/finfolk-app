import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createMoodboardServer} from '../scripts/moodboard.mjs';
import {EVENT_PAGES,eventEligibility} from '../design-board/event-organisers.mjs';
import {WORKFLOWS} from '../design-board/workflows.mjs';
import {screenURL} from '../design-board/screens.mjs';
assert.equal(eventEligibility(EVENT_PAGES[0]).eligible,false);
assert.equal(eventEligibility(EVENT_PAGES[1]).eligible,true);
for(const override of [{published:false},{claimed:false},{role:'viewer'},{role:'pending'}])assert.equal(eventEligibility({...EVENT_PAGES[1],...override}).eligible,false);
const events=WORKFLOWS.find(w=>w.id==='events');assert.ok(screenURL(events.steps.find(s=>s.id==='eligibility').screen).includes('scenario=no-eligible'));assert.ok(screenURL(events.steps.find(s=>s.id==='invalid').screen).includes('scenario=validation'));
const server=createMoodboardServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/#workflows/events/eligibility');await page.frameLocator('.workflow-frame').getByRole('heading',{name:'Choose an eligible page'}).waitFor();
  await page.goto(base+'/#workflows/events/invalid');await page.frameLocator('.workflow-frame').locator('[name=title][aria-invalid=true]').waitFor();
  await page.goto(base+'/board/events.html?scenario=no-eligible');await page.getByRole('heading',{name:'Choose an eligible page'}).waitFor();assert.equal(await page.locator('.event-form').count(),0);
  await page.getByText('Preview scenarios',{exact:true}).click();await page.getByRole('button',{name:'Use eligible organiser',exact:true}).click();await page.locator('.event-form').waitFor();
  const options=await page.getByLabel('Organising page',{exact:true}).locator('option').allTextContents();assert.deepEqual(options,['Saltwater Sundays','Maya Laurent']);
  await page.goto(base+'/board/events.html?organiser=tideline');await page.getByRole('heading',{name:'Choose an eligible page'}).waitFor();assert.equal(await page.locator('.event-form').count(),0);
  await page.goto(base+'/board/pages.html?screen=mine');await page.locator('.pages-grid > .pages-panel').first().waitFor();const actions=page.getByRole('link',{name:'Create event',exact:true});assert.equal(await actions.count(),2);await actions.last().click();await page.locator('.event-form').waitFor();assert.equal(await page.getByLabel('Organising page',{exact:true}).inputValue(),'maya');
  await page.goto(base+'/board/events.html?scenario=validation');await page.locator('[name=title][aria-invalid=true]').waitFor();
  for(const name of ['title','location','ends','capacity'])assert.equal(await page.locator(`[name="${name}"]`).getAttribute('aria-invalid'),'true');
  assert.equal(await page.getByLabel('Ends (your local timezone)',{exact:true}).isVisible(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await page.getByLabel('Session',{exact:true}).fill('Morning reef session');await page.getByLabel('Meeting area',{exact:true}).fill('Portsea Beach');
  const day=await page.getByLabel('Day',{exact:true}).inputValue();await page.getByLabel('Ends (your local timezone)',{exact:true}).fill(day+'T11:00');await page.getByLabel('Capacity (blank for unlimited)',{exact:true}).fill('4');
  await page.getByLabel('Meet at',{exact:true}).fill('');await page.getByRole('button',{name:'Choose your people',exact:true}).click();
  assert.equal(await page.getByLabel('Meet at',{exact:true}).getAttribute('aria-invalid'),'true');
  await page.getByLabel('Meet at',{exact:true}).fill('09:00');await page.getByRole('button',{name:'Choose your people',exact:true}).click();await page.getByRole('heading',{name:'Choose your people.',exact:true}).waitFor();
  await page.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await page.getByLabel('Session',{exact:true}).inputValue(),'Morning reef session');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('heading',{name:'Saved for later.'}).waitFor();
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Event scenarios passed: shared eligibility, organiser handoff, visible invalid fields, missing time, correction, back and draft save.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
