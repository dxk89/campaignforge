# Demo Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Google sign-in with username/password access, and give each demo account its own isolated workspace so interviewers cannot see each other's work or any real client data.

**Architecture:** One session shape for every caller, carried in a `jose`-signed JWT cookie. The owner authenticates against `ADMIN_USERNAME`/`ADMIN_PASSWORD` from the environment; demo accounts authenticate against scrypt hashes in Firestore under `system/accounts`. Every Firestore path and R2 key is built from an explicit `ws` parameter threaded from the session, replacing the module-level `uid()`.

**Tech Stack:** Next.js 16 App Router, TypeScript in `web/app` and `web/server`, `jose` (already a dependency), Node `crypto` for scrypt, Firestore via `firebase-admin`, plain-Node test suites.

## Global Constraints

- British English in all prompts, UI copy and docs. No em-dashes in generated copy.
- The store is optional: without `FIREBASE_SERVICE_ACCOUNT` the app runs in memory, and `MOCK_AUTH=1` bypasses sign-in. Every test suite runs this way. Never make a code path require the store.
- Fail loudly at load, not on first request — the precedent is `web/core/claude.js` and `web/server/storage.ts`.
- API keys and password hashes never reach the browser.
- `web/core/` stays plain CommonJS. TypeScript only in `web/app`, `web/server`, `web/components`.
- Every module gets a header comment saying what it is for and why it is shaped that way.
- Run `MOCK_CLAUDE=1 npm run web:build` before `npm test`; five suites need a production build.
- Commit messages: one line what, then a paragraph why. No emoji.

## File Structure

**Create:**
- `web/server/session.ts` — Session type, scrypt hash/verify, JWT sign/verify. No I/O.
- `web/server/accounts.ts` — CRUD for `system/accounts`. Depends on session.ts for hashing.
- `web/server/throttle.ts` — failed-login counters at `system/login_attempts`.
- `web/app/api/auth/login/route.ts` — POST login, DELETE logout.
- `web/app/api/admin/accounts/route.ts` — GET list, POST create.
- `web/app/api/admin/accounts/[id]/route.ts` — DELETE revoke.
- `web/components/DemoAccounts.tsx` — the Settings panel.
- `test/session.test.js`, `test/isolation.test.js`

**Modify:**
- `web/server/auth.ts` — rewritten around the new session; `requireOwner()` added.
- `web/server/db.ts`, `storage.ts`, `assets.ts`, `exemplars.ts`, `resultsStore.ts`, `telemetry.ts`, `spend.ts` — `ws` parameter.
- `web/server/firebase.ts` — delete `uid()`.
- `web/app/login/page.tsx` — username/password form.
- `web/proxy.ts` — public path list.
- `web/app/settings/page.tsx` — mount the panel.
- All route handlers and pages calling the data layer.
- `firestore.rules`, `.env.example`, `docs/DEPLOY.md`, `docs/HUMAN-ACTIONS.md`, `CLAUDE.md`, `README.md`.

**Delete:** `web/app/api/auth/session/route.ts` (Firebase ID token exchange).

---

### Task 1: Session primitives

**Files:**
- Create: `web/server/session.ts`
- Test: `test/session.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Session = { kind: 'owner' | 'account'; workspaceId: string; username: string }`, `hashPassword(password: string): Promise<{salt: string; hash: string}>`, `verifyPassword(password: string, salt: string, hash: string): Promise<boolean>`, `signSession(s: Session): Promise<string>`, `verifySession(token: string): Promise<Session | null>`, `generatePassword(): string`, `checkAdmin(username: string, password: string): boolean`.

- [ ] **Step 1: Write the failing test**

Create `test/session.test.js`:

