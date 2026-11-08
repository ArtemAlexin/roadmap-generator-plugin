import { test,mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { root,Store } from '../src/store.js';
import { buildAndPersist } from '../src/server.js';
import { fixture } from './fixture.js';
import { formatLabels,scheduleLabels } from '../src/questions.js';

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

test('host intake offers predefined options only for schedule and format',async()=>{
  const c=await connected();try{
    const start=await call(c.client,'roadmap_start');
    const fields=[
      ['goal','text','Авторская цель'],['level','text','Авторский опыт'],
      ['scheduleMode','choice',scheduleLabels[1]],['hoursPerWeek','number',4],
      ['deadline','text','Без срока'],['constraints','text','Нет'],['priorities','text','Нет'],
      ['format','choice',formatLabels[0]],['outputDirectory','text',c.dir],
    ];
    for(const [key,inputMode,value] of fields){
      const result=await call(c.client,'roadmap_question',{sessionId:start.sessionId});
      assert.equal(result.question.key,key);assert.equal(result.inputMode,inputMode);
      if(inputMode==='choice'){
        assert.deepEqual(result.question.labels,key==='scheduleMode'?scheduleLabels:formatLabels);
        assert.match(result.instruction,/only the supplied/);
      }else{
        assert.equal(result.question.choices,undefined);
        assert.match(result.instruction,/Do not invent/);
        assert.match(result.instruction,/free[- ](?:text|numeric)/);
      }
      await call(c.client,'roadmap_answer',{sessionId:start.sessionId,key,value});
    }
    assert.equal((await call(c.client,'roadmap_question',{sessionId:start.sessionId})).complete,true);
  }finally{await c.close();}
});
test('build persistence failure reports artifacts and diagnostics already published',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'roadmap-persist-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const store=new Store(dir),session=await store.create();
  const result={outputDirectory:path.join(dir,'exports','published'),artifacts:{siteDirectory:path.join(dir,'exports','published'),htmlArchive:path.join(dir,'exports','published-html.zip')},diagnostics:{directory:path.join(dir,'builds','build-1')}};
  const failure=Object.assign(new Error('injected state persistence failure'),{code:'EIO'});
  const original=fs.rename,stub=mock.method(fs,'rename',async function(from,to,...args){if(to===store.file(session.sessionId))throw failure;return original.call(this,from,to,...args);});
  try{
    await assert.rejects(buildAndPersist(store,session.sessionId,async()=>result),error=>error===failure&&error.publishedResult===result&&error.message.includes(result.artifacts.siteDirectory)&&error.message.includes(result.artifacts.htmlArchive)&&error.message.includes(result.diagnostics.directory)&&/Состояние сессии не сохранено/.test(error.message));
  }finally{stub.mock.restore();}
});
test('real stdio handshake, discovery, prompt and explicit host-UI fallback',async()=>{
  const c=await connected();try{
    const tools=await c.client.listTools();assert.ok(tools.tools.some(t=>t.name==='roadmap_build'));
    assert.equal((await c.client.listPrompts()).prompts[0].name,'create-roadmap');
    const prompt=await c.client.getPrompt({name:'create-roadmap'});assert.ok(prompt.messages[0].content.text.includes('roadmap_question'));
    const start=await call(c.client,'roadmap_start',{knownInputs:{goal:'My exact goal'}});
    const next=await call(c.client,'roadmap_question',{sessionId:start.sessionId});assert.equal(next.mode,'host-ui');assert.equal(next.question.key,'level');
    assert.equal(next.afterAnswer.then,'roadmap_question');
    const saved=await call(c.client,'roadmap_answer',{sessionId:start.sessionId,key:'level',value:'Custom experience'});
    assert.equal(saved.nextAction.tool,'roadmap_question');
    const second=await call(c.client,'roadmap_question',{sessionId:start.sessionId});assert.equal(second.mode,'host-ui');assert.equal(second.question.key,'scheduleMode');
    assert.equal((await call(c.client,'roadmap_get',{sessionId:start.sessionId})).answers.goal,'My exact goal');
    const schema=await call(c.client,'roadmap_schema',{section:'stage'});assert.ok(schema.properties.dod);
    const guidance=await call(c.client,'roadmap_guidance',{phase:'sources'});assert.ok(guidance.text.includes('фактически'));
    const editorial=await call(c.client,'roadmap_guidance',{phase:'editorial'});
    assert.match(editorial.text,/Проход A/);assert.match(editorial.text,/Проход B/);assert.match(editorial.text,/пунктуац/i);assert.match(editorial.text,/весь тот же инвентарь/);
  }finally{await c.close();}
});
test('native MCP elicitation asks one field, cancellation preserves pending question',async()=>{
  const c=await connected({elicitation:{form:{}}});try{
    let calls=0,action='cancel';
    c.client.setRequestHandler(ElicitRequestSchema,async request=>{
      calls++;assert.equal(Object.keys(request.params.requestedSchema.properties).length,1);
      return action==='accept'?{action,content:{answer:'Опыт пользователя'}}:{action};
    });
    const knownInputs=fixture(c.dir).inputs;knownInputs.scheduleMode='weekly';delete knownInputs.level;delete knownInputs.hoursPerWeek;
    const start=await call(c.client,'roadmap_start',{knownInputs});
    const cancelled=await call(c.client,'roadmap_question',{sessionId:start.sessionId});assert.equal(cancelled.pending,true);
    assert.equal((await call(c.client,'roadmap_get',{sessionId:start.sessionId})).nextQuestion.key,'level');
    action='accept';
    c.client.setRequestHandler(ElicitRequestSchema,async request=>{
      calls++;return {action:'accept',content:{answer:request.params.requestedSchema.properties.answer.type==='number'?6:'Опыт пользователя'}};
    });
    const complete=await call(c.client,'roadmap_question',{sessionId:start.sessionId});
    assert.equal(calls,3);assert.equal(complete.complete,true);assert.equal(complete.inputComplete,true);assert.equal(complete.nextQuestion,null);
  }finally{await c.close();}
});

