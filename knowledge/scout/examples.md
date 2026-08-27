---
name: scout-examples
checked: 2026-08-27
review: annually
kind: worked-examples
note: Original examples written for this repository.
---

# Worked examples: Scout

## Example 1 — pricing behind "contact us"

**Scan.** Pricing page contains a form and the words "Talk to sales". No numbers.

**Follow-up.** Sitemap lists `/docs/plans`. Fetched: it names three tiers and what each includes, without prices.

**Output.** `coverage.pricing: partial` with a note: "Tiers and inclusions found in docs; no prices published. Ask the client for the price list before the campaign makes any cost claim."

**Annotation.**
- Reporting `pricing: false` would have been wrong, and reporting `true` would have implied prices exist in the sources when they do not. Partial with a note is the honest answer and tells the writer exactly what they cannot say.
- The sitemap found a page the navigation did not link to, which is the common case for docs.

---

## Example 2 — a blog-dominant site

**Scan.** Home, about, one product page, and 40 blog posts in the sitemap.

**Decision.** Read home, about, product, pricing, the two most recent posts and the single most-linked post. Not twenty posts.

**Output.** Coverage flags accurate; note added: "Content-heavy site; product pages are thin relative to the blog. Voice evidence is plentiful, product facts are scarce."

**Annotation.**
- The temptation is to fill the budget with blog posts because they are there. Eight pages of the right types beat twenty of one type, and the Brand Analyst would have drowned in voice evidence with no product facts.

---

## Example 3 — a client-rendered site

**Scan.** Home returns 180 characters of text and a 900KB script bundle. The reader tool returns the same.

**Output.** `clientRendered: true`, sources empty except the meta description, note: "The site renders in the browser and neither fetch path returns readable content. Nothing has been inferred from it. Ask the client for their site copy, a brand guide or a recent deck; alternatively the pages can be read manually and pasted."

**Annotation.**
- Zero sources with an explanation beats three sources of navigation text. Everything downstream would otherwise treat that noise as the company's voice.
- The note gives the person a next action, which is the point of reporting a failure.

---

## Self-check applied
Every coverage flag backed by a page over 500 characters; no page fetched twice; client-rendered declared when both paths are thin; login and legal pages skipped; budget respected.
