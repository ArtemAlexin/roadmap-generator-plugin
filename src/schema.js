const text = { type: 'string', minLength: 1 };
const id = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$' };
const number = { type: 'number', minimum: 0 };
const list = items => ({ type: 'array', items });
const ids = list(id);
const object = (properties, optional = []) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties).filter(k => !optional.includes(k)) });
const texts = list(text);
const hours = object({ theory: number, practice: number, assessment: number, repetition: number });
const material = object({ sourceId: id, fragment: text, studyHours: number, exerciseHours: number, role: { enum: ['main', 'supplement', 'deepening', 'alternative'] } });
export const stageSchema = object({
  id, title: text, status: { enum: ['required', 'recommended', 'optional'] },
  kind: { enum: ['learning', 'final'] }, dependencies: ids, parallelWith: ids, hours,
  purpose: text, competenceIds: ids, prerequisites: text, environment: text,
  steps: list(object({ id, title: text, explanation: text, extraction: text, hours: number,
    materials: { ...list(material), minItems: 1 }, practiceIds: ids, dodIds: ids })),
  enrichment: text,
  practice: list(object({ id, title: text, goal: text, inputs: text, actions: text,
    expectedResult: text, acceptance: text, dodIds: ids, hours: number, pitfalls: text, selfCheck: text })),
  errors: list(object({ symptom: text, cause: text, fix: text, limits: text })),
  dod: list(object({ id, artifact: text, threshold: text, thresholdOrigin: text,
    conditions: text, verification: text, transfer: { type: 'boolean' },
    recovery: object({ likelyCause: text, stepIds: ids, exercise: text, retest: text }) })),
  repetition: text, checkpoint: text, assessmentHours: number, repetitionHours: number,
  sizeJustification: text
});
export const sourceSchema = object({
  id, title: text, url: { type: 'string', pattern: '^https?://' }, author: text, year: text,
  edition: text, fragment: text, language: { enum: ['ru', 'en'] },
  access: { enum: ['free', 'free-fragment', 'paid-book'] }, legalBasis: text,
  prerequisites: text, topics: texts, learningTask: text,
  role: { enum: ['main', 'supplement', 'deepening', 'alternative'] }, studyHours: number, exerciseHours: number,
  functions: { ...list({ enum: ['theory', 'practice'] }), minItems: 1, uniqueItems: true },
  status: { enum: ['verified', 'partial', 'description-only', 'unavailable'] },
  verification: object({ method: text, result: text, checkedAt: text, checkedFragments: texts,
    sufficient: { type: 'boolean' }, sufficiencyReason: text })
});
export const competenceSchema = object({ id, name: text, category: { enum: ['base', 'advanced', 'situational'] },
  required: { type: 'boolean' }, action: text, depth: text, prerequisites: ids, tasks: text, errors: text, verification: text, relevance: text });
export const scenarioSchema = object({ id, title: text, description: text, kind: { enum: ['typical', 'complex', 'failure', 'constrained'] },
  inScope: { type: 'boolean' }, exclusionReason: text, competenceIds: ids, practiceIds: ids, dodIds: ids });
export const evidenceSchema = object({ id, requirementId: id, sourceId: id, fragment: text,
  method: text, observation: text, status: { enum: ['verified', 'structural', 'unconfirmed', 'contradiction'] } });
export const coverageSchema = object({ competenceId: id, stageId: id, stepIds: ids, practiceIds: ids, dodIds: ids, sourceIds: ids,
  depth: text, status: { enum: ['verified', 'structural', 'unconfirmed', 'contradiction'] } });
export const aboutSchema = object({ summary: text, mainCriterion: text, assumptions: texts, boundaries: text,
  limitations: text, schedule: text, milestones: text, timeBasis: text, uncertainty: text,
  reserveHours: number, instructions: text });
export const reportSchema = object({ crossCheck: text, depthAudit: text, dryRun: text, negativeScenarios: text,
  factualChecks: text, limitations: text, personalization: text, changes: texts,
  authorSelfAssessment: text });
export const rubricWeights = { A1: 5, A2: 10, A3: 5, B1: 10, B2: 5, B3: 10, V1: 15, V2: 10, V3: 5, G1: 5, G2: 5, D1: 10, D2: 5 };
export const reviewSchema = object({
  contentHash: text, reviewer: object({ identity: text, context: text, independent: { type: 'boolean' }, limitation: text }),
  scores: object(Object.fromEntries(Object.keys(rubricWeights).map(k => [k, object({ level: { type: 'integer', minimum: 0, maximum: 5 }, evidence: text, limitation: text, nextLevel: text })]))),
  blockers: texts, findings: list(object({ problem: text, evidence: text, impact: text, correction: text, status: { enum: ['open', 'closed', 'objection'] } })),
  checks: text, sampledStageIds: ids, reopenedSourceIds: ids, coverage: text, limitations: text
});
export const roadmapSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  ...object({ schemaVersion: { const: '1.0' }, id, title: text, language: { enum: ['ru', 'en'] },
    about: aboutSchema, competences: { ...list(competenceSchema), minItems: 1 }, scenarios: { ...list(scenarioSchema), minItems: 1 },
    sources: { ...list(sourceSchema), minItems: 1 }, stages: { ...list(stageSchema), minItems: 1 },
    evidence: list(evidenceSchema), coverage: list(coverageSchema), report: reportSchema })
};
