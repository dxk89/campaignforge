# Phase 4: Rigour

**Goal.** Prompt changes are measured before they ship; prompts are versioned data, not code; a model-based audit complements the code gate; a client can be handed a document; spend has a ceiling; the tool measures its own use.

**Exit.** `node evals/run.js` produces per-agent scores stored against prompt versions and `/evals` shows the trend; a prompt edited in `/prompts` is used by the next run and recorded on its version; `scripts/gate.js` fails when an agent's score drops beyond threshold; `GET campaigns/:cid/pack.pdf` returns a complete client document; a monthly ceiling refuses runs with a clear message; telemetry counts appear on `/telemetry`; all test suites pass.

## Assumptions inherited from Phase 3 (verify on entry)

- Landing writer, analyst, exemplars and learnings exist and are wired into packets.
- Results and verdicts exist per campaign.
- Image review page exists.

## Contracts

```
evals/briefs/{name}.json
  { name, brief:{...}, sources:[{name,kind,text}], webResearch:false, expected:{ avoidTerms:string[], claims:string[], minProofPoints:number, language:'en'|'pt' } }
  Ten briefs: rich+sources ×3 (SaaS, services, hardware), thin ×2, pt-PT ×2, brand_awareness ×1, event_registrations ×1, provocative tone ×1.

users/{uid}/evals/{runId}
  ranAt; promptVersions: { [agent]: versionId }; models: { [agent]: string }
  briefs: string[]
  scores: { [agent]: { limits:number, avoidLeak:number, claimTrace:number, structure:number, citations:number, complete:number, costEur:number, ms:number, human:number|null } }
  notes: string|null

users/{uid}/prompts/{agent}
  current: versionId
users/{uid}/prompts/{agent}/versions/{versionId}
  role: string; userTemplate: string|null; changeNote: string; createdAt; evalRunId: string|null; scores: object|null

users/{uid}/settings   (user-level)
  monthlyCeilingEur: number|null; ceilingAction: 'refuse'|'warn'
users/{uid}/telemetry/{yyyy-mm}
  counters: { [key:string]: number }   // keys: run.<agent>, regenerate.<scope>, tab.<name>, export.<kind>, ask, image.generate, image.reject
```

**Scoring (`evals/score.js`, code).**
- `limits`: 1 − (hard violations ÷ assets checked).
- `avoidLeak`: 1 − min(1, avoid-term hits ÷ 5).
- `claimTrace`: numeric/comparative claims covered by expected claims ÷ total such claims (1 if none).
- `structure`: activation validator passes (1/0) × social count correct (1/0) × strategy has 3 angles (1/0).
- `citations`: audience entries with URLs ÷ entries (customer-researcher only; 1 if agent not run).
- `complete`: runs that reached `complete:true` ÷ runs.
- `human`: from `evals/human/<runId>.json` if present (1–5 per agent, normalised to 0–1).
- Per agent, average over briefs. A composite per agent = mean of the applicable scores.

**Gate (`scripts/gate.js`).** Compare latest run to the previous run with the same brief set; fail (exit 1) if any agent's composite drops by more than 0.05 or `complete` drops below 0.9. Print a table. Intended for a pre-merge check, run by hand (spend).

**Prompt versioning.** `lib/agents/roster/*.js` roles become defaults; `lib/prompts/store.js` loads `current` per agent from Firestore at first use (cache 60 s; `MOCK_CLAUDE` or no Firebase → defaults). `/prompts` page: view current role, edit in a textarea, change note required, save → new version → current. Every agent version records `promptVersion`. Evals record the map. "Revert" sets current to an older version.

**Model compliance audit.** `POST campaigns/:cid/compliance/model`: runs the Critic in audit mode (`kind:'audit'`) over all approved assets in one call per language; returns `{ toneDrift:[{assetId, note}], missedClaims:[{assetId, claim}], readability:[{assetId, grade}] }`; stored under `compliance/{runId}` with `mode:'model'`; shown on the workbench as advisory, never blocking.

**Export pack.** `GET campaigns/:cid/pack.pdf`: server-rendered (React PDF or headless Chromium, *decide*, note choice) from the same data: cover (client, campaign, date, approval status), brief, research summary with sources, audience summary, strategy, assets per channel with approval marks and flags, social month with card thumbnails and dates, landing page summary, lifecycle diagram (steps table), handoff, measurement plan with actuals if any, experiments and verdicts, tracking table, ledger summary. Brand kit colours on the cover only; body neutral. Also `pack.zip` with the PDF, CSVs, PNGs, landing.html.

**Ceiling.** Before any agent run or image generation: sum ledger for the month; if `monthlyCeilingEur` set and sum + estimated cost of this run (agent's last average, or 0.50) exceeds it: `refuse` → 402 `{ error: 'Monthly ceiling of €X reached (€Y spent). Raise it in Settings.' }`; `warn` → proceed and flag in the response. Settings page field.

**Telemetry.** Increment counters (Firestore `increment`) from the routes and from client events posted to `POST /api/telemetry { key }`. `/telemetry` page: table by month; top agents regenerated, top tabs, exports. No third-party analytics.

## Pages

- `/evals`: runs list; per-agent composite trend (line chart per agent); run detail table; link to the human rating sheet (`evals/human/<runId>.json` template download; upload back).
- `/prompts`: agent list; current version; history; edit with change note; revert.
- Workbench: "Audit with editor" button; "Download pack" (PDF / zip).
- `/settings`: monthly ceiling and action; data-handling; export-all.
- `/telemetry`.

## Tasks

1. Ten golden briefs; `evals/run.js` (real API; per-agent scores; writes Firestore run + local JSON); `evals/score.js` with unit tests on canned outputs.
2. `scripts/gate.js`; document the pre-merge routine in CLAUDE.md.
3. Prompt store, `/prompts` page, promptVersion on versions, evals record the map. Test: edit → next run uses the new role (assert in trace/system).
4. Human rating sheet template and upload; `/evals` page with trends.
5. Critic audit mode; route; workbench advisory panel. Test: scripted audit output stored and rendered.
6. Export pack PDF and zip. Test: pack for the e2e campaign contains every section header and the approval marks.
7. Monthly ceiling; settings; refusal message. Test: ceiling 1.00 with ledger 0.99 and estimate 0.50 → 402.
8. Telemetry counters and page. Test: two regenerations increment `regenerate.asset` by 2.
9. Final pass: README rewrite for the product as it now is; CLAUDE.md commands updated; `docs/DATA-HANDLING.md` reviewed against actual storage; version tag `v1.0.0`.

## After Phase 4 (not specified; open for a later stage)

Queue for unattended and scheduled runs (weekly rescan, monthly social); publishing integrations when a client's scheduler is a daily friction; multi-user (allowlist → roles); vector retrieval when a client's exemplars exceed a few thousand; photography via a second image pass with a brand-safety review; multi-language beyond pt-PT.
