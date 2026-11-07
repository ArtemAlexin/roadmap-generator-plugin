#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Store,root,defaultDataDirectory } from './store.js';
import { nextQuestion, validateAnswer } from './questions.js';
import * as schemas from './schema.js';
import { validateRoadmap } from './validate.js';
import { buildRoadmap } from './build.js';

const guidanceFiles={ workflow:'SKILL.md',curriculum:'references/curriculum.md',sources:'references/sources.md',review:'references/review.md',rubric:'references/rubric.md',delivery:'references/delivery.md',data:'references/data.md' };
export function createServer({dataDirectory=defaultDataDirectory()}={}){
  const store=new Store(dataDirectory);
  const server=new McpServer({name:'roadmap-generator',version:'0.0.3'},{instructions:'Use roadmap_guidance(workflow) for roadmap requests. Every intake question must use interactive input, not just the first. Call roadmap_question after roadmap_start and after every host-UI answer. Native forms continue automatically one at a time until intake completes or the user cancels. If MCP forms are unsupported, use the host question UI for every question; plain chat is only a last resort when the host has no interactive UI. HTML means the interactive multi-page local website in a ZIP, never one standalone HTML file. This server supplies state and rendering, not an LLM or a browser research service. Use host research tools and a separate reviewer. Never fabricate verification.'});
  const reply=value=>({content:[{type:'text',text:JSON.stringify(value,null,2)}]});
  const register=(name,description,inputSchema,handler)=>server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:['roadmap_guidance','roadmap_schema','roadmap_get','roadmap_validate'].includes(name),destructiveHint:false,openWorldHint:false}},async args=>{
    try{return reply(await handler(args));}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}
  });
  register('roadmap_guidance','Load only the instructions for the current phase; workflow first.',{phase:z.enum(Object.keys(guidanceFiles))},async({phase})=>({phase,text:await fs.readFile(path.join(root,'skills/roadmap',guidanceFiles[phase]),'utf8')}));
  register('roadmap_schema','Get JSON Schema for one object; avoid loading the entire schema unless needed.',{section:z.enum(['roadmap','stage','source','competence','scenario','evidence','coverage','about','report','review'])},async({section})=>schemas[section==='roadmap'?'roadmapSchema':`${section}Schema`]);
  register('roadmap_start','Start a roadmap. Seed only user-provided facts, preserving user text; omit unknown facts. For a user-requested free schedule seed scheduleMode=self-paced and omit weekly budget/deadline. Effort is still estimated in hours. Use scheduleMode=weekly only for a real weekly budget.',{knownInputs:z.record(z.union([z.string(),z.number()])).optional()},async({knownInputs})=>store.create(knownInputs));
  register('roadmap_question','Continue interactive intake. Native MCP forms ask ALL remaining questions sequentially, one field/form at a time, until complete or cancelled. Without native forms (or interactive=false), return one question for the host question UI; call again after saving each answer. HTML is an interactive local website ZIP.',{sessionId:z.string(),interactive:z.boolean().default(true)},async({sessionId,interactive})=>{
    let state=await store.load(sessionId),question=nextQuestion(state.answers);
    if(!question)return {complete:true,...store.summary(state)};
    const elicitation=server.server.getClientCapabilities()?.elicitation;
    const supportsForm=elicitation && (Object.keys(elicitation).length===0 || elicitation.form!==undefined);
    if(!interactive||!supportsForm)return {question,mode:'host-ui',
      instruction:'Use the host interactive question/input tool for THIS question and EVERY following question, with the supplied labels/choices and custom input where applicable. Lack of MCP elicitation does not mean lack of host UI. Wait for the actual answer, save through roadmap_answer, then call roadmap_question again. Do not continue by writing the next question in chat. Only if the host has no interactive input tool at all, explain the limitation and use chat.',
      afterAnswer:{tool:'roadmap_answer',then:'roadmap_question',sessionId}};
    let validationError='';
    while(question){
      const schema=question.type==='number'?{type:'number',minimum:0,maximum:168}:question.choices?{type:'string',enum:question.labels||question.choices}:{type:'string',minLength:1};
      const response=await server.server.elicitInput({mode:'form',message:[question.title,question.hint,validationError].filter(Boolean).join('\n'),requestedSchema:{type:'object',properties:{answer:{...schema,title:question.title}},required:['answer']}});
      if(response.action!=='accept')return {sessionId,question,action:response.action,pending:true,complete:false,instruction:'Wait for the user to resume. Cancellation did not answer the pending question.'};
      let answer=response.content.answer;
      if(question.labels){const i=question.labels.indexOf(answer);if(i>=0)answer=question.choices[i];}
      try{answer=validateAnswer(question.key,answer);validationError='';}
      catch(error){validationError=error.message;continue;}
      await store.answer(sessionId,question.key,answer);
      state=await store.load(sessionId);question=nextQuestion(state.answers);
    }
    return {complete:true,...store.summary(state)};
  });
  register('roadmap_answer','Save the actual user answer; do not invent answers.',{sessionId:z.string(),key:z.string(),value:z.union([z.string(),z.number()])},async a=>store.answer(a.sessionId,a.key,a.value));
  register('roadmap_get','Read a summary, section or individual object. Prefer individual objects over all.',{sessionId:z.string(),section:z.string().optional(),itemId:z.string().optional()},async a=>store.get(a.sessionId,a.section,a.itemId));
  register('roadmap_put','Upsert one competence/scenario/source/stage/evidence, replace coverage array, or set title/language/about/report. authorId is the author context identity.',{sessionId:z.string(),section:z.string(),value:z.unknown(),authorId:z.string().min(1)},async a=>store.put(a.sessionId,a.section,a.value,a.authorId));
  register('roadmap_remove','Remove one obsolete object by ID. Validation will catch dangling references.',{sessionId:z.string(),section:z.string(),itemId:z.string()},async a=>store.remove(a.sessionId,a.section,a.itemId));
  register('roadmap_validate','Mechanical validation only; does not prove factual accuracy or source sufficiency.',{sessionId:z.string()},async a=>validateRoadmap((await store.load(a.sessionId)).roadmap));
  register('roadmap_prepare_review','Create a file packet without prior scores, review conclusions, self-assessment or change history. Give to a separate clean-context reviewer.',{sessionId:z.string()},async a=>store.prepareReview(a.sessionId));
  register('roadmap_submit_review','Store actual separate-reviewer results and calculate the unchanged 100-point rubric. Identity and independent flag are attestations, not cryptographic proof.',{sessionId:z.string(),requestId:z.string(),review:z.unknown()},async a=>store.submitReview(a.sessionId,a.requestId,a.review));
  register('roadmap_build','Build selected interactive local website (ZIP), PDF or both under the user-selected output directory. HTML always means the multi-page interactive site with DAG, stage pages, search, themes and progress; never offer/export a single standalone HTML file. New directory per build; incomplete verification produces an explicitly preliminary program.',{sessionId:z.string()},async({sessionId})=>store.mutate(sessionId,async state=>{const result=await buildRoadmap(state);state.builds.push(result);return result;}));
  server.registerPrompt('create-roadmap',{description:'Start a personalized, sourced roadmap with interactive questions and HTML/PDF output.'},async()=>({messages:[{role:'user',content:{type:'text',text:await fs.readFile(path.join(root,'skills/roadmap/SKILL.md'),'utf8')}}]}));
  return {server,store};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.join(root,'src/server.js')){
  const index=process.argv.indexOf('--data-dir');
  const {server}=createServer({dataDirectory:index>=0?process.argv[index+1]:undefined});
  await server.connect(new StdioServerTransport());
}
