# Copy Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Campaign Forge's deterministic copy checks usable on any text, from the app, from an API, and from Claude Desktop.

**Architecture:** One pure function, `checkCopy(text, opts)`, in `web/core/check.js`, composed from checkers that already exist. Three thin consumers: an API route, a page, and a stdio MCP server that imports `core/` directly rather than calling the API.

**Tech Stack:** Node CommonJS in `web/core/`, TypeScript in `web/app/`, `@modelcontextprotocol/sdk` in a separate `mcp/` package.

## Global Constraints

- `web/core/` is plain CommonJS with no build step. Do not convert it, and do not add TypeScript there. It is shared with `legacy/`.
- Flags, never silent edits: this reports, it never rewrites (invariant 5).
- Nothing checked is persisted. No database writes anywhere in this plan.
- British English in all copy and docs. No em dashes.
- Every test must also assert the quiet case: real copy comes back clean.
- `npm test` must stay green; new suites are registered in the root `package.json`.

---

### Task 1: The core function

**Files:**
- Create: `web/core/check.js`
- Test: `test/check.test.js`
- Modify: `package.json` (register the suite)

**Interfaces:**
- Consumes: `LIMITS` and `SOCIAL_CHANNELS` from `web/core/limits.js`; `checkCompliance(output, rules)` from `web/core/agents/tools/compliance.js`.
- Produces: `checkCopy(text, opts)` and the `WHY` table, where

```js
// opts: { channel?: string, rules?: object }
// returns:
{
  text: string,
  chars: number,
  channel: string | null,
  fits:  [ { channel: 'linkedin', field: 'headline', limit: 70 } ],
  over:  [ { channel: 'google', field: 'headline', limit: 30, by: 12 } ],
  flags: [ { rule: string, detail: string, severity: 'violation'|'warning', why: string } ],
  ranWithoutClientRules: boolean,
  verdict: 'clean' | 'warnings' | 'violations'
}
```

- [ ] **Step 1: Write the failing test**

Create `test/check.test.js`:

```js
/**
 * checkCopy: every deterministic verdict this codebase has, over one string.
 *
 * The quiet case matters as much as the loud one. A checker that fires on
 * good copy gets switched off, so real headlines must come back clean.
 */
const assert = require('assert');
const { checkCopy } = require('../web/core/check');

(async () => {
  // Clean copy, no channel: says where it fits and reports nothing else.
  const clean = checkCopy('Close the month four days faster.');
  assert.equal(clean.verdict, 'clean', 'good copy is clean');
  assert.equal(clean.chars, 33);
  assert.deepEqual(clean.flags, [], 'no flags on good copy');
  assert.ok(clean.fits.some((f) => f.channel === 'linkedin' && f.field === 'headline'),
    'a 33 character line fits a LinkedIn headline');
  assert.ok(clean.over.some((f) => f.channel === 'google' && f.field === 'headline'),
    'and is too long for a Google headline');

  // With a channel, only that channel is reported.
  const one = checkCopy('Close the month four days faster.', { channel: 'google' });
  assert.equal(one.channel, 'google');
  assert.ok([...one.fits, ...one.over].every((f) => f.channel === 'google'),
    'a chosen channel reports only itself');

  // Social channels are included, not just ad channels.
  assert.ok(checkCopy('hello').fits.some((f) => f.channel === 'x'),
    'social channels are covered too');

  // The humaniser still applies.
  const slop = checkCopy('A robust, seamless platform.');
  assert.equal(slop.verdict, 'violations');
  assert.ok(slop.flags.some((f) => f.rule === 'ai-word' && /robust/.test(f.detail)));

  // Every flag explains itself. This is the difference between a linter and
  // a tool that teaches its own standard.
  assert.ok(slop.flags.every((f) => typeof f.why === 'string' && f.why.length > 10),
    'every flag says why the rule exists');

  // Without client rules it says so, rather than implying a full check.
  assert.equal(checkCopy('hello').ranWithoutClientRules, true);
  assert.equal(checkCopy('hello', { rules: { avoid: ['synergy'] } }).ranWithoutClientRules, false);

  // And with them, the client's own rules apply.
  const avoided = checkCopy('Real synergy here.', { rules: { avoid: ['synergy'] } });
  assert.ok(avoided.flags.some((f) => f.rule === 'avoid'), 'client avoid terms are checked');

  console.log('check tests: ok');
})().catch((e) => { console.error('check tests FAILED', e); process.exit(1); });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/check.test.js`
Expected: FAIL with `Cannot find module '../web/core/check'`

