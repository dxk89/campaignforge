# Phase 1: Foundation

**Goal.** The current feature set on Next.js + Firebase, single user, with persistence: clients, campaigns, every agent result, a ledger, export-all. Nothing lost on refresh.

**Exit.** `npm test` passes (front-end test rewritten for the new pages); a campaign generated in one browser session appears intact in another; the ledger lists every call; export-all downloads a zip with every document and file; `MOCK_CLAUDE=1` still runs the whole UI.

## Decisions (fixed)

- Next.js 15 App Router, TypeScript for `app/` only; `lib/` stays CommonJS JavaScript and is imported from route handlers. Do not rewrite `lib/`.
- Firebase: Auth (Google), Firestore (native mode), Storage. Admin SDK on the server from `FIREBASE_SERVICE_ACCOUNT` (base64 JSON). Client SDK only for Auth and Storage download URLs.
- Single user: `ALLOWED_EMAIL` env. Middleware rejects any other account; Firestore rules check `request.auth.token.email == ALLOWED_EMAIL` (hardcoded in rules at deploy time by a script that reads the env).
- All data under `users/{uid}/…` as in INFRASTRUCTURE.md §2.
- Design system carried over: same palette, fonts (Archivo, IBM Plex Sans/Mono), workbench layout. Tailwind is fine; keep the CSS variables.
- Env: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (optional), `GEMINI_IMAGE_MODEL` (optional), `FIREBASE_SERVICE_ACCOUNT`, `NEXT_PUBLIC_FIREBASE_*` (client config), `ALLOWED_EMAIL`, `MOCK_CLAUDE`.

## Firestore contracts

Collections and required fields (types in TS notation). Anything not listed is free.

```
users/{uid}/clients/{clientId}
  name: string; domain: string|null; createdAt: Timestamp; updatedAt: Timestamp
  brandKit: { siteName, tagline, palette:{accents:string[],dark,light}, fonts:string[], logoRef:string|null, artworkRefs:string[], scannedAt }
  voice: { observations:string[], preferredTerms:string[], avoidTerms:string[], glossary:{term,treatment}[] }
  settings: { landingUrl:string|null, defaultTone, defaultLanguages:string[], calendar:{events:{date,label}[]} }

users/{uid}/clients/{clientId}/sources/{sourceId}
  name; kind:'file'|'url'|'site'|'paste'|'brief'; storageRef:string|null; text:string (≤40k); chars:number; fetchedAt; hash:string

users/{uid}/clients/{clientId}/campaigns/{campaignId}
  brief: { productName, productDescription, targetAudience, objective, tone, languages:string[], landingUrl, webResearch:boolean }
  status:'draft'|'generating'|'review'|'approved'|'exported'; createdAt; updatedAt
  current: { [agent:string]: versionId }        // pointer per agent

users/{uid}/clients/{clientId}/campaigns/{campaignId}/versions/{versionId}
  agent:string; output:object; inputsHash:string; promptVersion:string; model:string
  usage:{input,output,webSearches,calls,ms,costEur}; trace:object[]; complete:boolean; problems:string[]
  parentVersionId:string|null; changeNote:string|null; createdAt

users/{uid}/clients/{clientId}/campaigns/{campaignId}/images/{imageId}
  postRef:{day,channel}; prompt:string; storageRef:string; mime:string; status:'candidate'|'approved'|'rejected'; note:string|null; createdAt

users/{uid}/ledger/{entryId}
  clientId; campaignId; agent:string; model:string; input; output; webSearches; images; costEur; at:Timestamp
```

Rules: read/write only for the allowlisted email; deny everything else. Storage rules the same, path `users/{uid}/**`.

## Route contracts (App Router handlers under `app/api/`)

Keep the existing shapes; add persistence.

| Route | Body | Effect | Returns |
|---|---|---|---|
| POST /api/clients | `{ url }` or `{ name }` | scan (or create empty); writes client, sources, brandKit; uploads logo if found | `{ clientId, brandKit, sources:[{sourceId,name,kind,chars}] }` |
| GET /api/clients | | | `{ clients:[{clientId,name,domain,updatedAt}] }` |
| GET /api/clients/:id | | | client doc + sources (no text) + campaign list |
| PATCH /api/clients/:id | partial `{ voice, settings, brandKit }` | | updated doc |
| POST /api/clients/:id/sources | multipart files / `{url}` / `{label,text}` | extract, persist, Storage for files | `{ sources:[...] }` |
| DELETE /api/clients/:id/sources/:sid | | | 204 |
| POST /api/clients/:id/assets | multipart logo/artwork | Storage; brandKit refs | `{ brandKit }` |
| POST /api/clients/:id/campaigns | `{ brief }` | create draft | `{ campaignId }` |
| GET /api/clients/:id/campaigns/:cid | | brief + current outputs (resolved) + economics | full campaign |
| POST /api/clients/:id/campaigns/:cid/run/:agent | `{ constraint? }` | build inputs server-side from stored artifacts and client memory; run agent; write version; update `current`; ledger | `{ versionId, output, usage, complete, problems }` |
| POST /api/clients/:id/campaigns/:cid/images | `{ day, channel, review? }` | generate; Storage; image doc; ledger | `{ imageId, url, review }` |
| GET /api/ledger?month=YYYY-MM | | | `{ entries, totals: { byClient, byAgent, costEur } }` |
| GET /api/export/:clientId | | zip: every Firestore doc as JSON + Storage files | application/zip |
| GET /api/health | | | `{ ok, mock, images, auth:boolean }` |

