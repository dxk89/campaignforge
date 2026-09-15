# Local-only Campaign Forge with Nuelink and Claude Code

Date: 2026-09-15. Status: approved in conversation, awaiting written review.

## 1. Goal

Give the owner a local way of running Campaign Forge, from the same codebase
that stays live on Vercel. Three changes:

1. Remove the Gemini image generation, which never worked well, from both.
2. Connect the social calendar to Nuelink, the scheduler in use, so a planned
   month can be pushed as posts with their cards attached.
3. Let Claude Code desktop drive the locally running app through the existing
   MCP server: create clients and campaigns, run passes, read output, push
   to Nuelink.

One repository, one `main`, no fork. The hosted deployment keeps sign-in and
its Vercel configuration and is deployed from the same commits. The local run
is a way of starting the same app, not a different app.

Firestore and Cloudflare R2 stay as the store in both. Locally the app is
pointed at the same Firestore project and bucket, so the owner sees the same
clients and campaigns on the laptop and on the hosted URL.

## 2. What is removed

### 2.1 Gemini image generation

Delete:

- `web/core/images.js` and its `lib/` shim if one exists.
- `web/app/api/clients/[id]/campaigns/[cid]/images/route.ts` (GET and POST).
- In `web/components/panels.tsx`: the `imagesAvailable` prop, the
  "Generate image" and "Generate all" controls, the image cost constant, the
  photo/card view toggle, and the fetch of stored images. `downloadGraphic`
  keeps only the SVG card path.
- In `web/app/settings/page.tsx`: the Images line.
- In `web/core/pricing.js`: `GEMINI_IMAGE_MODEL`, `imageCostEur`, and the
  comment block about image pricing. The ledger type keeps its optional
  `images` count so old ledger rows still read.
- `GEMINI_API_KEY` from `.env.example` and every doc that names it.
- The `addImage` and `listImages` helpers in `web/server/db.ts` and the
  `ImageDoc` type, plus their `db.test.js` cases.
- Any `pages.test.js` or `phase*.test.js` case that exercises the image
  round trip.

Kept: the typographic SVG cards in `web/core/graphics.js`, the `image_prompt`
field in the social schema (it is a visual brief a person can still use), and
the Pexels tool entry in `07-tooling.md`, which is a separate, unbuilt idea.

### 2.2 Nothing else

Sign-in, the proxy gate, `web/vercel.json`, `docs/DEPLOY.md`, the spend
ceiling, `legacy/`, `evals/`: all stay. The hosted deployment needs them and
the local run does not mind them. `render.yaml` is deleted: it describes the
retired Express prototype and has not matched the app since Phase 1.

## 2b. The local run

A new root script:

```
npm run local        # MOCK_AUTH=1, real keys from web/.env, http://localhost:3000
```

It sets `MOCK_AUTH=1` and starts `next dev` on `web/`. `MOCK_AUTH` already
makes every request the owner's session with admin rights, and `auth.ts`
already accepts a store with no password when it is set. Everything else
comes from `web/.env`: `ANTHROPIC_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, the
four `R2_*` variables, and `NUELINK_API_KEY`.

`AGENT_DEADLINE_MS` is already read from the environment; the local script
leaves it unset, so a pass is not cut short at the hosted 800 seconds.

The settings page shows which mode is running ("Local, no sign-in" or
"Hosted"), so the owner can tell the two tabs apart.

`docs/HUMAN-ACTIONS.md` gains a "Running locally" section: copy the
service account JSON and R2 keys from the Vercel project's environment
variables into `web/.env`, then `npm run local`.

## 3. Nuelink

### 3.1 The API, as verified on 2026-09-15

Base `https://nuelink.com/api/public/v1`, header
`Authorization: Bearer <key>`. Every response is
`{ status: 'success', data, pagination? }`.

