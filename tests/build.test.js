import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {exportBasename,sanitizeExportName} from '../src/export-name.js';
import {inventory,preflightLocations,publishFiles} from '../src/export-files.js';

test('export names preserve readable Unicode and sanitize unsafe/reserved names',()=>{
  assert.equal(exportBasename({title:' Java backend ',date:'2026-11-08',suffix:'a1b2c3d4'}),'Java backend-2026-11-08-a1b2c3d4');
  assert.equal(exportBasename({title:'',goal:'Цель / API',date:'2026-11-08',suffix:'A1B2C3D4'}),'Цель - API-2026-11-08-a1b2c3d4');
  assert.equal(sanitizeExportName('CON.txt'),'roadmap-CON.txt');
  assert.equal(sanitizeExportName('..'), '');
  assert.equal(sanitizeExportName('e\u0301'),'é');
  assert.equal(sanitizeExportName('a'.repeat(200)).length,64);
  assert.ok(Buffer.byteLength(sanitizeExportName('界'.repeat(100)),'utf8')<=120);
  assert.equal(exportBasename({title:'',goal:'',date:'2026-11-08',suffix:'12345678'}),'Учебный-roadmap-2026-11-08-12345678');
  assert.throws(()=>exportBasename({title:'x',date:'bad',suffix:'12345678'}),/дата/);
});

