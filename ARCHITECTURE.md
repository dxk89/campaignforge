# From demo to production

This document describes how Campaign Forge would be wired into a real marketing stack. The demo stops at generated copy in a browser; production would push that copy into the tools where campaigns actually run.

## Where the demo ends

Everything happens in one Express app with no state: extract sources, run each of four Claude calls as its own request, validate, return JSON. The browser holds the sources and the intermediate outputs and calls the passes in order. Nothing persists. This is the right shape for a demo because it is auditable end to end in an afternoon. It is the wrong shape for a team because a campaign is not finished when the copy exists; it is finished when it is live, measured and iterated.

## Publishing to ad platforms

Each channel tab would gain a "Push to platform" action, behind OAuth. Meta's Marketing API, LinkedIn's Marketing API and Google Ads all use a similar model: authenticate an ad account once, then create a campaign, an ad set or ad group, and creatives as separate objects. The demo's JSON already mirrors the field structure each platform expects, and the validator already enforces their character limits, so the mapping is direct. What changes is the state: a pushed ad has an ID on the platform, a review status, and a spend, none of which exist in the demo. Pushed assets would be recorded with their platform IDs so the same campaign could be paused, edited or duplicated from one place.

Nothing would publish automatically. The chain produces a draft; a person approves a version; only then is it pushed, and pushed as paused so the platform's own review runs before spend starts.

## Email sequences

The three-email nurture with its branch condition maps onto a HubSpot workflow: a sequence of emails with an if/then branch on an engagement event. HubSpot's API can create the email templates and the workflow definition, with the branch note becoming the actual condition (clicked versus did not click). Alternatives such as Customer.io or Braze have the same primitives. The demo's branch note is prose; in production it would be a structured condition so the workflow could be created without a human translating it.

## Long generations

Four sequential calls take thirty to ninety seconds, longer with web research and Portuguese. That is fine for one person waiting on a form, and wrong for a team, for a batch of ten product lines, or for a proxy that closes idle connections at sixty seconds. Production would put generation on a queue: the request creates a job, a worker runs the chain, and the browser subscribes to progress over server-sent events or polls the job. The demo's browser-driven sequence is that pattern with the browser standing in for the worker; it already retries per pass rather than per campaign in the sense that a failed localisation has not lost the strategy and assets. A queue moves that guarantee server-side, so it survives a closed tab.

## Cost controls

The footer shows cost after the fact. Production would enforce it before: a per-campaign token budget, a per-account monthly ceiling, and a cheaper model for the research and brief-parse passes where the task is extraction rather than writing. Prompt caching becomes worthwhile once the same company context is reused across many campaigns in a month: the context block and the system prompts would be cached, and each generation would pay only for the brief and the output. The demo avoids caching because at one campaign at a time the cache-write premium costs more than it saves.

## Sources and memory

Today sources are uploaded per session. A team would keep a company library: brand guidelines, approved proof points, past campaigns with their performance, a glossary. The research pass would read from that library rather than from uploads, and it would be told what performed, so the strategy pass could weight angles by evidence rather than by judgement alone. That library is also where a human would approve or reject proof points, which is the control that stops a model from repeating a claim legal has already withdrawn.

## Versions and iteration

The demo generates once. A team wants to regenerate one channel with a different tone, keep the strategy and re-run assets, or compare two lead angles side by side. Each of those is a partial re-run of the chain, which is why the passes are separate functions with explicit inputs: the chain can start from any pass given the outputs of the earlier ones. A versioned store of pass outputs, keyed by campaign, is what makes that a product feature rather than an architectural possibility.
