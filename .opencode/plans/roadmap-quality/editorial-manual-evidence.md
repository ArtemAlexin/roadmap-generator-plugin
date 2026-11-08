# Manual synthetic editorial evidence

This is a record of a human-readable, manually performed editorial exercise: I read the fields and manually rewrote selected prose; this is not an auto-test claiming coverage and not proof that a model will follow the guidance. Full snapshots are in `editorial-manual-case.json` (`before`, `passA`, `passB`) so the changes can be inspected without relying on this summary. The case is intentionally reduced to one stage from the synthetic software fixture. Its source record says no real source inspection occurred; the inconsistent `verified`/`sufficient: true` fields in **before** are deliberate defects, not claims of verification.

## Manual execution record

I read the before snapshot section by section, including nested fields, and then wrote A as a separate content pass. A aimed at executable instructions, learner-facing clarity, and honest evidence. I then re-read the same snapshot sections for B and made only prose punctuation corrections plus a note recording that pass. I compared the protected values recorded in the artifact against both edited snapshots. No URL, source title, user goal, identifier, schedule/hour value, threshold, or quoted source fragment was rewritten. The placeholder `checkedFragments` claim was removed because it falsely implied an inspected fragment; the named `fragment` itself was retained verbatim.

### Pass A — observed before → after edits

| Section / field | Before | A | Why / observable effect |
|---|---|---|---|
| `stages[M01].purpose` | “Сделайте структуру.” | Instructs the learner to create a document from the event data, explain how semantic areas help readers, open it, and recover omissions by comparing against the input. | Adds action, purpose, check, and recovery instead of a vague imperative. |
| `stages[M01].steps[M01-S1].explanation` | “Семантика — смысл. Примените.” | Defines semantic HTML as role rather than presentation, gives a heading example, then connects reading to selecting areas and applying them to the event data. | Explains term and links concept to task. |
| `stages[M01].steps[M01-S1].extraction` | “Составить структуру страницы; затем применить её в практике.” | Directs learner to list areas and purposes, then use that list in the page. | Makes the intermediate output observable. |
| `stages[M01].practice[M01-P1].actions` | “Сделайте страницу. Проверьте.” | Specifies copying the supplied title/date/place/sections into `index.html`, choosing elements by purpose, browser check, no template, and input comparison after omission. | Establishes inputs, sequence, boundary, and recovery. |
| `stages[M01].practice[M01-P1].acceptance` | “Все верно.” | Links to `M01-D1`, enumerates required event data and meaningful heading structure, and says what to fix if an item is missing. | Replaces subjective acceptance with observable criteria and recovery. |
| `stages[M01].dod[M01-D1].recovery.exercise` | “Разметьте страницу другого события с тремя разделами.” | Requires a different event, three semantic areas, a new data set, and an explanation of element choices. | Makes the recovery exercise independently executable; threshold/conditions/IDs remain unchanged. |
| `stages[M01].checkpoint` | Points to absent `M04` from the larger fixture. | Gives a local check: open page, compare input data, explain headings against `M01-D1`. | Removes a dangling reference introduced by reducing the case to one stage. |
| `about.schedule`, `milestones`, `timeBasis`, `instructions` | Describes a four-stage calendar and a generic instruction. | States that this reduced example covers `M01` only, gives one-stage milestone, disclaims a measured duration, and directs the learner to `index.html` and `M01-D1`. | Aligns overview with the actual one-stage scope without changing numeric fixture values. |
| `competences[C01].action/tasks/errors/verification` | Broad “create and explain” statements. | Specifies event page and explanation, lists its data, distinguishes appearance from purpose, and gives a new-file verification. | Makes the competence and evidence match the single practice. |
| `scenarios[SC01].description` | Generic new structure and documentation. | Names browser/documentation access and points to the actual practice input. | Improves scenario reproducibility. |
| `sources[S01]` | Synthetic note said the source was not checked, but status was `verified`, result claimed checked, `sufficient` was true, and placeholder fragment was in `checkedFragments`. | Sets `description-only`, `sufficient: false`, records no inspection, clears `checkedAt`/`checkedFragments`, and leaves the URL/title/named fragment verbatim. | Prevents unsupported evidence from appearing verified or sufficient. The source remains an explicit gap. |
| `evidence[E01]` | Claimed source confirmation and `verified`. | Says only the synthetic record exists and marks `unconfirmed`. | Aligns evidence with actual work. |
| `coverage[C01/M01]` | `verified`. | Describes only a structural link and marks `structural`. | Does not imply source-supported learning coverage. |
| `report.factualChecks/limitations/changes` | “Проверено” and “Ограничений нет.” | Records the actual one-stage A scope, the source gap, preliminary limitation, and concrete edits. | Replaces false assurance with bounded evidence. |

No factual source content was researched or added. The supplied event date has no year; I preserved it as given and did not infer one. No learner dry-run or independent review is claimed.

### Pass B — separately observed corrections

| Section / field | A | B | Check |
|---|---|---|---|
| `stages[M01].practice[M01-P1].pitfalls` | “Выбирайте элементы по внешнему виду, проверьте смысл.” | “Выбирайте элементы не только по внешнему виду; проверьте, соответствует ли элемент назначению области.” | Corrected comma splice and clarified the referent without changing protected content. |
| `about.instructions` | Ends with `качества..` | Ends with `качества.` | Removed duplicate terminal period only. |

