---
name: page-taxonomy
checked: 2026-08-27
review: annually
used_by: [scout, brand-analyst]
---

# Where the truth lives on a company site

## Yield by page type

| Page | Yields | Reliability |
|---|---|---|
| Pricing | Model, tiers, entry price, what is counted | High. Hard to be vague about money |
| Docs, changelog, status | Real capabilities, integrations, limits | Highest. Written for users, not buyers |
| Case studies, customers | The only approved proof most companies have | High, if named and published |
| Security, trust, compliance | Certifications with dates | High |
| Careers | Voice, values, how they describe their own work | High for voice, and least performed |
| Support, help centre | Voice under pressure, real vocabulary | High for lexicon |
| About | Origin story, positioning as they state it | Medium. Often aspirational |
| Home | Current positioning and hierarchy | Medium. The most polished and least specific |
| Blog | Topics they care about, house style | Low for facts, useful for voice and volume |

Coverage is checked against: about, product, pricing, customers, docs. Missing any of these is a finding, not a gap to paper over.

## Following links

When a page type is missing or thin, look for it: pricing behind "contact us" often has a partial answer in the FAQ or in a docs page about plans; customer proof may live in a "stories" or "resources" section rather than "customers".

Stop at the budget. Eight pages read properly beats twenty skimmed.

## Client-rendered sites

Signals: a body with almost no text, a large script bundle, content appearing only in a JSON blob, a root div with an app id. If both the reader and the direct fetch return under 500 characters of real text, declare it rather than reporting thin coverage as if the company had little to say. The fallback is asking the client for materials, and saying so is more useful than a half-empty context.

## What not to read

Login, signup, account, cart, privacy, terms, cookie pages. They cost budget and yield nothing about voice or product.
