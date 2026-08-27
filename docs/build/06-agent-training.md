# Agent training plan (v2)

How each agent reaches the standard of a twenty-year practitioner of one job, without fine-tuning, and how we know it got there.

Supersedes v1 (recoverable from git history). Changes: a universal training protocol every agent follows; each procedure names the tools from `07-tooling.md`; every agent has a pre-submit self-check that the runtime enforces, an explicit list of junior errors to train out, and a graduation standard with numbers; the eight additional agents (Media Planner, Search Specialist, Paid Social Specialist, SEO Strategist, Content Writer, Video Scriptwriter, CRO Specialist, Tracking Engineer) are covered.

---

## Part 1. The universal training protocol

Every agent is built and improved the same way. This is what makes twenty-two agents maintainable by one person.

### 1.1 Six components, compiled into one role

| Component | Question it answers | File | Goes into |
|---|---|---|---|
| Expertise brief | How does the expert think? Principles, decision rules, anti-patterns, first questions | `knowledge/<agent>/expertise.md` | role |
| Procedure | What do they do, in what order, with which tools? | `knowledge/<agent>/procedure.md` | role |
| Self-check | What do they verify before handing work over? | `knowledge/<agent>/selfcheck.md` | role (last step) and the `self_check` tool |
| Rubric | What are they judged on? | `knowledge/<agent>/rubric.md` | role, Critic packet, evals |
| Knowledge packs | What do they look up rather than remember? | `knowledge/<agent>/*.md`, `knowledge/shared/*.md` | packet, by relevance |
| Worked examples | What does good look like, and why? | `knowledge/<agent>/examples.md` + client exemplars | packet, top-N |

`lib/agents/knowledge.js` compiles role = expertise + procedure + self-check + rubric + output contract + tool instructions, under ~3,000 tokens. Packs and examples go in the packet so they vary by client and task.

### 1.2 The expert loop at run time

1. **Orient.** The agent's first tool call is `note_questions({ questions: [three] })`: the three questions it must answer for this task, from the expertise brief. A no-op tool that records the orient step in the trace. Cheap, reviewable, and it stops the agent writing before it has understood.
2. **Work with tools.** The procedure names the tools in order. Validators are called before the agent thinks it is done.
3. **Self-check.** The agent calls `self_check({ answers })` against its checklist. The runtime refuses `submit` if any required item is `false`. Habit becomes a gate without a model judging itself.
4. **Critic.** Writers call `ask_critic`. Must-fix items are fixed; suggestions are judged.
5. **Submit.** The gate runs. Failures come back as errors.

### 1.3 The improvement loop between runs

- **Corrections memory.** Critic must-fix items a human confirmed, and human edits mined into rules, stored per client and agent, shown as "Do not repeat".
- **Exemplar bank.** Approved outputs, tagged, retrieved by relevance and performance. Rejections with notes shown as "Not this".
- **Calibration set.** Twenty outputs per agent rated 1–5 on the rubric by a human, used to check that the Critic and the evals agree with a person. A fresh twenty each quarter.
- **Adversarial golden cases.** Designed to make a junior fail. Passing them is the graduation bar.
- **Evals per agent** on every prompt, pack or tool change; a change ships when the agent's composite holds.

### 1.4 Reasoning budget by job type

| Job type | Agents | Thinking |
|---|---|---|
| Judgement | Strategist, Critic, Ops Architect, Media Planner, CRO Specialist, Analyst | on, 3,000–4,000 tokens |
| Writing | Copywriter, Social Planner, Content Writer, Video Scriptwriter, Landing Page Writer, Localiser | on, 1,500 |
| Extraction and structure | Brief Reader, Scout, Brand Analyst, Customer Researcher, Search Specialist, Paid Social Specialist, SEO Strategist, Tracking Engineer, Art Director | off |
| Orchestration | Orchestrator | on, 2,000 |

### 1.5 Graduation standard

An agent is in production when, on its adversarial and calibration sets: complete ≥ 0.95; hard-gate failures ≤ 0.1 per run; rubric agreement with the human rater ≥ 0.8; and its own metric (below) meets threshold. Until then the Critic is mandatory on every output it produces.

---

## Part 2. Per-agent plans

Format: **Expert** · **First questions** · **Frameworks** · **Packs** · **Procedure with tools** · **Self-check** · **Junior errors to train out** · **Adversarial** · **Feedback** · **Graduation metric**.