- [ ] **Step 3: Write the module**

Create `web/core/check.js`:

```js
/**
 * Every deterministic verdict this codebase has, over one string.
 *
 * The checks already exist and are already pure; what they lacked was a way
 * in that did not involve running an agent pass. Someone writing a post by
 * hand got none of them.
 *
 * Reports, never rewrites (invariant 5). Stores nothing: ad-hoc copy is not
 * a campaign asset, and not storing it makes the data question easy to
 * answer.
 */
const { LIMITS, SOCIAL_CHANNELS } = require('./limits');
const { checkCompliance } = require('./agents/tools/compliance');

/**
 * Why each rule exists, in one sentence. A flag a reader cannot act on is
 * noise, and most people meeting these rules did not write them.
 */
const WHY = {
  avoid: 'The client asked not to use this word.',
  competitor: 'Naming a competitor in your own ad argues their case for them.',
  superlative: 'Brochure language. It makes a claim without making a point.',
  placeholder: 'Scaffolding left in the copy. It will ship if nobody catches it.',
  brand: 'The brand name has a registered spelling and this is not it.',
  claim: 'A number or comparison nobody has approved. Legal risk, not style.',
  'pt-br': 'Brazilian Portuguese in copy marked as European Portuguese.',
  'ai-word': 'Vocabulary that marks text as machine-written.',
  'ai-phrase': 'A stock phrase that marks text as machine-written.',
  'em-dash': 'House style: no em dashes.',
  'negative-parallelism': 'A stock shape that reads as machine-written.',
  'copula-avoidance': 'Says "serves as" where "is" would do.',
  'false-range': 'A range whose ends are not on a scale.',
  'curly-quote': 'A typographic quote a form field will not render.',
  'decorative-emoji': 'Decoration standing in for a point.',
};

/** Every place a single line could go, and whether it fits. */
function lengths(chars, channel) {
  const fits = [];
  const over = [];
  const place = (ch, field, limit) => {
    const row = { channel: ch, field, limit };
    if (chars > limit) over.push({ ...row, by: chars - limit });
    else fits.push(row);
  };

  for (const [ch, fields] of Object.entries(LIMITS)) {
    if (channel && ch !== channel) continue;
    for (const [field, rule] of Object.entries(fields)) {
      // body_words is a word count, not a character limit.
      if (field === 'body_words' || typeof rule.max !== 'number') continue;
      place(ch, field, rule.max);
    }
  }
  for (const [ch, c] of Object.entries(SOCIAL_CHANNELS)) {
    if (channel && ch !== channel) continue;
    place(ch, 'post', c.text.max);
  }
  return { fits, over };
}

/**
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.channel]  Report only this channel.
 * @param {object} [opts.rules]    The client's rules, as buildRules returns.
 */
function checkCopy(text, opts = {}) {
  const value = String(text == null ? '' : text);
  const chars = value.length;
  const rules = opts.rules || null;
  const { fits, over } = lengths(chars, opts.channel || null);

  // checkCompliance walks an object and reports a path per string, so the
  // text is handed to it as one field. It runs the AI-tell catalogue
  // internally, which is why findTells is not called again here.
  const flags = checkCompliance({ text: value }, rules || {}).map((f) => ({
    rule: f.rule,
    detail: f.detail,
    severity: f.severity,
    why: WHY[f.rule] || 'See docs/COPY-CHECKS.md.',
  }));

  // Over a limit only counts as a violation when a channel was named. With no
  // channel, being too long for Google says nothing about a LinkedIn post.
  const tooLong = Boolean(opts.channel) && over.length > 0;
  const verdict = flags.some((f) => f.severity === 'violation') || tooLong
    ? 'violations'
    : flags.length ? 'warnings' : 'clean';

  return {
    text: value,
    chars,
    channel: opts.channel || null,
    fits,
    over,
    flags,
    ranWithoutClientRules: !rules,
    verdict,
  };
}

module.exports = { checkCopy, WHY };
```

