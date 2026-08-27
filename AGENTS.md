# Campaign Forge: agent architecture

Today every section is the same model with a different system prompt, called once, returning JSON. That is a pipeline of prompts, not a team of agents. The difference matters in three ways: a prompt cannot go and get what it is missing, cannot check its own work and fix it, and cannot get better at one client over time. An agent can do all three.

This plan replaces the seven passes with a roster of specialised agents, an orchestrator that runs them, and a critic that reviews them. It also says, honestly, what "trained" means here.

---

## 1. What "trained" means when you cannot fine-tune

Fine-tuning is not available for the Claude models this runs on, and even where it exists for other models it freezes behaviour at training time, which is the wrong property for a tool whose clients change monthly. An agent here is specialised by four things, and every one of them keeps improving after launch:

1. **Role and standards.** Its own system prompt: what it is, what good looks like, what it must never do, in the voice of a senior practitioner of that one job.
2. **Tools.** Its own set of functions it can call: the scanner, the validators, web search, the image generator, the client library. An agent with a limit checker does not ship over-limit copy; it checks, sees the failure, and revises.
3. **Memory.** What it is shown before it starts: the client's approved claims, voice rules, learnings from past results, and exemplars of outputs this client approved. The exemplar bank is the practical equivalent of training data, retrieved rather than baked in, so a client's fifth campaign is written with four campaigns' worth of approved examples in front of the copywriter.
4. **Evaluation.** Its own golden set and scores, its own prompt versions, so a change to the copywriter is measured on copywriting and cannot break the strategist.

If fine-tuning becomes available, the exemplar bank is exactly the dataset. Until then, retrieval does the job and stays current.

---

## 2. The runtime

One small piece of code that every agent runs on. `lib/agents/runtime.js`, roughly 150 lines.

An agent run is a loop over the Messages API with tools:

```
run(agent, packet, budget):
  messages = [packet as the first user turn]
  loop up to agent.maxTurns:
    response = messages.create(model, system=agent.role, tools=agent.tools + submit)
    record usage to ledger
    if response called submit(output):
        errors = agent.validate(output)
        if none: return output, trace
        else: append tool_result "validation failed: <errors>"; continue   ← self-repair
    for each other tool call: run the function in code, append the result
    if budget exceeded: stop, return best-so-far with a flag
```

Points that matter:

- **`submit` is a tool with a JSON schema.** The agent's final answer is a structured tool call, not text to parse. That retires the fence-stripping and repair code; malformed output becomes a schema error the agent sees and fixes.
- **Validators are tools and gates.** The same functions run as tools mid-loop (the agent chooses to check) and as the gate on submit (the runtime insists). An agent cannot submit a Google headline over 30 characters; it gets the error back and revises.
- **Budgets are hard.** Max turns, max tokens, max searches, max images, per agent per run. The orchestrator sets them from the campaign's budget. The ledger records every call.
- **Trace is kept.** Every tool call and result is stored with the version. "Why did it say that" is answerable by reading the trace.
- **Models are per agent.** Extraction and structure agents run on Haiku-class; writing on Sonnet; the strategist and the critic can be pointed at Opus-class for clients that warrant it. One line per agent.

Mock mode returns fixtures at the agent level, as now, so the interface still runs without a key.

---

## 3. The roster

Twelve agents. Each has a role, a model tier, tools, memory it is shown, what it must produce, what gates its output, and a turn budget.

### Orchestrator
Plans and runs the campaign. Takes the brief and the client library, works out which agents to run and in what order (research only if there are sources, audience only with web on, localise only if requested), what each one is given, and what budget each gets. Handles staleness: if the strategy is regenerated, it marks assets, social and activation stale and offers to re-run them. Takes natural-language requests ("five more X posts about fees, shorter") and routes them to the right agent with the stored context, so small asks are one agent call, not a chain.
*Model:* Sonnet. *Tools:* run_agent, read_library, read_campaign, mark_stale. *Turns:* 12.

### Scout
Gets the raw material. Scans the client's site and decides what else to read: if the pricing page was thin it fetches the FAQ; if there is a customer page it follows the case studies. Extracts uploaded files. Produces sources with fetched-at dates.
*Model:* Haiku. *Tools:* scan_site, fetch_url, extract_file, list_sources. *Gate:* at least one source with over 500 characters, or an explicit "site is client-rendered" flag. *Turns:* 8.

### Brand Analyst
Reads the sources and produces the company context: voice observations, preferred and avoid terms, product facts, competitors, glossary, campaign facts, gaps. Proposes claims, each with a source and the exact span it came from, for a human to approve. Never approves.
*Model:* Sonnet. *Tools:* read_source, search_web (company only, 5), propose_claim. *Memory:* the client's existing voice rules and approved claims, so it extends rather than contradicts. *Gate:* every proposed claim has a source and a span. *Turns:* 6.

### Customer Researcher
Finds the audience in its own words. Searches communities, reviews, job posts, newsletters; fetches the pages worth reading in full; extracts verbatim phrases with URLs. Verifies: any phrase without a URL is dropped before submit.
*Model:* Sonnet. *Tools:* search_web (8), fetch_url, cite. *Memory:* prior audience research for the client, to look for what changed rather than repeat it. *Gate:* every phrase and pain cites a URL; thin results are declared, not padded. *Turns:* 10.

