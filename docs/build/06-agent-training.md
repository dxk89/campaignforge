# Agent training plan

How each agent becomes the equivalent of a twenty-year practitioner of its one job, without fine-tuning.

## 1. What "training" is here

A senior practitioner has five things a junior does not. Each maps to a mechanism this architecture already supports:

| What the expert has | Mechanism | Where it lives |
|---|---|---|
| A way of thinking: principles, decision rules, anti-patterns, the questions they ask first | **Expertise brief** compiled into the role prompt | `knowledge/<agent>/expertise.md` → role |
| Reference material they check rather than remember: platform specs, codes, norms | **Knowledge packs** injected into the packet when relevant, refreshed on a schedule | `knowledge/<agent>/*.md`, `knowledge/shared/*.md` |
| A procedure they follow without thinking | **Standard operating procedure** in the role, enforced by tools and gates | role prompt + tool order + validators |
| A body of work they have seen and judged | **Worked examples**: annotated gold standard in the repo; the client exemplar bank from approvals | `knowledge/<agent>/examples.md`, `memory.exemplars` |
| A standard they are judged against and learn from | **Rubric** shown to the agent and used by the Critic and evals; **corrections** fed back | `knowledge/<agent>/rubric.md`, `memory.corrections`, `evals/` |

Three further levers:

- **Reasoning budget.** Agents whose job is judgement (Strategist, Critic, Ops Architect) get extended thinking enabled with a thinking budget; agents whose job is extraction or execution (Scout, Brief Reader, Localiser) do not. Thinking is spend; use it where it changes the answer.
- **Adversarial cases.** Every agent has golden cases designed to make it fail the way a junior fails: a source with a fabricated statistic, a brief that contradicts the site, a thin site, an audience that does not exist online. Passing them is the bar.
- **Edit mining.** When a human edits generated text, the diff is stored. Periodically (Phase 4), an analysis pass turns recurring diffs into candidate corrections: "the human keeps shortening your first sentence", "the human removes your CTA from email 1". Approved corrections join the packet.

The reference material below names frameworks and sources by name. The model already knows most of them; the knowledge pack's job is to make the choice explicit and consistent (this agent uses *these* frameworks, in *this* order), and to carry the material that changes (platform specs, legal codes) so it is current rather than remembered.

---

## 2. Per-agent training plans

Each plan has: the expert it is modelled on, methods and frameworks, resources (knowledge packs), procedure, worked examples, rubric, adversarial cases, feedback loop, and the metric that says it is working.

### 2.1 Brief Reader

**Expert.** An account director who reads a client brief in two minutes and knows what is missing.
**Methods.** The five-field extraction is the easy part; the expertise is in `notes`: mandatories, banned claims, deadlines, budget, sign-off owners, channels to exclude, what the brief asks for that the tool does not produce.
**Resources.** `knowledge/brief-reader/what-a-brief-omits.md`: the twelve things briefs usually leave out (success metric, budget, landing page, legal constraints, prior campaigns, competitor rules, tone examples, audience exclusions, timing, approver, source of proof, what not to say).
**Procedure.** Extract; list what is stated; list what is missing from the twelve; never guess a missing field.
**Rubric.** Fields filled only when stated (precision over recall); notes name every mandatory and prohibition in the document.
**Adversarial.** A brief with two products; a brief that names a tone by example rather than by word; a brief in pt-PT.
**Metric.** Human corrections to prefilled fields per brief.

### 2.2 Scout

**Expert.** A research librarian who knows which pages on a company site carry the truth and which carry the marketing.
**Methods.** Page-value heuristics: pricing, integrations, security, changelog and docs pages state facts; home and campaign pages state positioning; case studies and testimonials carry the only approved proof; careers pages reveal voice and values. Detect client-rendered sites (empty body, script-heavy) and say so.
**Resources.** `knowledge/scout/page-taxonomy.md` (page types, what each yields, URL patterns); `knowledge/scout/client-rendered-signals.md`.
**Procedure.** Scan; classify pages; check coverage (about, product, pricing, customers, docs); follow links for missing types; stop at budget; report coverage honestly.
**Rubric.** Coverage flags correct; no page fetched twice; thin-site declared rather than padded.
**Adversarial.** A site whose pricing is behind a "contact us"; a site with a blog that dwarfs the product pages; a client-rendered SPA.
**Metric.** Coverage flags versus human check on twenty sites.

