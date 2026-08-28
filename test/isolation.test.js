/**
 * Isolation contract tests: real sign-in, not mock auth.
 *
 * Every other suite runs under MOCK_AUTH=1, which makes every session the
 * owner. That is fine for exercising the agent runtime, but it means none of
 * those suites can tell a genuine per-workspace boundary from a broken one:
 * every assertion in them would pass whether or not workspaces actually
 * isolate data. This suite is the one place that runs the real login route,
 * the real JWT session, and the real per-workspace store, so that the claim
 * "one demo account cannot see another's data" is actually tested rather than
 * assumed.
 *
 * ADMIN_USERNAME, ADMIN_PASSWORD and SESSION_SECRET are set in the child
 * environment and MOCK_AUTH is left unset, so server/auth.ts takes the real
 * cookie-verification path (currentSession -> verifySession -> workspaceActive)
 * instead of the mock shortcut that always returns the owner.
 *
 * The throttle in server/throttle.ts keys failed logins by caller IP, and
 * startNext gives every request from this suite the same address (there is no
 * x-forwarded-for under a plain `next start`). That means the eleven-failure
 * lockout test shares a bucket with every earlier login in this file. The
 * lockout assertion therefore runs LAST, after every other sign-in this suite
 * needs has already succeeded, so it cannot lock out its own setup.
 */
const assert = require('assert');
const { startNext } = require('./helpers/next-server');

const PORT = 3228;
const base = `http://localhost:${PORT}`;

const env = {
  ...process.env,
  MOCK_CLAUDE: '1',
  ADMIN_USERNAME: 'owner-admin',
  ADMIN_PASSWORD: 'owner-super-secret-password',
  SESSION_SECRET: 'a'.repeat(48),
  PORT: String(PORT),
};
delete env.MOCK_AUTH;
// This suite must run entirely in memory. A developer with a store configured
// would otherwise have alice/bob written to it, and the throttle record left
// behind locks the next run out for fifteen minutes.
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

