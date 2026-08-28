# Phase 1: what is left

> **Status, 27 Aug 2026:** tasks 11–17 and 19 are built and tested. Task 18
> (running the data layer against the Firestore emulator) needs Java and has
> not been run; the script is `npm run test:emulator`. Task 20 is a decision
> for the owner. Everything below is kept as the record of what was done.


Tasks 1–8 and 10 of `02-phase1-foundation.md` are built and all five test suites pass. This file lists what remains before Phase 2 starts. Work in order; run `npm test` after each; one commit per task.

Two categories: **wiring** (routes that exist but no page calls them) and **carry-over** (prototype features that were not ported). Nothing here is a redesign; the contracts are already set.

---

## Task 11: Global navigation

**Gap.** `/ledger` and `/settings` exist and are only reachable by typing the URL. `/` is still the scaffold placeholder.

**Do.**
- A header in `web/app/layout.tsx`: brand mark, "Clients", "Ledger", "Settings", and a sign-out control that calls `DELETE /api/auth/session` and redirects to `/login`. Use the existing `.top` and `.brand` styles from `globals.css`.
- The header renders only when there is a session; on `/login` it renders the brand alone. `currentSession()` in the layout is fine (it is a server component).
- `/` redirects to `/clients` when signed in, `/login` otherwise. Delete the placeholder page body.

**Test.** In `test/pages.test.js`: `GET /` returns a redirect to `/clients`; `/clients` HTML contains links to `/ledger` and `/settings`.

---

## Task 12: Wire the library's source inputs

**Gap.** `POST /api/clients/:id/sources` accepts files, a URL and pasted text. `library.tsx` only offers file upload. `POST /api/clients/:id/assets` (logo and artwork) is never called.

**Do.** In `web/app/clients/[id]/library.tsx`, port the three inputs from `legacy/public/index.html`:
- URL fetch: an input plus "Fetch page", posting `{ url }`.
- Paste: a `<details>` with label and textarea, posting `{ label, text }`.
- Brand assets: "Upload logo" and "Add artwork" (max 6), posting multipart to `/assets`, with a thumbnail strip and remove buttons. Removing an artwork item is a `PATCH` on the client with the shortened `brandKit.artworkRefs`.
- A "Rescan site" button posting `{ url: client.domain }` to `POST /api/clients` is **not** in scope; rescan is a Phase 3 task with its own diffing contract.

Storage refs are not URLs. Add `GET /api/files/[...ref]/route.ts` that streams a stored file after `requireSession()`, so `<img src="/api/files/users/owner/clients/…">` works for the logo and artwork thumbnails. Reject any ref that does not start with `users/{uid}/`.

**Test.** `test/pages.test.js`: post a URL source and a pasted source through the API, then assert both appear on the library page; upload a small PNG as a logo and assert `brandKit.logoRef` is set and `GET /api/files/<ref>` returns 200 with an image content type.

---

## Task 13: Briefing document upload

**Gap.** The prototype parsed an uploaded brief into the five fields with the `brief-reader` agent. The route was not ported.

**Do.**
- `POST /api/clients/[id]/campaigns/[cid]/brief/parse`: multipart `file`; extract with `@core/sources` `extractFile`; run `orchestrator.runAgent('brief-reader', { text })`; persist the document as a source of kind `brief` on the client; `PATCH` the campaign brief with any field the parse filled that is currently empty (never overwrite a filled field); write a ledger entry; return `{ fields, notes, usage, source }`.
- In `workbench.tsx`, a dropzone above the brief fields, and a status line showing which fields were filled, the notes from the parse, and the cost.

**Test.** `test/api.test.js`: upload a text brief, assert the campaign's brief now has `productName` and that a source of kind `brief` exists on the client.

---

## Task 14: Image generation in the workbench

**Gap.** `POST …/images` works (tested) but the Social tab shows only the typographic card. No generate button, no card/photo toggle, no PNG download, no logo composite.

**Do.** In `components/panels.tsx` `SocialPanel`, port from `legacy/public/app.js`:
- Per post with an `image_prompt`: a "Generate image" button; on success show the returned `dataUrl` and a Card/Photo toggle.
- A bar above the calendar: "N posts with a visual brief and no image yet" and a "Generate all N (≈ €X)" button at the rate in `lib/pricing.js`. Sequential, with progress in the button label.
- "Download PNG" per graphic: SVG through a canvas as the prototype did; for a generated photo, composite the client logo bottom-right on a white panel before download.
- On mount, `GET …/images` so previously generated images reappear after a reload. That is the point of storing them.
- Hide the generate controls when `/api/health` reports `images: false`, with the line explaining that `GEMINI_API_KEY` turns them on.

**Test.** `test/pages.test.js`: generate an image via the API, reload the workbench, assert the page payload contains the stored image for that post.

---

## Task 15: Exports in the workbench

**Gap.** Only "Export all" (the client zip) is present. The prototype's three campaign exports were not ported.

