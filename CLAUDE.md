# CLAUDE.md — working in this repository

Campaign Forge: an agentic campaign builder for one marketer running several
clients. **New here? Read `HANDOVER.md` first, then this file.** Read this
before changing anything.

Design documents: `docs/Campaign-Forge-Product-and-Build-Plan.docx` (the plan),
`AGENTS.md` (agent architecture), `INFRASTRUCTURE.md` (target infrastructure),
`ARCHITECTURE.md` (production integration), `docs/DATA-HANDLING.md` (what is
stored and what leaves), `docs/DEPLOY.md` (deployment runbook),
`docs/HUMAN-ACTIONS.md` (the setup steps only the owner can do).

Build specs are in `docs/build/`, indexed by `docs/build/00-README.md`. Work
from the spec for the current phase; do not skip ahead. When a spec and this
file disagree, this file wins.

**Current position.** Phases 1 to 4 are built and committed (32 commits, 9 test
suites, ~9,000 lines across `web/`, `lib/` and `evals/`). The backlog, in
order, is in `HANDOVER.md` §6: agent training (`06-agent-training.md`), the
rest of Week 2 (`01-week2-reviewers.md`: Art Director, Scout, citation
verification, orchestrator fast path), the unbuilt tooling tasks
(`07-tooling.md`), `04-phase3-authority.md` §11 to 15, and the PDF export pack
in `05-phase4-rigour.md` §6. `06-agent-training.md` runs alongside every phase:
when a phase's schedule in its §4 names an agent, build that agent's knowledge
pack in the same phase.

## Commands

```
npm install                          # root: test deps and the legacy Express app
cd web && npm install && cd ..       # the product; this is where the real deps live

npm run web                          # Next dev server on web/ (http://localhost:3000)
MOCK_CLAUDE=1 MOCK_AUTH=1 npm run web    # the whole product on fixtures, no key, no Firebase

npm run web:build                    # Next production build; this typechecks
npm run legacy                       # the retired Express prototype in legacy/
MOCK_CLAUDE=1 npm run legacy         # same, on fixtures

npm test                             # nine suites, in order (see Testing below)
npm run test:emulator                # data layer against real Firestore. Needs Java.
                                     # Not part of npm test; must pass before a release.

npm run evals:mock                   # exercise the eval harness, no spend
npm run evals                        # the real thing: about EUR 10-15 for five briefs
npm run gate                         # compare the last two real runs, fail on regression
```

**Two prerequisites that are not obvious and will waste your afternoon:**

1. **`npm run web:build` needs `MOCK_CLAUDE=1` or a real `ANTHROPIC_API_KEY`.**
   `web/core/claude.js` throws at module load when neither is set, and Next
   evaluates route modules during page-data collection, so a bare
   `npm run web:build` fails after a clean typecheck with
   `Failed to collect page data for /api/clients/[id]/campaigns/[cid]/run/[agent]`.
   That is the guard doing its job, not a bug. On Vercel the key is set as an
   environment variable so the build passes there.

2. **Five of the nine test suites need a built `web/.next` first.** `api`,
   `pages`, `phase2`, `phase3` and `phase4` each spawn `next start`, which
   refuses to run without a production build. `npm test` does not build for
   you. Run `MOCK_CLAUDE=1 npm run web:build` before `npm test` on a fresh
   clone or after changing anything under `web/`.

`npm run dev` in `package.json` points at a root `server.js` that no longer
exists. Use `npm run web` or `npm run legacy`.

Run `npm test` before and after every change. Add a test when you add a
behaviour.

## Invariants (do not break these)

1. **Judgement to the model, determinism to code.** Anything that must be
   identical every run (limits, compliance, UTMs, graphics, activation
   structure, pricing) is code. Never ask a model to do it.
2. **Every agent output is gated.** An agent's final output arrives via the
   `submit` tool, checked against its schema and `validate()`. Violations go
   back to the agent. Never accept an output that fails its gate; never
   silently fix one.
