---
name: landing-writer-examples
checked: 2026-08-27
review: annually
kind: worked-examples
note: Original examples written for this repository.
---

# Worked examples: Landing Page Writer

## Example 1 — message match, and a form derived from the MQL

**Ad hook.** "Close the month four days faster. No spreadsheet."
**MQL definition.** Finance title; 50–500 employees; trial created; one engagement signal.

**Hero.** "Close the month four days faster" / sub: "Ledgerline matches your payouts, invoices and bank feeds overnight. You review the exceptions." / CTA: "Start a free trial".

**Form.** Work email (identifies the company, infers size via enrichment); job title (MQL criterion 1); company name. Three fields. Company size is inferred, not asked; trial created and engagement are behaviours, not fields.

**Annotation.**
- The hero is the ad's words. Rewriting it to something "more polished" is the commonest and most expensive mistake on this page.
- Every MQL criterion is covered by a field or a documented inference, and the inference is written down so the Ops Architect's scoring can rely on it.
- Three fields, not six. Each of the three qualifies someone; a "phone number" field would qualify nobody at this stage and cost conversions.

**Junior version.** Hero: "Financial operations, reimagined." Seven fields including phone and "how did you hear about us". Two CTAs.

---

## Example 2 — objections from research, not invention

**Audience anxieties.** "If the numbers don't tie I have to explain the tool to the auditor as well as the numbers." / "Another integration to maintain." / habit: "The spreadsheet works, I built it."

**Objections section.**
- *"We already have Xero."* Ledgerline sits in front of it and exports matched entries into it. Nothing to migrate.
- *"What do I tell the auditor?"* Every match shows its rule and its source lines. The audit trail is the product, not an export.
- *"Another integration."* Connect one processor to start. If it does not pay for itself in the first close, disconnect it.

**Annotation.**
- Three objections, all traceable to a cited verbatim. Not a generic FAQ.
- The habit force is answered by the third one, which lowers the switching cost rather than arguing with it. Arguing with habit does not work; reducing it does.

---

## Example 3 — no approved claims

**Context.** Empty proof points.

**Change.** The proof section becomes a mechanism section: what happens overnight, in four steps, with a diagram. Labelled in the output as "mechanism in place of proof; no approved claims available".

**Annotation.**
- Mechanism is the honest substitute for proof and often converts the technical buyer better anyway. Inventing "trusted by hundreds of finance teams" to fill a section is the failure the claims gate exists to prevent.

---

## Self-check applied
Hero echoes the hook; every proof item carries a claim id; every MQL criterion maps to a field or a documented inference; six fields maximum; one CTA repeated; consent line states its purpose; accessibility clean.
