# HANDOVER

You are taking over Campaign Forge. This document tells you what it is, what is built, what is not, how to work on it, and what to do first. Read it once in full before touching anything. Then work from `docs/build/` and never from memory of this file.

Written 27 August 2026, at commit `fa7f447`.

---

## 1. What this is

A campaign operating system for **one marketer running several clients**. Point it at a client's website, give it a brief, and a roster of specialised agents researches the company and its customers, chooses a strategy, writes every channel, plans a month of social with on-brand graphics, builds the lifecycle, sales handoff and measurement layer, and adapts it all for Portugal. The cost of every step is shown.

**Who uses it.** One operator, many clients. A full-stack marketer, fractional CMO or agency principal. Not a team product. The client is a subject of the tool, not a user of it.

**Why it exists.** Two reasons, and both shape decisions. It is a portfolio piece demonstrating that its author ships production systems with AI assistance, and it is a real tool intended for third-party client work. When those pull in different directions, the real tool wins: nothing goes in that would embarrass someone using it on a paying client.

**The one design principle everything follows.** *Judgement goes to the model; determinism goes to code.* Models write, choose and reason. Code checks, renders, prices, tracks and enforces. If something must be identical on every run, a model must not produce it.

---

## 2. The state of the repository

19 commits, 83 source files, five test suites, all green.

```
CLAUDE.md               Read this second. Invariants, layout, conventions, commands
HANDOVER.md             This file
docs/
  build/                The specs you work from. 00-README.md is the index
  Campaign-Forge-Product-and-Build-Plan.docx   The plan for humans, not for you
  DATA-HANDLING.md      What is stored and what leaves the system
AGENTS.md               Agent architecture rationale
INFRASTRUCTURE.md       Target infrastructure rationale
ARCHITECTURE.md         How this reaches real ad platforms and CRMs, one day
README.md               For a person arriving at the repo

web/core/               The agent runtime and everything deterministic. Plain CommonJS.
                        Lives inside web/ so Vercel traces and installs it.
                        lib/ holds thin re-export shims for legacy/ and the tests.
  agents/runtime.js     The loop every agent runs on
  agents/orchestrator.js  runAgent(name, inputs); runCampaign(brief)
  agents/roster/        One file per agent: role, model, tools, schema, packet, validate
  agents/tools/         What agents may call, including the compliance scanner
  agents/packets.js     What each agent is shown, assembled in code
  memory/               Client memory interface. Currently returns empty (task 17)
  prompts/              Role text and packet builders
  limits.js utm.js graphics.js scraper.js images.js sources.js pricing.js brief.js

web/                    The product. Next.js 16, App Router, TypeScript in app/ only
  server/db.ts          Typed data layer, Firestore or in-memory
  server/inputs.ts      buildInputs + staleAgents. Read this before touching runs
  server/auth.ts        Single-user session handling
  app/api/              One route per agent run, clients, sources, images, ledger, export
  app/clients/          Library and workbench pages
  components/           Panels, counters, tabs

legacy/                 The prototype Express app and vanilla front end. Still runs.
                        Kept because it exercises lib/ through a second client.
knowledge/              Per-agent expertise packs and worked examples. 47 files
test/                   Five suites. See §5
scripts/deploy-rules.js Injects ALLOWED_EMAIL into the rules templates
```

### What works today

Sign in with one allowlisted Google account. Create a client from a URL: the scanner reads up to eight pages, mines the CSS for a palette, and stores the pages as sources. Edit voice rules. Create a campaign, fill a brief, and run seven agents in dependency order; each is a separate request, each result is written as an immutable version before the response returns, and the cost goes to a ledger. Eleven result tabs render from stored data. Close the tab and come back: nothing is lost, and a Resume button finishes a part-run campaign. Edit the brief and downstream agents are marked stale. Export everything for a client as a zip. A ledger page breaks spend down by client, agent and call.

**Run it with no keys and no accounts:**

```bash
npm install && cd web && npm install && cd ..
MOCK_CLAUDE=1 MOCK_AUTH=1 npm run web        # http://localhost:3000
npm test                                      # all five suites
```

### What does not work yet

