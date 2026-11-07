import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import { renderSite, renderPrint } from './render.js';
import { launchBrowser } from './browser.js';
import { contentHash, validateRoadmap, evaluateReview } from './validate.js';
import { nextQuestion, deliveryFor } from './questions.js';
import { writeJson } from './files.js';
import { defaultDataDirectory } from './data-directory.js';

export async function auditSite(directory,roadmap,{ screenshotsDirectory }={}) {
  const problems=[], network=[], pageErrors=[];
  const browser=await launchBrowser();
  try {
    const page=await browser.newPage();
    page.on('pageerror',e=>pageErrors.push(e.message));
    await page.route(/^https?:\/\//,route=>{ network.push(route.request().url()); return route.abort(); });
    const files=['index.html','about.html','report.html',...roadmap.stages.map(s=>`stages/${s.id}.html`)];
    let linksChecked=0;
    for(const file of files){
      await page.goto(pathToFileURL(path.join(directory,file)).href);
      const links=await page.locator('a[href]').evaluateAll(as=>as.map(a=>new URL(a.getAttribute('href'),document.baseURI).href).filter(h=>h.startsWith('file:')));
      for(const href of new Set(links)){
        const url=new URL(href), target=fileURLToPath(url);
        try { await fs.access(target); linksChecked++; }
        catch { problems.push(`${file}: отсутствует ${target}`); continue; }
        if(url.hash){
          const contents=await fs.readFile(target,'utf8');
          const anchor=decodeURIComponent(url.hash.slice(1));
          if(!contents.includes(`id="${anchor}"`)) problems.push(`${file}: нет якоря ${anchor}`);
        }
      }
      if(file.startsWith('stages/')){
        if(await page.locator('.stage-block').count()!==7) problems.push(`${file}: не семь блоков.`);
      }
    }
    await page.goto(pathToFileURL(path.join(directory,'index.html')).href);
    const nodes=await page.locator('.node').evaluateAll(ns=>ns.map(n=>n.dataset.stage));
    if(nodes.length!==roadmap.stages.length || new Set(nodes).size!==nodes.length || roadmap.stages.some(s=>!nodes.includes(s.id))) problems.push('Неверный набор узлов.');
    const edges=await page.locator('.edge').evaluateAll(es=>es.map(e=>`${e.dataset.from}->${e.dataset.to}`).sort());
    const expected=roadmap.stages.flatMap(s=>s.dependencies.map(d=>`${d}->${s.id}`)).sort();
    if(JSON.stringify(edges)!==JSON.stringify(expected)) problems.push('Неверный набор рёбер.');
    if(screenshotsDirectory)await fs.mkdir(screenshotsDirectory,{recursive:true});
    for(const theme of ['light','dark'])for(const [size,width,height]of [['desktop',1440,1000],['mobile',390,844]])for(const [name,file]of [['map','index.html'],['stage',`stages/${roadmap.stages[0].id}.html`]]){
      await page.setViewportSize({width,height});await page.goto(pathToFileURL(path.join(directory,file)).href);
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))problems.push(`${file}: горизонтальная прокрутка ${size}/${theme}.`);
      if(screenshotsDirectory)await page.screenshot({path:path.join(screenshotsDirectory,`${name}-${size}-${theme}.png`),fullPage:false});
    }
    problems.push(...pageErrors.map(e=>`JS: ${e}`),...network.map(n=>`Нежелательный сетевой запрос: ${n}`));
    return { passed:!problems.length, problems:[...new Set(problems)], localLinksChecked:linksChecked,
      pagesChecked:files.length, screenshotsCreated:!!screenshotsDirectory,
      limitation:'Снимки сохранены для визуального просмотра агентом. Автоматическая проверка не подтверждает отсутствие всех визуальных дефектов и полное соответствие WCAG.' };
  }finally{await browser.close();}
}
export async function buildRoadmap(state,{ visualAudit=true,diagnosticsRoot=path.join(defaultDataDirectory(),'builds') }={}) {
  if(nextQuestion(state.answers))throw new Error('Не завершён опрос: '+nextQuestion(state.answers).title);
  const validation=validateRoadmap(state.roadmap);
  if(!validation.valid)throw new Error('Нельзя собрать программу с ошибками структуры: '+validation.errors.join('; '));
  const hash=contentHash(state.roadmap,state.answers);
  const review=state.review?.contentHash===hash?state.review:null;
  const evaluation=review?evaluateReview(review,state.roadmap,state.answers):null;
  const preliminary=!evaluation?.passed;
  const output=path.join(state.answers.outputDirectory,`roadmap-${state.id.slice(0,8)}-${randomUUID().slice(0,8)}`);
  const diagnosticsDirectory=path.join(diagnosticsRoot,path.basename(output));
  await fs.mkdir(output,{recursive:true});
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'roadmap-build-'));
  try{
    const site=path.join(temp,'site');
    const wantHtml=['html','both'].includes(state.answers.format),wantPdf=['pdf','both'].includes(state.answers.format);
    let audit=null;
    if(wantHtml){
      await renderSite(site,state.roadmap,state.answers,review,evaluation);
      audit=await auditSite(site,state.roadmap,{screenshotsDirectory:visualAudit?path.join(diagnosticsDirectory,'qa'):undefined});
      if(!audit.passed)throw new Error('Техническая проверка HTML: '+audit.problems.join('; '));
      await fs.cp(site,output,{recursive:true});
      const zip=new AdmZip();zip.addLocalFolder(site);zip.writeZip(`${output}-html.zip`);
    }
    if(wantPdf){
      const printFile=path.join(temp,'print.html');
      await fs.writeFile(printFile,await renderPrint(state.roadmap,state.answers,review,evaluation));
      const browser=await launchBrowser();
      try{
        const page=await browser.newPage();
        await page.route(/^https?:\/\//,route=>route.abort());
        await page.goto(pathToFileURL(printFile).href);
        await page.pdf({path:path.join(output,'roadmap.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,
          headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:8px;width:100%;text-align:center;color:#536176"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'});
      }finally{await browser.close();}
    }
    await writeJson(path.join(diagnosticsDirectory,'roadmap.json'),state.roadmap);
    const manifest={ contentHash:hash,schemaVersion:'1.0',format:state.answers.format,delivery:deliveryFor(state.answers.format),
      artifacts:{...(wantHtml?{siteDirectory:output,htmlArchive:`${output}-html.zip`,siteEntryPoint:path.join(output,'index.html')}:{}),...(wantPdf?{pdf:path.join(output,'roadmap.pdf')}:{})},
      diagnostics:{directory:diagnosticsDirectory,roadmap:path.join(diagnosticsDirectory,'roadmap.json'),manifest:path.join(diagnosticsDirectory,'manifest.json'),...(visualAudit&&wantHtml?{screenshotsDirectory:path.join(diagnosticsDirectory,'qa')}:{})},preliminary,
      evaluation:evaluation?{total:evaluation.total,passed:evaluation.passed,blockers:evaluation.blockers}:null,
      validation,audit,pdfCreated:wantPdf,visualReview:'pending-agent-review',createdAt:new Date().toISOString() };
    await writeJson(path.join(diagnosticsDirectory,'manifest.json'),manifest);
    return {outputDirectory:output,...manifest,
      nextAction:visualAudit&&wantHtml?'Просмотрите снимки из diagnostics.screenshotsDirectory, исправьте обнаруженные дефекты. Для PDF выполните визуальную проверку страниц средствами агента. Не объявляйте непроведённые проверки успешными.':'Проведите визуальную проверку результата перед выдачей.'};
  }finally{await fs.rm(temp,{recursive:true,force:true});}
}
