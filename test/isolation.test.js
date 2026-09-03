/**
 * Sign-in contract tests: the real login route, not mock auth.
 *
 * Every other suite runs under MOCK_AUTH=1, which makes every session an
 * admin. That is fine for exercising the agent runtime, but it means none of
 * those suites can tell a working sign-in from a broken one: every assertion
 * in them would pass whether or not the login route, the signed cookie and
 * the proxy gate did anything at all. This suite is the one place that runs
 * them for real.
 *
 * It used to prove that two demo accounts could not see each other's data.
 * That system was removed in favour of two passwords and no usernames, which
 * is a smaller thing to explain to someone sent a link. What replaces the
 * isolation claim is the privilege claim: a reviewer can use the tool and
 * cannot change what applies to everyone. The workspace parameter is still
 * threaded through the data layer, and db.test.js still checks that two
 * workspaces do not see each other, so the boundary itself remains tested.
 *
 * The throttle in server/throttle.ts keys failed logins by caller IP, and
 * startNext gives every request from this suite the same address (there is no
 * x-forwarded-for under a plain `next start`). That means the eleven-failure
 * lockout test shares a bucket with every earlier login in this file. The
 * lockout assertion therefore runs LAST, after every sign-in this suite
 * needs has already succeeded, so it cannot lock out its own setup.
 */
const assert = require('assert');
const { startNext } = require('./helpers/next-server');

const PORT = 3228;
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
// This suite must run entirely in memory. A developer with a store configured
// would otherwise have this suite's throttle record written to it, and that
// record locks the next run out for fifteen minutes.
delete env.FIREBASE_SERVICE_ACCOUNT;
delete env.FIRESTORE_EMULATOR_HOST;

const server = startNext(PORT, env);
const stop = () => server.kill();
process.on('exit', stop);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pull the cf_session cookie value out of a set-cookie header. */
function cookieFrom(res) {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  const match = raw.match(/cf_session=([^;]+)/);
  return match ? `cf_session=${match[1]}` : null;
}

/** A fetch wrapper that sends a cookie string and parses JSON when present. */
async function api(path, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers['cookie'] = cookie;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json().catch(() => null) : null;
  return { status: res.status, data, res };
}

const login = (password) => api('/api/auth/login', { method: 'POST', body: { password } });