test('path preflight rejects nested destinations and permits sibling directories',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'roadmap-path-test-'));
  try{
    const temp=path.join(root,'tmp'),dest=path.join(root,'exports'),diag=path.join(root,'state','builds');
    await fs.mkdir(temp);await preflightLocations(dest,diag,temp);
    await assert.rejects(preflightLocations(path.join(root,'state'),diag,temp),/Пересекаются/);
    await assert.rejects(preflightLocations(path.join(root,'exports'),path.join(root,'exports','diagnostics'),temp),/Пересекаются/);
    await assert.rejects(preflightLocations(path.join(root,'tmp','child'),diag,temp),/Пересекаются/);
    const real=path.join(root,'real'),alias=path.join(root,'alias');await fs.mkdir(real);
    try{await fs.symlink(real,alias,'junction');}catch(error){if(['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.skip(`Junction creation unavailable: ${error.code}`);return;}throw error;}
    await assert.rejects(preflightLocations(alias,path.join(real,'state'),temp),/Пересекаются/);
    const dangling=path.join(root,'dangling');
    try{await fs.symlink(path.join(root,'missing-target'),dangling,'junction');}
    catch(error){if(!['EPERM','EACCES','ENOTSUP'].includes(error.code))throw error;}
    if(await fs.lstat(dangling).catch(()=>null))await assert.rejects(preflightLocations(dangling,diag,temp),/symbolic link/i);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('publication copies staged bytes exclusively and rollback removes only owned paths',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'roadmap-publish-test-'));
  try{
    const payload=path.join(root,'payload'),dest=path.join(root,'out');await fs.mkdir(payload);await fs.mkdir(dest);
    await fs.writeFile(path.join(payload,'index.html'),'site','utf8');
    const expected=await inventory(payload),archive=path.join(root,'site.zip');await fs.writeFile(archive,'zip');
    const archiveDigest={size:3,sha256:(await import('node:crypto')).createHash('sha256').update('zip').digest('hex')};
    const sentinel=path.join(dest,'occupied');await fs.mkdir(sentinel);
    await assert.rejects(publishFiles(payload,archive,dest,'occupied',false,{payload:expected}),error=>error.code==='EEXIST'&&error.retryableCollision===true&&error.rollbackComplete===true);
    assert.equal((await fs.readdir(dest)).join(),'occupied');
    const result=await publishFiles(payload,archive,dest,'fresh',true,{payload:expected,archive:archiveDigest});
    assert.equal(await fs.readFile(path.join(result.directory,'index.html'),'utf8'),'site');
    assert.equal(await fs.readFile(result.zipPath,'utf8'),'zip');
    await assert.rejects(publishFiles(payload,archive,dest,'rollback',true,{payload:expected,archive:{...archiveDigest,sha256:'0'.repeat(64)} }),/digest/);
    assert.deepEqual((await fs.readdir(dest)).sort(),['fresh','fresh-html.zip','occupied']);
    const race=await Promise.allSettled([publishFiles(payload,archive,dest,'race',true,{payload:expected,archive:archiveDigest}),publishFiles(payload,archive,dest,'race',true,{payload:expected,archive:archiveDigest})]);
    assert.equal(race.filter(item=>item.status==='fulfilled').length,1);
    assert.equal(race.filter(item=>item.status==='rejected').length,1);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('publication failures roll back partial output, preserve foreign paths and only mark clean collisions retryable',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'roadmap-fault-test-'));
  const payload=path.join(root,'payload'),dest=path.join(root,'out'),archive=path.join(root,'site.zip');
  await fs.mkdir(payload);await fs.mkdir(dest);await fs.writeFile(path.join(payload,'index.html'),'site');await fs.writeFile(archive,'zip');
  const expected=await inventory(payload),digest={size:3,sha256:(await import('node:crypto')).createHash('sha256').update('zip').digest('hex')};
  const sentinel=path.join(dest,'foreign');await fs.mkdir(sentinel);await fs.writeFile(path.join(sentinel,'keep'),'untouched');
  t.after(()=>fs.rm(root,{recursive:true,force:true}));

  await t.test('mkdir failure',async()=>{
    const failure=Object.assign(new Error('injected mkdir failure'),{code:'EACCES'});
    const original=fs.mkdir,stub=mock.method(fs,'mkdir',async function(target,...args){if(target===path.join(dest,'mkdir-fault'))throw failure;return original.call(this,target,...args);});
    try{await assert.rejects(publishFiles(payload,archive,dest,'mkdir-fault',false,{payload:expected}),e=>e===failure&&!e.retryableCollision);}
    finally{stub.mock.restore();}
  });
  await t.test('open failure after output directory reservation',async()=>{
    const failure=Object.assign(new Error('injected open failure'),{code:'EACCES'});
    const original=fs.open,stub=mock.method(fs,'open',async function(target,...args){if(target===path.join(dest,'open-fault-html.zip'))throw failure;return original.call(this,target,...args);});
    try{await assert.rejects(publishFiles(payload,archive,dest,'open-fault',true,{payload:expected,archive:digest}),e=>e===failure&&e.rollbackComplete===true);assert.equal(await fs.stat(path.join(dest,'open-fault')).then(()=>true,()=>false),false);}
    finally{stub.mock.restore();}
  });
  await t.test('copy failure after ZIP reservation rolls back output and archive',async()=>{
    const failure=Object.assign(new Error('injected copy failure'),{code:'EIO'});
    const original=fs.readFile,stub=mock.method(fs,'readFile',async function(target,...args){if(target===path.join(payload,'index.html'))throw failure;return original.call(this,target,...args);});
    try{await assert.rejects(publishFiles(payload,archive,dest,'copy-fault',true,{payload:expected,archive:digest}),e=>e===failure&&e.rollbackComplete===true);assert.equal((await fs.readdir(dest)).includes('copy-fault-html.zip'),false);}
    finally{stub.mock.restore();}
  });
  await t.test('EEXIST with failed rollback is not retryable and reports real leftover',async()=>{
    const occupiedZip=path.join(dest,'collision-html.zip');await fs.writeFile(occupiedZip,'foreign');
    const failure=Object.assign(new Error('occupied zip'),{code:'EEXIST'});
    const original=fs.rmdir,stub=mock.method(fs,'rmdir',async function(target,...args){if(target===path.join(dest,'collision'))throw Object.assign(new Error('injected cleanup failure'),{code:'EACCES'});return original.call(this,target,...args);});
    try{
      await assert.rejects(publishFiles(payload,archive,dest,'collision',true,{payload:expected,archive:digest}),e=>e.code==='EEXIST'&&e.retryableCollision===false&&/не удалось удалить созданные пути/.test(e.message)&&e.message.includes(path.join(dest,'collision')));
      assert.equal(await fs.readFile(path.join(sentinel,'keep'),'utf8'),'untouched');
      assert.equal(await fs.readFile(occupiedZip,'utf8'),'foreign');
      assert.equal(await fs.stat(path.join(dest,'collision')).then(()=>true,()=>false),true);
    }finally{stub.mock.restore();}
  });
});