`docs/build/02b-phase1-remaining.md` is the authoritative list. In short: several routes exist that no page calls (URL and paste sources, brand assets, image generation, the tracking table), the briefing-document upload and the three campaign exports were not ported from the prototype, memory still returns empty, the Firestore path has never actually run, and there is no deployment runbook.

---

## 3. Non-negotiables

`CLAUDE.md` holds the full list. These are the ones that will cause real damage if you break them.

1. **Every agent output is gated.** An agent's answer arrives through the `submit` tool, checked against its JSON schema and its `validate()`. Failures go back to the agent as errors to fix. Never accept a failing output, never silently repair one.
2. **Flags, never silent edits.** Over-limit copy, an avoid term, an unapproved claim: flag it for the person. Do not trim, rewrite or drop. The whole trust proposition rests on this.
3. **Nothing is invented.** If the research found no proof points, the copy is capability-led and the gap is reported. An agent that fills a gap with a plausible number is the worst failure this system can have, because nothing downstream can detect it.
4. **The store is optional.** Without `FIREBASE_SERVICE_ACCOUNT` the app runs in memory, and `MOCK_AUTH=1` bypasses sign-in. Every suite runs this way. Never make a code path require the store.
5. **Agent inputs are assembled server-side** in `web/server/inputs.ts`, never sent by the browser. A resumed campaign must make the same decisions as a fresh one.
6. **Third-party tools degrade, never block.** Jina, LanguageTool, Pexels, autocomplete: each returns `{ error }` on failure and the agent continues.
7. **API keys never reach the browser.**
8. **British English** in prompts, UI copy and docs. No em-dashes in generated copy.

---

## 4. How to work on this

**Take one spec at a time.** Open `docs/build/00-README.md`, find the current phase, work its tasks in order. Do not skip ahead and do not start the next phase.

Start a session like this:

```
Read CLAUDE.md and docs/build/02b-phase1-remaining.md.
Work through the tasks in order. After each task run `npm test` and show me the result.
Commit each task separately. Do not start the next phase.
```

**Per task:** implement, run `npm test`, commit with a one-line summary and a paragraph of *why*. If a spec's contract cannot be met, stop and say why rather than changing the contract. Where a spec says *decide*, make the call and record it in the commit message.

**Each phase spec opens with the assumptions it inherits.** Verify them on entry. If a field name differs from what actually shipped, adapt the spec to reality and note it in the first commit of the phase. Do not retrofit earlier phases to match a later spec.

**When you find a bug outside the current task,** fix it if it is small and mention it in the commit, or add it to the current spec's task list if it is not. Do not leave it silent.

---

## 5. Testing

```bash
npm test    # runtime → db → api → pages → frontend
```

| Suite | What it proves | Notes |
|---|---|---|
| `test/runtime.test.js` | The agent loop: self-repair on validation failure, tool round-trips, budget exhaustion, the nudge when a model talks instead of submitting | Uses a **scripted model** (a queue of fake API responses). No spend. This is the pattern for testing any agent behaviour |
| `test/db.test.js` | Every data-layer helper, the `current` pointer, version history, ledger totals | Compiles `server/db.ts` on the fly |
| `test/api.test.js` | The Phase 1 route contract end to end: scan to client, dependency refusal, seven agents persisted, resume, stale detection, ledger, export zip | Runs a built Next server in mock mode |
| `test/pages.test.js` | Pages render populated data server-side; image round trip; ledger and settings | Catches the port bugs that typechecking misses |
| `test/frontend.test.js` | The legacy front end, driving `lib/` through a different client | Delete with `legacy/` when task 20 says so |

**Add a test with every behaviour.** A new agent needs a scripted-model case; a new route needs an api-test case; a new page needs a render assertion.

Real-API runs are manual and cost money. Record cost and duration per agent when you do one.

---

## 6. The backlog, in order

Everything below is specified. Do not invent work.

