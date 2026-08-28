/**
 * Prompt versioning.
 *
 * A role lives in code as the default and may be overridden by a stored
 * version, so a wording change is a version with a change note rather than a
 * deploy. Every agent version records which prompt version produced it, so a
 * result can always be traced to the words that caused it.
 *
 * Without a store configured, or in mock mode, the code defaults are used and
 * nothing here does anything. That keeps the tests and mock runs deterministic.
 */
const { db } = require('../memory/firestore');

const CACHE_MS = 60_000;
let cache = { at: 0, byAgent: {} };

const uid = () => process.env.ALLOWED_UID || 'owner';

/** All current prompt overrides, cached briefly so a chain does not refetch per agent. */
async function current() {
  if (Date.now() - cache.at < CACHE_MS) return cache.byAgent;
  const f = db();
  if (!f) { cache = { at: Date.now(), byAgent: {} }; return cache.byAgent; }
  try {
    const snap = await f.collection(`users/${uid()}/prompts`).get();
    const byAgent = {};
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.current && data.role) byAgent[doc.id] = { role: data.role, versionId: data.current };
    }
    cache = { at: Date.now(), byAgent };
  } catch {
    cache = { at: Date.now(), byAgent: {} };
  }
  return cache.byAgent;
}

/** The role for an agent: the stored override if there is one, else the code default. */
async function roleFor(agent, fallback) {
  const overrides = await current();
  const found = overrides[agent];
  return found ? { role: found.role, promptVersion: found.versionId } : { role: fallback, promptVersion: null };
}

function invalidate() { cache = { at: 0, byAgent: {} }; }

module.exports = { roleFor, current, invalidate };
