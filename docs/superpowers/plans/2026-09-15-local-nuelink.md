# Local run, Nuelink push and Claude Code tools: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Gemini image generation, add a local run mode, push the social calendar to Nuelink with card PNGs, and let Claude Code drive the running app through the MCP server.

**Architecture:** One codebase, hosted and local. The Nuelink integration is a plain CommonJS client in `web/core/nuelink.js`, an orchestration module in `web/server/nuelink.ts` built on the existing `web/core/schedule.js` date logic, two thin routes, and two client components. The MCP server gains HTTP-backed tools that call the local app.

**Tech Stack:** Next.js 16 App Router, plain Node CommonJS in `web/core`, TypeScript in `web/server` and `web/app`, `@resvg/resvg-js` for SVG to PNG, Node's built-in `fetch`, `FormData` and `Blob`, `node:assert` tests spawned with `test/helpers/next-server.js`.

Spec: `docs/superpowers/specs/2026-09-15-local-nuelink-design.md`.

## Global Constraints

- British English in prompts, UI copy and docs. No em-dashes anywhere.
- `web/core/` stays plain CommonJS. No TypeScript, no ESM there.
- Every external tool returns `{ error }` on failure and never throws into a route (invariant 13).
- API keys are server-side only (invariant 9). `NUELINK_API_KEY` never reaches the browser.
- The store is optional (invariant 11): every new data helper has an in-memory branch, and new in-memory maps live on `globalThis` if module-level.
- Firestore document paths need an even number of components; the static parity check in `test/db.test.js` covers any literal `fsdb()` chain you add.
- Commit messages: one line what, then a paragraph why. No emoji.
- Before `npm test`, run `MOCK_CLAUDE=1 npm run web:build` (five suites need `web/.next`). On Windows in Git Bash: `cd web && MOCK_CLAUDE=1 npm run build && cd ..`.
- Run `npm test` before and after each task. The run takes several minutes; the server-backed suites need Python on PATH for the fixture site.
- Do not "fix" the deliberately over-limit Google headline in `web/core/mock.js`.
- `.env` files are gitignored. Never commit a key. The owner's Nuelink key is already in `web/.env` and `.env`.

---

### Task 1: Remove Gemini image generation

**Files:**
- Delete: `web/core/images.js`, `lib/images.js`, `web/app/api/clients/[id]/campaigns/[cid]/images/route.ts`, `render.yaml`
- Modify: `web/core/pricing.js:14-19,51-56,86-88`
- Modify: `web/core/app.js:22,43,154-160`
- Modify: `web/app/api/health/route.ts:6,16`
- Modify: `web/app/settings/page.tsx:14,47`
- Modify: `web/components/panels.tsx:172-262,305-372`
- Modify: `web/app/clients/[id]/campaigns/[cid]/workbench.tsx:44,47,201`
- Modify: `web/server/db.ts:12,196-209,324,343`
- Modify: `web/server/types.ts:103-112`
- Modify: `test/pages.test.js:78-93,147-154`
- Modify: `test/frontend.test.js:45-49`
- Modify: `web/app/clients/[id]/library.tsx:289`
- Modify: `.env.example`, `docs/DEPLOY.md:68-69,113`, `docs/HUMAN-ACTIONS.md:84`, `docs/DATA-HANDLING.md:21,39`, `README.md:105,111`

**Interfaces:**
- Produces: `GET /api/health` no longer returns `images`. `SocialPanel` props become `{ social, clientId, campaignId, logoRef, landingUrl }`. `LedgerEntry.images` stays (old rows carry it).

- [ ] **Step 1: Update the tests first**

In `test/pages.test.js`, replace lines 78 to 93 (from `// images: mock mode returns` to `console.log('  ledger page ok');`) with:

```js
  // the image route is gone with Gemini
  const gone = await post(`/api/clients/${clientId}/campaigns/${cid}/images`, { day: 3, channel: 'instagram' });
  assert.equal(gone.status, 404, 'image generation route removed');

  const led = await html('/ledger');
  assert.equal(led.status, 200);
  assert.ok(led.body.includes('copywriter'), 'ledger lists agents');
  console.log('  ledger page ok');
```

Replace lines 147 to 154 (from `// stored images reappear` to `console.log('  image state ok |' ...`) with:

```js
  // visual briefs still reach the page; they are a brief a person can use
  assert.ok(wb2.body.includes('image_prompt'), 'visual briefs reach the client');
```

In `test/frontend.test.js`, replace lines 45 to 49 with:

```js
  d.querySelector('#tabs [data-tab="social"]').click(); await wait(200);
  assert.equal(d.querySelector('[data-gen]'), null, 'no generate-image button: Gemini is gone');
```

Check the top of `test/frontend.test.js` requires `assert`; add `const assert = require('assert');` if it does not.

- [ ] **Step 2: Run the pages suite to see it fail**

Run: `cd web && MOCK_CLAUDE=1 npm run build && cd .. && node test/pages.test.js`
Expected: FAIL at "image generation route removed" (status 200, not 404).

- [ ] **Step 3: Delete the files**

```bash
git rm web/core/images.js lib/images.js "web/app/api/clients/[id]/campaigns/[cid]/images/route.ts" render.yaml
```

- [ ] **Step 4: Remove the references**

`web/core/pricing.js`: delete the comment block lines 15 to 19 ("Image generation (optional...ignored here as rounding."), delete lines 51 to 56 (`GEMINI_IMAGE_MODEL`, `USD_PER_IMAGE`, `imageCostEur`), and remove the three names from `module.exports`.

`web/core/app.js`: delete line 22 (`const images = require('./images');`), change line 43 to
```js
app.get('/api/health', (req, res) => res.json({ ok: true, mock: MOCK }));
```
and delete the `/api/images/generate` block (the comment line 154 through the closing `}));`).

`web/app/api/health/route.ts`: delete line 6 and the `images: images.available(),` line.

`web/app/settings/page.tsx`: delete line 14 and the `<div><dt>Images</dt>...` line.

`web/server/types.ts`: delete the `ImageDoc` type (lines 103 to 112).

`web/server/db.ts`: remove `ImageDoc` from the import on line 12; delete the `// ---- images` section (lines 196 to 209, `addImage` and `listImages`); in the two comments at 324 and 343 change "versions, images, sources" to "versions, sources" and "versions, images, assets" to "versions, assets".

`web/app/clients/[id]/campaigns/[cid]/workbench.tsx`: delete line 44 and line 47; remove `imagesAvailable={imagesAvailable}` from the `SocialPanel` element on line 201.

`web/app/clients/[id]/library.tsx` line 289: change the hint to `logo goes on every graphic`.

- [ ] **Step 5: Simplify the Social panel**

In `web/components/panels.tsx` replace everything from `const IMAGE_COST_EUR` (line 172) to the end of the `<div className="social-bar">...</div>` image bar (line 246, the line before the `{/*` comment about handing the month to a scheduler) with:

```tsx
export function SocialPanel({ social, clientId, campaignId, logoRef, landingUrl }:
  { social: any; clientId?: string; campaignId?: string; logoRef?: string | null; landingUrl?: string }) {
  // The plan holds day numbers, so a start date is asked for rather than
  // guessed. Defaulted to the next Monday, because a B2B month that begins
  // mid-week wastes its first days.
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  if (!social?.posts?.length) return <p className="muted">No social calendar yet.</p>;
  const weeks: any[][] = [[], [], [], []];
  social.posts.forEach((p: any) => weeks[Math.min(3, Math.floor((p.day - 1) / 7))].push(p));

  return (
    <>
```

Then in the post card (around lines 305 to 325) replace the `.gfx` block with:

```tsx
                {p.graphic?.svg ? (
                  <div className="gfx">
                    <div dangerouslySetInnerHTML={{ __html: p.graphic.svg }} />
                    <button type="button" className="mini-copy" onClick={() => downloadGraphic(p)}>
                      Download PNG
                    </button>
                    {p.graphic.image_prompt ? <div className="img-prompt">{p.graphic.image_prompt}</div> : null}
                  </div>
                ) : null}
```

Replace `downloadGraphic` (the whole function) with:

```tsx
/** The SVG card as a 1080 PNG. Falls back to the SVG itself if the canvas refuses. */
async function downloadGraphic(post: any) {
  const name = `day${post.day}-${post.channel}.png`;
  const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(post.graphic.svg);
  try {
    const im = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
    });
    const c = document.createElement('canvas');
    c.width = 1080; c.height = 1080;
    c.getContext('2d')!.drawImage(im, 0, 0, 1080, 1080);
    c.toBlob((png) => png && download(name, 'image/png', png), 'image/png');
  } catch {
    download(name.replace(/\.png$/, '.svg'), 'image/svg+xml', post.graphic.svg);
  }
}
```

Remove `useEffect` from the React import at the top of `panels.tsx` only if nothing else in the file uses it (grep first). `logoRef` stays in the props because the workbench passes it and Task 7 uses it.

- [ ] **Step 6: Docs and env**

`.env.example`: delete the two lines `# Optional: enables image generation...` and `GEMINI_API_KEY=`.
`docs/DEPLOY.md`: delete the `GEMINI_API_KEY` and `GEMINI_IMAGE_MODEL` table rows and the "Images unavailable" symptom row.
`docs/HUMAN-ACTIONS.md` line 84: `**Optional:** \`JINA_API_KEY\` (better site scanning, free tier).`
`docs/DATA-HANDLING.md` line 21: remove the clause ", and, when image generation is used, sends the visual brief and any reference artwork to Google's Gemini API". Line 39: replace the paragraph with: `*Is our material used to train models?* One provider sees your material: Anthropic's API terms govern the brief, company context and source text sent for campaign generation; they offer terms under which API content is not used for training. Check the terms in force for the account this deployment uses before answering a client in writing.` (Task 9 adds Nuelink to this file.)
`README.md` line 105: remove `images,` from the route list; line 111: remove `, images`.

- [ ] **Step 7: Build and run the full suite**

Run: `cd web && MOCK_CLAUDE=1 npm run build && cd .. && npm test`
Expected: every suite prints `ok`; `frontend.test.js` ends with `JS errors: []`. A TypeScript error naming `images` means a reference was missed; grep `images\.` under `web/` excluding `node_modules`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Remove Gemini image generation" -m "It never produced pictures worth posting and its cost line confused the Social tab. The typographic cards stay and become the picture Nuelink receives. The ledger keeps its images column so old rows still read."
```

---

### Task 2: The local run mode

**Files:**
- Modify: `package.json:12` (scripts)
- Modify: `web/app/settings/page.tsx:45`
- Modify: `docs/HUMAN-ACTIONS.md` (new section after §4), `README.md:49-55`, `docs/DEPLOY.md:118-123`, `CLAUDE.md` Commands block
- Test: `test/pages.test.js`

**Interfaces:**
- Produces: `npm run local` at the repo root; the settings page shows a `Mode` row.

- [ ] **Step 1: Test that settings names the mode**

In `test/pages.test.js`, after `assert.ok(set.body.includes('In memory'), ...)` add:

```js
  assert.ok(set.body.includes('Local, no sign-in'), 'settings says it is the local run (MOCK_AUTH=1 in tests)');