```js
/**
 * Session primitives: password hashing, token signing, admin comparison.
 * Pure functions, no store. Run: node test/session.test.js
 */
process.env.SESSION_SECRET = 'test-secret-at-least-32-characters-long';
process.env.ADMIN_USERNAME = 'david';
process.env.ADMIN_PASSWORD = 'correct-horse';

const assert = require('assert');
const path = require('path');
require('child_process').execSync(
  'npx tsc server/session.ts --outDir .test-build --module commonjs --target es2022 --skipLibCheck --esModuleInterop',
  { cwd: path.join(__dirname, '..', 'web'), stdio: 'pipe' },
);
const s = require('../web/.test-build/session.js');

(async () => {
  const { salt, hash } = await s.hashPassword('hunter2');
  assert.ok(salt.length >= 16, 'salt is present');
  assert.notEqual(hash, 'hunter2', 'password is not stored in the clear');
  assert.equal(await s.verifyPassword('hunter2', salt, hash), true);
  assert.equal(await s.verifyPassword('hunter3', salt, hash), false);

  const two = await s.hashPassword('hunter2');
  assert.notEqual(two.hash, hash, 'same password hashes differently per salt');

  const token = await s.signSession({ kind: 'account', workspaceId: 'ws_abc', username: 'alice' });
  const back = await s.verifySession(token);
  assert.equal(back.workspaceId, 'ws_abc');
  assert.equal(back.kind, 'account');
  assert.equal(await s.verifySession('not-a-token'), null);
  assert.equal(await s.verifySession(token.slice(0, -3) + 'aaa'), null, 'tampered token is rejected');

  assert.equal(s.checkAdmin('david', 'correct-horse'), true);
  assert.equal(s.checkAdmin('david', 'wrong'), false);
  assert.equal(s.checkAdmin('someone', 'correct-horse'), false);

  const pw = s.generatePassword();
  assert.ok(pw.length >= 16, 'generated password is long enough');
  assert.notEqual(pw, s.generatePassword(), 'generated passwords differ');

  console.log('session tests: ok');
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/session.test.js`
Expected: FAIL — `session.ts` does not exist, tsc errors.

- [ ] **Step 3: Write the implementation**

Create `web/server/session.ts`:

