# Week 2: the reviewers

**Goal.** Every writer is reviewed by a second model; generated images are checked before they are shown; thin scans are followed up; small asks answer in seconds.

**Exit.** `npm test` passes with the new cases; a real run shows `critic` entries in the trace of copywriter, social-planner, localiser and strategist; an image with text in it is rejected by the Art Director in a scripted test; `POST /api/ask` returns one agent's output for a natural-language request in one call.

## Task 1: Critic agent

Files: `lib/prompts/critic.js`, `lib/agents/roster/critic.js`, `lib/agents/roster/index.js`, `lib/mock.js` (fixture `critic`), `test/runtime.test.js`.

Role (in `lib/prompts/critic.js`): senior brand editor. Reads, never writes. Reviews an output against the voice observations, preferred and avoid terms, approved claims / proof points, the audience research and the brief. Returns must-fix items (each with `path`, `problem`, `why`) and suggestions. Must-fix is reserved for: contradicts a voice rule, uses a claim not in context, misreads the audience, wrong register for the channel, off-angle from the strategy. Not for taste.

Submit schema:
```json
{ "type":"object","required":["verdict","must_fix","suggestions"],
  "properties":{ "verdict":{"enum":["pass","revise"]},
    "must_fix":{"type":"array","items":{"type":"object","required":["path","problem","why"],"properties":{"path":{"type":"string"},"problem":{"type":"string"},"why":{"type":"string"}}}},
    "suggestions":{"type":"array","items":{"type":"string"}} } }
```
validate: `verdict === 'revise'` requires `must_fix.length > 0`; `pass` requires `must_fix.length === 0`.
Model: `MODELS.sonnet` (leave a `CRITIC_MODEL` env override). Budget: `{ maxTurns: 2, maxOutputTokens: 2500 }`. Temperature 0.2.
packet(inputs): `{ output, kind ('assets'|'social'|'strategy'|'localised'|'landing'), brief, context, audience }` → user prompt includes contextBlock and the output as JSON.

## Task 2: `ask_critic` tool and wiring

Files: `lib/agents/tools/index.js` (add `ask_critic`), roster files for copywriter, social-planner, localiser, strategist.

`ask_critic` tool: `input_schema { output: object, kind: string }`; `run` calls `orchestrator.runAgent('critic', { output, kind, brief: packet.brief, context: packet.context, audience: packet.audience })` and returns `{ verdict, must_fix, suggestions, usage }`. Avoid a circular require: import orchestrator lazily inside `run`.

Wiring: add `ask_critic` to the four writers' `tools`. Append to each role: "Before your final submit, call ask_critic on your draft. Fix every must_fix item. Suggestions are optional." Raise each writer's `maxTurns` by 1.

Gate change (`lib/agents/runtime.js`): none. The Critic is advisory mid-run. **Final gate** is a separate call: `orchestrator.review(kind, output, inputs)` used by the routes after a writer returns; response gains `review: { verdict, must_fix, suggestions }`. Front end shows must_fix in the issues banner as warnings labelled "editor".

Ledger: critic usage is recorded under the calling agent's pass as `critic` sub-entry; `summarise` includes it in totals.

Test: scripted model for copywriter: turn 1 calls `ask_critic` (stub critic to return one must_fix), turn 2 submits; assert trace shows `ask_critic` and its result contains `must_fix`.

## Task 3: Art Director agent

Files: `lib/prompts/art-director.js`, `lib/agents/roster/art-director.js`, `lib/agents/tools/index.js` (`review_image`), `lib/app.js` (`/api/images/generate` becomes an Art Director run when `review: true`), `lib/mock.js`.

Responsibility: given a post's graphic spec and image_prompt, (1) call `render_card` to confirm the card; (2) if `wantImage`, call `generate_image`; (3) call `review_image` with the image and the brief; (4) if review fails, regenerate once with the correction appended to the prompt; (5) submit.

`review_image` tool: input `{ image: dataUrl, brief: string, brand: { accents: [] } }`. Implementation: one vision call (Sonnet) with the image and the question: does it contain text or letters, a recognisable person, colours far from the brand accents, or a subject different from the brief; returns `{ ok, problems: [] }`. Mock: returns `{ ok: true }` unless the brief contains the word "text".

Submit schema: `{ graphic: {template,kicker,headline,body,footer,image_prompt,svg}, image: string|null, review: {ok, problems}, attempts: integer }`.
Budget: `{ maxTurns: 6, maxOutputTokens: 1500 }`. Model: Sonnet.

Route: `POST /api/images/generate` accepts `{ post, brandKit, review: true }`; when `review` is true, run art-director and return its output; otherwise keep the direct path. Front end: send `review: true`; show `review.problems` under the image when not ok; "needs a human" badge.

Test: scripted model: generate → review returns `{ok:false, problems:['text in image']}` → generate again → review ok → submit with `attempts: 2`.

## Task 4: Scout agent

Files: `lib/prompts/scout.js`, `lib/agents/roster/scout.js`, `lib/app.js` (`/api/sources/site` gains `deep: true`).

