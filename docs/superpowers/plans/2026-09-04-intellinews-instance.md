# IntelliNews Instance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second Campaign Forge instance for IntelliNews client work, reached through its own admin-only door in the same deployment, with its own library and branding, and raise the security floor for both instances.

**Architecture:** The workspace id already in the session cookie *is* the instance. `web/server/db.ts` nests every record under `users/{ws}`, so signing a cookie with `intellinews` instead of the hardcoded `owner` is the whole data separation. A new `web/server/tenant.ts` is the single source of truth for what differs between the two, and every other change reads from it. Security changes are shared by both instances, because a weakness in the login route is a weakness at both doors.

**Tech Stack:** Next.js App Router (`web/`), TypeScript, `jose` for JWTs, Firestore via `firebase-admin` with an in-memory fallback, Cloudflare R2 via the S3 SDK. Tests are plain Node scripts using `assert`, run by `npm test` from the repo root.

## Global Constraints

- **Node >= 20.** Tests are CommonJS `.test.js` files run directly by `node`, never a test framework.
- **Tests that touch `web/server/*.ts` compile it first** with `npx tsc <files> --outDir .test-build --module commonjs --target es2022 --skipLibCheck --esModuleInterop` run with `cwd: web/`, then `require('../web/.test-build/<name>.js')`. Follow `test/session.test.js` exactly.
- **Every new test file must be added to the `test` script in the root `package.json`** or it never runs.
- **Firestore paths must have an even number of components to name a document.** `test/db.test.js` checks this statically for every path string in `web/server/`. `system/auth/epoch/{ws}` is four components and is a document; `system/spend` is two. An odd count is a production crash, as the header comment in `server/spend.ts` records.
- **No new environment variables.** The instance is selected by the URL and the cookie, not by configuration.
- **Prose in this codebase does not use em dashes.** Use `--` or restructure the sentence.
- **Every task ends with a commit.** Message style is the existing one: lower-case `type: summary`, a blank line, then prose explaining *why*.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Xwsre9ZnMH6rsK2PeW82Ju
  ```

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `web/server/tenant.ts` | The registry. What each instance is called, where its door is, who may open it, how long its sessions last, whether the ceiling binds it. Pure data and lookups, no I/O, so the edge proxy can import it. |
| `web/server/epoch.ts` | Per-workspace session epoch: read (cached 60s), bump. The only thing that can revoke a session. |
| `web/server/audit.ts` | Sign-in attempts: write one, list the recent ones. |
| `web/server/uploads.ts` | Upload size cap, type allowlist, storage-name hygiene. Pure functions. |
| `web/app/intellinews-CampaignF/page.tsx` | The IntelliNews door. |
| `web/app/api/settings/revoke/route.ts` | "Sign out everywhere" for the current workspace. |
| `test/tenant.test.js` | Tenant registry and upload rules. |
| `test/security.test.js` | Epoch revocation, password floor, global throttle, audit, ceiling exemption. |
| `test/instance.test.js` | The IntelliNews door end to end against a running server. |

**Modified:**

| File | Change |
|---|---|
| `web/server/session.ts` | `epoch` claim, per-tenant TTL, `ADMIN_PASSWORD` minimum length. |
| `web/server/auth.ts` | Reject a session whose epoch is stale. |
| `web/server/throttle.ts` | A global failure counter that delays rather than locks. |
| `web/server/spend.ts` | Exempt workspaces skip the ceiling and are excluded from its total. |
| `web/server/db.ts` | `listLedgerForCeiling`, which excludes exempt workspaces. |
| `web/app/api/auth/login/route.ts` | Tenant field, admin-only doors, `cf_door` cookie, audit, tarpit. |
| `web/proxy.ts` | The door is public; an expired session returns to its own door; per-request CSP nonce. |
| `web/components/Nav.tsx`, `web/components/SignOut.tsx` | Render and sign out per tenant. |
| `web/app/layout.tsx` | Tenant-aware title via `generateMetadata`; the CSP nonce. |
| `web/app/globals.css` | `[data-tenant="intellinews"]` accent. |
| `web/app/settings/page.tsx` | Sign out everywhere, recent sign-ins. |
| `web/app/api/clients/[id]/sources/route.ts` | Enforce upload rules. |
| `web/next.config.mjs` | Static security headers. |
| `test/session.test.js` | Its `ADMIN_PASSWORD` is 13 characters and will fail the new floor. |
| `package.json` | Register the three new test files. |
| `README.md`, `CLAUDE.md`, `HANDOVER.md`, `docs/DEPLOY.md`, `.env.example` | Document the instance and the deploy-blocking password change. |

---

### Task 1: The tenant registry

The single source of truth for what differs between the two instances. Everything later in this plan reads from it. It holds no I/O so that `web/proxy.ts`, which runs on the edge, can import it.

**Files:**
- Create: `web/server/tenant.ts`
- Create: `test/tenant.test.js`
- Modify: `package.json` (the `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Tenant = { id: string; label: string; strapline: string; doorPath: string; adminOnly: boolean; exemptFromCeiling: boolean; sessionTtlSeconds: number }`
  - `TENANTS: Record<string, Tenant>`, `DEFAULT_TENANT: Tenant`
  - `tenantById(id: string): Tenant | null`
  - `tenantFor(session: { workspaceId: string } | null | undefined): Tenant`
  - `tenantByDoor(pathname: string): Tenant | null`
  - `isExempt(ws: string): boolean`
  - `DOOR_COOKIE = 'cf_door'`

- [ ] **Step 1: Write the failing test**

Create `test/tenant.test.js`:

```js
/**
 * The tenant registry: what differs between the two instances.
 * Run: node test/tenant.test.js
 */
const assert = require('assert');
const path = require('path');
require('child_process').execSync(
  'npx tsc server/tenant.ts --outDir .test-build --module commonjs --target es2022 --skipLibCheck --esModuleInterop',
  { cwd: path.join(__dirname, '..', 'web'), stdio: 'pipe' },
);
const t = require('../web/.test-build/tenant.js');