(async () => {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(base + '/api/health'); if (r.ok) break; } catch {}
    await wait(500);
  }

  // 0. Baseline: an unauthenticated caller is turned away, not silently let in.
  // proxy.ts gates on cookie PRESENCE before any route runs, and redirects
  // (307) to /login rather than returning a bare 401 JSON body - that is the
  // "cheap gate" the proxy's own header comment describes, distinct from the
  // route-level 401 a stale-but-present cookie gets (assertion 6). Followed
  // with redirect: 'manual' so the real status is visible rather than the 200
  // of the login page fetch() would otherwise follow through to.
  const noCookieRes = await fetch(base + '/api/clients', { redirect: 'manual' });
  assert.ok(noCookieRes.status >= 300 && noCookieRes.status < 400, `no cookie should be redirected, got ${noCookieRes.status}`);
  assert.ok((noCookieRes.headers.get('location') || '').includes('/login'), 'redirected to /login');
  console.log('  no cookie: redirected to /login (' + noCookieRes.status + ')');

  // 1. The admin password signs in and is marked as admin.
  const adminLogin = await login('owner-super-secret-password');
  assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.data));
  assert.equal(adminLogin.data.admin, true, 'the admin password gives an admin session');
  const adminCookie = cookieFrom(adminLogin.res);
  assert.ok(adminCookie, 'login sets a cf_session cookie');
  console.log('  admin signed in');

  // 2. The access password signs in too, and is not admin.
  const userLogin = await login('reviewer-shared-password');
  assert.equal(userLogin.status, 200, JSON.stringify(userLogin.data));
  assert.equal(userLogin.data.admin, false, 'the access password does not give an admin session');
  const userCookie = cookieFrom(userLogin.res);
  assert.ok(userCookie, 'a reviewer gets a cookie too');
  console.log('  reviewer signed in');

  // 3. A reviewer can actually use the tool. A password that signs in and
  // then cannot do anything would be worse than no password.
  const made = await api('/api/clients', { method: 'POST', body: { name: 'Reviewer Co', website: 'https://example.com' }, cookie: userCookie });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const clientId = (made.data.client || made.data).clientId;
  assert.ok(clientId, 'a reviewer can create a client');
  const listed = await api('/api/clients', { cookie: userCookie });
  assert.equal(listed.status, 200);
  assert.ok((listed.data.clients || listed.data).some((c) => c.clientId === clientId), 'and see it afterwards');
  console.log('  reviewer can use the tool');

  // 4. Both passwords reach the same workspace. This is the deliberate cost
  // of dropping per-visitor accounts, and it is asserted rather than assumed
  // so that nobody later reads the sign-in code and expects isolation.
  const adminSees = await api('/api/clients', { cookie: adminCookie });
  assert.ok((adminSees.data.clients || adminSees.data).some((c) => c.clientId === clientId),
    'admin and reviewer share one workspace, by design');
  console.log('  one shared workspace, as designed');

  // 5. The privilege boundary that replaces isolation. The spend ceiling is a
  // single document shared by everything, so a write to it changes the cap
  // for everyone. A reviewer must not be able to raise it.
  const userPatch = await api('/api/settings', { method: 'PATCH', body: { monthlyCeilingEur: null }, cookie: userCookie });
  assert.equal(userPatch.status, 403, JSON.stringify(userPatch.data));
  const adminPatch = await api('/api/settings', { method: 'PATCH', body: { monthlyCeilingEur: 25 }, cookie: adminCookie });
  assert.equal(adminPatch.status, 200, JSON.stringify(adminPatch.data));
  console.log('  reviewer cannot change the ceiling, admin can');

  // 6. The lock. It is what protects a curated client from being deleted by
  // someone sent the access password, so it is only worth anything if the
  // server enforces it rather than the button being hidden.
  const lockAsUser = await api(`/api/clients/${clientId}`, { method: 'PATCH', body: { locked: true }, cookie: userCookie });
  assert.equal(lockAsUser.status, 403, 'a reviewer cannot lock or unlock');

  const locked = await api(`/api/clients/${clientId}`, { method: 'PATCH', body: { locked: true }, cookie: adminCookie });
  assert.equal(locked.status, 200, JSON.stringify(locked.data));
  assert.equal(locked.data.client.locked, true, 'an admin can lock');

  // Locked refuses everyone, the admin included. Unlocking is a separate,
  // deliberate act, because the person most likely to delete the demonstration
  // campaign by accident is the person who made it.
  const userDelete = await api(`/api/clients/${clientId}`, { method: 'DELETE', cookie: userCookie });
  assert.equal(userDelete.status, 409, 'a locked client is not deletable by a reviewer');
  const adminDelete = await api(`/api/clients/${clientId}`, { method: 'DELETE', cookie: adminCookie });
  assert.equal(adminDelete.status, 409, 'nor by an admin while it is locked');
  console.log('  locked client refuses deletion, admin included');

  // Unlocked, it goes, and everything under it goes with it.
  const camp = await api(`/api/clients/${clientId}/campaigns`, {
    method: 'POST', cookie: userCookie,
    body: { brief: { productName: 'P', productDescription: 'd', targetAudience: 'a', objective: 'trial_signups', languages: ['en'] } },
  });
  assert.equal(camp.status, 200, JSON.stringify(camp.data));
  await api(`/api/clients/${clientId}`, { method: 'PATCH', body: { locked: false }, cookie: adminCookie });
  const gone = await api(`/api/clients/${clientId}`, { method: 'DELETE', cookie: userCookie });
  assert.equal(gone.status, 200, JSON.stringify(gone.data));
  const after = await api(`/api/clients/${clientId}`, { cookie: adminCookie });
  assert.equal(after.status, 404, 'the client is gone');
  const orphan = await api(`/api/clients/${clientId}/campaigns/${(camp.data.campaign || camp.data).campaignId}`, { cookie: adminCookie });
  assert.ok(orphan.status === 404 || orphan.status === 403, `its campaign went with it, got ${orphan.status}`);
  console.log('  unlocked client deletes, and takes its campaigns with it');

  // 7. A cookie that is present but not valid is refused by the route, which
  // is a different gate from the proxy's cookie-presence check above.
  const tampered = await api('/api/clients', { cookie: `${userCookie.slice(0, -3)}aaa` });
  assert.equal(tampered.status, 401, JSON.stringify(tampered.data));
  console.log('  tampered cookie refused:', tampered.status);

  // 8. Eleven failed logins from the same caller return 429. This runs last:
  // startNext gives this suite one IP for every request, so the throttle
  // bucket is already shared with every login above. Running it earlier would
  // lock out the sign-ins the rest of the suite depends on (see header).
  // The first ten are asserted individually so a regressed threshold (say
  // MAX_FAILURES accidentally set to 1) cannot pass by only checking the
  // eventual lock: each of these must genuinely be a rejected-credentials
  // 401, not a lock that arrived early.
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    const attempt = await login('definitely-wrong-password');
    statuses.push(attempt.status);
  }
  for (let i = 0; i < 10; i++) {
    assert.equal(statuses[i], 401, `attempt ${i + 1} should be a rejected-credentials 401, got ${statuses[i]}`);
  }
  assert.equal(statuses[10], 429, 'the eleventh failed login is throttled');
  console.log('  attempts 1-10: 401 each, attempt 11: 429');

  console.log('sign-in tests: ok');
  stop();
  process.exit(0);
})().catch((e) => { console.error('sign-in tests FAILED', e); stop(); process.exit(1); });
