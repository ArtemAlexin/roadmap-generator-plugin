# Delivery

Use roadmap_build for the chosen format: html, pdf or both. Do not generate code/templates again. Each build creates a fresh directory under the user's chosen absolute destination and never overwrites an earlier build.

HTML: site/index.html plus complete stage pages, about.html and report.html; roadmap-html.zip is the distributable archive. Local CSS/JS, no CDN, fetch/XHR or ES modules; opens via file:// after extraction. Search, status/query highlighting, DAG, zoom, drag, keyboard controls, themes and local progress are presentation only. Links to learning materials require internet. Stages remain complete and all seven blocks are visible.

PDF: roadmap.pdf is a full linear version from the same immutable snapshot: about, map, every stage, report. Print styling and page numbers are reusable. External learning URLs appear in print. Chromium is required for PDF AND browser QA; install it once with npx playwright install chromium or use installed Edge/Chrome. Set ROADMAP_BROWSER_PATH for an explicit browser.

roadmap.json and manifest.json accompany outputs. manifest records contentHash, selected format, preliminary status, machine checks and visual-review status. A source verification claim in data is the author's recorded claim; the server does not independently browse it. No reviewer/current passing review => prominently preliminary, no invented passing score. Structural errors stop export; content gaps allow a clearly preliminary best-effort export.

Browser QA checks all pages/links/anchors, seven-block structure, node and edge parity, page errors, external network requests and viewport overflow. Eight screenshots cover map/stage × desktop/mobile × light/dark. These are not automatically visually reviewed: inspect them. Also render and inspect representative PDF pages, including a dense stage/report page. Full accessibility/behavior checks are covered by project tests on fixtures, not guaranteed for arbitrary future content.

Presentation defect => repair templates/assets and rebuild, preserving the content hash. Content defect => repair source data, invalidate the old review and re-review affected content. Do not change the rubric or simplify curriculum to fix layout. Do not report visual QA as successful without viewing the outputs.
