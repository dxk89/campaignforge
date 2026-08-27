---
name: tracking-examples
checked: 2026-08-27
review: annually
kind: worked-examples
note: Original examples written for this repository.
---

# Worked examples: Tracking Engineer

## Example 1 — one event per funnel stage

**Funnel from the Ops Architect.** Visit → Trial → Connected → MQL → Opportunity.

| Stage | Event | Trigger | Parameters | Destinations |
|---|---|---|---|---|
| Visit | (automatic `page_view`) | — | campaign UTMs | GA4 |
| Trial | `sign_up` | account created, server-side | `method`, `plan`, `company_size_band` | GA4, Ads, CRM |
| Connected | `source_connected` (custom) | first successful connector auth | `provider`, `time_since_signup_hours` | GA4, CRM |
| MQL | `qualify_lead` | score crosses threshold, CRM webhook | `score`, `campaign` | GA4, CRM |
| Opportunity | `close_convert_lead` | opportunity created | `value`, `currency` | GA4, CRM |

**Annotation.**
- Four of five use recommended names, so the lead-acquisition report populates without custom work. Only "connected" needs a custom event, because nothing standard describes it.
- `time_since_signup_hours` exists because the CRO analysis showed day-one connection predicts MQL. Parameters should be chosen from the questions the KPI tree will ask, not from what is easy to send.
- No email address anywhere. The CRM holds identity; analytics holds behaviour.

---

## Example 2 — a double-count caught before launch

**Setup.** Trial conversions sent from the browser pixel and from the server-side API.

**Problem in the first draft.** No shared event id. Test conversion appeared twice in the platform, so reported cost per trial would have been half the real figure. The campaign would have looked twice as efficient as it was, and budget would have been reallocated on that basis.

**Fix.** Event id generated at signup on the server, stored on the account record, sent with both the browser event and the API event. QA step: run one test signup, confirm exactly one conversion appears.

**Annotation.**
- This is the error that flatters and therefore survives. Nobody investigates a number that looks good.
- The QA checklist item is "verified de-duplication with a test conversion", not "configured de-duplication".

---

## Example 3 — consent states written down

| Tag | Consent granted | Consent denied |
|---|---|---|
| GA4 | Full event with parameters | Cookieless ping; modelled conversions, labelled as modelled in reports |
| Ads conversion | Fires | Does not fire; conversions under-reported for this segment |
| LinkedIn Insight | Fires | Does not fire |
| Server-side CRM sync | Fires (first-party, contractual basis, no advertising cookies) | Fires |

**Annotation.**
- The table is the deliverable. Without it, the first month's discrepancy between platform and CRM numbers gets attributed to "attribution" and nobody looks further.
- Labelling modelled conversions as modelled in the report is the honesty that keeps the whole measurement plan credible.

---

## Self-check applied
Every funnel stage has one event; recommended names used where they fit; every event has a trigger and destinations; no personal data in parameters; consent behaviour stated per tag; event ids planned for de-duplication; UTMs referenced, not redefined.
