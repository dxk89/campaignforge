# Campaign Forge: infrastructure plan

Single user. Full-stack marketer running several clients. Depth and authority over breadth. This is the plan to take the current prototype (stateless, one page, seven passes) to a product that remembers, proves, improves and can be trusted unread.

Stack decision up front: **Next.js on Vercel with Firebase** (Auth, Firestore, Storage). It matches the rest of your portfolio, Vercel already hosts it, and Firebase gives persistence and file storage without running a server. Everything in `lib/` is plain Node with no Express dependency inside the passes, so it moves into Next.js API routes unchanged. The plain-JS front end gets rebuilt as React pages; at 900 lines and growing, it has reached the point where a framework pays for itself.

"Single user" here means one operator, many clients. Not multi-tenant, not teams, not roles. That simplifies everything: one Google sign-in on an allowlist of one email, Firestore rules that check that one UID, no sharing model. Build for one, structure the data so a second user is a rules change, not a rewrite.

---

## 1. What "deep and authoritative" means in features

Depth: the tool knows the client better each time it is used. Authority: every claim it makes can be traced, every output can be checked without reading it, and results feed back in.

Nine capabilities, each mapped to where it lives:

| Capability | What it does | Why it makes the product authoritative |
|---|---|---|
| **Client library** | Persistent brand kit, sources, glossary, voice rules, assets, campaigns, per client | Nothing starts from zero. The tenth campaign knows what the first learned |
| **Evidence and approved claims** | Every proof point links to an uploaded document or URL, with an approval state and an expiry date | Copy can only quote what has been approved. A claim without evidence cannot ship |
| **Compliance pass** | Code-level scan of every output: banned terms, competitor names, unapproved claims, superlatives, limit breaches | The output can be trusted without reading every line. Flags, never silent fixes |
| **Editing, versions, regenerate** | Edit any field inline; regenerate any asset, channel or pass with constraints; every change is a version | The tool is a workspace, not a generator you export from |
| **Approvals** | Approve per asset, per channel, per campaign, with who and when | An audit trail. Required before export or publish |
| **Performance ingestion** | Upload results (CSV, platform export); results per variant; learnings per client | The loop closes. Next generation starts from what won |
| **Provenance everywhere** | Every audience phrase, proof point, voice observation shows its source; sources have a fetched-at date | "Where did that come from" is always answerable |
| **Evals** | Fixed golden briefs run against every prompt change; scored automatically and by hand | Prompts improve on evidence, not vibes. This is the moat |
| **Cost ledger** | Every model call, search and image recorded per client per campaign | Billable. Provable. The footer becomes an invoice line |

Plus three content additions: **landing page** as a channel (hero, proof, form spec matching the MQL definition), **image review** (grid, reject, regenerate with a note, multi-turn edit), and **calendar awareness** for social (start date, client events, holidays).

---

## 2. Data model

Firestore, one top-level `users/{uid}` document as the root so multi-user later is a path change. Everything below it.

```
users/{uid}
  clients/{clientId}
    name, domain, createdAt, updatedAt
    brandKit          { siteName, tagline, palette, fonts, logoRef, artworkRefs[], scannedAt }
    voice             { observations[], preferredTerms[], avoidTerms[], glossary[] }   ← editable, seeded by research
    settings          { landingUrl, defaultTone, defaultLanguages[], calendar: { events[] } }

    sources/{sourceId}
      name, kind (file|url|site|paste|brief), storageRef, text (capped), chars, fetchedAt, hash

    claims/{claimId}
      text, source (sourceId or URL), evidenceRef, status (proposed|approved|rejected|expired),
      approvedAt, expiresAt, note

    learnings/{learningId}
      campaignId, statement, evidence (metric, value, variants), createdAt   ← generated from results, editable

    campaigns/{campaignId}
      brief { productName, description, audience, objective, tone, languages[], landingUrl }
      status (draft|generating|review|approved|exported), createdAt, updatedAt
      passes/{passName}                 research | audience | strategy | assets | social | activation | localise | landing
        current: versionId
        versions/{versionId}
          output (JSON), inputsHash, promptVersion, model, usage, createdAt, parentVersionId, changeNote
      assets/{assetId}                  one per editable unit (meta v2 headline, email 3 body, social day 12)
        channel, unit, field, language, text, generatedText, editedAt, status (draft|approved|rejected)
      images/{imageId}
        postRef, prompt, storageRef, status (candidate|approved|rejected), parentImageId, note
      results/{resultId}
        uploadedAt, source (linkedin|meta|google|email|crm), rows (variant → metrics), summary
      compliance/{runId}
        ranAt, versionRefs, flags[] { assetId, rule, detail, severity }

    ledger/{entryId}
      campaignId, pass, model, inputTokens, outputTokens, searches, images, costEur, at

  prompts/{promptName}
    current: versionId
    versions/{versionId}  { text, changeNote, createdAt, evalScore }

  evals/{runId}
    promptVersions {}, briefs[], scores { limits, avoidTerms, claimTraceability, structure, humanQuality }, ranAt
```