- [ ] **Step 4: Run the test again**

Run: `node test/check.test.js`
Expected: `check tests: ok`

If `chars` is asserted wrongly, count the string rather than adjusting the
implementation: `'Close the month four days faster.'` is 33 characters.

- [ ] **Step 5: Register the suite and run everything**

In root `package.json`, add `node test/check.test.js && ` immediately before `node test/export.test.js`.

Run: `npm test`
Expected: every suite ok, exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/core/check.js test/check.test.js package.json
git commit -m "feat: checkCopy, every deterministic verdict over one string"
```

---

### Task 2: The API route

**Files:**
- Create: `web/app/api/check/route.ts`
- Test: `test/api.test.js` (append cases)

**Interfaces:**
- Consumes: `checkCopy(text, opts)` from Task 1; `guarded`, `bad` from `web/server/respond`; `rulesFor(ws, clientId, campaignId)` from `web/server/inputs`, which requires a campaignId; `getClient(ws, clientId)` from `web/server/db` for the client-only path. `Voice` fields are `avoidTerms` and `preferredTerms`.
- Produces: `POST /api/check` returning the Task 1 shape as JSON.

- [ ] **Step 1: Write the failing test**

Append to `test/api.test.js`, inside the existing run against the started server, after the export assertions:

```js
  // Copy checks: the same verdicts, without running an agent.
  const chk = await post('/api/check', { text: 'A robust, seamless platform.' });
  assert.equal(chk.status, 200, 'check route answers');
  assert.equal(chk.data.verdict, 'violations', 'slop is refused');
  assert.ok(chk.data.flags.every((f) => f.why), 'every flag says why');
  assert.equal(chk.data.ranWithoutClientRules, true, 'says it ran without client rules');

  const cleanCopy = await post('/api/check', { text: 'Close the month four days faster.', channel: 'linkedin' });
  assert.equal(cleanCopy.data.verdict, 'clean', 'good copy is clean');
  assert.equal(cleanCopy.data.channel, 'linkedin');

  const empty = await post('/api/check', {});
  assert.equal(empty.status, 400, 'no text is a bad request');
  console.log('  copy check route:', chk.data.flags.length, 'flags');
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && MOCK_CLAUDE=1 npm run build && cd .. && node test/api.test.js`
Expected: FAIL on `check route answers`, because the route 404s.

- [ ] **Step 3: Write the route**

Create `web/app/api/check/route.ts`:

```ts
import { guarded, bad } from '@/server/respond';
import { rulesFor } from '@/server/inputs';
import { getClient } from '@/server/db';

const { checkCopy } = require('@core/check');

export const runtime = 'nodejs';

/**
 * Check arbitrary copy. Nothing is stored: this is the one route that reads a
 * body and writes nothing, on purpose. Ad-hoc copy is not a campaign asset,
 * and not keeping it is what makes the data answer simple.
 *
 * A clientId is optional. With one, the client's own avoid terms, approved
 * claims and brand spelling apply; without one those rules cannot run, and
 * the response says so rather than implying a full check.
 */