(async () => {
  assert.equal(t.TENANTS.owner.doorPath, '/login', 'the portfolio door is unchanged');
  assert.equal(t.TENANTS.owner.adminOnly, false, 'the reviewer password still opens the portfolio');
  assert.equal(t.TENANTS.owner.exemptFromCeiling, false, 'the portfolio is still governed by the ceiling');
  assert.equal(t.TENANTS.owner.sessionTtlSeconds, 7 * 86400, 'seven days, unchanged');

  assert.equal(t.TENANTS.intellinews.doorPath, '/intellinews-CampaignF');
  assert.equal(t.TENANTS.intellinews.adminOnly, true, 'only the admin password opens IntelliNews');
  assert.equal(t.TENANTS.intellinews.exemptFromCeiling, true);
  assert.equal(t.TENANTS.intellinews.sessionTtlSeconds, 86400, 'client work gets a day, not a week');

  // An unknown id must never silently become a tenant: that would hand a
  // forged cookie a workspace of its own choosing.
  assert.equal(t.tenantById('nope'), null);
  assert.equal(t.tenantById('intellinews').id, 'intellinews');

  // tenantFor is the render path, so it falls back rather than throwing.
  assert.equal(t.tenantFor(null).id, 'owner');
  assert.equal(t.tenantFor({ workspaceId: 'ws_legacy_demo' }).id, 'owner', 'an old workspace renders as the portfolio');
  assert.equal(t.tenantFor({ workspaceId: 'intellinews' }).id, 'intellinews');

  assert.equal(t.tenantByDoor('/intellinews-CampaignF').id, 'intellinews');
  assert.equal(t.tenantByDoor('/login').id, 'owner');
  assert.equal(t.tenantByDoor('/clients'), null);

  assert.equal(t.isExempt('intellinews'), true);
  assert.equal(t.isExempt('owner'), false);
  assert.equal(t.isExempt('ws_unknown'), false, 'an unknown workspace is never exempt');

  assert.equal(t.DOOR_COOKIE, 'cf_door');
  console.log('tenant tests: ok');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/tenant.test.js`
Expected: FAIL. `tsc` cannot find `server/tenant.ts`, so the `execSync` throws.

- [ ] **Step 3: Write the registry**

Create `web/server/tenant.ts`:

```ts
/**
 * The two instances.
 *
 * One deployment serves both. The workspace id in the session cookie decides
 * which one a request is inside, and this file is the only place that says
 * what that means: the name in the header, the door to sign in and out at,
 * whether the reviewer password is accepted there, how long a session lasts,
 * and whether the spend ceiling binds it.
 *
 * It is deliberately pure. web/proxy.ts runs on the edge and cannot use
 * firebase-admin or node builtins, so anything imported there must stay free
 * of I/O.
 *
 * A workspace id that is not listed here is NOT a tenant. tenantById returns
 * null for it and isExempt returns false, so a forged or stale cookie cannot
 * name itself into an exemption. tenantFor is the exception and falls back to
 * the portfolio, because it is called from render paths where throwing would
 * turn an unknown cookie into a broken page rather than a sign-in prompt.
 */
export type Tenant = {
  /** Also the workspace id: every record lives under users/{id}. */
  id: string;
  label: string;
  strapline: string;
  /** Where sign-in lives, and where sign-out and an expired session return to. */
  doorPath: string;
  /** True where ACCESS_PASSWORD is refused and only ADMIN_PASSWORD is accepted. */
  adminOnly: boolean;
  /** True where the monthly ceiling neither blocks runs nor counts their spend. */
  exemptFromCeiling: boolean;
  sessionTtlSeconds: number;
};

const DAY = 60 * 60 * 24;

export const TENANTS: Record<string, Tenant> = {
  owner: {
    id: 'owner',
    label: 'Campaign Forge',
    strapline: 'brief in, campaign out',
    doorPath: '/login',
    adminOnly: false,
    exemptFromCeiling: false,
    sessionTtlSeconds: 7 * DAY,
  },
  intellinews: {
    id: 'intellinews',
    label: 'IntelliNews Campaign Forge',
    strapline: 'client work',
    doorPath: '/intellinews-CampaignF',
    adminOnly: true,
    exemptFromCeiling: true,
    // A day rather than a week. This one sits in front of a client's
    // unpublished work, so a forgotten session is a longer exposure.
    sessionTtlSeconds: DAY,
  },
};

export const DEFAULT_TENANT = TENANTS.owner;

/** Strict: an unknown id is not a tenant. Use this wherever trust is granted. */
export function tenantById(id: string): Tenant | null {
  return Object.prototype.hasOwnProperty.call(TENANTS, id) ? TENANTS[id] : null;
}

/** Lenient: for rendering. An unrecognised workspace looks like the portfolio. */
export function tenantFor(session: { workspaceId: string } | null | undefined): Tenant {
  if (!session) return DEFAULT_TENANT;
  return tenantById(session.workspaceId) ?? DEFAULT_TENANT;
}

export function tenantByDoor(pathname: string): Tenant | null {
  return Object.values(TENANTS).find((t) => t.doorPath === pathname) ?? null;
}

export function isExempt(ws: string): boolean {
  return tenantById(ws)?.exemptFromCeiling === true;
}

/**
 * Written beside the session at sign-in. It holds a door path and no secret.
 * The proxy runs on the edge and cannot verify the JWT, so this is how an
 * expired IntelliNews session finds its way back to the IntelliNews door
 * rather than the portfolio one.
 */
export const DOOR_COOKIE = 'cf_door';
```

- [ ] **Step 4: Run it and watch it pass**

Run: `node test/tenant.test.js`
Expected: PASS, printing `tenant tests: ok`.

- [ ] **Step 5: Register the suite**

In `package.json`, in the `test` script, insert `node test/tenant.test.js && ` immediately after `node test/session.test.js && `.

Run: `npm test`
Expected: every suite passes, `tenant tests: ok` among them.

- [ ] **Step 6: Commit**

```bash
git add web/server/tenant.ts test/tenant.test.js package.json
git commit -m "feat: name the two instances in one place"
```

---

### Task 2: Sessions that can be ended

Today the cookie is a seven-day JWT and nothing can invalidate it: a lost laptop means rotating `SESSION_SECRET`, which signs out both instances at once. An `epoch` claim fixes that per workspace.

**Files:**
- Create: `web/server/epoch.ts`
- Modify: `web/server/session.ts`
- Modify: `web/server/auth.ts`
- Modify: `web/app/api/auth/login/route.ts` (compile fix only)
- Create: `test/security.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing from Task 1 yet.
- Produces:
  - `Session` gains `epoch: number`
  - `signSession(s: Session, ttlSeconds: number): Promise<string>`
  - `currentEpoch(ws: string): Promise<number>`, `bumpEpoch(ws: string): Promise<number>`, `__resetEpochCache(): void`

- [ ] **Step 1: Write the failing test**

Create `test/security.test.js`:

```js
/**
 * Session revocation, per-tenant lifetimes, the admin password floor, the
 * global tarpit, the audit trail and the ceiling exemption.
 * Run: node test/security.test.js
 */
process.env.SESSION_SECRET = 'test-secret-at-least-32-characters-long';
process.env.ADMIN_PASSWORD = 'a-long-enough-admin-password';
process.env.ACCESS_PASSWORD = 'reviewer-pass';

const assert = require('assert');
const path = require('path');
require('child_process').execSync(
  'npx tsc server/session.ts server/epoch.ts server/tenant.ts --outDir .test-build --module commonjs --target es2022 --skipLibCheck --esModuleInterop',
  { cwd: path.join(__dirname, '..', 'web'), stdio: 'pipe' },
);
const s = require('../web/.test-build/session.js');
const e = require('../web/.test-build/epoch.js');

(async () => {
  // The epoch survives the round trip and defaults to 0 when absent, so
  // cookies signed before this change keep working.
  const token = await s.signSession({ workspaceId: 'owner', admin: true, epoch: 3 }, 60);
  assert.equal((await s.verifySession(token)).epoch, 3);

  const { SignJWT } = require('../web/node_modules/jose');
  const old = await new SignJWT({ workspaceId: 'owner', admin: true })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d')
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
  assert.equal((await s.verifySession(old)).epoch, 0, 'a token from before this change is epoch 0');

  // The ttl argument governs expiry, so a tenant's lifetime cannot drift
  // from the cookie's.
  const brief = await s.signSession({ workspaceId: 'intellinews', admin: true, epoch: 0 }, 1);
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(await s.verifySession(brief), null, 'an expired token is refused');

  // Bumping one workspace does not touch the other.
  e.__resetEpochCache();
  assert.equal(await e.currentEpoch('owner'), 0, 'a workspace starts at zero');
  assert.equal(await e.bumpEpoch('intellinews'), 1);
  e.__resetEpochCache();
  assert.equal(await e.currentEpoch('intellinews'), 1);
  assert.equal(await e.currentEpoch('owner'), 0, 'the portfolio is untouched');

  console.log('security tests: ok');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/security.test.js`
Expected: FAIL. `tsc` cannot find `server/epoch.ts`.

- [ ] **Step 3: Write the epoch store**

Create `web/server/epoch.ts`:

```ts
/**
 * Per-workspace session epoch: the only thing that can end a session early.
 *
 * The cookie is a signed JWT, so the server cannot forget it. Rotating
 * SESSION_SECRET would work and would sign out both instances at once, which
 * is why it is not the answer. Each workspace instead carries an integer;
 * every token records the value it was signed under, and a token below the
 * stored value is refused. Bumping it ends every session for that instance
 * and no other.
 *
 * The value is cached in a module global for CACHE_MS rather than read on
 * every request. The trade is explicit: revocation takes up to a minute to
 * bite, and in exchange the common path adds no Firestore read. For a
 * single-operator tool that is the right side of it, and this constant is
 * the whole of the change if it ever is not.
 *
 * bumpEpoch writes the new value straight into the cache, so the caller who
 * pressed the button does not wait out the TTL to see it take effect.
 *
 * The path has four components and therefore names a document. See the header
 * of server/spend.ts for what an odd count costs.
 */
import { db as fsdb, storeEnabled } from './firebase';

const CACHE_MS = 60_000;

type Cached = { value: number; readAt: number };
declare global {
  var __cfEpoch: Map<string, Cached> | undefined;
  var __cfEpochMem: Map<string, number> | undefined;
}
const cache = globalThis.__cfEpoch ?? (globalThis.__cfEpoch = new Map<string, Cached>());
const mem = globalThis.__cfEpochMem ?? (globalThis.__cfEpochMem = new Map<string, number>());

const doc = (ws: string) => fsdb().doc(`system/auth/epoch/${ws}`);

async function read(ws: string): Promise<number> {
  if (!storeEnabled) return mem.get(ws) ?? 0;
  const snap = await doc(ws).get();
  const v = snap.exists ? (snap.data() as { value?: number }).value : 0;
  return typeof v === 'number' ? v : 0;
}

export async function currentEpoch(ws: string): Promise<number> {
  const hit = cache.get(ws);
  if (hit && Date.now() - hit.readAt < CACHE_MS) return hit.value;
  const value = await read(ws);
  cache.set(ws, { value, readAt: Date.now() });
  return value;
}

/** Ends every session for this workspace. Returns the new value. */
export async function bumpEpoch(ws: string): Promise<number> {
  const next = (await read(ws)) + 1;
  if (storeEnabled) await doc(ws).set({ value: next, at: new Date().toISOString() });
  else mem.set(ws, next);
  cache.set(ws, { value: next, readAt: Date.now() });
  return next;
}

export function __resetEpochCache(): void {
  cache.clear();
  mem.clear();
}
```

- [ ] **Step 4: Add the epoch claim and the ttl argument**

In `web/server/session.ts`, add `epoch` to the type:

```ts
export type Session = {
  workspaceId: string;
  /** True only for the admin password. Governs settings, prompts, spend. */
  admin: boolean;
  /**
   * The workspace's session epoch when this token was signed. server/auth.ts
   * refuses a token below the stored value, which is how a session is ended
   * without rotating the signing key. Absent in tokens issued before this
   * existed, which read back as 0 and stay valid.
   */
  epoch: number;
};
```

Replace `signSession` and the `verifySession` destructure:

```ts
/**
 * ttlSeconds comes from the tenant record rather than a constant here, so the
 * token's expiry and the cookie's maxAge cannot drift apart: the login route
 * passes the same number to both.
 */
export async function signSession(s: Session, ttlSeconds: number): Promise<string> {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret());
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const { workspaceId, admin, epoch } = payload as Record<string, unknown>;
    if (typeof workspaceId !== 'string' || !workspaceId) return null;
    return {
      workspaceId,
      admin: admin === true,
      epoch: typeof epoch === 'number' ? epoch : 0,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Enforce the epoch where sessions are read**

In `web/server/auth.ts`, add the import and the check:

```ts
import { currentEpoch } from './epoch';
```

```ts
export async function currentSession(): Promise<Session | null> {
  if (MOCK_AUTH) return { workspaceId: 'owner', admin: true, epoch: 0 };
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;
  // Revocation. Cached for a minute in server/epoch.ts, so this is a
  // comparison rather than a read on the common path.
  if (session.epoch < (await currentEpoch(session.workspaceId))) return null;
  return session;
}
```

- [ ] **Step 6: Fix the one existing caller of signSession**

`web/app/api/auth/login/route.ts` calls `signSession({ workspaceId: 'owner', admin: role === 'admin' })`. It needs the two new arguments to compile. Task 4 rewrites this route properly; for now make it build:

```ts
  res.cookies.set(SESSION_COOKIE, await signSession({ workspaceId: 'owner', admin: role === 'admin', epoch: 0 }, SEVEN_DAYS), {
```

- [ ] **Step 7: Run the tests**

Run: `node test/security.test.js`
Expected: PASS, printing `security tests: ok`.

Add `node test/security.test.js && ` after `node test/tenant.test.js && ` in `package.json`.

Run: `npm test`
Expected: everything passes. `test/session.test.js` calls `signSession` with one argument, which now produces `setExpirationTime('undefineds')` and throws. Update its two `signSession` calls to pass `, 604800` as the second argument and add `epoch: 0` to the session objects.

- [ ] **Step 8: Commit**

```bash
git add web/server/epoch.ts web/server/session.ts web/server/auth.ts web/app/api/auth/login/route.ts test/security.test.js test/session.test.js package.json
git commit -m "feat: sessions that can be ended without rotating the key"
```

---

### Task 3: A password floor, and guessing that does not pay

Two shared secrets and no usernames is the whole security model, and neither half is currently bounded: `ADMIN_PASSWORD` has no minimum length while `SESSION_SECRET` has one, and throttling is per-IP so rotating addresses defeats it.

The global counter deliberately does **not** lock the door. A global lockout would let anyone on the internet shut the owner out by failing a couple of hundred times, trading a guessing risk for a denial-of-service certainty. It delays instead.

**Files:**
- Modify: `web/server/throttle.ts`
- Modify: `web/server/session.ts`
- Modify: `test/security.test.js`
- Modify: `test/session.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `MIN_ADMIN_PASSWORD = 16` in `session.ts`; `GLOBAL_THRESHOLD = 100`, `TARPIT_MS = 2000`, `globalDelayMs(): Promise<number>` in `throttle.ts`. `__resetThrottle()` keeps its name and now clears the global counter too.

- [ ] **Step 1: Write the failing tests**

In `test/security.test.js`, extend the `tsc` invocation at the top of the file to include the throttle:

```js
  'npx tsc server/session.ts server/epoch.ts server/tenant.ts server/throttle.ts --outDir .test-build --module commonjs --target es2022 --skipLibCheck --esModuleInterop',
```

Append these blocks before the final `console.log`:

```js
  // The global counter delays; it must never refuse, or anyone could lock
  // the owner out by failing enough times from anywhere.
  const th = require('../web/.test-build/throttle.js');
  th.__resetThrottle();
  assert.equal(await th.globalDelayMs(), 0, 'a quiet door has no delay');
  for (let i = 0; i < th.GLOBAL_THRESHOLD + 1; i++) await th.recordFailure(`10.0.0.${i % 250}`);
  assert.equal(await th.globalDelayMs(), th.TARPIT_MS, 'past the threshold every attempt waits');
  assert.equal(await th.isLocked('10.0.0.251'), false, 'but a fresh address is not locked out');
  th.__resetThrottle();
  assert.equal(await th.globalDelayMs(), 0, 'and the reset clears the global bucket too');

  // The floor is a boot check, so it has to be observed in a fresh process:
  // the module throws at load and is cached after the first require here.
  const { execFileSync } = require('child_process');
  let threw = false;
  try {
    execFileSync(process.execPath, ['-e', "require('./web/.test-build/session.js')"], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, ADMIN_PASSWORD: 'short', SESSION_SECRET: process.env.SESSION_SECRET },
      stdio: 'pipe',
    });
  } catch (err) {
    threw = true;
    assert.ok(String(err.stderr).includes('ADMIN_PASSWORD'), 'the refusal names the variable it is about');
  }
  assert.ok(threw, 'a short admin password refuses to boot');
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/security.test.js`
Expected: FAIL with `th.globalDelayMs is not a function`.

- [ ] **Step 3: Add the global counter**

In `web/server/throttle.ts`, add below `WINDOW_MS`:

```ts
/**
 * The per-IP lock above stops one address guessing. It does nothing about a
 * hundred addresses guessing once each, which is the shape that suits a
 * shared password with no username.
 *
 * This second counter is global and deliberately does NOT lock. A global
 * lockout would let anyone on the internet shut the owner out by failing
 * GLOBAL_THRESHOLD times, trading a guessing risk for a denial-of-service
 * certainty. Past the threshold every attempt at every door simply waits
 * TARPIT_MS before the password is checked: guessing at scale stops paying,
 * and one person with the right password waits two seconds.
 */
export const GLOBAL_THRESHOLD = 100;
export const TARPIT_MS = 2000;
const GLOBAL_KEY = '__global';
```

Replace `recordFailure` with a version that counts twice, and add the reader:

```ts
async function bump(k: string): Promise<void> {
  const rec = await read(k);
  if (!rec || Date.now() - rec.firstAt > WINDOW_MS) {
    await write(k, { count: 1, firstAt: Date.now() });
    return;
  }
  await write(k, { count: rec.count + 1, firstAt: rec.firstAt });
}

export async function recordFailure(ip: string): Promise<void> {
  await bump(ip);
  await bump(GLOBAL_KEY);
}

/** Milliseconds every attempt must wait before its password is checked. */
export async function globalDelayMs(): Promise<number> {
  const rec = await read(GLOBAL_KEY);
  if (!rec || Date.now() - rec.firstAt > WINDOW_MS) return 0;
  return rec.count >= GLOBAL_THRESHOLD ? TARPIT_MS : 0;
}
```

`isLocked` stays exactly as it is: it reads whatever key it is given, and no caller passes `__global`. `__resetThrottle` already clears the whole in-memory map, so it clears the global bucket with everything else; leave it alone.

- [ ] **Step 4: Add the password floor**

In `web/server/session.ts`, below the `secret()` function:

```ts
/**
 * The signing key already refuses to be short. The password that guards
 * everything did not, which is the wrong way round: a leaked short password
 * is the whole system, and one instance of this deployment now holds a
 * client's unpublished work.
 *
 * A boot-time refusal rather than a warning, matching how SESSION_SECRET,
 * claude.js and storage.ts all fail: a deployment that cannot be secured
 * should not serve.
 */
export const MIN_ADMIN_PASSWORD = 16;
if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length < MIN_ADMIN_PASSWORD) {
  throw new Error(
    `ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD} characters. ` +
      'Set a longer one in the environment before deploying. See docs/DEPLOY.md.',
  );
}
```

- [ ] **Step 5: Fix the suite this breaks**

`test/session.test.js` sets `ADMIN_PASSWORD = 'correct-horse'`, which is 13 characters and now refuses to boot. Change the assignment:

```js
process.env.ADMIN_PASSWORD = 'correct-horse-battery-staple';
```

and the assertion that uses the value:

```js
  assert.equal(s.checkPassword('correct-horse-battery-staple'), 'admin', 'the admin password is admin');
```

Search that file for every other occurrence of `correct-horse` and update each one.

- [ ] **Step 6: Run the tests**

Run: `node test/security.test.js && node test/session.test.js`
Expected: both PASS.

Run: `npm test`
Expected: all pass. `test/isolation.test.js` already uses a 27-character admin password and is unaffected.

- [ ] **Step 7: Commit**

```bash
git add web/server/throttle.ts web/server/session.ts test/security.test.js test/session.test.js
git commit -m "feat: bound the guessing and the password that guards everything"
```

---

### Task 4: The login route learns about doors

One route serves both doors. The tenant arrives in the body, the reviewer password is refused where the tenant says so, and the refusal is indistinguishable from a wrong password.

**Files:**
- Create: `web/server/audit.ts`
- Modify: `web/app/api/auth/login/route.ts`
- Modify: `test/security.test.js`

**Interfaces:**
- Consumes: `tenantById`, `tenantByDoor`, `DEFAULT_TENANT`, `DOOR_COOKIE` (Task 1); `signSession` (Task 2); `currentEpoch` (Task 2); `globalDelayMs` (Task 3).
- Produces:
  - `type SignInAttempt = { at: string; tenant: string; outcome: 'success' | 'refused' | 'locked'; ip: string; ua: string }`
  - `recordSignIn(a: SignInAttempt): Promise<void>`
  - `listSignIns(limit?: number): Promise<SignInAttempt[]>`
  - `__resetAudit(): void`

- [ ] **Step 1: Write the failing test**

Add `server/audit.ts` to the `tsc` argument list at the top of `test/security.test.js`, then append before the final `console.log`:

```js
  const audit = require('../web/.test-build/audit.js');
  audit.__resetAudit();
  await audit.recordSignIn({ at: '2026-09-04T10:00:00.000Z', tenant: 'intellinews', outcome: 'refused', ip: '203.0.113.4', ua: 'probe/1.0' });
  await audit.recordSignIn({ at: '2026-09-04T10:00:01.000Z', tenant: 'intellinews', outcome: 'success', ip: '203.0.113.4', ua: 'probe/1.0' });
  const rows = await audit.listSignIns(10);
  assert.equal(rows.length, 2, 'both the failure and the success are recorded');
  assert.equal(rows[0].outcome, 'success', 'newest first');
  assert.equal(rows[1].outcome, 'refused', 'a run of failures before a success is visible as one story');
  assert.equal(rows[0].tenant, 'intellinews');
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/security.test.js`
Expected: FAIL. `tsc` cannot find `server/audit.ts`.

- [ ] **Step 3: Write the audit store**

Create `web/server/audit.ts`:

```ts
/**
 * A record of who came in.
 *
 * The cheapest control in this codebase and the only one that helps AFTER
 * something has gone wrong. Failures are written as well as successes, so a
 * run of refusals followed by a success reads as one story rather than two
 * unrelated facts.
 *
 * Not namespaced by workspace: this is about the doors, and a reader looking
 * for something wrong wants both instances in one list. The route that reads
 * it is admin-only.
 *
 * system/auth/signins/{id} is four components and names a document.
 */
import { randomUUID } from 'crypto';
import { db as fsdb, storeEnabled } from './firebase';

export type SignInAttempt = {
  at: string;
  tenant: string;
  outcome: 'success' | 'refused' | 'locked';
  ip: string;
  ua: string;
};

const RETENTION_DAYS = 90;
const COLLECTION = 'system/auth/signins';

declare global { var __cfAudit: SignInAttempt[] | undefined; }
const mem = globalThis.__cfAudit ?? (globalThis.__cfAudit = []);

export async function recordSignIn(a: SignInAttempt): Promise<void> {
  // A failure to write the audit row must never fail the sign-in itself:
  // that would turn a logging outage into a lockout.
  try {
    if (!storeEnabled) { mem.unshift(a); return; }
    await fsdb().doc(`${COLLECTION}/${randomUUID()}`).set(a);
  } catch { /* recorded nowhere beats refusing the owner entry */ }
}

export async function listSignIns(limit = 50): Promise<SignInAttempt[]> {
  const horizon = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();
  if (!storeEnabled) {
    return mem.filter((a) => a.at >= horizon).sort((x, y) => y.at.localeCompare(x.at)).slice(0, limit);
  }
  const snap = await fsdb()
    .collection(COLLECTION)
    .where('at', '>=', horizon)
    .orderBy('at', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as SignInAttempt);
}

export function __resetAudit(): void { mem.length = 0; }
```

- [ ] **Step 4: Rewrite the login route**

In `web/app/api/auth/login/route.ts`, replace the imports:

```ts
import { NextResponse } from 'next/server';
import { checkPassword, signSession } from '@/server/session';
import { isLocked, recordFailure, clearFailures, globalDelayMs } from '@/server/throttle';
import { SESSION_COOKIE } from '@/server/auth';
import { tenantById, tenantByDoor, DEFAULT_TENANT, DOOR_COOKIE } from '@/server/tenant';
import { currentEpoch } from '@/server/epoch';
import { recordSignIn } from '@/server/audit';
```

Delete the `SEVEN_DAYS` constant (the tenant record supplies the lifetime now) and replace `POST` entirely. Leave `clientIp` exactly as it is:

```ts
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const ip = clientIp(req);
  const ua = (req.headers.get('user-agent') || '').slice(0, 200);
  const body = await req.json().catch(() => ({} as any));

  // An unknown tenant is a bad request, not a fallback. Falling back would
  // let a typo at the IntelliNews door quietly issue a portfolio session.
  const tenant = body.tenant === undefined ? DEFAULT_TENANT : tenantById(String(body.tenant));
  if (!tenant) {
    return NextResponse.json({ error: 'Unknown sign-in door' }, { status: 400 });
  }
  const at = new Date().toISOString();

  if (await isLocked(ip)) {
    await recordSignIn({ at, tenant: tenant.id, outcome: 'locked', ip, ua });
    return NextResponse.json({ error: 'Too many attempts. Try again in fifteen minutes.' }, { status: 429 });
  }

  // The tarpit runs before the password is checked and before the empty-body
  // refusal, so a bulk guesser pays it whatever it sends.
  const delay = await globalDelayMs();
  if (delay) await sleep(delay);

  const password = body.password;
  if (!password) {
    return NextResponse.json({ error: 'A password is required' }, { status: 400 });
  }

  const role = checkPassword(password);

  // A reviewer password at an admin-only door gets the same status and the
  // same words as a wrong password. A distinct message would tell whoever
  // holds the reviewer password that they had found a real door and guessed
  // the wrong secret.
  const admitted = role === 'admin' || (role === 'user' && !tenant.adminOnly);
  if (!admitted) {
    await recordFailure(ip);
    await recordSignIn({ at, tenant: tenant.id, outcome: 'refused', ip, ua });
    return NextResponse.json({ error: 'That password was not recognised' }, { status: 401 });
  }

  await clearFailures(ip);
  await recordSignIn({ at, tenant: tenant.id, outcome: 'success', ip, ua });

  const session = {
    workspaceId: tenant.id,
    admin: role === 'admin',
    epoch: await currentEpoch(tenant.id),
  };
  const res = NextResponse.json({ ok: true, admin: session.admin });
  const cookie = {
    httpOnly: true, secure: true, sameSite: 'lax' as const,
    maxAge: tenant.sessionTtlSeconds, path: '/',
  };
  // One number governs the token's expiry and the cookie's lifetime, so the
  // two cannot drift apart.
  res.cookies.set(SESSION_COOKIE, await signSession(session, tenant.sessionTtlSeconds), cookie);
  // Holds a path and no secret. Read only by the proxy, to send an expired
  // session back to its own door.
  res.cookies.set(DOOR_COOKIE, tenant.doorPath, cookie);
  return res;
}
```

`DELETE` also clears the door cookie:

```ts
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(DOOR_COOKIE);
  return res;
}
```

`PUT` reads the door before clearing it, so a form-post sign-out lands at the right one:

```ts
/** Sign out from a plain form post, so the header needs no client component. */
export async function PUT(req: Request) {
  const url = new URL(req.url);
  const raw = req.headers.get('cookie')?.match(/(?:^|;\s*)cf_door=([^;]+)/)?.[1];
  const claimed = raw ? decodeURIComponent(raw) : '';
  // Never redirect to a value out of a cookie without checking it names a
  // door we actually have.
  const door = tenantByDoor(claimed) ? claimed : DEFAULT_TENANT.doorPath;
  const res = NextResponse.redirect(new URL(door, url.origin), 303);
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(DOOR_COOKIE);
  return res;
}
```

- [ ] **Step 5: Run the tests**

Run: `node test/security.test.js`
Expected: PASS.

Run: `npm run verify`
Expected: build succeeds, all suites pass. `test/isolation.test.js` posts to `/api/auth/login` with no `tenant` field, which is the portfolio default, so it is unaffected.

- [ ] **Step 6: Commit**

```bash
git add web/server/audit.ts web/app/api/auth/login/route.ts test/security.test.js
git commit -m "feat: one login route, two doors, and a record of both"
```

---

### Task 5: The IntelliNews door

**Files:**
- Create: `web/app/intellinews-CampaignF/page.tsx`
- Modify: `web/proxy.ts`
- Create: `test/instance.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: the login route from Task 4; `TENANTS`, `DOOR_COOKIE`, `tenantByDoor`, `DEFAULT_TENANT` from Task 1.
- Produces: a public route at `/intellinews-CampaignF`.

- [ ] **Step 1: Write the failing test**

Create `test/instance.test.js`:

```js
/**
 * The IntelliNews door, end to end against a running server.
 *
 * Like test/isolation.test.js this runs with real sign-in rather than
 * MOCK_AUTH, because it is the only way to tell a working door from a
 * decorative one. It shares that suite's constraint: startNext gives every
 * request the same address, so anything provoking the per-IP lockout has to
 * run last. Nothing here provokes it; eleven failures are needed and this
 * file makes three.
 *
 * Run: node test/instance.test.js
 */
const assert = require('assert');
const { startNext } = require('./helpers/next-server');

const PORT = 3229;
const base = `http://localhost:${PORT}`;

const env = {
  ...process.env,
  MOCK_CLAUDE: '1',
  ADMIN_PASSWORD: 'owner-super-secret-password',
  ACCESS_PASSWORD: 'reviewer-shared-password',
  SESSION_SECRET: 'a'.repeat(48),
  PORT: String(PORT),
};
delete env.MOCK_AUTH;
delete env.FIREBASE_SERVICE_ACCOUNT;
delete env.FIRESTORE_EMULATOR_HOST;

const server = startNext(PORT, env);
process.on('exit', () => server.kill());

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const login = (password, tenant) =>
  fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(tenant === undefined ? { password } : { password, tenant }),
  });
const cookieString = (res) => res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

(async () => {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(base + '/api/health'); if (r.ok) break; } catch {} await wait(500); }

  // The door is reachable without a session, or nobody could ever sign in.
  const door = await fetch(base + '/intellinews-CampaignF');
  assert.equal(door.status, 200, 'the IntelliNews door is public');
  assert.ok((await door.text()).includes('IntelliNews'), 'and says whose it is');

  // The reviewer password is refused here, with the same words as a wrong one.
  const reviewer = await login('reviewer-shared-password', 'intellinews');
  const wrong = await login('not-the-password', 'intellinews');
  assert.equal(reviewer.status, 401, 'the access password does not open IntelliNews');
  assert.equal(wrong.status, 401);
  assert.deepEqual(await reviewer.json(), await wrong.json(), 'and is indistinguishable from a wrong guess');
  assert.equal(reviewer.headers.getSetCookie().length, 0, 'no cookie is issued');

  // The same password still opens the portfolio door.
  const portfolio = await login('reviewer-shared-password');
  assert.equal(portfolio.status, 200, 'the reviewer can still reach the portfolio');
  assert.ok(
    /Max-Age=604800/.test(portfolio.headers.getSetCookie().join('
')),
    'and its session is still seven days',
  );

  // An unknown door is a 400, never a quiet fallback to the portfolio.
  const unknown = await login('owner-super-secret-password', 'nope');
  assert.equal(unknown.status, 400);
  assert.equal(unknown.headers.getSetCookie().length, 0);

  // The admin password opens it, and stamps the workspace and the door.
  const ok = await login('owner-super-secret-password', 'intellinews');
  assert.equal(ok.status, 200);
  const cookies = ok.headers.getSetCookie().join('\n');
  assert.ok(/cf_session=/.test(cookies), 'a session is issued');
  assert.ok(/cf_door=(%2F|\/)intellinews-CampaignF/.test(cookies), 'the door is remembered');
  assert.ok(/Max-Age=86400/.test(cookies), 'a day, not a week');

  // An absent session at a page returns to the door it came from.
  const bounced = await fetch(base + '/clients', {
    redirect: 'manual',
    headers: { cookie: 'cf_door=%2Fintellinews-CampaignF' },
  });
  assert.equal(bounced.status, 307);
  assert.ok(bounced.headers.get('location').includes('/intellinews-CampaignF'), 'not the portfolio door');

  // With no door cookie the portfolio door is still the default.
  const plain = await fetch(base + '/clients', { redirect: 'manual' });
  assert.ok(plain.headers.get('location').includes('/login'));

  // A door cookie naming somewhere that is not a door is not trusted.
  const forged = await fetch(base + '/clients', {
    redirect: 'manual',
    headers: { cookie: 'cf_door=https%3A%2F%2Fevil.example' },
  });
  assert.ok(forged.headers.get('location').includes('/login'), 'an unknown door falls back');

  server.kill();
  console.log('instance tests: ok');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `MOCK_CLAUDE=1 npm run web:build && node test/instance.test.js`
Expected: FAIL on the first assertion. `/intellinews-CampaignF` does not exist, so the proxy redirects it to `/login`.

- [ ] **Step 3: Build the door**

Create `web/app/intellinews-CampaignF/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { TENANTS } from '@/server/tenant';

/**
 * The IntelliNews door.
 *
 * A separate page rather than a query parameter on /login, because the two
 * doors say different things: this one is for client work and has no case to
 * make to a stranger, so it carries none of the product pitch the portfolio
 * door leads with.
 *
 * Only the door is prefixed. After sign-in the cookie decides which instance
 * a request is inside, so the ordinary paths serve IntelliNews data and no
 * link in the app needs to know about tenants.
 *
 * server/tenant.ts is imported for the label only. It is pure data with no
 * I/O, so it is safe in a client component.
 */
const TENANT = TENANTS.intellinews;

export default function IntelliNewsDoor() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: form.get('password'), tenant: TENANT.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign-in failed');
      // No ?next= here. The portfolio door honours one because a reviewer
      // arrives at a deep link; this door has one destination.
      window.location.href = '/clients';
    } catch (err: any) {
      setError(err.message || 'Sign-in failed');
      setBusy(false);
    }
  }

  return (
    <main className="shell" style={{ maxWidth: 460, paddingTop: 72 }} data-tenant={TENANT.id}>
      <h1>{TENANT.label}</h1>
      <p className="login-tagline">Client work. Separate library, separate sign-in.</p>
      <p className="muted" style={{ marginBottom: 24 }}>
        This instance is for IntelliNews campaigns. The reviewer password does not open it.
      </p>
      <form onSubmit={submit}>
        <label className="field" htmlFor="password"><span>Password</span>
          <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus /></label>
        <button className="btn-primary" type="submit" disabled={busy} style={{ marginTop: 20 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {error && <p className="form-error" style={{ marginTop: 16 }}>{error}</p>}
    </main>
  );
}
```

- [ ] **Step 4: Open the door in the proxy**

Replace `web/proxy.ts`:

```ts
/**
 * Proxy (formerly middleware). Everything except the sign-in doors,
 * /api/auth/login, /api/health and /robots.txt requires a session cookie.
 * The cookie's validity is checked in the route handlers and server
 * components (the proxy runs on the edge and cannot use firebase-admin);
 * this is the cheap gate that keeps unauthenticated requests off the pages.
 *
 * It also decides WHICH door an expired session returns to. It cannot verify
 * the JWT and so cannot read the workspace out of it, which is why sign-in
 * writes cf_door beside the session: a path and no secret. A cf_door naming
 * anything that is not a registered door is discarded rather than trusted,
 * so it cannot be used to bounce someone to another site.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { TENANTS, DOOR_COOKIE, tenantByDoor, DEFAULT_TENANT } from './server/tenant';

const DOORS = Object.values(TENANTS).map((t) => t.doorPath);
// /robots.txt is public because a crawler cannot obey a rule it is redirected
// away from. Everything behind it needs a session anyway, so this only makes
// the refusal legible rather than opening anything.
const PUBLIC = [...DOORS, '/api/auth/login', '/api/health', '/robots.txt'];

export default function proxy(req: NextRequest) {
  if (process.env.MOCK_AUTH === '1') return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (req.cookies.get('cf_session')) return NextResponse.next();

  const claimed = req.cookies.get(DOOR_COOKIE)?.value;
  const door = claimed && tenantByDoor(claimed) ? claimed : DEFAULT_TENANT.doorPath;
  const url = req.nextUrl.clone();
  url.pathname = door;
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.css$|.*\\.js$).*)'],
};
```

- [ ] **Step 5: Run the test**

Run: `MOCK_CLAUDE=1 npm run web:build && node test/instance.test.js`
Expected: PASS, printing `instance tests: ok`.

- [ ] **Step 6: Register the suite and run everything**

Add `node test/instance.test.js && ` after `node test/isolation.test.js && ` in `package.json`.

Run: `npm run verify`
Expected: the build succeeds and every suite passes.

- [ ] **Step 7: Commit**

```bash
git add web/app/intellinews-CampaignF/page.tsx web/proxy.ts test/instance.test.js package.json
git commit -m "feat: a door for IntelliNews, admin only"
```

---

### Task 6: It looks like the instance you are in

**Files:**
- Modify: `web/components/Nav.tsx`
- Modify: `web/components/SignOut.tsx`
- Modify: `web/app/layout.tsx`
- Modify: `web/app/globals.css`
- Modify: `test/instance.test.js`

**Interfaces:**
- Consumes: `tenantFor` (Task 1), `currentSession` (Task 2).
- Produces: `data-tenant` on the header element, which `globals.css` styles. `SignOut` now takes `{ username: string; door: string }`.

- [ ] **Step 1: Write the failing test**

Insert into `test/instance.test.js`, immediately after the `Max-Age=86400` assertion:

```js
  const session = cookieString(ok);
  const shell = await (await fetch(base + '/clients', { headers: { cookie: session } })).text();
  assert.ok(shell.includes('IntelliNews Campaign Forge'), 'the header names the instance');
  assert.ok(shell.includes('data-tenant="intellinews"'), 'and the accent has something to hook');

  const pcookie = cookieString(await login('owner-super-secret-password'));
  const pshell = await (await fetch(base + '/clients', { headers: { cookie: pcookie } })).text();
  assert.ok(!pshell.includes('IntelliNews'), 'the portfolio is unbranded by it');
  assert.ok(pshell.includes('brief in, campaign out'), 'and keeps its own strapline');
```

- [ ] **Step 2: Run it and watch it fail**

Run: `MOCK_CLAUDE=1 npm run web:build && node test/instance.test.js`
Expected: FAIL on `the header names the instance`.

- [ ] **Step 3: Brand the header**

Replace `web/components/Nav.tsx`:

```tsx
import Link from 'next/link';
import { currentSession } from '@/server/auth';
import { tenantFor } from '@/server/tenant';
import SignOut from './SignOut';

/**
 * Global header. Renders the brand alone when signed out.
 *
 * It already awaited the session, so it already knows which instance this is:
 * the label, the strapline and the accent all come from the tenant record
 * rather than from a constant here.
 */
export default async function Nav() {
  const session = await currentSession();
  const tenant = tenantFor(session);
  return (
    <header className="top" data-tenant={tenant.id}>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <Link href={session ? '/clients' : tenant.doorPath}><h1>{tenant.label}</h1></Link>
        <span className="brand-sub">{tenant.strapline}</span>
      </div>
      {session && (
        <nav className="nav-links">
          <Link href="/clients">Clients</Link>
          <Link href="/check">Check copy</Link>
          <Link href="/ledger">Ledger</Link>
          <Link href="/settings">Settings</Link>
          <SignOut username={session.admin ? 'Admin' : 'Reviewer'} door={tenant.doorPath} />
        </nav>
      )}
    </header>
  );
}
```

- [ ] **Step 4: Sign out to the right door**

In `web/components/SignOut.tsx`, take the door as a prop:

```tsx
export default function SignOut({ username, door }: { username: string; door: string }) {
  async function signOut() {
    await fetch('/api/auth/login', { method: 'DELETE' });
    window.location.href = door;
  }
  return (
    <button type="button" className="signout" title={username} onClick={signOut}>
      Sign out
    </button>
  );
}
```

- [ ] **Step 5: Title the tab correctly**

In `web/app/layout.tsx`, add the imports and replace the `export const metadata` object with a function. Keep every field, including the `robots` block:

```ts
import { currentSession } from '@/server/auth';
import { tenantFor } from '@/server/tenant';

export async function generateMetadata(): Promise<Metadata> {
  const tenant = tenantFor(await currentSession());
  return {
    metadataBase: new URL(siteUrl),
    title: { default: tenant.label, template: `%s · ${tenant.label}` },
    description,
    applicationName: tenant.label,
    // The card keeps the portfolio wording on purpose. It is what appears
    // when the link is pasted into an application email, and the IntelliNews
    // instance is never pasted anywhere.
    openGraph: {
      type: 'website',
      siteName: tenant.label,
      title: 'Campaign Forge, brief in and campaign out',
      description,
      url: '/',
    },
    twitter: { card: 'summary_large_image', title: 'Campaign Forge, brief in and campaign out', description },
    // Deliberately out of the index, for both instances. One holds real
    // client briefs and generated copy, shown to people sent the link; the
    // other holds a client's unpublished work. app/robots.ts says the same
    // to crawlers that read that instead.
    robots: { index: false, follow: false, nocache: true,
      googleBot: { index: false, follow: false, noimageindex: true } },
  };
}
```

- [ ] **Step 6: Give the instance its own accent**

Append to `web/app/globals.css`:

```css
/* The second instance. A different accent so a glance at the header tells you
   which library you are about to write into. */
.top[data-tenant='intellinews'] .brand-mark { background: var(--ember); }
.top[data-tenant='intellinews'] .brand-sub { color: var(--ember-text); }
```

Confirm `--ember` and `--ember-text` exist in the `:root` block at the top of that file. If either does not, use `--teal-ink` rather than inventing a token: `test/a11y.test.js` only checks pairings named in its `PAIRS` table, and a new token would be unchecked.

- [ ] **Step 7: Run the tests**

Run: `MOCK_CLAUDE=1 npm run web:build && node test/instance.test.js && node test/pages.test.js && node test/a11y.test.js`
Expected: all PASS.

Run: `npm run verify`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add web/components/Nav.tsx web/components/SignOut.tsx web/app/layout.tsx web/app/globals.css test/instance.test.js
git commit -m "feat: the header says which instance you are in"
```

---

### Task 7: IntelliNews is not governed by the ceiling

Exempt means neither blocked nor counted. Excluding exempt spend from the *total* is not tidiness: without it a busy client month would silently start refusing runs on the deployment sent to reviewers.

**Files:**
- Modify: `web/server/db.ts`
- Modify: `web/server/spend.ts`
- Modify: `test/db.test.js`
- Modify: `test/security.test.js`

**Interfaces:**
- Consumes: `isExempt` (Task 1).
- Produces: `listLedgerForCeiling(month?: string): Promise<LedgerEntry[]>` in `server/db.ts`.

- [ ] **Step 1: Read the ledger writer's real signature**

Open `web/server/db.ts` and find the function that appends a ledger entry, and the `LedgerEntry` type in `web/server/types.ts`. The test below calls it `appendLedger(ws, entry)`; if it is named differently or takes different fields, use the real name and shape. Do not change the function to match the test.

- [ ] **Step 2: Write the failing test**

Append to `test/db.test.js`, before its final `console.log`, using that real name and the module alias that file already uses for the db module:

```js
  // The ceiling's total excludes exempt workspaces. Without this, a busy
  // IntelliNews month would quietly start refusing runs on the portfolio.
  await db.appendLedger('owner', { agent: 'copywriter', costEur: 1, at: new Date().toISOString() });
  await db.appendLedger('intellinews', { agent: 'copywriter', costEur: 40, at: new Date().toISOString() });
  const everything = await db.listLedgerAllWorkspaces();
  const forCeiling = await db.listLedgerForCeiling();
  assert.ok(everything.some((e) => e.costEur === 40), 'the Ledger page still sees IntelliNews spend');
  assert.ok(!forCeiling.some((e) => e.costEur === 40), 'the ceiling does not');
  assert.ok(forCeiling.some((e) => e.costEur === 1), 'and still sees the portfolio');

  // The separation the whole instance rests on. db.test.js already proves two
  // workspaces cannot see each other; this names the two that now exist, so a
  // change to the tenant ids cannot quietly break it.
  const a = await db.createClient('owner', { name: 'Portfolio client' });
  const b = await db.createClient('intellinews', { name: 'Client work' });
  const ownerList = await db.listClients('owner');
  const inList = await db.listClients('intellinews');
  assert.ok(ownerList.some((c) => c.clientId === a.clientId));
  assert.ok(!ownerList.some((c) => c.clientId === b.clientId), 'the portfolio cannot see client work');
  assert.ok(!inList.some((c) => c.clientId === a.clientId), 'and the reverse');
```

- [ ] **Step 3: Run it and watch it fail**

Run: `node test/db.test.js`
Expected: FAIL with `db.listLedgerForCeiling is not a function`.

- [ ] **Step 4: Add the ceiling's view of the ledger**

In `web/server/db.ts`, add the import at the top and the function directly below `listLedgerAllWorkspaces`:

```ts
import { isExempt } from './tenant';
```

```ts
/**
 * The ledger the CEILING reads, which is not the ledger the Ledger page
 * reads. An exempt workspace is not merely un-blocked: its spend must not
 * consume anyone else's allowance either, or a busy month on the client
 * instance would silently start refusing runs on the portfolio deployment
 * that gets sent to reviewers. Exempt means neither blocked nor counted.
 *
 * Everything stays visible and priced in the Ledger. The ceiling is a gate,
 * not the accounting.
 */
export async function listLedgerForCeiling(month?: string): Promise<LedgerEntry[]> {
  let docs: LedgerEntry[];
  if (!storeEnabled) {
    docs = [];
    for (const [key, col] of mem.sub) {
      if (!key.endsWith('/ledger')) continue;
      // Keys are `users/{ws}/ledger`.
      const ws = key.split('/')[1] ?? '';
      if (isExempt(ws)) continue;
      docs.push(...col.values());
    }
  } else {
    const snap = await fsdb().collectionGroup('ledger').get();
    docs = snap.docs
      // The parent of a `ledger` collection is the `users/{ws}` document.
      .filter((d) => !isExempt(d.ref.parent.parent?.id ?? ''))
      .map((d) => d.data() as LedgerEntry);
  }
  const filtered = month ? docs.filter((e) => e.at.startsWith(month)) : docs;
  return filtered.sort((a, b) => b.at.localeCompare(a.at));
}
```

Leave `listLedgerAllWorkspaces` in place and unchanged. The Ledger page still uses it.

- [ ] **Step 5: Exempt the workspace in the ceiling check**

In `web/server/spend.ts`, change the imports and `checkCeiling`:

```ts
import { listLedger, ledgerTotals, listLedgerForCeiling } from './db';
import { isExempt } from './tenant';
```

```ts
export async function checkCeiling(ws: string, agent: string): Promise<{ warning?: string }> {
  // An exempt workspace is not governed by the ceiling. Its spend is still
  // priced and still appears in the Ledger; see listLedgerForCeiling.
  if (isExempt(ws)) return {};
  const settings = await getSettings();
  if (!settings.monthlyCeilingEur) return {};
  const month = new Date().toISOString().slice(0, 7);
  const spent = ledgerTotals(await listLedgerForCeiling(month)).costEur;
  const next = await estimate(ws, agent);
  if (spent + next <= settings.monthlyCeilingEur) return {};

  const message = `This run would take ${month} past the €${settings.monthlyCeilingEur} ceiling (€${spent.toFixed(2)} spent, about €${next.toFixed(2)} more). Raise or clear the ceiling in Settings.`;
  if (settings.ceilingAction === 'warn') return { warning: message };
  throw Object.assign(new Error(message), { status: 402 });
}
```

- [ ] **Step 6: Assert the gate itself**

Append to `test/security.test.js`, before the final `console.log`, and extend its `tsc` argument list with `server/spend.ts server/db.ts server/firebase.ts`:

```js
  const spend = require('../web/.test-build/spend.js');
  await spend.saveSettings({ monthlyCeilingEur: 0.01, ceilingAction: 'refuse' });
  await assert.rejects(
    () => spend.checkCeiling('owner', 'copywriter'),
    /ceiling/,
    'the portfolio is refused past the ceiling',
  );
  assert.deepEqual(
    await spend.checkCeiling('intellinews', 'copywriter'),
    {},
    'and IntelliNews is not',
  );
```

If `tsc` complains about `firebase-admin` types while compiling `server/db.ts`, add `--types node` to the invocation. Do not add `--noResolve`; it breaks the import graph.

- [ ] **Step 7: Run the tests**

Run: `node test/db.test.js && node test/security.test.js`
Expected: both PASS.

Run: `npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add web/server/db.ts web/server/spend.ts test/db.test.js test/security.test.js
git commit -m "feat: the ceiling neither blocks nor counts the client instance"
```

---

### Task 8: Uploads are bounded and typed

`app/api/clients/[id]/sources/route.ts` accepts any file of any size and hands it to `pdf-parse` or `mammoth`. Both are parsers, and an unbounded parser on a function with an 800-second timeout is a cheap way to burn the account.

**Files:**
- Create: `web/server/uploads.ts`
- Modify: `web/app/api/clients/[id]/sources/route.ts`
- Modify: `test/tenant.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MAX_UPLOAD_BYTES = 10 * 1024 * 1024`
  - `checkUpload(name: string, mime: string, size: number): { ok: true } | { ok: false; status: 413 | 415; message: string }`
  - `storageName(name: string): string`

- [ ] **Step 1: Write the failing test**

Add `server/uploads.ts` to the `tsc` argument list in `test/tenant.test.js`, then append before its final `console.log`:

```js
  const u = require('../web/.test-build/uploads.js');

  assert.equal(u.checkUpload('brand.pdf', 'application/pdf', 1000).ok, true);
  assert.equal(u.checkUpload('notes.md', 'text/markdown', 1000).ok, true);
  assert.equal(u.checkUpload('deck.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1000).ok, true);
  assert.equal(u.checkUpload('brand.pdf', 'application/pdf; charset=binary', 1000).ok, true, 'a charset parameter is not a different type');

  const big = u.checkUpload('brand.pdf', 'application/pdf', u.MAX_UPLOAD_BYTES + 1);
  assert.equal(big.ok, false);
  assert.equal(big.status, 413, 'too large is 413, not a generic 400');

  assert.equal(u.checkUpload('payload.exe', 'application/octet-stream', 10).status, 415);
  // The extension and the declared type must agree: a caller controls both,
  // so trusting either alone trusts the caller.
  assert.equal(u.checkUpload('payload.exe', 'application/pdf', 10).status, 415, 'a pdf type does not launder an exe');
  assert.equal(u.checkUpload('brand.pdf', 'application/octet-stream', 10).status, 415, 'nor the reverse');

  // Names are reduced, bounded, and made unique.
  assert.ok(!u.storageName('../../etc/passwd').includes('/'), 'no separators survive');
  assert.ok(u.storageName('a'.repeat(400) + '.pdf').length <= 120, 'and no unbounded lengths');
  assert.notEqual(u.storageName('brand.pdf'), u.storageName('brand.pdf'), 'two uploads of one name do not collide');
  assert.ok(u.storageName('Brand Guidelines v2.pdf').endsWith('.pdf'), 'the extension is kept');
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/tenant.test.js`
Expected: FAIL. `tsc` cannot find `server/uploads.ts`.

- [ ] **Step 3: Write the rules**

Create `web/server/uploads.ts`:

```ts
/**
 * What may be uploaded, and under what name it is stored.
 *
 * The types allowed here are exactly what lib/sources.js can read. Anything
 * else would be stored, counted as a source, and then silently contribute
 * nothing, so refusing it is more honest than accepting it.
 *
 * The size cap matters more than it looks. pdf-parse and mammoth are parsers
 * running on a function whose timeout is 800 seconds, so an unbounded upload
 * is a cheap way to burn the account without ever signing in as an admin.
 *
 * Extension AND declared type must both be allowed and must agree. A caller
 * controls both, so trusting either alone trusts the caller. This is a filter
 * against accidents and cheap probes; it is not content inspection and is not
 * claimed to be.
 */
import { randomBytes } from 'crypto';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_NAME = 120;

const ALLOWED: { ext: string; mimes: string[] }[] = [
  { ext: '.pdf', mimes: ['application/pdf'] },
  { ext: '.docx', mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  { ext: '.txt', mimes: ['text/plain'] },
  { ext: '.md', mimes: ['text/markdown', 'text/x-markdown', 'text/plain'] },
];

export type UploadVerdict = { ok: true } | { ok: false; status: 413 | 415; message: string };

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

export function checkUpload(name: string, mime: string, size: number): UploadVerdict {
  if (size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 413,
      message: `${name} is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`,
    };
  }
  const rule = ALLOWED.find((a) => a.ext === extensionOf(name));
  // Strip any parameters: "text/plain; charset=utf-8" is text/plain.
  const declared = (mime || '').split(';')[0].trim().toLowerCase();
  if (!rule || !rule.mimes.includes(declared)) {
    return {
      ok: false,
      status: 415,
      message: `${name} is not a type this reads. PDF, DOCX, TXT and Markdown are accepted.`,
    };
  }
  return { ok: true };
}

/**
 * The stored key's last segment.
 *
 * Not a traversal fix: R2 keys are literal strings, so "../" in a filename
 * cannot escape the users/{ws}/ prefix and the guard in storage.ts holds.
 * It fixes two real things. Two uploads called brand.pdf currently overwrite
 * one another silently, and the name's length is unbounded.
 */
export function storageName(name: string): string {
  const ext = extensionOf(name).slice(0, 10);
  const stem =
    name
      .slice(0, name.length - extensionOf(name).length)
      .replace(/[^A-Za-z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+/, '')
      .slice(0, MAX_NAME - ext.length - 9) || 'upload';
  return `${randomBytes(4).toString('hex')}-${stem}${ext}`;
}
```

- [ ] **Step 4: Enforce it at the route**

In `web/app/api/clients/[id]/sources/route.ts`, add the import:

```ts
import { checkUpload, storageName } from '@/server/uploads';
```

Inside the multipart branch, check before the file is read into memory and use the safe name for the key only:

```ts
        const verdict = checkUpload(file.name, file.type, file.size);
        if (!verdict.ok) {
          return NextResponse.json({ error: verdict.message }, { status: verdict.status });
        }
        const storageRef = await putFile(
          session.workspaceId,
          `clients/${id}/sources/${storageName(file.name)}`,
          buffer,
          file.type,
        );
```

Keep the original `file.name` as the source's display name in the stored record. Only the storage key changes: someone who uploaded `Brand Guidelines v2.pdf` should still see that in the list. Move the `checkUpload` call above the `arrayBuffer()` await so an oversized file is refused before it is read; `file.size` is available on the Web `File` without reading it.

- [ ] **Step 5: Run the tests**

Run: `node test/tenant.test.js`
Expected: PASS.

Run: `MOCK_CLAUDE=1 npm run web:build && node test/api.test.js`
Expected: PASS. `api.test.js` uploads sources. If one of its fixtures uses a type outside the allowlist, change the fixture rather than the allowlist, and say so in the commit message.

- [ ] **Step 6: Commit**

```bash
git add web/server/uploads.ts "web/app/api/clients/[id]/sources/route.ts" test/tenant.test.js
git commit -m "feat: bound and type what can be uploaded"
```

---

### Task 9: Security response headers

The app sets none today, so it can be framed by any site. The CSP is the delicate half: Next inlines bootstrap and hydration scripts, and a policy written from first principles and enforced immediately is a white page in production.

**This task ships the CSP in report-only mode and then flips it. Step 7 is the flip and is not optional.**

**Files:**
- Modify: `web/next.config.mjs`
- Modify: `web/proxy.ts`
- Modify: `web/app/layout.tsx`
- Modify: `test/instance.test.js`

**Interfaces:**
- Consumes: the proxy from Task 5, the layout from Task 6.
- Produces: an `x-nonce` request header the layout reads.

- [ ] **Step 1: Write the failing test**

Append to `test/instance.test.js`, before `server.kill()`:

```js
  const headed = await fetch(base + '/intellinews-CampaignF');
  assert.equal(headed.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headed.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(headed.headers.get('permissions-policy').includes('camera=()'));
  const csp =
    headed.headers.get('content-security-policy') ||
    headed.headers.get('content-security-policy-report-only');
  assert.ok(csp, 'a policy is present in one form or the other');
  assert.ok(csp.includes("frame-ancestors 'none'"), 'the app cannot be framed');
  assert.ok(/nonce-[A-Za-z0-9+/=]+/.test(csp), 'and the policy is nonce-based, not unsafe-inline');
```

- [ ] **Step 2: Run it and watch it fail**

Run: `MOCK_CLAUDE=1 npm run web:build && node test/instance.test.js`
Expected: FAIL on `x-content-type-options`, which is null.

- [ ] **Step 3: Add the static headers**

Replace `web/next.config.mjs`:

```js
/**
 * The headers here are the ones identical on every request. The
 * Content-Security-Policy is not among them: it carries a per-request nonce
 * and is set in proxy.ts instead.
 */
const STATIC_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Neither instance should leak the path of a client's campaign to a site
  // an outbound link points at.
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Vercel serves this over HTTPS only. Two years, matching the preload floor.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // core/ is the agent runtime: plain CommonJS, imported by route handlers
  // only, never by client components. It lives inside web/ so Vercel traces
  // and installs it from the project root directory.
  serverExternalPackages: ['pdf-parse', 'mammoth', 'firebase-admin', 'archiver'],
  async headers() {
    return [{ source: '/:path*', headers: STATIC_SECURITY_HEADERS }];
  },
};
export default nextConfig;
```

- [ ] **Step 4: Add the nonce and the policy in the proxy**

In `web/proxy.ts`, add above `export default function proxy`:

```ts
/**
 * The Content-Security-Policy carries a per-request nonce, so it cannot live
 * in next.config.mjs with the static headers. Next inlines its own bootstrap
 * and hydration scripts; a nonce is what lets those run without opening the
 * policy to every inline script on the page with 'unsafe-inline'.
 *
 * style-src must admit 'unsafe-inline': Next emits inline styles that carry
 * no nonce and no configuration changes it. That is a real weakening and it
 * is written down rather than hidden. script-src, which is where the damage
 * would be, stays nonce-only.
 *
 * fonts.googleapis.com and fonts.gstatic.com are here because app/layout.tsx
 * loads Archivo and IBM Plex from them.
 */
function policy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

// Report-only first. Enforcing a policy written from first principles is a
// white page in production, and the browser console is the only thing that
// can say what it would have broken. Flip this to false only after walking
// the app with the console open. See docs/DEPLOY.md.
const CSP_REPORT_ONLY = true;

function withSecurity(res: NextResponse, nonce: string): NextResponse {
  res.headers.set(
    CSP_REPORT_ONLY ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
    policy(nonce),
  );
  return res;
}
```

Then thread a nonce through every return in `proxy`:

```ts
export default function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  const pass = () => withSecurity(NextResponse.next({ request: { headers } }), nonce);

  if (process.env.MOCK_AUTH === '1') return pass();
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return pass();
  if (req.cookies.get('cf_session')) return pass();

  const claimed = req.cookies.get(DOOR_COOKIE)?.value;
  const door = claimed && tenantByDoor(claimed) ? claimed : DEFAULT_TENANT.doorPath;
  const url = req.nextUrl.clone();
  url.pathname = door;
  url.searchParams.set('next', pathname);
  return withSecurity(NextResponse.redirect(url), nonce);
}
```

`crypto.randomUUID()` is the Web Crypto global and is available on the edge runtime without an import.

- [ ] **Step 5: Put the nonce on the scripts**

In `web/app/layout.tsx`, read it and hand it to Next:

```tsx
import { headers } from 'next/headers';
```

```tsx
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts sets this per request. Next puts it on the scripts it injects
  // when it is given here, which is what makes a nonce-only script-src
  // possible at all.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@87.5,500;87.5,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
```

Task 6 already made this function `async` if it was not; keep it that way.

- [ ] **Step 6: Run the tests**

Run: `MOCK_CLAUDE=1 npm run web:build && node test/instance.test.js && node test/pages.test.js`
Expected: both PASS.

Run: `npm run verify`
Expected: all pass.

- [ ] **Step 7: Read the report, then enforce**

This step is the point of the task and cannot be skipped.

Run: `MOCK_CLAUDE=1 npm run web:build`
Then: `cd web && npx next start -p 3000`

Open `http://localhost:3000/login` in a browser with the developer console open. Sign in, then visit `/clients`, `/check`, `/ledger` and `/settings`, and open one campaign. Note every Content Security Policy violation the console reports.

For each violation, decide honestly. Either the policy is missing something the app genuinely needs, in which case widen that one directive and record why in the comment above `policy()`, or the page is doing something it should not, in which case fix the page. Do not add `'unsafe-inline'` to `script-src` to make a message go away: it is the only load-bearing part of this policy.

When the console is clean across all five pages, set `CSP_REPORT_ONLY = false` in `web/proxy.ts` and walk them again. If anything breaks, it goes back to report-only and the cause gets fixed rather than the policy weakened.

- [ ] **Step 8: Commit**

```bash
git add web/next.config.mjs web/proxy.ts web/app/layout.tsx test/instance.test.js
git commit -m "feat: security headers, and a CSP that is enforced rather than announced"
```

---

### Task 10: Settings shows what happened and can end it

**Files:**
- Create: `web/app/api/settings/revoke/route.ts`
- Modify: `web/app/settings/page.tsx`
- Modify: `test/instance.test.js`

**Interfaces:**
- Consumes: `bumpEpoch` (Task 2), `listSignIns` (Task 4), `requireOwner` (existing), `tenantFor` (Task 1).
- Produces: `POST /api/settings/revoke`.

- [ ] **Step 1: Write the failing test**

Append to `test/instance.test.js` immediately before `server.kill()`. It must be last, because it invalidates the `session` cookie every earlier assertion uses:

```js
  // A reviewer cannot end everyone's sessions.
  const reviewerSession = cookieString(await login('reviewer-shared-password'));
  const refused = await fetch(base + '/api/settings/revoke', { method: 'POST', headers: { cookie: reviewerSession } });
  assert.equal(refused.status, 403, 'revocation is an admin control');

  // An admin can, and it ends their own instance's sessions only. bumpEpoch
  // writes through the cache, so this does not wait out the sixty seconds.
  const revoked = await fetch(base + '/api/settings/revoke', { method: 'POST', headers: { cookie: session } });
  assert.equal(revoked.status, 200);
  const afterwards = await fetch(base + '/api/settings', { headers: { cookie: session } });
  assert.equal(afterwards.status, 401, 'the cookie that did it is dead too');
  const portfolioStill = await fetch(base + '/api/settings', { headers: { cookie: pcookie } });
  assert.equal(portfolioStill.status, 200, 'and the portfolio session is untouched');
```

- [ ] **Step 2: Run it and watch it fail**

Run: `MOCK_CLAUDE=1 npm run web:build && node test/instance.test.js`
Expected: FAIL. `/api/settings/revoke` is a 404, not a 403.

- [ ] **Step 3: Write the route**

Create `web/app/api/settings/revoke/route.ts`:

```ts
/**
 * End every session for the current instance.
 *
 * Scoped to the caller's own workspace on purpose: signing the portfolio out
 * because something happened on the client instance, or the reverse, would
 * make the control annoying enough not to be used.
 *
 * requireOwner rather than requireSession, because a reviewer signing
 * everyone out is a denial of service dressed as a security feature.
 *
 * The caller's own cookie dies with the rest. That is correct: the reason to
 * press this is that you do not know which sessions exist.
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/server/auth';
import { bumpEpoch } from '@/server/epoch';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const session = await requireOwner();
    const epoch = await bumpEpoch(session.workspaceId);
    return NextResponse.json({ ok: true, epoch });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
```

- [ ] **Step 4: Surface both in Settings**

In `web/app/settings/page.tsx`, add the imports:

```ts
import { tenantFor } from '@/server/tenant';
import { listSignIns } from '@/server/audit';
```

Extend the existing `Promise.all` and add the tenant, guarding the audit read so a reviewer never triggers it:

```ts
  const tenant = tenantFor(session);
  const [clients, settings, telemetry, signIns] = await Promise.all([
    listClients(session.workspaceId),
    getSettings(),
    readTelemetry(session.workspaceId),
    session.admin ? listSignIns(50) : Promise.resolve([]),
  ]);
```

In the Status block's `<dl className="kv">`, add two rows:

```tsx
          <div><dt>Instance</dt><dd>{tenant.label}{tenant.exemptFromCeiling ? ' (not governed by the spend ceiling)' : ''}</dd></div>
          <div><dt>Sessions last</dt><dd>{tenant.sessionTtlSeconds / 3600} hours</dd></div>
```

Add a section after the Status block. It is a plain form posting to the route, so it needs no client component:

```tsx
      {session.admin && (
        <section className="block">
          <h2 className="block-title">Sign-ins</h2>
          <p className="muted">
            The last fifty attempts at either door, kept for ninety days. A run of
            refusals followed by a success is the shape worth noticing.
          </p>
          <table className="ledger-table">
            <thead><tr><th>When</th><th>Door</th><th>Outcome</th><th>From</th></tr></thead>
            <tbody>
              {signIns.map((a, i) => (
                <tr key={i}>
                  <td>{a.at.replace('T', ' ').slice(0, 19)}</td>
                  <td>{a.tenant}</td>
                  <td>{a.outcome}</td>
                  <td className="mono">{a.ip}</td>
                </tr>
              ))}
              {signIns.length === 0 && (
                <tr><td colSpan={4} className="muted">Nothing recorded yet.</td></tr>
              )}
            </tbody>
          </table>

          <h3 style={{ marginTop: 24 }}>End every session</h3>
          <p className="muted">
            Signs out every session for {tenant.label}, including this one. The other
            instance is untouched. It can take up to a minute to reach a request already
            in flight.
          </p>
          <form action="/api/settings/revoke" method="post">
            <button className="btn-secondary" type="submit">Sign out everywhere</button>
          </form>
        </section>
      )}
```

Check that `ledger-table`, `mono` and `btn-secondary` exist in `web/app/globals.css`. If any does not, reuse a class that does rather than adding one, so `test/a11y.test.js` keeps covering what is rendered.

- [ ] **Step 5: Run the tests**

Run: `MOCK_CLAUDE=1 npm run web:build && node test/instance.test.js && node test/pages.test.js`
Expected: both PASS.

Run: `npm run verify`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add web/app/api/settings/revoke/route.ts web/app/settings/page.tsx test/instance.test.js
git commit -m "feat: settings can see the doors and close them"
```

---

### Task 11: Say all of this in the documents

This repository's convention is that `HANDOVER.md` and `CLAUDE.md` are read before the code. A second instance that is not in them is a trap for whoever reads next.

**Files:**
- Modify: `docs/DEPLOY.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `HANDOVER.md`
- Modify: `.env.example`

- [ ] **Step 1: The deploy-blocking note**

At the very top of `docs/DEPLOY.md`, before anything else:

```markdown
## Before the next deploy

**`ADMIN_PASSWORD` must be at least sixteen characters.** `web/server/session.ts`
refuses to boot below that, the same way it already refuses a `SESSION_SECRET`
under thirty-two. If the value currently set in Vercel is shorter, the next
deploy takes production down. Set a longer one first.

This is also the moment to rotate it. It has stopped guarding a demonstration
and started guarding a client's unpublished work, and the same password opens
the IntelliNews instance. While in the dashboard, flip `ADMIN_PASSWORD` and
`R2_SECRET_ACCESS_KEY` to Sensitive; both are still readable there.

No new environment variables are needed for the second instance. It is
selected by the URL and the cookie, not by configuration.

**The Content-Security-Policy ships report-only.** `CSP_REPORT_ONLY` in
`web/proxy.ts` starts true. Deploy, walk `/login`, `/clients`, `/check`,
`/ledger`, `/settings` and one campaign with the browser console open, fix
what it reports, then set it to false and deploy again. A policy left in
report-only enforces nothing.
```

- [ ] **Step 2: The instance, in README**

After the "Run it locally" section in `README.md`:

```markdown
## Two instances

One deployment serves two. `/login` is the portfolio instance, which the
reviewer password reaches. `/intellinews-CampaignF` is the IntelliNews
instance, which only `ADMIN_PASSWORD` opens: the reviewer password is refused
there with the same words as a wrong password, so it gives nothing away by
failing.

They share a codebase and a deployment and share no data. `web/server/db.ts`
nests every client, campaign, source and image under `users/{workspace}`, and
the workspace comes from the signed cookie, so the separation is the one that
already kept two workspaces apart.

What differs between them lives in one file, `web/server/tenant.ts`: the name
in the header, the door, whether the reviewer password works there, how long a
session lasts, and whether the monthly spend ceiling binds it. IntelliNews is
exempt from the ceiling, and its spend is excluded from the ceiling's total so
a busy client month cannot quietly start refusing runs on the portfolio.

Sessions can be ended. Settings has "Sign out everywhere", which invalidates
every cookie for the instance you are in and leaves the other alone.
```

- [ ] **Step 3: The invariants, in CLAUDE.md**

Add to whichever list in `CLAUDE.md` holds the existing invariants:

```markdown
- **A workspace id that is not in `web/server/tenant.ts` is not a tenant.**
  `tenantById` returns null and `isExempt` returns false for it, so a forged or
  stale cookie cannot name itself into an exemption. `tenantFor` is the one
  lenient reader and is for rendering only.
- **`server/tenant.ts` must stay free of I/O.** `web/proxy.ts` imports it and
  runs on the edge, where firebase-admin and the node builtins are unavailable.
- **Exempt from the ceiling means exempt from its total.** Use
  `listLedgerForCeiling` for the gate and `listLedgerAllWorkspaces` for the
  Ledger page. Swapping them lets one instance spend the other's allowance.
- **The CSP nonce comes from `proxy.ts` through the `x-nonce` request header.**
  Never add `'unsafe-inline'` to `script-src` to silence a violation; it is the
  only load-bearing part of the policy.
- **Every sign-in and every refusal is recorded** by `server/audit.ts`, which
  never throws: a logging outage must not become a lockout.
- **A refusal at an admin-only door must be identical to a wrong password**,
  in status and in wording. A distinct message tells the holder of the reviewer
  password that they found a real door.
```

- [ ] **Step 4: Where this was left, in HANDOVER.md**

Replace the "Sign-in is two passwords and no usernames" paragraph in section 2 with:

```markdown
**Sign-in is two passwords, no usernames, and two doors.** `ADMIN_PASSWORD` is
the owner's and `ACCESS_PASSWORD` is what a reviewer is given. `/login` accepts
both and reaches the portfolio library. `/intellinews-CampaignF` accepts only
the admin password and reaches a separate library for client work. Failing at
the IntelliNews door with the reviewer password is indistinguishable from
failing with a wrong one. Clients can be renamed, deleted and locked, and a
locked client cannot be deleted by anyone until it is unlocked.

Sessions can now be ended: Settings has "Sign out everywhere", which bumps a
per-workspace epoch and invalidates every cookie for that instance and no
other. It takes up to a minute, because the epoch is cached for that long
rather than read on every request.
```

Then amend gap 1 in the same section:

```markdown
1. **The library has not been curated.** Smaller than it was, because
   IntelliNews client work now has its own instance and its own library. The
   IntelliNews client from the original scrape still sits in the PORTFOLIO
   library where the reviewer password can see it, still named after its
   scraped page title. Moving or deleting it was deliberately left out of the
   instance work: it is a judgement about what a reviewer should see, not a
   code change.
```

- [ ] **Step 5: Note the password floor where the variable is defined**

In `.env.example`, replace the sign-in block:

```
# Sign-in. Two passwords, no usernames. ADMIN_PASSWORD reaches both instances,
# including /intellinews-CampaignF; ACCESS_PASSWORD reaches only the portfolio
# one at /login. ADMIN_PASSWORD must be at least 16 characters or the app
# refuses to start, the same as SESSION_SECRET below.
ADMIN_USERNAME=
ADMIN_PASSWORD=
ACCESS_PASSWORD=
```

`ACCESS_PASSWORD` is currently missing from this file despite being read by `server/session.ts`. Adding it is part of this step.

- [ ] **Step 6: Verify and commit**

Run: `npm run verify`
Expected: all pass. Documentation cannot break it, so a failure here means an earlier task regressed and must be fixed before this commits.

```bash
git add README.md CLAUDE.md HANDOVER.md docs/DEPLOY.md .env.example
git commit -m "docs: two instances, and the password change that must land first"
```

---

## Deliberately not in this plan

- **A second factor on the IntelliNews door.** The strongest control available
  and the argument against it is honest rather than technical: it adds an
  enrolment step and a recovery code whose loss locks the owner out of client
  work. The spec records the same decision. Worth revisiting if the instance is
  ever shared with anyone.
- **Moving the existing IntelliNews client out of the portfolio library.** A
  judgement about what a reviewer should see, not a code change. Task 11 Step 4
  records it as the remaining half of gap 1 in HANDOVER.
- **A separate Anthropic key per instance.** Both instances read
  `ANTHROPIC_API_KEY`. Switching it to a company key later is an environment
  change in Vercel and needs nothing from this plan.

---

## Deployment checklist

Not a task, and not optional. Do these in order once every task above is committed.

- [ ] Confirm the `ADMIN_PASSWORD` set in Vercel is at least sixteen characters. **If it is not, the next deploy takes production down.** Set a longer one, and rotate it while you are there.
- [ ] Flip `ADMIN_PASSWORD` and `R2_SECRET_ACCESS_KEY` to Sensitive in the Vercel dashboard.
- [ ] Deploy. Confirm `/login` still signs in with both passwords.
- [ ] Confirm `/intellinews-CampaignF` refuses the reviewer password, accepts the admin one, and opens an empty library.
- [ ] Confirm Settings shows the sign-ins, and that "Sign out everywhere" on one instance leaves the other signed in.
- [ ] Walk the five pages with the console open, fix what the CSP reports, then set `CSP_REPORT_ONLY = false` and deploy again. Task 9 Step 7 is the procedure.
