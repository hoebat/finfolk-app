import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createMoodboardServer} from '../scripts/moodboard.mjs';
const server=createMoodboardServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/board/breath-analyser.html`;
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByRole('button',{name:'Connect demo device'}).click();
 await page.getByRole('button',{name:'Start demo blow'}).click();await page.getByRole('button',{name:'Stop check',exact:true}).click();assert.equal(await page.locator('#scenario').inputValue(),'ready');
 await page.getByRole('button',{name:'Start demo blow'}).click();await page.getByRole('button',{name:'Finish demo blow'}).click();
 assert.equal(await page.locator('#scenario').inputValue(),'analysing');await page.getByRole('button',{name:'Skip demo wait'}).click();
 await page.getByLabel('Anything to remember?').fill('Morning check <test>');await page.getByRole('button',{name:'Save demo reading'}).click();
 await page.getByRole('button',{name:'View demo history'}).click();assert.match(await page.locator('.history-row').innerText(),/Morning check <test>/);
 await page.reload();assert.equal(await page.locator('.history-row').count(),1);
 await page.getByRole('button',{name:'Delete demo',exact:true}).click();assert.equal(await page.locator('.history-row').count(),0);
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});for(const screen of ['connect','ready','blow','analysing','result','issue','disconnected','history']){await page.selectOption('#scenario',screen);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${screen} overflows at ${width}`);}}
 await page.selectOption('#scenario','result');await page.screenshot({path:'/tmp/finfolk-breath-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/finfolk-breath-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('Breath UI passed: flow, cancellation, saved demos, reload, deletion, eight responsive states, no browser errors.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