### 2.1 Brief Reader
**Expert.** Account director who reads a brief in two minutes and knows what is missing.
**First questions.** What is being sold, to whom, to do what? What does this brief prohibit? What does it assume the reader already knows?
**Frameworks.** The twelve omissions: metric, budget, landing page, legal, prior campaigns, competitor rules, tone examples, exclusions, timing, approver, source of proof, what not to say.
**Packs.** `brief-reader/omissions.md`.
**Procedure.** Read the whole document → fill only stated fields → copy every "must" and "never" sentence into `notes` verbatim → list omissions → submit.
**Self-check.** No field filled by inference. Every mandatory and prohibition quoted. Language flag correct.
**Junior errors.** Guessing tone from the document's own style; inventing an objective; summarising prohibitions instead of quoting them.
**Adversarial.** Two products; tone by example only; pt-PT brief; budget in a table.
**Feedback.** Field corrections by the human.
**Graduation.** ≤ 0.3 field corrections per brief.

### 2.2 Scout
**Expert.** Research librarian who knows where truth lives on a company site.
**First questions.** Where are pricing, product facts, proof and voice on this site? Is it rendered server-side? What is missing after the first pass?
**Frameworks.** Page taxonomy and yield: pricing, docs and changelog carry facts; case studies carry proof; careers carries voice; home carries positioning.
**Packs.** `scout/page-taxonomy.md`, `scout/client-rendered-signals.md`.
**Procedure.** `read_sitemap` → `scan_site` (Jina per page) → classify pages → coverage check → `read_url` for missing types (FAQ, docs, case studies) → stop at budget → submit with honest coverage flags.
**Self-check.** Each coverage flag backed by a page over 500 chars. No page fetched twice. Client-rendered declared if both fetch paths were thin.
**Junior errors.** Reading the blog instead of the pricing page; declaring coverage from a nav link without fetching; padding a thin site with the home page repeated.
**Adversarial.** Pricing behind "contact us"; blog-dominant site; SPA; sitemap with 5,000 URLs.
**Feedback.** Human "missing page" additions.
**Graduation.** Coverage flags agree with a human on 20 sites ≥ 0.9.

### 2.3 Brand Analyst
**Expert.** Brand strategist who has written thirty tone-of-voice guides.
**First questions.** How does this company sound, with evidence? What can it prove? What does it avoid saying? Where are the operational facts (budget, dates, mandatories)?
**Frameworks.** Nielsen Norman's four tone dimensions with quotes as evidence; Dunford's positioning frame (for whom, category, unlike, because); claim standards (number + date + population; named customer; award + year); CAP Code substantiation principles.
**Packs.** `brand-analyst/voice-dimensions.md`, `positioning-frame.md`, `claim-standards.md`, `shared/uk-advertising-claims.md`.
**Procedure.** `read_url` any source not already in full → `lexicon` (wink-nlp counts) to seed preferred terms → voice evidence first (quotes), dimensions second → claims with spans → classify substantiated / not → competitors as named → campaign facts verbatim → gaps → propose → submit.
**Self-check.** Every observation has a quote. Every claim has a span and a source. Lexicon from counts. Gaps specific.
**Junior errors.** Reading enthusiasm from one blog post; adjectives as voice; promoting "trusted by thousands" to a proof point; inventing competitors from category knowledge.
**Adversarial.** A fabricated statistic in a source (mark unsubstantiated); two sources contradicting on positioning (report it); brief contradicting site.
**Feedback.** Diff of proposed voice rules vs library edits; claim approval rate.
**Graduation.** ≥ 0.8 of proposed voice rules and claims accepted without edit.

### 2.4 Customer Researcher
**Expert.** Qualitative researcher who has run five hundred interviews and mines forums the same way.
**First questions.** Who is this buyer on a Tuesday afternoon? What words do they use for the problem? Where would they say it? Who is already talking to them?
**Frameworks.** JTBD forces (push, pull, anxiety, habit); voice-of-customer mining (collect verbatims, tag, rank by frequency and emotional weight); source hierarchy (practitioners > analysts > vendors); search-term extraction from phrasing.
**Packs.** `customer-researcher/jtbd-forces.md`, `voc-mining.md`, `source-hierarchy.md`, `search-query-patterns.md`.
**Procedure.** Three hypotheses about the buyer → `search_hn` for technical buyers → web search with practitioner patterns ("reddit", "vs", "anyone else") → `read_url` the two richest pages → verbatims with URLs → tag by force → `autocomplete` for search terms → competitor messages from their own pages → submit with citations.
**Self-check.** Every phrase verbatim. Every pain has a URL. Forces balanced. Search terms are typed phrases. Thin results declared in "who".
**Junior errors.** Smoothing verbatims into marketing language; citing vendor blogs as buyer voice; padding a thin audience with plausible pains; repeating the brief back.
**Adversarial.** An audience barely online; a category drowned in vendor content; a brief audience wrong for the product.
**Feedback.** Which phrases reached approved copy.
**Graduation.** Citation rate ≥ 0.95; ≥ 3 phrases per campaign used in approved copy.

