import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { root } from '../src/store.js';

async function connected(capabilities={}){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'roadmap-mcp-test-'));
  const client=new Client({name:'test-client',version:'1.0.0'},{capabilities});
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'src/server.js'),'--data-dir',dir],stderr:'pipe'});
  await client.connect(transport);
  return {client,dir,close:async()=>{await client.close();await fs.rm(dir,{recursive:true,force:true});}};
}
const call=async(client,name,args={})=>{
  const result=await client.callTool({name,arguments:args});
  if(result.isError)throw new Error(result.content[0].text);
  return JSON.parse(result.content[0].text);
};
test('real stdio handshake, discovery, prompt and chat fallback',async()=>{
  const c=await connected();try{
    const tools=await c.client.listTools();assert.ok(tools.tools.some(t=>t.name==='roadmap_build'));
    assert.equal((await c.client.listPrompts()).prompts[0].name,'create-roadmap');
    const prompt=await c.client.getPrompt({name:'create-roadmap'});assert.ok(prompt.messages[0].content.text.includes('roadmap_question'));
    const start=await call(c.client,'roadmap_start',{knownInputs:{goal:'My exact goal'}});
    const next=await call(c.client,'roadmap_question',{sessionId:start.sessionId});assert.equal(next.mode,'chat');assert.equal(next.question.key,'level');
    await call(c.client,'roadmap_answer',{sessionId:start.sessionId,key:'level',value:'Custom experience'});
    assert.equal((await call(c.client,'roadmap_get',{sessionId:start.sessionId})).answers.goal,'My exact goal');
    const schema=await call(c.client,'roadmap_schema',{section:'stage'});assert.ok(schema.properties.dod);
    const guidance=await call(c.client,'roadmap_guidance',{phase:'sources'});assert.ok(guidance.text.includes('фактически'));
  }finally{await c.close();}
});
test('native MCP elicitation asks one field, cancellation preserves pending question',async()=>{
  const c=await connected({elicitation:{form:{}}});try{
    let calls=0,action='cancel';
    c.client.setRequestHandler(ElicitRequestSchema,async request=>{
      calls++;assert.equal(Object.keys(request.params.requestedSchema.properties).length,1);
      return action==='accept'?{action,content:{answer:'Опыт пользователя'}}:{action};
    });
    const start=await call(c.client,'roadmap_start',{knownInputs:{goal:'Goal'}});
    const cancelled=await call(c.client,'roadmap_question',{sessionId:start.sessionId});assert.equal(cancelled.pending,true);
    assert.equal((await call(c.client,'roadmap_get',{sessionId:start.sessionId})).nextQuestion.key,'level');
    action='accept';await call(c.client,'roadmap_question',{sessionId:start.sessionId});
    assert.equal(calls,2);assert.equal((await call(c.client,'roadmap_get',{sessionId:start.sessionId})).nextQuestion.key,'hoursPerWeek');
  }finally{await c.close();}
});