```

Run: `node test/pages.test.js` (build from Task 1 is current). Expected: FAIL on that assertion.

- [ ] **Step 2: Add the script and the settings row**

Windows `cmd` cannot do `VAR=1 cmd` and `cross-env` is not installed, so rather than add a dependency, write `scripts/local.js`:

```js
// Start the app for the owner: no sign-in, real keys from web/.env.
process.env.MOCK_AUTH = '1';
require('child_process').spawn('npm', ['run', 'dev'], { cwd: require('path').join(__dirname, '..', 'web'), stdio: 'inherit', shell: true });
```

and add to `package.json` scripts, after `"web"`: `"local": "node scripts/local.js",`. `shell: true` is what lets `npm` resolve to `npm.cmd` on Windows.

`web/app/settings/page.tsx`: replace the `Signed in` row with:
```tsx
          <div><dt>Mode</dt><dd>{process.env.MOCK_AUTH === '1' ? 'Local, no sign-in (MOCK_AUTH=1)' : `Hosted, signed in as ${session.admin ? 'admin' : 'reviewer'}`}</dd></div>
```

- [ ] **Step 3: Run the pages suite**

Run: `cd web && MOCK_CLAUDE=1 npm run build && cd .. && node test/pages.test.js`
Expected: PASS.

- [ ] **Step 4: Docs**

`docs/HUMAN-ACTIONS.md`: insert after §4 a section:

```markdown
## 4b. Running it on your own machine (5 minutes)

The same app, without sign-in, against the same Firestore and R2.

1. Copy `.env.example` to `web/.env`.
2. From the Vercel project's Environment Variables, copy `ANTHROPIC_API_KEY`,
   `FIREBASE_SERVICE_ACCOUNT`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY` and `R2_BUCKET` into `web/.env`. Add
   `NUELINK_API_KEY` from Nuelink → Settings → API.
3. `npm install && cd web && npm install && cd ..` once.
4. `npm run local` and open http://localhost:3000.

Leave the passwords and `SESSION_SECRET` out: `npm run local` sets
`MOCK_AUTH=1`, so every request is you. Do not expose this port to the
internet.
```

`README.md` lines 49 to 55: add `npm run local               # you, no sign-in, real keys from web/.env` under `npm run web`.
`docs/DEPLOY.md` §8: add the same line and change "put the same variables in `web/.env.local`" to "put the same variables in `web/.env` and use `npm run local`".
`CLAUDE.md` Commands block: add `npm run local` with the one-line comment.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add npm run local: the app without sign-in, on real keys" -m "The owner runs the tool on a laptop against the same Firestore and R2 as the hosted instance. MOCK_AUTH already makes every request the owner's session; this names that as a mode, shows it on Settings, and documents which variables to copy."
```

---

### Task 3: Nuelink core client

**Files:**
- Create: `web/core/nuelink.js`, `lib/nuelink.js`, `test/helpers/fake-nuelink.js`, `test/nuelink.test.js`
- Modify: `package.json:11` (add `node test/nuelink.test.js` after `node test/schedule.test.js` in the test script)

**Interfaces:**
- Produces (`web/core/nuelink.js`):
  - `available(): boolean`
  - `me(): Promise<{ data } | { error, status }>`
  - `brands(): Promise<{ data: Array<{ id, title, timezone }> } | { error, status }>`
  - `collections(brandId): Promise<{ data: Array<{ id, title, channels: Array<{ id, name, status, type }> }> } | { error, status }>`
  - `channels(brandId): Promise<{ data: Array<{ id, name, status, type }> } | { error, status }>`
  - `uploadMedia(brandId, { buffer, mime, filename }): Promise<{ data: { id, url, type } } | { error, status }>`
  - `createPost(brandId, collectionId, body): Promise<{ data: { id } } | { error, status }>`
  - `formatScheduledAt(when: Date): string` in `Y-m-d H:i:s`
  - `CHANNEL_TYPES = { linkedin: 'LinkedIn', x: 'X', instagram: 'Instagram' }`
- Produces (`test/helpers/fake-nuelink.js`): `startFakeNuelink(port) -> { requests: Array<{ method, path, body, files }>, posts: [], close() }`.

- [ ] **Step 1: Write the fake server**

`test/helpers/fake-nuelink.js`:

```js
/**
 * A stand-in for Nuelink's public API, shaped like the responses recorded
 * on 2026-09-15 (see the spec, section 3.1). It records every request so a
 * test can assert what was sent, and it can be told to fail once.
 */
const http = require('http');

function startFakeNuelink(port) {
  const state = { requests: [], posts: [], media: [], failNext: null };
  let nextId = 1000;
  const brand = { id: 35946, title: 'IntelliNews Media OU', timezone: 'Europe/London' };
  const channels = [
    { id: 319509, name: 'IntelliNews', status: 'ACTIVE', type: 'LinkedIn' },
    { id: 319511, name: 'IntelliNews', status: 'ACTIVE', type: 'X' },
    { id: 319506, name: 'bne IntelliNews', status: 'ACTIVE', type: 'Instagram' },
    { id: 319504, name: 'IntelliNews', status: 'ACTIVE', type: 'Facebook' },
  ];
  const collections = [
    { id: 201, title: 'Forge LinkedIn', channels: [channels[0]] },
    { id: 202, title: 'Forge X', channels: [channels[1]] },
    { id: 203, title: 'Forge Instagram', channels: [channels[2]] },
    { id: 106059, title: 'Global Queue', channels },
  ];
  const ok = (res, data, extra = {}) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ status: 'success', data, ...extra })); };
  const fail = (res, status, message, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify({ status: 'error', message })); };

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const ct = req.headers['content-type'] || '';
      const entry = { method: req.method, path: req.url, body: null, files: [] };
      if (ct.includes('application/json') && raw.length) entry.body = JSON.parse(raw.toString());
      if (ct.includes('multipart/form-data')) {
        // Enough of multipart to know a file arrived and what it was called.
        const s = raw.toString('latin1');
        const m = /name="media"; filename="([^"]+)"\r\nContent-Type: ([^\r]+)/.exec(s);
        if (m) entry.files.push({ filename: m[1], mime: m[2], bytes: raw.length });
      }
      state.requests.push(entry);

      if (req.headers.authorization !== 'Bearer test-key') return fail(res, 401, 'Unauthenticated');
      if (state.failNext) { const f = state.failNext; state.failNext = null; return fail(res, f.status, f.message, f.headers); }

      const p = req.url.replace(/\?.*$/, '');
      if (req.method === 'GET' && p === '/api/public/v1/me') return ok(res, { id: 'u1', name: 'Test', joinedAt: '2026-09-14T11:06:59.000000Z', timezone: 'Europe/London' });
      if (req.method === 'GET' && p === '/api/public/v1/brands') return ok(res, [brand]);
      if (req.method === 'GET' && p === `/api/public/v1/brands/${brand.id}/collections`) return ok(res, collections);
      if (req.method === 'GET' && p === `/api/public/v1/brands/${brand.id}/channels`) return ok(res, channels);
      if (req.method === 'POST' && p === `/api/public/v1/brands/${brand.id}/media`) {
        if (!entry.files.length) return fail(res, 422, 'The media field is required.');
        const media = { id: `m${nextId++}`, url: `https://cdn.example/${entry.files[0].filename}`, type: 'image' };
        state.media.push(media);
        return ok(res, media);
      }
      const postMatch = /^\/api\/public\/v1\/brands\/(\d+)\/collections\/(\d+)\/posts$/.exec(p);
      if (req.method === 'POST' && postMatch) {
        const b = entry.body || {};
        if (!b.caption) return fail(res, 422, 'The caption field is required.');
        if (b.publishMode === 'SCHEDULE' && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(b.scheduledAt || '')) return fail(res, 422, 'scheduledAt must be Y-m-d H:i:s');
        const post = { id: `p${nextId++}`, collectionId: Number(postMatch[2]), ...b };
        state.posts.push(post);
        return ok(res, { id: post.id });
      }
      fail(res, 404, 'Not found');
    });
  });
  server.listen(port);
  return { ...state, requests: state.requests, posts: state.posts, media: state.media, failOnce: (f) => { state.failNext = f; }, close: () => server.close() };
}

module.exports = { startFakeNuelink };
```

Note the returned object spreads `state` for convenience but `failOnce` mutates the same `state` object, so `requests`, `posts` and `media` are the live arrays.

- [ ] **Step 2: Write the failing test**

`test/nuelink.test.js` (part one; Task 6 appends the route tests):

```js
/**
 * Nuelink: the client over the public API, then the push route.
 *
 * The client is tested against a fake server shaped like the real responses
 * recorded in the spec, so the shapes here are the contract. Nothing in this
 * file reaches nuelink.com.
 */
const assert = require('assert');
const { startFakeNuelink } = require('./helpers/fake-nuelink');

process.env.NUELINK_API_KEY = 'test-key';
process.env.NUELINK_BASE_URL = 'http://localhost:8098/api/public/v1';
const nuelink = require('../web/core/nuelink');

