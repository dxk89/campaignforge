/**
 * A stand-in for Nuelink's public API, shaped like the responses recorded
 * on 2026-09-15 (see the spec, section 3.1). It records every request so a
 * test can assert what was sent, and it can be told to fail once, either on
 * the next request, or on the next request whose path ends in a given
 * suffix via `when` (e.g. `when: 'post'` matches `/posts`, Task 6's case for
 * testing the push route's own retry/failure handling without tripping over
 * an earlier `/brands` call; any other `when` string is matched as a plain
 * path suffix, e.g. `when: 'channels'` to fail only `/brands/:id/channels`
 * while a concurrent `/collections` call succeeds).
 */
const http = require('http');

function startFakeNuelink(port) {
  const state = { requests: [], posts: [], media: [], failNext: null };
  let nextId = 1000;
  const brand = { id: 35946, title: 'IntelliNews Media OU', timezone: 'Europe/London' };
  const channels = [
    { id: 319509, name: 'IntelliNews', status: 'ACTIVE', type: 'LinkedIn' },
    { id: 319511, name: 'IntelliNews', status: 'ACTIVE', type: 'X' },
    { id: 319506, name: 'bne IntelliNews', status: 'ACTIVE', type: 'Instagram' },
    { id: 319504, name: 'IntelliNews', status: 'ACTIVE', type: 'Facebook' },
  ];
  const collections = [
    { id: 201, title: 'Forge LinkedIn', channels: [channels[0]] },
    { id: 202, title: 'Forge X', channels: [channels[1]] },
    { id: 203, title: 'Forge Instagram', channels: [channels[2]] },
    { id: 106059, title: 'Global Queue', channels },
  ];
  const ok = (res, data, extra = {}) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ status: 'success', data, ...extra })); };
  const fail = (res, status, message, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify({ status: 'error', message })); };

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const ct = req.headers['content-type'] || '';
      const entry = { method: req.method, path: req.url, body: null, files: [] };
      if (ct.includes('application/json') && raw.length) entry.body = JSON.parse(raw.toString());
      if (ct.includes('multipart/form-data')) {
        // Enough of multipart to know a file arrived and what it was called.
        const s = raw.toString('latin1');
        const m = /name="media"; filename="([^"]+)"\r\nContent-Type: ([^\r]+)/.exec(s);
        if (m) entry.files.push({ filename: m[1], mime: m[2], bytes: raw.length });
      }
      state.requests.push(entry);

      if (req.headers.authorization !== 'Bearer test-key') return fail(res, 401, 'Unauthenticated');

      const p = req.url.replace(/\?.*$/, '');
      const isPostsPath = /\/posts$/.test(p);
      const whenMatches = (when) => (when === 'post' ? isPostsPath : p.endsWith(`/${when}`));
      if (state.failNext && (!state.failNext.when || whenMatches(state.failNext.when))) {
        const f = state.failNext;
        state.failNext = null;
        return fail(res, f.status, f.message, f.headers);
      }

      if (req.method === 'GET' && p === '/api/public/v1/me') return ok(res, { id: 'u1', name: 'Test', joinedAt: '2026-09-14T11:06:59.000000Z', timezone: 'Europe/London' });
      if (req.method === 'GET' && p === '/api/public/v1/brands') return ok(res, [brand]);
      if (req.method === 'GET' && p === `/api/public/v1/brands/${brand.id}/collections`) return ok(res, collections);
      if (req.method === 'GET' && p === `/api/public/v1/brands/${brand.id}/channels`) return ok(res, channels);
      if (req.method === 'POST' && p === `/api/public/v1/brands/${brand.id}/media`) {
        if (!entry.files.length) return fail(res, 422, 'The media field is required.');
        const media = { id: `m${nextId++}`, url: `https://cdn.example/${entry.files[0].filename}`, type: 'image' };
        state.media.push(media);
        return ok(res, media);
      }
      const postMatch = /^\/api\/public\/v1\/brands\/(\d+)\/collections\/(\d+)\/posts$/.exec(p);
      if (req.method === 'POST' && postMatch) {
        const b = entry.body || {};
        if (!b.caption) return fail(res, 422, 'The caption field is required.');
        if (b.publishMode === 'SCHEDULE' && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(b.scheduledAt || '')) return fail(res, 422, 'scheduledAt must be Y-m-d H:i:s');
        const post = { id: `p${nextId++}`, collectionId: Number(postMatch[2]), ...b };
        state.posts.push(post);
        return ok(res, { id: post.id });
      }
      fail(res, 404, 'Not found');
    });
  });
  server.listen(port);
  return { ...state, requests: state.requests, posts: state.posts, media: state.media, failOnce: (f) => { state.failNext = f; }, close: () => server.close() };
}

module.exports = { startFakeNuelink };