### 2.3 Brand Analyst

**Expert.** A brand strategist who has written thirty tone-of-voice guides and can hear a company's voice in three paragraphs.
**Methods.** Voice on four dimensions (Nielsen Norman Group's tone spectrum: funny–serious, formal–casual, respectful–irreverent, enthusiastic–matter-of-fact) with evidence quotes; preferred and avoided terms as a lexicon, not adjectives; positioning statement in the company's own words (April Dunford's frame: for whom, in what category, unlike what, because); proof points as claim + source + span; competitors as named by the company, not inferred; gaps stated.
**Resources.** `knowledge/brand-analyst/voice-dimensions.md`; `knowledge/brand-analyst/positioning-frame.md`; `knowledge/brand-analyst/claim-standards.md` (what counts as a proof point: a number with a date and a population, a named customer with permission implied by publication, an award with a year; what does not: "leading", "trusted by thousands"); `knowledge/shared/uk-advertising-claims.md` (CAP Code principles on substantiation, comparative claims, superlatives; Portuguese Código da Publicidade equivalents).
**Procedure.** Read all sources; extract voice evidence first (quotes), then infer dimensions; build lexicon; extract claims with spans; classify each as substantiated or not; list competitors named; write gaps; propose, never approve.
**Worked examples.** Three annotated context outputs for fictional companies (SaaS, professional services, industrial), each with the source text alongside and notes on why each observation was made.
**Rubric.** Every observation has a quote; every claim has a span; lexicon has at least five preferred and three avoided terms when the sources allow; no adjective without evidence; gaps list is specific.
**Adversarial.** Sources containing a fabricated statistic with no date or population (must classify as unsubstantiated); two sources that contradict each other on positioning (must report the conflict); a brief whose product description contradicts the site.
**Feedback loop.** Human edits to voice rules in the library are diffed against the proposal; recurring removals become corrections ("you over-read enthusiasm from exclamation marks in a single blog post").
**Metric.** Proportion of proposed voice rules and claims accepted without edit.

### 2.4 Customer Researcher

**Expert.** A qualitative researcher who has run five hundred customer interviews and mines reviews and forums the way they would mine transcripts.
**Methods.** Jobs-to-be-done framing (Bob Moesta's forces: push of the situation, pull of the new solution, anxiety of the new, habit of the present); voice-of-customer mining (Joanna Wiebe's method: collect verbatims, tag by theme, rank by frequency and emotional weight, lift the phrasing into copy); source hierarchy: practitioner communities and reviews above analyst reports above vendor content; search-term extraction from how people phrase the problem.
**Resources.** `knowledge/customer-researcher/jtbd-forces.md`; `knowledge/customer-researcher/voc-mining.md`; `knowledge/customer-researcher/source-hierarchy.md` (where B2B buyers talk by function: finance, engineering, marketing, ops, with community names); `knowledge/customer-researcher/search-query-patterns.md` (how to phrase searches to reach practitioner voices: "reddit", "vs", "alternative", "how do you", "anyone else").
**Procedure.** Form three hypotheses about the buyer from the brief; search practitioner sources first; fetch the two richest pages in full; extract verbatims with URL; tag by force; rank; list what could not be found; never paraphrase a verbatim; never attribute a pain without a URL.
**Worked examples.** Two annotated audience outputs with the search log alongside: which queries worked, which returned vendor noise, how a verbatim was chosen over a paraphrase.
**Rubric.** Verbatims are verbatim; every entry cited; forces balanced (not only pains); search terms are phrases people type, not marketing phrases; thin results declared.
**Adversarial.** An audience that barely exists online (must return short lists and say so); a category dominated by vendor content (must reach past it); a brief audience that is wrong for the product (must note the mismatch).
**Feedback loop.** Phrases that make it into approved copy are marked as "used"; the packet shows which of its past phrases were used, so it learns what the writer values.
**Metric.** Citation rate; share of phrases used in approved copy.

### 2.5 Strategist

**Expert.** A planner who has written two hundred creative briefs and knows that the angle is the campaign.
**Methods.** Eugene Schwartz's stages of awareness (unaware → problem-aware → solution-aware → product-aware → most-aware) to choose where the audience sits and therefore what the angle must do; the 95:5 principle (LinkedIn B2B Institute / Ehrenberg-Bass): most of the audience is out-market, so the angle must be memorable to them and actionable for the in-market few; Binet and Field's long/short balance to match the angle to the objective (brand awareness → emotional, distinctive; trial/leads → rational, direct); category entry points (Ehrenberg-Bass) as the list of situations in which the buyer thinks of the category; one single-minded proposition per angle; three genuinely different angles means three different awareness stages or three different entry points, not three phrasings.
**Resources.** `knowledge/strategist/awareness-stages.md`; `knowledge/strategist/95-5-and-entry-points.md`; `knowledge/strategist/long-short.md`; `knowledge/strategist/angle-tests.md` (the five tests an angle must pass: true, distinctive, relevant to a named pain, provable from context, sustainable across channels).
**Procedure.** Read learnings first; place the audience on the awareness scale using the research; list the entry points the context supports; draft five angles; kill two using the five tests; choose the lead by objective and proof available; write the reasoning as a trade-off, not a sales pitch; ask the Critic if a proof point is being over-stretched.
**Reasoning budget.** Extended thinking on, budget 4,000 tokens.
**Worked examples.** Four annotated strategies: one where the obvious angle was rejected for lack of proof; one where a competitor-contrast angle was chosen; one for brand awareness; one built on a learning from results.
**Rubric.** Angles differ on stage or entry point; lead reasoning names what was given up; hooks execute the lead angle only; key messages are provable from context; nothing marked as a gap is used.
**Adversarial.** A context with no proof points (must produce capability-led angles and say so); learnings that contradict the brief's chosen tone (must surface the conflict); a strong competitor named in context (must consider contrast and justify use or non-use).
**Feedback loop.** Which angle a human chose when they overrode the lead, with their note; strategies whose campaigns produced results, ranked.
**Metric.** Lead angle accepted without override; result-weighted angle performance over time.

### 2.6 Copywriter

**Expert.** A direct-response copywriter with twenty years across search, social and email who counts characters by reflex and never writes a claim they cannot source.
**Methods.** Headline craft: specificity beats cleverness; one idea per line; the reader's word for the problem, not the company's; the Ogilvy rule that the headline carries most of the value. Structure by channel: Meta primary text opens with the hook because the feed truncates; LinkedIn intro's first line must stand alone; Google RSA headlines are combinatorial, so each must be complete and none may depend on another, with the product name in at least two and a search-term match in at least three; email as a sequence with one job each (introduce, prove, ask/handle), one CTA each, subject lines as curiosity or specificity, never both. Frameworks used deliberately: PAS (problem, agitate, solve) for pain-led variants, proof-led for product-aware audiences, contrast for solution-aware. "Made to Stick" checks (simple, unexpected, concrete, credible, emotional, story) as a last pass. Character discipline: count, then cut the idea not the meaning.
**Resources.** `knowledge/copywriter/channel-craft.md` (per channel: what the platform truncates, what performs, what is rejected; refreshed quarterly from Meta, LinkedIn and Google ad specification pages); `knowledge/copywriter/headline-patterns.md` (twelve patterns with when to use each: number, how-to, question, contrast, verbatim quote, outcome, mechanism, objection-flip, time-bound, specificity, named-audience, curiosity); `knowledge/copywriter/email-sequence.md` (the three-email job model, branch logic conventions, preview text as second subject); `knowledge/shared/uk-advertising-claims.md`; `knowledge/shared/banned-words.md` (superlatives, filler, AI-tells).
**Procedure.** Read the strategy and the rules; list the proof points allowed; write the Google headlines first (they force specificity); write Meta and LinkedIn from the hooks; write emails last; run check_limits; run check_compliance; ask the Critic; revise; submit clean.
**Worked examples.** Six annotated asset sets across objectives and tones, each with a "why this works" note per asset and a "what a junior would have written" alternative alongside.
**Rubric.** Every asset executes the lead angle; variants differ by hook and proof, not by angle; no claim outside the approved list; no avoid term; first lines stand alone; RSA headlines combinable; one CTA per email; character counts exact; no banned words.
**Adversarial.** A brief with a provocative tone and a conservative client voice (must reconcile toward the client's voice and note it); no proof points (capability-led, no invented numbers); a product name that is 22 characters (RSA headlines still fit); pt-PT-ready phrasing not required but idiom that would not survive translation is avoided when Portuguese is requested.
**Feedback loop.** Human edits diffed per field; recurring edits become corrections; approved assets become exemplars with performance.
**Metric.** Edit distance from generated to approved per field, trending down per client; limit and compliance flags per run, trending to zero.

### 2.7 Social Planner

**Expert.** A social lead who has run organic programmes for B2B brands for a decade and knows that a month is a rhythm, not thirty-two adverts.
**Methods.** Content pillars with fixed shares; the hook line as the whole post's job on LinkedIn (the fold); X as a complete thought; Instagram caption as context for a graphic, not the other way round; pillar-to-channel fit (educate and point-of-view on LinkedIn, proof and product on Instagram with graphics, engage on X); a "series" device (a recurring format once a week) for recognisability; cadence against the calendar; no post on blackout days; product posts away from holidays; launches on their date.
**Resources.** `knowledge/social-planner/platform-norms.md` (what each feed truncates, what earns dwell time, hashtag conventions by platform, refreshed quarterly); `knowledge/social-planner/pillars-and-series.md`; `knowledge/social-planner/hook-lines.md` (patterns for first lines that hold); `knowledge/shared/banned-words.md`.
**Procedure.** Read learnings (which pillars performed); place events on the calendar; assign pillars by share and channel fit; write hooks for every post first; then bodies; assign graphics to the posts that earn them (proof, list, announcement); write graphic slots and visual briefs; run limits and compliance; ask the Critic on the point-of-view posts (the riskiest); submit.
**Worked examples.** Two annotated months for fictional clients, with the pillar map, a series device, and notes on why each graphic was assigned.
**Rubric.** Pillar shares within 5% of target; hooks stand alone; X posts complete under 280 with tags; Instagram every post has a graphic; no two posts on one idea in one week; blackout respected; voice consistent with the lexicon.
**Adversarial.** A calendar with a launch on day 2 (must build up to it and follow through); a client with no proof points (proof pillar reallocated, not faked); a provocative tone (point-of-view posts challenge without insulting a named competitor).
**Feedback loop.** Post-level results (impressions, engagement, clicks) by pillar; approved posts as exemplars; pillar performance as a learning.
**Metric.** Posts approved without edit; pillar performance versus plan.

### 2.8 Art Director

**Expert.** A designer who has built social templates for a hundred brands and reviews generated images the way a photo editor reviews a shoot.
**Methods.** Typographic hierarchy: one idea per card, headline size by line count, never below the legibility floor at 1080 px; contrast checked (WCAG 2 ratio ≥ 4.5:1 for body, 3:1 for display) using the palette; template choice by content type (number → stat, quote → quote, three-plus items → list, offer → announce, else tip); visual brief craft: subject, setting, light, mood, composition, no text, lower-right clear; review criteria: text or letters present, recognisable face, palette far from brand accents, subject drift, stock-photo cliché (handshakes, pointing at screens), off-brand mood.
**Resources.** `knowledge/art-director/typography-rules.md`; `knowledge/art-director/contrast.md` (formula and thresholds); `knowledge/art-director/visual-brief-patterns.md` (twenty briefs that produce usable B2B images, with the clichés to avoid); `knowledge/art-director/platform-safe-zones.md` (where each platform crops or overlays UI on 1:1 and 4:5).
**Procedure.** Choose template by content type; fill slots within their limits; render; check contrast from the scheme; write the brief; if image requested, generate; review against the six criteria; regenerate once with the correction; composite logo; submit with attempts and review.
**Worked examples.** Ten card renders with notes on template choice; ten image briefs with the image that came back and the review verdict.
**Rubric.** Template matches content type; slot text within limits and untruncated; contrast passes; brief has subject, setting, light, mood; review finds text in image when present; logo does not overlap subject.
**Adversarial.** A stat with nine characters (must fall to a smaller size or choose tip); a quote of 140 characters (must shorten at the idea, not truncate); a brief that would produce a face (must rewrite to avoid); a client palette with two near-identical accents (scheme rotation still legible).
**Feedback loop.** Image approvals and rejections with notes; rejected briefs become "not this" examples.
**Metric.** Images approved on first generation; review agreement with human on the twenty-image golden set.

### 2.9 Ops Architect

**Expert.** A marketing operations lead who has built lifecycle programmes in HubSpot, Marketo and Customer.io for fifteen years and has been burned by every way a lead can fall through a gap.
**Methods.** Lifecycle stages as definitions with counting rules, not labels (the demand-waterfall discipline: inquiry, MQL, SAL, SQL, opportunity, each with an entry rule and an owner); branching on behaviour signals with a default path and an exit for every node; lead scoring as fit (firmographic) plus intent (behaviour) with a reachable threshold and decay; SLA in hours with an escalation; BDR SOP as numbered steps with what is logged; talk track built from the audience's objections; KPI tree from activity through capture, qualification, pipeline to revenue with source of record per metric; data-quality rules (UTM discipline, dedupe key, attribution window, field mapping); experiments with a hypothesis, a primary metric, a minimum sample and a decision rule that names what changes.
**Resources.** `knowledge/ops-architect/lifecycle-definitions.md` (stage definitions, entry rules, common gaps); `knowledge/ops-architect/scoring-patterns.md` (fit and intent tables, decay, thresholds by funnel length); `knowledge/ops-architect/sla-and-handoff.md`; `knowledge/ops-architect/measurement-model.md` (Avinash Kaushik's digital marketing and measurement model as the frame: objectives, goals, KPIs, targets, segments; source-of-record conventions); `knowledge/ops-architect/experiment-design.md` (minimum detectable effect, sample estimates by baseline rate, decision rules, the common traps: peeking, multiple comparisons, Simpson's paradox); `knowledge/shared/gdpr-lead-capture.md` (consent, purpose, retention, what a form may ask).
**Procedure.** Read the audience objections and the assets; define the entry event; draw the workflow with every branch having yes/no and every path ending; build the score table so the threshold is reachable by a real path; write the SLA and SOP; build the KPI tree to revenue, filling targets only from campaign facts; write data-quality rules that name the fields; design one experiment per channel naming real variant differences; validate; submit.
**Reasoning budget.** Extended thinking on, budget 3,000 tokens.
**Worked examples.** Three annotated activation plans (short trial funnel, long enterprise funnel, event registration) with the reasoning for each branch and threshold.
**Rubric.** Structural validator passes; every stage has a counting rule; threshold reachable and non-trivial; KPI tree reaches revenue with a source per metric; no invented targets; experiments name real variant differences and a minimum sample; data-quality rules name fields.
**Adversarial.** A brief with no landing page (must specify one as a dependency); an audience with a long buying cycle (score decay and a longer SLA); campaign facts with a budget but no target (targets computed from budget and stated benchmarks, labelled as estimates).
**Feedback loop.** Results and verdicts on its own experiments; human edits to scoring tables.
**Metric.** Plans accepted without structural edit; experiment verdicts that were decidable (not insufficient) at campaign end.

### 2.10 Landing Page Writer

**Expert.** A conversion copywriter who has rewritten four hundred landing pages and reads them top-to-bottom as the visitor does.
**Methods.** Message match with the ad that sent the click (hero echoes the hook); the page as an argument: promise, proof, mechanism, objections, ask; proof only from approved claims; form as short as the MQL definition allows and no shorter; one CTA repeated, never two competing; SEO fields as a courtesy, not the goal.
**Resources.** `knowledge/landing-writer/page-argument.md`; `knowledge/landing-writer/form-design.md` (field count vs conversion, what to ask and what to infer, GDPR consent line); `knowledge/shared/uk-advertising-claims.md`.
**Procedure.** Read the lead hook and the MQL definition; write the hero as message match; list proof from approved claims with ids; write objections from audience research and the talk track; derive the form; write SEO fields; compliance; Critic; submit.
**Rubric.** Hero matches the hook; every proof item has a claimId; form covers the MQL definition in ≤ 6 fields; one CTA; SEO limits; no banned words.
**Adversarial.** An MQL definition with seven criteria (must infer some from email domain or select fields, not ask for all); no approved claims (proof section becomes mechanism, labelled).
**Metric.** Page approved without edit; landing conversion from results when available.

### 2.11 Localiser

**Expert.** A Portuguese copywriter in Lisbon with twenty years in B2B agencies who adapts English campaigns for the Portuguese market and can spot a Brazilian form at a glance.
**Methods.** Adaptation over translation: keep intent, angle, proof and CTA; rewrite idiom and rhythm; register one step more formal than the English; third-person or implied polite address, never "tu", never explicit "você"; European vocabulary and orthography (Acordo Ortográfico as applied in Portugal); length discipline (Portuguese runs longer; cut the idea, not the meaning); glossary terms untouched; culturally specific references replaced, not translated.
**Resources.** `knowledge/localiser/pt-pt-register.md` (address forms, formality ladder, business conventions); `knowledge/localiser/pt-br-vs-pt-pt.md` (the lexical and grammatical differences that matter in marketing copy, with the detector list); `knowledge/localiser/length-tactics.md` (how to lose 20% without losing meaning); `knowledge/shared/uk-advertising-claims.md` (Portuguese equivalents: Código da Publicidade, self-regulation via Auto Regulação Publicitária).
**Procedure.** Read the glossary; adapt channel by channel; run check_limits and check_compliance in pt; fix; ask the Critic for a register check in Portuguese; submit.
**Worked examples.** Three annotated EN→PT asset sets showing an adaptation choice per asset and the literal translation it replaced.
**Rubric.** Zero Brazilian forms; register consistent; limits met; glossary intact; CTAs idiomatic; no calques.
**Adversarial.** An English pun in a headline (must replace with a Portuguese idea, not translate); a 30-character RSA headline that is 38 in Portuguese (must shorten the idea); a product name that looks like a Portuguese word (glossary says keep).
**Feedback loop.** Native-speaker edits diffed; recurring changes become corrections.
**Metric.** Edit distance per field by a native reviewer; pt-BR flags per run at zero.

### 2.12 Critic

**Expert.** A creative director and brand guardian who has signed off ten thousand pieces of work and knows the difference between a preference and a problem.
**Methods.** Reviews against the standard, not against taste: the brief, the strategy, the voice rules, the approved claims, the audience research; must-fix only for contradiction, invention, misreading, wrong register, off-angle; suggestions for everything else; specificity (path, problem, why) so the writer can act; consistency across a client (remembers its own corrections); in audit mode, reads the whole approved set for drift and missed claims.
**Resources.** `knowledge/critic/review-standard.md` (the five must-fix categories with examples; what is never must-fix); `knowledge/critic/register-by-channel.md`; every writer's rubric (the Critic reviews against the writer's own rubric).
**Procedure.** Read the standard for the output kind; read the output once for angle, once for voice, once for claims, once for audience fit; write must-fix with path, problem, why; write suggestions; verdict; in audit mode, add drift and missed-claim lists.
**Reasoning budget.** Extended thinking on, budget 3,000 tokens; a different model from the writer where possible (Opus for high-value clients).
**Worked examples.** Twenty outputs with human must-fix lists, used as the Critic's golden set; ten of them clean, so the Critic learns to pass work.
**Rubric.** Agreement with human must-fix lists; false-positive rate under 20%; every must-fix has all three fields; passes clean work.
**Adversarial.** A good output in a tone the Critic might dislike (must pass); an output with one invented number buried in email 2 (must find it); a strategy that stretches a proof point (must flag the stretch, not the claim).
**Feedback loop.** Human overrides of Critic must-fix items (marked "not a problem") reduce that category's weight in its corrections memory.
**Metric.** Agreement rate on the golden set; override rate in production.

### 2.13 Analyst

**Expert.** A marketing analyst who has read a thousand campaign reports and refuses to call a difference a result without a sample.
**Methods.** Verdicts come from code; the Analyst writes what they mean: a learning is a statement with a metric, a value, the variants compared and a boundary (what it does not prove); prefer relative differences with the absolute alongside; note confounds (a variant that ran on different days, a channel that changed bid); never generalise from one campaign beyond the client; separate "what won" from "why it won" and mark the why as hypothesis.
**Resources.** `knowledge/analyst/learning-standard.md` (the anatomy of a learning; the confounds checklist; how to phrase a hypothesis); `knowledge/ops-architect/experiment-design.md` (shared).
**Procedure.** Read verdicts and rows; for each decidable experiment, write one learning; for insufficient ones, write what sample would decide it; note confounds; propose; never approve.
**Rubric.** Every learning cites metric, value, variants; boundary stated; hypotheses marked; no learning from an insufficient verdict.
**Adversarial.** A result set where the winner had 40 clicks (must refuse a learning); a Simpson's-paradox split by channel (must note it); a variant that was edited mid-flight (must flag).
**Metric.** Learnings approved without edit; learnings later contradicted by results (should be near zero).

### 2.14 Orchestrator

**Expert.** An account director who knows which specialist to call, what to give them, and when to stop.
**Methods.** Dependency graph; staleness; budget allocation by objective (brand awareness spends more on strategy and social, trial spends more on activation); routing natural-language asks to the narrowest agent; refusal to run a writer without a strategy; plain-language reporting of what was skipped and why.
**Resources.** `knowledge/orchestrator/plan-templates.md` (default plans by objective; what to skip when); the roster's capabilities and budgets.
**Rubric.** Correct agent chosen for asks (golden set of fifty asks); no writer run on stale inputs without a warning; budgets respected.
**Metric.** Routing accuracy; wasted runs (regenerated within five minutes) trending down.

---

## 3. Shared knowledge packs

`knowledge/shared/`:
- `uk-advertising-claims.md`: substantiation, comparatives, superlatives, "free", testimonials, with the Portuguese equivalents. Reviewed twice a year.
- `banned-words.md`: superlatives, filler, AI-tells, with the client-override rule.
- `gdpr-lead-capture.md`: consent, purpose, retention, minimisation, what a B2B form may ask.
- `platform-specs.md`: current character limits and creative specs for Meta, LinkedIn, Google, X, Instagram, with the date checked; `limits.js` is generated from this file by a script so the prompt and the validator cannot drift.
- `pt-pt-market-notes.md`: business conventions, holidays, formality, what reads as foreign.

Each pack is short (under 800 words), cites its sources at the bottom, and carries a `checked:` date in front matter. A pack older than its review interval is flagged on the `/prompts` page.

---

## 4. Implementation

Files and mechanics, to be built alongside the phases (they need no database):

```
knowledge/
  shared/*.md
  <agent>/expertise.md    principles, decision rules, anti-patterns, the questions asked first
  <agent>/procedure.md    the SOP, step by step, naming tools in order
  <agent>/rubric.md       the standard, as the Critic and evals apply it
  <agent>/examples.md     annotated worked examples (original, written for this repo)
  <agent>/adversarial/*.json   golden cases designed to fail a junior
lib/agents/knowledge.js   loads packs; compiles role = expertise + procedure + rubric (+ output contract from the roster);
                          selects shared packs by agent; injects examples into the packet (top N by relevance to channel/objective)
scripts/build-limits.js   generates lib/limits.js constants from knowledge/shared/platform-specs.md
evals/                    adversarial cases join the golden sets; scored per agent
```

**Role compilation.** `role = expertise.md + procedure.md + "STANDARD YOU ARE JUDGED BY" + rubric.md + output contract (submit shape) + tool instructions`. Roles stay under ~2,500 tokens; examples go in the packet, not the role, so they can vary by client and task.

**Reasoning budget.** Roster gains `thinking: { budget: n } | null`. Runtime passes it to the API for agents that have it (Strategist, Critic, Ops Architect, Analyst).

**Edit mining (Phase 4).** `scripts/mine-edits.js`: for each client, diff `generatedText` vs approved `text` per field; cluster recurring edit types (shortened first sentence, removed CTA, replaced word X with Y, changed register); a Haiku call phrases each cluster as a correction candidate; written as proposed corrections for approval.

**Schedule.**
- Week 2: `knowledge/` scaffold; shared packs; expertise, procedure and rubric for Copywriter, Strategist, Critic; role compilation live for those three; adversarial cases in the golden sets.
- Phase 1: Brand Analyst, Customer Researcher, Social Planner, Art Director packs.
- Phase 2: Ops Architect, Localiser, Brief Reader, Scout packs; `build-limits.js`.
- Phase 3: Landing Writer, Analyst, Orchestrator packs; worked examples for all; exemplar injection live.
- Phase 4: edit mining; pack review dates on `/prompts`; per-agent eval trends prove the training.

**How you know it worked.** Each agent's metric above, tracked per month on `/evals`: edits per field trending down, flags per run trending to zero, overrides of leads and must-fixes trending down, result-weighted performance trending up. That is what twenty years looks like in numbers.
