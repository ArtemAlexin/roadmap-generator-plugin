import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID,createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import { renderSite, renderPrint } from './render.js';
import { launchBrowser } from './browser.js';
import { contentHash, validateRoadmap, evaluateReview } from './validate.js';
import { nextQuestion, deliveryFor } from './questions.js';
import { writeJson } from './files.js';
import { defaultDataDirectory } from './data-directory.js';
import { exportBasename } from './export-name.js';
import { digestFile, inventory, preflightLocations, publishFiles } from './export-files.js';

export async function auditSite(directory,roadmap,{ screenshotsDirectory }={}) {
  const problems=[], network=[], pageErrors=[];
  const browser=await launchBrowser();
  try {
    const page=await browser.newPage();
    page.on('pageerror',e=>pageErrors.push(e.message));
    page.on('requestfailed',request=>network.push(request.url()));
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
      if(file.startsWith('stages/') && await page.locator('.stage-block').count()!==7) problems.push(`${file}: не семь блоков.`);
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
    problems.push(...pageErrors.map(e=>`JS: ${e}`),...[...new Set(network)].map(n=>`Нежелательный сетевой запрос: ${n}`));
    return { passed:!problems.length, problems:[...new Set(problems)], localLinksChecked:linksChecked,
      pagesChecked:files.length, screenshotsCreated:!!screenshotsDirectory,
      limitation:'Снимки сохранены для визуального просмотра агентом. Автоматическая проверка не подтверждает отсутствие всех визуальных дефектов и полное соответствие WCAG.' };
  }finally{await browser.close();}
}