Role: crawl with `scan_site`, then judge coverage: if pricing, product or customers pages are missing or under 500 chars, call `fetch_url` on likely candidates found in the scan's page list (FAQ, docs, case studies). Submit `{ sources: [...], brandKit, coverage: { pricing: bool, product: bool, customers: bool, about: bool }, clientRendered: bool, notes: string }`.
validate: at least one source over 500 chars, or `clientRendered === true` with a note.
Model: `MODELS.haiku`. Budget: `{ maxTurns: 6, maxOutputTokens: 2000 }`.
Route: `deep: true` runs scout; default path unchanged. Front end: "Scan deeper" button appears after a scan with any coverage flag false.

## Task 5: Customer Researcher citation verification

File: `lib/agents/roster/customer-researcher.js` validate.
Rule: every entry in `language`, `pains`, `objections` must be traceable: either the agent supplies `citations: { "<entry>": "<url>" }` (add to schema, optional) or the entry is dropped in `postProcess` with a note in `who`. Validate: if `sources` has URLs and `citations` is missing for more than half the entries, return a problem asking for citations.

## Task 6: Fast path

Files: `lib/agents/orchestrator.js` (`ask()`), `lib/app.js` (`POST /api/ask`), `public/app.js` (an input under the results bar).

`ask({ text, campaign })`: a Haiku call with the roster list and the campaign's available artifacts decides `{ agent, inputs, constraint }` (schema-gated). Then `runAgent(agent, { ...inputs from campaign, constraint })`. Writers accept an optional `constraint` string appended to their user prompt ("Additional instruction: ..."). Return `{ agent, output, usage }`.
Supported today: copywriter (regenerate a channel with a constraint), social-planner (N more posts on a topic: inputs include `count`, `topic`; validate loosens to `posts.length === count`), strategist (alternative angles), localiser (re-run).
Front end: text box "Ask for a change…" → shows the agent used and replaces that artifact after confirmation.

## Task 7: Golden sets

Files: `evals/briefs/*.json` (three per agent kind: a rich brief with sources, a thin brief, a pt-PT brief), `evals/run.js` (runs the chain on each with the real API, records per-agent scores to `evals/results/<date>.json`), `evals/score.js` (limit compliance, avoid-term leakage, claim traceability, structural validity, citation rate).
Not run in `npm test` (spend). Document the command in README.

## Order and commits

1 → 2 → 3 → 4 → 5 → 6 → 7. One commit per task. Update README's roster paragraph when 1, 3 and 4 land.

## Tooling tasks (from 07-tooling.md)

Wire these as tools in `lib/agents/tools/`. Each is a pure function with a JSON schema; each degrades gracefully (returns `{ error }`, never throws into the agent loop). Add a scripted-model case per tool.

### Task 8: `read_url` via Jina Reader
`lib/agents/tools/read_url.js`. `GET https://r.jina.ai/<url>` with `Accept: text/markdown` and `Authorization: Bearer $JINA_API_KEY` when set (free key raises the limit from 20 to 200 requests/min). Returns `{ url, title, markdown (capped 12k), chars, via: 'jina' }`. On non-200 or timeout (10 s) fall back to `sources.extractUrl` and set `via: 'fetch'`. Replace `fetch_url` in Scout, Brand Analyst and Customer Researcher with `read_url`; keep `fetch_url` for tests. `scanSite` gains an option `reader: 'jina'|'fetch'` and uses Jina per page when a key is present; the client-rendered flag is set only if both paths return under 500 chars. Test: fixture page returns markdown; simulated 429 falls back.

### Task 9: `read_sitemap`
`sitemapper` (MIT). `read_sitemap({ url })` → `{ urls: string[] (≤200), found: boolean }`. Scout calls it before `scan_site` and merges sitemap URLs into the priority ranking (pricing, customers, case studies first). Test: fixture site gains `sitemap.xml`; Scout's coverage improves to include a page not linked from nav.

### Task 10: `search_hn`
Hacker News Algolia API (`https://hn.algolia.com/api/v1/search?query=&tags=comment`). `search_hn({ query, limit })` → `{ hits: [{ text (stripped, ≤600 chars), url (item permalink), points, date }] }`. Customer Researcher gets it as a tool and its procedure says: HN first for technical buyers. Test: mocked response parsed; citations carry the permalink.

### Task 11: `autocomplete`
Google suggest endpoint (unofficial; wrap and degrade). `autocomplete({ seed, locale })` → `{ suggestions: string[] }` or `{ error }`. Customer Researcher uses it to fill `search_terms`; results are marked `source: 'autocomplete'`. Test: mocked; error path returns empty suggestions without failing the run.

### Task 12: contrast and schema validation in code
- `wcag-contrast` (MIT): `graphics.js` scheme selection checks body ≥ 4.5:1 and display ≥ 3:1 and swaps fg/bg or falls to the dark scheme when it fails. Test: a near-white accent renders with dark text.
- `ajv` (MIT): `lib/agents/runtime.js` validates `submit` input against `agent.schema` before `validate()`, returning schema errors as gate problems (the API enforces tool input shape, but stored versions and tests need the same check). Test: a submit missing a required key is bounced with the ajv message.

Env additions: `JINA_API_KEY` (optional). Update `.env.example`, README, CLAUDE.md commands.