const login = (username, password) => api('/api/auth/login', { method: 'POST', body: { username, password } });

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

  // 1. Owner logs in with real credentials and gets a session cookie.
  const ownerLogin = await login('owner-admin', 'owner-super-secret-password');
  assert.equal(ownerLogin.status, 200, JSON.stringify(ownerLogin.data));
  const ownerCookie = cookieFrom(ownerLogin.res);
  assert.ok(ownerCookie, 'login sets a cf_session cookie');
  console.log('  owner login: 200 + cf_session cookie');

  // 2. Owner creates a demo account for alice.
  const madeAlice = await api('/api/admin/accounts', { method: 'POST', body: { username: 'alice' }, cookie: ownerCookie });
  assert.equal(madeAlice.status, 201, JSON.stringify(madeAlice.data));
  assert.ok(madeAlice.data.password, 'a generated password is returned');
  const aliceId = madeAlice.data.account.id;
  console.log('  alice account created:', madeAlice.data.account.username);

  // 3. Alice signs in with that password and creates a client.
  const aliceLogin = await login('alice', madeAlice.data.password);
  assert.equal(aliceLogin.status, 200, JSON.stringify(aliceLogin.data));
  const aliceCookie = cookieFrom(aliceLogin.res);
  assert.ok(aliceCookie, 'alice login sets a cookie');
  const aliceClient = await api('/api/clients', { method: 'POST', body: { name: "Alice's Client" }, cookie: aliceCookie });
  assert.equal(aliceClient.status, 200, JSON.stringify(aliceClient.data));
  const aliceClientId = aliceClient.data.client.clientId;
  assert.ok(aliceClientId);
  console.log('  alice client created:', aliceClientId);

  // Owner creates bob the same way, bob signs in, bob creates a client.
  const madeBob = await api('/api/admin/accounts', { method: 'POST', body: { username: 'bob' }, cookie: ownerCookie });
  assert.equal(madeBob.status, 201, JSON.stringify(madeBob.data));
  const bobLogin = await login('bob', madeBob.data.password);
  assert.equal(bobLogin.status, 200, JSON.stringify(bobLogin.data));
  const bobCookie = cookieFrom(bobLogin.res);
  assert.ok(bobCookie, 'bob login sets a cookie');
  const bobClient = await api('/api/clients', { method: 'POST', body: { name: "Bob's Client" }, cookie: bobCookie });
  assert.equal(bobClient.status, 200, JSON.stringify(bobClient.data));
  const bobClientId = bobClient.data.client.clientId;
  assert.ok(bobClientId);
  console.log('  bob client created:', bobClientId);

  // 4. The isolation assertion the whole change exists to satisfy: bob's
  // client list contains bob's client, by id, and does not contain alice's.
  const bobList = await api('/api/clients', { cookie: bobCookie });
  assert.equal(bobList.status, 200, JSON.stringify(bobList.data));
  const bobIds = bobList.data.clients.map((c) => c.clientId);
  assert.ok(bobIds.includes(bobClientId), 'bob sees his own client: ' + bobIds.join(','));
  assert.ok(!bobIds.includes(aliceClientId), 'bob must not see alice\'s client: ' + bobIds.join(','));
  console.log('  workspace isolation: bob sees only', bobIds.join(','));

  // 4b. The by-id route is the classic insecure-direct-object-reference shape:
  // a list route can filter correctly while a by-id route trusts the URL.
  // Bob must not be able to fetch alice's client just by knowing its id.
  const direct = await api(`/api/clients/${aliceClientId}`, { cookie: bobCookie });
  assert.ok(direct.status === 404 || direct.status === 403, `bob cannot fetch alice's client by id, got ${direct.status}`);
  console.log('  by-id IDOR check: bob fetching alice\'s client id gets', direct.status);

  // 5. Admin routes refuse a non-owner account on every verb.
  const bobListAccounts = await api('/api/admin/accounts', { cookie: bobCookie });
  assert.equal(bobListAccounts.status, 403, JSON.stringify(bobListAccounts.data));
  const bobCreateAccount = await api('/api/admin/accounts', { method: 'POST', body: { username: 'carol' }, cookie: bobCookie });
  assert.equal(bobCreateAccount.status, 403, JSON.stringify(bobCreateAccount.data));
  const bobDeleteAccount = await api(`/api/admin/accounts/${aliceId}`, { method: 'DELETE', cookie: bobCookie });
  assert.equal(bobDeleteAccount.status, 403, JSON.stringify(bobDeleteAccount.data));
  console.log('  admin routes refuse a non-owner on GET, POST and DELETE');

  // 6. Revoke alice as admin; her still-unexpired cookie must be refused on
  // the very next request, not merely once the seven-day token expires.
  const revoked = await api(`/api/admin/accounts/${aliceId}`, { method: 'DELETE', cookie: ownerCookie });
  assert.equal(revoked.status, 200, JSON.stringify(revoked.data));
  const afterRevoke = await api('/api/clients', { cookie: aliceCookie });
  assert.equal(afterRevoke.status, 401, JSON.stringify(afterRevoke.data));
  console.log('  revoked account refused immediately:', afterRevoke.status);

  // 7. Eleven failed logins from the same caller return 429. This runs last:
  // startNext gives this suite one IP for every request, so the throttle
  // bucket is already shared with every login above. Running it earlier would
  // lock out the admin and demo-account logins the rest of the suite depends
  // on (see header comment).
  // The first ten are asserted individually so a regressed threshold (say
  // MAX_FAILURES accidentally set to 1) cannot pass by only checking the
  // eventual lock: each of these must genuinely be a rejected-credentials
  // 401, not a lock that arrived early.
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    const attempt = await login('owner-admin', 'definitely-wrong-password');
    statuses.push(attempt.status);
  }
  for (let i = 0; i < 10; i++) {
    assert.equal(statuses[i], 401, `attempt ${i + 1} should be a rejected-credentials 401, got ${statuses[i]}`);
  }
  assert.equal(statuses[10], 429, 'the eleventh failed login is throttled');
  console.log('  attempts 1-10: 401 each, attempt 11: 429');

  console.log('isolation tests: ok');
  stop();
  process.exit(0);
})().catch((e) => { console.error('isolation tests FAILED', e); stop(); process.exit(1); });
