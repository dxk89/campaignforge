# Campaign Forge

Brief in, campaign out. A working demo of an agentic marketing campaign system: load it with your company's voice, give it a brief, and a four-pass prompt chain researches the material, chooses an angle, writes every channel, and adapts it for Portugal, with the token cost shown for every step.

Built as a portfolio piece by a marketer who ships production apps with AI assistance. The code is meant to be read.

## What it does

1. **Brief.** Five fields: product, description, audience, objective, tone. Or upload a briefing document (PDF, DOCX, TXT, MD) and the fields fill in; the document is kept as a source.
2. **Company voice.** Upload brand guidelines, product pages, past campaigns, customer quotes, sales decks. Fetch a URL. Paste text. Optionally let it search the company's website.
3. **Generate.** One request, four sequential Claude calls:
   - *Research* distils the material into a company context: voice, preferred and avoided terms, proof points with sources, product facts, audience insights, competitors, a glossary, and gaps.
   - *Strategy* proposes three angles grounded in that context and picks one.
   - *Assets* writes 3 Meta ads, 3 LinkedIn ads, a Google RSA (8 headlines, 4 descriptions) and a 3-email nurture sequence with a branch note, all executing the chosen angle in the company's voice.
   - *Localisation* (if Portuguese is ticked) adapts, rather than translates, everything into pt-PT using the glossary.
4. **Check.** Every character limit is stated in the prompt and then validated in code. Breaches are flagged in the interface, not silently accepted.
5. **Economics.** Tokens in and out per pass, web searches, cost in EUR at dated rates, generation time.
6. **Export.** Copy any asset. Export everything as JSON, or as CSV with one row per field.

## Run it locally

```bash
git clone <this repo> && cd campaign-forge
npm install
cp .env.example .env        # add your ANTHROPIC_API_KEY
npm start                   # http://localhost:3000
```

No key? Run the interface on fixtures:

```bash
MOCK_CLAUDE=1 npm start
```

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
server.js               Long-running entry point (local, Render)
api/index.js            Serverless entry point (Vercel); both serve lib/app.js
lib/app.js              Express: static front end, sources, one route per pass, /api/generate
lib/chain.js            The four passes as plain functions, plus runChain and the economics sum
lib/claude.js           One helper: JSON-only call, fence stripping, usage capture
lib/limits.js           Character limits, used by the prompts and the validator
lib/pricing.js          Dated per-token rates
lib/sources.js          PDF / DOCX / text / URL -> plain text
lib/mock.js             Fixtures for MOCK_CLAUDE=1
lib/prompts/            One file per pass: brief, research, strategy, assets, localise
public/                 index.html, styles.css, app.js. No framework, no build step
ARCHITECTURE.md         How this would be wired into real ad platforms and a CRM
```

## Design decisions worth knowing

- **Research is a separate pass, and later passes never see the raw sources.** A 40,000-character brand guide is read once and becomes a few hundred tokens of distilled context that three later passes can afford to include. That is the main cost lever in the system.
- **Strategy is split from execution** so the model compares angles before committing to one. Asking for angles and copy in one call produces copy that was decided in the first few tokens.
- **All channels come from one call** so they share an angle, proof points and vocabulary. Per-channel calls drift.
- **Localisation runs last, only when asked**, from a finished English set, with a glossary from the research pass.
- **Limits are enforced twice.** The prompt states them; the validator checks them. The UI shows what the model got wrong.
- **The browser drives the chain.** Each pass is its own request (`/api/pass/research`, `/strategy`, `/assets`, `/localise`), so the stepper shows real progress, a failed pass can be retried without re-running the earlier ones, and no request runs longer than one model call. `/api/generate` still runs the whole chain in one request for scripts. Intermediate JSON round-trips through the browser; the API key never does.
- **Nothing is stored.** Sources live in the browser tab and are sent with the brief. No accounts, no database, no server state, which is what lets the same code run as a process on Render or a function on Vercel.

## Not included

Live posting to ad platforms, CRM sync, history, accounts, prompt caching, streaming, retrying a single failed pass from the UI. See `ARCHITECTURE.md` for how each would be added.
