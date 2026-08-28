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
  'npx tsc server/session.ts server/accounts.ts server/throttle.ts --outDir .test-build --module commonjs --target es2022 --skipLibCheck --esModuleInterop',
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
  await assert.rejects(() => acc.createAccount('Alice'), /already exists/, 'usernames collide case-insensitively');
  await assert.rejects(() => acc.createAccount('  alice  '), /already exists/, 'usernames collide after trimming');
  const upper = await acc.authenticate('ALICE', made.password);
  assert.ok(upper && upper.workspaceId === made.account.workspaceId, 'sign-in normalises the username too');

  await acc.revokeAccount(made.account.id);
  assert.equal(await acc.authenticate('alice', made.password), null, 'revoked accounts cannot sign in');
  const listed = await acc.listAccounts();
  assert.equal(listed.length, 2, 'revoked accounts remain listed');
  assert.ok(!('hash' in listed[0]), 'hashes are never returned');

  assert.equal(await acc.workspaceActive(second.account.workspaceId), true, 'a live account is active');
  assert.equal(await acc.workspaceActive(made.account.workspaceId), false, 'a revoked account is inactive');
  assert.equal(await acc.workspaceActive('ws_does_not_exist'), false, 'an unknown workspace is inactive');

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

  console.log('session tests: ok');
})();