| Call | Notes |
|---|---|
| `GET /me` | health check; returns `timezone` |
| `GET /brands` | `[{ id, title, timezone }]` |
| `GET /brands/:b/collections` | `[{ id, title, channels: [{ id, name, status, type }] }]` |
| `GET /brands/:b/channels` | `[{ id, name, status, type }]`, type is `LinkedIn`, `X`, `Instagram`, `Facebook`, `Bluesky`, ... |
| `POST /brands/:b/media` | multipart field `media`; returns `{ id, url, type }` |
| `POST /brands/:b/collections/:c/posts` | JSON `{ caption, publishMode, scheduledAt?, media?: [{ id }], link?, alt? }` |

`publishMode` is `QUEUE`, `SCHEDULE`, `IMMEDIATE` or `DRAFT`. `scheduledAt`
is `Y-m-d H:i:s` in the brand's timezone and is required for `SCHEDULE`.
`caption` is 1 to 3000 characters. Errors: 401 bad key, 422 validation, 429
rate limit.

A post goes to every channel in its collection. There is no per-post channel
selection. The owner's account currently has one brand (IntelliNews Media OU,
id 35946) and two collections, both fanning out to five or seven channels.

### 3.2 Consequence: one collection per channel

The social planner writes different copy for LinkedIn, X and Instagram, so
each needs its own Nuelink collection containing only that channel. This is
a one-time setup in Nuelink's UI, documented in `docs/HUMAN-ACTIONS.md`. The
app does not create collections (the API has no such endpoint).

### 3.3 Core module: `web/core/nuelink.js`

Plain CommonJS, `fetch` only, no SDK. Exports:

- `available()`: true when `NUELINK_API_KEY` is set.
- `me()`, `brands()`, `collections(brandId)`, `channels(brandId)`
- `uploadMedia(brandId, { buffer, mime, filename })`
- `createPost(brandId, collectionId, body)`
- `formatScheduledAt(dateIso, time)`: builds the `Y-m-d H:i:s` string. Time
  of day is a fixed default per channel (09:00 LinkedIn, 12:00 X, 18:00
  Instagram) defined here, in code, per invariant 1.

Every function returns `{ error, status }` instead of throwing (invariant
13). A 429 is retried once after the `Retry-After` interval, then reported.
The base URL is overridable with `NUELINK_BASE_URL` so the tests can point
it at a fake.

Add a one-line shim at `lib/nuelink.js`.

### 3.4 Data

On the client record (`ClientDoc` in `web/server/types.ts`):

```
nuelink?: {
  brandId: number | null;
  collections: Partial<Record<'linkedin' | 'x' | 'instagram', number | null>>;
}
```

A new sub-collection under a campaign, `nuelink`, one doc per push attempt:

```
NuelinkPush = {
  pushId, createdAt, startDate, publishMode, skipWeekends,
  results: Array<{
    day, channel, scheduledAt,
    status: 'posted' | 'failed' | 'skipped',
    nuelinkPostId: string | null, mediaId: string | null, error: string | null,
  }>
}
```

Helpers in `db.ts`: `addNuelinkPush`, `listNuelinkPushes`. The union of
`posted` results across pushes is the set of posts already sent; a later
push skips them unless `force` is passed. Firestore path parity is covered
by the existing static check in `db.test.js`.

### 3.5 Routes

- `GET /api/nuelink` returns `{ configured, me, brands }`; with
  `?brand=<id>` also `collections` and `channels`. Used by the client page.
- `PATCH /api/clients/[id]` already exists; it accepts the `nuelink` field.
- `POST /api/clients/[id]/campaigns/[cid]/schedule/nuelink`
  body `{ start, weekends?: 'skip' | 'keep', publishMode: 'DRAFT' | 'SCHEDULE', channels?: string[], force?: boolean }`.
  Steps, in order, for each post the schedule logic yields:
  1. Skip if already posted and not `force`.
  2. Skip with a reason if the client has no collection for that channel.
  3. If the post has a graphic, render the card SVG with the logo embedded
     (as `graphics.js` already does for the export), rasterise to PNG with
     `@resvg/resvg-js` (MPL-2.0), upload as media.
  4. Create the post: caption is text plus hashtags on a new line, as the
     CSV export already builds it; `link` is the landing URL when present;
     `alt` is the card headline; `scheduledAt` only for `SCHEDULE`.
  5. Record the result. A failure on one post does not stop the others.
  Returns the push doc. Writes one ledger row per push with zero cost, so
  the ledger shows the campaign left the building.
