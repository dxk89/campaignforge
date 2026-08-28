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
// Cached per workspace: a single shared cache would leak workspace A's prompt
// overrides into workspace B's runs (and vice versa on invalidation). Keyed
// by ws, the same way web/server/db.ts's root(ws) scopes everything else.
const cache = new Map(); // ws -> { at, byAgent }

/** All current prompt overrides for one workspace, cached briefly so a chain does not refetch per agent. */
async function current(ws) {
  const entry = cache.get(ws);
  if (entry && Date.now() - entry.at < CACHE_MS) return entry.byAgent;
  const f = db();
  if (!f) { const empty = { at: Date.now(), byAgent: {} }; cache.set(ws, empty); return empty.byAgent; }
  // Only reachable once a store is configured, i.e. exactly when a real
  // users/<ws>/prompts path is about to be built.
  if (!ws) throw new Error('A workspace id is required for prompt overrides. This is a bug: the caller did not pass the workspace.');
  try {
    const snap = await f.collection(`users/${ws}/prompts`).get();
    const byAgent = {};
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.current && data.role) byAgent[doc.id] = { role: data.role, versionId: data.current };
    }
    cache.set(ws, { at: Date.now(), byAgent });
    return byAgent;
  } catch {
    const empty = { at: Date.now(), byAgent: {} };
    cache.set(ws, empty);
    return empty.byAgent;
  }
}

/** The role for an agent: the stored override if there is one, else the code default. */
async function roleFor(agent, fallback, ws) {
  const overrides = await current(ws);
  const found = overrides[agent];
  return found ? { role: found.role, promptVersion: found.versionId } : { role: fallback, promptVersion: null };
}

function invalidate() { cache.clear(); }

module.exports = { roleFor, current, invalidate };