test('one native intake call asks all weekly-plan questions interactively and describes a ZIP website',async()=>{
  const c=await connected({elicitation:{form:{}}});try{
    const answers=['Моя цель','Мой опыт',scheduleLabels[1],4,'Без срока','Ограничений нет','Без приоритетов',formatLabels[0],c.dir];
    let index=0;
    c.client.setRequestHandler(ElicitRequestSchema,async request=>{
      assert.equal(Object.keys(request.params.requestedSchema.properties).length,1);
      const field=request.params.requestedSchema.properties.answer;
      if(index===2)assert.deepEqual(field.enum,scheduleLabels);
      else if(index!==7){assert.equal(field.enum,undefined);assert.equal(field.type,index===3?'number':'string');}
      if(index===7){
        assert.deepEqual(request.params.requestedSchema.properties.answer.enum,formatLabels);
        assert.match(request.params.message,/ZIP/);assert.match(request.params.message,/отдельными страницами/);
      }
      return {action:'accept',content:{answer:answers[index++]}};
    });
    const start=await call(c.client,'roadmap_start');
    const result=await call(c.client,'roadmap_question',{sessionId:start.sessionId});
    assert.equal(index,9);assert.equal(result.complete,true);assert.equal(result.answers.format,'html');
    assert.equal(result.delivery.website.kind,'interactive-local-website');assert.equal(result.delivery.website.singleHtmlFile,false);
    assert.equal(result.delivery.website.archive,'<roadmap-directory>-html.zip');assert.equal(result.nextAction,null);
    await call(c.client,'roadmap_question',{sessionId:start.sessionId});assert.equal(index,9);
  }finally{await c.close();}
});

test('overlapping native intake calls share one form sequence for the same session',async()=>{
  const c=await connected({elicitation:{form:{}}});try{
    const knownInputs=fixture(c.dir).inputs;
    delete knownInputs.level;delete knownInputs.constraints;
    const messages=[];
    c.client.setRequestHandler(ElicitRequestSchema,async request=>{
      messages.push(request.params.message);
      return {action:'accept',content:{answer:'Ответ пользователя'}};
    });
    const start=await call(c.client,'roadmap_start',{knownInputs});
    const results=await Promise.all([
      call(c.client,'roadmap_question',{sessionId:start.sessionId}),
      call(c.client,'roadmap_question',{sessionId:start.sessionId}),
    ]);
    assert.equal(messages.length,2,'each of the two unanswered questions must have exactly one form');
    assert.equal(new Set(messages).size,2,'the same question must not be displayed twice');
    for(const result of results){assert.equal(result.complete,true);assert.equal(result.answers.level,'Ответ пользователя');assert.equal(result.answers.constraints,'Ответ пользователя');}
  }finally{await c.close();}
});

