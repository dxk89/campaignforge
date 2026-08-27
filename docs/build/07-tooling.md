# Free repos and tools that make agents better

Mapped to agents. Each entry says what it improves, the free limit, the licence or terms caveat, and the effort to wire it in as a tool on the runtime. "Adopt" means build it in the phase named; "later" means worth it once the client library exists; "skip" is listed so nobody re-evaluates it.

Checked 27 Aug 2026. Free tiers and terms move; the `checked:` line on each knowledge pack applies here too.

## Priority list (build these first)

| Tool | Agent | What changes | Effort |
|---|---|---|---|
| **Jina Reader** (r.jina.ai) | Scout, Brand Analyst, Customer Researcher | Any URL to clean markdown, JS-rendered pages included. Fixes the scanner's biggest weakness (client-rendered sites). 20 requests/min without a key, 200/min with a free key. | Half a day: a `read_url` tool that tries Jina first and falls back to our own fetch |
| **promptfoo** (MIT) | Evals (all agents) | The eval harness in Phase 4 without writing one: YAML test cases, assertions (regex, JSON schema, JS functions, LLM-as-judge), matrix views, CI mode, caching, Anthropic provider built in. Our `evals/score.js` becomes custom assertions. | One day to replace `evals/run.js`; keeps our scorers |
| **LanguageTool** (LGPL, self-host or public API) | Localiser, Copywriter, Critic | Grammar and style with an explicit `pt-PT` variant, so Brazilian forms and agreement errors are caught by a rules engine, not only our word list. Public API is rate-limited and fine for one user; Docker self-host removes the limit. | Half a day: `check_grammar` tool; add to Localiser's gate as advisory, Critic's as evidence |
| **Pexels API** (free, CC0-style licence, no attribution required) | Art Director | Real licensed photography as an alternative to generated images. Search by the visual brief; the Art Director reviews candidates the same way it reviews generated ones. Removes the likeness and copyright risk noted in the assessment. | Half a day: `find_photo` tool; card/photo/stock toggle per post |
| **Satori + resvg-js** (Vercel's Satori, MIT; resvg-js, MPL) | Art Director | Satori renders HTML/CSS to SVG, so templates become JSX/CSS instead of hand-placed `<text>` with manual wrapping; resvg-js rasterises to PNG server-side, so export no longer depends on the browser canvas and fonts load properly (Google Fonts fetched at render). | One day; replaces `graphics.js` internals, same template contract |

## By agent

### Scout
- **Jina Reader** – above. Adopt week 2 (Scout task).
- **Firecrawl** (AGPL-3.0, self-host; cloud free tier of a few hundred credits) – crawl a whole site to markdown, handles JS and bot blocking. Heavier than Jina; the self-host needs Redis and a headless browser. Later, if a client's site defeats Jina.
- **Playwright** (Apache-2.0) – headless browser for computed styles: the honest palette (what is on screen, weighted by area) rather than declared CSS. Not on Vercel functions; run as a local script or a small worker. Later (INFRASTRUCTURE.md already names it).
- **@mozilla/readability** (Apache-2.0) – main-content extraction when we do fetch HTML ourselves; better than our regex stripper. Adopt Phase 1, drop-in.
- **sitemap parsing** (`sitemapper`, MIT) – read `sitemap.xml` before crawling; finds pricing and case-study pages the nav hides. Adopt week 2, an hour.

### Brand Analyst
- **ColorThief / node-vibrant** (MIT) – palette from the logo and og:image, merged with the CSS palette; brand colours that exist only in imagery get found. Adopt Phase 1, an hour.
- **wink-nlp** (MIT) – term frequency and collocations across sources in code, so the lexicon (preferred terms) starts from counts, not impressions. Adopt Phase 2 as a `lexicon` tool the agent calls.
- **Wayback Machine CDX API** (free) – how the company described itself a year ago; positioning drift as a fact. Later.

### Customer Researcher
- **Hacker News Algolia API** (free, no key) – practitioner threads searchable by keyword; verbatims with URLs. Adopt week 2 as `search_hn`.
- **Reddit API** – the richest source of buyer language. Free tier is 100 requests/min via OAuth, but Reddit's terms distinguish commercial use and require approval for it; for a tool used on behalf of clients, apply for access rather than assume. Flag, don't adopt silently.
- **Google autocomplete endpoint** (unofficial, free) – the phrases people actually type, for `search_terms`. Unofficial means it can break; wrap it and degrade gracefully. Adopt week 2.
- **YouTube Data API** (free quota) – comments on category videos are verbatim gold. Later.
- **Exa / Tavily search APIs** (free tiers) – semantic search tuned for agents, better than the built-in web search for "how do practitioners describe X". Later, if the built-in search returns vendor noise on evals.

### Strategist
- Little tooling helps; judgement is the job. **Wayback** for competitor message history (above). Extended thinking (already planned) matters more than any tool.

### Copywriter
- **LanguageTool** – above, English rules for grammar and style.
- **retext** ecosystem (MIT): `retext-readability`, `retext-simplify`, `retext-equality`, `retext-intensify` – readability grade, plain-language substitutions, non-inclusive phrasing, weasel words, in code, per sentence. Becomes part of `check_compliance` as warnings. Adopt Phase 2, half a day.
- **text-readability** (MIT) – Flesch and grade scores per asset; the Critic gets a number. Adopt Phase 2, an hour.
- **Google Ads RSA strength** – no free API; keep our combinatorial rules.

### Social Planner
- Nothing free gives platform performance data without an account. **Buffer** free plan for scheduling the exported CSV (three channels) is the practical hand-off. Skip tooling here; the value is in exemplars and results.

### Art Director
- **Pexels**, **Satori + resvg-js** – above.
- **Openverse API** (free, CC-licensed images with attribution data) – second source when Pexels is thin; attribution must be carried. Later.
- **Google Fonts API** (free) – load the client's actual font for renders when it is a Google font (most B2B sites). With Satori. Adopt with Satori.
- **wcag-contrast** (MIT) – contrast ratio in code; already planned in the training doc, this is the library. Adopt week 2, an hour.
- **sharp** (Apache-2.0) – resize, composite logo, convert, server-side; replaces browser canvas compositing. Adopt with resvg-js.
- **Hugging Face Inference API** (free tier, rate-limited) – open image models (FLUX, SDXL) as a zero-cost fallback when Gemini is off. Quality varies; keep Gemini primary. Later.

### Ops Architect
- **Mermaid** (MIT) – render the lifecycle workflow as a diagram from the steps array; the graph the validator checks becomes a picture the client can read. Adopt Phase 3, half a day.
- **ajv** (MIT) – JSON-schema validation for every submit schema in code (the API validates tool input shape, but ajv gives us the same check in tests and on stored versions). Adopt week 2, an hour.
- **HubSpot free CRM API** – export the lifecycle as a HubSpot workflow and the lead score as property definitions; the demo ARCHITECTURE.md describes. Later, when a client uses HubSpot.

### Landing Page Writer
- **Lighthouse** (Apache-2.0, `lighthouse` npm) – performance, SEO and accessibility scores on the generated `landing.html`; a number the Critic can cite. Needs Chromium: local script, not Vercel. Later.
- **axe-core** (MPL-2.0) – accessibility rules on the landing HTML in jsdom; no browser needed. Given accessibilityref.eu, this is a natural tool to own. Adopt Phase 3, half a day.

### Localiser
- **LanguageTool pt-PT** – above; the strongest single improvement for this agent.
- **DeepL API Free** (500k characters/month) – not for output (adaptation is the model's job) but as a reference: the Critic compares the model's adaptation against a literal machine translation to spot omissions. Later, cheap to add.
- **Hunspell pt-PT dictionary** (`nodehun`, GPL/LGPL data) – spelling under the Acordo Ortográfico; LanguageTool covers this, so only if self-hosting is avoided.

### Critic
- All of the above scanners feed it evidence. **retext-equality** and **LanguageTool** findings are attached to the packet so the Critic's must-fix items cite a rule, not an opinion.

### Analyst
- **simple-statistics** (ISC) – confidence intervals, two-proportion z-test, chi-square for the verdict engine; the "insufficient sample" rule gets a real test behind it. Adopt Phase 3, half a day.
- **Google Analytics 4 Data API** and **Search Console API** (free) – landing conversion and query data pulled rather than uploaded, once a client grants access. Later.

### Orchestrator, runtime, infrastructure
- **ajv** – above.
- **Inngest** or **Trigger.dev** (free tiers, run on Vercel) – the queue INFRASTRUCTURE.md defers; both have generous free plans for one user. Later, when scheduled rescans arrive.
- **Langfuse** (MIT, self-host or free cloud tier) – traces, cost per agent, prompt versions with a UI. Overlaps with our ledger and the Phase 4 prompt store; consider adopting it instead of building `/prompts` and `/evals` pages. Decide at Phase 4 entry.
- **PostHog** (free tier) or **Umami** (MIT, self-host) – the Phase 4 telemetry without writing counters. Later.
- **LibreTranslate** (AGPL, self-host) – skip; adaptation is not translation.

## Caveats that apply across the board

- **Licences.** MIT/Apache/ISC/MPL are fine to embed. AGPL (Firecrawl, LibreTranslate) is fine to self-host for internal use but obliges source disclosure if the service is offered to others; keep them behind an API boundary and note it. GPL dictionary data: same care.
- **Terms of service.** Reddit and unofficial Google endpoints are the two to treat with respect. Pexels' licence permits commercial use without attribution; Openverse requires attribution per image; Unsplash's API terms require attribution and a hotlinked download trigger, which is why Pexels is first.
- **Rate limits are per user here.** One marketer's usage sits inside every free tier above. The moment there are ten users, Jina and LanguageTool need keys or self-hosting.
- **Nothing here replaces a gate.** These are evidence sources for agents and validators. The runtime still decides in code.

## Where they land in the build

- Week 2: Jina Reader, sitemap parsing, HN search, autocomplete, wcag-contrast, ajv.
- Phase 1: readability extractor, palette from imagery, Google Fonts.
- Phase 2: retext suite, text-readability, LanguageTool (en and pt-PT), wink-nlp lexicon.
- Phase 3: Pexels, Satori + resvg-js + sharp, Mermaid, axe-core, simple-statistics.
- Phase 4: promptfoo as the eval harness; decide Langfuse vs own pages; PostHog or Umami.
