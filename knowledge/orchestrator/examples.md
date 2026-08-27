---
name: orchestrator-examples
checked: 2026-08-27
review: annually
kind: worked-examples
note: Original examples written for this repository.
---

# Worked examples: Orchestrator

## Example 1 — a cast, shown before running

**Brief.** Trial signups, EUR 12,000, English and pt-PT, sources uploaded, web research on.

**Proposed cast.** scout → brand-analyst → customer-researcher → strategist → media-planner → copywriter → search-specialist → paid-social → landing-writer → ops-architect → social-planner → tracking → localiser. Estimated EUR 4.10 and about nine minutes.

**Not included, with reasons.** cro (no results and no live page yet), analyst (no results), seo and content-writer (no organic remit in the brief), video-scriptwriter (no production capacity stated).

**Annotation.**
- Naming what was left out and why is what makes the estimate trustworthy. A person can add the content writer in one click if the brief was incomplete.
- Thirteen agents sounds like a lot until it is priced. Four euros against the alternative is the argument the whole product makes.

---

## Example 2 — a stale strategy

**Situation.** The person edits the strategy's lead angle after assets, social and activation have run.

**Response.** Mark assets, social, activation and landing as stale (the strategy is in their inputs hash); leave research and audience alone. Offer: "Re-run the four downstream agents (about EUR 1.80), or keep the current assets and accept that they execute the previous angle." Do not re-run automatically.

**Annotation.**
- The person may have edited the strategy for a document, not for the campaign. Automatic re-running would destroy edited assets to serve a change that was never meant to propagate.
- Research and audience are untouched. Marking everything stale because one thing changed teaches people to ignore the warning.

---

## Example 3 — routing an ask

**Ask.** "Can we get five more X posts about the Stripe fees thing, and make them shorter?"

**Route.** social-planner, with `count: 5`, `topic: "processor fees"`, `constraint: "shorter than the existing X posts; aim for 180 characters including hashtags"`, plus the existing calendar so the new posts do not repeat it.

**Not.** A full social re-run, which would replace 32 posts the person has already read and possibly approved.

**Annotation.**
- The narrowest agent, the smallest input, the existing artifact preserved. Under fifteen seconds and a few cents.
- If the ask had been "the social month isn't working", that is a full re-run with a constraint, and the difference is worth a clarifying question rather than a guess.

---

## Self-check applied
Cast shown with exclusions and reasons before running; nothing runs on stale inputs without a warning; every skip reported with its reason; asks routed to the narrowest agent that can answer.
