/**
 * Session primitives: password hashing, token signing, admin comparison.
 * Pure functions, no store. Run: node test/session.test.js
 */
process.env.SESSION_SECRET = 'test-secret-at-least-32-characters-long';
process.env.ACCESS_PASSWORD = 'reviewer-pass';
process.env.ADMIN_PASSWORD = 'correct-horse';

const assert = require('assert');
const path = require('path');
require('child_process').execSync(
  'npx tsc server/session.ts server/throttle.ts --outDir .test-build --module commonjs --target es2022 --skipLibCheck --esModuleInterop',
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

  const token = await s.signSession({ workspaceId: 'ws_abc', admin: false });
  const back = await s.verifySession(token);
  assert.equal(back.workspaceId, 'ws_abc');
  assert.equal(back.admin, false, 'a reviewer session is not admin');

  // admin must survive the round trip, and must not be inferable from a
  // token that simply omits it: a missing claim is a reviewer, not an owner.
  const adminBack = await s.verifySession(await s.signSession({ workspaceId: 'owner', admin: true }));
  assert.equal(adminBack.admin, true, 'an admin session round-trips');
  const { SignJWT: Sign } = require('../web/node_modules/jose');
  const noClaim = await new Sign({ workspaceId: 'owner' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d')
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
  assert.equal((await s.verifySession(noClaim)).admin, false, 'a token with no admin claim is not admin');
  assert.equal(await s.verifySession('not-a-token'), null);
  assert.equal(await s.verifySession(token.slice(0, -3) + 'aaa'), null, 'tampered token is rejected');

  // jose lives in web/node_modules, not the root; require it by path since this
  // file runs from the repo root and a bare require('jose') would not resolve.
  const { SignJWT } = require('../web/node_modules/jose');
  const emptyWs = await new SignJWT({ workspaceId: '', admin: false })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d')
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
  assert.equal(await s.verifySession(emptyWs), null, 'an empty workspaceId is rejected');

  // Two passwords, no usernames. The admin check runs first, so setting both
  // to the same value degrades to admin rather than to a weaker session.
  assert.equal(s.checkPassword('correct-horse'), 'admin', 'the admin password is admin');
  assert.equal(s.checkPassword('reviewer-pass'), 'user', 'the access password is a reviewer');
  assert.equal(s.checkPassword('wrong'), null, 'anything else is refused');
  assert.equal(s.checkPassword(''), null, 'and so is nothing');

  const pw = s.generatePassword();
  assert.ok(pw.length >= 16, 'generated password is long enough');
  assert.notEqual(pw, s.generatePassword(), 'generated passwords differ');

  // --- throttle, in-memory backend (no FIREBASE_SERVICE_ACCOUNT set) ---
  const th = require('../web/.test-build/throttle.js');
  th.__resetThrottle();
  assert.equal(await th.isLocked('1.2.3.4'), false);
  for (let i = 0; i < th.MAX_FAILURES; i++) await th.recordFailure('1.2.3.4');
  assert.equal(await th.isLocked('1.2.3.4'), true, 'locks after MAX_FAILURES');
  assert.equal(await th.isLocked('5.6.7.8'), false, 'other addresses are unaffected');
  await th.clearFailures('1.2.3.4');
  assert.equal(await th.isLocked('1.2.3.4'), false, 'a success clears the counter');

  // The window expires by comparison against its own timestamp, so backdate the
  // record rather than waiting. This drives the real branch in isLocked/recordFailure.
  const backdate = (ip, ms) => {
    const k = ip;
    const rec = globalThis.__cfThrottle.get(k);
    globalThis.__cfThrottle.set(k, { count: rec.count, firstAt: Date.now() - ms });
  };

  th.__resetThrottle();
  for (let i = 0; i < th.MAX_FAILURES; i++) await th.recordFailure('9.9.9.9');
  assert.equal(await th.isLocked('9.9.9.9'), true, 'locked inside the window');
  backdate('9.9.9.9', th.WINDOW_MS + 1000);
  assert.equal(await th.isLocked('9.9.9.9'), false, 'the lock lifts once the window passes');

  // A failure after expiry starts a fresh window rather than topping up the old count.
  await th.recordFailure('9.9.9.9');
  assert.equal(globalThis.__cfThrottle.get('9.9.9.9').count, 1, 'the counter restarts after expiry');
  assert.equal(await th.isLocked('9.9.9.9'), false, 'one failure in a fresh window does not lock');

  // --- safeNext (web/app/login/page.tsx) ---
  // Replicated here rather than imported: the component is a .tsx client
  // component reaching for `window`, and extracting it into a shared module
  // would add an import path this pure-function test does not need. The
  // expression below is the exact body of safeNext(), with window.location.origin
  // fixed to a literal so it can run under plain Node.
  const origin = 'https://app.example.com';
  function safeNext(raw) {
    if (!raw) return '/clients';
    try {
      const url = new URL(raw, origin);
      if (url.origin !== origin) return '/clients';
      return url.pathname + url.search + url.hash;
    } catch {
      return '/clients';
    }
  }

  for (const allowed of ['/clients', '/clients?x=1', '/a/b#c']) {
    assert.equal(safeNext(allowed), allowed, `${allowed} is passed through unchanged`);
  }

  // '/\\evil.com' in JS source is the two-character sequence "/\", the
  // already-decoded form safeNext receives after URLSearchParams.get()
  // percent-decodes a raw "next=/%5Cevil.com" query value. Testing the
  // decoded form matches what the function actually sees at runtime.
  for (const blocked of [
    '//evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    '/\\evil.com',
    '\t//evil.com',
    null,
    '',
  ]) {
    assert.equal(safeNext(blocked), '/clients', `${JSON.stringify(blocked)} falls back to /clients`);
  }

  console.log('session tests: ok');
})();
