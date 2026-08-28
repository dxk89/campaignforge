/**
 * Firestore accessor for client memory.
 *
 * lib/ (now core/) cannot import from web/server, so this initialises
 * firebase-admin from the same environment variable. When it is absent every
 * call returns null and the memory functions fall back to empty, which is how
 * mock mode and the test suites run.
 */
let cached;

function db() {
  if (cached !== undefined) return cached;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) { cached = null; return cached; }
  try {
    const { cert, getApps, initializeApp } = require('firebase-admin/app');
    const { getFirestore } = require('firebase-admin/firestore');
    const app = getApps().length
      ? getApps()[0]
      : initializeApp({ credential: cert(JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))) });
    cached = getFirestore(app);
  } catch (err) {
    console.warn('[memory] Firestore unavailable:', err.message);
    cached = null;
  }
  return cached;
}

/**
 * Every path here is scoped to a workspace, passed in explicitly by the
 * caller (ultimately session.workspaceId). There is no environment-variable
 * default any more: web/server/db.ts's root() went through the same change
 * for the same reason, and this module is the one place in web/core/ that
 * used to read ALLOWED_UID on its own, which would have quietly kept every
 * workspace's agent memory pointed at "owner".
 */
const clientPath = (ws, clientId) => {
  if (!ws) throw new Error('A workspace id is required for client memory paths. This is a bug: the caller did not pass the workspace.');
  return `users/${ws}/clients/${clientId}`;
};

/** Read a subcollection, ordered, with a cap. Returns [] on any failure. */
async function read(ws, clientId, collection, { order, dir = 'desc', limit = 20, where } = {}) {
  const f = db();
  if (!f || !clientId) return [];
  // Only reachable once a store is configured and a client is named, i.e.
  // exactly when a real users/<ws>/... path is about to be built.
  if (!ws) throw new Error('A workspace id is required for client memory reads. This is a bug: the caller did not pass the workspace.');
  try {
    let q = f.collection(`${clientPath(ws, clientId)}/${collection}`);
    if (where) for (const [field, op, value] of where) q = q.where(field, op, value);
    if (order) q = q.orderBy(order, dir);
    const snap = await q.limit(limit).get();
    return snap.docs.map((d) => d.data());
  } catch (err) {
    // A missing collection or a missing index is normal before Phase 2/3 fill them.
    return [];
  }
}

/**
 * The in-memory fallback the web app uses when no store is configured. The
 * routes write to globalThis; memory reads from it, so learnings and exemplars
 * work in mock mode exactly as they will with Firestore. Keys match what
 * web/server/{exemplars,resultsStore,db}.ts write under the same globals:
 * "ws/clientId" (or "ws/clientId/claims" for the claims sub-map), so two
 * workspaces' mock-mode memory cannot be read into each other's packets.
 */
function memory(kind, ws, clientId) {
  if (!ws) throw new Error('A workspace id is required for in-memory client data. This is a bug: the caller did not pass the workspace.');
  const g = globalThis;
  const key = `${ws}/${clientId}`;
  if (kind === 'learnings') return (g.__cfLearnings?.get(key)) || [];
  if (kind === 'exemplars') return (g.__cfExemplars?.get(key)) || [];
  if (kind === 'corrections') return (g.__cfCorrections?.get(key)) || [];
  if (kind === 'claims') {
    const all = g.__cfMem?.sub?.get(`${key}/claims`);
    return all ? [...all.values()] : [];
  }
  return [];
}

module.exports = { db, read, clientPath, memory };