test('shared native intake cancellation permits a later resume without replaying the cancellation',async()=>{
  const c=await connected({elicitation:{form:{}}});try{
    const knownInputs=fixture(c.dir).inputs;delete knownInputs.level;
    const start=await call(c.client,'roadmap_start',{knownInputs});
    const shown=Promise.withResolvers(),release=Promise.withResolvers();let forms=0;
    c.client.setRequestHandler(ElicitRequestSchema,async()=>{
      forms++;shown.resolve();await release.promise;return {action:'cancel'};
    });
    const first=call(c.client,'roadmap_question',{sessionId:start.sessionId});
    await shown.promise;
    const second=call(c.client,'roadmap_question',{sessionId:start.sessionId});
    // The ping round trip ensures the server received the second call before ending the first.
    await c.client.ping();release.resolve();
    const cancelled=await Promise.all([first,second]);
    assert.equal(forms,1);
    for(const result of cancelled){assert.equal(result.pending,true);assert.equal(result.question.key,'level');}
    c.client.setRequestHandler(ElicitRequestSchema,async()=>{forms++;return {action:'accept',content:{answer:'Опыт после возобновления'}};});
    const resumed=await call(c.client,'roadmap_question',{sessionId:start.sessionId});
    assert.equal(forms,2);assert.equal(resumed.complete,true);assert.equal(resumed.answers.level,'Опыт после возобновления');
  }finally{await c.close();}
});

test('native intake failure clears the active call and does not affect another session',async()=>{
  const c=await connected({elicitation:{form:{}}});try{
    const knownInputs=fixture(c.dir).inputs;delete knownInputs.level;
    const first=await call(c.client,'roadmap_start',{knownInputs});
    const second=await call(c.client,'roadmap_start',{knownInputs});
    c.client.setRequestHandler(ElicitRequestSchema,async()=>{throw new Error('injected form failure');});
    await assert.rejects(call(c.client,'roadmap_question',{sessionId:first.sessionId}),/injected form failure/);
    let forms=0;
    c.client.setRequestHandler(ElicitRequestSchema,async()=>{forms++;return {action:'accept',content:{answer:'Опыт пользователя'}};});
    const results=await Promise.all([first,second].map(session=>call(c.client,'roadmap_question',{sessionId:session.sessionId})));
    assert.equal(forms,2);
    assert.deepEqual(results.map(result=>result.sessionId),[first.sessionId,second.sessionId]);
    for(const result of results){assert.equal(result.complete,true);assert.equal(result.answers.level,'Опыт пользователя');}
  }finally{await c.close();}
});

test('native intake cancelled after first answer resumes forms for the remaining questions',async()=>{
  const c=await connected({elicitation:{form:{}}});try{
    let count=0;
    c.client.setRequestHandler(ElicitRequestSchema,async()=>++count===1?{action:'accept',content:{answer:'Сохранённая цель'}}:{action:'cancel'});
    const start=await call(c.client,'roadmap_start');
    const stopped=await call(c.client,'roadmap_question',{sessionId:start.sessionId});
    assert.equal(stopped.question.key,'level');assert.equal(stopped.pending,true);
    const saved=await call(c.client,'roadmap_get',{sessionId:start.sessionId});assert.equal(saved.answers.goal,'Сохранённая цель');assert.equal(saved.answers.level,undefined);
    const answers=['Опыт',scheduleLabels[1],2,'Без срока','Нет','Нет',formatLabels[2],c.dir];let index=0;
    c.client.setRequestHandler(ElicitRequestSchema,async()=>({action:'accept',content:{answer:answers[index++]}}));
    const result=await call(c.client,'roadmap_question',{sessionId:start.sessionId});
    assert.equal(index,8);assert.equal(result.inputComplete,true);assert.equal(result.answers.goal,'Сохранённая цель');assert.equal(result.answers.format,'both');
  }finally{await c.close();}
});

test('self-paced intake skips weekly hours and deadline but completes every other form',async()=>{
  const c=await connected({elicitation:{form:{}}});try{
    const answers=['Цель','Опыт',scheduleLabels[0],'Нет','Нет',formatLabels[0],c.dir];let index=0;
    c.client.setRequestHandler(ElicitRequestSchema,async request=>{
      assert.doesNotMatch(request.params.message,/Сколько часов в неделю|Какой желаемый срок/);
      return {action:'accept',content:{answer:answers[index++]}};
    });
    const start=await call(c.client,'roadmap_start');const result=await call(c.client,'roadmap_question',{sessionId:start.sessionId});
    assert.equal(index,7);assert.equal(result.complete,true);assert.equal(result.answers.scheduleMode,'self-paced');
    assert.equal(result.answers.hoursPerWeek,undefined);assert.equal(result.answers.deadline,undefined);
    assert.equal(result.planning.calendarBound,false);assert.equal(result.planning.hoursPerWeek,null);
  }finally{await c.close();}
});

