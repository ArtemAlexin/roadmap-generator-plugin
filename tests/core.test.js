import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fixture, reviewFixture } from './fixture.js';
import { validateRoadmap,evaluateReview,contentHash,topological } from '../src/validate.js';
import { nextQuestion, validateAnswer,deliveryFor,formatLabels,planningFor,planningInputs,questions } from '../src/questions.js';
import { Store } from '../src/store.js';
import { buildAndPersist } from '../src/server.js';
import { md,graphLayout,renderPrint,aboutContent,reportContent } from '../src/render.js';
import { canonical } from '../src/validate.js';
import { rubricWeights } from '../src/schema.js';

test('baseline fixture has consistent graph, times and cross references',()=>{
  const {roadmap}=fixture(),v=validateRoadmap(roadmap);
  assert.deepEqual(v.errors,[]);assert.deepEqual(v.blockers,[]);assert.equal(v.valid,true);
  assert.deepEqual(topological(roadmap.stages).map(s=>s.id),['M01','M02','M03','M04']);
});
test('invalid IDs, cycles, dangling references and duplicate IDs are rejected',()=>{
  for(const mutate of [r=>r.stages[0].id='../escape',r=>r.stages[0].dependencies=['M04'],r=>r.stages[1].dependencies=['missing'],r=>r.sources.push(structuredClone(r.sources[0])),r=>r.stages[0].practice[0].dodIds=['M04-D1']]){
    const {roadmap}=fixture();mutate(roadmap);assert.equal(validateRoadmap(roadmap).valid,false);
  }
});
test('content blockers cannot be compensated by high scores',()=>{
  for(const mutate of [r=>r.sources[0].access='paid-book',r=>r.sources[0].status='partial',r=>r.sources[0].verification.sufficient=false,r=>r.sources[0].verification.checkedFragments=[],r=>r.evidence=[],r=>r.stages[0].dod[0].transfer=false,r=>r.stages[0].practice[0].dodIds=[]]){
    const {roadmap,inputs}=fixture();mutate(roadmap);assert.ok(validateRoadmap(roadmap).blockers.length);assert.equal(evaluateReview(reviewFixture(roadmap,inputs),roadmap,inputs).passed,false);
  }
});
test('time is counted once and exact stage totals are enforced',()=>{
  const {roadmap}=fixture();roadmap.stages[0].hours.practice=2;assert.match(validateRoadmap(roadmap).errors.join(),/практики/);
});
test('rubric calculates 85; level four everywhere is 80; stale or self reviews cannot pass',()=>{
  const {roadmap,inputs}=fixture(),review=reviewFixture(roadmap,inputs);
  assert.equal(evaluateReview(review,roadmap,inputs).total,85);assert.equal(evaluateReview(review,roadmap,inputs).passed,true);
  Object.values(review.scores).forEach(s=>s.level=4);assert.equal(evaluateReview(review,roadmap,inputs).total,80);
  review.reviewer.independent=false;assert.equal(evaluateReview(review,roadmap,inputs).passed,false);
  review.reviewer.independent=true;roadmap.title='Changed';assert.ok(evaluateReview(review,roadmap,inputs).blockers.some(x=>x.includes('другой версии')));
});
test('reviewer calendar blocker guidance is explicit and the evaluator enforces declared blockers only',async()=>{
  const reviewGuide=await fs.readFile(new URL('../skills/roadmap/references/review.md',import.meta.url),'utf8');
  assert.match(reviewGuide,/активное неустранённое обещание.*личному сроку.*личному недельному графику/s);
  assert.match(reviewGuide,/внеси его в `review\.blockers`.*`findings` недостаточно/s);
  assert.match(reviewGuide,/историческую цитату.*дату события\/источника либо учебный интервал/s);

  const {roadmap,inputs}=fixture();
  roadmap.about.schedule='Этот маршрут можно завершить к 1 июня, занимаясь по 6 часов каждую неделю.';
  const review=reviewFixture(roadmap,inputs);
  review.findings=[{problem:'Активная привязка маршрута к личному графику',evidence:roadmap.about.schedule,
    impact:'Авторский текст обещает завершение к личному сроку.',correction:'Убрать или обосновать привязку.',status:'open'}];
  // The evaluator intentionally does not infer semantic blockers from prose; reviewer instructions require declaring one.
  assert.equal(evaluateReview(review,roadmap,inputs).passed,true);
  review.blockers.push('Неустранённое обещание пройти маршрут к личному сроку и по личному недельному графику.');
  const result=evaluateReview(review,roadmap,inputs);
  assert.equal(result.total,85);
  assert.equal(result.passed,false);
  assert.ok(result.blockers.some(blocker=>blocker.includes('личному сроку')));
});
test('effort-only rubric preserves non-calendar criteria, weights and pass thresholds',async()=>{
  const rubric=await fs.readFile(new URL('../skills/roadmap/references/rubric.md',import.meta.url),'utf8');
  const g2=rubric.match(/^Г2\..*(?:\r?\n• [543]:.*){3}/m)?.[0];
  assert.equal(g2,'Г2. Трудоёмкость согласована с материалами и практикой — вес 5.\n• 5: часы каждого этапа разложены на теорию, практику, проверку и повторение и сходятся с суммой времени шагов и заданий; объяснены основания оценки, существенные допущения и диапазон неопределённости; есть отдельный резерв на повторные попытки.\n• 4: расчёт согласован, но у 1–2 этапов недостаточно объяснены основания оценки или диапазон неопределённости. Отсутствие эмпирической калибровки само по себе не снижает уровень; реальные замеры, если они есть, служат дополнительным доказательством, а расчётные ориентиры явно обозначаются.\n• 3: суммы по этапам не сходятся с временем шагов и заданий более чем на 20%.');
  assert.deepEqual(rubricWeights,{A1:5,A2:10,A3:5,B1:10,B2:5,B3:10,V1:15,V2:10,V3:5,G1:5,G2:5,D1:10,D2:5});
  assert.match(rubric,/Уровень \| Доля веса \| Вес 5 \| Вес 10 \| Вес 15/);
  assert.match(rubric,/Итог = сумма баллов всех подкритериев А1–Д2 \(максимум каждого — его вес\)\./);
  assert.match(rubric,/Цель: ≥ 85\./);
  assert.match(rubric,/блок А–Д набрал меньше 60% своего максимума/);
  assert.match(rubric,/блок Б набрал меньше 70% своего максимума/);
  const rubricLines=rubric.split(/\r?\n/),criteriaStart=rubricLines.findIndex(line=>line.startsWith('А. Соответствие цели')),
    criteriaEnd=rubricLines.findIndex(line=>line.startsWith('4.2. Итог'));
  const nonG2=rubricLines.slice(criteriaStart,criteriaEnd),g2Start=nonG2.findIndex(line=>line.startsWith('Г2.'));
  let g2End=g2Start+1;while(g2End<nonG2.length&&nonG2[g2End].startsWith('• '))g2End++;
  nonG2.splice(g2Start,g2End-g2Start);
  const criterionText=nonG2.filter(line=>/^(?:[АБВГД]\. |[АБВГД]\d\. |• [0-5]:)/.test(line)).join('\n');
  assert.equal(createHash('sha256').update(criterionText).digest('hex'),'d1f206710b150af756be382c8f16275f0a36c28d7f6a3cfbc948d18e9e2dd89d',
    'non-G2 criterion wording should remain unchanged');
});
test('content hashes are stable by key order and change on source edits',()=>{
  const {roadmap,inputs}=fixture();const hash=contentHash(roadmap,inputs);
  assert.equal(hash,contentHash(Object.fromEntries(Object.entries(roadmap).reverse()),inputs));
  const oldHash=createHash('sha256').update(canonical({roadmap,inputs})).digest('hex');
  assert.notEqual(hash,oldHash);
  const legacyA={...inputs,scheduleMode:'weekly',hoursPerWeek:6,deadline:'2030-01-01'};
  const legacyB={...inputs,scheduleMode:'self-paced',hoursPerWeek:'malformed',deadline:'historical'};
  assert.equal(contentHash(roadmap,legacyA),contentHash(roadmap,legacyB));
  roadmap.sources[0].fragment='Other';assert.notEqual(hash,contentHash(roadmap,inputs));
});
test('intake asks one pending question, skips known goal and accepts custom answers',()=>{
  assert.equal(nextQuestion({goal:'Own goal'}).key,'level');
  assert.equal(validateAnswer('constraints','Мой собственный ответ'),'Мой собственный ответ');
  assert.throws(()=>validateAnswer('hoursPerWeek',2.5),/Неизвестное поле/);
  assert.throws(()=>validateAnswer('format','docx'));assert.throws(()=>validateAnswer('outputDirectory','relative'));
});
test('delivery options distinguish the interactive website ZIP from the PDF document',()=>{
  assert.equal(formatLabels.length,3);assert.match(formatLabels[0],/локальный сайт \(ZIP\)/);
  const site=deliveryFor('html');assert.equal(site.website.singleHtmlFile,false);assert.equal(site.pdf,undefined);
  const pdf=deliveryFor('pdf');assert.equal(pdf.website,undefined);assert.equal(pdf.pdf.file,'roadmap.pdf');
  const both=deliveryFor('both');assert.ok(both.website);assert.ok(both.pdf);assert.equal(deliveryFor('single-html'),null);
  assert.equal(validateAnswer('format',formatLabels[0]),'html');assert.equal(validateAnswer('format',formatLabels[2]),'both');
});
test('intake is exactly six active fields and planning ignores only the three retired keys',()=>{
  assert.deepEqual(questions.map(q=>q.key),['goal','level','constraints','priorities','format','outputDirectory']);
  assert.equal(questions.filter(q=>q.choices).length,1);assert.equal(questions.find(q=>q.choices)?.key,'format');
  assert.equal(nextQuestion({goal:'g',level:'l'}).key,'constraints');
  const {inputs}=fixture(),legacy={...inputs,scheduleMode:'weekly',hoursPerWeek:6,deadline:'2030-01-01'};
  assert.deepEqual(planningInputs(legacy),inputs);assert.equal(planningFor(legacy).mode,'effort-only');assert.equal(planningFor(legacy).calendarBound,false);
  assert.equal(planningFor(legacy).hoursPerWeek,undefined);assert.match(planningFor(legacy).instruction,/резерв отдельно/);
  for(const key of ['scheduleMode','hoursPerWeek','deadline'])assert.throws(()=>validateAnswer(key,'legacy'),/Неизвестное поле/);
});
test('effort summaries show required hours plus reserve without a derived schedule',async()=>{
  const {roadmap,inputs}=fixture();
  roadmap.about.schedule='Изучайте этапы в порядке зависимостей; переходите после выполнения DoD.';
  const about=aboutContent(roadmap,inputs,null);assert.match(about,/12 ч/);assert.match(about,/2 ч/);assert.match(about,/14 ч/);
  assert.match(about,/Порядок прохождения/);assert.match(about,/приблизительная трудоёмкость/);assert.match(about,/Авторский текст не подтверждён/);
  assert.doesNotMatch(about,/Расчётный минимум|График по неделям|Свободный график|В неделю|NaN|Infinity|undefined/);
  const print=await renderPrint(roadmap,inputs,null,null);assert.doesNotMatch(print,/Расчётный минимум|В неделю|NaN|Infinity|undefined/);
});
test('legacy prose and raw fields remain intact while new report excludes retired values',async()=>{
  const {roadmap,inputs}=fixture(),legacy={...inputs,scheduleMode:'weekly',hoursPerWeek:9876,deadline:'LEGACY-DEADLINE-SENTINEL'};
  const phrase='Недели 1–2: историческая фраза';roadmap.about.schedule=phrase;
  const report=reportContent(roadmap,legacy,null,null);
  assert.equal(roadmap.about.schedule,phrase);
  assert.match(report,/Действующие входные данные/);assert.match(report,/Исторические поля графика сохранены/);
  assert.doesNotMatch(report,/LEGACY-DEADLINE-SENTINEL|9876/);
  const print=await renderPrint(roadmap,legacy,null,null);
  assert.ok(print.includes(phrase));assert.ok(print.includes('старые календарные формулировки могут сохраниться'));
  assert.ok(print.includes('LEGACY-DEADLINE-SENTINEL')===false);
});
test('synthetic legacy state reads without writes, preserves raw/history, and rejects old review requests',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'roadmap-legacy-read-test-'));
  try{
    const store=new Store(dir),{inputs,roadmap}=fixture(dir),created=await store.create(inputs),file=store.file(created.sessionId);
    const state=JSON.parse(await fs.readFile(file,'utf8'));
    state.roadmap=roadmap;
    state.answers.scheduleMode='weekly';state.answers.hoursPerWeek='malformed legacy value';state.answers.deadline='LEGACY-DEADLINE';
    state.review={contentHash:createHash('sha256').update(canonical({roadmap:state.roadmap,inputs:state.answers})).digest('hex'),marker:'old review'};
    state.reviewHistory=[{marker:'historical review'}];state.reviewRequests=[{token:'old-token',hash:state.review.contentHash,used:false}];
    await fs.writeFile(file,JSON.stringify(state));const bytesBefore=await fs.readFile(file,'utf8');
    const summary=await store.get(created.sessionId);assert.equal(summary.planning.mode,'effort-only');assert.equal(summary.reviewCurrent,false);
    assert.equal(await fs.readFile(file,'utf8'),bytesBefore);
    await assert.rejects(store.submitReview(created.sessionId,'old-token',{}),/устарел/);
    const afterRejected=JSON.parse(await fs.readFile(file,'utf8'));
    assert.equal(afterRejected.answers.hoursPerWeek,'malformed legacy value');assert.deepEqual(afterRejected.reviewHistory,state.reviewHistory);
    assert.deepEqual(afterRejected.review,state.review);assert.deepEqual(afterRejected.reviewRequests,state.reviewRequests);
    await store.answer(created.sessionId,'level','Updated synthetic level');
    const afterMutation=JSON.parse(await fs.readFile(file,'utf8'));
    assert.equal(afterMutation.answers.deadline,'LEGACY-DEADLINE');assert.equal(afterMutation.answers.hoursPerWeek,'malformed legacy value');
    assert.deepEqual(afterMutation.reviewHistory,state.reviewHistory);
    const packetResult=await store.prepareReview(created.sessionId),packet=JSON.parse(await fs.readFile(packetResult.packetFile,'utf8'));
    assert.equal(packet.planning.mode,'effort-only');assert.equal(packet.inputs.hoursPerWeek,undefined);assert.equal(packet.inputs.deadline,undefined);
    assert.equal(JSON.stringify(packet).includes('LEGACY-DEADLINE'),false);
    await fs.rm(packetResult.packetFile,{force:true});
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('synthetic existing export bytes and build history remain unchanged except an append-only build record',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'roadmap-append-build-test-'));
  try{
    const store=new Store(dir),created=await store.create(fixture(dir).inputs),file=store.file(created.sessionId);
    const oldBuilds=[{id:'old-1',marker:'synthetic history'},{id:'old-2',marker:'also synthetic'}];
    const state=JSON.parse(await fs.readFile(file,'utf8'));state.builds=structuredClone(oldBuilds);await fs.writeFile(file,JSON.stringify(state));
    const oldExport=path.join(dir,'old-export.bin'),bytes=Buffer.from([0,1,2,255,10]);await fs.writeFile(oldExport,bytes);
    const result={buildId:'new-build',outputDirectory:path.join(dir,'new-output')};
    await buildAndPersist(store,created.sessionId,async()=>result);
    const saved=JSON.parse(await fs.readFile(file,'utf8'));
    assert.deepEqual(saved.builds.slice(0,oldBuilds.length),oldBuilds);assert.equal(saved.builds.length,oldBuilds.length+1);
    assert.deepEqual(await fs.readFile(oldExport),bytes);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('persistent sessions serialize updates, resume and sanitize reviewer packets',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'roadmap-store-test-'));
  try{
    const store=new Store(dir),{inputs,roadmap}=fixture();const start=await store.create(inputs),id=start.sessionId;
    await store.mutate(id,s=>{s.roadmap=roadmap;s.authorId='fixture-author';s.roadmap.report.authorSelfAssessment='SECRET SELF SCORE';s.roadmap.report.changes=['SECRET HISTORY'];});
    await Promise.all([store.answer(id,'level','new level'),store.answer(id,'constraints','new constraints')]);
    assert.equal((await new Store(dir).load(id)).answers.level,'new level');
    const packet=await store.prepareReview(id),text=await fs.readFile(packet.packetFile,'utf8');
    assert.ok(text.includes('Проход A'));
    assert.ok(text.includes('Полная редактура roadmap'));
    assert.ok(!text.includes('SECRET SELF SCORE'));assert.ok(!text.includes('SECRET HISTORY'));
    const state=await store.load(id),review=reviewFixture(state.roadmap,state.answers);
    const bad=structuredClone(review);bad.reviewer.identity='fixture-author';
    await assert.rejects(store.submitReview(id,packet.reviewRequestId,bad),/Автор/);
    await store.submitReview(id,packet.reviewRequestId,review);
    await assert.rejects(store.submitReview(id,packet.reviewRequestId,review),/использован/);
    await store.put(id,'title','Updated title','fixture-author');assert.equal((await store.get(id)).reviewCurrent,false);
    const stalePacket=await store.prepareReview(id),before=(await store.get(id,'about')).summary;
    await store.put(id,'about',{...await store.get(id,'about'),summary:`${before}.`},'fixture-author');
    const staleState=await store.load(id);
    await assert.rejects(store.submitReview(id,stalePacket.reviewRequestId,reviewFixture(staleState.roadmap,staleState.answers)),/устарел/);
    await assert.rejects(store.load('../escape'),/Недопустимый/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('renderer preserves observed source spacing and formatting without rewriting source text',()=>{
  const observed='Через7 и30 дней по2ч: без отчёта восстановить решение, затем изменить одно условие, проверить и обновить backlog. Часы включены.';
  const expected='Через 7 и 30 дней по 2 ч: без отчёта восстановить решение, затем изменить одно условие, проверить и обновить backlog. Часы включены.';
  for(const value of [observed,expected,'Через **7** и `30` дней по 2 ч.']){
    const output=md(value);
    assert.equal(output.replace(/<[^>]*>/g,'').trim(),value.replaceAll('**','').replaceAll('`',''));
  }
});
test('Markdown removes script, event attributes, JS URLs and embedded network media',()=>{
  const output=md('<script>alert(1)</script><img src="https://bad.test/pixel" onerror="alert(1)"><a href="javascript:alert(1)">bad</a>\n\n[good](https://example.org)');
  assert.ok(!output.includes('<script'));assert.ok(!output.includes('onerror'));assert.ok(!output.includes('javascript:'));assert.ok(!output.includes('<img'));assert.ok(output.includes('noopener noreferrer'));
});
test('branch graph has no overlapping nodes and preserves prerequisite ordering',()=>{
  const {roadmap}=fixture(),{positions}=graphLayout(roadmap.stages),p=[...positions.values()];
  for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++)assert.ok(p[i].x+p[i].w<=p[j].x||p[j].x+p[j].w<=p[i].x||p[i].y+p[i].h<=p[j].y||p[j].y+p[j].h<=p[i].y);
  for(const s of roadmap.stages)for(const dep of s.dependencies)assert.ok(positions.get(dep).y<positions.get(s.id).y);
});
test('print output contains full practice and report, with internal stage links',async()=>{
  const {roadmap,inputs}=fixture(),html=await renderPrint(roadmap,inputs,null,null);
  assert.ok(html.includes('Исходные данные и стартовые условия'));assert.ok(html.includes('Реестр доказательств'));assert.ok(html.includes('Предварительная программа'));
  assert.ok(html.includes('href="#M02"'));assert.ok(!html.includes('href="stages/'));assert.equal((html.match(/class="stage-block"/g)||[]).length,28);
});
