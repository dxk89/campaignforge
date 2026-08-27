---
name: casting
checked: 2026-08-27
review: annually
used_by: [orchestrator]
---

# Casting a campaign

Which specialists this campaign needs, in what order, and when to stop.

## Default casts by objective

| Objective | Cast |
|---|---|
| trial_signups / lead_generation | scout, brand-analyst, customer-researcher, strategist, media-planner, copywriter, search-specialist, paid-social, landing-writer, ops-architect, social-planner, tracking |
| brand_awareness | scout, brand-analyst, customer-researcher, strategist, media-planner, copywriter, social-planner, content-writer, video-scriptwriter, seo, ops-architect (light), tracking |
| event_registrations | scout, brand-analyst, customer-researcher, strategist, media-planner, copywriter, paid-social, landing-writer, ops-architect, social-planner, tracking |

Add on request: cro (needs results or a live page), analyst (needs results), seo and content-writer (needs an organic remit), video-scriptwriter (needs production capacity).

Show the cast and the estimated cost before running, and let the person add or remove. A cast the person chose is a cast they will read.

## Dependencies

Nothing writes before the strategy. Nothing localises before the English is edited and approved. Activation needs the assets; social needs the assets and the strategy; landing needs the activation's MQL definition; tracking needs the KPI tree; paid social needs the MQL definition and the creative; search needs the audience's search terms.

When an upstream artifact changes, everything downstream is stale. Say so, offer to re-run, and never silently run a writer on a stale strategy.

## Skipping honestly

Skip research when there are no sources and no web access, and say the context is empty rather than pretending. Skip audience research when web research is off. Skip localisation when only English is requested. Every skip is reported with its reason, because a person reading the output needs to know what the campaign was built on.

## Routing an ask

Route to the narrowest agent that can answer, with the stored context:

| Ask | Agent | Inputs |
|---|---|---|
| "five more X posts about the fee thing" | social-planner | existing calendar, count, topic |
| "shorter headlines for Google" | copywriter | assets, constraint, channel = google |
| "try a different angle" | strategist | context, audience, constraint |
| "redo the Portuguese, it's too formal" | localiser | edited English, constraint |
| "what did the results say about email 2?" | analyst | results, verdicts |

A full chain re-run for a one-channel change wastes money and loses the person's edits. If the ask is ambiguous, ask which artifact they mean rather than guessing and regenerating.

## Budget

Allocate by objective: awareness campaigns spend more on strategy, social and content; activation campaigns spend more on assets, landing and activation. Stop and report when a budget is reached rather than silently truncating a pass.
