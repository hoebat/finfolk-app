import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const base=process.env.ATELIER_TEST_URL||'http://127.0.0.1:8770';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const browser=await chromium.launch();await mkdir('.cache/site-notes',{recursive:true});
try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:width===390?844:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // The contribution UI must also work when the vector basemap is unavailable.
 await page.route('https://tiles.openfreemap.org/**',r=>r.abort());
 await page.goto(base+'/board/map-explore.html?site=shelly&panel=notes');
 const notes=page.locator('.site-notes');await notes.getByRole('heading',{name:/Community notes/}).waitFor();
 assert.equal(await notes.locator('.site-note').count(),3);
 const first=notes.locator('[data-note=shelly-access]'),vote=first.getByRole('button',{name:'Upvote Maya’s note',exact:true});await vote.click();
 assert.equal(await first.locator('.note-upvote').getAttribute('aria-pressed'),'true');assert.match(await first.locator('.note-upvote').innerText(),/19/);
 await first.getByRole('button',{name:'Remove upvote from Maya’s note',exact:true}).click();assert.match(await first.locator('.note-upvote').innerText(),/18/);
 await notes.getByRole('combobox',{name:'Sort notes',exact:true}).selectOption('newest');assert.equal(await notes.locator('.site-note').first().getAttribute('data-note'),'shelly-conditions');
 await notes.locator('.notes-filter').selectOption('wildlife');assert.equal(await notes.locator('.site-note').count(),1);
 await notes.getByRole('button',{name:'+ Add note',exact:true}).click();await notes.locator('.notes-compose select').selectOption('conditions');assert.equal(await notes.locator('input[name=observedOn]').getAttribute('required'),'');
 await notes.locator('.notes-compose select').selectOption('facilities');
 await notes.getByRole('textbox',{name:'Your note',exact:true}).fill('A browser-only test note. <img src=x onerror=alert(1)> stays as literal text.');
 await notes.getByRole('button',{name:'Save preview note',exact:true}).click();
 assert.equal(await notes.locator('.site-note').count(),4);assert.match(await notes.locator('.site-note').first().innerText(),/browser-only test note/);assert.equal(await notes.locator('.note-text img').count(),0);
 await page.reload();await notes.getByRole('heading',{name:/Community notes/}).waitFor();assert.equal(await notes.locator('.site-note').count(),4);
 await notes.getByRole('combobox',{name:'Sort notes',exact:true}).selectOption('newest');await notes.locator('.site-note').first().locator('.note-upvote').click();
 await page.reload();assert.equal(await notes.locator('.note-upvote[aria-pressed=true]').count(),1);
 await notes.getByRole('button',{name:'Remove',exact:true}).click();assert.equal(await notes.locator('.site-note').count(),3);
 await notes.getByRole('button',{name:'Undo removal',exact:true}).click();assert.equal(await notes.locator('.site-note').count(),4);
 await page.locator('[data-result=gordons]').click();assert.equal(await notes.locator('.site-note').count(),2);assert.equal(await notes.locator('.note-upvote[aria-pressed=true]').count(),0);
 await page.locator('[data-result=shelly]').click();assert.equal(await notes.locator('.site-note').count(),4);
 await notes.getByRole('heading',{name:/Community notes/}).scrollIntoViewIfNeeded();await page.screenshot({path:'.cache/site-notes/notes-'+width+'.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('SITE_NOTES_BROWSER_PASS: upvote/undo, sorting, topics, composing, literal text, persistence, own removal/undo and site isolation at desktop and phone sizes.');
}finally{await browser.close();}
