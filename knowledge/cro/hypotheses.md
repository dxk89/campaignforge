---
name: hypotheses
checked: 2026-08-27
review: annually
used_by: [cro, analyst, landing-writer]
---

# Finding the leak and testing the fix

## Start with the numbers, not the page

Locate the leak before proposing anything: visit → trial, trial → connected, MQL → opportunity. Compare each rate against the client's own history first and the ranges in `shared/b2b-benchmarks.md` second. The biggest absolute loss is rarely where the page looks worst.

If a page is already converting above benchmark, say so and look at the stage before or after it. Optimising a healthy step to prove diligence is how quarters get wasted.

## The hypothesis format

> Because we observed **X**, we believe **Y** will cause **Z**, measured by **W**.

All four parts, always. "Because 62% of visitors leave the form without submitting and session recordings show them stopping at the phone field, we believe removing the phone field will increase form completion, measured by form completion rate."

No observation, no hypothesis. "Test the button colour" has no X, and its result changes nothing.

## Prioritise on evidence

Rank by the strength of the evidence behind the observation, the size of the stage it affects, and the effort to build. Evidence outranks opinion: a change supported by a recording of ten users beats a change supported by a best-practice article.

## Page heuristics, when there is no data yet

Clarity (can a stranger say what this does in five seconds?), friction (every field, step and decision), anxiety (what are they afraid of, and is it answered on the page?), incentive (is the reason to act now stated?), distraction (what competes with the CTA?). These produce hypotheses that are honestly labelled as heuristic rather than evidenced.

## Sample and decision

Compute the sample before launch from the baseline rate and the smallest difference worth acting on. If the traffic cannot produce it inside the flight, do not run the test: either pick a bigger change, a higher-traffic page, or accept the change on judgement and say so.

One change per test. Say in advance what happens if it wins and if it loses. A test whose result changes nothing should not run.