Inputs for `run/:agent` are built by a server function `buildInputs(agent, campaign, client)` that mirrors today's `orchestrator.runCampaign` wiring: e.g. copywriter gets `brief, strategy = current.strategist output, context = current['brand-analyst'] output, audience = current['customer-researcher'] output, memory`. Missing dependency → 409 `{ error: 'strategy has not been generated' }`.

`inputsHash` = sha256 of the JSON of the inputs minus memory. A version whose upstream `current` changed after it was created is **stale**; `GET campaign` returns `stale: [agent]`.

## Memory implementation

`lib/memory/index.js` reads Firestore when `FIREBASE_SERVICE_ACCOUNT` is set, else returns empty (mock and tests). Phase 1 implements `approvedClaims` (returns null until Phase 2 registry exists) and `learnings`/`exemplars`/`corrections` as empty-returning queries on collections that Phase 2/3 will fill. Same signatures.

## Pages

- `/login` Google sign-in; anything else redirects here.
- `/clients` list + "New client from URL".
- `/clients/[id]` library: brand kit (swatches, fonts, logo, artwork), voice rules (editable textareas → PATCH), sources (list, add, delete), campaigns (list, new), ledger summary.
- `/clients/[id]/campaigns/[cid]` workbench: brief panel (editable until first run), chain stepper driving `run/:agent` in order with resume, the existing tabs reading current outputs, economics footer from versions' usage, exports (JSON, assets CSV, social CSV, PNG). Stale agents shown amber with "Regenerate".
- `/ledger` month view.
- `/settings` data-handling statement (static page from `docs/DATA-HANDLING.md`), export-all per client, API status.

## Tasks

1. Scaffold Next.js in a new directory `web/` inside the repo (keep Express for the Vercel deployment until task 9). `web/lib` symlink or path alias to `../lib`. Health route. Deploy `web/` as a second Vercel project (preview) so nothing breaks.
2. Firebase project, Auth allowlist middleware, `firestore.rules`, `storage.rules`, `scripts/deploy-rules.js`. Login page.
3. Firestore access layer `web/server/db.ts`: typed helpers for every collection above. Unit tests with the Firestore emulator (`firebase emulators:exec`).
4. Clients: routes + `/clients`, `/clients/[id]` pages; scan-to-client; sources CRUD; brand assets to Storage.
5. Campaigns: create; `run/:agent` with `buildInputs`, version write, `current` pointer, ledger entry, inputsHash and stale detection.
6. Workbench page: port `public/app.js` rendering into React components (one per tab), stepper with resume, economics from versions.
7. Images route to Storage; image docs; PNG export and logo composite in the browser as today.
8. Ledger page; export-all zip route.
9. Memory reads from Firestore. `docs/DATA-HANDLING.md` written and linked from settings.
10. Switch the Vercel production project to `web/`; move `api/index.js` and `public/` to `legacy/` (kept for one release, then deleted). Update README, CLAUDE.md commands, `npm test` (front-end test now uses Playwright against `next dev` in mock mode; keep the runtime test as is).

## Tests

- `test/runtime.test.js` unchanged.
- `test/db.test.js`: emulator; create client → source → campaign → version; stale detection flips when upstream changes.
- `test/e2e.spec.ts` (Playwright, mock mode): login bypass via `MOCK_AUTH=1`, new client from fixture site, generate all agents, reload page, every tab still populated, export-all returns a zip.

## Tooling tasks (from 07-tooling.md)

### Task 11: readable extraction
`@mozilla/readability` + `jsdom` in `lib/sources.js`: when we fetch HTML ourselves (no Jina), extract main content with Readability, fall back to the regex stripper if it returns under 300 chars. Test: fixture page with nav/footer noise → body text only.

### Task 12: palette from imagery
`node-vibrant` (MIT) in `lib/scraper.js`: after CSS palette extraction, download the logo and og:image (size cap 2 MB, timeout 5 s), extract vibrant/muted swatches, merge into `palette.accents` when distinct from CSS colours (same distance rule). Record `palette.sources: ['css','logo','og']`. Test: fixture logo PNG with a colour absent from CSS appears in accents.

### Task 13: real fonts for renders
Google Fonts: `lib/fonts.js` resolves `brandKit.fonts[0]` against the Google Fonts list (cached JSON, refreshed monthly); if found, records `brandKit.fontUrl`. Used by the Satori renderer in Phase 3; in Phase 1 the front end loads `fontUrl` so the SVG cards preview in the real font. Test: "Inter" resolves; "Helvetica Neue" does not and falls back.
