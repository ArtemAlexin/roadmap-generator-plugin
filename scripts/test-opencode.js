import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {root} from '../src/store.js';

const windowsDefault=path.join(process.env.APPDATA||'', 'npm/node_modules/@opencode/cli/bin/opencode.exe');
const executable=process.env.OPENCODE_EXECUTABLE||(process.platform==='win32'?windowsDefault:'opencode');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'roadmap-opencode-smoke-'));
const workspace=process.argv.includes('--self')?root:directory;
const env={...process.env,ROADMAP_DATA_DIR:path.join(directory,'roadmap-state'),ROADMAP_NODE_PATH:process.execPath};
for(const [key,name]of Object.entries({XDG_CONFIG_HOME:'config',XDG_DATA_HOME:'data',XDG_CACHE_HOME:'cache',XDG_STATE_HOME:'state'})){
  env[key]=path.join(directory,name);await fs.mkdir(env[key],{recursive:true});
}
const version=execFileSync(executable,['--version'],{env,windowsHide:true,encoding:'utf8'}).trim();
const major=Number(version.match(/v?(\d+)\./)?.[1]);
assert.equal(major,2,`Тест предназначен для OpenCode V2, обнаружен ${version}`);
// 2.2.5 uses singular plugin; newer documentation describes plural plugins.
const key=process.env.OPENCODE_CONFIG_STYLE==='modern'?'plugins':'plugin';
if(workspace===directory)await fs.writeFile(path.join(directory,'opencode.json'),JSON.stringify({[key]:[pathToFileURL(root).href]},null,2));
const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const child=spawn(executable,['serve','--hostname','127.0.0.1','--port',String(port),'--log-level','debug'],{cwd:workspace,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',d=>{log+=d;});child.stderr.on('data',d=>{log+=d;});
let spawnError;child.on('error',e=>{spawnError=e;});
const base=`http://127.0.0.1:${port}`;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const unwrap=value=>value.data??value;
async function get(resource){
  const url=new URL(`/api/${resource}`,base);
  const password=log.match(/server password\s+(\S+)/)?.[1];
  const headers=password?{Authorization:`Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`} : {};
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error(`${resource}: HTTP ${response.status}: ${(await response.text()).slice(0,1000)}`);
  return unwrap(await response.json());
}
try{
  const until=Date.now()+45000;
  let plugins,skills,commands,mcp,lastError;
  while(Date.now()<until){
    if(spawnError)throw spawnError;
    try{
      plugins=await get('plugin');skills=await get('skill');commands=await get('command');mcp=await get('mcp');
      if(JSON.stringify(plugins).includes('roadmap-generator')&&JSON.stringify(skills).includes('roadmap')&&JSON.stringify(commands).includes('roadmap')&&JSON.stringify(mcp).includes('connected'))break;
    }catch(e){lastError=e.message;}
    await delay(250);
  }
  const selectedPlugins=(plugins??[]).filter(p=>JSON.stringify(p).includes('roadmap-generator')).map(p=>({id:p.id,state:p.state,source:p.source}));
  const selectedSkills=(skills??[]).filter(s=>s.id==='roadmap').map(s=>({id:s.id,name:s.name,path:s.path}));
  const selectedCommands=(commands??[]).filter(c=>c.name==='roadmap').map(c=>({name:c.name,description:c.description}));
  const selectedMcp=(mcp??[]).filter(s=>s.name==='roadmap');
  console.log(JSON.stringify({version,plugins:selectedPlugins,skills:selectedSkills,commands:selectedCommands,mcp:selectedMcp},null,2));
  assert.equal(selectedPlugins.find(p=>p.id==='roadmap-generator')?.state?.status,'active','Нативный плагин не активировался');
  assert.equal(selectedSkills.length,1,'Навык roadmap не зарегистрирован');
  assert.equal(selectedCommands.length,1,'Команда /roadmap не зарегистрирована');
  assert.equal(selectedMcp[0]?.status?.status,'connected','MCP-сервер не подключён');
  console.log('OpenCode native smoke test passed; no model calls were made.');
}catch(error){
  console.error(log.replace(/server password\s+\S+/g,'server password [redacted]').slice(-18000));throw error;
}finally{
  if(child.pid&&child.exitCode===null){
    if(process.platform==='win32')try{execFileSync('taskkill',['/pid',String(child.pid),'/t','/f'],{stdio:'ignore',windowsHide:true});}catch{}
    else child.kill('SIGTERM');
    if(child.exitCode===null)await Promise.race([once(child,'exit'),delay(5000)]);
  }
  await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
