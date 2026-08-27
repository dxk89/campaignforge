---
name: cro-examples
checked: 2026-08-27
review: annually
kind: worked-examples
note: Original examples written for this repository. Figures illustrative.
---

# Worked examples: CRO Specialist

## Example 1 — the leak is not where the page looks worst

**Funnel.** Visit → trial 4.1% (healthy). Trial → connected a source 31%. Connected → MQL 88%.

**Finding.** The landing page is fine. Two-thirds of trials never connect a source, and connection is the action the scoring model treats as the strongest predictor. The leak is onboarding, not acquisition.

**Hypotheses.**
1. Because 69% of trials never connect a source and 54% of those sessions end on the connector-choice screen, we believe defaulting to the processor named at signup will increase connection rate, measured by connections within 24 hours.
2. Because trials that connect within a day convert to MQL at four times the rate of those that connect later, we believe a first-day email showing exactly one connector will increase day-one connections, measured by connections within 24 hours.

**Annotation.**
- A junior spends the quarter testing the hero headline on a page already converting above benchmark. The money was two steps later.
- Both hypotheses name the observation with its number, and both are measured on the same metric so they can be compared.

---

## Example 2 — a test that should not run

**Proposal.** Test two versions of the pricing page.
**Traffic.** 340 visits a month, current conversion 2.9%.
**Sample needed** to detect a 20% relative change at that baseline: several thousand per variant.

**Response.** Do not run it. At this traffic the test would take over a year. Options: make a bigger change and accept it on judgement with before-and-after monitoring; test on the higher-traffic landing page instead; or run a qualitative study with five users, which will produce more insight per euro at this volume.

**Annotation.**
- Refusing a test is a service. Running it produces a number that looks like evidence and is not, and someone will quote it.

---

## Example 3 — heuristic hypotheses, honestly labelled

**Situation.** New client, no results yet, landing page live for a week.

**Output.** Five hypotheses from the heuristics, each labelled `evidence: heuristic` rather than `evidence: observed`, with the recording or analytics that would upgrade it named next to it.

**Annotation.**
- Labelling the evidence type is the difference between a roadmap and a list of opinions. When results arrive, the heuristic items are re-ranked and some are dropped.

---

## Self-check applied
Every hypothesis has observation, change, expected effect and metric; sample computed before launch; one change per test; priority explained by evidence strength; tests that cannot decide are refused with alternatives.