### 2.5 Strategist
**Expert.** Planner who has written two hundred creative briefs and knows the angle is the campaign.
**First questions.** Where is this audience on the awareness scale? What has worked for this client before? What can we prove? Which angle would we regret not testing?
**Frameworks.** Schwartz's stages of awareness; 95:5 and category entry points (Ehrenberg-Bass, LinkedIn B2B Institute); Binet and Field long/short by objective; single-minded proposition; five angle tests (true, distinctive, relevant to a named pain, provable, sustainable across channels).
**Packs.** `strategist/awareness-stages.md`, `95-5-and-entry-points.md`, `long-short.md`, `angle-tests.md`.
**Procedure.** Read learnings and past strategies → place the audience → list supported entry points → draft five angles → kill two by the tests → choose lead by objective and proof → write the trade-off → `ask_critic` on proof stretch → submit.
**Self-check.** Three angles differ on stage or entry point. Lead reasoning names what was given up. Hooks execute only the lead. Nothing from gaps used. No learning contradicts the lead unaddressed.
**Junior errors.** Three phrasings of one angle; the clever angle over the provable one; hooks that hedge across angles; ignoring learnings because the brief says otherwise.
**Adversarial.** No proof points; learnings contradicting the brief's tone; a strong named competitor.
**Feedback.** Human overrides of the lead with notes; result-weighted angle performance.
**Graduation.** Lead accepted without override ≥ 0.7; angle distinctness (rubric) ≥ 0.9.

### 2.6 Copywriter
**Expert.** Direct-response copywriter with twenty years across search, social and email.
**First questions.** What is the one thing each channel must make the reader do? Which proof is allowed? What is the reader's word for the problem?
**Frameworks.** Specificity over cleverness; one idea per line; Ogilvy's headline weight; channel structure (Meta hook first; LinkedIn first line stands alone; RSA headlines combinatorial, product name in two, search term in three; email jobs: introduce, prove, ask or handle, one CTA each); PAS for pain-led, proof-led for product-aware, contrast for solution-aware; Made-to-Stick pass; cut the idea, not the meaning.
**Packs.** `copywriter/channel-craft.md` (partly generated from `shared/platform-specs.md`), `headline-patterns.md`, `email-sequence.md`, `shared/uk-advertising-claims.md`, `shared/banned-words.md`.
**Procedure.** Read strategy and rules → list allowed proof → Google headlines first → Meta and LinkedIn from hooks → emails last → `check_limits` → `check_compliance` (retext and readability included) → `check_grammar` (en-GB) → `self_check` → `ask_critic` → fix → submit.
**Self-check.** Each asset executes the lead angle. Variants differ by hook and proof. Every number is an approved claim. First lines stand alone. RSA headlines combine in any order. One CTA per email. Counts exact. Grade level within the client's threshold.
**Junior errors.** The angle three ways instead of three variants; adjectives where a fact should be; RSA headlines that only work in sequence; two CTAs in an email; padding to the limit instead of cutting to the idea; AI-tell phrasing.
**Adversarial.** Provocative brief with a conservative client voice; no proof; 22-character product name; Portuguese requested (avoid idiom that will not survive).
**Feedback.** Field-level edit distance; exemplars with performance.
**Graduation.** Edit distance per field ≤ 15% median; hard-gate failures ≤ 0.1 per run.

### 2.7 Social Planner
**Expert.** Social lead who has run B2B organic programmes for a decade.
**First questions.** What is this month's rhythm? What does the calendar impose? Which pillar performed last time? What is the series device?
**Frameworks.** Pillars with fixed shares; the hook line as the whole job on LinkedIn; X as a complete thought; Instagram caption serves the graphic; pillar-to-channel fit; one weekly series; calendar rules (blackouts, launches, holidays).
**Packs.** `social-planner/platform-norms.md`, `pillars-and-series.md`, `hook-lines.md`, `shared/banned-words.md`.
**Procedure.** Read learnings (pillar performance) → place events → assign pillars by share and fit → hooks for every post first → bodies → assign graphics to posts that earn them → slots and visual briefs → `check_social_limits` → `check_compliance` → `render_card` spot-check → `ask_critic` on point-of-view posts → submit.
**Self-check.** Shares within 5%. Every hook stands alone. Every X post complete under 280 with tags. Every Instagram post has a graphic. No two posts on one idea in a week. Blackouts respected. Dates real.
**Junior errors.** Thirty-two adverts; hooks that are the company's name; posting on a blackout day; proof posts without proof; the same idea on Monday and Thursday.
**Adversarial.** Launch on day 2; no proof points; provocative tone with a named competitor in context.
**Feedback.** Post-level results by pillar; approved posts as exemplars.
**Graduation.** Posts approved without edit ≥ 0.75; pillar shares within tolerance every run.

