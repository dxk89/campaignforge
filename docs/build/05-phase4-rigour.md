# Phase 4: Rigour (outline; detail after Phase 3)

Goal: prompt changes are measured; a client can be handed a document.

Tasks (to be specified at Phase 3 exit):
1. Evals: `evals/` from week 2 extended to ten briefs; `evals/run.js` records per-agent scores against prompt versions to `users/{uid}/evals/{runId}`; `/evals` page with trend per agent; a `scripts/gate.js` that fails CI-style if an agent's score drops more than a threshold.
2. Prompts in Firestore: `users/{uid}/prompts/{agent}/versions/{v}`; roster reads `current` at runtime with in-memory cache; `/prompts` page to edit with change note; version recorded on every agent version.
3. Model compliance check: `POST campaigns/:cid/compliance/model` runs the Critic in "audit" mode across all approved assets; advisory report stored.
4. Export pack: `GET campaigns/:cid/pack.pdf` (server-rendered from the same components): brief, strategy, assets with approval state, social month with thumbnails, activation plan, measurement plan, tracking table, ledger summary.
5. Monthly cost ceiling in settings; `run/:agent` refuses over ceiling with a clear message.
6. Instrumentation: count regenerations, tab views, exports per agent/tab into `users/{uid}/telemetry`; a small page.