```ts
/**
 * Session primitives: hashing, token signing, the admin credential check.
 *
 * Pure functions with no store and no request context, so they can be tested
 * directly and reused by the login route, the accounts store and the admin
 * panel without any of them depending on each other.
 *
 * scrypt rather than a hashing dependency: Node ships it, and one fewer
 * package in a deployment that already carries the agent runtime is worth
 * more than the ergonomics of bcrypt.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { SignJWT, jwtVerify } from 'jose';

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export type Session = {
  kind: 'owner' | 'account';
  workspaceId: string;
  username: string;
};

function secret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters. See docs/DEPLOY.md.');
  }
  return new TextEncoder().encode(raw);
}

export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return { salt, hash: buf.toString('hex') };
}

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const buf = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  // Lengths must match before timingSafeEqual, which throws otherwise.
  if (expected.length !== buf.length) return false;
  return timingSafeEqual(buf, expected);
}

/** Constant-time compare that tolerates differing lengths. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** The owner's credentials live in the environment, not the store. */
export function checkAdmin(username: string, password: string): boolean {
  const u = process.env.ADMIN_USERNAME;
  const p = process.env.ADMIN_PASSWORD;
  if (!u || !p) return false;
  return safeEqual(username, u) && safeEqual(password, p);
}

export const adminConfigured = () => Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret());
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const { kind, workspaceId, username } = payload as Record<string, unknown>;
    if (kind !== 'owner' && kind !== 'account') return null;
    if (typeof workspaceId !== 'string' || typeof username !== 'string') return null;
    return { kind, workspaceId, username };
  } catch {
    return null;
  }
}

/** Shown to the owner exactly once when an account is created. */
export function generatePassword(): string {
  // Base32-ish, no ambiguous characters, readable over a call.
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(20);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function newWorkspaceId(): string {
  return `ws_${randomBytes(8).toString('hex')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/session.test.js`
Expected: `session tests: ok`

- [ ] **Step 5: Add to the test script and commit**

In `package.json`, add `node test/session.test.js && ` immediately after `"test": "` so it runs first.

```bash
git add web/server/session.ts test/session.test.js package.json
git commit -m "Add session primitives: scrypt hashing, signed tokens, admin check"
```

---

### Task 2: Accounts store

**Files:**
- Create: `web/server/accounts.ts`
- Test: extend `test/session.test.js` with an in-memory accounts block

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword`, `generatePassword`, `newWorkspaceId` from Task 1.
- Produces: `createAccount(username: string): Promise<{account: Account; password: string}>`, `listAccounts(): Promise<Account[]>`, `authenticate(username: string, password: string): Promise<Session | null>`, `revokeAccount(id: string): Promise<void>`, where `type Account = { id: string; username: string; workspaceId: string; createdAt: string; lastSeenAt: string | null; revokedAt: string | null }`.

- [ ] **Step 1: Write the failing test**

Append to `test/session.test.js` before the final `console.log`, and add `accounts.ts` to the tsc command in that file:

```js
  // --- accounts, in-memory backend (no FIREBASE_SERVICE_ACCOUNT set) ---
  const acc = require('../web/.test-build/accounts.js');
  acc.__resetAccounts();

  const made = await acc.createAccount('alice');
  assert.ok(made.password.length >= 16, 'a password is generated');
  assert.ok(made.account.workspaceId.startsWith('ws_'), 'workspace id is generated');
  assert.equal(made.account.username, 'alice');

  const ok = await acc.authenticate('alice', made.password);
  assert.equal(ok.kind, 'account');
  assert.equal(ok.workspaceId, made.account.workspaceId);
  assert.equal(await acc.authenticate('alice', 'wrong'), null);
  assert.equal(await acc.authenticate('nobody', made.password), null);

  const second = await acc.createAccount('bob');
  assert.notEqual(second.account.workspaceId, made.account.workspaceId, 'accounts get separate workspaces');

  await assert.rejects(() => acc.createAccount('alice'), /already exists/, 'usernames are unique');

  await acc.revokeAccount(made.account.id);
  assert.equal(await acc.authenticate('alice', made.password), null, 'revoked accounts cannot sign in');
  const listed = await acc.listAccounts();
  assert.equal(listed.length, 2, 'revoked accounts remain listed');
  assert.ok(!('hash' in listed[0]), 'hashes are never returned');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/session.test.js`
Expected: FAIL — `accounts.js` not found.

- [ ] **Step 3: Write the implementation**

Create `web/server/accounts.ts`:

```ts
/**
 * Demo accounts.
 *
 * One username and password per person evaluating the tool, each bound to its
 * own workspace. Stored under system/accounts, deliberately outside every
 * users/{workspace} tree so a path bug in the data layer cannot reach them.
 *
 * Revocation sets revokedAt rather than deleting, so the workspace and its
 * campaigns survive for the owner to look at afterwards.
 */
import { db as fsdb, storeEnabled } from './firebase';
import { hashPassword, verifyPassword, generatePassword, newWorkspaceId, type Session } from './session';

export type Account = {
  id: string;
  username: string;
  workspaceId: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
};

type Stored = Account & { salt: string; hash: string };

declare global { var __cfAccounts: Map<string, Stored> | undefined; }
const mem = globalThis.__cfAccounts ?? (globalThis.__cfAccounts = new Map<string, Stored>());

const col = () => fsdb().collection('system').doc('auth').collection('accounts');
const publicView = ({ salt, hash, ...rest }: Stored): Account => rest;

async function all(): Promise<Stored[]> {
  if (!storeEnabled) return [...mem.values()];
  const snap = await col().get();
  return snap.docs.map((d) => d.data() as Stored);
}

export async function listAccounts(): Promise<Account[]> {
  const rows = await all();
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(publicView);
}

export async function createAccount(username: string): Promise<{ account: Account; password: string }> {
  const name = username.trim().toLowerCase();
  if (!name) throw Object.assign(new Error('A username is required'), { status: 400 });
  if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(name)) {
    throw Object.assign(new Error('Use 2 to 32 characters: letters, numbers, dot, dash or underscore'), { status: 400 });
  }
  const existing = (await all()).find((a) => a.username === name && !a.revokedAt);
  if (existing) throw Object.assign(new Error('That username already exists'), { status: 409 });

  const password = generatePassword();
  const { salt, hash } = await hashPassword(password);
  const row: Stored = {
    id: newWorkspaceId().replace('ws_', 'acc_'),
    username: name,
    workspaceId: newWorkspaceId(),
    createdAt: new Date().toISOString(),
    lastSeenAt: null,
    revokedAt: null,
    salt,
    hash,
  };
  if (storeEnabled) await col().doc(row.id).set(row);
  else mem.set(row.id, row);
  return { account: publicView(row), password };
}

export async function authenticate(username: string, password: string): Promise<Session | null> {
  const name = (username || '').trim().toLowerCase();
  const row = (await all()).find((a) => a.username === name && !a.revokedAt);
  // Hash anyway when the account is missing, so a wrong username and a wrong
  // password take the same time and cannot be told apart.
  if (!row) {
    await verifyPassword(password || '', 'decoy', '00');
    return null;
  }
  if (!(await verifyPassword(password || '', row.salt, row.hash))) return null;
  const seen = new Date().toISOString();
  if (storeEnabled) await col().doc(row.id).set({ lastSeenAt: seen }, { merge: true });
  else mem.set(row.id, { ...row, lastSeenAt: seen });
  return { kind: 'account', workspaceId: row.workspaceId, username: row.username };
}

