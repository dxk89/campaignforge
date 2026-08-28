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

const uid = () => process.env.ALLOWED_UID || 'owner';
const clientPath = (clientId) => `users/${uid()}/clients/${clientId}`;

/** Read a subcollection, ordered, with a cap. Returns [] on any failure. */
async function read(clientId, collection, { order, dir = 'desc', limit = 20, where } = {}) {
  const f = db();
  if (!f || !clientId) return [];
  try {
    let q = f.collection(`${clientPath(clientId)}/${collection}`);
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
 * work in mock mode exactly as they will with Firestore.
 */
function memory(kind, clientId) {
  const g = globalThis;
  if (kind === 'learnings') return (g.__cfLearnings?.get(clientId)) || [];
  if (kind === 'exemplars') return (g.__cfExemplars?.get(clientId)) || [];
  if (kind === 'corrections') return (g.__cfCorrections?.get(clientId)) || [];
  if (kind === 'claims') {
    const all = g.__cfMem?.sub?.get(`${clientId}/claims`);
    return all ? [...all.values()] : [];
  }
  return [];
}

module.exports = { db, read, clientPath, memory };
