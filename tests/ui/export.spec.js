import { test,expect } from '@playwright/test';
import { mock } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import AdmZip from 'adm-zip';
import { fixture } from '../fixture.js';
import { buildRoadmap,auditSite } from '../../src/build.js';
import { publishFiles } from '../../src/export-files.js';
import { contentHash } from '../../src/validate.js';

test('export both formats, ZIP extraction, snapshot parity and preliminary marking',async()=>{
  const directory=path.join(os.homedir(),`.roadmap-export-test-${randomUUID()}`);
  const internal=path.join(os.homedir(),`.roadmap-export-internal-${randomUUID()}`);
  try{
    const {roadmap,inputs}=fixture(directory);
    const options={visualAudit:false,diagnosticsRoot:internal};
    const state={id:'export-test',answers:inputs,roadmap,review:null};
    const result=await buildRoadmap(state,options);
    expect(result.preliminary).toBe(true);expect(result.audit.passed).toBe(true);expect(result.contentHash).toBe(contentHash(roadmap,inputs));
    expect(result.delivery.website.singleHtmlFile).toBe(false);
    expect(result.artifacts.htmlArchive).toBe(`${result.outputDirectory}-html.zip`);
    expect(result.artifacts.siteEntryPoint).toBe(path.join(result.outputDirectory,'index.html'));
    const pdf=await fs.readFile(path.join(result.outputDirectory,'roadmap.pdf'));expect(pdf.subarray(0,5).toString()).toBe('%PDF-');expect(pdf.length).toBeGreaterThan(10000);
    const snapshot=JSON.parse(await fs.readFile(result.diagnostics.roadmap,'utf8'));expect(snapshot).toEqual(roadmap);
    const zip=new AdmZip(result.artifacts.htmlArchive);
    expect(zip.getEntries().some(e=>e.entryName==='index.html')).toBe(true);
    for(const entry of ['assets/app.js','assets/data.js','assets/theme.js','assets/app.css','about.html','report.html',...roadmap.stages.map(s=>`stages/${s.id}.html`)])expect(zip.getEntry(entry)).not.toBeNull();
    const extracted=path.join(directory,'extracted');zip.extractAllTo(extracted);
    expect((await auditSite(extracted,roadmap)).passed).toBe(true);
    inputs.format='pdf';const pdfOnly=await buildRoadmap(state,options);
    expect((await fs.readdir(pdfOnly.outputDirectory)).includes('site')).toBe(false);
    inputs.format='html';const htmlOnly=await buildRoadmap(state,{...options,visualAudit:true});
    expect((await fs.readdir(htmlOnly.outputDirectory)).sort()).toEqual(['about.html','assets','index.html','report.html','stages']);
    expect((await fs.readdir(pdfOnly.outputDirectory))).toEqual(['roadmap.pdf']);
    expect((await fs.readdir(result.outputDirectory)).sort()).toEqual(['about.html','assets','index.html','report.html','roadmap.pdf','stages']);
    expect((await fs.readdir(htmlOnly.diagnostics.screenshotsDirectory)).length).toBe(8);
    expect(JSON.parse(await fs.readFile(htmlOnly.diagnostics.manifest,'utf8')).artifacts).toEqual(htmlOnly.artifacts);
    expect(path.relative(htmlOnly.outputDirectory,htmlOnly.diagnostics.directory).startsWith('..')).toBe(true);
    expect((await fs.readdir(htmlOnly.outputDirectory)).includes('roadmap.pdf')).toBe(false);
    expect(new Set([result.outputDirectory,pdfOnly.outputDirectory,htmlOnly.outputDirectory]).size).toBe(3);
    inputs.format='both';inputs.scheduleMode='weekly';inputs.hoursPerWeek=456;inputs.deadline='LEGACY-EXPORT-DEADLINE';
    roadmap.about.schedule='Исторический текст: 3 недели; порядок определяется зависимостями этапов и DoD.';
    const free=await buildRoadmap(state,options);expect(free.pdfCreated).toBe(true);expect(free.audit.passed).toBe(true);
    const about=await fs.readFile(path.join(free.outputDirectory,'about.html'),'utf8');
    expect(about).toContain('Обязательный маршрут с резервом');expect(about).toContain('Авторский текст не подтверждён текущей проверкой');
    expect(about).not.toContain('Расчётный минимум');expect(about).not.toContain('В неделю');expect(about).not.toContain('Infinity');expect(about).not.toContain('NaN');
    const manifest=JSON.parse(await fs.readFile(free.diagnostics.manifest,'utf8'));
    expect(manifest.planning.mode).toBe('effort-only');expect(JSON.parse(await fs.readFile(free.diagnostics.roadmap,'utf8'))).toEqual(roadmap);
    const report=await fs.readFile(path.join(free.outputDirectory,'report.html'),'utf8');
    expect(report).toContain('Исторические поля графика сохранены');expect(report).not.toContain('LEGACY-EXPORT-DEADLINE');expect(report).not.toContain('456');
  }finally{await fs.rm(directory,{recursive:true,force:true});await fs.rm(`${directory}-html.zip`,{force:true});await fs.rm(internal,{recursive:true,force:true});}
});