- `GET /api/clients/[id]/campaigns/[cid]/schedule/nuelink` lists pushes.

A push of 32 posts is about 32 uploads and 32 creates and should take under
a minute.

### 3.6 UI

- Client page: a "Nuelink" card with a brand dropdown and three collection
  dropdowns (LinkedIn, X, Instagram), populated from `/api/nuelink`. A
  collection whose channel list includes types other than the row's channel
  shows a warning: "This collection also posts to Facebook, Bluesky". Saved
  with the existing client PATCH.
- Social panel: a "Send to Nuelink" block replacing the image block. Start
  date, weekend toggle, Draft or Schedule, channel checkboxes, a preview
  count ("24 posts, 3 already sent, 8 skipped: no X collection"), the button,
  then a per-post result table. When the key is missing it says so in one
  sentence.

### 3.7 Environment

`NUELINK_API_KEY` (required for the feature), `NUELINK_BASE_URL` (tests
only). Added to `.env.example` with a comment. The key is server-side only
(invariant 9). The hosted deployment may set the key too; nothing in the
feature is local-only. Without it the panel says Nuelink is not configured.

## 4. Claude Code desktop

Extend `mcp/server.js`. The existing two tools stay pure and offline. The new
tools call the running app over HTTP at `CF_URL` (default
`http://localhost:3000`) and, when it is not running, return one sentence
saying to start it with `npm run local`. They send no cookie, so they work
only against a `MOCK_AUTH=1` instance; pointing `CF_URL` at the hosted URL
gets a 401 and the server says so.

| Tool | Calls |
|---|---|
| `list_clients` | `GET /api/clients` |
| `create_client` | `POST /api/clients` from a URL (runs the scan) |
| `list_campaigns` | `GET /api/clients/:id/campaigns` |
| `create_campaign` | `POST /api/clients/:id/campaigns` with a brief |
| `run_agent` | `POST .../run/:agent`; waits, returns summary, flags and cost |
| `get_output` | current output for one agent, as text a model can read |
| `nuelink_setup` | `GET /api/nuelink` and `PATCH` the client mapping |
| `push_to_nuelink` | the push route |
| `cost` | `GET /api/ledger` for a campaign |

Outputs are plain text, as the existing tools render. Add `.mcp.json` at the
repo root registering the server, so Claude Code picks it up when the folder
is opened. Document the flow in `mcp/README.md`.

## 5. Testing

- `test/nuelink.test.js`: a fake Nuelink HTTP server in `test/helpers/`
  that records requests and answers with the shapes in 3.1, including one
  429 and one 422. Tests the core client, then the push route end to end on
  the mock model: mapping saved, cards uploaded, posts created with the right
  `scheduledAt`, second push skips, `force` resends, a missing collection is
  reported per post.
- `test/mcp.test.js` (extend): the new tools' schemas match their handlers,
  and a call with the app down returns the start-the-app message.
- Remove the image cases from the `pages`, `phase2` and `db` suites.
- Run `MOCK_CLAUDE=1 npm run web:build` and `npm test`; both must pass.

## 6. Docs

Update `CLAUDE.md`, `HANDOVER.md`, `README.md`, `.env.example`,
`docs/HUMAN-ACTIONS.md` (Nuelink collections, running locally),
`docs/DATA-HANDLING.md` (what leaves for Nuelink: caption, link, card PNG),
`docs/DEPLOY.md` (Gemini variable gone, Nuelink variable optional).
The "Do not" rule in `CLAUDE.md` against platform publishing integrations
is amended: Nuelink is the one publishing integration, chosen by the owner.

## 7. Out of scope

Facebook and Bluesky (the planner does not write for them), reading post
status back from Nuelink (the API does not list posts yet), a local file
store, removing sign-in or hosting configuration, removing `legacy/` or
`evals/`.
