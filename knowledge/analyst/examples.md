---
name: analyst-examples
checked: 2026-08-27
review: annually
kind: worked-examples
note: Original examples written for this repository. Figures are illustrative.
---

# Worked examples: Analyst

---

## Example 1 — a learning worth keeping

**Verdict from code.** LinkedIn variant 1 (proof-led, "four days faster") 4.1 trials per 1,000 impressions; variant 3 (positioning-led, "works with your ledger") 3.1. n = 2,140 and 2,090 clicks. p = 0.02, 95% interval on the difference 0.3 to 1.7. Verdict: met.

**Learning.**
> Proof-led LinkedIn copy produced about a third more trials per 1,000 impressions than positioning-led copy (4.1 vs 3.1, ~2,100 clicks each, p = 0.02). Boundary: LinkedIn only, finance titles at 50–500 person companies, four weeks in Q4. Says nothing about Meta, other audiences, or whether the effect holds once the audience has seen the number several times.
> Hypothesis, not shown: the number works because this audience has a specific deadline in mind. Untested.

**Annotation.**
- The metric, the values, the sample and the confidence are all present, so a reader a year later can judge it themselves.
- The boundary names the fatigue question, which is the most likely way this learning stops being true.
- The hypothesis is separated and labelled. A junior writes "proof-led wins because buyers want evidence" and it becomes doctrine.

---

## Example 2 — a refusal

**Verdict.** Meta variant 2 converted at 5.1%, variant 3 at 3.4%. n = 41 and 38 clicks. Verdict: insufficient.

**Output.**
> No learning from the Meta test. With 41 and 38 clicks the difference is inside the noise; at these conversion rates roughly 300 clicks per variant would be needed to decide it. Recommend rerunning with budget concentrated on two variants rather than three.

**Annotation.**
- A 50% relative difference looks compelling and means nothing at this sample. This is the moment where a junior produces a confident learning and poisons the client's next three campaigns.
- The refusal is useful: it names the sample needed and the change that would get there.

---

## Example 3 — a confound found

**Verdict.** Email 2 variant with the chart link out-converted the plain variant by 22%, sample adequate, p = 0.03.

**Confound.** The chart variant went to the segment that had already clicked email 1; the plain variant went to everyone.

**Output.**
> Not a valid comparison. The chart variant was sent to a pre-engaged segment and the plain variant to the full list, so the difference measures the segment, not the creative. Recommend rerunning with random assignment within the same segment. The engaged segment's absolute rate (14.2% click) is worth recording as a segment benchmark.

**Annotation.**
- The statistics were fine. The design was not, and no p-value detects that.
- Something useful is salvaged: the segment benchmark. A refusal does not have to be empty-handed.

---

## Example 4 — an aggregate that reverses

**Aggregate.** Landing page B beat page A overall, 4.2% versus 3.8%.
**By channel.** On Search, A beat B (6.1% vs 5.4%). On LinkedIn, A beat B (2.9% vs 2.6%). B won overall only because more of its traffic came from Search.

**Output.**
> Page A converted better within every channel; page B won the overall average only because its traffic mix was weighted towards Search, which converts better regardless of page. Recommend page A, and reporting landing conversion by channel from now on.

**Annotation.**
- The aggregate would have led to the wrong page being kept. Segment before concluding, every time, and say so in the boundary when the segments agree.

---

## Self-check applied
Every learning cites metric, value, variants and sample; boundary stated; hypotheses labelled; nothing written from an insufficient or confounded verdict; scope kept to this client.
