import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const taskDirectory=fileURLToPath(new URL('../.opencode/plans/roadmap-quality/',import.meta.url));
const readCase=async()=>JSON.parse(await fs.readFile(path.join(taskDirectory,'editorial-manual-case.json'),'utf8'));
const protectedProjection=caseData=>({
  userGoal:caseData.input.goal,title:caseData.before.title,url:caseData.before.sources[0].url,
  sourceTitle:caseData.before.sources[0].title,sourceFragment:caseData.before.sources[0].fragment,
  allInputs:caseData.input,practiceInput:caseData.before.stages[0].practice[0].inputs,
  ids:{roadmap:caseData.before.id,stage:caseData.before.stages[0].id,step:caseData.before.stages[0].steps[0].id,practice:caseData.before.stages[0].practice[0].id,dod:caseData.before.stages[0].dod[0].id,source:caseData.before.sources[0].id},
  numbers:{hours:caseData.before.stages[0].hours,stepHours:caseData.before.stages[0].steps[0].hours,practiceHours:caseData.before.stages[0].practice[0].hours,dodThreshold:caseData.before.stages[0].dod[0].threshold,aboutReserve:caseData.before.about.reserveHours,sourceStudy:caseData.before.sources[0].studyHours},
});
const sections=roadmap=>['about','competences','scenarios','sources','stages','evidence','coverage','report'].every(key=>roadmap[key]&&(!Array.isArray(roadmap[key])||roadmap[key].length>0));

test('manual editorial evidence artifact captures before, A, B, truthfulness and protected-value comparison',async()=>{
  const record=await readCase();
  assert.match(record.case,/Manual synthetic editorial example/);
  for(const stage of [record.before,record.passA,record.passB])assert.ok(sections(stage),'snapshot contains every top-level roadmap section');
  assert.equal(record.before.stages.length,1,'the evidence case is deliberately small');

  assert.notEqual(record.passA.stages[0].purpose,record.before.stages[0].purpose);
  assert.notEqual(record.passA.stages[0].steps[0].explanation,record.before.stages[0].steps[0].explanation);
  assert.notEqual(record.passA.stages[0].practice[0].actions,record.before.stages[0].practice[0].actions);
  assert.equal(record.passA.sources[0].status,'description-only');
  assert.equal(record.passA.sources[0].verification.sufficient,false);
  assert.deepEqual(record.passA.sources[0].verification.checkedFragments,[]);
  assert.equal(record.passA.evidence[0].status,'unconfirmed');
  assert.equal(record.passA.coverage[0].status,'structural');
  assert.match(record.passA.report.limitations,/не проверялись.*preliminary/i);

  assert.match(record.passA.stages[0].practice[0].pitfalls,/виду, проверьте/);
  assert.match(record.passB.stages[0].practice[0].pitfalls,/виду; проверьте/);
  assert.ok(record.passB.about.instructions.endsWith('качества.'));
  assert.deepEqual(protectedProjection(record),record.protectedValues);
  for(const snapshot of [record.passA,record.passB]){
    assert.equal(snapshot.title,record.protectedValues.title);
    assert.equal(snapshot.sources[0].url,record.protectedValues.url);
    assert.equal(snapshot.sources[0].fragment,record.protectedValues.sourceFragment);
    assert.deepEqual({userGoal:record.input.goal,title:snapshot.title,url:snapshot.sources[0].url,sourceTitle:snapshot.sources[0].title,sourceFragment:snapshot.sources[0].fragment,allInputs:record.input,practiceInput:snapshot.stages[0].practice[0].inputs,
      sourceTitle:snapshot.sources[0].title,
      ids:{roadmap:snapshot.id,stage:snapshot.stages[0].id,step:snapshot.stages[0].steps[0].id,practice:snapshot.stages[0].practice[0].id,dod:snapshot.stages[0].dod[0].id,source:snapshot.sources[0].id},
      numbers:{hours:snapshot.stages[0].hours,stepHours:snapshot.stages[0].steps[0].hours,practiceHours:snapshot.stages[0].practice[0].hours,dodThreshold:snapshot.stages[0].dod[0].threshold,aboutReserve:snapshot.about.reserveHours,sourceStudy:snapshot.sources[0].studyHours}},record.protectedValues);
  }

  const evidence=await fs.readFile(path.join(taskDirectory,'editorial-manual-evidence.md'),'utf8');
  assert.match(evidence,/manually rewrote.*not an auto-test/i);
  assert.match(evidence,/manually read in both passes/);
  assert.match(evidence,/practice\[M01-P1\]\.pitfalls/);
});