### Strategist
Three angles and a lead, grounded in context, audience and learnings. Reads what worked last time before proposing anything. Can ask the Critic for a pre-read on the angles before submitting.
*Model:* Sonnet, Opus optional. *Tools:* read_learnings, read_past_campaigns, ask_critic. *Memory:* client learnings, past strategies and their results. *Gate:* three distinct angles, lead names one of them, at least one angle uses an approved claim if any exist. *Turns:* 4.

### Copywriter
All campaign channels. Writes, checks every asset against limits and compliance, revises, submits only when clean. Uses approved claims only.
*Model:* Sonnet. *Tools:* check_limits, check_compliance, read_claims, read_exemplars. *Memory:* approved claims, voice rules, top exemplars of this client's approved copy per channel, audience phrases. *Gate:* zero hard-limit breaches, zero avoid terms, zero unapproved claims. *Turns:* 5.

### Social Planner
The month. Plans pillars and cadence against the client's calendar (start date, events, holidays), writes every post, checks each against its channel limit, and hands graphic posts to the Art Director. Reviews the returned graphics against its own briefs.
*Model:* Sonnet. *Tools:* check_social_limits, read_calendar, request_graphic, read_exemplars. *Memory:* approved past posts and which pillars performed. *Gate:* 32 posts, cadence met, every X post under 280 with hashtags, Instagram posts all have a graphic. *Turns:* 6.

### Art Director
One graphic at a time. Chooses the template, fills the slots, renders the card in code, writes the visual brief, optionally generates the image, then looks at the result (image input) and checks it against the brief and the brand: wrong colours, text in the image, a face where none was asked for. Regenerates once with a correction if needed. Composites the logo.
*Model:* Sonnet (vision). *Tools:* render_card, generate_image, review_image, composite_logo. *Memory:* brand kit, approved past images, rejected images with the rejection notes. *Gate:* card renders; if an image was requested, the review passed or a "needs human" flag is set. *Turns:* 4 per graphic.

### Ops Architect
Lifecycle, handoff, measurement, experiments. Validates the workflow graph, the score maths and the KPI tree with the structural checker until they pass. Reads the client's CRM and tool names from the library so it names real systems.
*Model:* Sonnet. *Tools:* validate_activation, read_library_tools, utm_plan. *Memory:* past activation plans for the client and what the results said about them. *Gate:* structural validation passes. *Turns:* 4.

### Landing Page Writer
Hero, proof, objections, form spec matching the MQL definition. Checks its claims and its avoid terms like the Copywriter. Ships with the tracking already wired.
*Model:* Sonnet. *Tools:* check_compliance, read_claims, read_activation. *Gate:* as Copywriter, plus form fields cover every MQL criterion. *Turns:* 4.

### Localiser
pt-PT adaptation from the edited English, with the glossary. Runs a Brazilian-form detector and the limit checker before submitting. Can ask the Critic (in Portuguese) for a register check.
*Model:* Sonnet. *Tools:* check_limits, detect_pt_br, read_glossary, ask_critic. *Gate:* zero pt-BR forms, zero limit breaches, glossary terms untouched. *Turns:* 4.

### Critic (Brand Guardian)
Reads, never writes. Reviews any agent's output against the voice rules, the approved claims, the audience research and the brief, and returns must-fix items and suggestions with reasons. Writers revise against it. Runs on every writing agent's first submit, on demand at any time, and as the final gate before approval. A separate model instance with a different role is what makes this work; a model does not find its own mistakes reliably, but it finds another's.
*Model:* Sonnet, Opus optional. *Tools:* read_everything, check_compliance. *Memory:* corrections it has given this client before, so it is consistent. *Gate:* returns a structured verdict; empty must-fix means pass. *Turns:* 3.

### Analyst
Results in, learnings out. Maps uploaded performance data to assets by UTM, computes the experiment verdicts in code, then writes three to five learnings with evidence for a human to approve. Approved learnings go into every future packet for this client.
*Model:* Sonnet. *Tools:* read_results, compute_verdicts, propose_learning. *Gate:* every learning cites a metric and a variant. *Turns:* 4.

### Brief Reader
Unchanged from today's brief parse, promoted to an agent only so it shares the runtime and ledger. Single turn, Haiku.

---

## 4. How agents talk to each other

Not by chatting. By artifacts and packets.

- **Artifacts** are the structured outputs (context, audience, strategy, assets, social, activation, landing, localised), stored as versions. Each has a schema. An agent's `submit` tool is that schema.
- **Packets** are what an agent is shown when it starts, assembled by code, not by another model: the brief, the artifacts it depends on, the client memory it is entitled to (claims, voice, learnings, exemplars), and its budget. Assembling packets in code keeps them deterministic and keeps agents from being prompted by each other's prose.
- **Handoffs** are orchestrator calls: run Copywriter with packet P. The Copywriter does not know the Strategist exists; it knows there is a strategy in its packet.
- **The Critic is the exception**: writing agents can call `ask_critic` mid-run as a tool. The Critic returns a structured verdict, which is a tool result, not a conversation.

