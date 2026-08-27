# Phase 3: Authority

**Goal.** The loop closes. Every insight shows where it came from; results come back in and are judged in code; approved learnings and exemplars shape the next generation; the landing page exists; images are reviewed before they are seen; the social month has real dates.

**Exit.** A second campaign for a client whose first campaign has uploaded results and approved assets shows, in its trace and packets, the learnings and exemplars from the first; every proof point and audience phrase in the UI resolves to a source with a fetched-at date; the Measurement tab shows actuals beside targets and a verdict per experiment computed from uploaded data; a landing page is generated, validated against the MQL definition and exported with tracking; the image review grid can reject and regenerate; `npm test`, db and e2e pass.

## Assumptions inherited from Phase 2 (verify on entry)

- Asset docs exist with `assetId = channel.unit.field.language`, `status`, `flags`, `versionId`.
- Claims registry exists; `memory.approvedClaims` returns approved, unexpired claims; `buildRules.claimSeverity === 'violation'` when non-null.
- Versions chain with `parentVersionId`; `current` pointers per agent; stale detection by `inputsHash`.
- Critic final review route exists (`POST campaigns/:cid/review`).
- If any of these differ, adapt the contracts below to the actual field names and note the change in the first commit of this phase. Do not change Phase 2 contracts to fit this spec.

## Contracts

```
// Provenance on research and audience outputs (brand-analyst, customer-researcher)
proof_points[]:        { claim, source, span:string|null, sourceId:string|null, fetchedAt:Timestamp|null }
voice.observations[]:  { text, sourceId|null }         // was string[]; postProcess upgrades strings to {text}
audience.language[]:   { text, url }                   // was string[]; same upgrade
audience.pains[] / objections[] / triggers[]: { text, url:string|null }

users/{uid}/clients/{clientId}/sources/{sourceId}
  + lastSeenAt: Timestamp; + hash: string (already); + changed: boolean (set by rescan when hash differs)

users/{uid}/clients/{clientId}/campaigns/{campaignId}/results/{resultId}
  source: 'linkedin'|'meta'|'google'|'email'|'crm'|'manual'; uploadedAt; fileRef:string
  mapping: { variant:string, impressions?:string, clicks?:string, conversions?:string, spend?:string, opens?:string, replies?:string }   // column names
  rows: { variant:string, matchedAssetId:string|null, impressions:number, clicks:number, conversions:number, spend:number, opens?:number, replies?:number }[]
  summary: { byChannel: {...}, unmatched: string[] }

users/{uid}/clients/{clientId}/settings.resultMappings: { [source]: mapping }   // remembered per source

users/{uid}/clients/{clientId}/campaigns/{campaignId}/verdicts/{experimentIndex}
  experiment: object (from activation.experiments[i]); metric: string; variants: { [assetId]: number }
  sample: number; minSample: number|null; verdict: 'met'|'not_met'|'insufficient'; delta: number|null; computedAt

users/{uid}/clients/{clientId}/learnings/{learningId}
  statement: string; evidence: { metric, value, variants:string[], campaignId, resultId }
  status: 'proposed'|'approved'|'rejected'; createdAt; approvedAt|null; note|null

users/{uid}/clients/{clientId}/exemplars/{exemplarId}
  agent: string; channel: string; unit; field; language; objective; tone; pillar:string|null
  text: string; assetId; campaignId; approvedAt; performance: { metric, value }|null
  kind: 'approved'|'rejected'; note: string|null

users/{uid}/clients/{clientId}/campaigns/{campaignId}/versions/{v}  (landing-writer)
  output: { hero:{headline,sub,cta}, proof:[{claim, claimId}], objections:[{objection, answer}],
            form:{ fields:[{name,type:'text'|'email'|'select'|'number',required:boolean,options?:string[],maps_to_mql:string|null}] },
            seo:{title,description}, sections_order:string[] }

users/{uid}/clients/{clientId}/campaigns/{campaignId}/images/{imageId}
  + reviewedAt; + review: { ok:boolean, problems:string[] }; + rejectionNote; + parentImageId:string|null; + status includes 'regenerating'

users/{uid}/clients/{clientId}/settings.calendar: { events:[{ date:'YYYY-MM-DD', label:string, kind:'launch'|'event'|'holiday'|'blackout' }] }
users/{uid}/clients/{clientId}/campaigns/{campaignId}/brief.startDate: 'YYYY-MM-DD'
social.posts[]: + date:'YYYY-MM-DD' (computed from startDate + day - 1); social-planner packet includes events within the 28 days and must not post on blackout dates (validate).
```

## Routes

