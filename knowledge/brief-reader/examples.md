---
name: brief-reader-examples
checked: 2026-08-27
review: annually
kind: worked-examples
note: Original examples written for this repository.
---

# Worked examples: Brief Reader

## Example 1 — prohibitions quoted, not summarised

**Brief contains.** "Do not call the data real-time or live. Frequencies are monthly, quarterly and annual depending on the source." / "Do not name Bloomberg, Refinitiv, CEIC or any competitor in the copy."

**notes.** "Do not call the data real-time or live; frequencies are monthly, quarterly and annual depending on the source. Do not name Bloomberg, Refinitiv, CEIC or any competitor in the copy. Editorial sign-off from Ben Aris on coverage claims; commercial sign-off from Anton Paul on the offer."

**Annotation.**
- Verbatim, so the Brand Analyst can turn "real-time" and the competitor names into avoid terms exactly as written.
- A summary ("avoid overclaiming and don't mention competitors") loses the specific words, and specific words are what the compliance scanner can enforce.

---

## Example 2 — a field left empty

**Brief.** Describes the product and the audience in detail; never states a tone, and its own prose is formal.

**Output.** `tone: ""`, and in notes: "Tone not specified. The brief itself is written formally, but that is the briefing document's register, not a stated campaign tone. Confirm before generating."

**Annotation.**
- Inferring "professional" from the document's own style is the single most common Brief Reader error. The brief's author is writing a brief, not modelling the campaign voice.
- An empty field with a note costs the person five seconds. A wrong field costs a whole generation.

---

## Example 3 — two products in one brief

**Brief.** Covers a data product and a separate events business, with one budget.

**Output.** `productName: "IntelliNews Data Points"` (the one the objective and audience sections describe), and in notes: "The brief also covers an events business with a shared budget. This brief has been read as the Data Points campaign; if the events line needs its own campaign, run it separately rather than blending the audiences."

**Annotation.**
- Choosing the dominant subject and saying so beats either blending them or refusing to extract anything.
- Blending two products into one campaign is a failure nothing downstream can detect, because the output will look coherent.

---

## Self-check applied
No field filled by inference; every "must" and "never" quoted; omissions listed; language flag from a stated market, not from the document's language.