3. **Validators are tools and gates.** The same function is offered as a tool
   (the agent can check early) and enforced on submit (the runtime insists).
4. **Packets are assembled in code** (`web/core/agents/packets.js`). No agent
   is prompted by another agent's prose.
5. **Flags, never silent edits.** Over-limit copy, an avoid term, an unapproved
   claim: flag it in the output for the person. Do not trim, rewrite or drop.
6. **Every model call is priced** at its model's rate and returned as `usage`
   (`web/core/pricing.js`). New models get a rate with the date it was checked
   in the comment.
7. **Images are on demand**, never generated automatically, always with the
   cost shown first.
8. **Nothing about a client is assumed.** The tool reads the site, the sources
   and the web. If it does not know, it says so (gaps); it does not invent.
9. **API keys never reach the browser.** Server-side only.
10. **British English** in prompts, UI copy and docs. Brand name spelling
    exactly as registered. No em-dashes in generated copy.
11. **The store is optional.** Without `FIREBASE_SERVICE_ACCOUNT` the app runs
    against an in-memory store and `MOCK_AUTH=1` bypasses sign-in. Every test
    suite runs this way, and a reviewer must be able to run the product with no
    Firebase project. Never make a code path require the store.
12. **Agent inputs are assembled server-side** (`web/server/inputs.ts`), never
    sent by the browser. A resumed campaign must make the same decisions as a
    fresh one.
13. **Third-party tools degrade, never block.** Every external tool (Jina,
    LanguageTool, Pexels, autocomplete, HN) returns `{ error }` on failure and
    the agent continues; a gate may only depend on a tool when a fallback
    exists. Licences: MIT/Apache/ISC/MPL embed freely; AGPL only behind an API
    boundary and noted in the README; respect the terms listed in
    `docs/build/07-tooling.md`.

## Layout

The runtime lives at **`web/core/`**, not `lib/`. It moved there so Vercel
traces and installs it from the project root (`web`). `lib/` is now thin
re-export shims so `legacy/` and the tests can keep requiring it.

```
web/                         The product. Next.js 16, App Router
  package.json               where the real dependencies are declared
  proxy.ts                   Next 16 renamed middleware to proxy; default export
  core/                      the runtime and everything deterministic. Plain CommonJS
    agents/runtime.js        the loop: tools, submit schema, gate, budgets, trace, ledger
    agents/orchestrator.js   runAgent(name, inputs) with memory + packet; runCampaign(brief)
    agents/roster/<agent>.js name, fixture, model, temperature, role, tools, budget,
                             schema, packet(), validate(), postProcess()
    agents/tools/            what agents may call; each { name, description,
                             input_schema, run(input, packet) }
    agents/tools/compliance.js  checkCompliance(output, rules) -> flags
    agents/packets.js        contextBlock(), buildRules(), loadMemory()
    prompts/<pass>.js        role text + user prompt builders
    memory/                  exemplars, learnings, corrections, approvedClaims;
                             Firestore with an in-memory fallback
    claude.js                the SDK client; throws at load if no key and no MOCK_CLAUDE
    pricing.js limits.js utm.js graphics.js scraper.js images.js sources.js
    brief.js verdicts.js mock.js
  server/db.ts               typed data layer, Firestore or in-memory
  server/inputs.ts           buildInputs + staleAgents + DEPENDS. Read before touching runs
  server/auth.ts             single-user session handling
  server/spend.ts            the monthly ceiling; refuses a run before it spends
  server/telemetry.ts assets.ts exemplars.ts results.ts resultsStore.ts storage.ts
  app/api/                   29 routes: agent runs, clients, campaigns, sources, claims,
                             learnings, results, images, package, regenerate, audit,
                             ledger, prompts, settings, telemetry, export, files, health
  app/clients/               library and workbench pages
  components/                panels, counters, tabs, editors
  types/archiver.d.ts        local declaration; do not install @types/archiver

lib/                         thin shims re-exporting web/core, for legacy/ and tests
legacy/                      the prototype Express app and vanilla front end. Still runs;
                             kept because it exercises the runtime through a second client
knowledge/                   per-agent expertise packs and worked examples. 47 files
evals/                       golden briefs, scorers, merge gate. See evals/README.md
test/                        nine suites plus fixture-site/
scripts/deploy-rules.js      injects ALLOWED_EMAIL into the Firestore/Storage rules
docs/build/                  phase specs
```