Design rules:

- **Pass outputs are immutable versions.** Regenerating or editing creates a new version with a parent. Nothing is overwritten. Diff is free.
- **Assets are the editable layer over pass outputs.** The assets pass produces a JSON; that JSON is exploded into asset documents; edits land on assets, not on the pass output. Export reads assets. Localisation reads assets (edited English), not the raw pass.
- **Claims are the only quotable source.** The assets, social and activation prompts receive `claims where status == approved` and nothing else as proof points. The research pass proposes claims; it does not approve them.
- **Learnings are client-level, not campaign-level.** They are the thing that compounds.
- **Storage** (Firebase Storage) holds every file: uploads, logo, artwork, generated images, exports. Firestore holds text and references only. Keep documents under 200 KB; source text is capped and the original file is in Storage.

---

## 3. Execution model

Keep the browser-driven pass sequence. It gave real progress and short requests, and it still fits. Three changes:

1. **Persist every pass result the moment it returns.** The API route writes the version to Firestore before responding. A closed tab loses nothing; reopening the campaign shows where it stopped, with a Resume button that runs the remaining passes.
2. **Inputs hash.** Each version records a hash of its inputs (brief, context version, strategy version). Regenerate offers "inputs unchanged, regenerate anyway?" versus "strategy changed since, regenerate to catch up". Stale downstream passes are marked.
3. **Small asks get a fast path.** "Five more X posts about fees" or "regenerate this headline, shorter" is one short call with the stored context, under ten seconds, no full chain.

A queue (Inngest or Trigger.dev, both work on Vercel) is deferred. It becomes necessary when generation should run while the tab is closed, or for scheduled work (weekly competitor re-scan). The pass functions are already shaped as jobs, so adding a queue later is wiring, not rewriting.

Function limits: Vercel Fluid compute, 300 seconds on every plan, covers the longest single pass (social, 12k output tokens) with room. Images generate one per request.

---

## 4. Authentication and security

Firebase Auth, Google sign-in, one allowlisted email checked in a Next.js middleware and in Firestore rules (`request.auth.token.email == "you@domain"`). No password to manage, no session store.

API keys (Anthropic, Gemini) stay in Vercel environment variables, server-side only. Firebase Admin SDK on the server via a service account in an environment variable. Client-side Firebase only for Auth and for reading Storage download URLs.

