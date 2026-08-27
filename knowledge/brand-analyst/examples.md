---
name: brand-analyst-examples
checked: 2026-08-27
review: annually
kind: worked-examples
note: Original examples written for this repository. Fictional companies; the source quotes are invented for the example.
---

# Worked examples: Brand Analyst

---

## Example 1 — voice from evidence, not impression

**Sources.** Ledgerline home page, pricing page, a support article, a careers page.

Extracted quotes:
- Home: "Close the month without the spreadsheet."
- Pricing: "Per connected entity. From EUR 190 a month. No setup fee."
- Support: "If a payout does not match, Ledgerline files it as an exception. Exceptions are not errors; they are the lines that need a person."
- Careers: "We write short. We would rather ship a plain sentence than a clever one."

**Output (abridged).**

```
voice.observations:
  - "Short declarative sentences, rarely over fifteen words" ["Close the month without the spreadsheet."]
  - "States price plainly on the pricing page rather than gating it" ["From EUR 190 a month. No setup fee."]
  - "Corrects the reader's likely vocabulary rather than adopting it" ["Exceptions are not errors"]
  - "Matter-of-fact rather than enthusiastic; no exclamation across four pages"
preferred_terms: [exceptions, close the month, payout reconciliation, connected entity]
avoid_terms: [errors, bookkeeping, AI-powered, revolutionary]
```

**Annotation.**
- Every observation has its quote. The fourth is an absence, which is legitimate evidence when the sample is wide enough to make absence meaningful: four page types, no exclamation.
- "Exceptions, not errors" came from a support page. Support and careers pages are where the voice is least performed, which is why the procedure requires reading them.
- On the four dimensions this profile is serious, mid-formal, respectful, matter-of-fact. The profile is recorded, but the lexicon is what the Copywriter actually uses. Dimensions guide register; words are enforceable.
- "AI-powered" and "revolutionary" are in avoid on contrast: the category uses them and this company, across four pages, never does.

**Junior version.** `observations: ["professional", "approachable", "modern"]`, no quotes, no lexicon. Constrains nothing, and the Critic cannot cite it.

---

## Example 2 — a fabricated statistic in a source

**Source text.** A downloaded slide deck: "Finance teams waste 40% of their week on reconciliation."

**Output.**

```
proof_points: []   # nothing meets the standard
gaps:
  - "The deck claims finance teams waste 40% of the week on reconciliation, with no study, date or sample. Not usable as a claim; needs a source or a survey."
  - "No customer numbers or named customers in any source."
```

**Annotation.**
- The number is in the client's own material, which is exactly why a junior promotes it. A proof point needs a number, a date and a population, or a named customer, or an award with a year. This has none.
- It goes in gaps rather than being silently dropped, because the client can fix it: either find the source or run the survey. That sentence is worth money to them.
- If the deck had said "in our 2026 survey of 210 finance leads, respondents reported spending two days a week on reconciliation", it would be a proof point with a span and a source.

**Junior version.** `proof_points: [{claim: "Finance teams waste 40% of their week", source: "sales deck"}]` — which then appears in a LinkedIn ad, and the client owns it.

---

## Example 3 — two sources contradicting on positioning

**Sources.** Home page: "reconciliation for high-growth SaaS finance teams". A conference abstract on the same site: "the reconciliation layer for marketplaces and platforms".

**Output.**

```
positioning: "Reconciliation for finance teams at high-growth SaaS companies (home page)."
gaps:
  - "Positioning differs by source: the home page says SaaS finance teams, the events page says marketplaces and platforms. These imply different buyers. Confirm before the strategy pass."
```

**Annotation.**
- Report the conflict, do not resolve it. Resolving it is a client decision, and the Strategist inheriting a silently chosen answer would build the campaign on it.
- The more recent or more prominent source is recorded as `positioning`, and the conflict is in gaps where a person will see it.
- This is the most valuable thing this agent does on a first campaign: it finds the questions the client has not answered for themselves.

**Junior version.** Picks one, mentions nothing, and the campaign targets an audience the client did not intend.

---

## Self-check applied
Every observation quoted; every claim with a span and source; lexicon from counts and verified in context; gaps specific and actionable; nothing approved, only proposed.
