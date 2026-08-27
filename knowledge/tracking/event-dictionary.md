---
name: event-dictionary
checked: 2026-08-27
review: biannually
used_by: [tracking, ops-architect, analyst]
---

# Events, consent and de-duplication

## Use the standard names

GA4 defines recommended event names with fixed parameter schemas, and using them unlocks built-in reports; custom names do not get standard reporting. For a B2B campaign the relevant ones are `generate_lead` (form submission, demo request, newsletter signup), `sign_up` (account created), `login`, and the lead-lifecycle events (`qualify_lead`, `working_lead`, `close_convert_lead`, `close_unconvert_lead`) which populate the lead-acquisition report.

Use the recommended name whenever one fits. Where nothing fits, a custom event in lowercase with underscores, descriptive: `source_connected`, not `Event3`. Reserved names (`session_start`, `first_visit`, `ad_click` and the rest) cannot be reused.

## Parameters carry the meaning

`generate_lead` alone counts leads. `generate_lead` with `form_id`, `lead_type` and `value` separates a newsletter signup from a demo request, which is the difference between a number and a report. Parameter names follow the same convention: lowercase, underscores, descriptive.

Never send personal data in parameters. Email addresses, phone numbers and names in event parameters breach the analytics terms and can cost the property.

## One event per funnel stage

Every stage in the Ops Architect's funnel definitions needs exactly one event, with the parameters the KPI tree needs to segment it. Write the dictionary as a table: name, trigger, parameters, destinations. If a stage has no event, the KPI tree has a row nobody can report.

## Consent

Under consent mode, tags behave differently before and after consent, and some do not fire at all. Say per tag what happens in each state, and design the measurement so the numbers are interpretable when a proportion of visitors decline: modelled conversions are estimates and must be labelled as such in any report.

## De-duplication

When the same conversion is sent from the browser and from the server (a Conversions API alongside a pixel), both carry the same event id so the platform can de-duplicate. Without it, conversions are double-counted and every downstream number is wrong in a way that looks like success.

Plan the id: where it is generated, where it is stored, how it reaches both paths.

## UTMs

The campaign's UTM scheme is generated in code and is the source of truth. The tracking plan references it; it never defines a second scheme. Two schemes in one campaign means two sets of numbers and an afternoon of reconciliation every week.

## QA before launch

Fires once, not twice. Parameters present and correctly typed. Fires on the real action, not on page load. De-duplication verified with a test conversion through both paths. Consent states tested. UTMs present on every link in every asset.

Sources: Google Analytics 4 recommended events and event reference (developers.google.com/analytics, support.google.com/analytics); Google consent mode documentation. Conventions and QA rules are this repository's own.