function safeZipEntries(zip, siteInventory) {
  const entries=zip.getEntries(), names=new Set();
  for(const entry of entries){
    const raw=entry.entryName.replace(/\\/g,'/'), name=raw.endsWith('/')?raw.slice(0,-1):raw;
    if(!name || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').some(p=>p==='..'||p==='') || names.has(name))throw new Error(`Небезопасная или повторная ZIP-запись: ${entry.entryName}`);
    if(((entry.header.attr >>> 16)&0o170000)===0o120000)throw new Error(`Symlink в ZIP: ${name}`);
    names.add(name);
  }
  const files=entries.filter(e=>!e.isDirectory).map(e=>e.entryName.replace(/\\/g,'/')).sort();
  if(JSON.stringify(files)!==JSON.stringify(siteInventory.map(f=>f.path).sort()))throw new Error('ZIP file inventory не совпадает с сайтом.');
  for(const entry of entries.filter(e=>!e.isDirectory)){
    const expected=siteInventory.find(f=>f.path===entry.entryName.replace(/\\/g,'/'));
    const data=entry.getData();
    if(data.length!==expected.size||createHash('sha256').update(data).digest('hex')!==expected.sha256)throw new Error(`Содержимое ZIP entry не совпадает: ${entry.entryName}`);
  }
}

async function auditPrint(file, roadmap) {
  const browser=await launchBrowser(), errors=[], requests=[];
  try{
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
    page.on('requestfailed',r=>requests.push(r.url()));
    await page.route(/^https?:\/\//,route=>{requests.push(route.request().url());return route.abort();});
    await page.goto(pathToFileURL(file).href);
    const result=await page.evaluate(()=>({parts:document.querySelectorAll('.print-part').length,stages:[...document.querySelectorAll('.print-part .stage-hero')].map(x=>x.id),blocks:[...document.querySelectorAll('.print-part .stage-block')].length,about:!!document.querySelector('.print-part h1'),report:document.body.innerText.includes('Детали отчёта')}));
    if(result.parts<roadmap.stages.length+3||result.stages.length!==roadmap.stages.length||result.blocks!==roadmap.stages.length*7||!result.about||!result.report||errors.length||requests.length)throw new Error(`PDF DOM/network check failed: ${JSON.stringify({result,errors,requests})}`);
    return {passed:true,stages:result.stages.length,stageBlocks:result.blocks,networkRequests:requests.length};
  }finally{await browser.close();}
}

async function rollbackPublished(published) {
  if(!published)return [];
  const leftovers=[];
  for(const file of [...published.ownedFiles].reverse())try{await fs.rm(file);}catch(error){if(error.code!=='ENOENT')leftovers.push(file);}
  for(const dir of [...published.ownedDirs].reverse())try{await fs.rmdir(dir);}catch(error){if(error.code!=='ENOENT')leftovers.push(dir);}
  return leftovers;
}

export async function buildRoadmap(inputState,{ visualAudit=true,diagnosticsRoot=path.join(defaultDataDirectory(),'builds'),createZip=()=>new AdmZip(),publish=publishFiles }={}) {
  const state=structuredClone(inputState), answers=state.answers, roadmap=state.roadmap;
  const question=nextQuestion(answers);
  if(question)throw new Error('Не завершён опрос: '+question.title);
  const validation=validateRoadmap(roadmap);
  if(!validation.valid)throw new Error('Нельзя собрать программу с ошибками структуры: '+validation.errors.join('; '));
  const hash=contentHash(roadmap,answers),review=state.review?.contentHash===hash?state.review:null;
  const evaluation=review?evaluateReview(review,roadmap,answers):null,preliminary=!evaluation?.passed;
  const wantHtml=['html','both'].includes(answers.format),wantPdf=['pdf','both'].includes(answers.format);
  const buildId=randomUUID(), diagnosticsDirectory=path.join(diagnosticsRoot,buildId), dest=path.resolve(answers.outputDirectory), tempRoot=os.tmpdir();
  await preflightLocations(dest,diagnosticsRoot,tempRoot);
  const temp=await fs.mkdtemp(path.join(tempRoot,'roadmap-build-'));
  let published=null, failureError=null;
  try{
    await fs.mkdir(diagnosticsDirectory,{recursive:true});
    const locations=await preflightLocations(dest,diagnosticsRoot,tempRoot);
    const confirmed=await fs.realpath(diagnosticsDirectory);
    if(locations.destination.canonical===confirmed||confirmed.startsWith(`${locations.destination.canonical}${path.sep}`)||locations.destination.canonical.startsWith(`${confirmed}${path.sep}`))throw new Error('Расположение diagnostics изменилось и пересекается с destination.');
    const payload=path.join(temp,'payload');await fs.mkdir(payload);
    const artifactChecks={html:{status:'not-requested'},archive:{status:'not-requested'},pdf:{status:'not-requested'},inventory:null};
    let audit=null,zipPath=null,siteFiles=[];
    if(wantHtml){
      await renderSite(payload,roadmap,answers,review,evaluation);
      audit=await auditSite(payload,roadmap,{screenshotsDirectory:visualAudit?path.join(diagnosticsDirectory,'qa'):undefined});
      if(!audit.passed)throw new Error('Техническая проверка HTML: '+audit.problems.join('; '));
      artifactChecks.html={passed:true,pagesChecked:audit.pagesChecked,linksChecked:audit.localLinksChecked};
      siteFiles=await inventory(payload);
       const zip=createZip();zip.addLocalFolder(payload);
      zipPath=path.join(temp,'website.zip');zip.writeZip(zipPath);
      const archive=new AdmZip(zipPath);safeZipEntries(archive,siteFiles);
      const extracted=path.join(temp,'extracted');archive.extractAllTo(extracted,true);
      const extractedAudit=await auditSite(extracted,roadmap);
      if(!extractedAudit.passed)throw new Error('Техническая проверка распакованного ZIP: '+extractedAudit.problems.join('; '));
      artifactChecks.archive={passed:true,entries:siteFiles.length,extractedAudit:true};
    }
    if(wantPdf){
      const printFile=path.join(temp,'print.html');await fs.writeFile(printFile,await renderPrint(roadmap,answers,review,evaluation),'utf8');
      const domCheck=await auditPrint(printFile,roadmap),browser=await launchBrowser();
      try{const page=await browser.newPage();await page.route(/^https?:\/\//,route=>route.abort());await page.goto(pathToFileURL(printFile).href);await page.pdf({path:path.join(payload,'roadmap.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:8px;width:100%;text-align:center;color:#536176"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'});}finally{await browser.close();}
      const pdf=await fs.readFile(path.join(payload,'roadmap.pdf'));
      if(pdf.length<10||pdf.subarray(0,5).toString()!=='%PDF-'||!pdf.toString('latin1').trimEnd().endsWith('%%EOF'))throw new Error('PDF file marker check failed.');
      artifactChecks.pdf={passed:true,dom:domCheck,signature:true,eof:true,size:pdf.length};
    }
    const payloadInventory=await inventory(payload),archiveDigest=wantHtml?await digestFile(zipPath):null;
    artifactChecks.inventory={passed:true,files:payloadInventory.length};
    await writeJson(path.join(diagnosticsDirectory,'roadmap.json'),roadmap);
    const date=new Date(),baseInfo={title:roadmap.title,goal:answers.goal,date};
    let candidate;
    await preflightLocations(dest,diagnosticsDirectory,tempRoot);
    for(let attempt=0;attempt<10;attempt++){
      candidate=exportBasename({...baseInfo,suffix:randomUUID().replaceAll('-','').slice(0,8)});
      try{published=await publish(payload,zipPath,dest,candidate,wantHtml,{payload:payloadInventory,archive:archiveDigest});break;}
      catch(error){if(error.retryableCollision&&attempt<9)continue;throw error;}
    }
    const output=published.directory;
    const artifacts={...(wantHtml?{siteDirectory:output,htmlArchive:published.zipPath,siteEntryPoint:path.join(output,'index.html')}:{}),...(wantPdf?{pdf:path.join(output,'roadmap.pdf')}:{})};
    const manifest={contentHash:hash,schemaVersion:'1.0',format:answers.format,delivery:deliveryFor(answers.format),artifacts,
      diagnostics:{directory:diagnosticsDirectory,roadmap:path.join(diagnosticsDirectory,'roadmap.json'),manifest:path.join(diagnosticsDirectory,'manifest.json'),...(visualAudit&&wantHtml?{screenshotsDirectory:path.join(diagnosticsDirectory,'qa')}:{})},preliminary,
      evaluation:evaluation?{total:evaluation.total,passed:evaluation.passed,blockers:evaluation.blockers}:null,validation,audit,pdfCreated:wantPdf,
      artifactChecks,visualReview:'pending-agent-review',createdAt:date.toISOString()};
    await writeJson(path.join(diagnosticsDirectory,'manifest.json'),manifest);
    return {outputDirectory:output,...manifest,nextAction:visualAudit&&wantHtml?'Просмотрите снимки из diagnostics.screenshotsDirectory и страницы PDF, исправьте найденные дефекты. Визуальная проверка остаётся незавершённой до фактического просмотра.':'Проведите визуальную проверку результата перед выдачей.'};
  }catch(error){
    failureError=error;
    const leftovers=await rollbackPublished(published);
    if(leftovers.length)error.message+=`; не удалось удалить опубликованные файлы: ${leftovers.join(', ')}`;
    error.message+=` (этап: build/publication; diagnostics: ${diagnosticsDirectory})`;
    await writeJson(path.join(diagnosticsDirectory,'failure.json'),{phase:'build-or-publication',message:error.message,buildId})
      .catch(diagnosticError=>{error.message+=`; не удалось записать failure diagnostics: ${diagnosticError.message}`;});
    throw error;
  }finally{
    try{await fs.rm(temp,{recursive:true,force:true});}
    catch(cleanupError){
      if(failureError){failureError.message+=`; не удалось очистить staging ${temp}: ${cleanupError.message}`;}
      else{
        const leftovers=await rollbackPublished(published);
        cleanupError.message+=`; не удалось очистить staging ${temp}; diagnostics: ${diagnosticsDirectory}`;
        if(leftovers.length)cleanupError.message+=`; не удалось удалить опубликованные файлы: ${leftovers.join(', ')}`;
        await writeJson(path.join(diagnosticsDirectory,'failure.json'),{phase:'staging-cleanup',message:cleanupError.message,buildId})
          .catch(diagnosticError=>{cleanupError.message+=`; не удалось записать failure diagnostics: ${diagnosticError.message}`;});
        throw cleanupError;
      }
    }
  }
}
