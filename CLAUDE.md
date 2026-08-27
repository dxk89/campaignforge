# CLAUDE.md — working in this repository

Campaign Forge: an agentic campaign builder for one marketer running several clients. **New here? Read `HANDOVER.md` first, then this file.** Read this before changing anything. The design documents are `docs/Campaign-Forge-Product-and-Build-Plan.docx` (the plan), `AGENTS.md` (agent architecture), `INFRASTRUCTURE.md` (target infrastructure), `ARCHITECTURE.md` (production integration). Build specs per phase are in `docs/build/`. Work from the spec for the current phase; do not skip ahead. **Current position: Phase 1 tasks 1-8 and 10 are built; `docs/build/02b-phase1-remaining.md` is the next work.** `docs/build/06-agent-training.md` runs alongside every phase: when a phase's schedule in its §4 names an agent, build that agent's knowledge pack in the same phase.

## Commands

```
npm install                          # root: the shared lib/ and the legacy Express app
cd web && npm install && cd ..       # the Next.js app (Phase 1 onward)

npm start                            # legacy Express app on lib/ (being retired in Phase 1 task 10)
MOCK_CLAUDE=1 npm start              # same, on fixtures

npm run web                          # Next dev server (web/)
npm run web:build                    # Next production build; this typechecks

npm test                             # runtime + db + api + front-end suites
```

Phase 1 note: `web/` is the product. `lib/` is shared by both and stays plain CommonJS. `public/` and `server.js` are the legacy front end and are retired in task 10.

Run `npm test` before and after every change. Both suites must pass. Add a test when you add a behaviour.

## Invariants (do not break these)

1. **Judgement to the model, determinism to code.** Anything that must be identical every run (limits, compliance, UTMs, graphics, activation structure, pricing) is code. Never ask a model to do it.
2. **Every agent output is gated.** An agent's final output arrives via the `submit` tool, checked against its schema and `validate()`. Violations go back to the agent. Never accept an output that fails its gate; never silently fix it.
3. **Validators are tools and gates.** The same function is offered as a tool (agent checks early) and enforced on submit (runtime insists).
4. **Packets are assembled in code** (`lib/agents/packets.js`). No agent is prompted by another agent's prose.
5. **Flags, never silent edits.** Over-limit, avoid term, unapproved claim: flag it in the output for the person. Do not trim, rewrite or drop.
6. **Every model call is priced** at its model's rate and returned as `usage` (`lib/pricing.js`). New models get a rate with a date in the comment.
7. **Images are on demand**, never generated automatically, always with the cost shown first.
8. **Nothing about a client is assumed.** The tool reads the site, the sources and the web. If it does not know, it says so (gaps), it does not invent.
9. **API keys never reach the browser.** Server-side only.
10. **British English** in prompts, UI copy and docs. Brand name spelling exactly as registered. No em-dashes in generated copy.
11. **The store is optional.** Without `FIREBASE_SERVICE_ACCOUNT` the app runs against an in-memory store and `MOCK_AUTH=1` bypasses sign-in. Every test suite runs this way, and a reviewer must be able to run the product with no Firebase project. Never make a code path require the store.
12. **Agent inputs are assembled server-side** (`web/server/inputs.ts`), never sent by the browser. A resumed campaign must make the same decisions as a fresh one.
13. **Third-party tools degrade, never block.** Every external tool (Jina, LanguageTool, Pexels, autocomplete, HN) returns `{ error }` on failure and the agent continues; a gate may only depend on a tool when a fallback exists. Licences: MIT/Apache/ISC/MPL embed freely; AGPL only behind an API boundary and noted in README; respect the terms listed in `docs/build/07-tooling.md`.

## Layout

```
server.js, api/index.js      entry points (process, serverless); both serve lib/app.js
lib/app.js                   Express routes
web/core/agents/runtime.js   the loop: tools, submit schema, gate, budgets, trace, ledger
lib/*.js                     thin shims re-exporting web/core (for legacy/ and tests)
lib/agents/orchestrator.js   runAgent(name, inputs) with memory + packet; runCampaign(brief)
lib/agents/roster/<agent>.js name, fixture, model, role, tools, budget, schema, packet(), validate(), postProcess()
lib/agents/tools/            functions agents may call; each { name, description, input_schema, run(input, packet) }
lib/agents/tools/compliance.js  checkCompliance(output, rules) → flags
lib/agents/packets.js        contextBlock(), buildRules(), loadMemory()
lib/memory/                  exemplars, learnings, corrections, approvedClaims (stubbed empty until Phase 1)
lib/prompts/<agent>.js       role text + user prompt builders (roster imports these)
lib/limits.js                LIMITS, SOCIAL_LIMITS, validateAssets, validateSocial
lib/utm.js graphics.js scraper.js images.js sources.js pricing.js brief.js
lib/mock.js                  FIXTURES per agent + USAGE; MOCK_CLAUDE=1 returns these
public/                      front end (plain JS; rebuilt in Next.js in Phase 1)
test/                        runtime.test.js, frontend.test.js, fixture-site/
docs/build/                  phase specs
```

## Conventions

- Plain Node, CommonJS, no build step for `lib/`. Small modules with a header comment saying what the file is for and why it is shaped that way.
- An agent file is data plus small functions. Role text lives in `lib/prompts/`. The role must ask for the `submit` tool, never for "JSON only".
- A new tool: add to `lib/agents/tools/index.js` with a JSON schema; keep `run` pure where possible.
- A new agent: add to `lib/agents/roster/index.js`, a fixture in `lib/mock.js` under its `fixture` key, a scripted-model case in `test/runtime.test.js`.
- Route shapes the front end reads (`/api/pass/*`) are contracts. Change them and the front end together, with the test.
- Errors are JSON `{ error, pass? , details? }` with a real status code. Messages say what to do, not just what failed.
- Commit messages: one line what, then a paragraph why. No emoji.

## Testing notes

- `test/runtime.test.js` stubs `client.messages.create` with a scripted queue of responses. Use it to test gates, tool round-trips and budgets without spend.
- `test/frontend.test.js` starts the mock server on 3111 and the fixture site on 8099, drives `public/app.js` in jsdom through scan → generate → every tab → exports. It must end with `JS errors: []`.
- Real-API tests are manual. Record cost and duration per agent in the PR description when you run one.

## Do not

- Do not add a database, auth or framework before the Phase 1 spec says so.
- Do not remove mock mode. A reviewer must be able to run the UI with no key.
- Do not put prompts in the front end.
- Do not "improve" generated copy in code. Flag it.