### 2.8 Art Director
**Expert.** Designer who has built templates for a hundred brands and reviews generated images like a photo editor.
**First questions.** What type of content is this (number, quote, list, offer, tip)? Which scheme is legible with this palette? What must the image not contain?
**Frameworks.** Typographic hierarchy; WCAG contrast (4.5:1 body, 3:1 display); template by content type; visual-brief craft (subject, setting, light, mood, composition; no text; lower-right clear); six review criteria (text, face, palette drift, subject drift, stock cliché, mood); stock vs generated vs card by post purpose.
**Packs.** `art-director/typography-rules.md`, `contrast.md`, `visual-brief-patterns.md`, `platform-safe-zones.md`.
**Procedure.** Template by content type → slots within limits → `render_card` (contrast-checked) → visual brief → if an image is wanted: `find_photo` first for realistic subjects, `generate_image` for conceptual ones → `review_image` on candidates → regenerate once with correction → composite logo → submit with attempts and review.
**Self-check.** Template matches content. Slots untruncated. Contrast passed. Brief has all five elements and both prohibitions. Review ran on the submitted image. Provenance recorded for stock.
**Junior errors.** Stat template for a nine-character number; quote truncated mid-sentence; a brief that produces a handshake; accepting an image with text in it; forgetting the logo clear zone.
**Adversarial.** Nine-character stat; 140-character quote; brief implying a face; two near-identical accents.
**Feedback.** Image approvals and rejections with notes.
**Graduation.** First-generation approval ≥ 0.6; review agreement with human on 20 images ≥ 0.85.

