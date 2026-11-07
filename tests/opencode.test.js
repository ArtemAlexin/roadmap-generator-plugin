import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import plugin from '../integrations/opencode/index.js';
import {root} from '../src/store.js';

function host({mcp=[],skills=[],options={}}={}){
  const servers=new Map(mcp),skillMap=new Map(skills),commands=new Map(),disposed=[],prompts=[];
  const register=(domain,fn)=>{fn();return Promise.resolve({dispose:async()=>{disposed.push(domain);}});};
  const ctx={options,
    mcp:{transform:fn=>register('mcp',()=>fn({get:id=>servers.get(id),set:(id,value)=>servers.set(id,value)}))},
    skill:{transform:fn=>register('skill',()=>fn({get:id=>skillMap.get(id),add:value=>skillMap.set(value.id,value)}))},
    command:{transform:fn=>register('command',()=>fn({add:value=>commands.set(value.name,value)}))},
    session:{prompt:async value=>{prompts.push(value);return value;}}
  };
  return {ctx,servers,skillMap,commands,disposed,prompts};
}
test('OpenCode native entrypoint registers MCP, skill and command and cleans up',async()=>{
  const h=host(),cleanup=await plugin.setup(h.ctx);
  assert.equal(plugin.id,'roadmap-generator');assert.equal(h.servers.get('roadmap').command[0],process.env.ROADMAP_NODE_PATH||'node');
  assert.ok(h.servers.get('roadmap').command[1].endsWith(path.join('src','server.js')));
  assert.equal(h.skillMap.get('roadmap').path,path.join(root,'skills/roadmap/SKILL.md'));assert.ok(!h.skillMap.get('roadmap').content.startsWith('---'));
  assert.ok(h.commands.has('roadmap'));await cleanup();assert.deepEqual(h.disposed,['command','skill','mcp']);
});
test('OpenCode /roadmap preserves user prompt, attachments, session and delivery',async()=>{
  const h=host();await plugin.setup(h.ctx);
  const files=[{url:'file:///sample.txt'}];
  await h.commands.get('roadmap').execute({sessionID:'session-1',prompt:{text:'Научиться анализировать данные',files,skills:['existing']},delivery:'queue'});
  const request=h.prompts[0];assert.equal(request.sessionID,'session-1');assert.equal(request.delivery,'queue');assert.deepEqual(request.files,files);assert.deepEqual(request.skills,['existing']);
  assert.ok(request.text.includes('Научиться анализировать данные'));assert.ok(request.text.includes('чистый контекст'));
});
test('OpenCode preserves existing matching server config and rolls back on skill conflict',async()=>{
  const existing={type:'local',command:['node',path.join(root,'src/server.js')],disabled:true,environment:{EXAMPLE:'value'}};
  const h=host({mcp:[['roadmap',existing]]});await plugin.setup(h.ctx);assert.equal(h.servers.get('roadmap'),existing);
  const conflict=host({skills:[['roadmap',{path:path.join(root,'other/SKILL.md')}]]});
  await assert.rejects(plugin.setup(conflict.ctx),/Навык roadmap/);assert.deepEqual(conflict.disposed,['mcp']);
  const serverConflict=host({mcp:[['roadmap',{type:'remote',url:'https://example.org'}]]});await assert.rejects(plugin.setup(serverConflict.ctx),/уже занят/);
});
test('OpenCode options configure Node, state and names; V1 and relative state paths rejected',async()=>{
  const h=host({options:{serverName:'my-roadmap',commandName:'learn',nodeCommand:process.execPath,dataDirectory:path.resolve('custom-state')}});await plugin.setup(h.ctx);
  assert.equal(h.servers.get('my-roadmap').command[0],process.execPath);assert.ok(h.servers.get('my-roadmap').command.includes('--data-dir'));assert.ok(h.commands.has('learn'));
  await assert.rejects(plugin.setup({}),/OpenCode V2/);
  await assert.rejects(plugin.setup(host({options:{dataDirectory:'relative'}}).ctx),/абсолютным/);
});
test('OpenCode config command returns a native plugin entry, not manual MCP wiring',()=>{
  const config=JSON.parse(execFileSync(process.execPath,[path.join(root,'src/cli.js'),'config','opencode'],{encoding:'utf8'}));
  assert.equal(config.plugin.length,1);assert.equal(path.resolve(fileURLToPath(config.plugin[0])),path.resolve(root));assert.equal(config.mcp,undefined);
  const modern=JSON.parse(execFileSync(process.execPath,[path.join(root,'src/cli.js'),'config','opencode','--modern'],{encoding:'utf8'}));
  assert.equal(modern.plugins.length,1);assert.equal(modern.plugin,undefined);
});
test('MCP configuration produced by native OpenCode plugin starts real server',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'roadmap-opencode-test-'));
  const h=host({options:{nodeCommand:process.execPath,dataDirectory:directory}});
  let client;
  try{
    await plugin.setup(h.ctx);const config=h.servers.get('roadmap');
    client=new Client({name:'opencode-adapter-test',version:'1.0.0'});
    await client.connect(new StdioClientTransport({command:config.command[0],args:config.command.slice(1),cwd:config.cwd,stderr:'pipe'}));
    const result=await client.callTool({name:'roadmap_start',arguments:{knownInputs:{goal:'Exact user goal'}}});
    assert.equal(result.isError,undefined);const state=JSON.parse(result.content[0].text);assert.equal(state.nextQuestion.key,'level');
  }finally{await client?.close();await fs.rm(directory,{recursive:true,force:true});}
});
