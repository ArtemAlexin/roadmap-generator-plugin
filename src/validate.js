import Ajv from 'ajv';
import { createHash } from 'node:crypto';
import { roadmapSchema, reviewSchema, rubricWeights } from './schema.js';
const ajv = new Ajv({ allErrors: true, strict: true });
const structural = ajv.compile(roadmapSchema);
const reviewShape = ajv.compile(reviewSchema);
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function contentHash(roadmap, inputs) { return createHash('sha256').update(canonical({ roadmap, inputs })).digest('hex'); }
export function topological(stages) {
  const byId = new Map(stages.map(s => [s.id, s]));
  const done = new Set(), active = new Set(), order = [];
  function visit(s) {
    if (done.has(s.id)) return;
    if (active.has(s.id)) throw new Error(`Цикл зависимостей: ${s.id}`);
    active.add(s.id);
    for (const dep of s.dependencies) {
      if (!byId.has(dep)) throw new Error(`Неизвестная зависимость ${dep} у ${s.id}`);
      visit(byId.get(dep));
    }
    active.delete(s.id); done.add(s.id); order.push(s);
  }
  stages.forEach(visit); return order;
}
const close = (a, b) => Math.abs(a - b) < 0.011;
export function validateRoadmap(data) {
  const errors = [], blockers = [], warnings = [];
  if (!structural(data)) return { valid: false, errors: structural.errors.map(e => `${e.instancePath || '/'} ${e.message}`), blockers, warnings };
  const all = new Map();
  const add = (o, kind) => { if (all.has(o.id)) errors.push(`Повтор ID: ${o.id}`); all.set(o.id, { ...o, _kind: kind }); };
  for (const [key, kind] of [['competences','competence'],['scenarios','scenario'],['sources','source'],['evidence','evidence'],['stages','stage']]) data[key].forEach(x => add(x, kind));
  data.stages.forEach(s => ['steps','practice','dod'].forEach(k => s[k].forEach(x => add(x, k))));
  const refs = (ids, kind, where) => ids.forEach(id => { if (all.get(id)?._kind !== kind) errors.push(`${where}: неизвестный ${kind} ${id}`); });
  const stages = new Map(data.stages.map(s => [s.id, s]));
  const sources = new Map(data.sources.map(s => [s.id, s]));
  try { topological(data.stages); } catch (e) { errors.push(e.message); }
  const finals = data.stages.filter(s => s.kind === 'final');
  if (finals.length !== 1 || finals[0]?.status !== 'required') errors.push('Нужен ровно один обязательный итоговый этап.');
  for (const c of data.competences) {
    refs(c.prerequisites, 'competence', c.id);
    if (c.required && !data.coverage.some(r => r.competenceId === c.id && stages.get(r.stageId)?.status === 'required')) blockers.push(`${c.id}: нет обязательного этапа покрытия.`);
    if (c.required && !data.scenarios.some(s => s.inScope && s.competenceIds.includes(c.id))) warnings.push(`${c.id}: обоснуйте компетенцию без сценария.`);
  }
  for (const sc of data.scenarios) {
    refs(sc.competenceIds,'competence',sc.id); refs(sc.practiceIds,'practice',sc.id); refs(sc.dodIds,'dod',sc.id);
    if (sc.inScope && (!sc.competenceIds.length || !sc.practiceIds.length || !sc.dodIds.length)) blockers.push(`${sc.id}: сценарий не обеспечен компетенциями, практикой и DoD.`);
  }
  for (const s of data.stages) {
    const required = s.status === 'required';
    refs(s.competenceIds, 'competence', s.id); refs(s.parallelWith, 'stage', s.id);
    if (new Set(s.dependencies).size !== s.dependencies.length) errors.push(`${s.id}: повтор зависимости.`);
    if (required && s.dependencies.some(id => stages.get(id)?.status !== 'required')) errors.push(`${s.id}: обязательный этап зависит от необязательного.`);
    if (s.dependencies.some(id => stages.get(id)?.kind === 'final')) errors.push(`${s.id}: итоговый этап должен быть завершающим.`);
    if (!s.steps.length || !s.practice.length || !s.dod.length) blockers.push(`${s.id}: отсутствуют шаги, практика или DoD.`);
    if (required && !s.dod.some(d => d.transfer)) blockers.push(`${s.id}: нет критерия переноса.`);
    if ((s.steps.length > 8 || s.practice.length > 4) && s.sizeJustification === '—') warnings.push(`${s.id}: обоснуйте размер этапа.`);
    if (!close(s.hours.theory, s.steps.reduce((n,x) => n+x.hours, 0))) errors.push(`${s.id}: время учебных шагов не совпадает с theory.`);
    if (!close(s.hours.practice, s.practice.reduce((n,x) => n+x.hours, 0))) errors.push(`${s.id}: время практики не сходится.`);
    if (!close(s.hours.assessment,s.assessmentHours) || !close(s.hours.repetition,s.repetitionHours)) errors.push(`${s.id}: время проверки/повторения не сходится.`);
    const used = [];
    for (const step of s.steps) {
      step.practiceIds.forEach(id => { if (!s.practice.some(p => p.id === id)) errors.push(`${step.id}: задание ${id} вне этапа.`); });
      step.dodIds.forEach(id => { if (!s.dod.some(d => d.id === id)) errors.push(`${step.id}: DoD ${id} вне этапа.`); });
      let sufficient = false;
      for (const m of step.materials) {
        const src = sources.get(m.sourceId);
        if (!src) { errors.push(`${step.id}: неизвестный источник ${m.sourceId}`); continue; }
        if (m.role !== 'main') continue;
        used.push(src);
        const covered = src.verification.checkedFragments.includes(m.fragment);
        const ev = data.evidence.some(e => e.requirementId === step.id && e.sourceId === src.id && e.fragment === m.fragment && e.status === 'verified');
        const good = src.access !== 'paid-book' && src.status === 'verified' && src.verification.sufficient && covered && ev;
        sufficient ||= good;
        if (required && !good) blockers.push(`${step.id}: обязательный материал ${src.id} не подтверждён (доступ, фрагмент, достаточность или доказательство).`);
      }
      if (required && !sufficient) blockers.push(`${step.id}: нет подтверждённого основного материала.`);
    }
    if (required && !used.some(src => src.functions.includes('theory'))) blockers.push(`${s.id}: нет теоретического источника.`);
    if (required && !used.some(src => src.functions.includes('practice'))) blockers.push(`${s.id}: нет внешнего источника практики.`);
    for (const p of s.practice) {
      if (!p.dodIds.length) blockers.push(`${p.id}: нет связи с DoD.`);
      p.dodIds.forEach(id => { if (!s.dod.some(d => d.id === id)) errors.push(`${p.id}: DoD ${id} вне этапа.`); });
    }
    for (const d of s.dod) {
      if (!d.recovery.stepIds.length) blockers.push(`${d.id}: нет шага для восстановления.`);
      d.recovery.stepIds.forEach(id => { if (!s.steps.some(x => x.id === id)) errors.push(`${d.id}: шаг восстановления ${id} вне этапа.`); });
      if (!s.practice.some(p => p.dodIds.includes(d.id))) blockers.push(`${d.id}: DoD не обеспечен практикой.`);
    }
  }
  for (const row of data.coverage) {
    refs([row.competenceId],'competence','coverage'); refs([row.stageId],'stage','coverage');
    refs(row.stepIds,'steps','coverage'); refs(row.practiceIds,'practice','coverage'); refs(row.dodIds,'dod','coverage'); refs(row.sourceIds,'source','coverage');
    const s = stages.get(row.stageId);
    if (s && (!s.competenceIds.includes(row.competenceId) || row.stepIds.some(id => !s.steps.some(x => x.id === id)) || row.practiceIds.some(id => !s.practice.some(x => x.id === id)) || row.dodIds.some(id => !s.dod.some(x => x.id === id)))) errors.push(`coverage ${row.competenceId}: связи вне указанного этапа.`);
    if (all.get(row.competenceId)?.required && (!row.stepIds.length || !row.practiceIds.length || !row.dodIds.length || !row.sourceIds.length || row.status !== 'verified')) blockers.push(`coverage ${row.competenceId}: неполное подтверждение покрытия.`);
  }
  for (const e of data.evidence) {
    refs([e.sourceId],'source',e.id);
    if (!all.has(e.requirementId)) errors.push(`${e.id}: неизвестное требование.`);
  }
  if (finals.length === 1) {
    const ancestors = new Set();
    const visit = id => { if (ancestors.has(id)) return; ancestors.add(id); stages.get(id)?.dependencies.forEach(visit); };
    visit(finals[0].id);
    for (const s of data.stages.filter(s => s.status === 'required')) if (!ancestors.has(s.id)) blockers.push(`${s.id}: не включён в зависимости итоговой проверки.`);
  }
  return { valid: errors.length === 0, errors, blockers: [...new Set(blockers)], warnings };
}
export function evaluateReview(review, roadmap, inputs) {
  if (!reviewShape(review)) throw new Error(`Некорректная рецензия: ${ajv.errorsText(reviewShape.errors)}`);
  const validation = validateRoadmap(roadmap);
  const blockers = [...validation.errors, ...validation.blockers, ...review.blockers];
  if (review.contentHash !== contentHash(roadmap, inputs)) blockers.push('Рецензия относится к другой версии программы.');
  if (!review.reviewer.independent) blockers.push('Независимая проверка не проводилась.');
  const scores = Object.entries(rubricWeights).map(([id,weight]) => ({ id, weight, level: review.scores[id].level, points: weight*review.scores[id].level/5 }));
  const blocks = {};
  for (const s of scores) blocks[s.id[0]] = (blocks[s.id[0]] || 0) + s.points;
  for (const [block,max] of Object.entries({ A:20, B:25, V:30, G:10, D:15 })) if (blocks[block] < max*(block === 'B' ? 0.7 : 0.6)) blockers.push(`Блок ${block} ниже минимума.`);
  const sample = new Set(review.sampledStageIds);
  const required = roadmap.stages.filter(s => s.status === 'required');
  for (const id of sample) if (!roadmap.stages.some(s=>s.id===id)) blockers.push(`Неизвестный этап в выборке: ${id}`);
  for (const id of review.reopenedSourceIds) if (!roadmap.sources.some(s=>s.id===id)) blockers.push(`Неизвестный источник в перепроверке: ${id}`);
  if (required.some(s=>!sample.has(s.id)) && ['A1','A2','A3','V1','V2','V3','G1','G2','D1','D2'].some(id=>review.scores[id].level===5)) blockers.push('Уровень 5 для свойства всей программы требует содержательной проверки всех обязательных этапов.');
  if (required.length <= 8 ? required.some(s => !sample.has(s.id)) : required.filter(s=>sample.has(s.id)).length < 8) blockers.push('Недостаточный охват рецензирования этапов.');
  if (!required.filter(s => s.kind === 'final').every(s => sample.has(s.id))) blockers.push('Итоговый этап не проверен.');
  const uniqueUrls = new Set(roadmap.stages.filter(s=>s.status==='required').flatMap(s=>s.steps.flatMap(x=>x.materials.filter(m=>m.role==='main').map(m=>roadmap.sources.find(src=>src.id===m.sourceId)?.url))).filter(Boolean));
  const reopenedUrls = new Set(review.reopenedSourceIds.map(id=>roadmap.sources.find(s=>s.id===id)?.url).filter(Boolean));
  if (reopenedUrls.size < Math.min(10, uniqueUrls.size)) blockers.push('Недостаточно независимо перепроверенных ссылок.');
  const total = scores.reduce((n,s) => n+s.points,0);
  return { total, scores, blocks, blockers: [...new Set(blockers)], passed: total >= 85 && blockers.length === 0 };
}
