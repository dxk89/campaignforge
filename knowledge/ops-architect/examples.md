---
name: ops-architect-examples
checked: 2026-08-27
review: annually
kind: worked-examples
note: Original examples written for this repository.
---

# Worked examples: Ops Architect

---

## Example 1 — a score table that is reachable and not trivial

**Client.** Ledgerline, trial signups. MQL definition: finance title, 50–500 employees, trial created, plus one engagement signal.

| Signal | Type | Points | Why |
|---|---|---|---|
| Title contains finance, controller, CFO, accounting | fit | 15 | The buyer, not a researcher |
| Company 50–500 employees | fit | 10 | The size where the spreadsheet breaks |
| Trial created | intent | 15 | Stated intent |
| Connected a bank or processor | intent | 25 | They have seen their own exceptions; the strongest predictor in this funnel |
| Clicked the walkthrough in email 2 | intent | 10 | Engaged with the proof |
| Visited pricing | intent | 10 | Evaluating cost |
| Personal email domain | negative | −15 | Not a company evaluation |
| Behavioural points older than 60 days | decay | −50% | A visit in June is not intent in September |

**Threshold: 45, provisional until closed-won history exists.**

**Reachability test, in the output.** Finance lead at a 200-person company creates a trial and connects Stripe: 15 + 10 + 15 + 25 = 65. Crosses comfortably.
**Triviality test.** Newsletter signup from a personal address, two page views: 0 − 15 = −15. Nowhere near.
**The middle case.** Finance lead, right size, trial, nothing connected, no clicks: 40. Stays in nurture, deliberately: in this funnel the evidence is the connection, and a trial with nothing connected is a tyre-kick.

**Annotation.**
- Connection scores higher than the trial because it is the action closest to value. Score proximity to value, not effort.
- Both tests appear in the output. A score table without them is a guess presented as a system.

**Junior version.** Ten signals at ten points each, threshold 50, no negatives, no decay. A blog subscriber crosses it and sales stops answering.

---

## Example 2 — every path terminates

**First draft.** s1 email 1 → s2 wait → s3 email 2 → s4 branch on click → yes: s5 handoff. No "no" path. The validator rejects it.

**Fixed.** s4 → yes s5 (handoff), no s6 (email 3, objection handler) → s7 branch on connection → yes s5, no s8 (exit to newsletter).

**Annotation.**
- The missing "no" branch is the commonest structural error and the one that silently loses leads: they enter, do not click, and sit there forever.
- Exit rules are separate from the graph and apply everywhere: replied, booked, became a customer, unsubscribed. Without them, someone who books a call still gets an email asking them to book a call.
- The validator catches the graph, not the sense. That is what the self-check question is for: would a real person receive a sequence that makes sense?

---

## Example 3 — a KPI tree that reaches revenue

| Stage | Metric | Target | Source of record |
|---|---|---|---|
| reach | Impressions by channel | set after week 1 | Ad platforms |
| engagement | CTR by variant | set after week 1 | Ad platforms |
| capture | Trials created | 120 | App database via CRM sync |
| qualification | MQLs over 45 | 60 | CRM |
| pipeline | Opportunities created | 20 | CRM, campaign field |
| revenue | Closed-won ARR attributed | set after week 1 | CRM |

**Annotation.**
- Two targets are numbers because the brief's campaign facts contained them; four say "set after week 1" because inventing them would be fabrication wearing a suit.
- Every row names the system that holds the truth. Where the ad platform and the CRM disagree, the source of record decides and the data-quality rules say how they reconcile.
- Impressions and CTR appear only at the top. A KPI tree whose last row is MQLs is a marketing report, not a business one.

---

## Example 4 — a long buying cycle

**Context.** Enterprise client, nine-month average cycle, budget stated without targets.

**Changes.** Decay window 180 days; SLA three business days with a named owner rather than 24 hours; the KPI tree adds "opportunities influenced" beside "created", because with a nine-month cycle a quarter's created-pipeline number says almost nothing; the experiment plan states plainly that no channel test will reach significance inside the flight, and proposes leading indicators instead.

**Annotation.**
- The plan says out loud that the campaign cannot prove revenue impact in its own window. That honesty is the difference between a measurement plan and a wish, and it is the sentence a client remembers.

---

## Self-check applied
Every node has an exit; threshold reachable and not trivial with both tests shown; every KPI has a source system; no invented targets; every experiment names two real variants and a sample.