export async function POST(req: Request) {
  return guarded(async (session) => {
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) throw bad('Nothing to check. Send { text }.');

    // rulesFor needs a campaign, because approved claims and the research
    // context belong to one. Checking a stray line usually has neither, so a
    // client on its own contributes what it can: its avoid terms, its own
    // vocabulary and its brand spelling. Saying which of the two ran is the
    // job of ranWithoutClientRules.
    let rules = null;
    if (body.clientId && body.campaignId) {
      rules = await rulesFor(session.workspaceId, body.clientId, body.campaignId);
    } else if (body.clientId) {
      const client = await getClient(session.workspaceId, body.clientId);
      if (!client) throw bad('Client not found', 404);
      rules = {
        avoid: client.voice?.avoidTerms || [],
        competitors: [],
        brandName: client.name,
        approvedClaims: null,
        houseTerms: [client.name, ...(client.voice?.preferredTerms || [])],
      };
    }

    return checkCopy(text, { channel: body.channel, rules });
  });
}
```

- [ ] **Step 4: Run the test again**

Run: `cd web && MOCK_CLAUDE=1 npm run build && cd .. && node test/api.test.js`
Expected: `api tests: ok`

- [ ] **Step 5: Commit**

```bash
git add web/app/api/check/route.ts test/api.test.js
git commit -m "feat: POST /api/check, the checks without an agent run"
```

---

### Task 3: The clinic page

**Files:**
- Create: `web/app/check/page.tsx`
- Create: `web/app/check/clinic.tsx`
- Modify: `web/components/Nav.tsx`
- Modify: `web/app/globals.css` (append)
- Test: `test/pages.test.js` (append a case)

**Interfaces:**
- Consumes: `POST /api/check` from Task 2; `listClients(ws)` from `web/server/db`; `currentSession()` from `web/server/auth`.
- Produces: a page at `/check`.

- [ ] **Step 1: Write the failing test**

Append to `test/pages.test.js`, alongside the other page assertions:

```js
  const clinic = await html('/check');
  assert.equal(clinic.status, 200, 'the clinic page renders');
  assert.ok(/Check copy/.test(clinic.body), 'and says what it is');
  console.log('  clinic page: ok');
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && MOCK_CLAUDE=1 npm run build && cd .. && node test/pages.test.js`
Expected: FAIL, the page 404s.

- [ ] **Step 3: Write the server page**

Create `web/app/check/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { currentSession } from '@/server/auth';
import { listClients } from '@/server/db';
import Clinic from './clinic';

export const dynamic = 'force-dynamic';

export default async function CheckPage() {
  const session = await currentSession();
  if (!session) redirect('/login');
  const clients = await listClients(session.workspaceId);
  return (
    <main className="shell">
      <h1>Check copy</h1>
      <p className="muted">
        Every check the campaign passes run, over any text you paste. It reports and you decide;
        nothing here is rewritten, and nothing is saved.
      </p>
      <Clinic clients={clients.map((c) => ({ clientId: c.clientId, name: c.name }))} />
    </main>
  );
}
```

- [ ] **Step 4: Write the client component**

Create `web/app/check/clinic.tsx`:

```tsx
'use client';

import { useState } from 'react';

const CHANNELS = ['', 'meta', 'linkedin', 'google', 'email', 'x', 'instagram', 'facebook', 'tiktok', 'threads', 'youtube', 'pinterest'];