test('ZIP and manifest faults leave no partial publication and preserve unrelated destination data',async()=>{
  const directory=path.join(os.homedir(),`.roadmap-fault-export-${randomUUID()}`),internal=path.join(os.homedir(),`.roadmap-fault-internal-${randomUUID()}`);
  await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'sentinel'),'keep');
  try{
    const {roadmap,inputs}=fixture(directory);inputs.format='html';const state={id:'fault-test',answers:inputs,roadmap,review:null};
    const zipError=new Error('injected staged ZIP failure');
    await expect(buildRoadmap(state,{visualAudit:false,diagnosticsRoot:internal,createZip:()=>({addLocalFolder(){},writeZip(){throw zipError;}})})).rejects.toThrow(/injected staged ZIP failure/);
    expect(await fs.readdir(directory)).toEqual(['sentinel']);

    const originalRename=fs.rename,manifestError=Object.assign(new Error('injected manifest write failure'),{code:'EIO'});
    const manifestStub=mock.method(fs,'rename',async function(from,to,...args){if(path.basename(to)==='manifest.json')throw manifestError;return originalRename.call(this,from,to,...args);});
    try{await expect(buildRoadmap(state,{visualAudit:false,diagnosticsRoot:internal})).rejects.toThrow(/injected manifest write failure.*diagnostics:/s);}
    finally{manifestStub.mock.restore();}
    expect(await fs.readdir(directory)).toEqual(['sentinel']);
    expect(await fs.readFile(path.join(directory,'sentinel'),'utf8')).toBe('keep');
  }finally{await fs.rm(directory,{recursive:true,force:true});await fs.rm(internal,{recursive:true,force:true});}
});

test('publication copy and ZIP-write faults clean owned files, preserve an in-directory sentinel, and do not retry',async()=>{
  const originalOpen=fs.open;
  const makeState=async label=>{
    const directory=path.join(os.homedir(),`.roadmap-publish-fault-${label}-${randomUUID()}`),diagnostics=path.join(os.homedir(),`.roadmap-publish-diag-${randomUUID()}`);
    await fs.mkdir(directory,{recursive:true});const {roadmap,inputs}=fixture(directory);inputs.format='html';
    return {directory,diagnostics,state:{id:label,answers:inputs,roadmap,review:null}};
  };
  const options=(stateData,extra)=>buildRoadmap(stateData.state,{visualAudit:false,diagnosticsRoot:stateData.diagnostics,...extra});
  const wrapHandle=(handle,writeFile)=>new Proxy(handle,{get(target,key){if(key==='writeFile')return writeFile;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});

  const copy=await makeState('partial-copy');
  try{
    let outputDirectory,attempts=0,ownedWrites=0,payloadOpens=0,sentinel;
    const copyError=Object.assign(new Error('injected second payload-file open failure'),{code:'EIO'});
    const openStub=mock.method(fs,'open',async function(target,...args){
      if(outputDirectory&&target.startsWith(`${outputDirectory}${path.sep}`)&&target!==sentinel){
        payloadOpens++;
        if(payloadOpens===1){
          sentinel=path.join(outputDirectory,'foreign-sentinel.txt');
          await fs.writeFile(sentinel,'foreign bytes');
          const handle=await originalOpen.call(this,target,...args);
          return wrapHandle(handle,async(...writeArgs)=>{const result=await handle.writeFile(...writeArgs);ownedWrites++;return result;});
        }
        if(payloadOpens===2)throw copyError;
      }
      return originalOpen.call(this,target,...args);
    });
    try{
      let caught;
      try{await options(copy,{publish:async(payload,archive,destination,basename,...rest)=>{attempts++;outputDirectory=path.join(destination,basename);return publishFiles(payload,archive,destination,basename,...rest);}});}
      catch(error){caught=error;}
      expect(caught).toBeDefined();expect(caught.message).toContain(copyError.message);
      expect(caught.message).toContain(outputDirectory);expect(caught.rollbackComplete).toBe(false);expect(caught.retryableCollision).toBe(false);
      expect(attempts).toBe(1);expect(payloadOpens).toBe(2);expect(ownedWrites).toBe(1);
      expect(await fs.readdir(outputDirectory)).toEqual(['foreign-sentinel.txt']);
      expect(await fs.readFile(sentinel,'utf8')).toBe('foreign bytes');
      expect(caught.message).toMatch(/не удалось удалить созданные пути/);
      expect((await fs.readdir(outputDirectory)).some(name=>name!=='foreign-sentinel.txt')).toBe(false);
    }finally{openStub.mock.restore();}
  }finally{await fs.rm(copy.directory,{recursive:true,force:true});await fs.rm(copy.diagnostics,{recursive:true,force:true});}

  const zip=await makeState('published-zip');
  try{
    let outputDirectory,zipPath,attempts=0,zipWrites=0;
    const zipError=Object.assign(new Error('injected published ZIP handle write failure'),{code:'EIO'});
    const openStub=mock.method(fs,'open',async function(target,...args){
      if(zipPath&&target===zipPath){
        const handle=await originalOpen.call(this,target,...args);
        return wrapHandle(handle,async()=>{zipWrites++;throw zipError;});
      }
      return originalOpen.call(this,target,...args);
    });
    try{
      let caught;
      try{await options(zip,{publish:async(payload,archive,destination,basename,...rest)=>{attempts++;outputDirectory=path.join(destination,basename);zipPath=`${outputDirectory}-html.zip`;return publishFiles(payload,archive,destination,basename,...rest);}});}
      catch(error){caught=error;}
      expect(caught).toBeDefined();expect(caught.message).toContain(zipError.message);
      expect(attempts).toBe(1);expect(zipWrites).toBe(1);expect(caught.retryableCollision).toBe(false);
      expect(await fs.stat(outputDirectory).then(()=>true,()=>false)).toBe(false);
      expect(await fs.stat(zipPath).then(()=>true,()=>false)).toBe(false);
    }finally{openStub.mock.restore();}
  }finally{await fs.rm(zip.directory,{recursive:true,force:true});await fs.rm(zip.diagnostics,{recursive:true,force:true});}
});