This is the discipline that keeps twelve agents from becoming one long, expensive chat.

---

## 5. Memory: the exemplar bank

The part that makes agents get better per client.

- Every asset, post, graphic, strategy and plan a human approves is stored as an exemplar, tagged with client, agent, channel, objective, tone, pillar, language, and later its performance.
- When an agent starts, the packet includes the top handful of exemplars for that client matching the current channel and objective, ranked by recency and performance. "Here are six LinkedIn ads this client approved, the two with results attached performed best."
- Rejections are stored too, with the note, and shown as "not this" when the note is specific.
- A global bank across clients (anonymised: brand and product names replaced) supplies style exemplars for a new client with no history.
- Retrieval is metadata filtering plus recency and performance ordering. No vector database until a client has thousands of exemplars; a Firestore query is enough.

Learnings (from the Analyst) and corrections (from the Critic) are the other two memory types, both client-level, both human-approved before use.

---

## 6. Evaluation per agent

Each agent gets its own golden set and scorer, run when its prompt or tools change:

- **Scout**: pages found on five known sites versus expected.
- **Brand Analyst**: claims proposed with correct spans; avoid terms recovered from a guide with known ones.
- **Customer Researcher**: proportion of phrases with valid URLs; overlap with a hand-built phrase list for a known audience.
- **Strategist**: distinctness of angles (embedding distance or a rubric), use of approved claims.
- **Copywriter, Social Planner, Localiser, Landing Page Writer**: limit compliance, avoid-term leakage, claim traceability, pt-BR leakage, plus a human 1 to 5 rating.
- **Art Director**: review agreement with a human on twenty images.
- **Ops Architect**: structural validity, KPI tree depth.
- **Critic**: agreement with human must-fix lists on twenty outputs, false-positive rate.
- **Analyst**: verdicts match hand-computed ones on three result sets.

Scores are stored against agent prompt versions. A change ships when its agent's score holds.

---

## 7. Cost and latency, honestly

An agent loop costs more than a single call. Expect 1.5 to 3 times the tokens per section, mostly from validator round-trips and Critic reads. A full campaign moves from roughly €1 to roughly €2 to €3 in text, plus images. Still a rounding error against the hours, but the ledger will show it, and budgets keep any one agent from running away.

Latency moves from about two minutes to four or five for a full first run. The orchestrator's fast path (one agent, stored context) handles the small asks that happen twenty times a day in under fifteen seconds, which is where latency is actually felt.

---

## 8. What changes in the code

```
lib/agents/
  runtime.js          the loop: tools, submit schema, validators as gates, budgets, trace, ledger
  packets.js          assembles what each agent is shown, from brief + artifacts + client memory
  tools/              one file per tool: scan_site, fetch_url, check_limits, check_compliance,
                      validate_activation, render_card, generate_image, review_image, search_web, ...
  roster/             one file per agent: role prompt, model, tool list, submit schema, validate(), budget
    orchestrator.js  scout.js  brand-analyst.js  customer-researcher.js  strategist.js
    copywriter.js  social-planner.js  art-director.js  ops-architect.js  landing-writer.js
    localiser.js  critic.js  analyst.js  brief-reader.js
lib/memory/
  exemplars.js        store and retrieve approved outputs
  learnings.js  corrections.js
lib/prompts/          retired into roster/ role prompts
```

The existing validators (`limits.js`, `activation.js`, `utm.js`, `graphics.js`, `scraper.js`, `images.js`) become tools without change; they were written as pure functions for exactly this. The chain (`chain.js`) becomes the orchestrator's default plan. The API routes become `POST /api/agents/:name/run` plus `POST /api/orchestrate`.

---

## 9. Order of work

This slots in front of the infrastructure plan's Phase 1, and it can be built in the current repo now, because nothing in it depends on Next.js or Firestore. Memory retrieval reads from an interface that returns empty lists until Firestore exists.

**Week 1: runtime and conversion (5 days).** Runtime with submit schemas, validators as gates, budgets, trace, ledger. Convert the seven existing passes to roster agents with their tools. Orchestrator running the default plan. The product behaves as today, but every section can now check and fix its own work, and malformed JSON is gone.

**Week 2: the reviewers (4 days).** Critic with `ask_critic` wired into the writers. Art Director with image review. Scout with follow-the-links. Customer Researcher with citation verification. Natural-language fast path through the orchestrator.

**Then the infrastructure plan's Phase 1**, with memory retrieval switched from empty lists to Firestore, and the exemplar bank filling from the first approval.

Evals per agent are built as each agent is converted, not after; a golden set of three briefs per agent is enough to start.

---

## 10. What this is not

Not autonomous. The orchestrator plans and runs; a person still approves claims, approves outputs, uploads results, and approves learnings. Every agent's authority stops at its gate. The point of specialised agents is that each one is good at one job and checked by another, which is how a strong team works, and the human is the account director.