**Do.** In `workbench.tsx`, a row of export buttons:
- **JSON**: the whole campaign result as it is rendered.
- **Assets CSV**: one row per field — channel, type, language, field, text, char_count, tracking_url. Port `flattenAssets` and `csvCell` from `legacy/public/app.js`.
- **Social CSV**: day, channel, pillar, text, hashtags, cta, char_count, graphic_template, graphic_headline.
- Filenames use the client slug, as before.

**Test.** Assert the buttons render; the CSV builders are pure functions, so unit-test `flattenAssets` in `test/db.test.js` (or a new `test/export.test.js`) rather than driving a download.

---

## Task 16: Tracking plan on the Measurement tab

**Gap.** `workbench.tsx` passes `tracking={null}`. The UTM table is missing, and `MeasurementPanel` already renders it when given data.

**Do.** Compute it server-side in `app/clients/[id]/campaigns/[cid]/page.tsx` with `trackingPlan(brief, assets, localised, landingUrl)` from `@core/utm`, using the current `copywriter` and `localiser` outputs and `brief.landingUrl ?? client.settings.landingUrl`. Pass it through. It is deterministic, so it is computed on render rather than stored.

**Test.** `test/pages.test.js`: after a run, the workbench payload contains `utm_campaign` and a row per asset unit.

---

## Task 17: Memory backed by Firestore

**Gap.** `lib/memory/index.js` returns empty for everything. The spec's task 9 said it should read from Firestore; only the data-handling statement was done.

**Do.** Keep the four function signatures. Implement against collections that Phase 2 and 3 will fill, returning empty until they exist:
- `approvedClaims({ clientId })` → `null` until the claims registry exists (Phase 2). Returning `null` is meaningful: it tells `buildRules` to fall back to context proof points and treat claim flags as warnings.
- `learnings`, `corrections`, `exemplars` → query `users/{uid}/clients/{clientId}/…`, ordered as `06-agent-training.md` §2 describes, returning `[]` when the collection is absent.

`lib/` cannot import from `web/server/`, so add a small accessor in `lib/memory/firestore.js` that initialises `firebase-admin` from the same env var and is skipped when it is absent. Keep the CommonJS style of `lib/`.

**Test.** `test/db.test.js`: with no store configured, all four return empty/null and no error; with the in-memory store seeded (add a `__seedMemory` helper if needed), `learnings` returns what was written.

---

## Task 18: Prove the Firestore path

**Gap.** Every suite runs against the in-memory store. The Firestore code path has only ever been typechecked, and it is the path production uses.

**Do.**
- Add `firebase-tools` as a dev dependency and a script: `npm run test:emulator` running `firebase emulators:exec --only firestore,storage "node test/db.test.js"` with `FIREBASE_SERVICE_ACCOUNT` pointed at a dummy and `FIRESTORE_EMULATOR_HOST` set.
- `test/db.test.js` already exercises every helper; make it run twice, once per backend, by parameterising the store.
- Document in `CLAUDE.md`: the emulator run is not part of `npm test` (it needs Java), but it must pass before a release.

**Test.** The emulator run is the test. Both backends must produce identical assertions.

---

## Task 19: Deployment runbook

**Gap.** Nobody but the author knows how to stand this up.

**Do.** `docs/DEPLOY.md`, written to be followed by someone who has not read this repository:
1. Create the Firebase project; enable Google sign-in; add the authorised domain for the Vercel URL.
2. Create a service account, base64 the JSON, set `FIREBASE_SERVICE_ACCOUNT`.
3. Set `ALLOWED_EMAIL`, `ALLOWED_UID`, `NEXT_PUBLIC_FIREBASE_*`, `ANTHROPIC_API_KEY`, and optionally `GEMINI_API_KEY`, `JINA_API_KEY`, `LANGUAGETOOL_URL`, `PEXELS_API_KEY`.
4. `node scripts/deploy-rules.js && firebase deploy --only firestore:rules,storage`.
5. Vercel: import the repo, framework Next.js, root `web/` (or rely on `vercel.json`), add the env vars, deploy.
6. Verify: `/api/health` shows `auth: true` and `mock: false`; sign in; create a client from a URL; run one agent; check the ledger.
7. Rollback: how to set `MOCK_CLAUDE=1` to stop spend without taking the app down.

Include what each variable does and what breaks when it is missing.

---

## Task 20: Retire or keep the legacy app

**Decision needed, not a build.** `legacy/` still runs and the front-end suite drives it, which gives `lib/` a second independent client. Keep it until Phase 2's editing work lands, then delete `legacy/` and `test/frontend.test.js` in one commit. Note the decision in `CLAUDE.md` either way so it does not linger by accident.

---

## Definition of done for Phase 1

- Every route in the spec's contract table is called by a page.
- Nothing the prototype could do is missing from the product: brief upload, URL and paste sources, brand assets, image generation with review, all four exports, the tracking table.
- Both storage backends pass the same data-layer assertions.
- A stranger can deploy it from `docs/DEPLOY.md`.
- `npm test` green; `npm run test:emulator` green.