export default function Clinic({ clients }: { clients: { clientId: string; name: string }[] }) {
  const [text, setText] = useState('');
  const [channel, setChannel] = useState('');
  const [clientId, setClientId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!text.trim()) return;
    setBusy(true); setError(null);
    const res = await fetch('/api/check', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, channel: channel || undefined, clientId: clientId || undefined }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { setError(data?.error || 'Could not check that'); setResult(null); return; }
    setResult(data);
  }

  return (
    <section className="clinic">
      <label className="field"><span>Copy</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6}
          placeholder="Paste a headline, a post, an email subject line" /></label>

      <div className="field-row">
        <label className="field"><span>Channel <em className="opt">optional</em></span>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((c) => <option key={c} value={c}>{c || 'every channel'}</option>)}
          </select></label>
        <label className="field"><span>Client <em className="opt">for its own rules</em></span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">none</option>
            {clients.map((c) => <option key={c.clientId} value={c.clientId}>{c.name}</option>)}
          </select></label>
      </div>

      <button className="btn-primary" type="button" onClick={run} disabled={busy || !text.trim()}>
        {busy ? 'Checking…' : 'Check'}
      </button>
      {error && <p className="form-error">{error}</p>}

      {result && (
        <div className="clinic-out">
          <p className={`clinic-verdict ${result.verdict}`}>
            {result.verdict === 'clean' ? 'Clean' : result.verdict === 'warnings' ? 'Worth a look' : 'Needs a fix'}
            <span className="muted"> · {result.chars} characters</span>
          </p>

          {result.ranWithoutClientRules && (
            <p className="notice-warn">
              Checked without the client&rsquo;s own rules, so avoid terms, approved claims and brand
              spelling were not tested. Pick a client above to include them.
            </p>
          )}

          {result.flags.length > 0 && (
            <ul className="clinic-flags">
              {result.flags.map((f: any, i: number) => (
                <li key={i} className={f.severity}>
                  <b>{f.detail}</b>
                  <span className="muted">{f.why}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="clinic-fit">
            {result.over.length > 0 && (
              <p><b>Too long for:</b> {result.over.map((o: any) => `${o.channel} ${o.field} (${o.by} over)`).join(', ')}</p>
            )}
            {result.fits.length > 0 && (
              <p className="muted"><b>Fits:</b> {result.fits.map((f: any) => `${f.channel} ${f.field}`).join(', ')}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Add the navigation link**

In `web/components/Nav.tsx`, add immediately before the Settings link:

```tsx
          <Link href="/check">Check copy</Link>
```

- [ ] **Step 6: Add the styles**

Append to `web/app/globals.css`:

```css

/* ---------- Copy clinic ----------------------------------------------------
   The checks the campaign passes run, over anything pasted in. Laid out so
   the verdict reads first and the reasons follow, because the question is
   almost always "can I send this" before "why not".
   -------------------------------------------------------------------------- */
.clinic { display: flex; flex-direction: column; gap: 14px; max-width: 720px; }
.clinic textarea { min-height: 130px; }
.clinic-out { display: flex; flex-direction: column; gap: 12px; margin-top: 6px; }
.clinic-verdict { margin: 0; font-family: var(--display); font-stretch: 87.5%; font-size: 17px; }
.clinic-verdict.clean { color: var(--ok); }
.clinic-verdict.warnings { color: var(--amber); }
.clinic-verdict.violations { color: var(--ember-text); }
.clinic-flags { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.clinic-flags li {
  display: flex; flex-direction: column; gap: 2px;
  padding: 10px 12px; border-radius: var(--radius);
  border: 1px solid var(--line); border-left-width: 3px; background: var(--panel);
  font-size: 13.5px;
}
.clinic-flags li.violation { border-left-color: var(--ember); }
.clinic-flags li.warning { border-left-color: var(--amber); }
.clinic-flags .muted { font-size: 12.5px; }
.clinic-fit { font-size: 13px; display: flex; flex-direction: column; gap: 4px; }
.clinic-fit p { margin: 0; }
```

- [ ] **Step 7: Run the test**

Run: `cd web && MOCK_CLAUDE=1 npm run build && cd .. && node test/pages.test.js`
Expected: `page tests: ok`

- [ ] **Step 8: Commit**

```bash
git add web/app/check test/pages.test.js web/components/Nav.tsx web/app/globals.css
git commit -m "feat: a page for checking copy that no agent generated"
```

---

### Task 4: The MCP server

**Files:**
- Create: `mcp/package.json`
- Create: `mcp/server.js`
- Test: `test/mcp.test.js`
- Modify: `package.json` (register the suite)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `checkCopy(text, opts)` from Task 1; `scanSite(url, opts)` from `web/core/scraper`.
- Produces: `TOOLS` (array of MCP tool descriptors) and `callTool(name, args)` returning a string.

- [ ] **Step 1: Write the failing test**

Create `test/mcp.test.js`:

```js
/**
 * The MCP server's tools.
 *
 * The server is a second entry point into core/, so the risk is drift: a
 * schema promising an argument the function does not take fails only in
 * someone else's client, where nobody can debug it. This asserts the schemas
 * against the function they call, without starting a server.
 */
const assert = require('assert');
const { TOOLS, callTool } = require('../mcp/server');

(async () => {
  const names = TOOLS.map((t) => t.name).sort();
  assert.deepEqual(names, ['check_copy', 'scan_site'], 'two tools, named as documented');

  for (const t of TOOLS) {
    assert.ok(t.description && t.description.length > 30, `${t.name} explains itself`);
    assert.equal(t.inputSchema.type, 'object', `${t.name} takes an object`);
    assert.ok(Array.isArray(t.inputSchema.required), `${t.name} says what is required`);
  }

  // The schema must match what checkCopy actually accepts.
  const copy = TOOLS.find((t) => t.name === 'check_copy');
  assert.deepEqual(copy.inputSchema.required, ['text'], 'only text is required');
  assert.deepEqual(
    Object.keys(copy.inputSchema.properties).sort(),
    ['channel', 'text'],
    'the schema offers exactly the arguments checkCopy reads'
  );

  // And calling it returns something a person can read.
  const out = await callTool('check_copy', { text: 'A robust, seamless platform.' });
  assert.ok(/Needs a fix/.test(out), 'the verdict leads');
  assert.ok(/robust/.test(out), 'and names the problem');

  const clean = await callTool('check_copy', { text: 'Close the month four days faster.' });
  assert.ok(/^Clean/.test(clean), 'good copy comes back clean');

  await assert.rejects(() => callTool('nope', {}), /unknown tool/i, 'an unknown tool is refused');

  console.log('mcp tests: ok');
})().catch((e) => { console.error('mcp tests FAILED', e); process.exit(1); });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/mcp.test.js`
Expected: FAIL with `Cannot find module '../mcp/server'`

- [ ] **Step 3: Write the package manifest**

Create `mcp/package.json`:

```json
{
  "name": "campaign-forge-mcp",
  "version": "0.1.0",
  "private": true,
  "description": "Campaign Forge's copy checks as MCP tools",
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": { "@modelcontextprotocol/sdk": "^1.0.0" }
}
```

- [ ] **Step 4: Write the server**

Create `mcp/server.js`:

```js
#!/usr/bin/env node
/**
 * Campaign Forge's checks, as MCP tools.
 *
 * This imports web/core directly rather than calling the deployed API. It
 * therefore needs no session, no network and no running app, which is the
 * point: the checks are pure functions and should be usable on a train.
 *
 * check_copy makes no network calls at all. scan_site fetches the site it is
 * given. Neither stores anything.
 *
 * TOOLS and callTool are exported so the tests can assert the schemas against
 * the functions without starting a server.
 */
const { checkCopy } = require('../web/core/check');
const { scanSite } = require('../web/core/scraper');

const TOOLS = [
  {
    name: 'check_copy',
    description:
      'Check marketing copy against platform character limits, house style and the AI-tell catalogue. ' +
      'Reports only; it never rewrites. Makes no network calls.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The copy to check.' },
        channel: {
          type: 'string',
          description: 'Report only this channel, for example linkedin, google, x. Omit to see every channel it fits.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'scan_site',
    description:
      'Read a company website and return its brand kit: palette, fonts, logo, and which pages were read. ' +
      'Fetches the site you name.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The site to read.' },
        maxPages: { type: 'number', description: 'How many pages to read. Default 4.' },
      },
      required: ['url'],
    },
  },
];

const VERDICT = { clean: 'Clean', warnings: 'Worth a look', violations: 'Needs a fix' };

/** Plain text, because an MCP result is read by a person or quoted by a model. */
function renderCheck(r) {
  const lines = [`${VERDICT[r.verdict]}, ${r.chars} characters`];
  if (r.flags.length) {
    lines.push('');
    for (const f of r.flags) lines.push(`- [${f.severity}] ${f.detail}. ${f.why}`);
  }
  if (r.over.length) {
    lines.push('');
    lines.push('Too long for: ' + r.over.map((o) => `${o.channel} ${o.field} (${o.by} over)`).join(', '));
  }
  if (r.fits.length) {
    lines.push('Fits: ' + r.fits.map((f) => `${f.channel} ${f.field}`).join(', '));
  }
  if (r.ranWithoutClientRules) {
    lines.push('');
    lines.push('Checked without a client, so avoid terms, approved claims and brand spelling were not tested.');
  }
  return lines.join('\n');
}

async function callTool(name, args = {}) {
  if (name === 'check_copy') {
    return renderCheck(checkCopy(String(args.text || ''), { channel: args.channel }));
  }
  if (name === 'scan_site') {
    const r = await scanSite(String(args.url || ''), { maxPages: args.maxPages });
    return JSON.stringify({ brandKit: r.brandKit, pages: r.sources.map((s) => s.name) }, null, 1);
  }
  throw new Error(`unknown tool "${name}"`);
}

module.exports = { TOOLS, callTool };

// Started directly: speak MCP over stdio. The SDK is required lazily so the
// tests, and anything else importing this file, do not need it installed.
if (require.main === module) {
  (async () => {
    const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
    const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
    const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

    const server = new Server({ name: 'campaign-forge', version: '0.1.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
    server.setRequestHandler(CallToolRequestSchema, async (req) => {
      try {
        const text = await callTool(req.params.name, req.params.arguments || {});
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    });
    await server.connect(new StdioServerTransport());
  })();
}
```

- [ ] **Step 5: Run the test**

Run: `node test/mcp.test.js`
Expected: `mcp tests: ok`

- [ ] **Step 6: Register the suite and ignore the install**

In root `package.json`, add `node test/mcp.test.js && ` immediately before `node test/export.test.js`.
In `.gitignore`, add a line: `mcp/node_modules/`

Run: `npm test`
Expected: every suite ok, exit 0.

- [ ] **Step 7: Commit**

```bash
git add mcp/server.js mcp/package.json test/mcp.test.js package.json .gitignore
git commit -m "feat: the copy checks as an MCP server"
```

---

### Task 5: The documentation

**Files:**
- Create: `docs/COPY-CHECKS.md`
- Create: `mcp/README.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the `WHY` table from Task 1 and the `TOOLS` schemas from Task 4. Every key in `WHY` must appear in `docs/COPY-CHECKS.md`.

- [ ] **Step 1: Write `docs/COPY-CHECKS.md`**

One document, layered: a marketer reads to the horizontal rule, an engineer keeps going. In this order:

1. **What this is**, in two sentences: every check the campaign passes run, usable on any copy.
2. **Where to use it**: the Check copy page, and Claude Desktop through the MCP server.
3. **The rules**, one short heading each, one per key in `WHY` from `web/core/check.js`, plus a section on character limits. For each: what trips it, why it exists, what to do about it.
4. **What it will not do**: rewrite, or store anything.
5. A `---` rule.
6. **For engineers**: the `checkCopy(text, opts)` signature and the returned shape copied verbatim from Task 1; where each underlying checker lives (`core/limits.js`, `core/agents/tools/compliance.js`, `core/ai-tells.js`); how to add a rule, which is three edits (the checker, its sentence in `WHY`, a case in `test/check.test.js`); and why `core/` is CommonJS.

- [ ] **Step 2: Write `mcp/README.md`**

It must contain:

1. What the server is, and the data note: `check_copy` makes no network calls, `scan_site` fetches the site named, neither stores anything.
2. Install: `cd mcp && npm install`.
3. The Claude Desktop configuration, with a note to replace the path with an absolute one:

```json
{
  "mcpServers": {
    "campaign-forge": {
      "command": "node",
      "args": ["/absolute/path/to/campaignforge/mcp/server.js"]
    }
  }
}
```

4. A worked example per tool: the question asked, and the answer that comes back.

- [ ] **Step 3: Add the README section**

In `README.md`, after the "What it does" list, add a section headed `## Checking copy the tool did not write`, covering the page, the MCP server, and a pointer to `docs/COPY-CHECKS.md`.

- [ ] **Step 4: Note it in CLAUDE.md**

In the Layout tree, add `core/check.js` beside the other `core/` entries with a one-line description, and add an `mcp/` entry saying it is a local stdio server that sits outside the Vercel build.

- [ ] **Step 5: Check the docs match the code**

Run:

```bash
node -e "const {WHY}=require('./web/core/check');const d=require('fs').readFileSync('docs/COPY-CHECKS.md','utf8');const missing=Object.keys(WHY).filter(k=>!d.includes(k));if(missing.length){console.error('undocumented rules:',missing);process.exit(1)}console.log('every rule documented')"
```

Expected: `every rule documented`

- [ ] **Step 6: Commit**

```bash
git add docs/COPY-CHECKS.md mcp/README.md README.md CLAUDE.md
git commit -m "docs: how the copy checks work, for a marketer and an engineer"
```
