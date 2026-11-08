import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const fold = value => value.toLocaleLowerCase('en-US');
function overlaps(a, b) {
  const rel = path.relative(a, b);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}
function checkPair(a, b, labels) {
  if (overlaps(a, b) || overlaps(b, a) || overlaps(fold(a), fold(b)) || overlaps(fold(b), fold(a))) {
    throw new Error(`Пересекаются пути ${labels}: ${a} и ${b}. Выберите непересекающиеся destination, diagnosticsRoot и TEMP.`);
  }
}

async function canonicalFuture(input) {
  const resolved = path.resolve(input);
  let cursor = resolved, tail = [];
  while (true) {
    let stat;
    try {
      stat = await fs.lstat(cursor);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw new Error(`Не удаётся разрешить путь: ${input}`, { cause: error });
      tail.push(path.basename(cursor)); cursor = parent;
      continue;
    }
    if (stat.isSymbolicLink()) {
      let real;
      try { real=await fs.realpath(cursor); }
      catch(error){throw new Error(`Dangling or inaccessible symbolic link in path: ${cursor}`,{cause:error});}
      const target = await fs.stat(real);
      if (!target.isDirectory()) throw new Error(`Существующая часть пути не является папкой: ${cursor}`);
      return { lexical: resolved, canonical: path.join(real, ...tail.reverse()) };
    }
    if (!stat.isDirectory()) throw new Error(`Существующая часть пути не является папкой: ${cursor}`);
    return { lexical: resolved, canonical: path.join(await fs.realpath(cursor), ...tail.reverse()) };
  }
}

export async function preflightLocations(destination, diagnosticsRoot, tempRoot = os.tmpdir()) {
  const [d, r, t] = await Promise.all([canonicalFuture(destination), canonicalFuture(diagnosticsRoot), canonicalFuture(tempRoot)]);
  for (const [left, right, labels] of [[d,r,'destination/diagnosticsRoot'],[d,t,'destination/TEMP']]) {
    checkPair(left.lexical,right.lexical,labels);
    checkPair(left.canonical,right.canonical,labels);
  }
  return { destination:d, diagnostics:r, temp:t };
}

export async function inventory(directory) {
  const files = [];
  async function walk(current, relative = '') {
    for (const entry of await fs.readdir(current, { withFileTypes:true })) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const full = path.join(current,entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Недопустимая символическая ссылка: ${rel}`);
      if (entry.isDirectory()) await walk(full,rel);
      else if (entry.isFile()) {
        const data = await fs.readFile(full);
        files.push({ path:rel,size:data.length,sha256:createHash('sha256').update(data).digest('hex') });
      } else throw new Error(`Неподдерживаемый файл сборки: ${rel}`);
    }
  }
  await walk(directory); return files.sort((a,b)=>a.path.localeCompare(b.path));
}

async function copyFileExclusive(source, destination, ownedFiles) {
  const data=await fs.readFile(source), output=await fs.open(destination,'wx');
  ownedFiles.push(destination);
  try { await output.writeFile(data); await output.sync(); } finally { await output.close(); }
}

export async function publishFiles(payload, archive, destination, basename, wantArchive, expected) {
  const directory = path.join(destination,basename), zipPath = `${directory}-html.zip`;
  const ownedFiles=[], ownedDirs=[], parentDirs=[]; let zipHandle;
  try {
    async function ensureDirectory(target) {
      try { await fs.mkdir(target); parentDirs.push(target); }
      catch(error) {
        if(error.code==='EEXIST' && (await fs.stat(target)).isDirectory())return;
        if(error.code!=='ENOENT')throw error;
        const parent=path.dirname(target);
        if(parent===target)throw error;
        await ensureDirectory(parent);
        await fs.mkdir(target); parentDirs.push(target);
      }
    }
    await ensureDirectory(destination);
    await fs.mkdir(directory); ownedDirs.push(directory);
    if (wantArchive) { zipHandle=await fs.open(zipPath,'wx'); ownedFiles.push(zipPath); }
    async function copyTree(source, target) {
      for (const entry of await fs.readdir(source,{withFileTypes:true})) {
        const from=path.join(source,entry.name),to=path.join(target,entry.name);
        if(entry.isSymbolicLink())throw new Error(`Symlink в staged payload: ${from}`);
        if(entry.isDirectory()){await fs.mkdir(to);ownedDirs.push(to);await copyTree(from,to);}
        else await copyFileExclusive(from,to,ownedFiles);
      }
    }
    await copyTree(payload,directory);
    if(wantArchive){
      const data=await fs.readFile(archive);
      await zipHandle.writeFile(data);await zipHandle.sync();await zipHandle.close();zipHandle=null;
    }
    const actual=await inventory(directory);
    if(JSON.stringify(actual)!==JSON.stringify(expected.payload))throw new Error('Проверка digest опубликованной папки не совпала со staging.');
    if(wantArchive){const data=await fs.readFile(zipPath);if(data.length!==expected.archive.size||createHash('sha256').update(data).digest('hex')!==expected.archive.sha256)throw new Error('Проверка digest опубликованного ZIP не совпала со staging.');}
    return {directory,zipPath,ownedFiles,ownedDirs,parentDirs};
  } catch(error) {
    await zipHandle?.close().catch(()=>{});
    const leftovers=[];
    for(const file of ownedFiles.reverse())try{await fs.rm(file);}catch(e){if(e.code!=='ENOENT')leftovers.push(`${file} (${e.message})`);}
    for(const dir of ownedDirs.reverse())try{await fs.rmdir(dir);}catch(e){if(e.code!=='ENOENT')leftovers.push(`${dir} (${e.message})`);}
    if(leftovers.length){
      error.message+=`; не удалось удалить созданные пути: ${leftovers.join(', ')}`;
      error.rollbackComplete=false;
    }else error.rollbackComplete=true;
    // Only a clean exclusive-name collision can safely advance to another candidate.
    error.retryableCollision=error.code==='EEXIST'&&error.rollbackComplete;
    throw error;
  }
}

export async function digestFile(file) {
  const data=await fs.readFile(file);
  return {size:data.length,sha256:createHash('sha256').update(data).digest('hex')};
}
