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

    console.log('nuelink route tests: ok');
  } finally {
    stop();
  }
}

clientTests().then(routeTests).catch((e) => { console.error('nuelink tests FAILED', e); process.exit(1); });