test('invalid native path displays an actionable error before retrying and is not saved',async()=>{
  const c=await connected({elicitation:{form:{}}});try{
    const knownInputs=fixture(c.dir).inputs;delete knownInputs.outputDirectory;let count=0;
    const example=process.platform==='win32'?'C:\\Roadmaps':'/home/user/roadmaps';
    let sessionId;
    c.client.setRequestHandler(ElicitRequestSchema,async request=>{
      count++;
      if(count===1)assert.doesNotMatch(request.params.requestedSchema.properties.answer.title,/Ошибка ввода/);
      if(count===2){
        assert.match(request.params.message,/^Ответ не принят/);
        assert.match(request.params.message,/relative-folder/);
        assert.match(request.params.message,/абсолютный путь/);
        assert.ok(request.params.message.includes(example));
        assert.match(request.params.requestedSchema.properties.answer.title,/^Ошибка ввода:/);
        assert.match(request.params.requestedSchema.properties.answer.description,/абсолютный путь/);
        assert.match(request.params.message,/отмен/i);
        assert.equal((await call(c.client,'roadmap_get',{sessionId})).answers.outputDirectory,undefined);
      }
      return {action:'accept',content:{answer:count===1?'relative-folder':c.dir}};
    });
    const start=await call(c.client,'roadmap_start',{knownInputs});sessionId=start.sessionId;
    const result=await call(c.client,'roadmap_question',{sessionId});
    assert.equal(count,2);assert.equal(result.complete,true);assert.equal(result.answers.outputDirectory,c.dir);
  }finally{await c.close();}
});

test('host-UI path validation returns an actionable error and preserves the pending question',async()=>{
  const c=await connected();try{
    const knownInputs=fixture(c.dir).inputs;delete knownInputs.outputDirectory;
    const start=await call(c.client,'roadmap_start',{knownInputs});
    const rejected=await c.client.callTool({name:'roadmap_answer',arguments:{sessionId:start.sessionId,key:'outputDirectory',value:'relative-folder'}});
    assert.equal(rejected.isError,true);
    assert.match(rejected.content[0].text,/relative-folder/);
    assert.match(rejected.content[0].text,/абсолютный путь/);
    assert.match(rejected.content[0].text,/например/);
    const pending=await call(c.client,'roadmap_question',{sessionId:start.sessionId});
    assert.equal(pending.mode,'host-ui');assert.equal(pending.question.key,'outputDirectory');
    assert.equal((await call(c.client,'roadmap_get',{sessionId:start.sessionId})).answers.outputDirectory,undefined);
  }finally{await c.close();}
});

test('numeric validation uses the same visible feedback and clears it for the next question',async()=>{
  const c=await connected({elicitation:{form:{}}});try{
    const knownInputs=fixture(c.dir).inputs;knownInputs.scheduleMode='weekly';
    delete knownInputs.hoursPerWeek;delete knownInputs.outputDirectory;
    let count=0;
    c.client.setRequestHandler(ElicitRequestSchema,async request=>{
      count++;
      if(count===2){
        assert.match(request.params.message,/^Ответ не принят/);
        assert.match(request.params.requestedSchema.properties.answer.title,/^Ошибка ввода:.*Часы в неделю/);
        assert.match(request.params.requestedSchema.properties.answer.description,/больше 0 и не больше 168/);
      }
      if(count===3){
        assert.doesNotMatch(request.params.message,/Ответ не принят/);
        assert.doesNotMatch(request.params.requestedSchema.properties.answer.title,/Ошибка ввода/);
        assert.match(request.params.requestedSchema.properties.answer.title,/Куда сохранить/);
      }
      return {action:'accept',content:{answer:count===1?0:count===2?4:c.dir}};
    });
    const start=await call(c.client,'roadmap_start',{knownInputs});
    const result=await call(c.client,'roadmap_question',{sessionId:start.sessionId});
    assert.equal(count,3);assert.equal(result.complete,true);assert.equal(result.answers.hoursPerWeek,4);assert.equal(result.answers.outputDirectory,c.dir);
  }finally{await c.close();}
});
