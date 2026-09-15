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

async function clientTests() {
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

    // One retry on 429, honouring Retry-After. A Retry-After of 0 must not
    // fall back to the 1-second default (Number('0') || 1 would do that).
    fake.failOnce({ status: 429, message: 'Too many', headers: { 'retry-after': '0' } });
    const retryStart = Date.now();
    const retried = await nuelink.brands();
    const retryMs = Date.now() - retryStart;
    assert.equal(retried.data[0].id, 35946, 'a 429 is retried once');
    assert.ok(retryMs < 500, `retry-after: 0 should not wait a full second (took ${retryMs}ms)`);

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
}

// ---- the routes, against a running app in mock mode ------------------------------
const { startNext } = require('./helpers/next-server');
const path = require('path');
const { spawn } = require('child_process');

async function routeTests() {
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

    // A partial failure inside the ?brand= branch must surface as `error`,
    // not be swallowed, while whichever call did not fail still comes back.
    // `me` and `brands` are requested first (unconditionally, via their own
    // Promise.all) and succeed here, so `when: 'channels'` targets only the
    // `/channels` request that follows, leaving `/collections` to succeed.
    fake.failOnce({ status: 500, message: 'Channels down', when: 'channels' });
    const partial = await api('/api/nuelink?brand=35946');
    assert.equal(partial.status, 200);
    assert.match(partial.data.error, /Channels down/, 'the failing call is surfaced');
    assert.equal(partial.data.collections.length, 4, 'the call that did not fail still returned its data');
    console.log('  nuelink partial failure surfaced');

    // A client with a calendar, on the mock model.
    const created = await post('/api/clients', { url: 'http://localhost:8096' });
    const clientId = created.data.clientId;
    const camp = await post(`/api/clients/${clientId}/campaigns`, { brief: {
      productName: 'Ledgerline', productDescription: 'Reconciliation', targetAudience: 'Finance leads',
      objective: 'trial_signups', tone: 'direct', languages: ['en'], webResearch: false, landingUrl: 'https://example.com/ledgerline' } });
    const cid = camp.data.campaignId;
    // 'brief-reader' is not among these: it is only reachable through the
    // /brief/parse route (parsing an uploaded document), and is not in
    // server/inputs.ts's buildInputs switch, so run/brief-reader 404s with
    // "Unknown agent". The campaign here is created with a full brief
    // already, so no parse pass is needed to reach the social calendar.
    for (const a of ['brand-analyst', 'strategist', 'copywriter', 'social-planner']) {
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
    fake.failOnce({ status: 422, message: 'Caption too long for Instagram', when: 'post' });
    const partial2 = await post(pushPath, { start: '2026-09-07', publishMode: 'DRAFT', channels: ['instagram'] });
    const ig = partial2.data.push.results.filter((r) => r.channel === 'instagram');
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

    console.log('nuelink route tests: ok');
  } finally {
    stop();
  }
}

clientTests().then(routeTests).catch((e) => { console.error('nuelink tests FAILED', e); process.exit(1); });