A one-page **data handling statement** in the repo: what is stored where, what leaves the system (requests to Anthropic and Google with the client's material), retention (kept until you delete the client), export (everything as JSON and files, one button), deletion (client delete removes Firestore subtree and Storage prefix). This page is what a client asks for and the pilot pitch needs.

---

## 5. The compliance pass in detail

Deterministic first, model second, always shown as flags.

Code checks, run on every version and on every edit:

- Character and count limits (existing)
- Avoid terms and competitor names from the client's voice document, whole-word, case-insensitive, per asset
- Claims: any sentence containing a number, a percentage, a customer name, an award or a comparative ("faster", "cheaper") that does not match an approved claim's text or its registered paraphrases → flag "unapproved claim"
- Superlatives and banned-by-default words (a global list you maintain: revolutionary, seamless, AI-powered, unlock…) unless the client's voice says otherwise
- Brand name spelling and casing exactly as registered
- Placeholder leakage: brackets, "lorem", "[product]", "TBD"
- Language: pt-PT outputs scanned for a Brazilian-form list (você, gerenciar, usuário, cadastro, gerund progressive)
- Links: every CTA URL resolves to the campaign landing page with UTMs present

Model check, run on demand or before approval: one call per channel asking for tone drift against the voice observations, factual claims not in the approved list that the regex missed, and readability. Its output is advisory and shown separately from the code flags.

Compliance state is part of the asset: an asset with an open violation cannot be approved; an approved asset that is edited returns to draft.

---

## 6. Performance ingestion and learnings

Input: a CSV from LinkedIn Campaign Manager, Meta Ads, Google Ads, an email tool, or a hand-made sheet. Columns are mapped once per source (a small mapping UI: which column is variant, impressions, clicks, conversions, spend). The variant column is matched to assets by `utm_content` or by exact text.

Output, per campaign: a results table on the Measurement tab next to the KPI tree targets, and a verdict per experiment against its decision rule (met, not met, insufficient sample).

Then a short model call turns results into **learnings**: three to five statements with evidence ("Proof-led LinkedIn variants out-converted pain-led by 31% over 2,100 clicks"). You edit or delete them. Approved learnings go into the client's context block for every future pass, under a "What has worked" heading. That is the compounding loop.

---

## 7. Evals

A `evals/` folder in the repo with ten golden briefs across objectives and tones, two with sources, one with a deliberately thin brief, one pt-PT. A script runs the full chain on all ten against the current prompts (mock off, real spend, roughly €15 a run) and scores:

- Limit compliance rate
- Avoid-term leakage count
- Claim traceability: proportion of numeric or named claims matching an approved claim
- Structural validity: lifecycle graph, score threshold, KPI tree reaches revenue, 32 posts
- Cost and duration per pass

Plus a human rating sheet (1 to 5 per channel) you fill in once per prompt release. Scores are stored under `evals/{runId}` against the prompt versions used. A prompt change is merged when the score does not drop. This is a day to build and the single most defensible thing in the product.

Prompts move from code into Firestore with versions and change notes, editable in a small admin page, so a prompt tweak is a version, not a deploy.

---

## 8. Front end

Next.js App Router, React, the existing design system carried over (palette, Archivo/Plex, the workbench layout). Pages:

- `/clients` list, `/clients/new` (URL → scan → library created)
- `/clients/[id]` the library: brand kit, voice rules (editable), sources, claims (approve/reject/expire), learnings, assets, campaigns, ledger
- `/clients/[id]/campaigns/[cid]` the workbench: brief, chain stepper, tabs. Every field inline-editable with its counter and compliance flags. Per-asset regenerate with a constraint box. Approve buttons. Versions drawer with diff.
- `/clients/[id]/campaigns/[cid]/images` review grid
- `/clients/[id]/campaigns/[cid]/results` upload, mapping, verdicts, learnings
- `/prompts` versions and change notes, `/evals` runs and scores
- `/settings` data handling, export all, API status, costs this month

State: server components read Firestore; client components for the editors; pass execution through route handlers. No global state library needed for one user.

---

## 9. Phases and effort

Working days, one person, with AI assistance at the pace this prototype was built.

**Phase 1: Foundation (6 to 8 days).** Next.js scaffold on Vercel, Firebase Auth allowlist, Firestore rules, port `lib/` into route handlers, client library create-from-scan, campaigns persisted per pass with resume, Storage for uploads and images, cost ledger, export-all. Outcome: nothing is lost on refresh, clients exist, the ledger runs.

**Phase 2: Workspace (8 to 10 days).** Assets exploded into editable documents, inline editing, per-asset and per-channel regenerate with constraints, versions with diff, compliance pass (code checks), approved claims registry with evidence upload, approvals with export gating, pt-PT from edited English. Outcome: usable as a daily workspace. This is the phase that makes it presentable to a marketing company.

**Phase 3: Authority (7 to 9 days).** Provenance on every insight, source freshness and re-scan, landing page channel with form spec, results ingestion with mapping, experiment verdicts, learnings into context, image review grid with multi-turn edit, calendar awareness for social. Outcome: the loop closes; the tool gets better per client.

**Phase 4: Rigour (5 to 6 days).** Evals harness with golden briefs and scoring, prompts in Firestore with versions, model-based compliance check, data handling statement, client-facing export pack (campaign summary PDF with strategy, assets, plan, measurement). Outcome: prompt changes are measured; a client can be handed a document.

Roughly six to seven working weeks in total. Phase 2 is the one to reach before any external demo. Phases 3 and 4 can be shown as a roadmap slide until then.

---

## 10. Decisions deferred, and why

- **Queue.** Not until generation needs to run unattended or on a schedule.
- **Multi-user.** Data is rooted at `users/{uid}`; adding a user is rules and an allowlist. Teams, roles and sharing are a different product; do not design for them now.
- **Publishing integrations.** Export well; integrate when a client's scheduler or ad account is a daily friction, not before.
- **Model abstraction.** Two providers, both behind one function each (`callJson`, `generateImage`). Swap by editing one file. A provider layer is premature.
- **Vector search over sources.** The research pass reads capped text and distils it; that holds until a client has hundreds of documents. Revisit when the cap bites.

---

## 11. First week

Day 1: Next.js scaffold, Firebase project, Auth allowlist, deploy empty shell to the existing Vercel project.
Day 2: Firestore rules and data model documents, `lib/` moved, one route handler per pass, health route.
Day 3: Client create-from-scan, brand kit and sources persisted, Storage uploads.
Day 4: Campaign create, chain stepper against the new routes, each pass persisted, resume.
Day 5: Ledger, export-all, the workbench tabs reading from Firestore instead of memory.

End of week one: the current product, but it remembers. Week two starts the editor.
