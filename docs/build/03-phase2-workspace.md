# Phase 2: Workspace

**Goal.** Edit anything, regenerate anything, approve, export gated on approval. Approved claims as the only quotable source. This is the demo-ready state.

**Exit.** A campaign can be edited field by field with live counters and compliance flags; any asset, channel or agent can be regenerated with a constraint and the edit history is a version chain; pt-PT re-runs from edited English; claims are proposed by research, approved by a person, and only approved claims reach writers; export refuses until every asset is approved; `npm test` and e2e pass.

## Contracts

```
users/{uid}/clients/{clientId}/campaigns/{campaignId}/assets/{assetId}
  assetId = `${channel}.${unit}.${field}.${language}`   e.g. meta.v2.headline.en, email.3.body.en, social.d12.text.en, google.rsa.headline.5.en
  channel; unit; field; language; text:string; generatedText:string; versionId:string (the agent version it came from)
  editedAt:Timestamp|null; status:'draft'|'approved'|'rejected'; approvedAt|null; note:string|null
  flags: { rule, detail, severity }[]        // recomputed on every write

users/{uid}/clients/{clientId}/claims/{claimId}
  text:string; source:string; span:string|null; evidenceRef:string|null
  status:'proposed'|'approved'|'rejected'|'expired'; approvedAt|null; expiresAt:Timestamp|null; note:string|null; campaignId:string (where proposed)
```

**Explode rule.** When copywriter, social-planner, localiser or landing-writer writes a version, the server explodes its output into asset docs (create or, if the assetId exists and `editedAt` is null, overwrite; if edited, keep the edit and set `flags` + a `stale: true` marker). Export reads assets, never pass outputs.

**Compose rule.** Localiser and any downstream agent read assets (edited) composed back into the asset-set shape by `composeAssets(campaignId, language)`.

**Claims rule.** `memory.approvedClaims(clientId)` returns `claims where status == 'approved' and (expiresAt == null or expiresAt > now)`. `buildRules` uses it when non-null; `claimSeverity` becomes `violation`. The brand-analyst writes proposed claims to the registry on every run (dedupe by normalised text).

**Approval rule.** `PATCH assets/:id { status:'approved' }` refused with 409 if `flags` has any `severity:'violation'`. Any text edit sets `status:'draft'`. `GET export` refuses (409, listing unapproved ids) unless every asset in the requested language is approved; `?force=1` allowed with a warning banner in the export.

## Routes

| Route | Body | Returns |
|---|---|---|
| GET campaigns/:cid/assets?language= | | `{ assets:[...] }` |
| PATCH campaigns/:cid/assets/:aid | `{ text }` or `{ status, note }` | asset with recomputed flags |
| POST campaigns/:cid/regenerate | `{ scope:'asset'|'channel'|'agent', target, constraint }` | `{ versionId, assets:[changed] }` |
| POST campaigns/:cid/run/localiser | | now reads composed edited English |
| GET clients/:id/claims | | `{ claims }` |
| PATCH clients/:id/claims/:cid | `{ status, expiresAt, note }` | claim |
| POST clients/:id/claims | `{ text, source, evidence? (multipart) }` | claim (status proposed) |
| GET campaigns/:cid/versions?agent= | | chain with parent links |
| GET campaigns/:cid/diff?from=&to= | | field-level diff of two versions' exploded assets |

**Regenerate scopes.**
- `asset`: one field. Small prompt (Haiku or Sonnet, *decide*) with the field's context (the whole variant, the strategy, rules, constraint); gated by that field's limit and compliance. Writes a new version of kind `edit` with parent = current writer version; updates one asset.
- `channel`: the writer agent with `constraint` and instruction to keep other channels identical (packet includes current assets; validate additionally checks untouched channels are byte-identical).
- `agent`: full re-run with constraint; downstream marked stale.

## Pages

- Workbench tabs become editors: each field is a textarea with counter (mono, turns amber/ember) and inline flags; blur → PATCH; a "Regenerate" menu on each card (this field / this variant / this channel) with a constraint box; Approve / Reject buttons with note; an "Editor review" strip from the Critic verdict.
- Claims panel in the client library: proposed / approved / rejected / expired columns; evidence upload; expiry date; "used in" list.
- Versions drawer on the workbench: chain per agent; select two → diff.
- Export button shows approval count and refuses politely.

## Tasks

1. Assets collection, explode/compose, flags recomputation, migration for existing campaigns.
2. Asset PATCH with compliance recompute; approval refusals.
3. Field editors in the workbench with counters and flags.
4. Regenerate: asset scope (new small agent `field-editor`), then channel, then agent; stale propagation.
5. Claims registry: brand-analyst writes proposals; library UI; memory returns approved; rules become violations.
6. Localiser from composed edited English; pt assets exploded; PT tab editable.
7. Versions and diff.
8. Export gating; force flag; warning banner.
9. Critic final review on approve-all (`POST campaigns/:cid/review`); results shown; must_fix blocks approve-all until acknowledged.
10. e2e: edit → flag → fix → approve → export.

## Tooling tasks (from 07-tooling.md)

### Task 11: prose scanners in `check_compliance`
`retext` (MIT) pipeline: `retext-readability` (grade per sentence, threshold configurable per client, default grade 10), `retext-simplify` (plain-language substitutions), `retext-equality` (non-inclusive phrasing), `retext-intensify` (weasel words), plus `text-readability` (Flesch, grade per asset). Output joins `flags` as `severity: 'warning'` with `rule: 'readability'|'simplify'|'equality'|'intensify'`. Asset docs store `readability: { flesch, grade }`. The Critic's packet includes these findings so must-fix items cite a rule. Test: a 40-word sentence is flagged; "utilize" suggests "use".

### Task 12: LanguageTool
`lib/agents/tools/check_grammar.js`. `POST $LANGUAGETOOL_URL/v2/check` (default `https://api.languagetool.org`, self-host via Docker `erikvl87/languagetool` when `LANGUAGETOOL_URL` is set) with `language: 'en-GB'` or `'pt-PT'`, `disabledRules` for the noise (WHITESPACE_RULE, UPPERCASE_SENTENCE_START in headlines). Returns `{ matches: [{ path, message, rule, replacements, offset, length }] }`. Wired as a tool for Copywriter and Localiser; in Localiser's gate, `pt-PT` matches in categories GRAMMAR and TYPOS are violations, style is advisory. Rate limit: back off on 429 and return `{ error }` so the gate does not block on an outage. Test: "Você pode gerenciar" returns matches with pt-PT; outage path returns error and the run completes.

### Task 13: lexicon in code
`wink-nlp` (MIT) `lexicon({ sources })` → `{ terms: [{ term, count, examples }], bigrams: [...] }` over all source text, stopwords removed, brand-specific terms ranked by frequency × specificity (rare in a general corpus). Brand Analyst calls it to seed `preferred_terms`; the library shows the counts beside each voice term. Test: fixture sources produce "exceptions" above "errors".

Env additions: `LANGUAGETOOL_URL` (optional).
