import { test,expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { fixture } from '../fixture.js';
import { buildRoadmap,auditSite } from '../../src/build.js';
import { contentHash } from '../../src/validate.js';

test('export both formats, ZIP extraction, snapshot parity and preliminary marking',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'roadmap-export-test-'));
  try{
    const {roadmap,inputs}=fixture(directory);
    const options={visualAudit:false,diagnosticsRoot:path.join(directory,'internal')};
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
    inputs.scheduleMode='self-paced';delete inputs.hoursPerWeek;delete inputs.deadline;inputs.format='both';
    roadmap.about.schedule='Порядок определяется зависимостями этапов и выполнением DoD.';
    const free=await buildRoadmap(state,options);expect(free.pdfCreated).toBe(true);expect(free.audit.passed).toBe(true);
    const about=await fs.readFile(path.join(free.outputDirectory,'about.html'),'utf8');
    expect(about).toContain('Свободный график');expect(about).not.toContain('Расчётный минимум');expect(about).not.toContain('Infinity');expect(about).not.toContain('NaN');
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