**Roster today** (12 agents, `web/core/agents/roster/index.js`): brief-reader
(Haiku), brand-analyst, customer-researcher, strategist, copywriter,
social-planner, ops-architect, localiser, critic, field-editor, landing-writer,
analyst. `knowledge/` already holds packs for agents that are not built yet
(art-director, scout, seo, cro, media-planner, paid-social, search-specialist,
content-writer, video-scriptwriter, orchestrator, tracking). Packs existing is
not the same as the agent existing.

## Conventions

- Plain Node, CommonJS, no build step for `web/core/`. TypeScript only in
  `web/app/`, `web/server/` and `web/components/`. `web/core` is imported from
  TypeScript with `require()` through the `@core/*` path alias. This is
  deliberate: it keeps one runtime shared by `web/` and `legacy/`. Do not
  convert it.
- Small modules with a header comment saying what the file is for and why it is
  shaped that way. Match the surrounding comment density.
- An agent file is data plus small functions. Role text lives in
  `web/core/prompts/`. The role must ask for the `submit` tool, never for
  "JSON only".
- A new tool: add to `web/core/agents/tools/index.js` with a JSON schema; keep
  `run` pure where possible.
- A new agent: add to `web/core/agents/roster/index.js`, a fixture in
  `web/core/mock.js` under its `fixture` key, an entry in `DEPENDS` in
  `web/server/inputs.ts` if it consumes another agent's output, and a
  scripted-model case in `test/runtime.test.js`.
- Route shapes the front end reads are contracts. Change them and the front end
  together, with the test.
- Errors are JSON `{ error, pass?, details? }` with a real status code.
  Messages say what to do, not just what failed.
- Commit messages: one line what, then a paragraph why. No emoji.

## Testing

`npm test` runs these in order. Build `web/` first (see Commands).

| Suite | What it proves |
|---|---|
| `runtime.test.js` | The agent loop: self-repair on validation failure, tool round-trips, budget exhaustion, the nudge when a model talks instead of submitting. Uses a **scripted model**, a queue of fake API responses. No spend. This is the pattern for testing any agent behaviour |
| `db.test.js` | Every data-layer helper, the `current` pointer, version history, ledger totals. Compiles `server/db.ts` on the fly |
| `export.test.js` | The CSV builders, as pure functions |
| `api.test.js` | The Phase 1 route contract end to end: scan to client, dependency refusal, seven agents persisted, resume, stale detection, ledger, export zip |
| `phase2.test.js` | Editing, approval refusal, the export gate, regeneration, an edit surviving a re-run, claim expiry |
| `phase3.test.js` | Landing page, results mapping and matching, verdicts, learnings, exemplars |
| `phase4.test.js` | Cost ceiling, telemetry, audit mode, prompts API |
| `pages.test.js` | Pages render populated data server-side; image round trip; ledger and settings. Catches the port bugs typechecking misses |
| `frontend.test.js` | The legacy front end, driving the runtime through a different client. Must end with `JS errors: []`. Delete with `legacy/` when task 20 says so |

Nine files, eleven named suites: `runtime.test.js` reports `critic` and
`runtime` separately, and `db.test.js` reports `memory` and `db`. Both counts
appear in older notes and both are right.

The five server-backed suites start Next through
`test/helpers/next-server.js`, which spawns the CLI's JS entry point with this
process's own node binary. Do not go back to `spawn('npx', ...)`: `npx` is
`npx.cmd` on Windows and spawn() without a shell cannot execute a `.cmd`, so
every one of those suites died with `ENOENT` before its first assertion. The
helper also checks for `web/.next` up front and says which command to run,
rather than letting a missing build surface as connection-refused errors.

