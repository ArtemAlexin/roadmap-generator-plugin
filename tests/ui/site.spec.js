import { test,expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture } from '../fixture.js';
import { renderSite } from '../../src/render.js';

let directory;
test.beforeAll(async()=>{
  directory=await fs.mkdtemp(path.join(os.tmpdir(),'roadmap-ui-test-'));
  const {roadmap,inputs}=fixture();await renderSite(directory,roadmap,inputs,null,null);
});
test.afterAll(async()=>{await fs.rm(directory,{recursive:true,force:true});});
const url=file=>pathToFileURL(path.join(directory,file)).href;

test('file:// navigation, complete stages and external-network-free operation',async({page})=>{
  const errors=[],network=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
  await page.goto(url('index.html'));await expect(page.locator('.node')).toHaveCount(4);await expect(page.locator('.edge')).toHaveCount(4);
  await page.locator('.node[data-stage="M02"]').click();await expect(page).toHaveURL(/stages\/M02.html/);
  await expect(page.locator('.stage-block')).toHaveCount(7);await expect(page.getByRole('heading',{name:'Ожидаемый результат',exact:true})).toBeVisible();
  await expect(page.locator('.material .external')).toHaveAttribute('href',/^https:/);
  await page.getByRole('link',{name:'Следующий этап →'}).click();await expect(page).toHaveURL(/M03.html/);
  await page.getByRole('link',{name:'Карта',exact:true}).first().click();await expect(page).toHaveURL(/index.html/);
  expect(errors).toEqual([]);expect(network).toEqual([]);
});
test('search keyboard shortcut, criteria indexing, arrow navigation and escape',async({page})=>{
  await page.goto(url('index.html'));await page.keyboard.press('Control+k');await expect(page.locator('#search-dialog')).toBeVisible();
  await page.locator('#search-input').fill('M03-D1');await expect(page.locator('#search-results a')).not.toHaveCount(0);
  await page.keyboard.press('ArrowDown');await expect(page.locator('#search-results a').first()).toBeFocused();await page.keyboard.press('Enter');await expect(page).toHaveURL(/M03.html/);
  await page.keyboard.press('/');await expect(page.locator('#search-dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#search-dialog')).not.toBeVisible();
});
test('theme persistence, progress export/import and invalid import recovery',async({page})=>{
  await page.goto(url('stages/M01.html'));await page.locator('[data-progress="M01"]').check();await page.locator('[data-progress="M01-D1"]').check();
  await page.reload();await expect(page.locator('[data-progress="M01"]')).toBeChecked();
  const theme=await page.locator('html').getAttribute('data-theme');await page.locator('#theme-toggle').click();await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme',theme==='light'?'dark':'light');
  const download=page.waitForEvent('download');await page.locator('#progress-export').click();const file=await download;expect(file.suggestedFilename()).toBe('roadmap-progress.json');
  await page.locator('#progress-import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"roadmapId":"wrong","marks":{}}')});await expect(page.locator('#progress-message')).toContainText('другой программе');
  await page.locator('#progress-import').setInputFiles({name:'marks.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({roadmapId:'R-DEMO',marks:{M02:true,'M02-D1':true,UNKNOWN:true}}))});await expect(page.locator('#progress-message')).toContainText('импортирован');
  await page.goto(url('stages/M02.html'));await expect(page.locator('[data-progress="M02"]')).toBeChecked();
});
test('unavailable localStorage keeps navigation, theme and search usable',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}}));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url('index.html'));await page.locator('#theme-toggle').click();await page.locator('#search-open').click();await expect(page.locator('#search-dialog')).toBeVisible();expect(errors).toEqual([]);
});
test('map filters preserve topology, prerequisite highlighting and zoom controls',async({page})=>{
  await page.goto(url('index.html'));await page.locator('#map-query').fill('формы');await expect(page.locator('.node:not(.dimmed)')).toHaveCount(1);await expect(page.locator('.node')).toHaveCount(4);
  await page.locator('#map-query').fill('');await page.locator('.node[data-stage="M02"]').focus();await expect(page.locator('.node[data-stage="M03"]')).toHaveClass(/dimmed/);
  const before=await page.locator('#roadmap-graph').evaluate(e=>e.getBoundingClientRect().width);await page.locator('#zoom-in').click();const after=await page.locator('#roadmap-graph').evaluate(e=>e.getBoundingClientRect().width);expect(after).toBeGreaterThan(before);
  await page.locator('#zoom-fit').click();await expect(page.locator('#map-scale')).toContainText('Масштаб');await page.locator('#zoom-reset').click();await expect(page.locator('#map-scale')).toContainText('100%');
});
for(const theme of ['light','dark'])for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:360,height:800}]){
  test(`responsive layout and WCAG scan ${theme} ${viewport.width}`,async({page})=>{
    await page.setViewportSize(viewport);
    for(const file of ['index.html','stages/M01.html','report.html']){
      await page.goto(url(file));await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
      expect(results.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
      await page.screenshot({path:test.info().outputPath(`${file.replaceAll('/','-')}-${theme}-${viewport.width}.png`),fullPage:false});
    }
    if(viewport.width<700){await page.locator('#menu-toggle').click();await expect(page.locator('#sidebar')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#sidebar')).not.toBeVisible();}
  });
}
test('printing exposes full content and hides navigation',async({page})=>{
  await page.goto(url('stages/M01.html'));await page.emulateMedia({media:'print'});
  await expect(page.locator('.topbar')).not.toBeVisible();await expect(page.locator('.sidebar')).not.toBeVisible();await expect(page.locator('.stage-block')).toHaveCount(7);await expect(page.locator('#M01-D1')).toBeVisible();
});
