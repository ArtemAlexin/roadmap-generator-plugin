import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixture, reviewFixture } from './fixture.js';
import { validateRoadmap,evaluateReview,contentHash,topological } from '../src/validate.js';
import { nextQuestion, validateAnswer } from '../src/questions.js';
import { Store } from '../src/store.js';
import { md,graphLayout,renderPrint } from '../src/render.js';

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
test('content hashes are stable by key order and change on source edits',()=>{
  const {roadmap,inputs}=fixture();const hash=contentHash(roadmap,inputs);
  assert.equal(hash,contentHash(Object.fromEntries(Object.entries(roadmap).reverse()),inputs));
  roadmap.sources[0].fragment='Other';assert.notEqual(hash,contentHash(roadmap,inputs));
});
test('intake asks one pending question, skips known goal and accepts custom answers',()=>{
  assert.equal(nextQuestion({goal:'Own goal'}).key,'level');
  assert.equal(validateAnswer('constraints','Мой собственный ответ'),'Мой собственный ответ');
  assert.equal(validateAnswer('hoursPerWeek','2,5'),2.5);
  assert.throws(()=>validateAnswer('hoursPerWeek',0));assert.throws(()=>validateAnswer('format','docx'));assert.throws(()=>validateAnswer('outputDirectory','relative'));
});
test('persistent sessions serialize updates, resume and sanitize reviewer packets',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'roadmap-store-test-'));
  try{
    const store=new Store(dir),{inputs,roadmap}=fixture();const start=await store.create(inputs),id=start.sessionId;
    await store.mutate(id,s=>{s.roadmap=roadmap;s.authorId='fixture-author';s.roadmap.report.authorSelfAssessment='SECRET SELF SCORE';s.roadmap.report.changes=['SECRET HISTORY'];});
    await Promise.all([store.answer(id,'level','new level'),store.answer(id,'constraints','new constraints')]);
    assert.equal((await new Store(dir).load(id)).answers.level,'new level');
    const packet=await store.prepareReview(id),text=await fs.readFile(packet.packetFile,'utf8');
    assert.ok(!text.includes('SECRET SELF SCORE'));assert.ok(!text.includes('SECRET HISTORY'));
    const state=await store.load(id),review=reviewFixture(state.roadmap,state.answers);
    const bad=structuredClone(review);bad.reviewer.identity='fixture-author';
    await assert.rejects(store.submitReview(id,packet.reviewRequestId,bad),/Автор/);
    await store.submitReview(id,packet.reviewRequestId,review);
    await assert.rejects(store.submitReview(id,packet.reviewRequestId,review),/использован/);
    await store.put(id,'title','Updated title','fixture-author');assert.equal((await store.get(id)).reviewCurrent,false);
    await assert.rejects(store.load('../escape'),/Недопустимый/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
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