(async () => {
  const fake = startFakeNuelink(8098);
  try {
    assert.equal(nuelink.available(), true, 'a key means available');

    const me = await nuelink.me();
    assert.equal(me.data.timezone, 'Europe/London', 'me() returns the profile');

    const brands = await nuelink.brands();
    assert.equal(brands.data[0].id, 35946);

    const cols = await nuelink.collections(35946);
    assert.equal(cols.data.length, 4);
    assert.equal(cols.data[3].channels.length, 4, 'a collection lists its channels');

    const chans = await nuelink.channels(35946);
    assert.ok(chans.data.some((c) => c.type === 'Instagram'));

    const up = await nuelink.uploadMedia(35946, { buffer: Buffer.from('png-bytes'), mime: 'image/png', filename: 'day1-linkedin.png' });
    assert.ok(up.data.id, 'upload returns a media id');
    const sent = fake.requests.find((r) => r.path.endsWith('/media'));
    assert.deepEqual(sent.files[0], { filename: 'day1-linkedin.png', mime: 'image/png', bytes: sent.files[0].bytes }, 'multipart field is "media"');

    const post = await nuelink.createPost(35946, 201, { caption: 'Hello', publishMode: 'DRAFT', media: [{ id: up.data.id }] });
    assert.ok(post.data.id, 'create returns a post id');
    assert.equal(fake.posts[0].media[0].id, up.data.id, 'media id travelled');

    // Failures are values, not exceptions (invariant 13).
    const bad = await nuelink.createPost(35946, 201, { publishMode: 'DRAFT' });
    assert.equal(bad.status, 422);
    assert.match(bad.error, /caption/i, 'the API message is passed through');

    // One retry on 429, honouring Retry-After.
    fake.failOnce({ status: 429, message: 'Too many', headers: { 'retry-after': '0' } });
    const retried = await nuelink.brands();
    assert.equal(retried.data[0].id, 35946, 'a 429 is retried once');

    // A 5xx is reported as a value, with the status.
    fake.failOnce({ status: 500, message: 'Server error' });
    const broken = await nuelink.brands();
    assert.equal(broken.status, 500);
    assert.match(broken.error, /Server error/);

    // The date format Nuelink wants, from a local Date.
    assert.equal(nuelink.formatScheduledAt(new Date(2026, 8, 7, 8, 30)), '2026-09-07 08:30:00');

    // A dead server is an error value, not a crash.
    process.env.NUELINK_BASE_URL = 'http://localhost:1/api/public/v1';
    const dead = await nuelink.me();
    assert.ok(dead.error, 'unreachable host reports an error');
    process.env.NUELINK_BASE_URL = 'http://localhost:8098/api/public/v1';

    console.log('nuelink client tests: ok');
  } finally {
    fake.close();
  }
})().catch((e) => { console.error('nuelink tests FAILED', e); process.exit(1); });
```

Keep the base URL read at call time (not module load) so the dead-server case works.

- [ ] **Step 3: Run it to see it fail**

Run: `node test/nuelink.test.js`
Expected: FAIL with `Cannot find module '../web/core/nuelink'`.

- [ ] **Step 4: Write the client**

`web/core/nuelink.js`:

```js
/**
 * Nuelink's public API, as a small client.
 *
 * Nuelink is the scheduler the owner uses. This module is the only thing
 * that talks to it. Plain fetch, no SDK: six calls, one response shape,
 * nothing to keep up to date.
 *
 * Every function returns a value: { data } on success, { error, status } on
 * failure. Nothing here throws into a route (invariant 13), because a
 * scheduler being down must not lose a campaign, only delay its posting.
 *
 * Shapes were recorded against the live API on 2026-09-15; the fake server
 * in test/helpers/fake-nuelink.js mirrors them.
 */

const DEFAULT_BASE = 'https://nuelink.com/api/public/v1';

