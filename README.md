# Campaign Forge

Brief in, campaign out. An agentic marketing campaign system built for working on someone else's company: point it at a client's website, give it a brief, and a chain of passes reads the site for voice and style, researches the customer, chooses an angle, writes every channel, plans a month of social with on-brand graphics, builds the lifecycle, handoff and measurement layer, and adapts it for Portugal. The token cost of every step is shown.

Built as a portfolio piece by a marketer who ships production apps with AI assistance. The code is meant to be read.

## What it does

1. **Brief.** Five fields: product, description, audience, objective, tone. Or upload a briefing document (PDF, DOCX, TXT, MD) and the fields fill in; the document is kept as a source.
2. **Company voice.** Upload brand guidelines, product pages, past campaigns, customer quotes, sales decks. Fetch a URL. Paste text. Optionally let it search the company's website.
3. **Generate.** One request, four sequential Claude calls:
   - *Research* distils the material into a company context: voice, preferred and avoided terms, proof points with sources, product facts, audience insights, competitors, a glossary, and gaps.
   - *Strategy* proposes three angles grounded in that context and picks one.
   - *Assets* writes 3 Meta ads, 3 LinkedIn ads, a Google RSA (8 headlines, 4 descriptions) and a 3-email nurture sequence with a branch note, all executing the chosen angle in the company's voice.
   - *Localisation* (if Portuguese is ticked) adapts, rather than translates, everything into pt-PT using the glossary.
5. **Check.** Every character limit is stated in the prompt and then validated in code. Breaches are flagged in the interface, not silently accepted.
5. **Economics.** Tokens in and out per pass, web searches, cost in EUR at dated rates, generation time.
6. **Export.** Copy any asset. Export everything as JSON, or as CSV with one row per field.

## Run it locally

```bash
git clone <this repo> && cd campaign-forge
npm install                 # shared lib/ and the legacy app
cd web && npm install && cd ..
cp .env.example .env        # ANTHROPIC_API_KEY; everything else is optional
npm run web                 # http://localhost:3000
```

No key, no Firebase project, no accounts:

```bash
MOCK_CLAUDE=1 MOCK_AUTH=1 npm run web
```

That runs the whole product on fixtures against an in-memory store. It is how the test suites run, and it is deliberate: a reviewer should be able to see everything working in one command.

`npm test` runs five suites: the agent runtime against a scripted model, the data layer, the API contract, server-rendered pages, and the legacy front end.

Mock mode returns a fixture campaign for a fictional product (Ledgerline). One Google headline in the fixture is deliberately over the limit so you can see the validation flag.

## Deploy

**Vercel.** Push the repo to GitHub, import it at vercel.com/new (framework preset: Other), add `ANTHROPIC_API_KEY` under Environment Variables, deploy. Or from the terminal:

```bash
npm i -g vercel
vercel                      # first run links the project
vercel env add ANTHROPIC_API_KEY
vercel --prod
```

`vercel.json` routes every `/api/*` request to one function (`api/index.js`, which is the same Express app as `server.js`) and gives it a 300-second limit, which is the Fluid compute maximum on every plan. The front end in `public/` is served from the CDN. Set `MOCK_CLAUDE=1` as an environment variable to demo without spend.

**Render.** `render.yaml` describes one free-tier web service. Connect the repo, deploy, then add `ANTHROPIC_API_KEY` in the dashboard. Health check is `/api/health`.

## Layout

```
web/                    The product: Next.js app, auth, Firestore layer, pages
web/server/db.ts        Typed data layer; in-memory fallback when Firebase is absent
web/server/inputs.ts    Assembles each agent's inputs from stored artifacts; staleness
web/app/api/            One route per agent run, clients, sources, images, ledger, export
legacy/                 The prototype Express app and front end, kept for one release
lib/app.js              Express routes for the legacy app
lib/agents/runtime.js   The loop every agent runs on: tools, submit schema, validators as gates, budgets, trace
lib/agents/orchestrator.js  Runs one agent with its packet and memory, or the default campaign plan
lib/agents/roster/      One file per agent: role, model, tools, schema, packet, validate
lib/agents/tools/       What agents can call: validators, compliance scanner, fetch, scan, render, images
lib/memory/             Client memory interface (exemplars, learnings, corrections, claims); empty until Phase 1
lib/claude.js           One helper: JSON-only call, fence stripping, usage capture
lib/limits.js           Character limits, used by the prompts and the validator
lib/pricing.js          Dated per-token rates
lib/sources.js          PDF / DOCX / text / URL -> plain text
lib/mock.js             Fixtures for MOCK_CLAUDE=1
lib/prompts/            One file per pass: brief, research, strategy, assets, localise
public/                 index.html, styles.css, app.js. No framework, no build step
ARCHITECTURE.md         How this would be wired into real ad platforms and a CRM
```

## How it runs: agents, not prompts

Each section is its own agent on a shared runtime (`lib/agents/runtime.js`): a role, a set of tools, a submit schema, a validator and a budget. An agent works in a loop: it can call its tools (the limit checker, the compliance scanner, the activation validator, a page fetcher, the card renderer), and it finishes by calling `submit`, whose input is checked against the schema and the validator. If the check fails, the errors go back to the agent as a tool result and it revises; the runtime never accepts an over-limit headline, a competitor name or a Brazilian form. Every run keeps a trace of what it called and what it was told.

Roster today: brief-reader (Haiku), brand-analyst, customer-researcher (web search), strategist, copywriter, social-planner, ops-architect, localiser. Each picks its own model and is priced at that model's rate in the ledger. Packets (what an agent is shown) are assembled in code from the brief, the artifacts it depends on, the compliance rules, and client memory: approved claims, learnings and exemplars, which return empty until the client library exists and then fill in without changing the agents.

`POST /api/agents/:name/run` runs any agent with raw inputs; the `/api/pass/*` routes the browser uses are those agents with the brief-shaped inputs. `AGENTS.md` describes the full roster plan, including the Critic and Art Director that come next.

## Built for third-party work

An agency or a fractional marketer has never met the client's buyer and does not have the brand book to hand. So the tool goes and gets both: the site scan for voice and style, the audience pass for the customer. Every output is labelled and exported per client, and nothing is stored between sessions, so switching clients is a page refresh.

## Design decisions worth knowing

- **Research is a separate pass, and later passes never see the raw sources.** A 40,000-character brand guide is read once and becomes a few hundred tokens of distilled context that three later passes can afford to include. That is the main cost lever in the system.
- **Strategy is split from execution** so the model compares angles before committing to one. Asking for angles and copy in one call produces copy that was decided in the first few tokens.
- **All channels come from one call** so they share an angle, proof points and vocabulary. Per-channel calls drift.
- **Localisation runs last, only when asked**, from a finished English set, with a glossary from the research pass.
- **Limits are enforced twice.** The prompt states them; the validator checks them. The UI shows what the model got wrong.
- **The browser drives the chain.** Each pass is its own request (`/api/pass/research`, `/strategy`, `/assets`, `/localise`), so the stepper shows real progress, a failed pass can be retried without re-running the earlier ones, and no request runs longer than one model call. `/api/generate` still runs the whole chain in one request for scripts. Intermediate JSON round-trips through the browser; the API key never does.
- **Nothing is stored.** Sources live in the browser tab and are sent with the brief. No accounts, no database, no server state, which is what lets the same code run as a process on Render or a function on Vercel.

## Not included

Live posting to ad platforms or social schedulers, CRM sync, history, accounts, prompt caching, streaming, retrying a single failed pass from the UI, headless-browser scraping, image editing after generation. See `ARCHITECTURE.md` for how each would be added.