| Route | Body | Effect / returns |
|---|---|---|
| POST clients/:id/rescan | | scan_site again; per page: compare hash; update `lastSeenAt`, set `changed`; run brand-analyst on changed pages only with instruction "report only changes to voice terms and claims"; returns `{ changedSources:[], proposedVoiceChanges:{added:[],removed:[]}, proposedClaims:[] }`; nothing is applied automatically |
| PATCH clients/:id/voice | `{ apply: { added, removed } }` | applies a rescan proposal |
| POST campaigns/:cid/run/landing-writer | | as other agents; inputs: brief, strategy, assets (composed), activation (MQL definition, lead score), context, claims; explodes into assets `landing.hero.headline.en` etc. |
| POST campaigns/:cid/results | multipart `file`, `{ source, mapping? }` | parse CSV (papaparse server-side); if no mapping, return `{ columns:[], sample:[], suggestedMapping }` (a Haiku call proposes the mapping); with mapping: match rows, write result doc, remember mapping in client settings, compute verdicts, return `{ resultId, summary, verdicts }` |
| GET campaigns/:cid/results | | `{ results, verdicts, actualsByAsset }` |
| POST campaigns/:cid/learnings/propose | `{ resultId }` | run analyst agent; writes proposed learnings; returns them |
| GET/PATCH clients/:id/learnings/:lid | `{ status, statement, note }` | edit or approve |
| POST campaigns/:cid/images/:iid/reject | `{ note }` | status rejected; if `regenerate:true` run art-director with `correction: note` and `parentImageId`; returns new image |
| PATCH campaigns/:cid/images/:iid | `{ status:'approved' }` | copies file to `approved/`; writes exemplar kind 'approved' for the graphic spec |
| GET clients/:id/exemplars?agent=&channel= | | list |
| PATCH clients/:id/settings | `{ calendar }` | |

**Matching rule (results → assets).** Try `utm_content` column equals asset tracking `utm_content`; else exact text match on headline/primary_text/subject; else fuzzy (normalised, ≥0.9 Jaro-Winkler, *decide* library); else unmatched. Unmatched rows are kept and listed; nothing is silently dropped.

**Verdict rule (code, not model).** For each `activation.experiments[i]`: find variants by the assetIds named in `experiment.variants` (parse "variant 1 vs variant 3" against the channel); metric from `primary_metric` mapped to a column (clicks/impressions → CTR; conversions/clicks → CVR; conversions/spend → CPA; else conversions). `minSample` parsed from `decision_rule` if a number with "clicks" / "impressions" / "entrants" appears. `verdict = insufficient` if any variant below minSample; else `met` if the winner beats the loser by the percentage in the decision rule (default 20%), else `not_met`. Store `delta`.

**Analyst agent.** Role: turn a results doc and its verdicts into 3–5 learnings. Each must cite a metric, a value and the variants. Submit schema `{ learnings:[{statement, evidence:{metric,value,variants:[]}}] }`; validate: every learning's variants exist in the results; no learning without a number. Model Sonnet, budget `{maxTurns:3, maxOutputTokens:1500}`. Tools: none (all data in packet).

**Exemplar write rule.** On asset `status → approved`: write an exemplar with the asset's tags (channel, unit, field, language, objective, tone; pillar for social). On `rejected` with a note: write kind 'rejected'. When results arrive, update `performance` on exemplars whose assetId matched, with the experiment's metric.

**Exemplar read rule.** `memory.exemplars({clientId, agent, channel, objective, limit})`: filter by client + channel (+ agent for non-channel agents), prefer same objective, order by `performance.value desc nulls last, approvedAt desc`, take `limit` (6 for copywriter per channel, 8 for social-planner, 3 for strategist as strategy summaries). Rejected exemplars with notes: up to 3, shown as "Not this: <text> — <note>".

**Learnings read rule.** Approved learnings for the client, newest first, max 12, as "What has worked" in `contextBlock`.

**Landing Page Writer.** Role in `lib/prompts/landing.js`: writes the page every asset points at. Hero in the lead angle; proof section only from approved claims (`claimId` required per item); objections from audience research and the activation talk track; form fields derived from the MQL definition (validate: every MQL criterion maps to at least one field via `maps_to_mql`, and there are no more than 6 fields); SEO title ≤ 60, description ≤ 155. Tools: `check_compliance`, `read_claims` (returns approved claims), `ask_critic`. Budget `{maxTurns:5, maxOutputTokens:3000}`. Landing tab in the workbench with the same editors; export adds a `landing.html` (static, styled with brand kit, form posts to `settings.landingUrl` or a placeholder) and a `landing.md`.

**Provenance UI.** Any proof point, phrase or observation with a source shows a small source chip; hover/tap reveals name, URL and fetched-at; click opens the source. Freshness badge on the library: green < 30 days, amber < 90, red older; "Rescan" button.

**Image review.** Page `/clients/[id]/campaigns/[cid]/images`: grid of candidates by post; each shows review result; Approve / Reject with note / Regenerate with note; approved images are what export uses; Art Director pre-review problems shown as badges. Multi-turn: regenerate sends the parent image and the note to `generate_image` as a reference + instruction ("same composition; <note>").