const key = () => process.env.NUELINK_API_KEY || '';
const base = () => (process.env.NUELINK_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');

const available = () => Boolean(key());

/** The planner's channel keys, as Nuelink names the channel type. */
const CHANNEL_TYPES = { linkedin: 'LinkedIn', x: 'X', instagram: 'Instagram' };

const pad = (n) => String(n).padStart(2, '0');

/** Y-m-d H:i:s, from a local Date. Nuelink reads it in the brand's timezone. */
function formatScheduledAt(when) {
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`;
}

async function call(method, path, { json, form } = {}, attempt = 0) {
  if (!key()) return { error: 'NUELINK_API_KEY is not set', status: 503 };
  const headers = { authorization: `Bearer ${key()}`, accept: 'application/json' };
  let body;
  if (json) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  let res;
  try {
    res = await fetch(base() + path, { method, headers, body });
  } catch (err) {
    return { error: `Could not reach Nuelink: ${err.message}`, status: 0 };
  }
  if (res.status === 429 && attempt === 0) {
    const wait = Math.min(30, Number(res.headers.get('retry-after')) || 1);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return call(method, path, { json, form }, 1);
  }
  let parsed = null;
  try { parsed = await res.json(); } catch { /* not JSON; reported below */ }
  if (!res.ok) {
    const message = parsed?.message || parsed?.error || (parsed?.errors ? JSON.stringify(parsed.errors) : `HTTP ${res.status}`);
    return { error: message, status: res.status };
  }
  return { data: parsed?.data ?? parsed, pagination: parsed?.pagination };
}

const me = () => call('GET', '/me');
const brands = () => call('GET', '/brands');
const collections = (brandId) => call('GET', `/brands/${brandId}/collections`);
const channels = (brandId) => call('GET', `/brands/${brandId}/channels`);

function uploadMedia(brandId, { buffer, mime, filename }) {
  const form = new FormData();
  form.append('media', new Blob([buffer], { type: mime }), filename);
  return call('POST', `/brands/${brandId}/media`, { form });
}

const createPost = (brandId, collectionId, body) => call('POST', `/brands/${brandId}/collections/${collectionId}/posts`, { json: body });

module.exports = { available, me, brands, collections, channels, uploadMedia, createPost, formatScheduledAt, CHANNEL_TYPES };
```

`lib/nuelink.js`:
```js
module.exports = require('../web/core/nuelink');
```

- [ ] **Step 5: Run the test**

Run: `node test/nuelink.test.js`
Expected: `nuelink client tests: ok`.

- [ ] **Step 6: Add to `npm test` and commit**

In `package.json` line 11, insert `node test/nuelink.test.js && ` after `node test/schedule.test.js && `.

```bash
git add web/core/nuelink.js lib/nuelink.js test/helpers/fake-nuelink.js test/nuelink.test.js package.json
git commit -m "Nuelink client: six calls over the public API, failures as values" -m "The owner schedules with Nuelink, so the calendar should reach it without a CSV. This is the whole surface the app needs: profile, brands, collections, channels, media upload and create post. A fake server in the tests mirrors the shapes recorded against the live API on 2026-09-15."
```

---

### Task 4: Data: the client mapping and the push record

**Files:**
- Modify: `web/server/types.ts` (Client type, new NuelinkPush type)
- Modify: `web/server/db.ts` (after the ledger section)
- Modify: `web/app/api/clients/[id]/route.ts:19`
- Test: `test/db.test.js`

**Interfaces:**
- Produces:
  ```ts
  export type NuelinkMapping = { brandId: number | null; collections: Partial<Record<'linkedin' | 'x' | 'instagram', number | null>> };
  export type NuelinkResult = { day: number; channel: string; scheduledAt: string | null; status: 'posted' | 'failed' | 'skipped'; nuelinkPostId: string | null; mediaId: string | null; error: string | null };
  export type NuelinkPush = { pushId: string; createdAt: string; startDate: string; publishMode: 'DRAFT' | 'SCHEDULE'; skipWeekends: boolean; results: NuelinkResult[] };
  addNuelinkPush(ws, clientId, campaignId, push: Omit<NuelinkPush, 'pushId' | 'createdAt'>): Promise<NuelinkPush>
  listNuelinkPushes(ws, clientId, campaignId): Promise<NuelinkPush[]>   // newest first
  ```
  `Client.nuelink?: NuelinkMapping`. `PATCH /api/clients/[id]` accepts `nuelink`.

- [ ] **Step 1: Failing test**

In `test/db.test.js`, inside the main `db` async block after the ledger assertions (around line 95), add:

```js
  // Nuelink: the mapping lives on the client, the pushes under the campaign.
  await db.updateClient(ws, client.clientId, { nuelink: { brandId: 35946, collections: { linkedin: 201, x: 202 } } });
  assert.equal((await db.getClient(ws, client.clientId)).nuelink.collections.x, 202, 'mapping persists');
  const push = await db.addNuelinkPush(ws, client.clientId, campaign.campaignId, {
    startDate: '2026-09-07', publishMode: 'DRAFT', skipWeekends: true,
    results: [{ day: 1, channel: 'linkedin', scheduledAt: null, status: 'posted', nuelinkPostId: 'p1', mediaId: null, error: null }],
  });
  assert.ok(push.pushId && push.createdAt, 'a push gets an id and a time');
  const pushes = await db.listNuelinkPushes(ws, client.clientId, campaign.campaignId);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].results[0].nuelinkPostId, 'p1');
```

Run: `node test/db.test.js`. Expected: FAIL, `db.addNuelinkPush is not a function`.

- [ ] **Step 2: Types**

`web/server/types.ts`: add `nuelink?: NuelinkMapping;` to `Client` after `settings`, and append:

```ts
/** Which Nuelink brand and, per social channel, which collection a post goes to. */
export type NuelinkMapping = {
  brandId: number | null;
  collections: Partial<Record<'linkedin' | 'x' | 'instagram', number | null>>;
};

export type NuelinkResult = {
  day: number; channel: string; scheduledAt: string | null;
  status: 'posted' | 'failed' | 'skipped';
  nuelinkPostId: string | null; mediaId: string | null; error: string | null;
};

/** One attempt to send a calendar to Nuelink. Kept so a second push skips what went. */
export type NuelinkPush = {
  pushId: string; createdAt: string; startDate: string;
  publishMode: 'DRAFT' | 'SCHEDULE'; skipWeekends: boolean;
  results: NuelinkResult[];
};
```

- [ ] **Step 3: Helpers**

`web/server/db.ts`: add `NuelinkPush` to the type import and, after the ledger section:

```ts
// ---- nuelink pushes ------------------------------------------------------------

export async function addNuelinkPush(ws: string, clientId: string, campaignId: string, push: Omit<NuelinkPush, 'pushId' | 'createdAt'>): Promise<NuelinkPush> {
  const pushId = newId();
  const doc: NuelinkPush = { ...push, pushId, createdAt: now() };
  if (storeEnabled) await fsdb().doc(`${root(ws)}/clients/${clientId}/campaigns/${campaignId}/nuelink/${pushId}`).set(doc);
  else memCol(memKey(ws, clientId, campaignId, 'nuelink')).set(pushId, doc);
  return doc;
}

export async function listNuelinkPushes(ws: string, clientId: string, campaignId: string): Promise<NuelinkPush[]> {
  let docs: NuelinkPush[];
  if (!storeEnabled) docs = [...memCol(memKey(ws, clientId, campaignId, 'nuelink')).values()];
  else docs = (await fsdb().collection(`${root(ws)}/clients/${clientId}/campaigns/${campaignId}/nuelink`).get()).docs.map((d) => d.data() as NuelinkPush);
  return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
```

The path `users/<ws>/clients/<id>/campaigns/<cid>/nuelink/<pushId>` is eight components: a document. The parity check reads it.

`web/app/api/clients/[id]/route.ts` line 19: `const allowed = ['name', 'voice', 'settings', 'brandKit', 'nuelink'] as const;`

- [ ] **Step 4: Run the db suite, then everything**

Run: `node test/db.test.js` Expected: PASS (both `memory` and `db`, and the parity block).
Run: `cd web && MOCK_CLAUDE=1 npm run build && cd .. && npm test` Expected: all ok.

- [ ] **Step 5: Commit**

```bash
git add web/server/types.ts web/server/db.ts "web/app/api/clients/[id]/route.ts" test/db.test.js
git commit -m "Store the Nuelink mapping on the client and each push under the campaign" -m "A post goes to every channel in its Nuelink collection, so the mapping is per channel and belongs to the client. Pushes are recorded so sending a month twice does not post it twice."
```

---

### Task 5: The card rasteriser and the Nuelink lookup route

**Files:**
- Create: `web/server/cards.ts`, `web/app/api/nuelink/route.ts`
- Modify: `web/package.json` (dependency), `web/next.config.mjs` (or `.js`; check the extension) `serverExternalPackages`
- Test: `test/nuelink.test.js` (part two starts here)

**Interfaces:**
- Produces:
  - `renderCardPng(graphic, brandKit, variant, logoDataUrl: string | null): Buffer` (PNG, 1080 square)
  - `GET /api/nuelink` -> `{ configured: boolean, me?, brands?: [], error?: string }`; `?brand=<id>` adds `collections`, `channels`.

- [ ] **Step 1: Install resvg**

```bash
cd web && npm install @resvg/resvg-js@^2.6.2 && cd ..
```

Add `'@resvg/resvg-js'` to `serverExternalPackages` in `web/next.config.*` (it is a native module; bundling it breaks it).

- [ ] **Step 2: Failing test for the route**

Append to `test/nuelink.test.js`, as a second async block after the first (the first block's `finally` closes the fake, so start a new one):

```js
// ---- the routes, against a running app in mock mode ------------------------------
const { startNext } = require('./helpers/next-server');
const path = require('path');
const { spawn } = require('child_process');

(async () => {
  const fake = startFakeNuelink(8097);
  const env = { ...process.env, MOCK_CLAUDE: '1', MOCK_AUTH: '1', PORT: '3227', NUELINK_API_KEY: 'test-key', NUELINK_BASE_URL: 'http://localhost:8097/api/public/v1' };
  const server = startNext(3227, env);
  const site = spawn('python3', ['-m', 'http.server', '8096'], { cwd: path.join(__dirname, 'fixture-site'), stdio: 'ignore' });
  const stop = () => { server.kill(); site.kill(); fake.close(); };
  process.on('exit', stop);
  const base = 'http://localhost:3227';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const api = async (p, opts = {}) => { const res = await fetch(base + p, opts); return { status: res.status, data: await res.json().catch(() => null) }; };
  const post = (p, body) => api(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const patch = (p, body) => api(p, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(base + '/api/health'); if (r.ok) break; } catch {} await wait(500); }

    const look = await api('/api/nuelink');
    assert.equal(look.status, 200);
    assert.equal(look.data.configured, true);
    assert.equal(look.data.brands[0].id, 35946, 'brands come back');
    const deep = await api('/api/nuelink?brand=35946');
    assert.equal(deep.data.collections.length, 4);
    assert.ok(deep.data.channels.length >= 3);
    console.log('  nuelink lookup ok');

    console.log('nuelink route tests: ok');
  } finally {
    stop();
  }
})().catch((e) => { console.error('nuelink route tests FAILED', e); process.exit(1); });
```

Because the first block calls `process.exit` only on failure and both blocks start immediately, move the first block's body into `async function clientTests()` and the second into `async function routeTests()`, and run `clientTests().then(routeTests).catch(...)` at the bottom so they are sequential. Do that now rather than later.

Run: `cd web && MOCK_CLAUDE=1 npm run build && cd .. && node test/nuelink.test.js`. Expected: FAIL, `/api/nuelink` is 404.

- [ ] **Step 3: The route**

`web/app/api/nuelink/route.ts`:

```ts
import { guarded } from '@/server/respond';

const nuelink = require('@core/nuelink');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What Nuelink knows about this account, for the client page's mapping
 * pickers. Read-only. With ?brand=<id>, the brand's collections and channels
 * as well, so the picker can warn when a collection posts to more channels
 * than the one being mapped.
 */
export async function GET(req: Request) {
  return guarded(async () => {
    if (!nuelink.available()) return { configured: false };
    const url = new URL(req.url);
    const [me, brands] = await Promise.all([nuelink.me(), nuelink.brands()]);
    if (me.error) return { configured: true, error: me.error };
    const out: any = { configured: true, me: me.data, brands: brands.data || [] };
    const brand = url.searchParams.get('brand');
    if (brand) {
      const [collections, channels] = await Promise.all([nuelink.collections(brand), nuelink.channels(brand)]);
      out.collections = collections.data || [];
      out.channels = channels.data || [];
      if (collections.error || channels.error) out.error = collections.error || channels.error;
    }
    return out;
  });
}
```

- [ ] **Step 4: The rasteriser**

`web/server/cards.ts`:

```ts
/**
 * A social card as a PNG, for anything that cannot take an SVG: Nuelink,
 * and every platform behind it.
 *
 * The browser does this with a canvas for the download button. The server
 * needs its own renderer for the push, and resvg is the smallest one that
 * draws embedded data-URL images, which is how the logo travels. Fonts come
 * from the system; the card's stack ends in Helvetica and Arial, and resvg
 * substitutes a sans-serif when neither exists.
 */
import { Resvg } from '@resvg/resvg-js';

const { renderGraphic } = require('@core/graphics');

export function renderCardPng(graphic: any, brandKit: any, variant: number, logoDataUrl: string | null): Buffer {
  const kit = { ...(brandKit || {}), assets: { ...(brandKit?.assets || {}), logo: logoDataUrl || undefined } };
  const svg: string = renderGraphic(graphic, kit, variant);
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 }, font: { loadSystemFonts: true } });
  return Buffer.from(r.render().asPng());
}
```

- [ ] **Step 5: Run the test**

Run: `cd web && MOCK_CLAUDE=1 npm run build && cd .. && node test/nuelink.test.js`
Expected: both `nuelink client tests: ok` and `nuelink route tests: ok`. `renderCardPng` is exercised in Task 6.

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/package-lock.json web/next.config.* web/server/cards.ts web/app/api/nuelink/route.ts test/nuelink.test.js
git commit -m "Nuelink lookup route and a server-side card renderer" -m "The client page needs brands, collections and channels to build the mapping, and the push needs a PNG of each card because Nuelink and the platforms behind it do not take SVG. resvg is the smallest renderer that draws the embedded logo."
```

---

### Task 6: The push

**Files:**
- Create: `web/server/nuelink.ts`, `web/app/api/clients/[id]/campaigns/[cid]/schedule/nuelink/route.ts`
- Test: `test/nuelink.test.js` (extend `routeTests`)

**Interfaces:**
- Consumes: `scheduleRows`, `messageOf` from `@core/schedule`; `nuelink` core; `renderCardPng`; `addNuelinkPush`, `listNuelinkPushes`, `getClient`, `currentOutputs`, `getCampaign`, `addLedger`; `getFile` from storage.
- Produces:
  ```ts
  export type PushOptions = { start: string; skipWeekends: boolean; publishMode: 'DRAFT' | 'SCHEDULE'; channels?: string[]; force?: boolean };
  pushCampaign(ws, clientId, campaignId, opts: PushOptions): Promise<NuelinkPush>   // throws bad() for caller mistakes
  ```
  `POST .../schedule/nuelink` body `{ start, weekends?: 'skip'|'keep', publishMode, channels?, force? }` -> `{ push }`.
  `GET .../schedule/nuelink` -> `{ pushes, sent: Array<{ day, channel }> }`.

- [ ] **Step 1: Failing tests**

In `routeTests`, after the lookup assertions, add:

```js
    // A client with a calendar, on the mock model.
    const created = await post('/api/clients', { url: 'http://localhost:8096' });
    const clientId = created.data.clientId;
    const camp = await post(`/api/clients/${clientId}/campaigns`, { brief: {
      productName: 'Ledgerline', productDescription: 'Reconciliation', targetAudience: 'Finance leads',
      objective: 'trial_signups', tone: 'direct', languages: ['en'], webResearch: false, landingUrl: 'https://example.com/ledgerline' } });
    const cid = camp.data.campaignId;
    for (const a of ['brief-reader', 'brand-analyst', 'strategist', 'copywriter', 'social-planner']) {
      const r = await post(`/api/clients/${clientId}/campaigns/${cid}/run/${a}`, { review: false });
      assert.equal(r.status, 200, `${a}: ${JSON.stringify(r.data)}`);
    }
    const pushPath = `/api/clients/${clientId}/campaigns/${cid}/schedule/nuelink`;

    // No mapping yet: refused with a sentence that says what to do.
    const unmapped = await post(pushPath, { start: '2026-09-07', publishMode: 'DRAFT' });
    assert.equal(unmapped.status, 409);
    assert.match(unmapped.data.error, /collection/i);

    // Map LinkedIn and X only; Instagram is left out on purpose.
    await patch(`/api/clients/${clientId}`, { nuelink: { brandId: 35946, collections: { linkedin: 201, x: 202 } } });

    fake.posts.length = 0; fake.requests.length = 0;
    const first = await post(pushPath, { start: '2026-09-07', publishMode: 'SCHEDULE' });
    assert.equal(first.status, 200, JSON.stringify(first.data));
    const results = first.data.push.results;
    assert.equal(results.length, 32, 'every post in the calendar is accounted for');
    const posted = results.filter((r) => r.status === 'posted');
    const skipped = results.filter((r) => r.status === 'skipped');
    assert.equal(posted.length, 24, '12 LinkedIn + 12 X posted');
    assert.equal(skipped.length, 8, '8 Instagram skipped');
    assert.match(skipped[0].error, /no Nuelink collection/i, 'the skip says why');
    assert.ok(posted.every((r) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r.scheduledAt)), 'scheduledAt in Y-m-d H:i:s');
    assert.equal(fake.posts.length, 24);
    assert.ok(fake.posts.every((p) => p.publishMode === 'SCHEDULE' && p.scheduledAt), 'mode and time reach Nuelink');
    assert.ok(fake.posts.some((p) => p.link === 'https://example.com/ledgerline'), 'the landing URL travels as link');
    const li = fake.posts.filter((p) => p.collectionId === 201);
    assert.equal(li.length, 12, 'LinkedIn posts went to the LinkedIn collection');
    assert.ok(li.some((p) => Array.isArray(p.media) && p.media.length === 1), 'LinkedIn posts with a card carry one media id');
    const uploads = fake.requests.filter((r) => r.path.endsWith('/media'));
    assert.ok(uploads.length > 0 && uploads.every((u) => u.files[0].mime === 'image/png' && u.files[0].bytes > 1000), 'cards uploaded as real PNGs');
    // 2026-09-07 is a Monday; day 6 is Saturday and must have moved to Monday the 14th.
    const day6 = posted.find((r) => r.day === 6);
    if (day6) assert.ok(day6.scheduledAt.startsWith('2026-09-14'), 'weekend posts move to the Monday after');
    console.log('  push:', posted.length, 'posted,', skipped.length, 'skipped');

    // The ledger records that the campaign left the building.
    const ledger = await api('/api/ledger');
    assert.ok(ledger.data.entries.some((e) => e.agent === 'nuelink' && e.campaignId === cid && e.costEur === 0), 'push in the ledger at zero cost');

    // Pushing again skips what went.
    fake.posts.length = 0;
    const again = await post(pushPath, { start: '2026-09-07', publishMode: 'SCHEDULE' });
    assert.equal(again.data.push.results.filter((r) => r.status === 'posted').length, 0, 'nothing re-posted');
    assert.equal(again.data.push.results.filter((r) => r.status === 'skipped' && /already/i.test(r.error)).length, 24);
    assert.equal(fake.posts.length, 0);

    // Unless forced.
    const forced = await post(pushPath, { start: '2026-09-07', publishMode: 'DRAFT', force: true, channels: ['x'] });
    assert.equal(forced.data.push.results.filter((r) => r.status === 'posted').length, 12, 'force re-sends the chosen channel');
    assert.ok(fake.posts.every((p) => p.publishMode === 'DRAFT' && !p.scheduledAt), 'draft mode sends no time');

    // One failure does not stop the others.
    await patch(`/api/clients/${clientId}`, { nuelink: { brandId: 35946, collections: { linkedin: 201, x: 202, instagram: 203 } } });
    fake.failOnce({ status: 422, message: 'Caption too long for Instagram' });
    const partial = await post(pushPath, { start: '2026-09-07', publishMode: 'DRAFT', channels: ['instagram'] });
    const ig = partial.data.push.results.filter((r) => r.channel === 'instagram');
    assert.equal(ig.filter((r) => r.status === 'failed').length, 1, 'the one failure is recorded');
    assert.equal(ig.filter((r) => r.status === 'posted').length, 7, 'and the rest went');

    const history = await api(pushPath);
    assert.equal(history.data.pushes.length, 4, 'every attempt is listed');
    assert.ok(history.data.sent.length >= 31, 'sent is the union of posted');

    // Caller mistakes are 400s with a sentence.
    const noDate = await post(pushPath, { publishMode: 'SCHEDULE' });
    assert.equal(noDate.status, 400);
    const badMode = await post(pushPath, { start: '2026-09-07', publishMode: 'IMMEDIATE' });
    assert.equal(badMode.status, 400, 'only DRAFT and SCHEDULE are offered');
```

The `failOnce` will hit the first Instagram request, which is the media upload rather than the post. Make the fake's `failOnce` accept `{ when: 'post' }` to only fail on a create-post request: in the fake, replace `if (state.failNext)` with `if (state.failNext && (!state.failNext.when || (state.failNext.when === 'post' && /\/posts$/.test(req.url))))`. Use `fake.failOnce({ status: 422, message: '...', when: 'post' })` in the test.

Run: `node test/nuelink.test.js`. Expected: FAIL, push route 404.

- [ ] **Step 2: The orchestration module**

`web/server/nuelink.ts`:

```ts
/**
 * Sending a planned month to Nuelink.
 *
 * Built on core/schedule.js, which already turns day numbers into dated rows
 * for the CSV exports: pushing to an API changes where the rows go, not what
 * a row is. This module adds the three things an API needs that a CSV does
 * not: which collection each channel maps to, a PNG of the card, and a
 * record of what was sent so a second push does not post the month twice.
 *
 * One post failing does not stop the others. Every post gets a result row,
 * posted, skipped or failed, with the reason, and the person reads the table.
 */
import { bad } from './respond';
import { getClient, getCampaign, currentOutputs, addNuelinkPush, listNuelinkPushes, addLedger } from './db';
import { getFile } from './storage';
import { renderCardPng } from './cards';
import type { NuelinkPush, NuelinkResult } from './types';

const nuelink = require('@core/nuelink');
const { scheduleRows, messageOf } = require('@core/schedule');

export type PushOptions = {
  start: string;
  skipWeekends: boolean;
  publishMode: 'DRAFT' | 'SCHEDULE';
  channels?: string[];
  force?: boolean;
};

/** Day-and-channel pairs that some earlier push posted. */
export async function alreadySent(ws: string, clientId: string, campaignId: string): Promise<Set<string>> {
  const pushes = await listNuelinkPushes(ws, clientId, campaignId);
  const sent = new Set<string>();
  for (const p of pushes) for (const r of p.results) if (r.status === 'posted') sent.add(`${r.day}-${r.channel}`);
  return sent;
}

export async function pushCampaign(ws: string, clientId: string, campaignId: string, opts: PushOptions): Promise<NuelinkPush> {
  if (!nuelink.available()) throw bad('Nuelink is not configured: set NUELINK_API_KEY on the server', 503);
  if (!['DRAFT', 'SCHEDULE'].includes(opts.publishMode)) throw bad('publishMode must be DRAFT or SCHEDULE');

  const [client, campaign, outputs] = await Promise.all([getClient(ws, clientId), getCampaign(ws, clientId, campaignId), currentOutputs(ws, clientId, campaignId)]);
  if (!client) throw bad('Client not found', 404);
  if (!campaign) throw bad('Campaign not found', 404);
  const social: any = outputs['social-planner']?.output;
  if (!social?.posts?.length) throw bad('There is no social calendar to send yet', 409);

  const mapping = client.nuelink;
  if (!mapping?.brandId || !Object.values(mapping.collections || {}).some(Boolean)) {
    throw bad('Choose a Nuelink brand and a collection per channel on the client page first', 409);
  }

  let rows: any[];
  try {
    rows = scheduleRows(social, { startDate: opts.start, skipWeekends: opts.skipWeekends, link: campaign.brief?.landingUrl || '' });
  } catch (err: any) {
    throw bad(err.message); // only a missing or unparseable start date
  }

  // The card's colour scheme rotates by its position among the posts with a
  // graphic, in day order, exactly as the planner's postProcess numbered them.
  const variantOf = new Map<string, number>();
  let g = 0;
  for (const p of [...social.posts].sort((a: any, b: any) => a.day - b.day)) {
    if (p.graphic && p.graphic.template) variantOf.set(`${p.day}-${p.channel}`, g++);
  }
  const postOf = new Map<string, any>(social.posts.map((p: any) => [`${p.day}-${p.channel}`, p]));

  let logo: string | null = null;
  if (client.brandKit?.logoRef) {
    const f = await getFile(ws, client.brandKit.logoRef);
    if (f) logo = `data:${f.mime};base64,${f.buffer.toString('base64')}`;
  }

  const sent = opts.force ? new Set<string>() : await alreadySent(ws, clientId, campaignId);
  const wanted = opts.channels?.length ? new Set(opts.channels) : null;
  const results: NuelinkResult[] = [];

  for (const row of rows) {
    const key = `${row.day}-${row.channel}`;
    const scheduledAt = opts.publishMode === 'SCHEDULE' ? nuelink.formatScheduledAt(row.when) : null;
    const result: NuelinkResult = { day: row.day, channel: row.channel, scheduledAt, status: 'skipped', nuelinkPostId: null, mediaId: null, error: null };
    results.push(result);

    if (wanted && !wanted.has(row.channel)) { result.error = 'channel not selected'; continue; }
    if (sent.has(key)) { result.error = 'already sent in an earlier push'; continue; }
    const collectionId = (mapping.collections as any)[row.channel];
    if (!collectionId) { result.error = `no Nuelink collection mapped for ${row.channel}`; continue; }

    const post = postOf.get(key);
    const body: any = { caption: messageOf(row), publishMode: opts.publishMode };
    if (scheduledAt) body.scheduledAt = scheduledAt;
    if (row.link) body.link = row.link;

    if (post?.graphic?.template) {
      let png: Buffer;
      try {
        png = renderCardPng(post.graphic, client.brandKit, variantOf.get(key) || 0, logo);
      } catch (err: any) {
        result.status = 'failed'; result.error = `card could not be rendered: ${err.message}`; continue;
      }
      const up = await nuelink.uploadMedia(mapping.brandId, { buffer: png, mime: 'image/png', filename: `day${row.day}-${row.channel}.png` });
      if (up.error) { result.status = 'failed'; result.error = `upload: ${up.error}`; continue; }
      result.mediaId = up.data.id;
      body.media = [{ id: up.data.id }];
      if (post.graphic.headline) body.alt = post.graphic.headline;
    }

    const created = await nuelink.createPost(mapping.brandId, collectionId, body);
    if (created.error) { result.status = 'failed'; result.error = created.error; continue; }
    result.status = 'posted';
    result.nuelinkPostId = String(created.data.id);
  }

  const push = await addNuelinkPush(ws, clientId, campaignId, {
    startDate: opts.start, publishMode: opts.publishMode, skipWeekends: opts.skipWeekends, results,
  });
  await addLedger(ws, { clientId, campaignId, agent: 'nuelink', model: 'nuelink', input: 0, output: 0, webSearches: 0, images: 0, costEur: 0 });
  return push;
}
```

- [ ] **Step 3: The route**

`web/app/api/clients/[id]/campaigns/[cid]/schedule/nuelink/route.ts`:

```ts
import { guarded, bad } from '@/server/respond';
import { pushCampaign, alreadySent } from '@/server/nuelink';
import { listNuelinkPushes } from '@/server/db';

export const runtime = 'nodejs';
export const maxDuration = 800;

/** Every push so far, and the union of what they posted. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async (session) => {
    const pushes = await listNuelinkPushes(session.workspaceId, id, cid);
    const sent = [...await alreadySent(session.workspaceId, id, cid)].map((k) => { const [day, channel] = k.split('-'); return { day: Number(day), channel }; });
    return { pushes, sent };
  });
}

/**
 * Send the month to Nuelink. The start date is asked for, as it is for the
 * CSVs, because the plan holds day numbers. Draft or Schedule only:
 * IMMEDIATE would post before anyone had looked, and QUEUE hands the timing
 * to Nuelink's own slots, which the plan already decided.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async (session) => {
    const body = await req.json().catch(() => ({}));
    if (!body.start) throw bad('start is required, as YYYY-MM-DD: the date day 1 falls on');
    const push = await pushCampaign(session.workspaceId, id, cid, {
      start: String(body.start),
      skipWeekends: body.weekends !== 'keep',
      publishMode: body.publishMode,
      channels: Array.isArray(body.channels) ? body.channels.map(String) : undefined,
      force: Boolean(body.force),
    });
    return { push };
  });
}
```

- [ ] **Step 4: Run the test, then everything**

Run: `cd web && MOCK_CLAUDE=1 npm run build && cd .. && node test/nuelink.test.js`
Expected: `nuelink route tests: ok`. If the "cards uploaded as real PNGs" assertion fails with a tiny byte count, resvg found no font; check `loadSystemFonts: true` is set and that the SVG's `font-family` attribute is present.

Run: `npm test`. Expected: all ok.

- [ ] **Step 5: Commit**

```bash
git add web/server/nuelink.ts "web/app/api/clients/[id]/campaigns/[cid]/schedule/nuelink/route.ts" test/nuelink.test.js test/helpers/fake-nuelink.js
git commit -m "Push the social calendar to Nuelink with the cards attached" -m "Built on the schedule rows the CSV exports already use, so the dates are the same a person saw. Each post is uploaded and created on its own; a failure is a row in the result, not an abort. A second push skips what an earlier one posted unless forced, and the ledger shows the campaign left the building."
```

---

### Task 7: The UI: mapping on the client page, sending from the Social tab

**Files:**
- Create: `web/components/NuelinkCard.tsx`, `web/components/NuelinkPush.tsx`
- Modify: `web/app/clients/[id]/library.tsx` (add a section before Campaigns), `web/components/panels.tsx` (SocialPanel)
- Test: `test/pages.test.js`

**Interfaces:**
- Consumes: `GET /api/nuelink[?brand=]`, `PATCH /api/clients/[id]` with `{ nuelink }`, `GET|POST .../schedule/nuelink`.

- [ ] **Step 1: Failing page assertions**

In `test/pages.test.js`, after the `wb2` assertions add:

```js
  assert.ok(wb2.body.includes('Send to Nuelink'), 'the Social tab offers the push');
  const lib = await html(`/clients/${clientId}`);
  assert.ok(lib.body.includes('Nuelink'), 'the client page has the Nuelink mapping section');
```

`wb2` renders the workbench server-side and the Social tab is client-side. Check whether `wb2.body` contains `Hootsuite CSV` already; if it does not (the tab is not the default), assert on the campaign page payload instead: `assert.ok(wb2.body.includes('nuelink') || true)` is not acceptable. Instead render the panel text from the section's heading in the workbench's initial HTML: add the `Send to Nuelink` heading to the `NuelinkPush` component and set the pages test to fetch `/api/clients/${clientId}/campaigns/${cid}/schedule/nuelink` and assert `{ pushes: [], sent: [] }` when the tab is not server-rendered. Use whichever the HTML supports; the API assertion is always valid:

```js
  const hist = await fetch(`${base}/api/clients/${clientId}/campaigns/${cid}/schedule/nuelink`).then((r) => r.json());
  assert.deepEqual(hist, { pushes: [], sent: [] }, 'no pushes yet');
```

Run: `node test/pages.test.js`. Expected: FAIL on the client page assertion.

- [ ] **Step 2: The mapping card**

`web/components/NuelinkCard.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

const CHANNELS: Array<['linkedin' | 'x' | 'instagram', string, string]> = [
  ['linkedin', 'LinkedIn', 'LinkedIn'], ['x', 'X', 'X'], ['instagram', 'Instagram', 'Instagram'],
];

type Collection = { id: number; title: string; channels: Array<{ type: string; name: string }> };

/**
 * Which Nuelink brand this client is, and which collection each channel
 * posts through. A Nuelink post goes to every channel in its collection, so
 * a collection that carries more than the channel being mapped is flagged:
 * the planner writes different copy per channel and the owner needs one
 * collection per channel to keep it that way.
 */
export function NuelinkCard({ clientId, initial }: { clientId: string; initial: any }) {
  const [state, setState] = useState<any>(null);
  const [brandId, setBrandId] = useState<number | null>(initial?.brandId ?? null);
  const [cols, setCols] = useState<Collection[]>([]);
  const [map, setMap] = useState<Record<string, number | null>>(initial?.collections || {});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => { fetch('/api/nuelink').then((r) => r.json()).then(setState).catch(() => setState({ configured: false })); }, []);
  useEffect(() => {
    if (!brandId) { setCols([]); return; }
    fetch(`/api/nuelink?brand=${brandId}`).then((r) => r.json()).then((d) => setCols(d.collections || [])).catch(() => setCols([]));
  }, [brandId]);

  async function save(next: { brandId: number | null; collections: Record<string, number | null> }) {
    const res = await fetch(`/api/clients/${clientId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nuelink: next }) });
    setSaved(res.ok ? 'Saved' : 'Could not save');
    setTimeout(() => setSaved(null), 1500);
  }

  if (!state) return <p className="muted">Checking Nuelink…</p>;
  if (!state.configured) return <p className="muted">Nuelink is not connected: set NUELINK_API_KEY on the server to send calendars from the Social tab.</p>;
  if (state.error) return <p className="problems">Nuelink answered with an error: {state.error}</p>;

  const others = (c: Collection, type: string) => c.channels.filter((ch) => ch.type !== type).map((ch) => ch.type);

  return (
    <div className="nuelink-card">
      <label className="field" htmlFor="nl-brand"><span>Brand</span>
        <select id="nl-brand" value={brandId ?? ''} onChange={(e) => { const b = e.target.value ? Number(e.target.value) : null; setBrandId(b); const collections = {}; setMap(collections); save({ brandId: b, collections }); }}>
          <option value="">Choose a brand</option>
          {(state.brands || []).map((b: any) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </select>
      </label>
      {brandId ? CHANNELS.map(([key, label, type]) => {
        const chosen = cols.find((c) => c.id === map[key]);
        const extra = chosen ? others(chosen, type) : [];
        return (
          <div key={key}>
            <label className="field" htmlFor={`nl-${key}`}><span>{label} posts go to</span>
              <select id={`nl-${key}`} value={map[key] ?? ''} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; const next = { ...map, [key]: v }; setMap(next); save({ brandId, collections: next }); }}>
                <option value="">Not sent</option>
                {cols.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
            {extra.length ? <p className="problems">This collection also posts to {extra.join(', ')}. Make a collection in Nuelink that holds only the {label} channel.</p> : null}
          </div>
        );
      }) : null}
      {saved ? <span className="muted">{saved}</span> : null}
    </div>
  );
}
```

In `web/app/clients/[id]/library.tsx`, import `{ NuelinkCard }` and insert before the Campaigns section:

```tsx
      <section className="block">
        <h2 className="block-title">Nuelink <span className="block-hint">where each channel's posts are sent</span></h2>
        <NuelinkCard clientId={client.clientId} initial={client.nuelink} />
      </section>
```

- [ ] **Step 3: The push block**

`web/components/NuelinkPush.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

type Result = { day: number; channel: string; scheduledAt: string | null; status: string; error: string | null };

/**
 * Sending the month to Nuelink from the Social tab. The date and the mode
 * are the only decisions: which collection a channel goes to was made on the
 * client page, and what each post says was made by the planner and edited
 * here. The result is a table, one row per post, because a push of thirty
 * posts with two failures is a normal outcome and the person needs to see
 * which two.
 */
export function NuelinkPush({ clientId, campaignId, posts, start }: { clientId: string; campaignId: string; posts: any[]; start: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'DRAFT' | 'SCHEDULE'>('DRAFT');
  const [weekends, setWeekends] = useState<'skip' | 'keep'>('skip');
  const [force, setForce] = useState(false);
  const channels = [...new Set(posts.map((p) => p.channel))] as string[];
  const [chosen, setChosen] = useState<Set<string>>(new Set(channels));
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/clients/${clientId}/campaigns/${campaignId}/schedule/nuelink`;

  useEffect(() => {
    fetch('/api/nuelink').then((r) => r.json()).then((d) => setConfigured(Boolean(d.configured))).catch(() => setConfigured(false));
    fetch(base).then((r) => r.json()).then((d) => setSent(new Set((d.sent || []).map((s: any) => `${s.day}-${s.channel}`)))).catch(() => {});
  }, [base]);

  const willSend = posts.filter((p) => chosen.has(p.channel) && (force || !sent.has(`${p.day}-${p.channel}`))).length;
  const already = posts.filter((p) => chosen.has(p.channel) && sent.has(`${p.day}-${p.channel}`)).length;

  async function send() {
    setBusy(true); setError(null); setResults(null);
    try {
      const res = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ start, publishMode: mode, weekends, channels: [...chosen], force }) });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'The push failed'); return; }
      setResults(d.push.results);
      setSent((s) => { const n = new Set(s); for (const r of d.push.results) if (r.status === 'posted') n.add(`${r.day}-${r.channel}`); return n; });
    } finally { setBusy(false); }
  }

  return (
    <div className="social-bar nuelink-push">
      <strong>Send to Nuelink</strong>
      {configured === false ? <span className="muted">Nuelink is not connected: set NUELINK_API_KEY on the server.</span> : (
        <>
          {channels.map((c) => (
            <label key={c} className="check"><input type="checkbox" checked={chosen.has(c)} onChange={(e) => setChosen((s) => { const n = new Set(s); e.target.checked ? n.add(c) : n.delete(c); return n; })} /> {c}</label>
          ))}
          <select value={mode} onChange={(e) => setMode(e.target.value as any)} aria-label="Publish mode">
            <option value="DRAFT">As drafts</option>
            <option value="SCHEDULE">Scheduled from the start date</option>
          </select>
          <label className="check"><input type="checkbox" checked={weekends === 'keep'} onChange={(e) => setWeekends(e.target.checked ? 'keep' : 'skip')} /> keep weekend days</label>
          <label className="check"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> re-send posts already sent</label>
          <span className="muted">{willSend} to send{already ? `, ${already} already sent` : ''}</span>
          <button type="button" className="btn-secondary" onClick={send} disabled={busy || willSend === 0}>{busy ? 'Sending…' : `Send ${willSend} to Nuelink`}</button>
          {error ? <span className="problems">{error}</span> : null}
          {results ? (
            <table className="nuelink-results">
              <thead><tr><th>Day</th><th>Channel</th><th>When</th><th>Result</th></tr></thead>
              <tbody>{results.map((r) => (
                <tr key={`${r.day}-${r.channel}`} className={r.status}><td>{r.day}</td><td>{r.channel}</td><td>{r.scheduledAt || 'draft'}</td><td>{r.status}{r.error ? `: ${r.error}` : ''}</td></tr>
              ))}</tbody>
            </table>
          ) : null}
        </>
      )}
    </div>
  );
}
```

In `SocialPanel` (`panels.tsx`), import `{ NuelinkPush }` and render it after the schedule bar (the `<div className="social-bar schedule-bar">` block):

```tsx
      {clientId && campaignId ? <NuelinkPush clientId={clientId} campaignId={campaignId} posts={social.posts} start={start} /> : null}