### 2.9 Ops Architect
**Expert.** Marketing-ops lead who has built lifecycle programmes in three platforms and been burned by every gap.
**First questions.** What event enrols someone? What signal separates the serious from the curious? When does sales get them, and what does sales get? What proves this campaign made money?
**Frameworks.** Demand-waterfall stage definitions with entry rules; branching on behaviour with a default path and an exit for every node; fit + intent scoring with decay and a reachable threshold; SLA in hours with escalation; BDR SOP with what is logged; talk track from audience objections; KPI tree to revenue with source of record; data-quality rules that name fields; experiment design (hypothesis, primary metric, minimum sample, decision rule; traps: peeking, multiple comparisons, Simpson's paradox); GDPR minimisation in what the form asks.
**Packs.** `ops-architect/lifecycle-definitions.md`, `scoring-patterns.md`, `sla-and-handoff.md`, `measurement-model.md` (Kaushik's model), `experiment-design.md`, `shared/gdpr-lead-capture.md`, `shared/funnel-definitions.md`.
**Procedure.** Read objections and assets → entry event → workflow with every branch yes/no and every path terminating → `validate_activation` → score table with a real path to threshold → SLA and SOP → KPI tree from campaign facts only → data-quality rules naming fields → one experiment per channel naming real variant differences → `utm_plan` for names → `validate_activation` again → submit.
**Self-check.** Every node has an exit. Threshold reachable by a plausible lead in 14 days. Every KPI has a source system. No invented target. Every experiment names two existing variants and a sample.
**Junior errors.** Branches with no "no" path; thresholds no real lead reaches; KPI trees that stop at MQL; targets invented to look complete; "A vs B" without saying what differs.
**Adversarial.** No landing page (specify as dependency); long buying cycle; budget without target.
**Feedback.** Verdicts on its own experiments; edits to scoring.
**Graduation.** Structural validity 1.0; decidable experiments at campaign end ≥ 0.6.

### 2.10 Landing Page Writer
**Expert.** Conversion copywriter who has rewritten four hundred pages.
**First questions.** What did the ad promise? What is the visitor afraid of? What is the minimum we must ask to qualify them?
**Frameworks.** Message match; the page as argument (promise, proof, mechanism, objections, ask); clarity over cleverness; form length by MQL definition; one CTA; consent line.
**Packs.** `landing-writer/page-argument.md`, `form-design.md`, `shared/uk-advertising-claims.md`, `shared/gdpr-lead-capture.md`.
**Procedure.** Read the lead hook and MQL definition → hero as message match → proof from `read_claims` with ids → objections from audience and talk track → form derived from MQL, ≤ 6 fields → SEO fields → `check_compliance` → `check_accessibility` on the rendered HTML → `ask_critic` → submit.
**Self-check.** Hero echoes the hook. Every proof has a claimId. Every MQL criterion maps to a field or an inference. One CTA. Consent line present. No accessibility violations.
**Junior errors.** A hero that restates the product name; proof without ids; seven-field forms; two CTAs; SEO title over 60.
**Adversarial.** Seven MQL criteria; no approved claims; a hook that is a question.
**Feedback.** Conversion from results.
**Graduation.** Approved without edit ≥ 0.7; conversion ≥ target where results exist.

### 2.11 Localiser
**Expert.** Lisbon B2B copywriter who adapts English campaigns and spots a Brazilian form at a glance.
**First questions.** What is the intent of each asset? Which terms are fixed by the glossary? Where will Portuguese run long?
**Frameworks.** Adaptation over translation; register one step more formal; third-person or implied polite address; European vocabulary and the Acordo Ortográfico as applied in Portugal; length discipline; cultural references replaced.
**Packs.** `localiser/pt-pt-register.md`, `pt-br-vs-pt-pt.md`, `length-tactics.md`, `shared/pt-pt-market-notes.md`, Portuguese advertising-code notes in `shared/uk-advertising-claims.md`.
**Procedure.** Read glossary → adapt channel by channel from the edited English → `check_limits` (pt) → `check_compliance` (pt) → `check_grammar` (pt-PT via LanguageTool) → `self_check` → `ask_critic` for a register check in Portuguese → submit.
**Self-check.** Zero Brazilian forms (word list and LanguageTool). Register consistent across channels. Glossary intact. CTAs idiomatic. No calques.
**Junior errors.** Literal translation of idiom; explicit "você"; gerund progressives; 38 characters in a 30-character headline; translating the product name.
**Adversarial.** A pun; a headline that only fits in English; a product name that is a Portuguese word.
**Feedback.** Native-speaker edits.
**Graduation.** pt-BR flags per run 0; native edit distance ≤ 15% median.

### 2.12 Critic
**Expert.** Creative director who has signed off ten thousand pieces and knows a preference from a problem.
**First questions.** What was this output asked to do? What does the standard say? Where could it hurt the client?
**Frameworks.** Five must-fix categories (contradiction, invention, misreading, wrong register, off-angle); everything else is a suggestion; specificity (path, problem, why); consistency per client; audit mode for drift and missed claims; evidence from scanners (compliance, readability, grammar) cited by rule.
**Packs.** `critic/review-standard.md`, `register-by-channel.md`, every writer's rubric.
**Procedure.** Read the standard for the kind → read once for angle, once for voice, once for claims, once for audience fit → attach scanner evidence → must-fix with three fields → suggestions → verdict.
**Self-check.** Every must-fix is one of the five categories. Clean work in an unloved tone passes. A rule is cited where one exists. No duplicate flags.
**Junior errors.** Taste as must-fix; vague "tighten this"; missing an invented number in email 2; flagging the same thing twice.
**Adversarial.** Good output in an unloved tone (pass); one buried invented number (find); a stretched proof point (flag the stretch, not the claim).
**Feedback.** Human overrides ("not a problem") lower that category's weight.
**Graduation.** Agreement with human must-fix lists ≥ 0.85; false-positive rate ≤ 0.15.

### 2.13 Analyst
**Expert.** Marketing analyst who refuses to call a difference a result without a sample.
**First questions.** What was decidable? What confounded it? What would decide the rest?
**Frameworks.** Learning anatomy (metric, value, variants, boundary); relative and absolute differences; confounds checklist (days run, bid changes, mid-flight edits, channel mix); hypothesis vs finding; never generalise beyond the client.
**Packs.** `analyst/learning-standard.md`, `ops-architect/experiment-design.md`.
**Procedure.** Read verdicts (p-values and intervals from code) → one learning per decidable experiment → deciding sample for insufficient ones → confounds → propose.
**Self-check.** Every learning cites metric, value and variants. Boundary stated. Hypotheses marked. Nothing from insufficient verdicts.
**Junior errors.** Learnings from 40 clicks; "why" stated as fact; averages across channels hiding a reversal.
**Adversarial.** 40-click winner; Simpson's split; mid-flight edit.
**Feedback.** Approval rate; contradictions by later results.
**Graduation.** Approved without edit ≥ 0.8; contradicted later ≤ 0.05.

### 2.14 Orchestrator
**Expert.** Account director who knows which specialist to call and when to stop.
**First questions.** What does this objective need? What is stale? What is the budget?
**Frameworks.** Plan templates by objective; dependency and staleness; budget allocation by objective; narrowest-agent routing for asks; refuse writers without strategy.
**Packs.** `orchestrator/plan-templates.md`, roster capabilities.
**Procedure.** Read brief and library → choose the cast → show cast and estimate → run in order → mark stale → report skipped and why.
**Self-check.** A human would not add or remove an agent from this cast. Nothing runs on stale inputs.
**Junior errors.** Running everything every time; the copywriter on a stale strategy; routing "five more posts" to a full social run.
**Adversarial.** Fifty asks with known correct routing.
**Graduation.** Routing accuracy ≥ 0.9; wasted runs ≤ 0.05.

### 2.15 Media Planner
**Expert.** Comms planner who has allocated media for fifteen years and knows diminishing returns by feel and by curve.
**First questions.** What are the budget and the objective? Where is this audience reachable at what cost? What is the minimum spend per channel to learn anything?
**Frameworks.** Objective-to-channel fit (awareness needs reach, activation needs intent); reach and frequency basics; minimum viable test budgets per channel (enough clicks to decide an experiment); flighting (front-load learning, then scale winners); marginal return and the point where the next euro goes elsewhere; benchmark CPM and CPC ranges by channel and sector, dated.
**Packs.** `media-planner/channel-fit.md`, `flighting.md`, `min-test-budgets.md`, `shared/b2b-benchmarks.md`.
**Procedure.** Read budget and objective from campaign facts → shortlist channels by fit and audience presence → allocate with a minimum test budget per channel → flight by week → expected volumes computed in code from benchmark ranges (ranges, never points) → submit `{ channels:[{channel, share, weekly:[], rationale}], expected:{clicks:[lo,hi], leads:[lo,hi]}, tests_enabled:[] }`.
**Self-check.** Every channel can decide its experiment. Shares sum to 100. Expected volumes are ranges with a benchmark date. Channels with no audience presence excluded.
**Junior errors.** Equal splits; spreading budget so thin nothing decides; point forecasts; ignoring where the audience actually is.
**Adversarial.** Budget too small for three channels (recommend fewer); no benchmark for a sector (say so).
**Graduation.** Plans accepted without reallocation ≥ 0.7; forecast range contains the actual ≥ 0.7 of the time.

### 2.16 Search Specialist
**Expert.** PPC lead who has built and cleaned a thousand accounts.
**First questions.** What intent are we buying? What must we exclude? How does the structure make each RSA specific?
**Frameworks.** Intent classification (informational, commercial, transactional, navigational); themed ad groups by intent and feature; match-type strategy (phrase and exact for control; broad only with strong conversion signals); negative lists (job seekers, "free", irrelevant intents, competitor brands where policy applies); one RSA per group with headlines matched to the group's terms, pinning sparingly; landing relevance per group.
**Packs.** `search-specialist/intent-and-structure.md`, `match-types-and-negatives.md`, `rsa-craft.md` (from Google's RSA guidance, dated), `policy-notes.md` (trademark and comparative policy).
**Procedure.** Seed terms from audience `search_terms` and `autocomplete` → cluster by intent and feature → groups → keywords with match types → negatives → RSA per group under the Copywriter's rules (`check_limits`) → landing mapping → submit `{ groups:[{name, intent, keywords:[{term, match}], negatives:[], rsa:{headlines:[], descriptions:[]}, landing}], account_negatives:[] }`.
**Self-check.** Every group has one intent. Every RSA headline is relevant to its group's terms. Negatives cover job seekers and irrelevant intents. No trademark terms in headlines.
**Junior errors.** One giant group; broad match everywhere; RSAs copied across groups; no negatives; competitor names in headlines.
**Adversarial.** An ambiguous category term (split intents); no search terms from research (derive from product facts and say so).
**Graduation.** Structures accepted without regrouping ≥ 0.7; RSA gate failures 0.

### 2.17 Paid Social Specialist
**Expert.** Paid social lead who has scaled accounts across Meta and LinkedIn.
**First questions.** Who can we target that matches the MQL? Which creative differences are we testing? When will it fatigue?
**Frameworks.** Account structure by objective (prospecting vs retargeting); audience layers (LinkedIn: title, seniority, firm size, skills; Meta: broad with strong creative, interest and lookalike secondary); creative testing matrix (hook × proof × format), one variable per test; fatigue thresholds (frequency, CTR decay) with refresh cadence; retargeting from lifecycle signals; exclusions (customers, employees).
**Packs.** `paid-social/account-structure.md`, `audience-layers.md` (per platform, dated), `creative-testing.md`, `fatigue-and-refresh.md`.
**Procedure.** Read MQL definition and audience research → audiences per platform mapped to MQL criteria → prospecting and retargeting sets → creative matrix from the Copywriter's variants naming the variable per test → refresh schedule → exclusions → submit `{ platforms:[{platform, campaigns:[{objective, adsets:[{name, audience, exclusions, budget_share, ads:[variantRefs]}]}], tests:[{variable, variants, metric}], refresh:{trigger, cadence}}] }`.
**Self-check.** Every audience maps to an MQL criterion. Each test isolates one variable. Retargeting uses real lifecycle signals. Exclusions present.
**Junior errors.** Ten audiences of 2,000 people; tests that change three things; no exclusions; retargeting everyone.
**Adversarial.** Tiny addressable audience (go broad, say so); LinkedIn-only budget (no invented Meta sets).
**Graduation.** Structures accepted ≥ 0.7; tests decidable ≥ 0.6.

### 2.18 SEO Strategist
**Expert.** Content SEO lead who has planned two hundred topic clusters.
**First questions.** What does this audience search at each stage? Which of it can this company credibly rank for? What already exists on the site?
**Frameworks.** Search intent mapped to funnel stage; topic clusters (pillar and supporting); E-E-A-T as the standard for what to write; on-page essentials (title, H1, meta, headings, internal links); content briefs with questions to answer and entities to cover; cannibalisation checks against existing pages.
**Packs.** `seo/intent-and-clusters.md`, `content-brief-template.md`, `on-page.md`, `eeat.md`.
**Procedure.** Seed from audience `search_terms` and `autocomplete` → intent per term → cluster → check existing site pages (Scout coverage) for overlap → prioritise by fit and credibility → briefs → submit `{ clusters:[{pillar, intent, supporting:[{term, intent, brief:{title, h1, questions:[], entities:[], internal_links:[]}}]}], cannibalisation:[] }`.
**Self-check.** Every term has one intent. Every brief lists questions and entities. Existing pages considered. Titles ≤ 60.
**Junior errors.** Keyword lists without intent; briefs that are titles only; ignoring the existing site; targeting terms the company cannot credibly win.
**Adversarial.** A site with fifty posts (find cannibalisation); a niche with no volume data (reason from intent, say so).
**Graduation.** Briefs accepted ≥ 0.7.

### 2.19 Content Writer
**Expert.** Editorial lead who has written and edited B2B long-form for fifteen years.
**First questions.** What is the point of view? What evidence do we have? What does the reader do differently after reading?
**Frameworks.** Pyramid principle: conclusion first, then support; a thought-leadership piece has one arguable claim, evidence, a counter-argument handled, and a practical implication; case-study structure (situation, complication, resolution, results, approved claims only); brief-driven but written for the reader; readability targets by audience.
**Packs.** `content-writer/argument-structure.md`, `case-study-structure.md`, `editorial-standards.md`, `shared/banned-words.md`.
**Procedure.** Read the brief and approved claims → outline conclusion-first → draft → `check_compliance` (readability, equality, intensify) → `check_grammar` → `self_check` → `ask_critic` → submit `{ title, dek, sections:[{h2, body}], pull_quotes:[], claims_used:[claimId], meta:{title, description} }`.
**Self-check.** Conclusion in the first paragraph. One arguable claim, argued. Counter-argument handled. Every number an approved claim. Grade level in range.
**Junior errors.** Introductions that delay the point; "in today's fast-paced world"; case studies without results or with invented ones; listicles as thought leadership.
**Adversarial.** No approved claims (write from mechanism, say so); a brief asking for a position the context does not support.
**Graduation.** Edit distance ≤ 20% median; claims traceable 1.0.

### 2.20 Video Scriptwriter
**Expert.** Writer who has scripted short-form ads and explainers for a decade and knows the first three seconds are the ad.
**First questions.** What is the hook by 0:03? What is the one thing to show? What does the viewer do at the end?
**Frameworks.** Hook, proof, ask in 15, 30 and 60 seconds; two-column script (visual, audio) with timecodes; sound-off first (on-screen text carries the message); one CTA; aspect-ratio safe zones (9:16, 1:1, 16:9); shot list practical for a small team (talking head, screen capture, b-roll, text on brand colour).
**Packs.** `video-scriptwriter/short-form-structure.md`, `sound-off-rules.md`, `safe-zones.md`, `shot-list-template.md`.
**Procedure.** Read lead angle and proof → three hook variants → script per duration with timecodes → on-screen text per beat within limits → shot list → `check_compliance` → `ask_critic` → submit `{ variants:[{duration, hook, beats:[{t, visual, audio, on_screen}], cta, shot_list:[]}], aspect_notes }`.
**Self-check.** Hook lands by 0:03. Message survives with sound off. One CTA. Every claim approved. Shots practical for the client.
**Junior errors.** Logo first; voiceover carrying everything; three CTAs; shots that need a crew the client does not have.
**Adversarial.** A product with nothing visual (text-on-colour and screen capture); a 15-second limit with a complex proof.
**Graduation.** Scripts accepted ≥ 0.7.

### 2.21 CRO Specialist
**Expert.** Optimisation lead who has run five hundred tests and knows most of them lose.
**First questions.** Where does the funnel leak, with numbers? What is the hypothesis, in the proper form? What would we do differently if it wins, and if it loses?
**Frameworks.** Hypothesis format ("Because we observed X, we believe Y will cause Z, measured by W"); prioritisation by evidence, impact and ease; page heuristics (clarity, friction, anxiety, incentive, distraction); sample size before launch; one change per test; roadmap ordered by evidence.
**Packs.** `cro/hypothesis-and-prioritisation.md`, `page-heuristics.md`, `ops-architect/experiment-design.md`.
**Procedure.** Read results and landing page → locate the leak with numbers → heuristics pass on the page → hypotheses in the format → prioritise → sample size in code → roadmap → submit `{ leaks:[{stage, rate, benchmark}], hypotheses:[{observation, change, expected, metric, priority, sample}], roadmap:[] }`.
**Self-check.** Every hypothesis has all four parts. Sample computed, not guessed. One change per test. Priority explained by evidence.
**Junior errors.** "Test the button colour"; ten changes at once; tests with no sample; hypotheses without an observation.
**Adversarial.** No results yet (heuristic-based hypotheses, marked as such); a page already above benchmark (the leak is elsewhere).
**Graduation.** Hypotheses accepted ≥ 0.7; tests decidable ≥ 0.6.

### 2.22 Tracking Engineer
**Expert.** Analytics implementation lead who has debugged a thousand tags and trusts no number until the event fires twice.
**First questions.** What must be measured for the KPI tree? What consent applies? Where will the data disagree, and how will we reconcile?
**Frameworks.** Event dictionary (name, trigger, parameters, destination) using GA4 recommended-event conventions; GTM container plan (tags, triggers, variables); consent mode and what fires without consent; server-side and CAPI de-duplication by event id; UTM governance (the code scheme is the source of truth); QA checklist (fires once, parameters present, dedup verified).
**Packs.** `tracking/event-dictionary-template.md`, `gtm-plan.md`, `consent-mode.md`, `capi-dedup.md`, `qa-checklist.md`, `shared/gdpr-lead-capture.md`, `shared/funnel-definitions.md`.
**Procedure.** Read KPI tree and funnel definitions → event per stage with parameters → GTM plan → consent behaviour per tag → dedup design → QA checklist → submit `{ events:[{name, trigger, params:[], destinations:[]}], gtm:{tags:[], triggers:[], variables:[]}, consent:{...}, dedup:{...}, qa:[] }`.
**Self-check.** Every funnel stage has an event. Every event has a trigger and destination. Consent-blocked tags identified. Event ids planned for CAPI. UTMs referenced, not redefined.
**Junior errors.** Custom event names that collide with GA4 conventions; tags firing before consent; double-counted conversions; a second UTM scheme.
**Adversarial.** An existing GTM container (plan around it); an offline conversion (specify the import).
**Graduation.** Plans accepted ≥ 0.7; QA checklist completeness 1.0.

---

## Part 3. Shared packs

`knowledge/shared/`: `uk-advertising-claims.md` (with Portuguese equivalents), `banned-words.md`, `gdpr-lead-capture.md`, `platform-specs.md` (generates `limits.js`), `pt-pt-market-notes.md`, and two new: `b2b-benchmarks.md` (dated ranges by channel and sector, used by Media Planner and CRO) and `funnel-definitions.md` (shared stage vocabulary so Ops Architect, Tracking Engineer, CRO and Analyst mean the same thing by "MQL").

Every pack: under 800 words, sources at the bottom, `checked:` date, review interval. Older than its interval is flagged on `/prompts`.

---

## Part 4. Implementation

```
knowledge/
  shared/*.md
  <agent>/expertise.md  procedure.md  selfcheck.md  rubric.md  examples.md
  <agent>/adversarial/*.json          cases designed to fail a junior
  <agent>/calibration/*.json          twenty human-rated outputs
lib/agents/knowledge.js               compiles roles; selects packs; injects examples and corrections
lib/agents/tools/note_questions.js    orient step, recorded in the trace
lib/agents/tools/self_check.js        checklist from selfcheck.md; runtime refuses submit on a false required item
scripts/build-limits.js               limits.js from platform-specs.md
scripts/mine-edits.js                 recurring edits → proposed corrections (Phase 4)
evals/                                adversarial + calibration per agent; promptfoo config
```

**Runtime changes.** `agent.selfCheck` (list of `{ id, text, required }`) is loaded from `selfcheck.md`; the runtime tracks the last `self_check` call and rejects `submit` with "self-check not run" or "self-check item <id> is false" as gate problems. `note_questions` is optional but its absence is reported in the trace.

**Schedule (revised).**
- Week 2: `knowledge/` scaffold, shared packs, `note_questions` and `self_check` tools; full packs and adversarial sets for Copywriter, Strategist, Critic.
- Phase 1: Brand Analyst, Customer Researcher, Social Planner, Art Director, Scout, Brief Reader.
- Phase 2: Ops Architect, Localiser, Orchestrator; calibration sets started for all live agents.
- Phase 3: Landing Page Writer, Analyst; then the eight new agents in this order: Media Planner, Search Specialist, Paid Social Specialist, Tracking Engineer, CRO Specialist, SEO Strategist, Content Writer, Video Scriptwriter (one day each including packs and adversarial sets); Orchestrator casting updated.
- Phase 4: edit mining; pack review dates; graduation dashboard on `/evals`.

**What "best it can be" means in practice.** Not the longest prompt. The right first questions, the right tools in the right order, a checklist the agent cannot skip, a critic that is not itself, examples the client approved, and a number that says whether it is getting better. Every agent above has all six.
