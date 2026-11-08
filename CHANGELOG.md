# Changelog

## 0.0.8

- Keep open intake questions as free text; offer predefined choices only for the output format. Host-UI responses specify inputMode and instructions for clients whose question widget requires options.
- Remove schedule selection, weekly-hours and deadline intake. Estimate approximate effort per task, stage and program, with a separate reserve, without calendar-duration calculations.
- Preserve existing session data and exported files without automatic migration or rewriting. Legacy scheduling inputs no longer affect planning or reviewer inputs; new writes to retired fields are rejected.
- Version the review contract so earlier reviews are not treated as current under effort-only planning. Preserve review history and flag unverified historical prose in newly built preliminary exports.
- Keep rubric weights and thresholds unchanged; remove personal-calendar requirements and require reviewers to block unresolved active scheduling promises.
- Known unresolved whitespace (#5) and editorial verification (#6) limitations remain unchanged. PDF output is automatically checked but was not manually visually inspected for this release.

## 0.0.7

- Share overlapping native intake calls within a server session to prevent duplicate question forms; clear the active intake after completion, cancellation or failure.
- Show explicit invalid-input feedback in the form message, field title and description; include the rejected relative path and an OS-appropriate absolute-path example.
- Add regression coverage for concurrent calls, cancellation/resume, failed forms, session isolation, invalid answers and feedback reset after correction.
- The unresolved whitespace (#5) and editorial verification (#6) limitations from 0.0.6 remain unchanged.

## 0.0.6

- Add full-roadmap clarity and content-preserving proofreading guidance for authors and reviewers.
- Use readable safe export directory names and stage/technically check selected artifacts before no-overwrite publication; visual inspection remains a host responsibility.
- The observed whitespace issue (#5) remains unverified without the affected source/session and browser artifact; no speculative renderer fix was made.
- Editorial workflow verification is incomplete (#6): final independent review found meaning changes in the synthetic proofreading example. Passing automated checks do not establish content-preserving proofreading.

## 0.0.5

- Export site files directly into the roadmap directory, keep the ZIP alongside it and store snapshots, manifests and QA screenshots in the plugin data directory.
- Return explicit diagnostic paths for agent review without exposing internal files in the delivered site.

## 0.0.4

- Add PowerShell and POSIX sh installers for a complete local Codex plugin.
- Install locked runtime dependencies in the actual Codex plugin cache.
- Verify MCP handshake, tool discovery, workflow guidance and browser launch; install Chromium when needed.
- Document local installation, browser options and duplicate MCP cleanup.
- Update adm-zip and zod dependencies.
- Preserve LF line endings for shell scripts.

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
