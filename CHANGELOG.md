# Changelog

## 0.0.3

- Separate self-paced effort estimates from personal weekly scheduling.
- In self-paced mode skip weekly-hours and deadline questions, retain all stage/total hours and reserves, and do not calculate calendar duration.
- Keep explicit weekly planning and compatibility with earlier numeric weekly budgets.
- Adapt HTML/PDF summaries, schedule instructions and rubric applicability to the chosen mode.
- Add intake, rendering, responsive UI and export regression tests for self-paced learning.

## 0.0.2

- Keep every intake question interactive: native MCP forms continue sequentially until completion/cancellation; clients without MCP forms are explicitly routed to the host question UI for each question.
- Resume after cancellation and retry invalid answers in forms; expose an explicit next-tool action in session summaries.
- Offer an interactive local website ZIP, PDF or both; HTML never means a single standalone document.
- Return explicit delivery contracts and actual website/archive/PDF paths from builds.
- Add regression coverage for the full eight-question flow, resume/retry, UI guidance and multi-page archive contents.

## 0.0.1

First tagged GitHub release.

- Agent-portable MCP workflow and persistent interactive intake.
- Native OpenCode V2 plugin with skill and /roadmap command.
- Reusable offline HTML/PDF generation and technical QA.
- Original 100-point review rubric and separate-reviewer packets.
- Unit, MCP, browser and installed-OpenCode smoke tests.

Local execution requires Node.js and browser dependencies described in README. No npm registry or OpenAI public-directory publication is included in this release.
