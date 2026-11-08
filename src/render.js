import fs from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { topological } from './validate.js';
import { root } from './store.js';
import { planningInputs } from './questions.js';

export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export function md(value) {
  return sanitizeHtml(marked.parse(String(value ?? ''),{ async:false }), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags,'h1','h2','h3','h4','span'],
    allowedAttributes: { a:['href','target','rel'], code:['class'], span:['class'] },
    allowedSchemes:['http','https','mailto'],
    transformTags:{ a:(_tag,attrs) => ({ tagName:'a', attribs:{ href:attrs.href || '#', ...(/^https?:/.test(attrs.href || '') ? { target:'_blank',rel:'noopener noreferrer' } : {}) } }) }
  });
}
const names = { required:'Обязательный',recommended:'Желательный',optional:'Дополнительный', verified:'Содержание проверено',partial:'Проверено частично','description-only':'Найдено только описание',unavailable:'Не удалось открыть',
  free:'Бесплатно полностью','free-fragment':'Бесплатно нужный фрагмент','paid-book':'Платная книга',main:'Основной материал',supplement:'Дополнение',deepening:'Углубление',alternative:'Альтернатива' };
const field = (label,value) => `<div class="field"><h4>${escape(label)}</h4>${md(value)}</div>`;
const badge = (status) => `<span class="badge ${escape(status)}">${escape(names[status] || status)}</span>`;
const link = (id,label=id) => `<a href="#${escape(id)}">${escape(label)}</a>`;
const hoursTotal = s => Object.values(s.hours).reduce((n,v)=>n+v,0);
const hourText = s => `${hoursTotal(s)} ч`;
const refLinks = ids => ids.map(id=>link(id)).join(' · ') || '—';

