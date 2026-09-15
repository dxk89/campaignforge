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
}

clientTests().catch((e) => { console.error('nuelink tests FAILED', e); process.exit(1); });