The fixture site is still `spawn('python3', ...)`, which needs Python on
`PATH`. That one works as-is on Windows, macOS and Linux, but it is the
remaining non-Node dependency in the test path.

Add a test with every behaviour: a new agent needs a scripted-model case, a new
route needs an api-test case, a new page needs a render assertion.

Real-API runs are manual and cost money. Record cost and duration per agent in
the PR description when you do one.

## Traps

Each of these cost someone time to discover.

- **`web/core/claude.js` throws at module load** when there is no
  `ANTHROPIC_API_KEY` and no `MOCK_CLAUDE`. That is why builds and scripts need
  one or the other. Never move this check to first-request time.
- **Next 16 renamed `middleware` to `proxy`.** The file is `web/proxy.ts` and
  exports a default function.
- **`archiver`'s published types are not callable under ESM.** There is a local
  declaration in `web/types/archiver.d.ts`. Do not install `@types/archiver`;
  it makes it worse.
- **Next bundles route handlers and server components into separate module
  graphs**, so a module-level `Map` exists twice. The in-memory stores in
  `db.ts` and `storage.ts` are pinned to `globalThis` for exactly this reason.
  If you add another in-memory store, do the same.
- **`approvedClaims` returning `null` is meaningful**, and different from `[]`.
  Null means no registry exists yet, so `buildRules` falls back to context proof
  points and treats claim flags as warnings. An empty array means "nothing is
  approved", and every number in the copy becomes a violation.
- **Mock fixtures deliberately contain one over-limit Google headline** so the
  validation flag is visible without waiting for a real model to slip. It is
  commented in `web/core/mock.js`. Do not "fix" it.
- **Storage refs are not URLs.** They are paths like
  `users/owner/clients/<id>/...`; rendering one goes through
  `/api/files/[...ref]`.
- **`web/` and `legacy/` share the runtime.** A change to `web/core/` must keep
  both green, which is why the legacy suite still runs.
- **Two lockfiles.** Root and `web/`. Next warns about inferring the workspace
  root on every build. Harmless, but do not delete either: the root one carries
  the test and legacy deps, `web/`'s carries the product's.
- **Model IDs in `web/core/pricing.js` are a generation behind.**
  `claude-sonnet-4-6` at USD 3/15 and `claude-haiku-4-5-20251001` at USD 1/5
  are both still valid IDs at correct rates, so nothing is broken, but the
  Claude 5 family now exists. Changing them is a pricing and quality decision
  for the owner, not a maintenance edit. Invariant 6 applies: any new rate
  carries the date it was checked.

## Do not

- Do not remove mock mode. A reviewer must be able to run the product with no
  key and no Firebase project.
- Do not put prompts in the front end.
- Do not "improve" generated copy in code. Flag it.
- Do not loosen a gate, validator or compliance rule to make an agent's output
  pass.
- Do not delete `legacy/` before task 20 says so.
- Do not convert `web/core/` to TypeScript or ESM.
- Do not add a second model provider, a queue, multi-user support, or platform
  publishing integrations. All are deliberately deferred; see `HANDOVER.md` §8
  for the full list of what is the owner's call rather than yours.

## Deploying

Vercel, with **Root Directory set to `web`**. Framework preset Next.js, no
build or install command overrides; `vercel.json` only raises the function
timeout to 300 seconds. The runtime lives at `web/core/` and `web/package.json`
carries every dependency it needs, because Vercel traces files from the root
directory and anything above it is not reliably included.

To check a change will deploy, simulate it locally from a clean copy:

```bash
cd web && rm -rf node_modules .next && npm install && MOCK_CLAUDE=1 npm run build
```

`docs/DEPLOY.md` is the full runbook (Firebase, rules, environment variables).