export function graphLayout(stages) {
  const order = topological(stages), ranks = new Map(), layers=[];
  for (const s of order) {
    const rank = s.dependencies.length ? Math.max(...s.dependencies.map(id=>ranks.get(id)))+1 : 0;
    ranks.set(s.id,rank); (layers[rank] ??= []).push(s);
  }
  const width = Math.max(800,...layers.map(l=>l.length*300+100));
  const positions = new Map();
  layers.forEach((layer,r) => layer.forEach((s,c) => positions.set(s.id,{ x:(width-layer.length*300)/2+c*300+18,y:40+r*210,w:264,h:120,rank:r })));
  return { width,height:Math.max(250,layers.length*210+30),positions };
}
function wrap(value,max=25) {
  const words=value.split(/\s+/), lines=[]; let line='';
  for (let word of words) {
    while (word.length>max) { if(line){lines.push(line);line='';} lines.push(word.slice(0,max));word=word.slice(max); }
    if ((line+' '+word).trim().length>max){lines.push(line);line=word;}else line=(line+' '+word).trim();
  }
  if(line)lines.push(line); return lines.slice(0,3).map((l,i,a)=>i===2&&words.join(' ').length>a.join(' ').length?l.slice(0,max-1)+'…':l);
}
export function graph(roadmap,prefix='') {
  const {width,height,positions}=graphLayout(roadmap.stages);
  const edges=roadmap.stages.flatMap(s=>s.dependencies.map(dep=>{
    const a=positions.get(dep), b=positions.get(s.id), ax=a.x+a.w/2, ay=a.y+a.h, bx=b.x+b.w/2, by=b.y;
    // Long edges use an outer lane, avoiding nodes in intervening layers.
    const d=b.rank-a.rank>1 ? `M${ax} ${ay} V${ay+24} H${20+roadmap.stages.findIndex(x=>x.id===s.id)*2} V${by-24} H${bx} V${by}` : `M${ax} ${ay} C${ax} ${ay+45},${bx} ${by-45},${bx} ${by}`;
    return `<path class="edge" data-from="${escape(dep)}" data-to="${escape(s.id)}" d="${d}" marker-end="url(#arrow)"/>`;
  })).join('');
  const nodes=roadmap.stages.map(s=>{
    const p=positions.get(s.id);
    return `<a class="node ${s.status}" data-stage="${s.id}" data-status="${s.status}" href="${prefix}stages/${s.id}.html" aria-label="${escape(s.id+' '+s.title+' '+names[s.status]+' '+hourText(s))}"><title>${escape(s.title)} · ${hourText(s)} · ${names[s.status]} · ${s.dod.length} критериев DoD</title><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="12"/><text x="${p.x+16}" y="${p.y+22}" class="node-id">${escape(s.id)} · ${hourText(s)}</text>${wrap(s.title).map((line,i)=>`<text x="${p.x+16}" y="${p.y+45+i*18}" class="node-title">${escape(line)}</text>`).join('')}<text x="${p.x+16}" y="${p.y+107}" class="node-status">${names[s.status]}</text></a>`;
  }).join('');
  return `<svg id="roadmap-graph" role="group" aria-label="Карта зависимостей этапов" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-width="${width}" data-height="${height}"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="var(--edge)"/></marker></defs>${edges}${nodes}</svg>`;
}
function sourceShort(m,sources) {
  const s=sources.find(s=>s.id===m.sourceId);
  return `<aside class="material"><span class="eyebrow">${names[m.role]}</span><a class="external" href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)} ↗</a><p>${escape(s.author)} · ${escape(s.year)} · ${m.studyHours} ч изучение / ${m.exerciseHours} ч упражнения</p>${field('Точный фрагмент',m.fragment)}${badge(s.status)} ${badge(s.access)}</aside>`;
}
const blocks=['Зачем этот этап','Перед началом','Учебный план','Практика','Ошибки и ограничения','Этап пройден, если','Повторение и контрольная точка'];
function section(s,index,content) { return `<section id="${s.id}-b${index+1}" class="stage-block"><h2><span class="section-number">${index+1}</span>${blocks[index]}</h2>${content}</section>`; }
export function stageContent(s,roadmap) {
  const stageRefs=ids=>ids.map(id=>`<a class="chip" href="${id}.html">${escape(id)} · ${escape(roadmap.stages.find(s=>s.id===id)?.title)}</a>`).join(' ')||'Нет';
  const intro=`<header class="stage-hero" id="${s.id}"><div class="eyebrow">${escape(s.id)} · ${s.kind==='final'?'Итоговая проверка':'Учебный этап'}</div><h1>${escape(s.title)}</h1><div class="meta">${badge(s.status)}<span>${hourText(s)}</span></div><div class="hours-grid">${Object.entries(s.hours).map(([k,v])=>`<div><strong>${v} ч</strong><span>${({theory:'Теория',practice:'Практика',assessment:'Проверка',repetition:'Повторение'})[k]}</span></div>`).join('')}</div><p>Предпосылки: ${stageRefs(s.dependencies)}</p><p>Открывает: ${stageRefs(roadmap.stages.filter(x=>x.dependencies.includes(s.id)).map(x=>x.id))}</p><p>Можно параллельно: ${stageRefs(s.parallelWith)}</p><label class="completion"><input type="checkbox" data-progress="${s.id}"> Отметить этап пройденным</label></header>`;
  return intro+
    section(s,0,md(s.purpose)+field('Формируемые компетенции',s.competenceIds.map(id=>roadmap.competences.find(c=>c.id===id)?.name).join('; ')))+
    section(s,1,field('Предпосылки',s.prerequisites)+field('Окружение и проверка готовности',s.environment))+
    section(s,2,s.steps.map((step,i)=>`<article class="card step" id="${step.id}"><div class="eyebrow">Шаг ${i+1} · ${step.hours} ч</div><h3>${escape(step.title)}</h3>${md(step.explanation)}${step.materials.map(m=>sourceShort(m,roadmap.sources)).join('')}${field('Что извлечь и применить',step.extraction)}<p>Практика: ${refLinks(step.practiceIds)} · DoD: ${refLinks(step.dodIds)}</p></article>`).join('')+field('Углубление и альтернативы',s.enrichment))+
    section(s,3,s.practice.map(p=>`<article class="card practice" id="${p.id}"><div class="eyebrow">${escape(p.id)} · ${p.hours} ч</div><h3>${escape(p.title)}</h3>${field('Цель',p.goal)}${field('Исходные данные и стартовые условия',p.inputs)}${field('Действия и самостоятельность',p.actions)}<div class="expected">${field('Ожидаемый результат',p.expectedResult)}</div>${field('Критерии приёмки',p.acceptance)}<p>DoD: ${refLinks(p.dodIds)}</p>${field('Частые ловушки',p.pitfalls)}${field('Как проверить себя',p.selfCheck)}</article>`).join(''))+
    section(s,4,s.errors.map(e=>`<aside class="callout">${field('Признак',e.symptom)}${field('Вероятная причина',e.cause)}${field('Исправление',e.fix)}${field('Сложные случаи и ограничения',e.limits)}</aside>`).join(''))+
    section(s,5,s.dod.map(d=>`<article class="card criterion" id="${d.id}"><label class="completion"><input type="checkbox" data-progress="${d.id}"><strong>${escape(d.id)}</strong></label>${field('Артефакт или действие',d.artifact)}${field('Порог',d.threshold)}${field('Происхождение порога',d.thresholdOrigin)}${field('Условия',d.conditions)}${field('Проверка',d.verification)}<p class="badge">${d.transfer?'Проверяет перенос в новую ситуацию':'Проверяет применение'}</p><div class="recovery"><h4>При невыполнении</h4>${field('Вероятная причина',d.recovery.likelyCause)}<p>Что повторить: ${refLinks(d.recovery.stepIds)}</p>${field('Дополнительное упражнение',d.recovery.exercise)}${field('Повторная проверка',d.recovery.retest)}</div></article>`).join(''))+
    section(s,6,field('Сохранение навыка',s.repetition)+field('Контрольная точка',s.checkpoint))+ (s.sizeJustification !== '—' ? field('Обоснование размера этапа',s.sizeJustification) : '');
}
export function verdict(evaluation) { return evaluation?.passed ? `Подтверждённая оценка программы: ${evaluation.total}/100` : 'Предварительная программа — порог качества не подтверждён'; }
const effortNotice='Оценки — приблизительная трудоёмкость в часах, не личный график и не срок завершения.';
const preliminaryNotice='Авторский текст не подтверждён текущей проверкой; старые календарные формулировки могут сохраниться и не являются действующим графиком.';
function effortNoticeMarkup(evaluation){return `<p class="notice effort-notice">${effortNotice}${evaluation?.passed?'':` ${preliminaryNotice}`}</p>`;}
export function aboutContent(roadmap,inputs,evaluation,{includeEffortNotice=true}={}) {
  const a=roadmap.about, required=roadmap.stages.filter(s=>s.status==='required').reduce((n,s)=>n+hoursTotal(s),0);
  return `<div class="eyebrow">Персональная программа</div><h1>О программе</h1><div class="notice ${evaluation?.passed?'success':''}">${escape(verdict(evaluation))}<p>Оценка относится к программе, а не к фактическому освоению навыков учащимся.</p></div>${includeEffortNotice?effortNoticeMarkup(evaluation):''}${md(a.summary)}${field('Цель',inputs.goal)}${field('Главный критерий',a.mainCriterion)}${inputs.definitionOfDone?field('Исходный DoD пользователя',inputs.definitionOfDone):''}${field('Допущения и сведения для подтверждения',a.assumptions.map(x=>`- ${x}`).join('\n'))}${field('Границы программы',a.boundaries)}${field('Ограничения',a.limitations)}<div class="stats"><div><strong>${required} ч</strong>Обязательный маршрут</div><div><strong>${a.reserveHours} ч</strong>Отдельный резерв</div><div><strong>${required+a.reserveHours} ч</strong>Обязательный маршрут с резервом</div></div>${field('Порядок прохождения',a.schedule)}${field('Промежуточные результаты',a.milestones)}${field('Основания оценки времени',a.timeBasis)}${field('Диапазон неопределённости',a.uncertainty)}${field('Как проходить программу',a.instructions)}`;
}
const reportLabels={ crossCheck:'Перекрёстная проверка модели и сценариев',depthAudit:'Проверка глубины покрытия',dryRun:'Аудит исполнимости маршрута',negativeScenarios:'Негативные сценарии',factualChecks:'Фактически проведённые проверки',limitations:'Ограничения проверки',personalization:'Условия персонализации',changes:'Что исправлено',authorSelfAssessment:'Самооценка автора — справочно' };
const reportFieldNames={goal:'Цель',level:'Исходный уровень',constraints:'Ограничения',priorities:'Приоритеты и исключения',format:'Формат результата',outputDirectory:'Каталог сохранения',definitionOfDone:'Исходный DoD',id:'ID',name:'Название',title:'Название',category:'Категория',required:'Обязательно для цели',action:'Наблюдаемое действие',depth:'Глубина освоения',prerequisites:'Предпосылки',tasks:'Характерные задачи',errors:'Ошибки и ограничения',verification:'Проверка освоения',relevance:'Связь с целью',description:'Описание',kind:'Тип сценария',inScope:'Входит в границы цели',exclusionReason:'Обоснование исключения',competenceIds:'Компетенции',practiceIds:'Практика',dodIds:'Критерии DoD',url:'Прямая ссылка',status:'Статус',access:'Доступ',method:'Способ проверки',result:'Наблюдаемый результат',checkedAt:'Дата проверки',checkedFragments:'Проверенные фрагменты',sufficient:'Достаточность подтверждена',sufficiencyReason:'Обоснование достаточности',requirementId:'Требование',sourceId:'Источник',fragment:'Точный фрагмент',observation:'Наблюдение',problem:'Проблема',evidence:'Доказательство',impact:'Влияние на результат',correction:'Необходимое исправление'};
const reportValues={...names,base:'Обязательная база',advanced:'Углублённая компетенция',situational:'Ситуативная компетенция',typical:'Типовой',complex:'Сложный',failure:'Аварийный',constrained:'С ограничениями',structural:'Проверено только структурно',unconfirmed:'Не подтверждено',contradiction:'Противоречие',open:'Не закрыто',closed:'Закрыто',objection:'Возражение автора',html:'HTML',pdf:'PDF',both:'HTML и PDF',theory:'Теория',practice:'Практика'};
function record(obj,labels={}) {
  return Object.entries(obj).map(([key,val])=>{
    const label=labels[key]||reportFieldNames[key]||key;
    if(val && typeof val==='object' && !Array.isArray(val))return `<div class="nested-record"><h4>${escape(label)}</h4>${record(val)}</div>`;
    const show=v=>typeof v==='boolean'?(v?'Да':'Нет'):Object.hasOwn(reportValues,v)?reportValues[v]:String(v);
    const value=Array.isArray(val)?(val.length?val.map(v=>`- ${show(v)}`).join('\n'):'—'):show(val);
    return field(label,value);
  }).join('');
}
export function reportContent(roadmap,inputs,review,evaluation,{includeEffortNotice=true}={}) {
  const projected=planningInputs(inputs),hasRetired=Object.keys(inputs).some(key=>['scheduleMode','hoursPerWeek','deadline'].includes(key));
  return `<div class="eyebrow">Доказательства и границы проверки</div><h1>Детали отчёта</h1>${includeEffortNotice?effortNoticeMarkup(evaluation):''}<nav class="report-toc" aria-label="Оглавление отчёта">${[['inputs','Входные данные'],['model','Модель и сценарии'],['coverage','Сквозное покрытие'],['sources','Источники'],['evidence','Реестр доказательств'],['review','Рецензирование'],['audit','Аудиты и изменения']].map(([id,title])=>link('report-'+id,title)).join(' · ')}</nav><section id="report-inputs"><h2>Действующие входные данные (текст ответов сохранён)</h2>${hasRetired?'<p>Исторические поля графика сохранены в сессии, но исключены из планирования и этого отчёта.</p>':''}${record(projected)}</section><section id="report-model"><h2>Компетенции и сценарии</h2>${roadmap.competences.map(c=>`<article class="card" id="${c.id}"><h3>${escape(c.id+' · '+c.name)}</h3>${record(c)}</article>`).join('')}${roadmap.scenarios.map(sc=>`<article class="card" id="${sc.id}"><h3>${escape(sc.id+' · '+sc.title)}</h3>${record(sc)}</article>`).join('')}</section><section id="report-coverage"><h2>Сквозная таблица покрытия</h2><div class="table-wrap"><table><thead><tr><th>Компетенция</th><th>Этап</th><th>Шаги / практика / DoD</th><th>Источники</th><th>Глубина и статус</th></tr></thead><tbody>${roadmap.coverage.map(c=>`<tr><td>${escape(c.competenceId)}</td><td><a href="stages/${c.stageId}.html">${escape(c.stageId)}</a></td><td>${escape([...c.stepIds,...c.practiceIds,...c.dodIds].join(', '))}</td><td>${escape(c.sourceIds.join(', '))}</td><td>${md(c.depth)}${escape(c.status)}</td></tr>`).join('')}</tbody></table></div></section><section id="report-sources"><h2>Полные карточки источников</h2>${roadmap.sources.map(s=>`<article class="card" id="${s.id}"><h3><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)} ↗</a></h3>${badge(s.status)} ${badge(s.access)}${record(s,{id:'ID',author:'Автор / организация',year:'Год',edition:'Издание',fragment:'Точный фрагмент',language:'Язык',legalBasis:'Основание легального доступа',prerequisites:'Предпосылки',topics:'Темы',learningTask:'Задача изучения',role:'Роль',studyHours:'Изучение, ч',exerciseHours:'Упражнения, ч',functions:'Функции'})}</article>`).join('')}</section><section id="report-evidence"><h2>Реестр доказательств</h2>${roadmap.evidence.map(e=>`<article class="card" id="${e.id}">${record(e)}</article>`).join('')}</section><section id="report-review"><h2>Независимое рецензирование</h2><p class="notice">${escape(verdict(evaluation))}</p>${review?`${field('Проверяющий',JSON.stringify(review.reviewer,null,2))}<div class="table-wrap"><table><thead><tr><th>Подкритерий</th><th>Уровень</th><th>Баллы</th><th>Доказательство / ограничения / следующий уровень</th></tr></thead><tbody>${evaluation.scores.map(s=>`<tr><td>${s.id}</td><td>${s.level}</td><td>${s.points} / ${s.weight}</td><td>${md(review.scores[s.id].evidence)}${md(review.scores[s.id].limitation)}${md(review.scores[s.id].nextLevel)}</td></tr>`).join('')}</tbody></table></div><p><strong>Сумма: ${evaluation.scores.map(s=>s.points).join(' + ')} = ${evaluation.total} / 100</strong></p>${field('Блокирующие условия',evaluation.blockers.length?evaluation.blockers.map(b=>`- ${b}`).join('\n'):'Не выявлены в пределах проведённой проверки.')}${field('Проведённые проверки',review.checks)}${field('Выборка этапов',review.sampledStageIds.join(', '))}${field('Перепроверенные источники',review.reopenedSourceIds.join(', '))}${field('Охват проверки',review.coverage)}${field('Ограничения проверки',review.limitations)}${review.findings.map(f=>`<article class="callout">${record(f)}</article>`).join('')}`:'<p>Отдельный проверяющий не предоставил актуальную рецензию. Самооценка не подтверждает порог 85.</p>'}</section><section id="report-audit"><h2>Аудиты, ограничения и изменения</h2>${record(roadmap.report,reportLabels)}</section>`;
}
function shell(roadmap,title,body,{prefix='',current='',toc='',evaluation=null}={}) {
  const ordered=topological(roadmap.stages);
  return `<!doctype html><html lang="${roadmap.language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(title)} · ${escape(roadmap.title)}</title><script src="${prefix}assets/theme.js"></script><link rel="stylesheet" href="${prefix}assets/app.css"></head><body><a class="skip" href="#main">К содержанию</a><header class="topbar"><a class="brand" href="${prefix}index.html"><span class="brand-icon" aria-hidden="true">↗</span>${escape(roadmap.title)}</a><div class="top-actions"><button id="menu-toggle" aria-controls="sidebar" aria-expanded="false">Этапы</button><button id="search-open" aria-keyshortcuts="Control+k Meta+k /">Поиск <kbd>⌘ / Ctrl K</kbd></button><button id="theme-toggle" aria-label="Переключить тему">◐</button></div></header><div class="layout"><aside id="sidebar" class="sidebar"><nav aria-label="Основная навигация"><a href="${prefix}index.html">Карта</a><a href="${prefix}about.html">О программе</a><a href="${prefix}report.html">Детали отчёта</a></nav><div class="side-heading">Ваш маршрут <span id="progress-summary"></span></div><nav aria-label="Этапы">${ordered.map(s=>`<a class="stage-link ${s.status}" href="${prefix}stages/${s.id}.html" ${s.id===current?'aria-current="page"':''} data-nav-stage="${s.id}"><span class="status-dot"></span><span><small>${s.id} · ${hourText(s)}</small>${escape(s.title)}</span><span class="done-marker" aria-hidden="true"></span></a>`).join('')}</nav><div class="progress-tools"><button id="progress-export">Экспорт прогресса</button><label class="file-button">Импорт прогресса<input id="progress-import" type="file" accept="application/json" aria-label="Импорт прогресса"></label><p id="progress-message" role="status"></p></div></aside><main id="main" tabindex="-1">${effortNoticeMarkup(evaluation)}${body}</main>${toc?`<aside class="toc"><nav aria-label="Оглавление страницы">${toc}</nav></aside>`:''}</div><dialog id="search-dialog" aria-labelledby="search-title"><div class="dialog-head"><h2 id="search-title">Поиск по программе</h2><button id="search-close" aria-label="Закрыть поиск">Esc</button></div>${effortNoticeMarkup(evaluation)}<label for="search-input" class="sr-only">Этап, задание, источник или критерий DoD</label><input id="search-input" type="search" placeholder="Тема, задание, источник или ID…" autocomplete="off"><p id="search-count" role="status"></p><ul id="search-results"></ul></dialog><script src="${prefix}assets/data.js"></script><script src="${prefix}assets/app.js"></script></body></html>`;
}
export function searchIndex(roadmap) {
  const entries=[];
  const add=(title,text,url)=>entries.push({title,text,url});
  for(const s of roadmap.stages){
    const url=`stages/${s.id}.html`;
    add(`${s.id} · ${s.title}`,JSON.stringify(s),url);
    for(const x of [...s.steps,...s.practice,...s.dod]) add(`${x.id} · ${x.title||x.artifact}`,JSON.stringify(x),`${url}#${x.id}`);
  }
  roadmap.sources.forEach(s=>add(s.title,JSON.stringify(s),`report.html#${s.id}`));
  add('О программе',JSON.stringify(roadmap.about),'about.html');
  add('Детали отчёта',JSON.stringify(roadmap.report),'report.html');
  return entries;
}
export async function renderSite(directory,roadmap,inputs,review,evaluation) {
  await fs.mkdir(path.join(directory,'stages'),{recursive:true}); await fs.mkdir(path.join(directory,'assets'),{recursive:true});
  for(const file of ['app.css','app.js','theme.js']) await fs.copyFile(path.join(root,'assets',file),path.join(directory,'assets',file));
  const data={id:roadmap.id,stages:roadmap.stages.map(s=>({id:s.id,title:s.title,status:s.status,dependencies:s.dependencies,dodIds:s.dod.map(d=>d.id)})),index:searchIndex(roadmap)};
  await fs.writeFile(path.join(directory,'assets/data.js'),`window.ROADMAP=${JSON.stringify(data).replace(/</g,'\\u003c')};`);
  const total=roadmap.stages.filter(s=>s.status==='required').reduce((n,s)=>n+hoursTotal(s),0),reserve=roadmap.about.reserveHours;
  const home=`<div class="eyebrow">От цели к самостоятельной практике</div><h1>${escape(roadmap.title)}</h1><p class="lead">Последовательный маршрут с материалами, практикой и проверкой результата.</p><p class="notice">${escape(verdict(evaluation))}</p><div class="stats"><div><strong>${roadmap.stages.length}</strong>Этапов</div><div><strong>${total} ч</strong>Обязательная программа</div><div><strong>${reserve} ч</strong>Отдельный резерв</div><div><strong>${total+reserve} ч</strong>Обязательная программа с резервом</div><div><strong>${roadmap.stages.filter(s=>s.status==='required').length} / ${roadmap.stages.filter(s=>s.status==='recommended').length} / ${roadmap.stages.filter(s=>s.status==='optional').length}</strong>Обяз. / желат. / дополн.</div></div><section class="map-section" aria-labelledby="map-title"><div class="map-header"><div><h2 id="map-title">Карта обучения</h2><p>Выберите этап. Стрелки показывают обязательные предпосылки.</p></div><div class="map-controls"><button id="zoom-out" aria-label="Уменьшить карту">−</button><button id="zoom-in" aria-label="Увеличить карту">+</button><button id="zoom-fit">Вписать</button><button id="zoom-reset">Сбросить</button></div></div><div class="map-filters"><label>Подсветить статус <select id="status-filter"><option value="">Все</option><option value="required">Обязательные</option><option value="recommended">Желательные</option><option value="optional">Дополнительные</option></select></label><label>Найти на карте <input id="map-query" type="search" placeholder="Название этапа"></label></div><div class="legend">${['required','recommended','optional'].map(badge).join('')}<span>Синие стрелки — зависимости</span></div><div class="graph-viewport" tabindex="0" aria-label="Область карты. Прокрутка и масштабирование кнопками">${graph(roadmap)}</div><p class="map-help"><span id="map-scale" role="status">Масштаб 100%</span> · Перетаскивайте фон карты, используйте прокрутку; Ctrl + колесо или жест щипка меняют масштаб. Tab и Enter открывают этап.</p></section><section><h2>Этапы по порядку</h2><div class="stage-grid">${topological(roadmap.stages).map(s=>`<a class="stage-card ${s.status}" href="stages/${s.id}.html"><span class="eyebrow">${s.id} · ${hourText(s)}</span><h3>${escape(s.title)}</h3>${badge(s.status)}</a>`).join('')}</div></section>`;
  await fs.writeFile(path.join(directory,'index.html'),shell(roadmap,'Карта обучения',home,{evaluation}));
  await fs.writeFile(path.join(directory,'about.html'),shell(roadmap,'О программе',aboutContent(roadmap,inputs,evaluation,{includeEffortNotice:false}),{evaluation}));
  await fs.writeFile(path.join(directory,'report.html'),shell(roadmap,'Детали отчёта',reportContent(roadmap,inputs,review,evaluation,{includeEffortNotice:false}),{evaluation}));
  const ordered=topological(roadmap.stages);
  for(let i=0;i<ordered.length;i++){
    const s=ordered[i];
    const toc=blocks.map((b,j)=>`<a href="#${s.id}-b${j+1}">${j+1}. ${b}</a>${j===2?s.steps.map(x=>`<a class="toc-step" href="#${x.id}">${escape(x.title)}</a>`).join(''):''}`).join('');
    const nav=`<nav class="prev-next" aria-label="Порядок чтения">${i?`<a href="${ordered[i-1].id}.html">← Предыдущий этап</a>`:'<span></span>'}${i<ordered.length-1?`<a href="${ordered[i+1].id}.html">Следующий этап →</a>`:''}</nav><p class="muted">Порядок чтения не добавляет зависимостей: учитывайте предпосылки этапа.</p>`;
    await fs.writeFile(path.join(directory,'stages',`${s.id}.html`),shell(roadmap,s.title,`<nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="../index.html">Карта</a> / ${escape(s.id)}</nav>${stageContent(s,roadmap)}${nav}`,{prefix:'../',current:s.id,toc,evaluation}));
  }
}
export async function renderPrint(roadmap,inputs,review,evaluation){
  const css=await fs.readFile(path.join(root,'assets/app.css'),'utf8');
  const rewrite=html=>html.replace(/href="(?:stages\/)?([A-Za-z0-9_-]+)\.html(?:#([A-Za-z0-9_-]+))?"/g,(_all,id,anchor)=>`href="#${anchor||id}"`);
  return `<!doctype html><html lang="${roadmap.language}" data-theme="light"><head><meta charset="utf-8"><title>${escape(roadmap.title)}</title><style>${css}</style></head><body class="print-document"><main><section class="print-part">${rewrite(aboutContent(roadmap,inputs,evaluation))}</section><section class="print-part"><h1>Карта этапов</h1>${rewrite(graph(roadmap))}</section>${topological(roadmap.stages).map(s=>`<article class="print-part">${rewrite(stageContent(s,roadmap))}</article>`).join('')}<section class="print-part">${rewrite(reportContent(roadmap,inputs,review,evaluation))}</section></main></body></html>`;
}