| Order | Spec | Scope | Effort |
|---|---|---|---|
| **1** | `02b-phase1-remaining.md` | Finish Phase 1: nav, source and asset wiring, brief upload, image UI, exports, tracking table, memory on Firestore, emulator run, deploy runbook | 4–6 days |
| **2** | `01-week2-reviewers.md` | Critic, Art Director with image review, Scout, citation checks, orchestrator fast path, the orient and self-check tools, Jina, sitemap, HN search, contrast, ajv | 5–6 days |
| **3** | `03-phase2-workspace.md` | Editing, per-asset regeneration, versions with diff, claims registry, compliance gate, approvals, retext and LanguageTool | 8–10 days |
| **4** | `04-phase3-authority.md` | Provenance, rescan, landing page writer, results ingestion, verdicts in code, analyst and learnings, exemplars, image review grid, calendar, Pexels, Satori | 7–9 days |
| **5** | `05-phase4-rigour.md` | Evals with promptfoo, merge gate, prompts as versioned data, Critic audit mode, export pack, cost ceiling, telemetry | 5–6 days |
| ongoing | `06-agent-training.md` | Knowledge packs per agent, on the schedule in its Part 4 | ~1 day per agent |
| reference | `07-tooling.md` | Free tools per agent. Already folded into each phase as "Tooling tasks" | — |

**Phase 2 is the gate for showing this to anyone outside.** Until editing, approvals and the claims registry exist, it is a demonstration rather than a tool a person uses daily.

---

## 7. Things that will confuse you

Written down because each one cost time to discover.

- **Next 16 renamed `middleware` to `proxy`.** The file is `web/proxy.ts` and exports a default function.
- **`archiver`'s published types are not callable under ESM.** There is a local declaration in `web/types/archiver.d.ts`. Do not install `@types/archiver`; it makes it worse.
- **Next bundles route handlers and server components into separate module graphs.** A module-level `Map` exists twice. The in-memory stores in `db.ts` and `storage.ts` are pinned to `globalThis` for exactly this reason. If you add another in-memory store, do the same.
- **`lib/` is CommonJS and imported from TypeScript with `require()`** through the `@core/*` path alias. This is deliberate: it keeps one runtime shared by `web/` and `legacy/`. Do not convert it.
- **Storage refs are not URLs.** They are paths like `users/owner/clients/<id>/…`. Rendering one needs the file-streaming route in task 12.
- **`approvedClaims` returning `null` is meaningful**, and different from `[]`. Null means no registry exists yet, so `buildRules` falls back to context proof points and treats claim flags as warnings. An empty array would mean "nothing is approved", and every number in the copy would become a violation.
- **Mock fixtures deliberately contain one over-limit Google headline** so the validation flag is visible without waiting for a real model to slip. It is commented in `lib/mock.js`. Do not "fix" it.
- **The `web/` app and `legacy/` app share `lib/`.** A change there must keep both green, which is why the legacy suite still runs.

---

## 8. What is not yours to decide

Ask the owner rather than choosing:

- Anything that would store or transmit client data differently from `docs/DATA-HANDLING.md`.
- Adding a second model provider, a queue, multi-user support, or platform publishing integrations. All are deliberately deferred and named in the specs.
- Changing a phase's contracts. Contracts are fixed within a phase; adapt to what shipped, do not redesign.
- Deleting `legacy/` before task 20 says so.
- Loosening any gate, validator or compliance rule to make an agent's output pass.

## 9. What is definitely yours

- Implementation choices inside a task: component structure, file organisation, naming, library selection where the spec does not name one.
- Fixing bugs you find, with a note in the commit.
- Improving a test.
- Anything marked *decide* in a spec.

---

## 10. First session

```
Read CLAUDE.md and docs/build/02b-phase1-remaining.md.
Start with task 11 (global navigation), then 12 (library source and asset wiring).
Run `npm test` after each and show me the output. Commit each task separately.
Stop after task 12 and summarise what changed.
```

Tasks 11 and 12 are small and touch the parts you will work in for weeks. They are a good way to find out whether this document told you the truth.

---

## 11. Deploying to Vercel

The build failed originally because `lib/` sat outside `web/`: Vercel installs
dependencies and traces files from the project's **Root Directory**, and
anything above it is not reliably included. The runtime now lives at
`web/core/`, and `web/package.json` carries every dependency it needs.

In the Vercel project settings, **Root Directory must be `web`**. Framework
preset Next.js (detected automatically). No build or install command overrides;
`vercel.json` only raises the function timeout to 300 seconds.

To check a change will deploy, simulate it locally:

```bash
cd web && rm -rf node_modules .next && npm install && npm run build
```

If that passes from a clean copy, Vercel will build.
