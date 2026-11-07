# Data conventions

Read the JSON Schema for the current object via roadmap_schema. Schema version is 1.0. Markdown is supported in explanatory strings; HTML is sanitized. Use “—” for a genuinely inapplicable textual field, with an explanation when important. An empty list means not applicable, not “to be completed”. Stable IDs use letters, numbers, underscores and hyphens, unique across all objects. Stages: M01; steps: M01-S1; practice: M01-P1; criteria: M01-D1. Competences C01, sources S01, scenarios SC01, evidence E01.

Single objects: title, language, about, report. Collections upserted one item per call: competences, scenarios, sources, stages, evidence. coverage is replaced as an array. Use roadmap_remove to delete an obsolete collection item; fix its references too. Lists/fields are not inferred or auto-filled by the server.

Required stages must depend only on required stages. There is exactly one required final stage; it must transitively depend on all other required stages. Optional branches can remain separate. Reading order is a topological order and does not create prerequisites.

## Time accounting

Personal planning is separate from effort. Input scheduleMode=self-paced means no personal weekly budget and no calendar deadline: omit hoursPerWeek/deadline unless the user already supplied them, never invent replacements. Explicit self-paced mode takes precedence over stale weekly values in a resumed session. Keep all effort estimates and reserves in hours; about.schedule is a dependency-based sequence of stages and checkpoints, not weeks or dates. When switching an existing weekly plan to self-paced, revise its schedule prose before export. scheduleMode=weekly uses actual hoursPerWeek and an optional unrestricted deadline answer. Legacy numeric hoursPerWeek imply weekly mode. A no-deadline answer without any weekly budget implies self-paced. The schema's schedule field is intentionally retained for compatibility; it does not require calendar scheduling.
stage.hours.theory is the sum of step.hours. All mandatory reading, viewing and embedded source exercises assigned within steps are included in step.hours, even though the aggregate field is named theory. stage.hours.practice is the sum of practice.hours (standalone practice only). The same exercise must not appear in both totals. assessmentHours equals hours.assessment, repetitionHours equals hours.repetition. Source study/exercise times and material times are descriptive allocations, never added again to the stage totals. Alternatives and optional deepening do not add to the required step time. about.reserveHours is EXTRA contingency beyond stage repetition hours; do not count the same repetition twice. Explain estimates, ranges and budget constraints in about.

## Verification
Each material reference specifies sourceId, exact fragment, allocated study/exercise hours and role. A required step needs at least one main reference. A source marked verified needs actual checkedFragments, observed method/result, date and a justified sufficiency conclusion. The exact referenced fragment must occur in checkedFragments; provide evidence records linked to the step ID and that exact fragment. This is traceability, not automatic verification: the author must actually read/watch it. Evidence for one fragment does not automatically verify another.

If several fragments jointly provide sufficient coverage, explain joint sufficiency in their verification records and the coverage row. Do not claim each source teaches the whole topic on its own. Main references must be free/free-fragment. Paid books can only be supplementary/deepening/alternative references.

## Interpretation of the original prompt
- Competence IDs are stored in data/reports; stage prose uses names (fixes the contradictory requirement to both display and hide these IDs).
- Universal proof requirements override sample-based descriptions: a level requiring “all/100%” needs full checking of that property. Explain audit coverage in the review.
- Rubric weights and threshold are unchanged. The explanatory suggestion about minimum subcriterion level 3 in B/V is not an additional blocker; section 4.3 defines blockers.
- Judge the final corrected state, not whether a defect was found earlier. Record past defects in changes.
- Full instructions from the user's v7 are retained in docs/original-prompt-v7.txt for traceability; load phase references instead during normal work. Rendering requirements are implemented once in code. Do not run the entire original prompt as a second workflow.

## Review schema
ASCII keys correspond to Cyrillic rubric labels: A=А, B=Б, V=В, G=Г, D=Д. Weights: A1=5,A2=10,A3=5,B1=10,B2=5,B3=10,V1=15,V2=10,V3=5,G1=5,G2=5,D1=10,D2=5. Levels are integers 0..5, points=weight*level/5. Total 100, pass at least 85 plus no blockers. Each score includes evidence, limitation, nextLevel (at level 5 state that the maximum is reached and give any residual limit).

Read roadmap_schema(review) for the exact return object. Record reviewer identity distinct from author, fresh-context description, independent flag and correlated-model limitation. contentHash must equal the review packet hash. Include actual stage/source samples, method of sampling, findings and blockers. No server tool can prove independence merely from these strings.
