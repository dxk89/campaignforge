---
name: scoring-and-handoff
checked: 2026-08-27
review: annually
used_by: [ops-architect, cro-specialist, analyst, landing-writer]
---

# Scoring, thresholds and the handoff

The lifecycle is easy to draw and easy to get wrong. These are the rules that decide whether it works in a real CRM.

## Two dimensions, never one

Score **fit** (title, seniority, company size, sector) and **intent** (pricing page, trial created, source connected, demo request). Both must clear a floor. High intent with no fit is a student or a competitor; high fit with no intent is a list entry.

The most common failure is scoring activity as if it were intent: five content downloads may be a researcher with no budget, while one pricing-page visit may be a decision-maker with an urgent need. Weight by what separated closed-won from closed-lost, not by how much effort the action took.

## Setting the threshold

Published models commonly use a 100-point scale with an MQL threshold around 40–65 and SQL at 70–100, but the number is not the point. The rule: set the threshold where the client's own closed-won deals cluster, by scoring the last 100–200 won and lost deals and finding the score above which conversion rises materially. Until that data exists, choose a threshold a plausible good lead reaches through a realistic path in about two weeks, and label it provisional.

Two tests before submitting a score table:
1. **Reachable.** Write out one real journey and add it up. If it does not cross, the threshold is theatre.
2. **Not trivial.** A newsletter signup plus two page views must not cross. If it does, sales stops trusting the queue within a month.

## Negative scoring and decay

Score down as well as up: personal email domains, student and competitor signals, job-seeker behaviour, existing customers. Decay behavioural points over time; a pricing visit ninety days ago is not intent today. Without decay a score is a lifetime activity total, not a buying signal.

## The handoff

- **Speed.** Route to a named person, not a queue. Response speed is the largest controllable factor in qualification odds.
- **An SLA in hours**, enforced in CRM workflow rather than by goodwill: commonly 24 hours to accept or reject high-intent leads, longer for warmer ones. Say what happens when it lapses.
- **A structured rejection reason** on every rejected lead (wrong fit, bad timing, already a customer, competitor). This feedback is the most valuable input for recalibrating the model and the only thing that stops scoring drifting.
- **What sales receives**, explicitly: fit and intent scores, the signals that fired, the campaign, and the two or three facts a first message should reference.

## Definitions before mechanics

MQL and SQL are defined jointly with sales, in writing, and reviewed. An MQL crosses a score; an SQL is a lead sales has explicitly accepted. If the plan cannot state each in one sentence, the workflow is decoration.

Sources: published lead-scoring guidance from Salespanel, Flinter, Scalarly, GrowthSpree and Ivris (2025–2026), which agree on fit-plus-intent scoring, calibrating thresholds against closed-won history, negative scoring and decay, and a short SLA with structured rejection feedback. Ranges are their published figures; the calibration rule matters more than the numbers.
