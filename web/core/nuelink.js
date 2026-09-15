/**
 * Nuelink's public API, as a small client.
 *
 * Nuelink is the scheduler the owner uses. This module is the only thing
 * that talks to it. Plain fetch, no SDK: six calls, one response shape,
 * nothing to keep up to date.
 *
 * Every function returns a value: { data } on success, { error, status } on
 * failure. Nothing here throws into a route (invariant 13), because a
 * scheduler being down must not lose a campaign, only delay its posting.
 *
 * Shapes were recorded against the live API on 2026-09-15; the fake server
 * in test/helpers/fake-nuelink.js mirrors them.
 */

const DEFAULT_BASE = 'https://nuelink.com/api/public/v1';

const key = () => process.env.NUELINK_API_KEY || '';
const base = () => (process.env.NUELINK_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');

const available = () => Boolean(key());

/** The planner's channel keys, as Nuelink names the channel type. */
const CHANNEL_TYPES = { linkedin: 'LinkedIn', x: 'X', instagram: 'Instagram' };

const pad = (n) => String(n).padStart(2, '0');

/** Y-m-d H:i:s, from a local Date. Nuelink reads it in the brand's timezone. */
function formatScheduledAt(when) {
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`;
}

async function call(method, path, { json, form } = {}, attempt = 0) {
  if (!key()) return { error: 'NUELINK_API_KEY is not set', status: 503 };
  const headers = { authorization: `Bearer ${key()}`, accept: 'application/json' };
  let body;
  if (json) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  let res;
  try {
    res = await fetch(base() + path, { method, headers, body });
  } catch (err) {
    return { error: `Could not reach Nuelink: ${err.message}`, status: 0 };
  }
  if (res.status === 429 && attempt === 0) {
    const wait = Math.min(30, Number(res.headers.get('retry-after')) || 1);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return call(method, path, { json, form }, 1);
  }
  let parsed = null;
  try { parsed = await res.json(); } catch { /* not JSON; reported below */ }
  if (!res.ok) {
    const message = parsed?.message || parsed?.error || (parsed?.errors ? JSON.stringify(parsed.errors) : `HTTP ${res.status}`);
    return { error: message, status: res.status };
  }
  return { data: parsed?.data ?? parsed, pagination: parsed?.pagination };
}

const me = () => call('GET', '/me');
const brands = () => call('GET', '/brands');
const collections = (brandId) => call('GET', `/brands/${brandId}/collections`);
const channels = (brandId) => call('GET', `/brands/${brandId}/channels`);

function uploadMedia(brandId, { buffer, mime, filename }) {
  const form = new FormData();
  form.append('media', new Blob([buffer], { type: mime }), filename);
  return call('POST', `/brands/${brandId}/media`, { form });
}

const createPost = (brandId, collectionId, body) => call('POST', `/brands/${brandId}/collections/${collectionId}/posts`, { json: body });

module.exports = { available, me, brands, collections, channels, uploadMedia, createPost, formatScheduledAt, CHANNEL_TYPES };
