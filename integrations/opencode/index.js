import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const entry=path.join(root,'src/server.js');
const skillFile=path.join(root,'skills/roadmap/SKILL.md');
const description='Персональный roadmap: интерактивный опрос, проверенные материалы, практика, отдельное рецензирование, HTML/PDF.';
function name(value,fallback){
  const result=value??fallback;
  if(typeof result!=='string'||!/^[a-z][a-z0-9_-]{0,63}$/.test(result))throw new Error('Roadmap: имена сервера/команды должны состоять из строчных букв, цифр, _ и -.');
  return result;
}
function optionsFrom(input={}){
  const serverName=name(input.serverName,'roadmap'),commandName=name(input.commandName,'roadmap');
  // OpenCode runs on Bun: process.execPath would point to OpenCode, not Node.js.
  const nodeCommand=input.nodeCommand||process.env.ROADMAP_NODE_PATH||'node';
  if(typeof nodeCommand!=='string'||!nodeCommand.trim())throw new Error('Roadmap: nodeCommand должен быть именем или абсолютным путём к Node.js.');
  const command=[nodeCommand,entry];
  if(input.dataDirectory!==undefined){
    if(typeof input.dataDirectory!=='string'||!path.isAbsolute(input.dataDirectory))throw new Error('Roadmap: dataDirectory должен быть абсолютным путём.');
    command.push('--data-dir',input.dataDirectory);
  }
  return {serverName,commandName,command};
}

/** OpenCode V2 native default-export contract; no extra SDK/runtime dependency. */
export default {
  id:'roadmap-generator',
  async setup(ctx){
    for(const domain of ['mcp','skill','command'])if(typeof ctx?.[domain]?.transform!=='function')throw new Error('Roadmap Generator требует OpenCode V2 с API mcp/skill/command.transform.');
    const {serverName,commandName,command}=optionsFrom(ctx.options);
    const markdown=await fs.readFile(skillFile,'utf8');
    const content=markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'').trim();
    const registrations=[];
    async function cleanup(){for(const registration of registrations.splice(0).reverse())await registration.dispose();}
    try{
      registrations.push(await ctx.mcp.transform(editor=>{
        const existing=editor.get(serverName);
        if(existing){
          const sameEntry=existing.type==='local'&&existing.command?.some(part=>typeof part==='string'&&path.resolve(part)===entry);
          if(!sameEntry)throw new Error(`MCP-сервер ${serverName} уже занят другим подключением. Выберите serverName в опциях Roadmap Generator.`);
          return; // Preserve explicit disabled, environment, command and timeout choices.
        }
        editor.set(serverName,{type:'local',command,cwd:root,protocol:'legacy',timeout:{startup:30000,catalog:30000,execution:1800000}});
      }));
      registrations.push(await ctx.skill.transform(editor=>{
        const existing=editor.get('roadmap');
        if(existing){
          if(path.resolve(existing.path)!==skillFile)throw new Error('Навык roadmap уже существует по другому пути. Устраните конфликт имён перед подключением плагина.');
          return;
        }
        editor.add({id:'roadmap',name:'Roadmap',description,path:skillFile,content,autoinvoke:true});
      }));
      registrations.push(await ctx.command.transform(editor=>{
        editor.add({name:commandName,description:'Создать или продолжить персональный roadmap (HTML/PDF)',
          async execute({sessionID,prompt,delivery}){
            await ctx.session.prompt({...prompt,sessionID,delivery,text:[
              `Используй навык roadmap и MCP-сервер ${serverName}. Сначала прочитай roadmap_guidance с phase=workflow.`,
              'Создай или продолжи персональную программу по исходной цели пользователя. Каждый недостающий вопрос задавай интерактивно, по одному, включая все вопросы после первого. Вызывай roadmap_question до inputComplete=true; при mode=host-ui используй инструмент интерактивного вопроса OpenCode для каждого вопроса, сохраняй ответ через roadmap_answer и снова вызывай roadmap_question. Не превращай nextQuestion из состояния в обычный вопрос текстом в чате.',
              'Предложи ровно три варианта результата: «Интерактивный локальный сайт (ZIP)», «PDF-документ», «Интерактивный сайт (ZIP) и PDF». Внутренний format=html — полноценный многостраничный локальный сайт с картой, страницами этапов, поиском, темами и прогрессом. Не предлагай один HTML-файл. Спроси папку сохранения и используй roadmap_build.',
              'Исследуй обязательные источники средствами поиска/чтения. Для рецензирования используй отдельный чистый контекст; не подменяй его самооценкой. Если это недоступно, явно обозначь предварительный статус. Не генерируй заново код представления.',
              prompt?.text?`Запрос пользователя:\n${prompt.text}`:'Если цель ещё не задана, начни с вопроса о цели.'
            ].join('\n\n')});
          }
        });
      }));
      return cleanup;
    }catch(error){await cleanup();throw error;}
  }
};