The only other B difference is the `report.factualChecks` entry recording that the second pass occurred; it does not alter roadmap learning content. Comparing A and B shows no changes to protected user/source/ID/number/threshold values.

## Field coverage checklist — manually read in both passes

Every listed field was read in before and re-read in A and B. “Reviewed/no edit” means the wording or value was inspected and retained; it does not mean that a test inferred editorial quality. Changed fields and reasons are in the tables above.

- [x] Root: `schemaVersion`, `id`, `title`, `language` — identity and scope; title/ID unchanged.
- [x] `about`: `summary`, `mainCriterion`, `assumptions[]`, `boundaries`, `limitations`, `schedule`, `milestones`, `timeBasis`, `uncertainty`, `reserveHours`, `instructions` — synthetic disclaimer retained; timeline/instructions reconciled to one stage; numeric value preserved.
- [x] `competences[C01]`: `id`, `name`, `category`, `required`, `action`, `depth`, `prerequisites[]`, `tasks`, `errors`, `verification`, `relevance` — all fields reviewed; action/tasks/errors/verification clarified.
- [x] `scenarios[SC01]`: `id`, `title`, `description`, `kind`, `inScope`, `exclusionReason`, `competenceIds[]`, `practiceIds[]`, `dodIds[]` — scope and links checked; description clarified; IDs/links retained or repaired only to the included M01 record.
- [x] `sources[S01]`: `id`, `title`, `url`, `author`, `year`, `edition`, `fragment`, `language`, `access`, `legalBasis`, `prerequisites`, `topics[]`, `learningTask`, `role`, `studyHours`, `exerciseHours`, `functions[]`, `status`, `verification.method`, `verification.result`, `verification.checkedAt`, `verification.checkedFragments[]`, `verification.sufficient`, `verification.sufficiencyReason` — every field checked; only unsupported verification claims were downgraded/cleared. No external inspection took place.
- [x] `stages[M01]`: `id`, `title`, `status`, `kind`, `dependencies[]`, `parallelWith[]`, `hours.theory`, `hours.practice`, `hours.assessment`, `hours.repetition`, `purpose`, `competenceIds[]`, `prerequisites`, `environment`, `steps[]`, `enrichment`, `practice[]`, `errors[]`, `dod[]`, `repetition`, `checkpoint`, `assessmentHours`, `repetitionHours`, `sizeJustification` — all fields read; purpose/checkpoint clarified; hour values and IDs retained.
- [x] `stages[M01].steps[M01-S1]`: `id`, `title`, `explanation`, `extraction`, `hours`, `materials[]`, `practiceIds[]`, `dodIds[]`; `materials[S01]`: `sourceId`, `fragment`, `studyHours`, `exerciseHours`, `role` — all read; explanation/extraction improved; exact fragment and numeric values preserved.
- [x] `stages[M01].practice[M01-P1]`: `id`, `title`, `goal`, `inputs`, `actions`, `expectedResult`, `acceptance`, `dodIds[]`, `hours`, `pitfalls`, `selfCheck` — all read; actions/acceptance made executable; pitfalls corrected only in B; inputs and numeric values preserved.
- [x] `stages[M01].errors[0]`: `symptom`, `cause`, `fix`, `limits` — all read; retained as a consistent diagnostic example.
- [x] `stages[M01].dod[M01-D1]`: `id`, `artifact`, `threshold`, `thresholdOrigin`, `conditions`, `verification`, `transfer`, `recovery.likelyCause`, `recovery.stepIds[]`, `recovery.exercise`, `recovery.retest` — all read; recovery clarified; threshold, origin, conditions, transfer, IDs unchanged.
- [x] `evidence[E01]`: `id`, `requirementId`, `sourceId`, `fragment`, `method`, `observation`, `status` — all read; unsupported observation/status corrected to unconfirmed.
- [x] `coverage[C01/M01]`: `competenceId`, `stageId`, `stepIds[]`, `practiceIds[]`, `dodIds[]`, `sourceIds[]`, `depth`, `status` — all read; structural-only claim recorded.
- [x] `report`: `crossCheck`, `depthAudit`, `dryRun`, `negativeScenarios`, `factualChecks`, `limitations`, `personalization`, `changes[]`, `authorSelfAssessment` — all read; factual checks/limitations/changes corrected; no dry-run or self-assessment invented.

## Protected-value comparison

`editorial-manual-case.json` stores the compared values under `protectedValues`. In both edited snapshots these match the before snapshot: the complete supplied input record; exact practice input text; roadmap title; source title, URL and named fragment; roadmap/stage/step/practice/DoD/source IDs; stage/step/practice/source hours; reserve hours; and the full DoD threshold. The placeholder `checkedFragments` is intentionally **not** protected as a verified quotation: it was false evidence and is removed in A; the source's named fragment field remains exact. B retains every A protected value.

This is evidence of one bounded manual example only. It is not a guarantee about a future model, a real source audit, a learner outcome, or a full production roadmap.