```

Add to `web/app/globals.css`:
```css
.nuelink-push { flex-wrap: wrap; gap: 10px; }
.nuelink-results { width: 100%; font-size: 13px; margin-top: 8px; border-collapse: collapse; }
.nuelink-results td, .nuelink-results th { padding: 4px 8px; border-bottom: 1px solid var(--line, #e5e7eb); text-align: left; }
.nuelink-results tr.failed td { color: #9e1d0a; }
.nuelink-results tr.skipped td { color: #5b6470; }
```

- [ ] **Step 4: Build, run pages and the full suite**

Run: `cd web && MOCK_CLAUDE=1 npm run build && cd .. && node test/pages.test.js && npm test`
Expected: PASS. The build typechecks both components.

- [ ] **Step 5: Try it by hand once**

Run `npm run local`, open a client, map the brand and the three collections, open a campaign's Social tab, send as drafts. Confirm the drafts appear in Nuelink with their cards. Record what you saw in the commit message. If the collections do not exist yet in Nuelink, say so in the commit and leave the manual check to the owner.

- [ ] **Step 6: Commit**

```bash
git add web/components/NuelinkCard.tsx web/components/NuelinkPush.tsx "web/app/clients/[id]/library.tsx" web/components/panels.tsx web/app/globals.css test/pages.test.js
git commit -m "Nuelink in the UI: mapping on the client, sending from the Social tab" -m "The client page maps a brand and one collection per channel, and warns when a collection would fan a channel's copy out to others. The Social tab replaces the image bar with the push: date, draft or schedule, which channels, and a row per post afterwards."
```

---

### Task 8: Claude Code tools in the MCP server

**Files:**
- Modify: `mcp/server.js`, `mcp/README.md`, `test/mcp.test.js`
- Create: `.mcp.json`

**Interfaces:**
- Produces new tools: `list_clients`, `create_client { url }`, `list_campaigns { clientId }`, `create_campaign { clientId, brief }`, `run_agent { clientId, campaignId, agent }`, `get_output { clientId, campaignId, agent }`, `nuelink_setup { clientId, brandId?, collections? }`, `push_to_nuelink { clientId, campaignId, start, publishMode, channels?, force? }`, `cost { campaignId }`.
- Env: `CF_URL`, default `http://localhost:3000`.

- [ ] **Step 1: Failing tests**

In `test/mcp.test.js` replace the names assertion with:

```js
  assert.deepEqual(names, ['check_copy', 'cost', 'create_campaign', 'create_client', 'get_output', 'list_campaigns', 'list_clients', 'nuelink_setup', 'push_to_nuelink', 'run_agent', 'scan_site'], 'eleven tools, named as documented');
```

and add before the final `console.log`:

```js
  // The app tools talk to a running instance. With none, they say so.
  process.env.CF_URL = 'http://localhost:1';
  const down = await callTool('list_clients', {});
  assert.match(down, /npm run local/, 'a dead app says how to start it');

  // Against a running instance they round-trip. Same pattern as api.test.js.
  const { startNext } = require('./helpers/next-server');
  const server = startNext(3229, { ...process.env, MOCK_CLAUDE: '1', MOCK_AUTH: '1', PORT: '3229' });
  process.on('exit', () => server.kill());
  process.env.CF_URL = 'http://localhost:3229';
  for (let i = 0; i < 40; i++) { try { const r = await fetch('http://localhost:3229/api/health'); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  const none = await callTool('list_clients', {});
  assert.match(none, /No clients yet/, 'an empty library reads as a sentence');
  const made = await callTool('create_client', { name: 'Acme' });
  assert.match(made, /Acme/, 'a client can be created by name');
  const id = /id: ([0-9a-f-]{36})/.exec(made)[1];
  const camp = await callTool('create_campaign', { clientId: id, brief: { productName: 'Widget', productDescription: 'A widget', targetAudience: 'Buyers', objective: 'trial_signups', tone: 'direct', languages: ['en'], webResearch: false } });
  const cid = /id: ([0-9a-f-]{36})/.exec(camp)[1];
  const ran = await callTool('run_agent', { clientId: id, campaignId: cid, agent: 'brief-reader' });
  assert.match(ran, /brief-reader/, 'a run reports its agent');
  const out = await callTool('get_output', { clientId: id, campaignId: cid, agent: 'brief-reader' });
  assert.ok(out.length > 50, 'the output is returned as text');
  const spend = await callTool('cost', { campaignId: cid });
  assert.match(spend, /EUR/, 'cost is a money line');
  server.kill();
```

Run: `node test/mcp.test.js`. Expected: FAIL on the names assertion.

- [ ] **Step 2: The tools**

In `mcp/server.js`, after the two existing tool definitions in `TOOLS`, add:

```js
  // ---- the running app -------------------------------------------------------
  // These call Campaign Forge over HTTP at CF_URL (default localhost:3000),
  // which is the instance `npm run local` starts. They send no cookie, so
  // they work against a MOCK_AUTH=1 instance and not the hosted one.
  {
    name: 'list_clients',
    description: 'List the clients in the running Campaign Forge, with their ids. Needs the app started with `npm run local`.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_client',
    description: 'Create a client, from a website URL (scans it for brand kit and sources) or from a name alone.',
    inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'The client website. Runs the site scan.' }, name: { type: 'string', description: 'A name, when there is no site to scan.' } }, required: [] },
  },
  {
    name: 'list_campaigns',
    description: 'List a client\'s campaigns with ids, status and brief summary.',
    inputSchema: { type: 'object', properties: { clientId: { type: 'string' } }, required: ['clientId'] },
  },
  {
    name: 'create_campaign',
    description: 'Create a campaign from a brief. Brief fields: productName, productDescription, targetAudience, objective (trial_signups, demo_requests, purchases, leads, awareness), tone, languages (["en"] or ["en","pt"]), landingUrl, webResearch (boolean), startDate.',
    inputSchema: { type: 'object', properties: { clientId: { type: 'string' }, brief: { type: 'object' } }, required: ['clientId', 'brief'] },
  },
  {
    name: 'run_agent',
    description: 'Run one agent pass on a campaign and wait for it. Order: brief-reader, brand-analyst, customer-researcher, strategist, copywriter, social-planner, ops-architect, localiser, landing-writer, analyst. A pass takes one to four minutes and costs money on a live key. Returns the summary, the flags and the cost.',
    inputSchema: { type: 'object', properties: { clientId: { type: 'string' }, campaignId: { type: 'string' }, agent: { type: 'string' } }, required: ['clientId', 'campaignId', 'agent'] },
  },
  {
    name: 'get_output',
    description: 'The current output of one agent on a campaign, as JSON text.',
    inputSchema: { type: 'object', properties: { clientId: { type: 'string' }, campaignId: { type: 'string' }, agent: { type: 'string' } }, required: ['clientId', 'campaignId', 'agent'] },
  },
  {
    name: 'nuelink_setup',
    description: 'Without brandId: list the Nuelink brands, and for a client its current mapping. With brandId and collections ({ linkedin, x, instagram } collection ids): save the mapping on the client.',
    inputSchema: { type: 'object', properties: { clientId: { type: 'string' }, brandId: { type: 'number' }, collections: { type: 'object' } }, required: ['clientId'] },
  },
  {
    name: 'push_to_nuelink',
    description: 'Send a campaign\'s social calendar to Nuelink. start is the date day 1 falls on (YYYY-MM-DD). publishMode is DRAFT or SCHEDULE. Returns a row per post.',
    inputSchema: { type: 'object', properties: { clientId: { type: 'string' }, campaignId: { type: 'string' }, start: { type: 'string' }, publishMode: { type: 'string', enum: ['DRAFT', 'SCHEDULE'] }, channels: { type: 'array', items: { type: 'string' } }, force: { type: 'boolean' } }, required: ['clientId', 'campaignId', 'start', 'publishMode'] },
  },
  {
    name: 'cost',
    description: 'What a campaign has cost so far, from the ledger, in EUR.',
    inputSchema: { type: 'object', properties: { campaignId: { type: 'string' } }, required: ['campaignId'] },
  },
```

Add the HTTP helper and the handlers above `callTool`:

```js
const CF_URL = () => (process.env.CF_URL || 'http://localhost:3000').replace(/\/$/, '');

/** One call to the running app. A dead app is a sentence, not a stack trace. */
async function app(method, path, body) {
  let res;
  try {
    res = await fetch(CF_URL() + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch {
    return { error: `Campaign Forge is not running at ${CF_URL()}. Start it with \`npm run local\` in the repository, then try again.` };
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) return { error: `${CF_URL()} wants a sign-in. These tools work against the local instance (npm run local), not the hosted one.` };
  if (!res.ok) return { error: data.error || `HTTP ${res.status}` };
  return data;
}

const money = (n) => `EUR ${Number(n || 0).toFixed(2)}`;

async function appTool(name, a) {
  let r;
  switch (name) {
    case 'list_clients':
      r = await app('GET', '/api/clients');
      if (r.error) return r.error;
      if (!r.clients.length) return 'No clients yet. Use create_client with a website URL.';
      return r.clients.map((c) => `${c.name} (id: ${c.clientId})${c.domain ? ' ' + c.domain : ''}`).join('\n');
    case 'create_client':
      r = await app('POST', '/api/clients', a.url ? { url: a.url } : { name: a.name });
      if (r.error) return r.error;
      { const c = r.client || r; return `Created ${c.name} (id: ${c.clientId}). ${r.sources ? r.sources.length + ' sources from the site.' : ''}`.trim(); }
    case 'list_campaigns':
      r = await app('GET', `/api/clients/${a.clientId}/campaigns`);
      if (r.error) return r.error;
      if (!r.campaigns.length) return 'No campaigns yet. Use create_campaign with a brief.';
      return r.campaigns.map((c) => `${c.brief?.productName || '(untitled)'} (id: ${c.campaignId}) ${c.status}, ${Object.keys(c.current || {}).length} passes done`).join('\n');
    case 'create_campaign':
      r = await app('POST', `/api/clients/${a.clientId}/campaigns`, { brief: a.brief });
      if (r.error) return r.error;
      return `Created campaign (id: ${r.campaignId}). Run brief-reader first.`;
    case 'run_agent':
      r = await app('POST', `/api/clients/${a.clientId}/campaigns/${a.campaignId}/run/${a.agent}`, { review: false });
      if (r.error) return r.error;
      if (r.skipped) return `${a.agent} skipped: ${r.reason}`;
      return [`${a.agent} ${r.complete ? 'finished' : 'did not finish'} in ${Math.round((r.usage?.ms || 0) / 1000)}s, ${money(r.usage?.costEur)}.`,
        r.problems?.length ? `Flags:\n- ${r.problems.join('\n- ')}` : 'No flags.',
        r.warning ? `Ceiling: ${r.warning}` : ''].filter(Boolean).join('\n');
    case 'get_output':
      r = await app('GET', `/api/clients/${a.clientId}/campaigns/${a.campaignId}`);
      if (r.error) return r.error;
      if (!r.outputs?.[a.agent]) return `${a.agent} has no output yet on this campaign.`;
      return JSON.stringify(r.outputs[a.agent], null, 1);
    case 'nuelink_setup':
      if (a.brandId) {
        r = await app('PATCH', `/api/clients/${a.clientId}`, { nuelink: { brandId: a.brandId, collections: a.collections || {} } });
        return r.error || `Saved: brand ${a.brandId}, collections ${JSON.stringify(a.collections || {})}.`;
      }
      { const [nl, cl] = await Promise.all([app('GET', '/api/nuelink'), app('GET', `/api/clients/${a.clientId}`)]);
        if (nl.error) return nl.error;
        if (!nl.configured) return 'Nuelink is not configured: set NUELINK_API_KEY in web/.env.';
        const lines = ['Brands: ' + (nl.brands || []).map((b) => `${b.title} (id ${b.id})`).join(', ')];
        const m = cl.client?.nuelink;
        lines.push(m?.brandId ? `This client: brand ${m.brandId}, collections ${JSON.stringify(m.collections)}` : 'This client has no mapping yet.');
        if (m?.brandId) { const d = await app('GET', `/api/nuelink?brand=${m.brandId}`); if (d.collections) lines.push('Collections: ' + d.collections.map((c) => `${c.title} (id ${c.id}: ${c.channels.map((ch) => ch.type).join('+')})`).join(', ')); }
        return lines.join('\n'); }
    case 'push_to_nuelink':
      r = await app('POST', `/api/clients/${a.clientId}/campaigns/${a.campaignId}/schedule/nuelink`, { start: a.start, publishMode: a.publishMode, channels: a.channels, force: a.force });
      if (r.error) return r.error;
      { const rs = r.push.results; const n = (s) => rs.filter((x) => x.status === s).length;
        return [`${n('posted')} posted, ${n('skipped')} skipped, ${n('failed')} failed.`, ...rs.filter((x) => x.status !== 'posted').map((x) => `- day ${x.day} ${x.channel}: ${x.status}${x.error ? ', ' + x.error : ''}`)].join('\n'); }
    case 'cost':
      r = await app('GET', '/api/ledger');
      if (r.error) return r.error;
      { const rows = r.entries.filter((e) => e.campaignId === a.campaignId); const total = rows.reduce((s, e) => s + (e.costEur || 0), 0);
        return `${money(total)} across ${rows.length} calls.` + (rows.length ? '\n' + rows.map((e) => `- ${e.agent}: ${money(e.costEur)}`).join('\n') : ''); }
    default:
      return null;
  }
}
```

In `callTool`, before `throw new Error(...)`:
```js
  const viaApp = await appTool(name, args);
  if (viaApp !== null) return viaApp;
```

Check `GET /api/clients/[id]/campaigns` returns `{ campaigns }` and `POST /api/clients` with `{ name }` returns `{ client }` (it does, line 26); adapt the field names in `appTool` if the routes differ.

- [ ] **Step 3: `.mcp.json` and README**

`.mcp.json` at the repo root:
```json
{
  "mcpServers": {
    "campaign-forge": {
      "command": "node",
      "args": ["mcp/server.js"],
      "env": { "CF_URL": "http://localhost:3000" }
    }
  }
}
```

`mcp/README.md`: change the opening to say there are two kinds of tool, the offline checks and the app tools; list the nine app tools with one line each; replace the "What it does not do" section with:

```markdown
## The app tools

`list_clients`, `create_client`, `list_campaigns`, `create_campaign`,
`run_agent`, `get_output`, `nuelink_setup`, `push_to_nuelink` and `cost`
talk to Campaign Forge over HTTP at `CF_URL` (default
`http://localhost:3000`). Start the app first with `npm run local`; without
it every one of them answers with that instruction. They send no cookie, so
they cannot reach the hosted deployment, which is deliberate.

Claude Code picks the server up from `.mcp.json` at the repository root
when you open the folder. Run `cd mcp && npm install` once for the SDK.

A session looks like: "scan acme.com and make a client", "create a campaign
for their new product with this brief", "run the passes in order and tell me
the flags", "map the client to the IntelliNews brand with these collections",
"send the month to Nuelink as drafts from 7 September".
```

- [ ] **Step 4: Run the test and the suite**

Run: `node test/mcp.test.js` Expected: `mcp tests: ok`.
Run: `npm test` Expected: all ok.

- [ ] **Step 5: Commit**

```bash
git add mcp/server.js mcp/README.md test/mcp.test.js .mcp.json
git commit -m "MCP: drive the running app from Claude Code" -m "Nine tools over the local HTTP API: clients, campaigns, agent runs, outputs, Nuelink mapping and push, cost. They answer with plain sentences and tell you to start the app when it is not running. The two offline checks are unchanged."
```

---

### Task 9: Documentation

**Files:**
- Modify: `CLAUDE.md`, `HANDOVER.md`, `README.md`, `.env.example`, `docs/HUMAN-ACTIONS.md`, `docs/DATA-HANDLING.md`, `docs/DEPLOY.md`

- [ ] **Step 1: `.env.example`**

After the optional tools block add:
```
# Nuelink (social scheduling). Optional; without it the Social tab's
# "Send to Nuelink" says it is not connected. Server-side only.
NUELINK_API_KEY=
```

- [ ] **Step 2: `CLAUDE.md`**

- Commands: add `npm run local`.
- Layout: add `core/nuelink.js` next to the other core modules with "the Nuelink public API client"; add `server/nuelink.ts` and `server/cards.ts`; change the route count and add `nuelink` to the api list; add `NuelinkCard`, `NuelinkPush` to components.
- Roster/Traps: add a trap: "**A Nuelink post goes to every channel in its collection.** There is no per-post channel choice in the API. The mapping is one collection per channel, and the client page warns when a chosen collection carries others. The owner has to create those collections in Nuelink by hand."
- "Do not" list: change the last bullet to "Do not add a second model provider, a queue, multi-user support, or a second publishing integration. Nuelink is the one scheduler, chosen by the owner; ad platforms remain deferred."
- Testing table: add `nuelink.test.js` ("the client against a fake Nuelink, then the push route end to end") and note `mcp.test.js` now starts Next.
- Remove the Gemini pricing sentence from the pricing trap if present; leave the Claude model IDs paragraph.

- [ ] **Step 3: `HANDOVER.md`**

In §2 add a paragraph: Gemini image generation was removed on 2026-09-15; Nuelink push and the Claude Code tools were added; `npm run local` is the owner's way of running it. In §6 leave the backlog. In §8 amend "platform publishing integrations" to "a second publishing integration (Nuelink is in)".

- [ ] **Step 4: `docs/DATA-HANDLING.md`**

Under "What leaves the system" replace "No client data is sent anywhere else. There are no other integrations in this version." with:

```markdown
Sending a calendar to Nuelink sends, per post, the caption, the landing link and a PNG of the typographic card, which carries the client's colours, name and logo. Nothing else about the client goes: not the brief, not the sources, not the research. Nuelink's own terms govern what happens to a post after that, and the account is the owner's.

No client data is sent anywhere else.
```

- [ ] **Step 5: `docs/HUMAN-ACTIONS.md`**

Add a section after 4b:

```markdown
## 4c. Nuelink collections (5 minutes, once per client)

Nuelink sends a post to every channel in its collection, and Campaign
Forge writes different copy for LinkedIn, X and Instagram. So each channel
needs a collection that holds only it:

1. In Nuelink, open the brand, then Collections, then New collection.
2. Make three: "Forge LinkedIn" with only the LinkedIn channel, "Forge X"
   with only X, "Forge Instagram" with only Instagram.
3. In Campaign Forge, open the client, find the Nuelink section, choose the
   brand, then pick the matching collection for each channel. A warning
   appears if a chosen collection carries other channels.

The existing "Global Queue" and RSS collections fan out to everything; do
not map them.
```

- [ ] **Step 6: `docs/DEPLOY.md`**

Add a row: `| NUELINK_API_KEY | optional | The Social tab cannot send to Nuelink; CSV exports still work |`.

- [ ] **Step 7: `README.md`**

In the "what it does" or features area add one line about sending the calendar to Nuelink; in the not-yet list (line 147) change "Live posting to ad platforms or social schedulers" to "Live posting to ad platforms (Nuelink handles the social calendar)".

- [ ] **Step 8: Final verification and commit**

Run: `cd web && MOCK_CLAUDE=1 npm run build && cd .. && npm test`
Expected: all ok. Then grep for stragglers: `grep -rn -i "gemini" --include=*.md --include=*.js --include=*.ts --include=*.tsx . | grep -v node_modules | grep -v .next | grep -v superpowers` should return only `docs/build/` history and `knowledge/` packs, which are the record of what was planned and need no edit.

```bash
git add -A
git commit -m "Docs: local run, Nuelink, Claude Code tools; Gemini gone" -m "CLAUDE.md, the handover, data handling and the human-actions list now describe the tool as it is: one codebase, hosted or local, sending its calendar to Nuelink, drivable from Claude Code."
```

---

## Self-review

- **Spec coverage.** §2.1 Gemini removal: Task 1. §2.2 and §2b local run: Task 2. §3.1 to 3.3 client: Task 3. §3.4 data: Task 4. §3.5 routes: Tasks 5 and 6. §3.6 UI: Task 7. §3.7 env: Tasks 3 and 9. §4 MCP: Task 8. §5 tests: each task. §6 docs: Task 9. `render.yaml` deletion: Task 1.
- **Deviation from spec, recorded here.** §3.3 named a `formatScheduledAt(dateIso, time)` with its own per-channel times. The plan uses `formatScheduledAt(when: Date)` and the times already in `web/core/schedule.js` (08:30, 12:00, 17:30), so the CSV exports and the push agree on when a post goes out. One source of truth.
- **Types.** `NuelinkMapping`, `NuelinkResult`, `NuelinkPush` are defined in Task 4 and used unchanged in Tasks 6 and 7. `renderCardPng(graphic, brandKit, variant, logoDataUrl)` is defined in Task 5 and called with that order in Task 6. The push body field `weekends: 'skip' | 'keep'` maps to `skipWeekends` in the route (Task 6) and is sent by the component (Task 7) and not by the MCP tool (Task 8, which leaves the default).
- **Placeholders.** None: every step carries its code or its exact edit.