**Calendar.** Client settings page gains an events editor (date, label, kind). Campaign brief gains `startDate` (default next Monday). Social-planner packet: "The month starts <date>. Events: … Blackout dates: … Do not post on blackout dates; post about a launch on or after its date; avoid holidays for product posts." Validate: no post on a blackout date. Posts show dates; social CSV gains a `date` column.

## Pages

- Workbench: Landing tab; source chips everywhere; Measurement tab shows actuals, verdicts, "Propose learnings" button; Social tab shows dates; images link to the review page.
- Library: freshness + Rescan; Learnings panel (proposed / approved / rejected); Exemplars panel (browse, remove); Calendar editor.
- Results page under the campaign: upload, mapping UI (remembered per source), unmatched list, per-asset actuals.

## Tasks

1. Provenance fields on brand-analyst and customer-researcher outputs (postProcess upgrades; schemas accept both string and object during transition); source chips; freshness badge. Tests: postProcess upgrade; chip renders with fetchedAt.
2. Rescan route and voice-change proposals; apply flow. Test: fixture site changed → `changed:true` on the changed page; proposal lists the new avoid term.
3. Landing Page Writer agent, `read_claims` tool, explode into assets, Landing tab, `landing.html` export. Tests: scripted model with a form missing an MQL field → gate error → fixed; e2e renders tab.
4. Results ingestion: CSV parse, mapping UI with Haiku suggestion, matching, result doc, remembered mapping. Test: fixture CSV with utm_content and text variants → 90% matched, unmatched listed.
5. Verdicts in code; Measurement tab actuals. Test: three synthetic result sets → met / not_met / insufficient.
6. Analyst agent; learnings propose/approve; `memory.learnings` live; packet shows "What has worked". Test: scripted model producing a learning without a number → gate error.
7. Exemplars: write on approve/reject; performance update on results; `memory.exemplars` live; packets show examples. Test: approve two assets → next copywriter packet contains them (assert on packet.user).
8. Image review page; reject/regenerate with note; Art Director multi-turn. Test: scripted reject → regenerate → parentImageId set.
9. Calendar settings, startDate, dated posts, blackout validation, CSV date column. Test: blackout on day 3 → scripted post on day 3 fails gate.
10. e2e: campaign 1 approve + results upload + learnings approve → campaign 2 packet contains learnings and exemplars; Landing tab; image review round-trip.

## Order and commits

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10. One commit per task. Update README feature list at 3, 5, 7.

## Tooling tasks (from 07-tooling.md)

### Task 11: stock photography via Pexels
`lib/agents/tools/find_photo.js`: `GET https://api.pexels.com/v1/search?query=&orientation=square&per_page=8` with `PEXELS_API_KEY`. Returns `{ photos: [{ id, url (large), thumb, photographer, avg_color }] }`. The Art Director gains a third option per graphic: `card`, `generated`, `stock`; for `stock` it searches with the visual brief, reviews candidates with `review_image` (same criteria), picks one, records `{ source: 'pexels', id, photographer }` on the image doc. Composite logo as for generated. Licence note stored with the image. Test: mocked search; review rejects one candidate; a pick is recorded with provenance.

### Task 12: Satori + resvg-js + sharp renderer
Replace `graphics.js` internals: templates become small HTML/CSS components rendered by `satori` (MIT) with `brandKit.fontUrl` fonts loaded (fallback bundled Inter), rasterised by `@resvg/resvg-js` (MPL-2.0) to PNG server-side; `sharp` (Apache-2.0) composites the logo and produces 1:1 and 4:5 variants. Same template contract (`quote|stat|tip|list|announce`, same slots); `render_card` returns `{ svg, png (storageRef), truncated }`. The browser canvas path is removed. Test: the five fixture cards render to PNG with the real font; pixel size 1080×1080; the 39-character stat falls to the smaller size.

### Task 13: lifecycle diagram
`mermaid` (MIT): `lib/agents/tools/diagram.js` turns `activation.lifecycle.steps` into a flowchart definition; rendered client-side on the Lifecycle tab and server-side (via `@mermaid-js/mermaid-cli` or `mermaid.ink` request, *decide*) into the export pack. Test: fixture lifecycle produces a definition with one node per step and edges for yes/no.

### Task 14: accessibility on the landing page
`axe-core` (MPL-2.0) in `jsdom`: `check_accessibility({ html })` → `{ violations: [{ id, impact, nodes }] }`. Runs on `landing.html` at generation and on export; serious and critical violations are compliance violations on the landing assets, others warnings. Test: a form without labels is flagged; fixed HTML passes.

### Task 15: statistics behind verdicts
`simple-statistics` (ISC): the verdict engine computes a two-proportion z-test on conversion rates and reports `pValue` and a 95% interval on the delta; `insufficient` when the interval crosses zero or either variant is below `minSample`; `met` when p < 0.05 and the delta exceeds the decision-rule percentage. Stored on the verdict. Test: three synthetic sets → the same met / not_met / insufficient as before, with p-values.

Env additions: `PEXELS_API_KEY` (optional).
