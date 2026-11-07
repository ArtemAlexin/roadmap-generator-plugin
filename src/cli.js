#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin,stdout } from 'node:process';
import { Store,root,defaultDataDirectory } from './store.js';
import { nextQuestion } from './questions.js';
import { validateRoadmap } from './validate.js';
import { buildRoadmap } from './build.js';
import { roadmapSchema } from './schema.js';
import { writeJson } from './files.js';
import { pathToFileURL } from 'node:url';

const [command,...args]=process.argv.slice(2);
const store=new Store(defaultDataDirectory());
try{
  if(command==='config'){
    const config=args[0]==='opencode'
      ? {$schema:'https://opencode.ai/config.json',[args.includes('--modern')?'plugins':'plugin']:[pathToFileURL(root).href]}
      : {mcpServers:{roadmap:{command:process.execPath,args:[path.join(root,'src/server.js'),'--data-dir',store.directory]}}};
    console.log(JSON.stringify(config,null,2));
  }else if(command==='schema')console.log(JSON.stringify(roadmapSchema,null,2));
  else if(command==='wizard'){
    const session=args[0]?await store.get(args[0]):await store.create();
    const rl=readline.createInterface({input:stdin,output:stdout});
    try{
      let state=await store.load(session.sessionId),q;
      console.log(`Сессия: ${session.sessionId}. Для продолжения: roadmap-generator wizard ${session.sessionId}`);
      while((q=nextQuestion(state.answers))){
        console.log(`\n${q.title}\n${q.hint||''}${q.choices?'\n'+q.choices.map((c,i)=>`${i+1}. ${q.labels[i]} (${c})`).join('\n'):''}`);
        let answer=await rl.question('> ');
        if(q.choices&&/^\d+$/.test(answer))answer=q.choices[Number(answer)-1]||answer;
        try{await store.answer(state.id,q.key,answer);state=await store.load(state.id);}catch(e){console.error(e.message);}
      }
      console.log(JSON.stringify({sessionId:state.id,answers:state.answers,next:'Подключите MCP-сервер к агенту и продолжите эту сессию по навыку roadmap.'},null,2));
    }finally{rl.close();}
  }else if(command==='validate'){
    const result=validateRoadmap(JSON.parse(await fs.readFile(args[0],'utf8')));console.log(JSON.stringify(result,null,2));if(!result.valid)process.exitCode=1;
  }else if(command==='build'){
    const result=await store.mutate(args[0],async state=>{const r=await buildRoadmap(state,{diagnosticsRoot:path.join(store.directory,'builds')});state.builds.push(r);return r;});console.log(JSON.stringify(result,null,2));
  }else if(command==='import'){
    // Explicit local import supports agents with filesystem/CLI access instead of MCP.
    const source=JSON.parse(await fs.readFile(args[0],'utf8'));
    const session=await store.create(source.inputs);
    await store.mutate(session.sessionId,state=>{state.roadmap=source.roadmap;state.authorId=source.authorId||'cli-author';});
    console.log(JSON.stringify(session,null,2));
  }else if(command==='export-schema'){
    await writeJson(path.join(root,'schema/roadmap.schema.json'),roadmapSchema);
  }else console.log('Commands: config [opencode] | wizard [sessionId] | schema | validate roadmap.json | import package.json | build sessionId');
}catch(e){console.error(e.message);process.exitCode=1;}
