import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { readJson, writeJson, safeId } from './files.js';
import { nextQuestion, validateAnswer, deliveryFor } from './questions.js';
import { contentHash, validateRoadmap, evaluateReview } from './validate.js';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function defaultDataDirectory() {
  if (process.env.ROADMAP_DATA_DIR) return process.env.ROADMAP_DATA_DIR;
  const pluginData=process.env.PLUGIN_DATA||process.env.CLAUDE_PLUGIN_DATA;
  if (pluginData) return path.join(pluginData,'roadmap-state');
  return path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'roadmap-generator','state');
}
export class Store {
  constructor(directory) { this.directory = path.resolve(directory); this.pending = new Map(); }
  file(id) { return path.join(this.directory, `${safeId(id)}.json`); }
  async load(id) { return readJson(this.file(id)); }
  async mutate(id, fn) {
    const previous = this.pending.get(id) ?? Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      const state = await this.load(id); const result = await fn(state);
      state.updatedAt = new Date().toISOString(); await writeJson(this.file(id), state); return result;
    });
    this.pending.set(id, task);
    try { return await task; } finally { if (this.pending.get(id) === task) this.pending.delete(id); }
  }
  async create(seed = {}) {
    const answers = {};
    for (const [key,value] of Object.entries(seed)) answers[key] = validateAnswer(key,value);
    const id = randomUUID();
    const state = { id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), answers,
      roadmap: { schemaVersion:'1.0', id:`R-${id}`, title:'', language:'ru', competences:[], scenarios:[], sources:[], stages:[], evidence:[], coverage:[] },
      review: null, reviewHistory: [], authorId: null, reviewRequests: [], builds: [] };
    await writeJson(this.file(id), state);
    return this.summary(state);
  }
  summary(state) {
    return { sessionId: state.id, authorId:state.authorId, nextQuestion: nextQuestion(state.answers), inputComplete: !nextQuestion(state.answers),
      answers: state.answers, stageCount: state.roadmap.stages.length, sourceCount: state.roadmap.sources.length,
      reviewCurrent: state.review?.contentHash === contentHash(state.roadmap,state.answers), builds: state.builds,
      delivery:deliveryFor(state.answers.format),
      nextAction:nextQuestion(state.answers)?{type:'call_tool',tool:'roadmap_question',arguments:{sessionId:state.id},
        instruction:'Continue interactive intake through roadmap_question. Do not ask the displayed nextQuestion as plain chat when interactive input is available; use native MCP forms or the host question UI for EVERY question.'}:null };
  }
  async answer(id, key, value) {
    return this.mutate(id, state => {
      // Changing output preferences is allowed but invalidates the review conservatively.
      state.answers[key] = validateAnswer(key,value); return this.summary(state);
    });
  }
  async put(id, section, value, authorId) {
    const singles = ['title','language','about','report'];
    const lists = ['competences','scenarios','sources','stages','evidence'];
    if (![...singles,...lists,'coverage'].includes(section)) throw new Error('Неизвестный раздел.');
    return this.mutate(id, state => {
      if (nextQuestion(state.answers)) throw new Error('Сначала завершите ввод исходных данных.');
      if (state.authorId && state.authorId !== authorId) throw new Error('Автор сессии уже установлен.');
      state.authorId = authorId;
      if (lists.includes(section)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Передайте один объект с ID.');
        safeId(value.id);
        const i = state.roadmap[section].findIndex(x => x.id === value.id);
        if (i < 0) state.roadmap[section].push(value); else state.roadmap[section][i] = value;
      } else state.roadmap[section] = value;
      return { section, saved: true, contentHash: contentHash(state.roadmap,state.answers), reviewCurrent: state.review?.contentHash === contentHash(state.roadmap,state.answers) };
    });
  }
  async remove(id, section, itemId) {
    if (!['competences','scenarios','sources','stages','evidence'].includes(section)) throw new Error('Раздел не поддерживает удаление по ID.');
    return this.mutate(id, s => { s.roadmap[section] = s.roadmap[section].filter(x => x.id !== itemId); return { removed:itemId }; });
  }
  async get(id, section, itemId) {
    const state = await this.load(id);
    if (!section) return this.summary(state);
    if (section === 'review') return state.review;
    if (section === 'all') return state.roadmap;
    if (!Object.hasOwn(state.roadmap,section)) throw new Error('Неизвестный раздел.');
    return itemId ? state.roadmap[section].find(x => x.id === itemId) ?? null : state.roadmap[section];
  }
  async prepareReview(id) {
    return this.mutate(id, async state => {
      if (state.reviewHistory.length + (state.review ? 1 : 0) >= 4) throw new Error('Достигнут предел: первая оценка и три цикла доработки. Выдайте лучшую версию с ограничениями.');
      const validation = validateRoadmap(state.roadmap);
      if (!validation.valid) throw new Error(`Исправьте структуру: ${validation.errors.join('; ')}`);
      const roadmap = structuredClone(state.roadmap);
      delete roadmap.report.changes; delete roadmap.report.authorSelfAssessment;
      const token = randomUUID();
      const packet = { reviewRequestId:token, contentHash:contentHash(state.roadmap,state.answers),
        inputs:state.answers, roadmap,
        instructions: await fs.readFile(path.join(root,'skills/roadmap/references/review.md'),'utf8'),
        rubric: await fs.readFile(path.join(root,'skills/roadmap/references/rubric.md'),'utf8'),
        sources: await fs.readFile(path.join(root,'skills/roadmap/references/sources.md'),'utf8'),
        curriculum: await fs.readFile(path.join(root,'skills/roadmap/references/curriculum.md'),'utf8'),
        reviewSchema: 'Read roadmap_schema section=review. Return review plus this reviewRequestId. Use a fresh context; do not read session history.' };
      state.reviewRequests.push({ token, hash:packet.contentHash, used:false });
      const packetFile = path.join(this.directory,`${id}-review-${token}.json`);
      await writeJson(packetFile, packet);
      return { packetFile, reviewRequestId:token, contentHash:packet.contentHash, validation,
        instruction:'Передайте файл отдельному проверяющему в чистом контексте. Сервер не запускает модель сам. Если отдельный проверяющий недоступен, выпускайте только предварительную версию.' };
    });
  }
  async submitReview(id, requestId, review) {
    return this.mutate(id, state => {
      const request = state.reviewRequests.find(r => r.token === requestId && !r.used);
      if (!request || request.hash !== contentHash(state.roadmap,state.answers)) throw new Error('Запрос проверки отсутствует, использован или устарел.');
      if (review.reviewer.identity === state.authorId && review.reviewer.independent) throw new Error('Автор не может быть независимым проверяющим.');
      const evaluation = evaluateReview(review,state.roadmap,state.answers);
      request.used = true;
      if (state.review) state.reviewHistory.push(state.review);
      state.review = review;
      return evaluation;
    });
  }
}