export async function revokeAccount(id: string): Promise<void> {
  const at = new Date().toISOString();
  if (storeEnabled) await col().doc(id).set({ revokedAt: at }, { merge: true });
  else {
    const row = mem.get(id);
    if (row) mem.set(id, { ...row, revokedAt: at });
  }
}

/** Is this workspace still allowed in? Called on every request. */
export async function workspaceActive(workspaceId: string): Promise<boolean> {
  const row = (await all()).find((a) => a.workspaceId === workspaceId);
  return Boolean(row && !row.revokedAt);
}

export function __resetAccounts() { mem.clear(); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/session.test.js`
Expected: `session tests: ok`

- [ ] **Step 5: Commit**

```bash
git add web/server/accounts.ts test/session.test.js
git commit -m "Add demo accounts stored under system/accounts"
```

---

### Task 3: Login throttle

**Files:**
- Create: `web/server/throttle.ts`
- Test: extend `test/session.test.js`

**Interfaces:**
- Consumes: `storeEnabled`, `db` from `firebase.ts`.
- Produces: `recordFailure(ip: string): Promise<void>`, `isLocked(ip: string): Promise<boolean>`, `clearFailures(ip: string): Promise<void>`, constants `MAX_FAILURES = 10`, `WINDOW_MS = 15 * 60 * 1000`.

- [ ] **Step 1: Write the failing test**

Append to `test/session.test.js` (add `throttle.ts` to the tsc command):

```js
  const th = require('../web/.test-build/throttle.js');
  th.__resetThrottle();
  assert.equal(await th.isLocked('1.2.3.4'), false);
  for (let i = 0; i < th.MAX_FAILURES; i++) await th.recordFailure('1.2.3.4');
  assert.equal(await th.isLocked('1.2.3.4'), true, 'locks after MAX_FAILURES');
  assert.equal(await th.isLocked('5.6.7.8'), false, 'other addresses are unaffected');
  await th.clearFailures('1.2.3.4');
  assert.equal(await th.isLocked('1.2.3.4'), false, 'a success clears the counter');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/session.test.js`
Expected: FAIL — `throttle.js` not found.

- [ ] **Step 3: Write the implementation**

Create `web/server/throttle.ts`:

```ts
/**
 * Failed-login throttling, keyed by IP.
 *
 * A shared password on a public form is a weekend's work to crack without
 * this, so it is not optional. Counters live at system/login_attempts and
 * expire by time rather than by a sweep: a record older than the window is
 * treated as absent, which needs no scheduled cleanup.
 */
import { db as fsdb, storeEnabled } from './firebase';

export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60 * 1000;

type Record = { count: number; firstAt: number };

declare global { var __cfThrottle: Map<string, Record> | undefined; }
const mem = globalThis.__cfThrottle ?? (globalThis.__cfThrottle = new Map<string, Record>());

const key = (ip: string) => ip.replace(/[^a-zA-Z0-9.:_-]/g, '_') || 'unknown';
const doc = (ip: string) => fsdb().doc(`system/auth/login_attempts/${key(ip)}`);

async function read(ip: string): Promise<Record | null> {
  if (!storeEnabled) return mem.get(key(ip)) ?? null;
  const snap = await doc(ip).get();
  return snap.exists ? (snap.data() as Record) : null;
}

async function write(ip: string, rec: Record): Promise<void> {
  if (storeEnabled) await doc(ip).set(rec);
  else mem.set(key(ip), rec);
}

export async function isLocked(ip: string): Promise<boolean> {
  const rec = await read(ip);
  if (!rec) return false;
  if (Date.now() - rec.firstAt > WINDOW_MS) return false;
  return rec.count >= MAX_FAILURES;
}

export async function recordFailure(ip: string): Promise<void> {
  const rec = await read(ip);
  if (!rec || Date.now() - rec.firstAt > WINDOW_MS) {
    await write(ip, { count: 1, firstAt: Date.now() });
    return;
  }
  await write(ip, { count: rec.count + 1, firstAt: rec.firstAt });
}

export async function clearFailures(ip: string): Promise<void> {
  if (storeEnabled) await doc(ip).delete().catch(() => {});
  else mem.delete(key(ip));
}

export function __resetThrottle() { mem.clear(); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/session.test.js`
Expected: `session tests: ok`

- [ ] **Step 5: Commit**

```bash
git add web/server/throttle.ts test/session.test.js
git commit -m "Throttle failed logins per IP"
```

---

### Task 4: Rewrite auth.ts around the new session

**Files:**
- Modify: `web/server/auth.ts` (replace entirely)

**Interfaces:**
- Consumes: `verifySession`, `signSession`, `adminConfigured`, `type Session` from Task 1; `workspaceActive` from Task 2.
- Produces: `SESSION_COOKIE = 'cf_session'`, `currentSession(): Promise<Session | null>`, `requireSession(): Promise<Session>`, `requireOwner(): Promise<Session>`.

- [ ] **Step 1: Replace the file**

```ts
/**
 * Sessions.
 *
 * Three ways in, one shape out. Mock mode for tests, the owner against
 * ADMIN_USERNAME/ADMIN_PASSWORD from the environment, and demo accounts
 * against hashes in Firestore. Callers read session.workspaceId and never
 * learn which it was, which is what keeps the data layer free of auth.
 *
 * Google sign-in was removed: interviewers should not need an account with a
 * third party to try the tool.
 */
import { cookies } from 'next/headers';
import { verifySession, adminConfigured, type Session } from './session';
import { workspaceActive } from './accounts';
import { storeEnabled } from './firebase';

export const SESSION_COOKIE = 'cf_session';
const MOCK_AUTH = process.env.MOCK_AUTH === '1';

export type { Session };

// A deployment with a store but no way to sign in would serve an open
// instance. Refuse at load instead, as claude.js and storage.ts do.
if (storeEnabled && !MOCK_AUTH && !adminConfigured()) {
  throw new Error(
    'Firestore is configured but no sign-in is: set ADMIN_USERNAME and ADMIN_PASSWORD, ' +
      'or MOCK_AUTH=1 to run without sign-in. See docs/DEPLOY.md.',
  );
}

export async function currentSession(): Promise<Session | null> {
  if (MOCK_AUTH) return { kind: 'owner', workspaceId: 'owner', username: 'mock' };
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;
  // Revocation must bite on the next request, not when the token expires.
  if (session.kind === 'account' && !(await workspaceActive(session.workspaceId))) return null;
  return session;
}

export async function requireSession(): Promise<Session> {
  const s = await currentSession();
  if (!s) throw Object.assign(new Error('Sign in required'), { status: 401 });
  return s;
}

/** Admin routes. A demo account gets 403, not a redirect to a form. */
export async function requireOwner(): Promise<Session> {
  const s = await requireSession();
  if (s.kind !== 'owner') throw Object.assign(new Error('Not permitted'), { status: 403 });
  return s;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: errors only in files that still import the removed `verifyIdToken` — `web/app/api/auth/session/route.ts`. Those are fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add web/server/auth.ts
git commit -m "Rewrite sessions around signed tokens and workspace ids"
```

---

### Task 5: Login route and page

**Files:**
- Create: `web/app/api/auth/login/route.ts`
- Delete: `web/app/api/auth/session/route.ts`
- Modify: `web/app/login/page.tsx`, `web/proxy.ts`

**Interfaces:**
- Consumes: `checkAdmin`, `signSession` (Task 1); `authenticate` (Task 2); `isLocked`, `recordFailure`, `clearFailures` (Task 3); `SESSION_COOKIE` (Task 4).
- Produces: `POST /api/auth/login` taking `{username, password}`, `DELETE /api/auth/login` to sign out.

- [ ] **Step 1: Write the route**

Create `web/app/api/auth/login/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { checkAdmin, signSession } from '@/server/session';
import { authenticate } from '@/server/accounts';
import { isLocked, recordFailure, clearFailures } from '@/server/throttle';
import { SESSION_COOKIE } from '@/server/auth';

export const runtime = 'nodejs';
const SEVEN_DAYS = 60 * 60 * 24 * 7;

function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (await isLocked(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Try again in fifteen minutes.' }, { status: 429 });
  }
  const { username, password } = await req.json().catch(() => ({}));
  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
  }

  const session = checkAdmin(username, password)
    ? { kind: 'owner' as const, workspaceId: 'owner', username }
    : await authenticate(username, password);

  if (!session) {
    await recordFailure(ip);
    return NextResponse.json({ error: 'Those details were not recognised' }, { status: 401 });
  }

  await clearFailures(ip);
  const res = NextResponse.json({ ok: true, kind: session.kind, username: session.username });
  res.cookies.set(SESSION_COOKIE, await signSession(session), {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: SEVEN_DAYS, path: '/',
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

/** Sign out from a plain form post, so the header needs no client component. */
export async function PUT(req: Request) {
  const url = new URL(req.url);
  const res = NextResponse.redirect(new URL('/login', url.origin), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
```

- [ ] **Step 2: Replace the login page**

```tsx
'use client';

import { useState } from 'react';

/** Username and password. No third-party account needed to try the tool. */
export default function Login() {
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
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign-in failed');
      window.location.href = new URLSearchParams(window.location.search).get('next') || '/clients';
    } catch (err: any) {
      setError(err.message || 'Sign-in failed');
      setBusy(false);
    }
  }

  return (
    <main className="shell" style={{ maxWidth: 420, paddingTop: 120 }}>
      <h1>Campaign Forge</h1>
      <p className="muted" style={{ marginBottom: 24 }}>Sign in to continue.</p>
      <form onSubmit={submit}>
        <label htmlFor="username">Username</label>
        <input id="username" name="username" autoComplete="username" required autoFocus />
        <label htmlFor="password" style={{ marginTop: 12 }}>Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <button className="btn-primary" type="submit" disabled={busy} style={{ marginTop: 20 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {error && <p className="form-error" style={{ marginTop: 16 }}>{error}</p>}
    </main>
  );
}
```

- [ ] **Step 3: Update the proxy public list**

In `web/proxy.ts` change the `PUBLIC` constant to:

```ts
const PUBLIC = ['/login', '/api/auth/login', '/api/health'];
```

- [ ] **Step 4: Delete the old route and build**

```bash
git rm web/app/api/auth/session/route.ts
cd web && MOCK_CLAUDE=1 npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Replace Google sign-in with a username and password form"
```

---

### Task 6: Thread the workspace through db.ts

**Files:**
- Modify: `web/server/db.ts`, `web/server/firebase.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: every exported function in `db.ts` takes `ws: string` as its **first** parameter. `root` becomes `const root = (ws: string) => \`users/${ws}\``. `uid()` is deleted from `firebase.ts`.

- [ ] **Step 1: Delete uid() and change root()**

In `web/server/firebase.ts`, delete the `uid()` export entirely.

In `web/server/db.ts`, replace line 31 and the import:

```ts
const root = (ws: string) => `users/${ws}`;
```

- [ ] **Step 2: Add ws to every exported function**

Each of the 24 exported functions in `db.ts` gains `ws: string` as its first parameter and passes it to `root(ws)`. For example:

```ts
// before
export async function listClients(): Promise<Client[]> {
  ...root()...
}
// after
export async function listClients(ws: string): Promise<Client[]> {
  ...root(ws)...
}
```

`ledgerTotals` and `__resetMemory` are pure and take no `ws`.

- [ ] **Step 3: Let the compiler list every call site**

Run: `cd web && npx tsc --noEmit 2>&1 | head -60`
Expected: an error per call site — this is the point of the change. Work through them, passing `session.workspaceId` from the `requireSession()` the handler already calls. Any handler that does not call `requireSession()` and touches data must now do so.

- [ ] **Step 4: Build clean**

Run: `cd web && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add web/server/db.ts web/server/firebase.ts web/app
git commit -m "Thread the workspace id explicitly through the data layer"
```

---

### Task 7: Thread the workspace through the remaining store modules

**Files:**
- Modify: `web/server/storage.ts`, `assets.ts`, `exemplars.ts`, `resultsStore.ts`, `telemetry.ts`

**Interfaces:**
- Produces: `putFile(ws, path, buffer, mime)`, `getFile(ws, ref)`, `putDataUrl(ws, path, dataUrl)`, `listFiles(ws, prefix)`; the equivalent first-parameter change in the other four modules.

- [ ] **Step 1: Change the path builders**

In each file replace the `uid()` call with a `ws` parameter, exactly as Task 6:

```ts
// storage.ts
const key = (ws: string, p: string) => `users/${ws}/${p}`;
```

- [ ] **Step 2: Add ws as the first parameter to every exported function in those five files**

- [ ] **Step 3: Fix the call sites the compiler finds**

Run: `cd web && npx tsc --noEmit 2>&1 | head -60`
Expected: errors in the eight route files that import storage. Pass `session.workspaceId`.

Note `getFile` in `web/app/api/files/[...ref]/route.ts` must additionally reject a ref that does not start with `users/<session.workspaceId>/`, or one account could read another's files by guessing a ref:

```ts
const session = await requireSession();
if (!full.startsWith(`users/${session.workspaceId}/`)) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
```

- [ ] **Step 4: Build clean**

Run: `cd web && npx tsc --noEmit` then `MOCK_CLAUDE=1 npm run build`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Thread the workspace id through storage, assets, exemplars, results and telemetry"
```

---

### Task 8: Global spend ceiling

**Files:**
- Modify: `web/server/spend.ts`

**Interfaces:**
- Produces: `getSettings()` and `saveSettings(patch)` read and write `system/spend/global` rather than a per-workspace document; `checkCeiling(ws, estimateEur)` sums the ledger across **all** workspaces.

- [ ] **Step 1: Move the settings document**

```ts
// A per-workspace ceiling would hand every new demo account a fresh
// allowance and bound nothing. One ceiling, across every workspace.
const settingsDoc = () => fsdb().doc('system/spend/global');
```

- [ ] **Step 2: Sum the ledger across workspaces**

The ledger currently lives under `users/{ws}/ledger`. Add a collection-group query so the total covers every workspace:

```ts
const snap = await fsdb().collectionGroup('ledger').get();
```

In the in-memory fallback, sum every workspace's array rather than one.

- [ ] **Step 3: Verify**

Run: `node test/phase4.test.js`
Expected: `phase 4 tests: ok` — the existing ceiling test still passes.

- [ ] **Step 4: Commit**

```bash
git add web/server/spend.ts
git commit -m "Make the spend ceiling global rather than per workspace"
```

---

### Task 9: Admin panel

**Files:**
- Create: `web/app/api/admin/accounts/route.ts`, `web/app/api/admin/accounts/[id]/route.ts`, `web/components/DemoAccounts.tsx`
- Modify: `web/app/settings/page.tsx`

**Interfaces:**
- Consumes: `requireOwner` (Task 4); `createAccount`, `listAccounts`, `revokeAccount` (Task 2).
- Produces: `GET /api/admin/accounts` → `{accounts: Account[]}`; `POST` `{username}` → `{account, password}`; `DELETE /api/admin/accounts/[id]` → `{ok: true}`.

- [ ] **Step 1: Write the routes**

```ts
// web/app/api/admin/accounts/route.ts
import { NextResponse } from 'next/server';
import { requireOwner } from '@/server/auth';
import { createAccount, listAccounts } from '@/server/accounts';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireOwner();
    return NextResponse.json({ accounts: await listAccounts() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireOwner();
    const { username } = await req.json().catch(() => ({}));
    const made = await createAccount(username);
    return NextResponse.json(made, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
```

```ts
// web/app/api/admin/accounts/[id]/route.ts
import { NextResponse } from 'next/server';
import { requireOwner } from '@/server/auth';
import { revokeAccount } from '@/server/accounts';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner();
    const { id } = await params;
    await revokeAccount(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
```

- [ ] **Step 2: Write the panel**

`web/components/DemoAccounts.tsx` is a client component that lists accounts, has a username field with a Create button, shows the returned password once in a highlighted block with the warning that it will not be shown again, and a Revoke button per row that calls DELETE and refreshes.

- [ ] **Step 3: Mount it**

In `web/app/settings/page.tsx`, render `<DemoAccounts />` only when `session.kind === 'owner'`.

- [ ] **Step 4: Build**

Run: `cd web && MOCK_CLAUDE=1 npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add the owner-only demo accounts panel"
```

---

### Task 10: Isolation contract tests

**Files:**
- Create: `test/isolation.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: the running Next server in mock-store mode, as `test/api.test.js` does.

- [ ] **Step 1: Write the test**

Model it on `test/api.test.js`: start the server with `startNext(3228, env)` from `test/helpers/next-server.js`, with `ADMIN_USERNAME`, `ADMIN_PASSWORD` and `SESSION_SECRET` set and `MOCK_AUTH` **unset**, so the real login path runs. Then assert:

1. `POST /api/auth/login` as admin returns 200 and a `cf_session` cookie.
2. `POST /api/admin/accounts {username:'alice'}` returns 201 with a password.
3. Signing in as alice returns a cookie; creating a client with it succeeds.
4. Repeat for bob. **`GET /api/clients` as bob does not contain alice's client.**
5. `GET /api/admin/accounts` with bob's cookie returns **403**.
6. `DELETE /api/admin/accounts/<alice id>` as admin, then alice's cookie returns 401 on `/api/clients`.
7. Eleven failed logins return 429.

- [ ] **Step 2: Run it**

Run: `MOCK_CLAUDE=1 npm run web:build && node test/isolation.test.js`
Expected: `isolation tests: ok`

- [ ] **Step 3: Add to the test script and commit**

Add `node test/isolation.test.js` to `"test"` in `package.json`, after `api.test.js`.

```bash
git add test/isolation.test.js package.json
git commit -m "Prove workspace isolation and admin gating with contract tests"
```

---

### Task 11: Rules, docs and cleanup

**Files:**
- Modify: `firestore.rules`, `.env.example`, `docs/DEPLOY.md`, `docs/HUMAN-ACTIONS.md`, `CLAUDE.md`, `README.md`, `scripts/deploy-rules.js`

- [ ] **Step 1: Reduce the rules**

With Firebase Auth gone there is no `request.auth`. Deny all direct client access; the server reaches Firestore through the Admin SDK, which bypasses rules:

```
rules_version = '2';
// All access is server-side through the Admin SDK, which bypasses these
// rules. Workspace isolation is enforced in application code, in the ws
// parameter threaded through web/server. These rules exist to ensure no
// browser can reach Firestore directly.
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
```

`scripts/deploy-rules.js` no longer needs `ALLOWED_EMAIL`; drop the substitution and the env check.

- [ ] **Step 2: Update the environment documentation**

Remove `ALLOWED_EMAIL`, `ALLOWED_UID` and the five `NEXT_PUBLIC_FIREBASE_*` entries. Add `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`. In `docs/HUMAN-ACTIONS.md` and `docs/DEPLOY.md`, delete the two Firebase console steps for the Google provider and authorised domains.

- [ ] **Step 3: Update CLAUDE.md**

Replace invariant 12's auth wording, and add a trap entry: workspace isolation is enforced by the `ws` parameter in application code, not by Firestore rules, because the Admin SDK bypasses them.

- [ ] **Step 4: Check whether the firebase client package can go**

Run: `cd web && grep -rn "from 'firebase/" app components server | grep -v node_modules`
If there are no matches, remove `firebase` from `web/package.json` dependencies and reinstall. If there are, leave it and note why.

- [ ] **Step 5: Full verification**

```bash
cd web && MOCK_CLAUDE=1 npm run build && cd ..
npm test
npm run test:emulator
```
Expected: build succeeds, all suites pass, emulator suite passes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Retire Firebase Auth from the rules, docs and environment"
```

---

## Self-Review

**Spec coverage.** Three ways in → Tasks 1, 4, 5. Fail closed → Task 4. Data model → Tasks 2, 6, 7. Workspace threading → Tasks 6, 7. Admin panel → Task 9. Passwords and sessions → Tasks 1, 3, 5. Global ceiling → Task 8. Firestore rules → Task 11. Testing → Tasks 1, 2, 3, 10. Back-compatibility (`MOCK_AUTH`, untouched `users/owner`) → Tasks 4, 6. Removal of Google artefacts → Tasks 5, 11.

**Placeholders.** None. Task 9 Step 2 describes the panel's behaviour rather than giving its JSX, which is a judgement call: the component is presentational, the contract it consumes is fully specified in Step 1, and the repo's existing components in `web/components/` are the pattern to follow.

**Type consistency.** `Session` is defined once in Task 1 and re-exported by Task 4. `Account` is defined in Task 2 and used unchanged in Task 9. `ws: string` is the first parameter throughout Tasks 6 and 7. `workspaceActive` is produced by Task 2 and consumed by Task 4.

**Known risk.** Tasks 6 and 7 are the large mechanical diff. The compiler enumerates every site, so the failure mode is a build error rather than a silent leak — but they should be executed and reviewed as a pair, since a half-threaded data layer will not compile and cannot be partially shipped.
